/**
 * Resuelve retroactivamente los placeholders W/L de eliminatoria
 * para todos los partidos KO que ya tienen status='finished'.
 *
 * Útil cuando se añade autoResolveKnockoutWinnerPlaceholders al motor
 * pero ya hay partidos terminados que no lo dispararon.
 */
import dotenv from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

void (async () => {
  // Todos los partidos KO ya finalizados con equipos resueltos
  const { data: finished, error } = await admin
    .from('matches')
    .select('id, score1, score2, penalty1, penalty2, team1_id, team2_id')
    .eq('phase', 'knockout')
    .eq('status', 'finished')
    .not('team1_id', 'is', null)
    .not('team2_id', 'is', null)
    .order('id')

  if (error) { console.error(error.message); process.exit(1) }

  const { data: teams } = await admin.from('teams').select('id, name')
  const tm = new Map((teams ?? []).map(t => [t.id as number, t.name as string]))

  console.log(`Partidos KO finalizados a procesar: ${finished?.length ?? 0}\n`)

  let resolved = 0
  let skipped = 0

  for (const m of finished ?? []) {
    const t1Id = m.team1_id as number
    const t2Id = m.team2_id as number
    const s1   = m.score1 as number
    const s2   = m.score2 as number
    const p1   = (m.penalty1 as number | null) ?? 0
    const p2   = (m.penalty2 as number | null) ?? 0

    const t1Wins  = s1 > s2 || (s1 === s2 && p1 > p2)
    const winnerId = t1Wins ? t1Id : t2Id
    const loserId  = t1Wins ? t2Id : t1Id

    const wP = `W${m.id}`
    const lP = `L${m.id}`

    // Buscar qué matches usan estos placeholders
    const { data: dependent } = await admin
      .from('matches')
      .select('id, team1_placeholder, team2_placeholder')
      .or(`team1_placeholder.eq.${wP},team2_placeholder.eq.${wP},team1_placeholder.eq.${lP},team2_placeholder.eq.${lP}`)

    if (!dependent || dependent.length === 0) {
      console.log(`  [${m.id}] ${tm.get(t1Id)} ${s1}-${s2} ${tm.get(t2Id)} — sin dependientes`)
      skipped++
      continue
    }

    const results = await Promise.all([
      admin.from('matches').update({ team1_id: winnerId }).eq('team1_placeholder', wP),
      admin.from('matches').update({ team2_id: winnerId }).eq('team2_placeholder', wP),
      admin.from('matches').update({ team1_id: loserId  }).eq('team1_placeholder', lP),
      admin.from('matches').update({ team2_id: loserId  }).eq('team2_placeholder', lP),
    ])

    const errs = results.map(r => r.error?.message).filter(Boolean)
    if (errs.length > 0) {
      console.error(`  [${m.id}] ERROR: ${errs.join('; ')}`)
    } else {
      const winner = tm.get(winnerId) ?? winnerId
      console.log(`  ✓ [${m.id}] ganador=${winner} → placeholders ${wP}/${lP} resueltos en matches: ${dependent.map(d => d.id).join(', ')}`)
      resolved++
    }
  }

  console.log(`\nResultado: ${resolved} matches resueltos, ${skipped} sin dependientes`)
})()
