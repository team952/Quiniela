'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type MagicLinkState = {
  error?: string
  success?: boolean
  email?: string
} | null

export async function sendMagicLink(
  _prevState: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const email = (formData.get('email') as string)?.trim().toLowerCase()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Ingresa un email válido.' }
  }

  const supabase = await createClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true, email }
}

export type VerifyOtpState = { error: string } | null

export async function verifyOtpAction(
  _prev: VerifyOtpState,
  formData: FormData,
): Promise<VerifyOtpState> {
  const email = (formData.get('email') as string) ?? ''
  const token = (formData.get('token') as string) ?? ''
  const next  = (formData.get('next')  as string) || '/'

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })

  if (error) return { error: 'Código inválido o expirado. Inténtalo de nuevo.' }

  redirect(next)
}
