/**
 * Función PURA de puntuación por partido.
 * Categoría única — la más alta que aplique, NO se suman.
 *
 * Para knockout: pasar score1/score2 de 90'+próroga, NO penales.
 */
export function computeMatchPoints(
  predScore1: number,
  predScore2: number,
  actScore1: number,
  actScore2: number,
): number {
  const signCorrect = Math.sign(predScore1 - predScore2) === Math.sign(actScore1 - actScore2)
  const goalsL = predScore1 === actScore1
  const goalsV = predScore2 === actScore2

  if (signCorrect && goalsL && goalsV) return 6
  if (signCorrect && (goalsL || goalsV)) return 4
  if (signCorrect) return 3
  if (goalsL || goalsV) return 1
  return 0
}

/**
 * Puntuación de clasificación por grupo.
 * Categoría única: 0, 1, 2 o 4 posiciones exactas (3/4 es imposible en ranking completo).
 *   4 exactas → 5 pts (pleno)
 *   2 exactas → 2 pts
 *   1 exacta  → 1 pt
 *   0 exactas → 0 pts
 *
 * @param pred  IDs pronosticados [1ro, 2do, 3ro, 4to]
 * @param actual IDs reales       [1ro, 2do, 3ro, 4to] (orden por puntos FIFA)
 */
export function computeGroupPredictionPoints(
  pred: [number | null, number | null, number | null, number | null],
  actual: [number, number, number, number],
): number {
  let exact = 0
  for (let i = 0; i < 4; i++) {
    if (pred[i] !== null && pred[i] === actual[i]) exact++
  }
  if (exact === 4) return 5
  if (exact === 2) return 2
  if (exact === 1) return 1
  return 0
}

// ── Tipos para special_predictions ───────────────────────────────────────────

export type SpecialPredInput = {
  gold_team_id: number | null
  silver_team_id: number | null
  bronze_team_id: number | null
  golden_boot_player_id: number | null
  mvp_player_id: number | null
}

export type TournamentResults = {
  goldTeamId: number | null
  silverTeamId: number | null
  bronzeTeamId: number | null
  goldenBootPlayerId: number | null
  mvpPlayerId: number | null
}

/**
 * Puntuación de predicciones especiales.
 * Cada acierto suma independientemente (NO categoría única).
 *   Oro   acertado → 7 pts
 *   Plata acertada → 5 pts
 *   Bronce acertado → 3 pts
 *   Bota de oro acertada → 6 pts
 *   MVP acertado → 6 pts
 */
export function computeSpecialPoints(
  pred: SpecialPredInput,
  actual: TournamentResults,
): number {
  let total = 0
  if (actual.goldTeamId        && pred.gold_team_id            === actual.goldTeamId)        total += 7
  if (actual.silverTeamId      && pred.silver_team_id          === actual.silverTeamId)      total += 5
  if (actual.bronzeTeamId      && pred.bronze_team_id          === actual.bronzeTeamId)      total += 3
  if (actual.goldenBootPlayerId && pred.golden_boot_player_id  === actual.goldenBootPlayerId) total += 6
  if (actual.mvpPlayerId        && pred.mvp_player_id          === actual.mvpPlayerId)        total += 6
  return total
}
