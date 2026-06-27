import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import {
  CLASSIFICATION_LOCK,
  PODIUM_BOOT_MVP_LOCK,
  isModuleLocked,
  isMatchLocked,
  formatLockDate,
} from '@/lib/constants'
import type { MatchForCal, InitPred } from './calendario/calendario-view'
import type { GroupStanding } from './tablas/tablas-view'
import type { Participant, ResultMatch, PredsByMatch, GroupPredEntry } from './resultados/resultados-view'
import { ChampionshipApp } from './championship-app'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('championships').select('name').eq('id', id).single()
  return { title: data?.name ? `${data.name} — Quiniela Mundial 2026` : 'Campeonato' }
}

export default async function CampeonatoPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/campeonato/${id}`)}`)
  }

  // Championship + módulos
  const { data: championship, error: champError } = await supabase
    .from('championships')
    .select('id, name, invite_code, display_timezone, created_by, mod_group_standings, mod_podium, mod_golden_boot, mod_mvp, mod_knockout_matches')
    .eq('id', id)
    .single()

  if (champError || !championship) notFound()

  // Membresía
  const { data: membership } = await supabase
    .from('championship_users')
    .select('display_name, group_points, knockout_points')
    .eq('championship_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    redirect(`/unirse?code=${championship.invite_code}`)
  }

  // Admin client para datos globales del torneo que RLS no devuelve al usuario normal
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // ── Fetch de datos en paralelo ───────────────────────────────────────────

  const [
    { data: rawGroups },
    { data: rawTeams },
    { data: rawPlayers },
    { data: groupPreds },
    { data: specialPred },
    { data: rawMatches },
    { data: rawMatchPreds },
    { data: rawStandings },
    { data: rawParticipants },
    { data: rawFeaturedMatches },
    { data: rawOtherMemberships },
    { data: rawAllGroupPreds },
  ] = await Promise.all([
    // Datos globales — leídos con service role (RLS bloquea matches al usuario regular)
    admin.from('groups').select('id, name').order('name'),
    admin.from('teams').select('id, name, group_id').order('name'),
    // Dos batches para superar el límite de 1000 filas del servidor Supabase
    Promise.all([
      admin.from('players').select('id, name, club, position, team_id').order('team_id').order('name').range(0, 999),
      admin.from('players').select('id, name, club, position, team_id').order('team_id').order('name').range(1000, 1999),
    ]).then(([r1, r2]) => ({ data: [...(r1.data ?? []), ...(r2.data ?? [])], error: r1.error ?? r2.error })),

    // Datos del usuario — leídos con sesión del usuario (RLS garantiza privacidad)
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

    // Partidos — service role porque RLS de matches no permite leer al usuario
    // Sin filtro de fase: incluye grupo + eliminatoria (se filtra abajo por módulo)
    admin
      .from('matches')
      .select('id, date, time, ground, group_id, team1_id, team2_id, team1_placeholder, team2_placeholder, phase, round, kickoff_utc')
      .order('kickoff_utc', { nullsFirst: false })
      .order('id'),

    // Pronósticos de marcadores — sesión del usuario
    supabase
      .from('predictions')
      .select('match_id, score1, score2')
      .eq('championship_id', id)
      .eq('user_id', user.id),

    // Standings — service role (datos globales del torneo)
    admin.from('standings').select('team_id, group_id, played, won, drawn, lost, gf, ga, gd, points'),

    // Participantes del campeonato (el orden lo maneja el cliente por puntos + empates)
    admin
      .from('championship_users')
      .select('user_id, display_name, group_points, knockout_points')
      .eq('championship_id', id),

    // Todos los partidos (grupo + eliminatoria) para el tab Resultados
    admin
      .from('matches')
      .select('id, date, ground, group_id, round, team1_id, team2_id, team1_placeholder, team2_placeholder, score1, score2, status, phase, kickoff_utc')
      .order('kickoff_utc', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true }),

    // Otros campeonatos del usuario (para "Copiar pronósticos")
    supabase
      .from('championship_users')
      .select('championship_id, championships(id, name)')
      .eq('user_id', user.id)
      .neq('championship_id', id),

    // Predicciones de clasificación de grupo de TODOS los participantes (para tab Resultados)
    admin
      .from('group_predictions')
      .select('user_id, group_id, first_place, second_place, third_place, fourth_place')
      .eq('championship_id', id),
  ])

  // ── Join manual ───────────────────────────────────────────────────────────

  // Mapa teamId → teamName
  const teamNameMap = new Map<number, string>(
    (rawTeams ?? []).map((t) => [t.id as number, t.name as string]),
  )

  // Grupos con sus equipos
  const groups = (rawGroups ?? []).map((g) => ({
    id: g.id as number,
    name: g.name as string,
    teams: (rawTeams ?? [])
      .filter((t) => (t.group_id as number) === (g.id as number))
      .map((t) => ({ id: t.id as number, name: t.name as string, flagUrl: null })),
  }))

  // Todos los equipos (para el selector de podio)
  const teams = (rawTeams ?? []).map((t) => ({
    id: t.id as number,
    name: t.name as string,
    flagUrl: null,
  }))

  // Jugadores con team_name resuelto
  const players = (rawPlayers ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    club: p.club as string | null,
    position: p.position as 'GK' | 'DEF' | 'MID' | 'FWD',
    teamId: p.team_id as number,
    teamName: teamNameMap.get(p.team_id as number) ?? '',
  }))

  // Pronósticos de grupos
  const initialGroupPredictions = (groupPreds ?? []).map((gp) => ({
    groupId: gp.group_id as number,
    firstPlace: gp.first_place as number | null,
    secondPlace: gp.second_place as number | null,
    thirdPlace: gp.third_place as number | null,
    fourthPlace: gp.fourth_place as number | null,
  }))

  // Pronósticos especiales
  const initialSpecialPrediction = specialPred
    ? {
        goldTeamId: specialPred.gold_team_id as number | null,
        silverTeamId: specialPred.silver_team_id as number | null,
        bronzeTeamId: specialPred.bronze_team_id as number | null,
        goldenBootPlayerId: specialPred.golden_boot_player_id as number | null,
        mvpPlayerId: specialPred.mvp_player_id as number | null,
      }
    : null

  const isClassificationLocked = isModuleLocked(CLASSIFICATION_LOCK)
  const isPodiumLocked = isModuleLocked(PODIUM_BOOT_MVP_LOCK)

  // ── Datos del Calendario ──────────────────────────────────────────────────

  // Mapa groupId → groupName
  const groupNameMap = new Map<number, string>(
    (rawGroups ?? []).map((g) => [g.id as number, g.name as string]),
  )

  // Predicciones propias del usuario por match_id (para calcular isLocked knockout)
  const userPredMap = new Map<number, { s1: number | null; s2: number | null }>(
    (rawMatchPreds ?? []).map(p => [
      p.match_id as number,
      { s1: p.score1 as number | null, s2: p.score2 as number | null },
    ]),
  )

  // Primer kickoff de knockout por fecha ET (ventana rezagados = 00:00 → primer kickoff)
  const firstKnockoutKickoffByDate = new Map<string, number>()
  for (const m of rawMatches ?? []) {
    if ((m.phase as string) !== 'knockout' || !m.kickoff_utc) continue
    const dateET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
      .format(new Date(m.kickoff_utc as string))
    const ms = new Date(m.kickoff_utc as string).getTime()
    const prev = firstKnockoutKickoffByDate.get(dateET)
    if (prev === undefined || ms < prev) firstKnockoutKickoffByDate.set(dateET, ms)
  }

  const groupMatches: MatchForCal[] = (rawMatches ?? [])
    .filter(m => m.phase === 'group' || championship.mod_knockout_matches)
    .map((m) => {
      const t1 = m.team1_id ? teamNameMap.get(m.team1_id as number) : null
      const t2 = m.team2_id ? teamNameMap.get(m.team2_id as number) : null
      const gName = m.group_id ? (groupNameMap.get(m.group_id as number) ?? null) : null
      return {
        id:            m.id as number,
        date:          m.date as string,
        time:          (m.time as string | null) ?? '',
        ground:        m.ground as string | null,
        phase:         m.phase as string,
        groupName:     gName,
        round:         (m.round as string | null) ?? null,
        team1Name:     t1 ?? (m.team1_placeholder as string | null) ?? '?',
        team2Name:     t2 ?? (m.team2_placeholder as string | null) ?? '?',
        teamsResolved: !!(m.team1_id && m.team2_id),
        isLocked:      (() => {
          if ((m.phase as string) !== 'knockout') return isMatchLocked(m.kickoff_utc as string | null)
          // Antes de 00:00 ET: libre para todos
          if (!isMatchLocked(m.kickoff_utc as string | null)) return false
          // Después de 00:00 ET: usuarios CON pronóstico quedan bloqueados
          const myPred = userPredMap.get(m.id as number)
          const hasPred = myPred !== undefined && myPred.s1 !== null && myPred.s2 !== null
          if (hasPred) return true
          // Sin pronóstico: bloqueado al primer kickoff del día
          const dateET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
            .format(new Date((m.kickoff_utc as string) ?? ''))
          return Date.now() >= (firstKnockoutKickoffByDate.get(dateET) ?? Infinity)
        })(),
      }
    })

  const initialMatchPredictions: InitPred[] = (rawMatchPreds ?? []).map((p) => ({
    matchId: p.match_id as number,
    score1:  p.score1 as number | null,
    score2:  p.score2 as number | null,
  }))

  // ── Standings por grupo ───────────────────────────────────────────────────

  // Mapa teamId → standings row
  const standMap = new Map<number, {played:number;won:number;drawn:number;lost:number;gf:number;ga:number;gd:number;points:number}>(
    (rawStandings ?? []).map((s) => [s.team_id as number, {
      played: s.played as number, won: s.won as number, drawn: s.drawn as number,
      lost: s.lost as number, gf: s.gf as number, ga: s.ga as number,
      gd: s.gd as number, points: s.points as number,
    }]),
  )

  // ── Datos de Resultados ───────────────────────────────────────────────────

  // Partidos con resultado — grupo siempre, eliminatoria solo si el módulo está activo
  const resultMatches: ResultMatch[] = (rawFeaturedMatches ?? [])
    .filter(m => (m.phase as string) === 'group' || championship.mod_knockout_matches)
    .map((m) => {
    const t1 = m.team1_id ? teamNameMap.get(m.team1_id as number) : null
    const t2 = m.team2_id ? teamNameMap.get(m.team2_id as number) : null
    return {
      id:        m.id as number,
      team1Name: t1 ?? (m.team1_placeholder as string | null) ?? '?',
      team2Name: t2 ?? (m.team2_placeholder as string | null) ?? '?',
      date:      m.date as string,
      score1:    m.score1 as number | null,
      score2:    m.score2 as number | null,
      ground:    m.ground as string | null,
      groupName: m.group_id ? (groupNameMap.get(m.group_id as number) ?? null) : null,
      round:     (m.round as string | null) ?? null,
      status:    m.status as string,
      // Predicciones visibles si: partido finalizado O cerrado por fecha.
      // Anti-copia: si el admin entró el resultado, el partido ya no es "abierto".
      predVisible: (m.status as string) === 'finished' || (m.status as string) === 'live' || isMatchLocked(m.kickoff_utc as string | null),
    }
  })

  // Predicciones de TODOS los participantes para los partidos ya cerrados
  // (anti-copia: solo se muestran pronósticos de partidos bloqueados)
  // Todos los partidos con resultado tienen predicciones visibles
  const lockedMatchIds = resultMatches.filter(m => m.predVisible).map(m => m.id)
  let predsByMatch: PredsByMatch = {}

  if (lockedMatchIds.length > 0) {
    const { data: allPreds } = await admin
      .from('predictions')
      .select('match_id, user_id, score1, score2')
      .eq('championship_id', id)
      .in('match_id', lockedMatchIds)

    for (const p of allPreds ?? []) {
      const mid = p.match_id as number
      const uid = p.user_id as string
      if (!predsByMatch[mid]) predsByMatch[mid] = {}
      predsByMatch[mid][uid] = {
        s1: p.score1 as number | null,
        s2: p.score2 as number | null,
      }
    }

    // Anti-copia: ocultar pronósticos ajenos salvo que el usuario tenga predicción propia.
    // Excepción knockout: tras el primer kickoff del día son visibles aunque no haya pronosticado.
    const featuredMatchMeta = new Map<number, { phase: string; kickoffUtc: string | null }>(
      (rawFeaturedMatches ?? []).map(m => [m.id as number, {
        phase: m.phase as string,
        kickoffUtc: m.kickoff_utc as string | null,
      }]),
    )
    predsByMatch = Object.fromEntries(
      Object.entries(predsByMatch).filter(([mid]) => {
        const mine = predsByMatch[Number(mid)]?.[user.id]
        const hasMine = mine !== undefined && mine.s1 !== null && mine.s2 !== null
        if (hasMine) return true
        const meta = featuredMatchMeta.get(Number(mid))
        if (meta?.phase === 'knockout' && meta.kickoffUtc) {
          const dateET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
            .format(new Date(meta.kickoffUtc))
          return Date.now() >= (firstKnockoutKickoffByDate.get(dateET) ?? Infinity)
        }
        return false
      }),
    )
  }

  // ── Puntos de la jornada (partidos jugados HOY en America/New_York) ─────────
  // Permite mostrar "+N" en la tabla de resultados sin refrescar.
  const todayET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())

  const { data: todayMatchRows } = await admin
    .from('matches')
    .select('id, phase, group_id')
    .eq('date', todayET)
    .not('score1', 'is', null)   // solo los que ya tienen resultado

  const todayMatchIds = (todayMatchRows ?? [])
    .filter(m => (m.phase as string) === 'group' || championship.mod_knockout_matches)
    .map(m => m.id as number)
  const todayPtsMap: Record<string, number> = {}

  if (todayMatchIds.length > 0) {
    const { data: todayPreds } = await admin
      .from('predictions')
      .select('user_id, points_earned')
      .eq('championship_id', id)
      .in('match_id', todayMatchIds)
      .not('points_earned', 'is', null)

    for (const p of todayPreds ?? []) {
      const uid = p.user_id as string
      todayPtsMap[uid] = (todayPtsMap[uid] ?? 0) + ((p.points_earned as number) ?? 0)
    }
  }

  // Puntos de clasificación de grupos cerrados HOY (solo si mod_group_standings activo)
  if (championship.mod_group_standings) {
    const todayGroupIds = [...new Set(
      (todayMatchRows ?? [])
        .filter(m => (m.phase as string) === 'group' && m.group_id)
        .map(m => m.group_id as number),
    )]

    for (const groupId of todayGroupIds) {
      // Verificar que el grupo esté 100% cerrado usando rawFeaturedMatches (ya disponible)
      const groupMatchStatuses = (rawFeaturedMatches ?? []).filter(m => (m.group_id as number) === groupId)
      const allFinished = groupMatchStatuses.length > 0 && groupMatchStatuses.every(m => (m.status as string) === 'finished')
      if (!allFinished) continue

      const { data: closedGP } = await admin
        .from('group_predictions')
        .select('user_id, points_earned')
        .eq('championship_id', id)
        .eq('group_id', groupId)
        .not('points_earned', 'is', null)

      for (const gp of closedGP ?? []) {
        const uid = gp.user_id as string
        todayPtsMap[uid] = (todayPtsMap[uid] ?? 0) + ((gp.points_earned as number) ?? 0)
      }
    }
  }

  const hasTodayMatches = todayMatchIds.length > 0

  // Ranking de participantes
  const participants: Participant[] = (rawParticipants ?? []).map((p) => ({
    userId:        p.user_id as string,
    displayName:   p.display_name as string,
    groupPoints:   (p.group_points as number | null) ?? 0,
    knockoutPoints:(p.knockout_points as number | null) ?? 0,
    isCurrentUser: p.user_id === user.id,
    todayPoints:   todayPtsMap[p.user_id as string] ?? 0,
  }))

  const groupStandings: GroupStanding[] = (rawGroups ?? []).map((g) => ({
    groupId:   g.id as number,
    groupName: g.name as string,
    rows: (rawTeams ?? [])
      .filter((t) => (t.group_id as number) === (g.id as number))
      .map((t) => {
        const st = standMap.get(t.id as number) ?? { played:0, won:0, drawn:0, lost:0, gf:0, ga:0, gd:0, points:0 }
        return { teamId: t.id as number, teamName: t.name as string, ...st }
      }),
  }))

  // Otros campeonatos del usuario para "Copiar pronósticos"
  // Supabase devuelve el join como any — normalizamos explícitamente
  const otherChampionships: { id: string; name: string }[] = (rawOtherMemberships ?? [])
    .map((m) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (m as any).championships
      if (!raw) return null
      const c = Array.isArray(raw) ? raw[0] : raw
      return c ? { id: c.id as string, name: c.name as string } : null
    })
    .filter((c): c is { id: string; name: string } => c !== null)

  // ── Pronósticos especiales de todos los participantes (post-cierre) ──────────
  // Solo se cargan y muestran si ya cerró el módulo Y el usuario tiene los suyos.
  const playerNameMap = new Map<number, string>(
    (rawPlayers ?? []).map(p => [p.id as number, p.name as string]),
  )
  const userHasSpecialPred = specialPred != null && (
    specialPred.gold_team_id != null ||
    specialPred.silver_team_id != null ||
    specialPred.bronze_team_id != null ||
    specialPred.golden_boot_player_id != null ||
    specialPred.mvp_player_id != null
  )

  let specialPredEntries: import('./resultados/resultados-view').SpecialPredEntry[] = []
  if (isPodiumLocked && userHasSpecialPred) {
    const { data: allSpecials } = await admin
      .from('special_predictions')
      .select('user_id, gold_team_id, silver_team_id, bronze_team_id, golden_boot_player_id, mvp_player_id')
      .eq('championship_id', id)

    specialPredEntries = (allSpecials ?? []).map(s => ({
      userId:               s.user_id as string,
      goldTeamName:         s.gold_team_id   ? (teamNameMap.get(s.gold_team_id   as number) ?? null) : null,
      silverTeamName:       s.silver_team_id ? (teamNameMap.get(s.silver_team_id as number) ?? null) : null,
      bronzeTeamName:       s.bronze_team_id ? (teamNameMap.get(s.bronze_team_id as number) ?? null) : null,
      goldenBootPlayerName: s.golden_boot_player_id ? (playerNameMap.get(s.golden_boot_player_id as number) ?? null) : null,
      mvpPlayerName:        s.mvp_player_id  ? (playerNameMap.get(s.mvp_player_id  as number) ?? null) : null,
    }))
  }

  // ── Predicciones de clasificación de grupos (todos los participantes) ─────────
  // Solo incluye filas con los 4 lugares confirmados.
  const groupPredEntries: GroupPredEntry[] = (rawAllGroupPreds ?? [])
    .filter(gp => gp.first_place != null && gp.second_place != null && gp.third_place != null && gp.fourth_place != null)
    .map(gp => ({
      userId:    gp.user_id as string,
      groupId:   gp.group_id as number,
      groupName: groupNameMap.get(gp.group_id as number) ?? '',
      places: [
        teamNameMap.get(gp.first_place  as number) ?? '',
        teamNameMap.get(gp.second_place as number) ?? '',
        teamNameMap.get(gp.third_place  as number) ?? '',
        teamNameMap.get(gp.fourth_place as number) ?? '',
      ] as [string, string, string, string],
    }))

  return (
    <ChampionshipApp
      championshipId={id}
      userId={user.id}
      championshipName={championship.name}
      displayName={membership.display_name}
      isCreator={championship.created_by === user.id}
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
      initialGroupPredictions={initialGroupPredictions}
      initialSpecialPrediction={initialSpecialPrediction}
      groupMatches={groupMatches}
      initialMatchPredictions={initialMatchPredictions}
      groupStandings={groupStandings}
      participants={participants}
      resultMatches={resultMatches}
      predsByMatch={predsByMatch}
      hasTodayMatches={hasTodayMatches}
      groupPredEntries={groupPredEntries}
      modGroupStandings={championship.mod_group_standings}
      modKnockoutMatches={championship.mod_knockout_matches}
      otherChampionships={otherChampionships}
      specialPredEntries={specialPredEntries}
    />
  )
}
