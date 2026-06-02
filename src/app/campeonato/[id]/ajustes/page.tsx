import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { AjustesForm, type ChampionshipData } from './form'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('championships')
    .select('name')
    .eq('id', id)
    .single()
  return { title: data ? `${data.name} — Ajustes` : 'Ajustes del campeonato' }
}

export default async function AjustesPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Service role para leer datos globales (RLS bloquea al usuario en algunas tablas)
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: championship, error } = await admin
    .from('championships')
    .select('id, name, invite_code, display_timezone, mod_knockout_matches, mod_group_standings, mod_podium, mod_golden_boot, mod_mvp, created_by')
    .eq('id', id)
    .single()

  console.log('[ajustes] user.id:', user.id)
  console.log('[ajustes] championship:', championship?.id, 'created_by:', championship?.created_by)
  console.log('[ajustes] error:', error?.message)

  if (error || !championship) notFound()
  if (championship.created_by !== user.id) notFound()

  const todayET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
  const { count: openKnockoutCount } = await admin
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .neq('phase', 'group')
    .gte('date', todayET)

  const hasOpenKnockoutMatches = (openKnockoutCount ?? 0) > 0

  return (
    <main style={pageStyle}>
      <div style={glowStyle} aria-hidden />

      <header style={heroStyle}>
        <h1 style={titleStyle}>¡LA QUINIELA!</h1>
        <p style={subtitleStyle}>MUNDIAL 2026</p>
      </header>

      <AjustesForm
        championship={championship as ChampionshipData}
        hasOpenKnockoutMatches={hasOpenKnockoutMatches}
      />
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
