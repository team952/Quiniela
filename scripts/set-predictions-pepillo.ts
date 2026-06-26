import { resolve } from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

// Pronósticos a insertar (local → visitante)
const PREDICTIONS = [
  { team1: 'Norway',       team2: 'France',       s1: 2, s2: 3 },
  { team1: 'Senegal',      team2: 'Iraq',          s1: 2, s2: 1 },
  { team1: 'Cape Verde',   team2: 'Saudi Arabia',  s1: 1, s2: 1 },
  { team1: 'Uruguay',      team2: 'Spain',         s1: 0, s2: 2 },
  { team1: 'Egypt',        team2: 'Iran',          s1: 1, s2: 2 },
  { team1: 'New Zealand',  team2: 'Belgium',       s1: 0, s2: 2 },
]

void (async () => {
  // 1. Encontrar campeonato "No fuimo al berro"
  const { data: champs } = await admin
    .from('championships')
    .select('id, name')
    .ilike('name', '%No fuimo al berro%')

  if (!champs?.length) { console.error('Campeonato no encontrado'); process.exit(1) }
  const champ = champs[0]
  console.log(`Campeonato: "${champ.name}" (${champ.id})`)

  // 2. Encontrar usuario "el papá del pepillo"
  const { data: members } = await admin
    .from('championship_users')
    .select('user_id, display_name')
    .eq('championship_id', champ.id)
    .ilike('display_name', '%papá del pepillo%')

  if (!members?.length) { console.error('Usuario no encontrado'); process.exit(1) }
  const member = members[0]
  console.log(`Usuario: "${member.display_name}" (${member.user_id})`)

  // 3. Obtener equipos
  const { data: teams } = await admin.from('teams').select('id, name')
  const teamByName = new Map<string, number>((teams ?? []).map(t => [t.name as string, t.id as number]))

  // 4. Obtener partidos de hoy (26 jun 2026) — fase de grupos
  const { data: todayMatches } = await admin
    .from('matches')
    .select('id, team1_id, team2_id, date')
    .eq('date', '2026-06-26')
    .eq('phase', 'group')

  if (!todayMatches?.length) { console.error('No hay partidos de hoy'); process.exit(1) }
  console.log(`Partidos del día: ${todayMatches.length}`)

  // 5. Insertar pronósticos
  const toInsert: { championship_id: string; user_id: string; match_id: number; score1: number; score2: number }[] = []

  for (const pred of PREDICTIONS) {
    const t1Id = teamByName.get(pred.team1)
    const t2Id = teamByName.get(pred.team2)

    if (!t1Id || !t2Id) {
      console.warn(`Equipos no encontrados: ${pred.team1} / ${pred.team2}`)
      continue
    }

    const match = todayMatches.find(m =>
      (m.team1_id as number) === t1Id && (m.team2_id as number) === t2Id,
    )

    if (!match) {
      // Intentar al revés (por si el orden está invertido en BD)
      const matchReversed = todayMatches.find(m =>
        (m.team1_id as number) === t2Id && (m.team2_id as number) === t1Id,
      )
      if (matchReversed) {
        console.warn(`⚠ Orden invertido en BD para ${pred.team1} vs ${pred.team2}, intercambiando scores`)
        toInsert.push({
          championship_id: champ.id as string,
          user_id: member.user_id as string,
          match_id: matchReversed.id as number,
          score1: pred.s2,
          score2: pred.s1,
        })
      } else {
        console.warn(`Partido no encontrado: ${pred.team1} vs ${pred.team2}`)
      }
      continue
    }

    toInsert.push({
      championship_id: champ.id as string,
      user_id: member.user_id as string,
      match_id: match.id as number,
      score1: pred.s1,
      score2: pred.s2,
    })
    console.log(`  ${pred.team1} ${pred.s1}-${pred.s2} ${pred.team2}  →  match ${match.id}`)
  }

  if (!toInsert.length) { console.error('Nada que insertar'); process.exit(1) }

  const { error } = await admin
    .from('predictions')
    .upsert(toInsert, { onConflict: 'championship_id,user_id,match_id' })

  if (error) { console.error('Error al insertar:', error.message); process.exit(1) }

  console.log(`\n✓ ${toInsert.length} pronósticos insertados para "${member.display_name}"`)
})()
