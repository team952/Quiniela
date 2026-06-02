import type { Metadata } from 'next'
import { LoginForm } from './form'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams
  const next = typeof params.next === 'string' ? params.next : ''
  const isCreatorFlow = next.startsWith('/campeonato')

  return {
    title: 'Iniciar sesión — Quiniela Mundial 2026',
    ...(isCreatorFlow ? {} : {
      openGraph: {
        images: [{ url: `${SITE_URL}/og-quiniela.jpg`, width: 1200, height: 630 }],
      },
      twitter: {
        card: 'summary_large_image' as const,
        images: [`${SITE_URL}/og-quiniela.jpg`],
      },
    }),
  }
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams
  const next = typeof params.next === 'string' ? params.next : undefined
  return <LoginForm next={next} />
}
