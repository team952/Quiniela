'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { isModuleLocked, CLASSIFICATION_LOCK, PODIUM_BOOT_MVP_LOCK } from '@/lib/constants'

function makeAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export async function saveGroupPrediction(
  championshipId: string,
  groupId: number,
  firstPlace: number | null,
  secondPlace: number | null,
  thirdPlace: number | null,
  fourthPlace: number | null,
): Promise<{ error?: string }> {
  if (isModuleLocked(CLASSIFICATION_LOCK)) return { error: 'Clasificación de grupos cerrada.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado.' }

  const admin = makeAdmin()
  const { error } = await admin.from('group_predictions').upsert(
    {
      championship_id: championshipId,
      user_id: user.id,
      group_id: groupId,
      first_place: firstPlace,
      second_place: secondPlace,
      third_place: thirdPlace,
      fourth_place: fourthPlace,
    },
    { onConflict: 'championship_id,user_id,group_id' },
  )

  if (error) return { error: error.message }
  return {}
}

export async function saveSpecialPrediction(
  championshipId: string,
  goldTeamId: number | null,
  silverTeamId: number | null,
  bronzeTeamId: number | null,
  goldenBootPlayerId: number | null,
  mvpPlayerId: number | null,
): Promise<{ error?: string }> {
  if (isModuleLocked(PODIUM_BOOT_MVP_LOCK)) return { error: 'Pronósticos especiales cerrados.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado.' }

  const admin = makeAdmin()
  const { error } = await admin.from('special_predictions').upsert(
    {
      championship_id: championshipId,
      user_id: user.id,
      gold_team_id: goldTeamId,
      silver_team_id: silverTeamId,
      bronze_team_id: bronzeTeamId,
      golden_boot_player_id: goldenBootPlayerId,
      mvp_player_id: mvpPlayerId,
    },
    { onConflict: 'championship_id,user_id' },
  )

  if (error) return { error: error.message }
  return {}
}
