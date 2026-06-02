'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Step = 'email' | 'otp'

export function LoginForm({ next }: { next?: string }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  async function sendOtp(addr: string): Promise<boolean> {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: true },
    })
    setLoading(false)
    if (error) { setError(error.message); return false }
    return true
  }

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const raw = (e.currentTarget.elements.namedItem('email') as HTMLInputElement)
      .value.trim().toLowerCase()
    if (!raw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      setError('Ingresa un email válido.')
      return
    }
    const ok = await sendOtp(raw)
    if (ok) { setEmail(raw); setStep('otp'); setCooldown(60) }
  }

  async function handleVerify(token: string) {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) {
      setLoading(false)
      setError('Código inválido o expirado. Inténtalo de nuevo.')
      return
    }
    // Redirige a `next` si viene de un invite link; de lo contrario al inicio.
    router.push(next ?? '/')
    router.refresh()
  }

  async function handleResend() {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setCooldown(60)
  }

  return (
    <main style={s.page}>
      <div style={s.glow} aria-hidden />

      <header style={s.hero}>
        <SoccerBallIcon />
        <h1 style={s.title}>¡LA QUINIELA!</h1>
        <p style={s.subtitle}>MUNDIAL 2026</p>
      </header>

      <div style={s.card}>
        {step === 'email' ? (
          <EmailStep
            loading={loading}
            error={error}
            defaultEmail={email}
            onSubmit={handleEmailSubmit}
          />
        ) : (
          <OtpStep
            email={email}
            loading={loading}
            error={error}
            cooldown={cooldown}
            onVerify={handleVerify}
            onResend={handleResend}
            onChangeEmail={() => { setStep('email'); setError('') }}
          />
        )}
      </div>
    </main>
  )
}

// ── Step 1: Email ──────────────────────────────────────────────────────────

function EmailStep({
  loading, error, defaultEmail, onSubmit,
}: {
  loading: boolean; error: string; defaultEmail: string
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <>
      <p style={s.cardHeading}>Accede con tu correo</p>
      <form onSubmit={onSubmit} noValidate style={s.form}>
        <div style={s.fieldWrapper}>
          <label htmlFor="email-input" style={s.label}>Email</label>
          <input
            id="email-input" name="email" type="email" autoComplete="email" autoFocus
            defaultValue={defaultEmail} placeholder="tu@correo.com" aria-invalid={!!error}
            style={s.input}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#f7c948'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(247,201,72,0.2)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.boxShadow = 'none' }}
          />
          {error && <ErrorMsg>{error}</ErrorMsg>}
        </div>
        <button type="submit" disabled={loading} style={loading ? { ...s.btn, ...s.btnDisabled } : s.btn}>
          {loading ? <BtnSpinner label="Enviando…" /> : 'Enviar código'}
        </button>
      </form>
      <p style={s.hint}>Sin contraseña — recibirás un código de 6 dígitos al correo.</p>
    </>
  )
}

// ── Step 2: OTP ────────────────────────────────────────────────────────────

function OtpStep({
  email, loading, error, cooldown, onVerify, onResend, onChangeEmail,
}: {
  email: string; loading: boolean; error: string; cooldown: number
  onVerify: (token: string) => void; onResend: () => void; onChangeEmail: () => void
}) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const refs = useRef<(HTMLInputElement | null)[]>([])

  function handleChange(i: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1)
    const next = [...digits]; next[i] = digit; setDigits(next)
    if (digit && i < 5) refs.current[i + 1]?.focus()
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      const next = [...digits]; next[i - 1] = ''; setDigits(next)
      refs.current[i - 1]?.focus(); e.preventDefault()
    }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!text) return
    e.preventDefault()
    const next = ['', '', '', '', '', '']; text.split('').forEach((c, i) => { next[i] = c })
    setDigits(next); refs.current[Math.min(text.length, 5)]?.focus()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const token = digits.join('')
    if (token.length < 6) return
    onVerify(token)
  }

  const isComplete = digits.every(Boolean)

  return (
    <>
      <div style={s.emailBadge}>
        <span style={s.badgeLabel}>CÓDIGO ENVIADO A</span>
        <div style={s.badgeRow}>
          <span style={s.badgeEmail}>{email}</span>
          <button type="button" onClick={onChangeEmail} style={s.linkBtn}>Cambiar</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={s.form}>
        <div style={s.fieldWrapper}>
          <label style={s.label}>Código de 6 dígitos</label>
          <div style={s.otpRow} role="group" aria-label="Código de verificación">
            {digits.map((digit, i) => (
              <input
                key={i} ref={(el) => { refs.current[i] = el }}
                type="text" inputMode="numeric" pattern="[0-9]" maxLength={1} value={digit}
                autoComplete={i === 0 ? 'one-time-code' : 'off'} autoFocus={i === 0}
                aria-label={`Dígito ${i + 1}`}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)} onPaste={handlePaste}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#f7c948'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(247,201,72,0.22)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = digit ? 'rgba(247,201,72,0.45)' : 'rgba(255,255,255,0.12)'; e.currentTarget.style.boxShadow = 'none' }}
                style={s.otpInput}
              />
            ))}
          </div>
          {error && <ErrorMsg>{error}</ErrorMsg>}
        </div>
        <button type="submit" disabled={loading || !isComplete}
          style={loading || !isComplete ? { ...s.btn, ...s.btnDisabled } : s.btn}>
          {loading ? <BtnSpinner label="Verificando…" /> : 'Verificar código'}
        </button>
      </form>

      <div style={s.resendRow}>
        <span style={s.hint}>¿No llegó?</span>
        <button type="button" disabled={cooldown > 0 || loading} onClick={onResend}
          style={cooldown > 0 || loading ? { ...s.linkBtn, ...s.linkBtnDisabled } : s.linkBtn}>
          {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar código'}
        </button>
      </div>
    </>
  )
}

// ── Atoms ──────────────────────────────────────────────────────────────────

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" style={s.errorMsg}>
      <span style={{ fontSize: '0.5rem', flexShrink: 0 }} aria-hidden>●</span>
      {children}
    </p>
  )
}

function BtnSpinner({ label }: { label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden style={{ animation: 'spin 0.8s linear infinite' }}>
        <circle cx="8" cy="8" r="6" stroke="rgba(42,29,0,0.4)" strokeWidth="2.5" />
        <path d="M8 2a6 6 0 0 1 6 6" stroke="#2a1d00" strokeWidth="2.5" strokeLinecap="round" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </svg>
      {label}
    </span>
  )
}

function SoccerBallIcon() {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden
      style={{ marginBottom: '0.75rem', filter: 'drop-shadow(0 0 18px rgba(247,201,72,0.5))' }}>
      <circle cx="26" cy="26" r="25" fill="#f7c948" stroke="#e7af2e" strokeWidth="1.5" />
      <polygon points="26,10 32,16 30,24 22,24 20,16" fill="#2a1d00" opacity="0.85" />
      <polygon points="26,42 32,36 30,28 22,28 20,36" fill="#2a1d00" opacity="0.85" />
      <polygon points="10,26 16,20 24,22 24,30 16,32" fill="#2a1d00" opacity="0.85" />
      <polygon points="42,26 36,20 28,22 28,30 36,32" fill="#2a1d00" opacity="0.85" />
    </svg>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = {
  page: { minHeight: '100dvh', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '2rem 1.25rem', position: 'relative' as const, overflow: 'hidden', background: '#081225' },
  glow: { position: 'absolute' as const, top: 0, left: '50%', transform: 'translateX(-50%)', width: '700px', height: '340px', background: 'radial-gradient(ellipse at 50% 0%, rgba(59,154,225,0.22) 0%, transparent 68%)', pointerEvents: 'none' as const },
  hero: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', marginBottom: '2rem', position: 'relative' as const, zIndex: 1 },
  title: { fontFamily: 'var(--font-anton), Anton, sans-serif', fontSize: 'clamp(2rem, 8vw, 3.25rem)', lineHeight: 1, letterSpacing: '0.02em', color: '#fff', margin: 0, textShadow: '0 0 40px rgba(247,201,72,0.3)' },
  subtitle: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.22em', textTransform: 'uppercase' as const, color: '#93a6c6', margin: '0.5rem 0 0' },
  card: { position: 'relative' as const, zIndex: 1, width: '100%', maxWidth: '420px', background: 'linear-gradient(180deg, #11233f 0%, #0d1b32 100%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '2rem', display: 'flex', flexDirection: 'column' as const, gap: '1.25rem', boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,154,225,0.08)' },
  cardHeading: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 700, fontSize: '0.9rem', letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: '#93a6c6', margin: 0 },
  form: { display: 'flex', flexDirection: 'column' as const, gap: '1rem' },
  fieldWrapper: { display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' },
  label: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#5f7196' },
  input: { width: '100%', background: '#070c18', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '0.8125rem 1rem', fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 500, fontSize: '1rem', color: '#eef4fb', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s', caretColor: '#f7c948', boxSizing: 'border-box' as const },
  otpRow: { display: 'flex', gap: '0.5rem', justifyContent: 'center' },
  otpInput: { width: '52px', height: '64px', background: '#070c18', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: '10px', fontFamily: 'var(--font-anton), Anton, sans-serif', fontSize: '26px', color: '#fff', textAlign: 'center' as const, outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s', caretColor: '#f7c948', padding: 0, boxSizing: 'border-box' as const, appearance: 'textfield' as const },
  btn: { width: '100%', padding: '0.875rem 1.5rem', background: 'linear-gradient(180deg, #fbd75f 0%, #e7af2e 100%)', color: '#2a1d00', fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 800, fontSize: '0.8125rem', letterSpacing: '0.04em', textTransform: 'uppercase' as const, border: 'none', borderRadius: '10px', cursor: 'pointer', transition: 'opacity 0.15s, box-shadow 0.15s', boxShadow: '0 6px 18px rgba(247,201,72,0.32)' },
  btnDisabled: { opacity: 0.45, cursor: 'not-allowed', boxShadow: 'none' },
  errorMsg: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 600, fontSize: '0.8125rem', color: '#e8434f', margin: 0 },
  hint: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 500, fontSize: '0.75rem', color: '#5f7196', margin: 0, lineHeight: 1.5 },
  emailBadge: { background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  badgeLabel: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 800, fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#5f7196' },
  badgeRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' },
  badgeEmail: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 600, fontSize: '0.875rem', color: '#eef4fb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, minWidth: 0 },
  resendRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' },
  linkBtn: { background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 700, fontSize: '0.75rem', color: '#3b9ae1', padding: 0, transition: 'color 0.15s', flexShrink: 0 },
  linkBtnDisabled: { color: '#5f7196', cursor: 'default' },
} as const
