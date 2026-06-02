import type { Metadata } from 'next'
import { LoginForm } from './form'

export const metadata: Metadata = { title: 'Iniciar sesión — Quiniela Mundial 2026' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams
  const next = typeof params.next === 'string' ? params.next : undefined
  return <LoginForm next={next} />
}
