import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import {
  CLASSIFICATION_LOCK,
  PODIUM_BOOT_MVP_LOCK,
  isModuleLocked,
  formatLockDate,
} from '@/lib/constants'
import { EspecialesView, type GroupWithTeams, type PlayerRow, type TeamRow } from './view'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('championships').select('name').eq('id', id).single()
  return { title: data?.name ? `${data.name} — Especiales` : 'Especiales' }
}

export default async function EspecialesPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/campeonato/${id}/especiales`)}`)

  // Championship + modules
  const { data: championship, error: champErr } = await supabase
    .from('championships')
    .select('id, name, invite_code, mod_group_standings, mod_podium, mod_golden_boot, mod_mvp')
    .eq('id', id)
    .single()
  if (champErr || !championship) notFound()

  // Membership check
  const { data: membership } = await supabase
    .from('championship_users')
    .select('display_name')
    .eq('championship_id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) redirect(`/unirse?code=${championship.invite_code}`)

  // Fetch groups with their teams (for group standings block)
  const { data: rawGroups } = await supabase
    .from('groups')
    .select('id, name, teams(id, name, flag_url)')
    .order('name')

  const groups: GroupWithTeams[] = (rawGroups ?? []).map((g) => ({
    id: g.id as number,
    name: g.name as string,
    teams: ((g.teams as unknown[]) ?? []).map((t: unknown) => {
      const team = t as { id: number; name: string; flag_url: string | null }
      return { id: team.id, name: team.name, flagUrl: team.flag_url }
    }),
  }))

  // All teams (for podium selector)
  const { data: rawTeams } = await supabase
    .from('teams')
    .select('id, name, flag_url')
    .order('name')
  const teams: TeamRow[] = (rawTeams ?? []).map((t) => ({
    id: t.id as number,
    name: t.name as string,
    flagUrl: t.flag_url as string | null,
  }))

  // Players with team name (for bota/mvp)
  const { data: rawPlayers } = await supabase
    .from('players')
    .select('id, name, club, position, team_id, teams(name)')
    .order('team_id')
    .order('name')
  const players: PlayerRow[] = (rawPlayers ?? []).map((p) => {
    const teamRel = p.teams as unknown as { name: string } | null
    return {
      id: p.id as number,
      name: p.name as string,
      club: p.club as string | null,
      position: p.position as 'GK' | 'DEF' | 'MID' | 'FWD',
      teamId: p.team_id as number,
      teamName: teamRel?.name ?? '',
    }
  })

  // Existing predictions (parallel)
  const [{ data: groupPreds }, { data: specialPred }] = await Promise.all([
    supabase
      .from('group_predictions')
      .select('group_id, first_place, second_place, third_place, fourth_place')
      .eq('championship_id', id)
      .eq('user_id', user.id),
    supabase
      .from('special_predictions')
      .select('gold_team_id, silver_team_id, bronze_team_id, golden_boot_player_id, mvp_player_id')
      .eq('championship_id', id)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const isClassificationLocked = isModuleLocked(CLASSIFICATION_LOCK)
  const isPodiumLocked = isModuleLocked(PODIUM_BOOT_MVP_LOCK)

  return (
    <main style={{
      minHeight: '100dvh', background: 'var(--bg)', padding: '2rem 1.25rem 5rem',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '700px', height: '320px', pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(59,154,225,0.18) 0%, transparent 70%)',
      }} aria-hidden />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: '880px', margin: '0 auto' }}>
    <EspecialesView
      championshipId={id}
      userId={user.id}
      championshipName={championship.name}
      modules={{
        groupStandings: championship.mod_group_standings,
        podium: championship.mod_podium,
        goldenBoot: championship.mod_golden_boot,
        mvp: championship.mod_mvp,
      }}
      isClassificationLocked={isClassificationLocked}
      isPodiumLocked={isPodiumLocked}
      classificationLockLabel={formatLockDate(CLASSIFICATION_LOCK)}
      podiumLockLabel={formatLockDate(PODIUM_BOOT_MVP_LOCK)}
      groups={groups}
      teams={teams}
      players={players}
      initialGroupPredictions={(groupPreds ?? []).map((gp) => ({
        groupId: gp.group_id as number,
        firstPlace: gp.first_place as number | null,
        secondPlace: gp.second_place as number | null,
        thirdPlace: gp.third_place as number | null,
        fourthPlace: gp.fourth_place as number | null,
      }))}
      initialSpecialPrediction={
        specialPred
          ? {
              goldTeamId: specialPred.gold_team_id as number | null,
              silverTeamId: specialPred.silver_team_id as number | null,
              bronzeTeamId: specialPred.bronze_team_id as number | null,
              goldenBootPlayerId: specialPred.golden_boot_player_id as number | null,
              mvpPlayerId: specialPred.mvp_player_id as number | null,
            }
          : null
      }
    />
      </div>
    </main>
  )
}
