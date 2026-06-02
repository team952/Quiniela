'use client'

import { useActionState, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CLASSIFICATION_LOCK,
  PODIUM_BOOT_MVP_LOCK,
  formatLockDate,
  isModuleLocked,
} from '@/lib/constants'
import { updateChampionship, type UpdateChampionshipState } from './actions'

export type ChampionshipData = {
  id: string
  name: string
  invite_code: string
  display_timezone: string
  mod_knockout_matches: boolean
  mod_group_standings: boolean
  mod_podium: boolean
  mod_golden_boot: boolean
  mod_mvp: boolean
}

const TIMEZONES = [
  { value: 'America/New_York', label: 'ET — Miami / New York (UTC-5/4)' },
  { value: 'America/Chicago', label: 'CT — Chicago / Monterrey (UTC-6/5)' },
  { value: 'America/Denver', label: 'MT — Denver (UTC-7/6)' },
  { value: 'America/Los_Angeles', label: 'PT — Los Ángeles (UTC-8/7)' },
  { value: 'America/Mexico_City', label: 'México Centro (UTC-6/5)' },
  { value: 'America/Bogota', label: 'Colombia / Ecuador / Perú (UTC-5)' },
  { value: 'America/Caracas', label: 'Venezuela (UTC-4)' },
  { value: 'America/Santiago', label: 'Chile (UTC-4/3)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (UTC-3)' },
  { value: 'America/Sao_Paulo', label: 'Brasil (UTC-3)' },
  { value: 'Europe/Madrid', label: 'España (UTC+1/2)' },
  { value: 'UTC', label: 'UTC' },
]

const OPTIONAL_MODULES = [
  {
    key: 'mod_knockout_matches' as const,
    label: 'Resultados fase eliminatoria',
    desc: 'Pronostica el marcador de cada partido desde la ronda de 32. Cada partido cierra a las 00:00 ET de su día.',
    lock: null as Date | null,
    rollingLockLabel: 'Cierre: 00:00 ET del día de cada partido',
    rollingBlockedLabel: '⛔ Se desbloquea al conocer los clasificados',
  },
  {
    key: 'mod_group_standings' as const,
    label: 'Clasificación por grupo',
    desc: 'Pronostica las 4 posiciones de cada grupo en orden (1ro, 2do, 3ro y 4to).',
    lock: CLASSIFICATION_LOCK as Date | null,
    rollingLockLabel: '',
    rollingBlockedLabel: '',
  },
  {
    key: 'mod_podium' as const,
    label: 'Podio (oro / plata / bronce)',
    desc: 'Pronostica los tres finalistas del torneo.',
    lock: PODIUM_BOOT_MVP_LOCK as Date | null,
    rollingLockLabel: '',
    rollingBlockedLabel: '',
  },
  {
    key: 'mod_golden_boot' as const,
    label: 'Bota de oro',
    desc: 'Pronostica al máximo goleador.',
    lock: PODIUM_BOOT_MVP_LOCK as Date | null,
    rollingLockLabel: '',
    rollingBlockedLabel: '',
  },
  {
    key: 'mod_mvp' as const,
    label: 'MVP del torneo',
    desc: 'Pronostica al mejor jugador.',
    lock: PODIUM_BOOT_MVP_LOCK as Date | null,
    rollingLockLabel: '',
    rollingBlockedLabel: '',
  },
]

type ModKey = (typeof OPTIONAL_MODULES)[number]['key']

export function AjustesForm({
  championship,
  hasOpenKnockoutMatches,
}: {
  championship: ChampionshipData
  hasOpenKnockoutMatches: boolean
}) {
  const boundAction = updateChampionship.bind(null, championship.id)
  const [state, formAction, isPending] = useActionState<UpdateChampionshipState, FormData>(
    boundAction,
    null,
  )

  const router = useRouter()

  // Al guardar con éxito: invalida el router cache y vuelve al campeonato
  // para que el Server Component re-ejecute la query y los módulos actualizados
  // se reflejen inmediatamente en la pestaña Especiales.
  useEffect(() => {
    if (state?.success) {
      router.refresh()
      router.push(`/campeonato/${championship.id}`)
    }
  }, [state?.success, championship.id, router])

  const [mods, setMods] = useState<Record<ModKey, boolean>>({
    mod_knockout_matches: championship.mod_knockout_matches,
    mod_group_standings: championship.mod_group_standings,
    mod_podium: championship.mod_podium,
    mod_golden_boot: championship.mod_golden_boot,
    mod_mvp: championship.mod_mvp,
  })
  const [copied, setCopied] = useState(false)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const inviteUrl = `${siteUrl}/unirse?code=${championship.invite_code}`

  function toggleMod(key: ModKey, cantActivate: boolean) {
    if (cantActivate) return
    setMods((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <p style={s.cardHeading}>Ajustes del campeonato</p>
        <Link href={`/campeonato/${championship.id}`} style={s.backLink}>← Volver al campeonato</Link>
      </div>

      <div style={s.inviteBlock}>
        <p style={s.inviteLabel}>LINK DE INVITACIÓN</p>
        <div style={s.inviteRow}>
          <span style={s.inviteUrl}>{inviteUrl}</span>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(inviteUrl)
              setCopied(true)
              setTimeout(() => setCopied(false), 2500)
            }}
            style={copied ? s.copyBtnDone : s.copyBtn}
          >
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
        </div>
      </div>

      <form action={formAction} style={s.form} noValidate>
        {OPTIONAL_MODULES.map((m) => (
          <input key={m.key} type="hidden" name={m.key} value={mods[m.key] ? '1' : '0'} />
        ))}

        <Field label="Nombre del campeonato *">
          <TextInput name="name" defaultValue={championship.name} placeholder="Nombre del campeonato" />
        </Field>

        <Field label="Zona horaria de visualización">
          <select name="display_timezone" defaultValue={championship.display_timezone} style={s.select}>
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </Field>

        <div style={s.modulesSection}>
          <p style={s.sectionLabel}>Módulos activos</p>

          <ModuleRow
            label="Resultados fase de grupos"
            desc="Pronostica el marcador de los 72 partidos de la fase de grupos. Cada partido cierra a las 00:00 ET de su día."
            lockLine="Siempre activo"
            checked
            disabled
            always
          />

          <div style={s.divider} />

          {OPTIONAL_MODULES.map((m) => {
            const checked = mods[m.key]
            let cantActivate: boolean
            let lockLine: string

            if (m.lock === null) {
              cantActivate = !hasOpenKnockoutMatches && !checked
              lockLine = cantActivate ? m.rollingBlockedLabel : m.rollingLockLabel
            } else {
              const expired = isModuleLocked(m.lock)
              cantActivate = expired && !checked
              lockLine = cantActivate ? '⛔ Cierre vencido' : `Cierra ${formatLockDate(m.lock)}`
            }

            return (
              <ModuleRow
                key={m.key}
                label={m.label}
                desc={m.desc}
                lockLine={lockLine}
                checked={checked}
                disabled={cantActivate}
                lockLineRed={cantActivate}
                onClick={() => toggleMod(m.key, cantActivate)}
              />
            )
          })}
        </div>

        {state?.error && <ErrorMsg>{state.error}</ErrorMsg>}
        {state?.success && (
          <p style={s.successMsg}>
            <span aria-hidden>✓</span> Cambios guardados correctamente.
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          style={isPending ? { ...s.btn, ...s.btnDisabled } : s.btn}
        >
          {isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}

// ── Atoms ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={s.fieldWrapper}>
      <label style={s.label}>{label}</label>
      {children}
    </div>
  )
}

function TextInput({ name, defaultValue, placeholder }: { name: string; defaultValue?: string; placeholder: string }) {
  return (
    <input
      name={name}
      type="text"
      defaultValue={defaultValue}
      placeholder={placeholder}
      style={s.input}
      onFocus={(e) => { e.currentTarget.style.borderColor = '#f7c948'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(247,201,72,0.18)' }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.boxShadow = 'none' }}
    />
  )
}

function ModuleRow({
  label, desc, lockLine, checked, disabled, always, lockLineRed, onClick,
}: {
  label: string; desc: string; lockLine: string
  checked: boolean; disabled: boolean
  always?: boolean; lockLineRed?: boolean
  onClick?: () => void
}) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onClick={onClick && !disabled ? onClick : undefined}
      onKeyDown={onClick && !disabled ? (e) => { if (e.key === ' ' || e.key === 'Enter') onClick() } : undefined}
      style={{ ...s.moduleRow, cursor: onClick && !disabled ? 'pointer' : 'default', opacity: disabled ? 0.45 : 1 }}
    >
      <div
        style={{
          ...s.checkbox,
          borderColor: checked ? '#f7c948' : always ? '#3b9ae1' : 'rgba(255,255,255,0.2)',
          background: checked || always ? (always ? 'rgba(59,154,225,0.15)' : 'rgba(247,201,72,0.12)') : '#070c18',
        }}
        aria-hidden
      >
        {checked && !always && <CheckIcon color="#f7c948" />}
        {always && <CheckIcon color="#3b9ae1" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' as const }}>
          <span style={s.moduleLabel}>{label}</span>
          {always && <span style={s.alwaysBadge}>SIEMPRE</span>}
        </div>
        <p style={s.moduleDesc}>{desc}</p>
        <p style={lockLineRed ? { ...s.lockDate, color: '#e8434f' } : s.lockDate}>{lockLine}</p>
      </div>
    </div>
  )
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden>
      <path d="M1 4.5L4 7.5L10 1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" style={s.errorMsg}>
      <span style={{ fontSize: '0.5rem', flexShrink: 0 }} aria-hidden>●</span>
      {children}
    </p>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = {
  card: { position: 'relative' as const, zIndex: 1, width: '100%', maxWidth: '480px', background: 'linear-gradient(180deg, #11233f 0%, #0d1b32 100%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '2rem', display: 'flex', flexDirection: 'column' as const, gap: '1.25rem', boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,154,225,0.08)' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' },
  cardHeading: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 700, fontSize: '0.9rem', letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: '#93a6c6', margin: 0 },
  backLink: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 600, fontSize: '0.75rem', color: '#5f7196', textDecoration: 'none', flexShrink: 0 },
  inviteBlock: { background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '0.875rem 1rem' },
  inviteLabel: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 800, fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#5f7196', margin: '0 0 0.4rem' },
  inviteRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  inviteUrl: { fontFamily: 'var(--font-geist-mono), monospace', fontSize: '0.75rem', color: '#93a6c6', wordBreak: 'break-all' as const, flex: 1, minWidth: 0 },
  copyBtn: { background: 'rgba(59,154,225,0.12)', border: '1px solid rgba(59,154,225,0.3)', borderRadius: '7px', padding: '0.35rem 0.625rem', fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 700, fontSize: '0.75rem', color: '#3b9ae1', cursor: 'pointer', flexShrink: 0 },
  copyBtnDone: { background: 'rgba(247,201,72,0.12)', border: '1px solid rgba(247,201,72,0.3)', borderRadius: '7px', padding: '0.35rem 0.625rem', fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 700, fontSize: '0.75rem', color: '#f7c948', cursor: 'default', flexShrink: 0 },
  form: { display: 'flex', flexDirection: 'column' as const, gap: '1rem' },
  fieldWrapper: { display: 'flex', flexDirection: 'column' as const, gap: '0.4rem' },
  label: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#5f7196' },
  input: { width: '100%', background: '#070c18', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '0.75rem 0.875rem', fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 500, fontSize: '0.9375rem', color: '#eef4fb', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s', caretColor: '#f7c948', boxSizing: 'border-box' as const },
  select: { width: '100%', background: '#070c18', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '0.75rem 0.875rem', fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 500, fontSize: '0.875rem', color: '#eef4fb', outline: 'none', appearance: 'none' as const, cursor: 'pointer', boxSizing: 'border-box' as const, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%235f7196' stroke-width='1.5' stroke-linecap='round' fill='none'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.875rem center', paddingRight: '2.25rem' },
  modulesSection: { display: 'flex', flexDirection: 'column' as const, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', overflow: 'hidden' },
  sectionLabel: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 800, fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#5f7196', margin: 0, padding: '0.75rem 1rem 0.5rem' },
  divider: { height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0.25rem 0' },
  moduleRow: { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 1rem', transition: 'background 0.12s' },
  checkbox: { width: 20, height: 20, borderRadius: 5, border: '1.5px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, transition: 'border-color 0.15s, background 0.15s' },
  moduleLabel: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 700, fontSize: '0.875rem', color: '#eef4fb' },
  moduleDesc: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 400, fontSize: '0.75rem', color: '#93a6c6', margin: '0.15rem 0 0.2rem', lineHeight: 1.4 },
  lockDate: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.03em', color: '#5f7196', margin: 0 },
  alwaysBadge: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 800, fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#3b9ae1', background: 'rgba(59,154,225,0.12)', border: '1px solid rgba(59,154,225,0.3)', borderRadius: '4px', padding: '1px 6px' },
  btn: { padding: '0.875rem 1.5rem', background: 'linear-gradient(180deg, #fbd75f 0%, #e7af2e 100%)', color: '#2a1d00', fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 800, fontSize: '0.8125rem', letterSpacing: '0.04em', textTransform: 'uppercase' as const, border: 'none', borderRadius: '10px', cursor: 'pointer', boxShadow: '0 6px 18px rgba(247,201,72,0.28)' },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed', boxShadow: 'none' },
  errorMsg: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 600, fontSize: '0.8125rem', color: '#e8434f', margin: 0 },
  successMsg: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 600, fontSize: '0.8125rem', color: '#4ade80', margin: 0 },
} as const
