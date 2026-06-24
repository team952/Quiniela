import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { AdminPanel, type MatchRow } from './panel'

/**
 * Ruta OCULTA — no enlazada en ninguna UI.
 * Protección server-side: si el usuario no es SUPER_ADMIN_ID → 404.
 * La verificación ocurre antes de cualquier render o fetch de datos.
 */
export default async function SuperAdminResultadosPage() {
  // ── Auth check ────────────────────────────────────────────────────────────
  const supabaseUser = await createClient()
  const { data: { user } } = await supabaseUser.auth.getUser()

  const SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID
  if (!user || !SUPER_ADMIN_ID || user.id !== SUPER_ADMIN_ID) {
    notFound()
  }

  // ── Fetch con service role (acceso completo, salta RLS) ───────────────────
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Partidos con equipos y grupos
  const [{ data: rawMatches }, { data: teams }, { data: groups }] = await Promise.all([
    admin
      .from('matches')
      .select('id, match_num, phase, round, date, ground, group_id, team1_id, team2_id, team1_placeholder, team2_placeholder, score1, score2, penalty1, penalty2, status')
      .order('date', { ascending: true })
      .order('id',   { ascending: true }),
    admin.from('teams').select('id, name'),
    admin.from('groups').select('id, name'),
  ])

  // Mapas auxiliares
  const teamMap  = new Map<number, string>((teams  ?? []).map(t => [t.id as number, t.name as string]))
  const groupMap = new Map<number, string>((groups ?? []).map(g => [g.id as number, g.name as string]))

  const matches: MatchRow[] = (rawMatches ?? []).map(m => {
    const gName = m.group_id ? (groupMap.get(m.group_id as number) ?? null) : null
    return {
      id:       m.id as number,
      matchNum: m.match_num as number | null,
      phase:    m.phase as string,
      round:    m.round as string | null,
      date:     m.date as string,
      ground:   m.ground as string | null,
      groupId:  m.group_id as number | null,
      groupName: gName,
      team1Id:   (m.team1_id as number | null) ?? null,
      team2Id:   (m.team2_id as number | null) ?? null,
      team1Name: (m.team1_id ? teamMap.get(m.team1_id as number) : null) ?? (m.team1_placeholder as string) ?? '?',
      team2Name: (m.team2_id ? teamMap.get(m.team2_id as number) : null) ?? (m.team2_placeholder as string) ?? '?',
      score1:   m.score1 as number | null,
      score2:   m.score2 as number | null,
      penalty1: m.penalty1 as number | null,
      penalty2: m.penalty2 as number | null,
      status:   m.status as string,
    }
  })

  const teamList = (teams ?? []).map(t => ({ id: t.id as number, name: t.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Grupos cuyos 6 partidos están todos finished = grupo puntuado
  const matchCountByGroup = new Map<number, { total: number; finished: number }>()
  for (const m of rawMatches ?? []) {
    if (m.group_id) {
      const cur = matchCountByGroup.get(m.group_id as number) ?? { total: 0, finished: 0 }
      cur.total++
      if ((m.status as string) === 'finished') cur.finished++
      matchCountByGroup.set(m.group_id as number, cur)
    }
  }
  const scoredGroups = new Set<string>(
    [...matchCountByGroup.entries()]
      .filter(([, c]) => c.total > 0 && c.finished === c.total)
      .map(([gid]) => groupMap.get(gid) ?? '')
      .filter(Boolean),
  )

  return (
    <main style={{
      minHeight: '100dvh',
      background: '#081225',
      position: 'relative',
    }}>
      {/* Glow sutil en rojo para distinguir el panel admin */}
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '600px', height: '240px', pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(232,67,79,0.14) 0%, transparent 70%)',
      }} aria-hidden />

      <AdminPanel matches={matches} teams={teamList} scoredGroups={scoredGroups} />
    </main>
  )
}
