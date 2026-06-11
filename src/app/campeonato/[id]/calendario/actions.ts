'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { isMatchLocked, isModuleLocked, CLASSIFICATION_LOCK, PODIUM_BOOT_MVP_LOCK } from '@/lib/constants'

function makeAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function savePrediction(
  championshipId: string,
  matchId: number,
  score1: number,
  score2: number,
): Promise<{ error?: string }> {
  // 1. Verificar sesión y obtener user_id del usuario real
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado.' }

  // 2. Verificar que el partido existe y no está bloqueado (service role — RLS bloquea)
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: match, error: matchErr } = await admin
    .from('matches')
    .select('kickoff_utc, phase')
    .eq('id', matchId)
    .single()

  if (matchErr || !match) return { error: 'Partido no encontrado.' }
  if (isMatchLocked(match.kickoff_utc as string | null)) return { error: 'Este partido ya está bloqueado.' }

  // 3. Upsert con service role — user_id viene del servidor (nunca del cliente)
  const { error } = await admin.from('predictions').upsert(
    {
      championship_id: championshipId,
      user_id: user.id,   // siempre el usuario autenticado
      match_id: matchId,
      score1,
      score2,
    },
    { onConflict: 'championship_id,user_id,match_id' },
  )

  if (error) return { error: error.message }
  return {}
}

// ── Copiar pronósticos ────────────────────────────────────────────────────────
//
// Copia la "hoja" completa de pronósticos de otro campeonato del usuario:
// resultados de partidos, clasificación por grupo y especiales (podio, bota
// de oro, MVP) — cada bloque se copia solo si el módulo está activo en el
// campeonato de destino y su cierre correspondiente no ha pasado.

export async function copyPredictions(
  sourceChampionshipId: string,
  targetChampionshipId: string,
): Promise<{
  copiedMatches: number
  skippedMatches: number
  copiedGroups: number
  copiedSpecials: boolean
  predictions: { matchId: number; score1: number; score2: number }[]
  error?: string
}> {
  const empty = { copiedMatches: 0, skippedMatches: 0, copiedGroups: 0, copiedSpecials: false, predictions: [] }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ...empty, error: 'No autenticado.' }

  const admin = makeAdmin()

  // Verificar membresía en ambos campeonatos
  const [{ data: srcMember }, { data: dstMember }] = await Promise.all([
    supabase.from('championship_users').select('championship_id')
      .eq('championship_id', sourceChampionshipId).eq('user_id', user.id).maybeSingle(),
    supabase.from('championship_users').select('championship_id')
      .eq('championship_id', targetChampionshipId).eq('user_id', user.id).maybeSingle(),
  ])
  if (!srcMember) return { ...empty, error: 'No eres miembro del campeonato de origen.' }
  if (!dstMember)  return { ...empty, error: 'No eres miembro del campeonato de destino.' }

  // Módulos activos del campeonato de destino
  const { data: targetChamp } = await admin
    .from('championships')
    .select('mod_group_standings, mod_podium, mod_golden_boot, mod_mvp')
    .eq('id', targetChampionshipId)
    .single()

  // ── 1. Resultados de partidos ─────────────────────────────────────────────
  const { data: sourcePreds } = await admin
    .from('predictions')
    .select('match_id, score1, score2')
    .eq('championship_id', sourceChampionshipId)
    .eq('user_id', user.id)
    .not('score1', 'is', null)
    .not('score2', 'is', null)

  let copiedMatches = 0
  let skippedMatches = 0
  let copiedPreds: { matchId: number; score1: number; score2: number }[] = []

  if (sourcePreds?.length) {
    const matchIds = sourcePreds.map(p => p.match_id as number)
    const { data: matchRows } = await admin
      .from('matches').select('id, kickoff_utc').in('id', matchIds)

    const kickoffMap = new Map<number, string | null>(
      (matchRows ?? []).map(m => [m.id as number, m.kickoff_utc as string | null]),
    )

    const toInsert: { match_id: number; score1: number; score2: number }[] = []

    for (const p of sourcePreds) {
      const kickoff = kickoffMap.get(p.match_id as number)
      if (kickoff === undefined || isMatchLocked(kickoff)) { skippedMatches++; continue }
      toInsert.push({ match_id: p.match_id as number, score1: p.score1 as number, score2: p.score2 as number })
    }

    if (toInsert.length > 0) {
      const { error: insertErr } = await admin.from('predictions').upsert(
        toInsert.map(p => ({
          championship_id: targetChampionshipId,
          user_id: user.id,
          match_id: p.match_id,
          score1: p.score1,
          score2: p.score2,
        })),
        { onConflict: 'championship_id,user_id,match_id' },
      )
      if (!insertErr) {
        copiedMatches = toInsert.length
        copiedPreds = toInsert.map(p => ({ matchId: p.match_id, score1: p.score1, score2: p.score2 }))
      }
    }
  }

  // ── 2. Clasificación por grupo ────────────────────────────────────────────
  let copiedGroups = 0

  if (targetChamp?.mod_group_standings && !isModuleLocked(CLASSIFICATION_LOCK)) {
    const { data: sourceGroups } = await admin
      .from('group_predictions')
      .select('group_id, first_place, second_place, third_place, fourth_place')
      .eq('championship_id', sourceChampionshipId)
      .eq('user_id', user.id)

    const groupRows = (sourceGroups ?? []).filter(g =>
      g.first_place != null || g.second_place != null || g.third_place != null || g.fourth_place != null
    )

    if (groupRows.length > 0) {
      const { error: groupErr } = await admin.from('group_predictions').upsert(
        groupRows.map(g => ({
          championship_id: targetChampionshipId,
          user_id: user.id,
          group_id: g.group_id,
          first_place: g.first_place,
          second_place: g.second_place,
          third_place: g.third_place,
          fourth_place: g.fourth_place,
        })),
        { onConflict: 'championship_id,user_id,group_id' },
      )
      if (!groupErr) copiedGroups = groupRows.length
    }
  }

  // ── 3. Especiales (podio, bota de oro, MVP) ───────────────────────────────
  let copiedSpecials = false

  if (!isModuleLocked(PODIUM_BOOT_MVP_LOCK) && (targetChamp?.mod_podium || targetChamp?.mod_golden_boot || targetChamp?.mod_mvp)) {
    const { data: sourceSpecial } = await admin
      .from('special_predictions')
      .select('gold_team_id, silver_team_id, bronze_team_id, golden_boot_player_id, mvp_player_id')
      .eq('championship_id', sourceChampionshipId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (sourceSpecial) {
      const row: Record<string, unknown> = { championship_id: targetChampionshipId, user_id: user.id }
      if (targetChamp?.mod_podium) {
        row.gold_team_id = sourceSpecial.gold_team_id
        row.silver_team_id = sourceSpecial.silver_team_id
        row.bronze_team_id = sourceSpecial.bronze_team_id
      }
      if (targetChamp?.mod_golden_boot) row.golden_boot_player_id = sourceSpecial.golden_boot_player_id
      if (targetChamp?.mod_mvp) row.mvp_player_id = sourceSpecial.mvp_player_id

      const hasData = Object.entries(row).some(([k, v]) => k !== 'championship_id' && k !== 'user_id' && v != null)
      if (hasData) {
        const { error: specErr } = await admin.from('special_predictions').upsert(
          row, { onConflict: 'championship_id,user_id' },
        )
        if (!specErr) copiedSpecials = true
      }
    }
  }

  if (copiedMatches === 0 && copiedGroups === 0 && !copiedSpecials) {
    return { ...empty, skippedMatches, error: 'No hay nada disponible para copiar de ese campeonato.' }
  }

  return {
    copiedMatches,
    skippedMatches,
    copiedGroups,
    copiedSpecials,
    predictions: copiedPreds,
  }
}
