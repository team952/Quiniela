/**
 * Motor de puntuación — cascada completa.
 *
 * Al llamar processMatchResult(supabase, input):
 *   1. Actualiza matches (score1, score2, status, penales).
 *   2. Si fase de grupos → recalcula standings desde cero (idempotente).
 *   3. Recalcula predictions.points_earned de ese partido en todos los campeonatos.
 *   4. Recalcula championship_users.group_points / knockout_points de los afectados.
 *
 * Recibe un cliente Supabase con SERVICE ROLE (salta RLS).
 * La función es idempotente: re-guardar un resultado corregido recomputa sin acumular.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeMatchPoints,
  computeGroupPredictionPoints,
  computeSpecialPoints,
  type TournamentResults,
} from './points'

export type { TournamentResults }

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type EngineInput = {
  matchId: number
  score1: number
  score2: number
  /** Solo para knockout — null para grupo o si no hubo penales */
  penalty1?: number | null
  penalty2?: number | null
}

export type EngineResult = {
  matchId: number
  phase: string
  /** true si se recalcularon standings de grupo */
  standingsUpdated: boolean
  /** Cuántos predictions.points_earned fueron escritos */
  predictionsUpdated: number
  /** Cuántos championship_users fueron actualizados */
  usersUpdated: number
  errors: string[]
}

// ── Motor principal ───────────────────────────────────────────────────────────

export async function processMatchResult(
  supabase: SupabaseClient,
  input: EngineInput,
): Promise<EngineResult> {
  const errors: string[] = []
  const { matchId, score1, score2, penalty1 = null, penalty2 = null } = input

  // ── Paso 0: Fetch del partido ─────────────────────────────────────────────
  const { data: match, error: matchFetchErr } = await supabase
    .from('matches')
    .select('id, phase, group_id, team1_id, team2_id')
    .eq('id', matchId)
    .single()

  if (matchFetchErr || !match) {
    return { matchId, phase: '?', standingsUpdated: false, predictionsUpdated: 0, usersUpdated: 0, errors: [`Partido ${matchId} no encontrado: ${matchFetchErr?.message}`] }
  }

  const phase = match.phase as string

  // ── Paso 1: Actualizar matches ────────────────────────────────────────────
  const { error: updateMatchErr } = await supabase
    .from('matches')
    .update({
      score1,
      score2,
      status: 'finished',
      ...(phase !== 'group' && { penalty1, penalty2 }),
    })
    .eq('id', matchId)

  if (updateMatchErr) {
    errors.push(`Update match: ${updateMatchErr.message}`)
    return { matchId, phase, standingsUpdated: false, predictionsUpdated: 0, usersUpdated: 0, errors }
  }

  // ── Paso 2: Recalcular standings (solo grupo) ─────────────────────────────
  let standingsUpdated = false
  if (phase === 'group' && match.group_id) {
    const err = await recalcStandings(supabase, match.group_id as number)
    if (err) errors.push(`Standings: ${err}`)
    else {
      standingsUpdated = true
      const resolveErr = await autoResolveKnockoutPlaceholders(supabase, match.group_id as number)
      if (resolveErr) errors.push(`AutoResolve: ${resolveErr}`)
    }
  }

  // ── Paso 3: Recalcular predictions.points_earned ──────────────────────────
  const predictionsUpdated = await recalcPredictions(supabase, matchId, score1, score2, errors)

  // ── Paso 4: Recalcular championship_users ────────────────────────────────
  const usersUpdated = await recalcUserPoints(supabase, matchId, errors)

  return { matchId, phase, standingsUpdated, predictionsUpdated, usersUpdated, errors }
}

// ── Paso 2: Standings desde cero ─────────────────────────────────────────────

async function recalcStandings(
  supabase: SupabaseClient,
  groupId: number,
): Promise<string | null> {
  // Todos los equipos del grupo
  const { data: teams, error: teamsErr } = await supabase
    .from('teams')
    .select('id')
    .eq('group_id', groupId)

  if (teamsErr || !teams) return teamsErr?.message ?? 'No teams'

  // Todos los partidos finalizados del grupo
  const { data: groupMatches, error: matchesErr } = await supabase
    .from('matches')
    .select('team1_id, team2_id, score1, score2')
    .eq('group_id', groupId)
    .eq('status', 'finished')

  if (matchesErr) return matchesErr.message

  // Inicializar contadores desde cero
  type Row = {
    team_id: number; group_id: number
    played: number; won: number; drawn: number; lost: number
    gf: number; ga: number; gd: number; points: number
  }
  const rows = new Map<number, Row>()
  for (const t of teams) {
    rows.set(t.id as number, {
      team_id: t.id as number, group_id: groupId,
      played: 0, won: 0, drawn: 0, lost: 0,
      gf: 0, ga: 0, gd: 0, points: 0,
    })
  }

  // Acumular desde los partidos finalizados (idempotente: recalcula desde cero)
  for (const m of groupMatches ?? []) {
    const t1 = rows.get(m.team1_id as number)
    const t2 = rows.get(m.team2_id as number)
    if (!t1 || !t2) continue

    const s1 = m.score1 as number
    const s2 = m.score2 as number

    t1.played++; t2.played++
    t1.gf += s1; t1.ga += s2
    t2.gf += s2; t2.ga += s1

    if (s1 > s2) {
      t1.won++; t2.lost++; t1.points += 3
    } else if (s2 > s1) {
      t2.won++; t1.lost++; t2.points += 3
    } else {
      t1.drawn++; t2.drawn++; t1.points += 1; t2.points += 1
    }
  }

  // Calcular GD
  for (const r of rows.values()) r.gd = r.gf - r.ga

  const { error: upsertErr } = await supabase
    .from('standings')
    .upsert([...rows.values()], { onConflict: 'team_id,group_id' })

  return upsertErr ? upsertErr.message : null
}

// ── Paso 2b: Resolver placeholders de eliminatoria ───────────────────────────
// Cuando un grupo termina (todos sus partidos en status='finished'), busca el 1°
// y 2° en standings y rellena team1_id/team2_id de los partidos de R32 que usan
// los placeholders '1X' / '2X' (donde X es la letra del grupo).
// Idempotente: re-correr tras una corrección sobreescribe sin acumular.

async function autoResolveKnockoutPlaceholders(
  supabase: SupabaseClient,
  groupId: number,
): Promise<string | null> {
  // Solo actuar si el grupo está completo
  const [{ count: total }, { count: finished }] = await Promise.all([
    supabase.from('matches').select('id', { count: 'exact', head: true }).eq('group_id', groupId),
    supabase.from('matches').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'finished'),
  ])
  if (!total || finished !== total) return null

  // Letra del grupo ("Group A" → "A")
  const { data: group } = await supabase.from('groups').select('name').eq('id', groupId).single()
  if (!group) return `Grupo ${groupId} no encontrado`
  const letter = (group.name as string).replace('Group ', '')

  // Top 2 por puntos → GD → GF
  const { data: top, error: standErr } = await supabase
    .from('standings')
    .select('team_id, points, gd, gf')
    .eq('group_id', groupId)
    .order('points', { ascending: false })
    .order('gd',     { ascending: false })
    .order('gf',     { ascending: false })
    .limit(2)

  if (standErr || !top || top.length < 2) return `Standings insuficientes para grupo ${letter}`

  const pairs = [
    { placeholder: `1${letter}`, teamId: top[0].team_id as number },
    { placeholder: `2${letter}`, teamId: top[1].team_id as number },
  ]

  for (const { placeholder, teamId } of pairs) {
    await Promise.all([
      supabase.from('matches').update({ team1_id: teamId }).eq('team1_placeholder', placeholder),
      supabase.from('matches').update({ team2_id: teamId }).eq('team2_placeholder', placeholder),
    ])
  }

  return null
}

// ── Paso 3: Puntos de predicciones ───────────────────────────────────────────

async function recalcPredictions(
  supabase: SupabaseClient,
  matchId: number,
  actScore1: number,
  actScore2: number,
  errors: string[],
): Promise<number> {
  const { data: preds, error: predsErr } = await supabase
    .from('predictions')
    .select('id, score1, score2')
    .eq('match_id', matchId)
    .not('score1', 'is', null)
    .not('score2', 'is', null)

  if (predsErr) { errors.push(`Fetch predictions: ${predsErr.message}`); return 0 }
  if (!preds || preds.length === 0) return 0

  // Calcular y escribir en lotes
  const updates = preds.map((p) => ({
    id: p.id as number,
    points_earned: computeMatchPoints(
      p.score1 as number,
      p.score2 as number,
      actScore1,
      actScore2,
    ),
  }))

  // Usar UPDATE individual por ID (más robusto que upsert para solo modificar points_earned)
  let written = 0
  for (const u of updates) {
    const { error: updErr } = await supabase
      .from('predictions')
      .update({ points_earned: u.points_earned })
      .eq('id', u.id)
    if (updErr) {
      errors.push(`Update prediction id=${u.id}: ${updErr.message}`)
    } else {
      written++
    }
  }

  return written
}

// ── Paso 4: Puntos acumulados por usuario ─────────────────────────────────────

async function recalcUserPoints(
  supabase: SupabaseClient,
  matchId: number,
  errors: string[],
): Promise<number> {
  // Obtener pares únicos (championship_id, user_id) afectados por este partido
  const { data: affected, error: affErr } = await supabase
    .from('predictions')
    .select('championship_id, user_id')
    .eq('match_id', matchId)

  if (affErr) { errors.push(`Fetch affected users: ${affErr.message}`); return 0 }
  if (!affected || affected.length === 0) return 0

  // Deduplicar pares
  const pairs = [
    ...new Map(
      affected.map((r) => [`${r.championship_id}:${r.user_id}`, r]),
    ).values(),
  ]

  let updated = 0
  for (const { championship_id, user_id } of pairs) {
    const err = await recalcOnePair(supabase, championship_id as string, user_id as string)
    if (err) errors.push(`User ${user_id} / champ ${championship_id}: ${err}`)
    else updated++
  }

  return updated
}

async function recalcOnePair(
  supabase: SupabaseClient,
  championshipId: string,
  userId: string,
): Promise<string | null> {
  // Módulo eliminatoria: si está desactivado, los partidos knockout no suman a knockout_points
  const { data: champ } = await supabase
    .from('championships')
    .select('mod_knockout_matches')
    .eq('id', championshipId)
    .single()
  const modKnockoutMatches = (champ?.mod_knockout_matches as boolean | null) ?? false

  // Todas las predictions no-null de este par
  const { data: preds, error: predsErr } = await supabase
    .from('predictions')
    .select('match_id, points_earned')
    .eq('championship_id', championshipId)
    .eq('user_id', userId)
    .not('points_earned', 'is', null)

  if (predsErr) return predsErr.message
  if (!preds || preds.length === 0) {
    // Sin predicciones con puntos → resetear a 0
    await supabase
      .from('championship_users')
      .update({ group_points: 0, knockout_points: 0 })
      .eq('championship_id', championshipId)
      .eq('user_id', userId)
    return null
  }

  // Obtener la fase de cada partido involucrado (sin nested select)
  const matchIds = [...new Set(preds.map((p) => p.match_id as number))]
  const { data: matchPhases, error: phaseErr } = await supabase
    .from('matches')
    .select('id, phase')
    .in('id', matchIds)

  if (phaseErr) return phaseErr.message

  const phaseMap = new Map<number, string>(
    (matchPhases ?? []).map((m) => [m.id as number, m.phase as string]),
  )

  // Sumar por sistema: partidos grupo vs. eliminatoria
  let groupPoints = 0
  let knockoutPoints = 0
  for (const p of preds) {
    const pts = (p.points_earned as number) ?? 0
    const phase = phaseMap.get(p.match_id as number) ?? ''
    if (phase === 'group') groupPoints += pts
    else if (modKnockoutMatches) knockoutPoints += pts
  }

  // Sumar group_predictions (clasificación por grupo → se suma a group_points)
  const { data: groupPreds } = await supabase
    .from('group_predictions')
    .select('points_earned')
    .eq('championship_id', championshipId)
    .eq('user_id', userId)
    .not('points_earned', 'is', null)
  for (const gp of groupPreds ?? []) groupPoints += (gp.points_earned as number) ?? 0

  // Sumar special_predictions (podio/bota/MVP → se suma a knockout_points)
  const { data: specialPred } = await supabase
    .from('special_predictions')
    .select('points_earned')
    .eq('championship_id', championshipId)
    .eq('user_id', userId)
    .not('points_earned', 'is', null)
    .maybeSingle()
  knockoutPoints += (specialPred?.points_earned as number | null) ?? 0

  const { error: updateErr } = await supabase
    .from('championship_users')
    .update({ group_points: groupPoints, knockout_points: knockoutPoints })
    .eq('championship_id', championshipId)
    .eq('user_id', userId)

  return updateErr ? updateErr.message : null
}

// ── API pública: Group Predictions ────────────────────────────────────────────

/**
 * Recalcula group_predictions.points_earned para todos los pronósticos de un grupo.
 * Llamar cuando las standings del grupo sean definitivas (6 partidos jugados).
 * Idempotente: re-correr actualiza sin acumular.
 */
export async function processGroupPredictions(
  supabase: SupabaseClient,
  groupId: number,
): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = []

  // Obtener el ranking real del grupo desde standings (ordenado por pts, DG, GF)
  const { data: standRows, error: standErr } = await supabase
    .from('standings')
    .select('team_id, points, gd, gf')
    .eq('group_id', groupId)

  if (standErr || !standRows || standRows.length < 4) {
    return { updated: 0, errors: [`Standings incompletos para group ${groupId}: ${standErr?.message ?? 'solo ' + (standRows?.length ?? 0) + ' equipos'}`] }
  }

  const sorted = [...standRows].sort((a, b) =>
    (b.points as number) - (a.points as number) ||
    (b.gd as number) - (a.gd as number) ||
    (b.gf as number) - (a.gf as number),
  )

  const actual: [number, number, number, number] = [
    sorted[0].team_id as number,
    sorted[1].team_id as number,
    sorted[2].team_id as number,
    sorted[3].team_id as number,
  ]

  // Obtener todos los group_predictions para este grupo
  const { data: gPreds, error: predsErr } = await supabase
    .from('group_predictions')
    .select('id, championship_id, user_id, first_place, second_place, third_place, fourth_place')
    .eq('group_id', groupId)

  if (predsErr) return { updated: 0, errors: [predsErr.message] }
  if (!gPreds || gPreds.length === 0) return { updated: 0, errors: [] }

  let updated = 0
  const affectedPairs = new Set<string>()

  for (const gp of gPreds) {
    const pred: [number | null, number | null, number | null, number | null] = [
      gp.first_place as number | null,
      gp.second_place as number | null,
      gp.third_place as number | null,
      gp.fourth_place as number | null,
    ]
    const pts = computeGroupPredictionPoints(pred, actual)

    const { error: updErr } = await supabase
      .from('group_predictions')
      .update({ points_earned: pts })
      .eq('id', gp.id as number)

    if (updErr) errors.push(`group_pred id=${gp.id}: ${updErr.message}`)
    else { updated++; affectedPairs.add(`${gp.championship_id}:${gp.user_id}`) }
  }

  // Recalcular championship_users para los afectados
  for (const key of affectedPairs) {
    const [cid, uid] = key.split(':')
    const err = await recalcOnePair(supabase, cid, uid)
    if (err) errors.push(`recalcOnePair ${key}: ${err}`)
  }

  return { updated, errors }
}

// ── API pública: Special Predictions ─────────────────────────────────────────

/**
 * Recalcula special_predictions.points_earned para todos los campeonatos.
 * Llamar al finalizar el torneo cuando se conozcan los resultados reales.
 * Idempotente: re-correr actualiza sin acumular.
 */
export async function processSpecialPredictions(
  supabase: SupabaseClient,
  actual: TournamentResults,
): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = []

  const { data: allPreds, error: predsErr } = await supabase
    .from('special_predictions')
    .select('id, championship_id, user_id, gold_team_id, silver_team_id, bronze_team_id, golden_boot_player_id, mvp_player_id')

  if (predsErr) return { updated: 0, errors: [predsErr.message] }
  if (!allPreds || allPreds.length === 0) return { updated: 0, errors: [] }

  let updated = 0
  const affectedPairs = new Set<string>()

  for (const sp of allPreds) {
    const pts = computeSpecialPoints(
      {
        gold_team_id:           sp.gold_team_id as number | null,
        silver_team_id:         sp.silver_team_id as number | null,
        bronze_team_id:         sp.bronze_team_id as number | null,
        golden_boot_player_id:  sp.golden_boot_player_id as number | null,
        mvp_player_id:          sp.mvp_player_id as number | null,
      },
      actual,
    )

    const { error: updErr } = await supabase
      .from('special_predictions')
      .update({ points_earned: pts })
      .eq('id', sp.id as number)

    if (updErr) errors.push(`special_pred id=${sp.id}: ${updErr.message}`)
    else { updated++; affectedPairs.add(`${sp.championship_id}:${sp.user_id}`) }
  }

  for (const key of affectedPairs) {
    const [cid, uid] = key.split(':')
    const err = await recalcOnePair(supabase, cid, uid)
    if (err) errors.push(`recalcOnePair ${key}: ${err}`)
  }

  return { updated, errors }
}
