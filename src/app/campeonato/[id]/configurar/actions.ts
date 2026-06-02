'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import {
  CLASSIFICATION_LOCK,
  PODIUM_BOOT_MVP_LOCK,
  isModuleLocked,
} from '@/lib/constants'

export type UpdateChampionshipState = {
  error?: string
  success?: true
} | null

export async function updateChampionship(
  id: string,
  _prevState: UpdateChampionshipState,
  formData: FormData,
): Promise<UpdateChampionshipState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Inicia sesión de nuevo.' }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: current, error: fetchError } = await admin
    .from('championships')
    .select('id, created_by, mod_knockout_matches, mod_group_standings, mod_podium, mod_golden_boot, mod_mvp')
    .eq('id', id)
    .single()

  if (fetchError || !current) return { error: 'Campeonato no encontrado.' }
  if (current.created_by !== user.id) return { error: 'No tienes permisos para editar este campeonato.' }

  const name = (formData.get('name') as string)?.trim()
  const timezone = (formData.get('display_timezone') as string) || 'America/New_York'
  const newModKnockoutMatches = formData.get('mod_knockout_matches') === '1'
  const newModGroupStandings = formData.get('mod_group_standings') === '1'
  const newModPodium = formData.get('mod_podium') === '1'
  const newModGoldenBoot = formData.get('mod_golden_boot') === '1'
  const newModMvp = formData.get('mod_mvp') === '1'

  if (!name) return { error: 'El nombre del campeonato es requerido.' }

  if (newModGroupStandings && !current.mod_group_standings && isModuleLocked(CLASSIFICATION_LOCK)) {
    return { error: 'El módulo de Clasificación por grupo ya cerró. No se puede activar.' }
  }
  const podiumExpired = isModuleLocked(PODIUM_BOOT_MVP_LOCK)
  if (newModPodium && !current.mod_podium && podiumExpired) {
    return { error: 'El módulo de Podio ya cerró. No se puede activar.' }
  }
  if (newModGoldenBoot && !current.mod_golden_boot && podiumExpired) {
    return { error: 'El módulo de Bota de oro ya cerró. No se puede activar.' }
  }
  if (newModMvp && !current.mod_mvp && podiumExpired) {
    return { error: 'El módulo de MVP ya cerró. No se puede activar.' }
  }

  const { error: updateError } = await admin
    .from('championships')
    .update({
      name,
      display_timezone: timezone,
      mod_knockout_matches: newModKnockoutMatches,
      mod_group_standings: newModGroupStandings,
      mod_podium: newModPodium,
      mod_golden_boot: newModGoldenBoot,
      mod_mvp: newModMvp,
    })
    .eq('id', id)
    .eq('created_by', user.id)

  if (updateError) return { error: updateError.message }

  return { success: true }
}
