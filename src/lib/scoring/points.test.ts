import { describe, it, expect } from 'vitest'
import {
  computeMatchPoints,
  computeGroupPredictionPoints,
  computeSpecialPoints,
} from './points'

describe('computeMatchPoints — categoría única', () => {
  const casos: [number, number, number, number, number, string][] = [
    [2, 1, 2, 1, 6, 'marcador exacto'],
    [0, 0, 0, 0, 6, 'exacto 0-0'],
    [2, 0, 2, 1, 4, 'signo + gol local'],
    [4, 1, 2, 1, 4, 'signo + gol visitante'],
    [3, 0, 2, 1, 3, 'solo signo (local gana)'],
    [1, 1, 2, 2, 3, 'solo signo (empate, sin gol)'],
    [1, 1, 2, 1, 1, 'gol visitante, signo mal'],
    [2, 3, 2, 1, 1, 'gol local, signo mal'],
    [0, 3, 2, 1, 0, 'nada'],
    [1, 2, 3, 0, 0, 'signo y goles mal'],
  ]

  it.each(casos)('%# pred %i-%i vs real %i-%i → %i (%s)', (p1, p2, a1, a2, esperado) => {
    expect(computeMatchPoints(p1, p2, a1, a2)).toBe(esperado)
  })

  it("usa el marcador del 120', no penales (input es el 120')", () => {
    expect(computeMatchPoints(1, 1, 1, 1)).toBe(6)
  })
})

describe('computeGroupPredictionPoints — bono no lineal por aciertos exactos', () => {
  const real: [number, number, number, number] = [1, 2, 3, 4] // posiciones 1→4

  const casos: [(number | null)[], number, string][] = [
    [[1, 2, 3, 4], 5, '4 aciertos = pleno'],
    [[1, 2, 4, 3], 2, '2 aciertos'],
    [[1, 3, 2, 4], 2, '2 aciertos (otros dos)'],
    [[1, 3, 4, 2], 1, '1 acierto'],
    [[2, 1, 4, 3], 0, '0 aciertos exactos'],
    [[4, 3, 2, 1], 0, 'todo invertido'],
  ]

  it.each(casos)('%# %j → %i (%s)', (pred, esperado) => {
    expect(computeGroupPredictionPoints(pred as [number | null, number | null, number | null, number | null], real)).toBe(esperado)
  })

  it('3 aciertos es imposible y nunca debe puntuar como 3', () => {
    // Si 3 coinciden, el 4to coincide por descarte → en la práctica son 4.
    // Forzamos un input "3 aciertos" inválido (99 no está en real) y confirmamos
    // que la función no premia el caso (cae en el default → 0).
    const pred: [number | null, number | null, number | null, number | null] = [1, 2, 3, 99]
    expect(computeGroupPredictionPoints(pred, real)).toBe(0)
  })

  it('un lugar sin pronosticar (null) nunca cuenta como acierto', () => {
    const pred: [number | null, number | null, number | null, number | null] = [null, 2, 3, 99]
    expect(computeGroupPredictionPoints(pred, real)).toBe(2) // posiciones 2 y 3 correctas → 2 aciertos exactos
  })

  it('hoja vacía (todo null) → 0 puntos', () => {
    const pred: [number | null, number | null, number | null, number | null] = [null, null, null, null]
    expect(computeGroupPredictionPoints(pred, real)).toBe(0)
  })
})

describe('computeSpecialPoints', () => {
  describe('podio — posiciones independientes, se suman', () => {
    // real: oro=1 (ARG), plata=2 (FRA), bronce=3 (BRA)
    const actual = {
      goldTeamId: 1, silverTeamId: 2, bronzeTeamId: 3,
      goldenBootPlayerId: null, mvpPlayerId: null,
    }
    const base = { golden_boot_player_id: null, mvp_player_id: null }

    const casos: [number | null, number | null, number | null, number, string][] = [
      [1, 2, 3, 15, 'pleno 7+5+3'],
      [1, 99, 99, 7, 'solo oro'],
      [99, 2, 99, 5, 'solo plata'],
      [99, 99, 3, 3, 'solo bronce'],
      [1, 99, 3, 10, 'oro + bronce'],
      [2, 1, 3, 3, 'oro/plata cruzados, no cuentan'],
      [99, 99, 99, 0, 'nada'],
    ]

    it.each(casos)('%# oro=%s plata=%s bronce=%s → %i (%s)', (gold, silver, bronze, esperado) => {
      const pred = { ...base, gold_team_id: gold, silver_team_id: silver, bronze_team_id: bronze }
      expect(computeSpecialPoints(pred, actual)).toBe(esperado)
    })
  })

  describe('bota de oro / MVP — acierto único, 6 pts', () => {
    const podiumNull = {
      gold_team_id: null, silver_team_id: null, bronze_team_id: null,
    }
    const actualPodiumNull = {
      goldTeamId: null, silverTeamId: null, bronzeTeamId: null,
    }

    it('bota de oro acertada → 6', () => {
      const pred = { ...podiumNull, golden_boot_player_id: 10, mvp_player_id: null }
      const actual = { ...actualPodiumNull, goldenBootPlayerId: 10, mvpPlayerId: null }
      expect(computeSpecialPoints(pred, actual)).toBe(6)
    })

    it('bota de oro fallada → 0', () => {
      const pred = { ...podiumNull, golden_boot_player_id: 10, mvp_player_id: null }
      const actual = { ...actualPodiumNull, goldenBootPlayerId: 11, mvpPlayerId: null }
      expect(computeSpecialPoints(pred, actual)).toBe(0)
    })

    it('MVP acertado → 6', () => {
      const pred = { ...podiumNull, golden_boot_player_id: null, mvp_player_id: 10 }
      const actual = { ...actualPodiumNull, goldenBootPlayerId: null, mvpPlayerId: 10 }
      expect(computeSpecialPoints(pred, actual)).toBe(6)
    })

    it('MVP fallado → 0', () => {
      const pred = { ...podiumNull, golden_boot_player_id: null, mvp_player_id: 10 }
      const actual = { ...actualPodiumNull, goldenBootPlayerId: null, mvpPlayerId: 11 }
      expect(computeSpecialPoints(pred, actual)).toBe(0)
    })
  })
})
