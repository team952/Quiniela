'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { isMatchLocked } from '@/lib/constants'

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

export async function copyPredictions(
  sourceChampionshipId: string,
  targetChampionshipId: string,
): Promise<{
  copied: number
  skipped: number
  predictions: { matchId: number; score1: number; score2: number }[]
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { copied: 0, skipped: 0, predictions: [], error: 'No autenticado.' }

  const admin = makeAdmin()

  // Verificar membresía en ambos campeonatos
  const [{ data: srcMember }, { data: dstMember }] = await Promise.all([
    supabase.from('championship_users').select('championship_id')
      .eq('championship_id', sourceChampionshipId).eq('user_id', user.id).maybeSingle(),
    supabase.from('championship_users').select('championship_id')
      .eq('championship_id', targetChampionshipId).eq('user_id', user.id).maybeSingle(),
  ])
  if (!srcMember) return { copied: 0, skipped: 0, predictions: [], error: 'No eres miembro del campeonato de origen.' }
  if (!dstMember)  return { copied: 0, skipped: 0, predictions: [], error: 'No eres miembro del campeonato de destino.' }

  // Pronósticos del campeonato de origen (solo los que tienen marcador)
  const { data: sourcePreds, error: srcErr } = await admin
    .from('predictions')
    .select('match_id, score1, score2')
    .eq('championship_id', sourceChampionshipId)
    .eq('user_id', user.id)
    .not('score1', 'is', null)
    .not('score2', 'is', null)

  if (srcErr || !sourcePreds?.length) {
    return { copied: 0, skipped: 0, predictions: [], error: 'No hay pronósticos guardados en ese campeonato.' }
  }

  // Fechas de esos partidos para verificar bloqueo
  const matchIds = sourcePreds.map(p => p.match_id as number)
  const { data: matchRows } = await admin
    .from('matches').select('id, kickoff_utc').in('id', matchIds)

  const kickoffMap = new Map<number, string | null>(
    (matchRows ?? []).map(m => [m.id as number, m.kickoff_utc as string | null]),
  )

  const toInsert: { match_id: number; score1: number; score2: number }[] = []
  let skipped = 0

  for (const p of sourcePreds) {
    const kickoff = kickoffMap.get(p.match_id as number)
    if (kickoff === undefined || isMatchLocked(kickoff)) { skipped++; continue }
    toInsert.push({ match_id: p.match_id as number, score1: p.score1 as number, score2: p.score2 as number })
  }

  if (toInsert.length === 0) {
    return { copied: 0, skipped, predictions: [], error: 'Todos los partidos disponibles ya están bloqueados.' }
  }

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

  if (insertErr) return { copied: 0, skipped, predictions: [], error: insertErr.message }

  return {
    copied: toInsert.length,
    skipped,
    predictions: toInsert.map(p => ({ matchId: p.match_id, score1: p.score1, score2: p.score2 })),
  }
}
