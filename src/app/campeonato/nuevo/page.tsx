import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { NuevoCampeonatoForm } from './form'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  title: 'Crear campeonato — Quiniela Mundial 2026',
  openGraph: {
    title: 'Crea tu quiniela del Mundial 2026',
    description: 'Crea un campeonato privado y compite con tus amigos.',
    images: [{ url: `${SITE_URL}/og-creator.jpg`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [`${SITE_URL}/og-creator.jpg`],
  },
}

export default async function NuevoCampeonatoPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <main style={pageStyle}>
      <div style={glowStyle} aria-hidden />

      <header style={heroStyle}>
        <h1 style={titleStyle}>¡LA QUINIELA!</h1>
        <p style={subtitleStyle}>MUNDIAL 2026</p>
      </header>

      <NuevoCampeonatoForm />
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-start',
  padding: '2.5rem 1.25rem 4rem',
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
  height: '280px',
  background: 'radial-gradient(ellipse at 50% 0%, rgba(59,154,225,0.18) 0%, transparent 70%)',
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
