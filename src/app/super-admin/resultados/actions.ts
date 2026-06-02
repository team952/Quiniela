'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { processMatchResult, type EngineResult } from '@/lib/scoring/engine'

export type SaveResultState = {
  result?: EngineResult
  error?: string
} | null

export type AssignTeamsState = { error?: string; ok?: boolean } | null

/** Verifica super admin y llama al motor de puntuación con service-role key. */
export async function saveMatchResult(
  _prev: SaveResultState,
  formData: FormData,
): Promise<SaveResultState> {
  // ── Verificar super admin server-side ──────────────────────────────────────
  const supabaseUser = await createServerClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return { error: 'No autenticado.' }

  const SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID
  if (!SUPER_ADMIN_ID || user.id !== SUPER_ADMIN_ID) {
    return { error: 'Acceso denegado.' }
  }

  // ── Parsear inputs ─────────────────────────────────────────────────────────
  const matchId = parseInt(formData.get('match_id') as string, 10)
  const score1  = parseInt(formData.get('score1')   as string, 10)
  const score2  = parseInt(formData.get('score2')   as string, 10)
  const p1Raw   = formData.get('penalty1') as string
  const p2Raw   = formData.get('penalty2') as string
  const penalty1 = p1Raw !== '' && p1Raw !== null ? parseInt(p1Raw, 10) : null
  const penalty2 = p2Raw !== '' && p2Raw !== null ? parseInt(p2Raw, 10) : null

  if (isNaN(matchId) || isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
    return { error: 'Marcador inválido.' }
  }

  // ── Usar service role key (salta RLS) para escribir ───────────────────────
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const result = await processMatchResult(adminSupabase, {
    matchId, score1, score2, penalty1, penalty2,
  })

  return { result }
}

/** Asigna equipos (team1_id / team2_id) a un partido de eliminatoria. */
export async function assignMatchTeams(
  _prev: AssignTeamsState,
  formData: FormData,
): Promise<AssignTeamsState> {
  const supabaseUser = await createServerClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return { error: 'No autenticado.' }

  const SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID
  if (!SUPER_ADMIN_ID || user.id !== SUPER_ADMIN_ID) {
    return { error: 'Acceso denegado.' }
  }

  const matchId  = parseInt(formData.get('match_id') as string, 10)
  const t1Raw    = formData.get('team1_id') as string
  const t2Raw    = formData.get('team2_id') as string
  const team1_id = t1Raw ? parseInt(t1Raw, 10) : null
  const team2_id = t2Raw ? parseInt(t2Raw, 10) : null

  if (isNaN(matchId)) return { error: 'ID de partido inválido.' }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { error } = await adminSupabase
    .from('matches')
    .update({ team1_id, team2_id })
    .eq('id', matchId)

  if (error) return { error: error.message }
  return { ok: true }
}
