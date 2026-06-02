'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type JoinState = { error?: string } | null

/**
 * Une al usuario autenticado a un campeonato.
 * Usa upsert para manejar el caso de ya-miembro (actualiza display_name).
 * `championshipId` se inyecta via .bind() desde el Client Component.
 * En caso de éxito, hace redirect al Server Component del campeonato.
 */
export async function joinChampionship(
  championshipId: string,
  _prevState: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const displayName = (formData.get('display_name') as string)?.trim()
  if (!displayName) return { error: 'Tu nombre de participante es requerido.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Inicia sesión de nuevo.' }

  const { error } = await supabase.from('championship_users').upsert(
    { championship_id: championshipId, user_id: user.id, display_name: displayName },
    { onConflict: 'championship_id,user_id' },
  )

  if (error) return { error: error.message }

  redirect(`/campeonato/${championshipId}`)
}
