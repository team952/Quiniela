'use client'

import { useActionState } from 'react'
import { joinChampionship, type JoinState } from './actions'

export type JoinChampionshipData = {
  id: string
  name: string
  currentDisplayName?: string
  isAlreadyMember: boolean
}

export function JoinForm({ championship }: { championship: JoinChampionshipData }) {
  const boundAction = joinChampionship.bind(null, championship.id)
  const [state, formAction, isPending] = useActionState<JoinState, FormData>(boundAction, null)

  const isReturning = championship.isAlreadyMember

  return (
    <div style={s.card}>
      {/* Cabecera */}
      <div style={s.inviteHeader}>
        <span style={s.inviteLabel}>
          {isReturning ? 'VUELVES A' : 'TE INVITARON A'}
        </span>
        <h1 style={s.championshipName}>{championship.name}</h1>
      </div>

      {isReturning && (
        <div style={s.returningBadge}>
          <span style={s.returningIcon} aria-hidden>✓</span>
          <span style={s.returningText}>
            Ya eres miembro de este campeonato. Puedes actualizar tu nombre si quieres.
          </span>
        </div>
      )}

      <form action={formAction} noValidate style={s.form}>
        <div style={s.fieldWrapper}>
          <label htmlFor="display-name-input" style={s.label}>
            {isReturning ? 'Tu nombre en este campeonato' : 'Elige tu nombre de participante *'}
          </label>
          <input
            id="display-name-input"
            name="display_name"
            type="text"
            autoFocus
            autoComplete="nickname"
            defaultValue={championship.currentDisplayName ?? ''}
            placeholder="Cómo aparecerás en el ranking"
            maxLength={40}
            style={s.input}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#f7c948'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(247,201,72,0.18)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
          <p style={s.hint}>
            Visible para los demás participantes. Máx. 40 caracteres.
          </p>
        </div>

        {state?.error && <ErrorMsg>{state.error}</ErrorMsg>}

        <button
          type="submit"
          disabled={isPending}
          style={isPending ? { ...s.btn, ...s.btnDisabled } : s.btn}
        >
          {isPending
            ? (isReturning ? 'Entrando…' : 'Uniéndome…')
            : (isReturning ? 'Actualizar y entrar' : 'Unirme al campeonato')}
        </button>
      </form>

      <p style={s.footNote}>
        El link de invitación puede compartirse con otros participantes.
      </p>
    </div>
  )
}

// ── Atom ────────────────────────────────────────────────────────────────────

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" style={s.errorMsg}>
      <span style={{ fontSize: '0.5rem', flexShrink: 0 }} aria-hidden>●</span>
      {children}
    </p>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = {
  card: {
    position: 'relative' as const,
    zIndex: 1,
    width: '100%',
    maxWidth: '420px',
    background: 'linear-gradient(180deg, #11233f 0%, #0d1b32 100%)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '20px',
    padding: '2rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1.25rem',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,154,225,0.08)',
  },
  inviteHeader: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
  },
  inviteLabel: {
    fontFamily: 'var(--font-archivo), Archivo, sans-serif',
    fontWeight: 800,
    fontSize: '0.65rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: '#5f7196',
  },
  championshipName: {
    fontFamily: 'var(--font-anton), Anton, sans-serif',
    fontSize: 'clamp(1.375rem, 5vw, 1.75rem)',
    lineHeight: 1.1,
    letterSpacing: '0.02em',
    color: '#fff',
    margin: 0,
    textShadow: '0 0 20px rgba(247,201,72,0.2)',
  },
  returningBadge: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.6rem',
    background: 'rgba(74,222,128,0.08)',
    border: '1px solid rgba(74,222,128,0.2)',
    borderRadius: '10px',
    padding: '0.75rem 0.875rem',
  },
  returningIcon: {
    color: '#4ade80',
    fontWeight: 700,
    fontSize: '0.875rem',
    flexShrink: 0,
    marginTop: '0.05rem',
  },
  returningText: {
    fontFamily: 'var(--font-archivo), Archivo, sans-serif',
    fontWeight: 500,
    fontSize: '0.8125rem',
    color: '#93a6c6',
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  fieldWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
  },
  label: {
    fontFamily: 'var(--font-archivo), Archivo, sans-serif',
    fontWeight: 700,
    fontSize: '0.72rem',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: '#5f7196',
  },
  input: {
    width: '100%',
    background: '#070c18',
    border: '1.5px solid rgba(255,255,255,0.12)',
    borderRadius: '10px',
    padding: '0.8125rem 1rem',
    fontFamily: 'var(--font-archivo), Archivo, sans-serif',
    fontWeight: 500,
    fontSize: '1rem',
    color: '#eef4fb',
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    caretColor: '#f7c948',
    boxSizing: 'border-box' as const,
  },
  hint: {
    fontFamily: 'var(--font-archivo), Archivo, sans-serif',
    fontWeight: 500,
    fontSize: '0.7rem',
    color: '#5f7196',
    margin: 0,
    lineHeight: 1.5,
  },
  errorMsg: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    fontFamily: 'var(--font-archivo), Archivo, sans-serif',
    fontWeight: 600,
    fontSize: '0.8125rem',
    color: '#e8434f',
    margin: 0,
  },
  btn: {
    width: '100%',
    padding: '0.875rem 1.5rem',
    background: 'linear-gradient(180deg, #fbd75f 0%, #e7af2e 100%)',
    color: '#2a1d00',
    fontFamily: 'var(--font-archivo), Archivo, sans-serif',
    fontWeight: 800,
    fontSize: '0.8125rem',
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    boxShadow: '0 6px 18px rgba(247,201,72,0.32)',
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  footNote: {
    fontFamily: 'var(--font-archivo), Archivo, sans-serif',
    fontWeight: 500,
    fontSize: '0.7rem',
    color: '#5f7196',
    margin: 0,
    textAlign: 'center' as const,
    lineHeight: 1.5,
  },
} as const
