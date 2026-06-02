import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { JoinForm, type JoinChampionshipData } from './form'
import { LoginForm } from '@/app/login/form'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  title: 'Unirse al campeonato — Quiniela Mundial 2026',
  openGraph: {
    images: [{ url: `${SITE_URL}/og-quiniela.jpg`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image' as const,
    images: [`${SITE_URL}/og-quiniela.jpg`],
  },
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function QuinielaPage({ searchParams }: Props) {
  const params = await searchParams
  const code = typeof params.code === 'string' ? params.code.trim() : null

  if (!code) {
    return <InlineError title="Link inválido" body="No se proporcionó un código de invitación. Pide el link al creador del campeonato." />
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Si no está autenticado → mostrar login inline (sin HTTP redirect, para que el OG llegue al crawler)
  if (!user) {
    return <LoginForm next={`/unirse?code=${code}`} />
  }

  // Buscar el campeonato por invite_code
  const { data: championship, error: champError } = await supabase
    .from('championships')
    .select('id, name, registration_open')
    .eq('invite_code', code)
    .single()

  if (champError || !championship) {
    return (
      <InlineError
        title="Campeonato no encontrado"
        body="El link de invitación no es válido o el campeonato fue eliminado. Pide un link actualizado al organizador."
      />
    )
  }

  if (!championship.registration_open) {
    return (
      <InlineError
        title="Inscripción cerrada"
        body={`El campeonato "${championship.name}" ya no acepta nuevos participantes. Contacta al organizador si crees que es un error.`}
      />
    )
  }

  // Verificar si el usuario ya es miembro
  const { data: existingMember } = await supabase
    .from('championship_users')
    .select('display_name')
    .eq('championship_id', championship.id)
    .eq('user_id', user.id)
    .maybeSingle()

  const joinData: JoinChampionshipData = {
    id: championship.id,
    name: championship.name,
    isAlreadyMember: !!existingMember,
    currentDisplayName: existingMember?.display_name ?? undefined,
  }

  return (
    <main style={pageStyle}>
      <div style={glowStyle} aria-hidden />

      <header style={heroStyle}>
        <h1 style={titleStyle}>¡LA QUINIELA!</h1>
        <p style={subtitleStyle}>MUNDIAL 2026</p>
      </header>

      <JoinForm championship={joinData} />
    </main>
  )
}

// ── Error view (inline, no navegación) ────────────────────────────────────

function InlineError({ title, body }: { title: string; body: string }) {
  return (
    <main style={pageStyle}>
      <div style={glowStyle} aria-hidden />
      <div style={errorCard}>
        <div style={{ fontSize: '2.5rem', lineHeight: 1 }} aria-hidden>⚠️</div>
        <h1 style={errorTitle}>{title.toUpperCase()}</h1>
        <p style={errorBody}>{body}</p>
        <Link href="/" style={errorLink}>← Volver al inicio</Link>
      </div>
    </main>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem 1.25rem',
  position: 'relative',
  overflow: 'hidden',
  background: '#081225',
  gap: '1.75rem',
}

const glowStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: '50%',
  transform: 'translateX(-50%)',
  width: '700px',
  height: '340px',
  background: 'radial-gradient(ellipse at 50% 0%, rgba(59,154,225,0.22) 0%, transparent 68%)',
  pointerEvents: 'none',
}

const heroStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  position: 'relative',
  zIndex: 1,
}

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-anton), Anton, sans-serif',
  fontSize: 'clamp(1.5rem, 5vw, 2rem)',
  lineHeight: 1,
  letterSpacing: '0.02em',
  color: '#fff',
  margin: 0,
  textShadow: '0 0 30px rgba(247,201,72,0.25)',
}

const subtitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-archivo), Archivo, sans-serif',
  fontWeight: 800,
  fontSize: '0.7rem',
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: '#93a6c6',
  margin: '0.35rem 0 0',
}

const errorCard: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  width: '100%',
  maxWidth: '400px',
  background: 'linear-gradient(180deg, #11233f 0%, #0d1b32 100%)',
  border: '1px solid rgba(232,67,79,0.2)',
  borderRadius: '20px',
  padding: '2.5rem 2rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.875rem',
  textAlign: 'center',
  boxShadow: '0 0 0 1px rgba(232,67,79,0.1), 0 24px 64px rgba(0,0,0,0.5)',
}

const errorTitle: React.CSSProperties = {
  fontFamily: 'var(--font-anton), Anton, sans-serif',
  fontSize: '1.25rem',
  letterSpacing: '0.03em',
  color: '#fff',
  margin: 0,
}

const errorBody: React.CSSProperties = {
  fontFamily: 'var(--font-archivo), Archivo, sans-serif',
  fontWeight: 500,
  fontSize: '0.875rem',
  color: '#93a6c6',
  margin: 0,
  lineHeight: 1.6,
}

const errorLink: React.CSSProperties = {
  fontFamily: 'var(--font-archivo), Archivo, sans-serif',
  fontWeight: 600,
  fontSize: '0.8125rem',
  color: '#5f7196',
  textDecoration: 'none',
  marginTop: '0.25rem',
}
