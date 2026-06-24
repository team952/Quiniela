/**
 * Prueba de integración: auto-scoring de group_predictions.
 *
 * TEST 1 — processGroupPredictions funciona standalone + idempotencia.
 * TEST 2 — processMatchResult devuelve groupPredictionsScored=false en grupo incompleto.
 * TEST 3 — processMatchResult dispara el scoring al simular cierre del grupo.
 *
 * Grupo usado: 1 (4/6 finished, pending IDs: 5, 6)
 *
 * NOTA: points_earned en group_predictions empieza en 0 (no null) por defecto.
 * Las assertions comparan contra los valores originales guardados al inicio.
 * El revert restaura la BD al estado previo a cada test.
 */

import { resolve } from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { processMatchResult, processGroupPredictions } from '../src/lib/scoring/engine'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const GROUP_ID       = 1          // 4/6 finished
const TEMP_MATCH_IDS = [5, 6]     // los 2 pendientes del grupo 1

// ── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0; let failed = 0

function ok(label: string)  { console.log(`  ✅ ${label}`); passed++ }
function fail(label: string, detail?: unknown) { console.error(`  ❌ ${label}`, detail ?? ''); failed++ }
function assert(cond: boolean, label: string, detail?: unknown) { cond ? ok(label) : fail(label, detail) }

// ── Snapshot del estado en BD ─────────────────────────────────────────────────

async function saveState() {
  const { data: gp } = await admin
    .from('group_predictions').select('id, points_earned').eq('group_id', GROUP_ID)
  const { data: preds } = await admin
    .from('predictions').select('id, points_earned').in('match_id', TEMP_MATCH_IDS)
  const { data: finishedMatches } = await admin
    .from('matches').select('id, score1, score2, status')
    .eq('group_id', GROUP_ID).eq('status', 'finished')
  return {
    groupPreds: gp ?? [],
    tempPreds:  preds ?? [],
    finishedMatches: finishedMatches ?? [],
  }
}

// ── Revert del TEST 3 (grupo simulado como completo) ──────────────────────────

async function revertSimulatedCompletion(orig: Awaited<ReturnType<typeof saveState>>) {
  console.log('\n  [revert] Restaurando grupo 1...')

  // 1. Partidos temporales → scheduled/null
  for (const id of TEMP_MATCH_IDS) {
    await admin.from('matches').update({ score1: null, score2: null, status: 'scheduled' }).eq('id', id)
  }

  // 2. group_predictions → valores originales
  for (const gp of orig.groupPreds) {
    await admin.from('group_predictions').update({ points_earned: gp.points_earned }).eq('id', gp.id)
  }

  // 3. predictions de partidos temporales → valores originales
  for (const p of orig.tempPreds) {
    await admin.from('predictions').update({ points_earned: p.points_earned }).eq('id', p.id)
  }

  // 4. Re-correr partidos reales → recalcula standings + championship_users
  //    Grupo queda 4/6 → NO se re-dispara processGroupPredictions
  for (const m of orig.finishedMatches) {
    if (m.score1 === null || m.score2 === null) continue
    const r = await processMatchResult(admin, { matchId: m.id, score1: m.score1, score2: m.score2 })
    assert(!r.groupPredictionsScored, `Revert match ${m.id}: groupPredictionsScored=false`)
    if (r.errors.length > 0) console.warn(`  ⚠ errores revert match ${m.id}:`, r.errors)
  }

  // 5. Verificar que group_predictions tienen valores originales
  const { data: gpFinal } = await admin
    .from('group_predictions').select('id, points_earned').eq('group_id', GROUP_ID)
  const origMap = new Map(orig.groupPreds.map(g => [g.id as number, g.points_earned]))
  const allMatch = (gpFinal ?? []).every(g => origMap.get(g.id as number) === g.points_earned)
  assert(allMatch, 'Post-revert: group_predictions tienen valores originales')

  console.log('  [revert] Completado.')
}

// ── TEST 1: processGroupPredictions standalone + idempotencia ────────────────

async function test1() {
  console.log('\n─────────────────────────────────────────────────────')
  console.log('TEST 1: processGroupPredictions — standalone + idempotencia')
  console.log(`  Grupo ${GROUP_ID} (4/6 finished — standings parciales)`)
  console.log('─────────────────────────────────────────────────────')

  const { groupPreds: origGP, finishedMatches } = await saveState()
  console.log('  Valores iniciales:', origGP.map(g => `${g.points_earned}`).join(' | '))

  // Llamada 1
  const r1 = await processGroupPredictions(admin, GROUP_ID)
  console.log('  1ª llamada:', JSON.stringify(r1))
  assert(r1.errors.length === 0, 'Sin errores')
  assert(r1.updated === 8, `Actualiza los 8 group_predictions`, `updated=${r1.updated}`)

  const { data: gp1 } = await admin
    .from('group_predictions').select('id, points_earned').eq('group_id', GROUP_ID)
  console.log('  Puntos calculados:', (gp1 ?? []).map(g => `${g.points_earned}`).join(' | '))

  // Llamada 2 — idempotencia
  const r2 = await processGroupPredictions(admin, GROUP_ID)
  assert(r2.errors.length === 0, 'Idempotente: sin errores en 2ª llamada')
  const { data: gp2 } = await admin
    .from('group_predictions').select('id, points_earned').eq('group_id', GROUP_ID)
  const sameValues = (gp1 ?? []).every(a =>
    (gp2 ?? []).find(x => x.id === a.id)?.points_earned === a.points_earned,
  )
  assert(sameValues, 'Idempotente: mismos valores en ambas llamadas')

  // Revert TEST 1
  for (const gp of origGP) {
    await admin.from('group_predictions').update({ points_earned: gp.points_earned }).eq('id', gp.id)
  }
  for (const m of finishedMatches) {
    if (m.score1 === null || m.score2 === null) continue
    await processMatchResult(admin, { matchId: m.id, score1: m.score1, score2: m.score2 })
  }
  const { data: gpReverted } = await admin
    .from('group_predictions').select('id, points_earned').eq('group_id', GROUP_ID)
  const origMap1 = new Map(origGP.map(g => [g.id as number, g.points_earned]))
  const revertOk = (gpReverted ?? []).every(g => origMap1.get(g.id as number) === g.points_earned)
  assert(revertOk, 'Revert TEST 1: group_predictions vuelven a valores originales')
}

// ── TEST 2: grupo incompleto → groupPredictionsScored=false ──────────────────

async function test2() {
  console.log('\n─────────────────────────────────────────────────────')
  console.log('TEST 2: processMatchResult — groupPredictionsScored=false (grupo incompleto)')
  console.log(`  Grupo ${GROUP_ID} — re-ingresa resultado de un partido ya terminado`)
  console.log('─────────────────────────────────────────────────────')

  const { finishedMatches } = await saveState()
  const m = finishedMatches[0]
  console.log(`  Partido ${m.id}: ${m.score1}-${m.score2}`)

  const r = await processMatchResult(admin, { matchId: m.id, score1: m.score1!, score2: m.score2! })
  console.log('  Resultado:', JSON.stringify(r))

  assert(r.groupPredictionsScored === false, 'groupPredictionsScored=false (grupo con 4/6 partidos)')
  assert(r.errors.length === 0, 'Sin errores')
  assert(r.standingsUpdated === true, 'standingsUpdated=true')
}

// ── TEST 3: auto-trigger al simular cierre del grupo ─────────────────────────

async function test3() {
  console.log('\n─────────────────────────────────────────────────────')
  console.log('TEST 3: processMatchResult — auto-trigger al simular cierre del grupo')
  console.log(`  Grupo ${GROUP_ID} — marcando matches ${TEMP_MATCH_IDS.join(', ')} como terminados`)
  console.log('─────────────────────────────────────────────────────')

  const origState = await saveState()
  console.log('  Valores iniciales group_predictions:', origState.groupPreds.map(g => `${g.points_earned}`).join(' | '))
  console.log('  Partidos reales ya terminados:', origState.finishedMatches.length)

  // Penúltimo partido: marcamos directamente en BD (no dispara scoring, grupo sigue incompleto)
  await admin.from('matches')
    .update({ score1: 1, score2: 0, status: 'finished' }).eq('id', TEMP_MATCH_IDS[0])
  console.log(`  [setup] match ${TEMP_MATCH_IDS[0]} → finished 1-0 (directo en BD)`)

  // Último partido: vía processMatchResult → debe disparar auto-scoring al completar
  console.log(`  [acción] processMatchResult(matchId=${TEMP_MATCH_IDS[1]}, 2-0)...`)
  const r = await processMatchResult(admin, { matchId: TEMP_MATCH_IDS[1], score1: 2, score2: 0 })
  console.log('  Resultado:', JSON.stringify(r))

  assert(r.groupPredictionsScored === true, 'groupPredictionsScored=true al cerrar el grupo')
  assert(r.errors.length === 0, 'Sin errores')
  assert(r.standingsUpdated === true, 'standingsUpdated=true')

  const { data: gp } = await admin
    .from('group_predictions').select('id, points_earned').eq('group_id', GROUP_ID)
  console.log('  Puntos calculados:', (gp ?? []).map(g => `${g.points_earned}`).join(' | '))
  assert((gp?.length ?? 0) === 8, 'Los 8 group_predictions tienen points_earned calculado')

  // Revert
  await revertSimulatedCompletion(origState)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════')
  console.log('  TEST DE INTEGRACIÓN — Auto-scoring de clasificaciones de grupo')
  console.log('══════════════════════════════════════════════════════════')

  await test1()
  await test2()
  await test3()

  console.log(`\n══════════════════════════════════════════════════════════`)
  console.log(`  RESULTADO FINAL: ${passed} pasados · ${failed} fallados`)
  console.log(`══════════════════════════════════════════════════════════\n`)

  if (failed > 0) process.exit(1)
}

main().catch(err => { console.error(err); process.exit(1) })
