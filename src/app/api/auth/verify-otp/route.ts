import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// next.config.ts fija basePath: '/quiniela'. NextResponse.redirect() en un
// route handler NO antepone el basePath automáticamente (a diferencia de
// redirects desde proxy.ts), y request.nextUrl.basePath llega vacío aquí —
// hay que prefijarlo a mano o el redirect cae fuera de /quiniela y da 404.
const BASE_PATH = '/quiniela'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const email    = (formData.get('email') as string) ?? ''
  const token    = (formData.get('token') as string) ?? ''
  const nextPath = (formData.get('next')  as string) || '/'

  const pending: { name: string; value: string; options: Record<string, unknown> }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => { pending.push(...list) },
      },
    }
  )

  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })

  if (error) {
    const url = request.nextUrl.clone()
    url.pathname = BASE_PATH + '/login'
    const params = new URLSearchParams({ otp_error: '1', email })
    if (nextPath !== '/') params.set('next', nextPath)
    url.search = params.toString()
    return NextResponse.redirect(url, { status: 303 })
  }

  const url = request.nextUrl.clone()
  url.pathname = BASE_PATH + nextPath
  url.search = ''
  const resp = NextResponse.redirect(url, { status: 303 })
  pending.forEach(({ name, value, options }) =>
    resp.cookies.set(name, value, options as Parameters<typeof resp.cookies.set>[2])
  )
  return resp
}
