'use server'

import { createClient } from '@/lib/supabase/server'
import {
  CLASSIFICATION_LOCK,
  PODIUM_BOOT_MVP_LOCK,
  isModuleLocked,
} from '@/lib/constants'

export type CreateChampionshipState = {
  error?: string
  success?: true
  championshipId?: string
  inviteCode?: string
  championshipName?: string
} | null

export async function createChampionship(
  _prevState: CreateChampionshipState,
  formData: FormData,
): Promise<CreateChampionshipState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Inicia sesión de nuevo.' }

  const name = (formData.get('name') as string)?.trim()
  const displayName = (formData.get('display_name') as string)?.trim()
  const timezone = (formData.get('display_timezone') as string) || 'America/New_York'
  const modKnockoutMatches = formData.get('mod_knockout_matches') === '1'
  const modGroupStandings = formData.get('mod_group_standings') === '1'
  const modPodium = formData.get('mod_podium') === '1'
  const modGoldenBoot = formData.get('mod_golden_boot') === '1'
  const modMvp = formData.get('mod_mvp') === '1'

  if (!name) return { error: 'El nombre del campeonato es requerido.' }
  if (!displayName) return { error: 'Tu nombre de participante es requerido.' }

  // Validar cierres fijos
  if (modGroupStandings && isModuleLocked(CLASSIFICATION_LOCK)) {
    return { error: 'El módulo de Clasificación por grupo ya cerró (11 jun 2026).' }
  }
  const podiumExpired = isModuleLocked(PODIUM_BOOT_MVP_LOCK)
  if (modPodium && podiumExpired) return { error: 'El módulo de Podio ya cerró (28 jun 2026).' }
  if (modGoldenBoot && podiumExpired) return { error: 'El módulo de Bota de oro ya cerró (28 jun 2026).' }
  if (modMvp && podiumExpired) return { error: 'El módulo de MVP ya cerró (28 jun 2026).' }

  const { data: championship, error: insertError } = await supabase
    .from('championships')
    .insert({
      name,
      created_by: user.id,
      display_timezone: timezone,
      mod_knockout_matches: modKnockoutMatches,
      mod_group_standings: modGroupStandings,
      mod_podium: modPodium,
      mod_golden_boot: modGoldenBoot,
      mod_mvp: modMvp,
    })
    .select('id, invite_code')
    .single()

  if (insertError) return { error: insertError.message }

  const { error: joinError } = await supabase.from('championship_users').insert({
    championship_id: championship.id,
    user_id: user.id,
    display_name: displayName,
  })

  if (joinError) {
    // Intento de limpieza: borrar el campeonato si no se pudo unir el creador.
    await supabase.from('championships').delete().eq('id', championship.id)
    return { error: joinError.message }
  }

  return {
    success: true,
    championshipId: championship.id,
    inviteCode: championship.invite_code,
    championshipName: name,
  }
}
