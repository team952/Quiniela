'use client'

import { useActionState, useState } from 'react'
import { saveMatchResult, assignMatchTeams, type SaveResultState, type AssignTeamsState } from './actions'

// ── Tipos (vienen del Server Component) ──────────────────────────────────────

export type MatchRow = {
  id: number
  matchNum: number | null
  phase: string
  round: string | null
  date: string
  ground: string | null
  groupId: number | null
  groupName: string | null
  team1Id: number | null
  team2Id: number | null
  team1Name: string
  team2Name: string
  score1: number | null
  score2: number | null
  penalty1: number | null
  penalty2: number | null
  status: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SHORT_MON = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function fmtDate(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return `${day} ${SHORT_MON[m - 1]} ${y}`
}

const GROUP_COLORS: Record<string, string> = {
  'Group A':'#ff2d78','Group B':'#ff8a3d','Group C':'#ffd23f',
  'Group D':'#7ee787','Group E':'#19e3c0','Group F':'#3dd5ff',
  'Group G':'#5b8cff','Group H':'#7c5cff','Group I':'#c46bff',
  'Group J':'#ff5cae','Group K':'#ff6b6b','Group L':'#9bd45b',
}

// ── TeamAssignForm — asignar equipos a partido de eliminatoria ────────────────

function TeamAssignForm({ match, teams }: { match: MatchRow; teams: { id: number; name: string }[] }) {
  const [state, formAction, isPending] = useActionState<AssignTeamsState, FormData>(
    assignMatchTeams,
    null,
  )

  return (
    <form action={formAction} style={{ ...s.form, borderTop: '1px solid rgba(124,92,255,0.2)' }}>
      <input type="hidden" name="match_id" value={match.id} />
      <p style={{ ...s.penalLabel, color: '#c46bff', margin: 0 }}>Asignar equipos</p>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={s.penalLabel}>Local</label>
          <select name="team1_id" defaultValue={match.team1Id ?? ''} disabled={isPending} style={s.teamSelect}>
            <option value="">— placeholder —</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={s.penalLabel}>Visitante</label>
          <select name="team2_id" defaultValue={match.team2Id ?? ''} disabled={isPending} style={s.teamSelect}>
            <option value="">— placeholder —</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={isPending}
          style={isPending ? { ...s.btn, background: '#3b2f7a', boxShadow: 'none', opacity: 0.6 } : { ...s.btn, background: 'linear-gradient(180deg,#a78bfa,#7c5cff)', boxShadow: '0 4px 14px rgba(124,92,255,0.35)', marginTop: '16px' }}>
          {isPending ? 'Guardando…' : 'Asignar'}
        </button>
      </div>
      {state?.error && <p style={s.feedError}>✕ {state.error}</p>}
      {state?.ok && <p style={s.feedOk}>✓ Equipos asignados</p>}
    </form>
  )
}

// ── MatchForm — formulario individual de resultado ───────────────────────────

function MatchForm({ match }: { match: MatchRow }) {
  const [state, formAction, isPending] = useActionState<SaveResultState, FormData>(
    saveMatchResult,
    null,
  )

  const isKnockout = match.phase !== 'group'
  const hasResult  = match.score1 !== null && match.score2 !== null
  // Mostrar penales si: knockout, hay resultado y fue empate (90')
  const showPenalties = isKnockout && hasResult && match.score1 === match.score2

  const result = state?.result

  return (
    <form action={formAction} style={s.form}>
      <input type="hidden" name="match_id" value={match.id} />

      {/* Marcador */}
      <div style={s.scoreRow}>
        <input
          name="score1"
          type="number"
          min={0}
          max={99}
          defaultValue={match.score1 ?? ''}
          placeholder="–"
          disabled={isPending}
          style={s.scoreInput}
          aria-label={`Goles ${match.team1Name}`}
        />
        <span style={s.scoreSep}>:</span>
        <input
          name="score2"
          type="number"
          min={0}
          max={99}
          defaultValue={match.score2 ?? ''}
          placeholder="–"
          disabled={isPending}
          style={s.scoreInput}
          aria-label={`Goles ${match.team2Name}`}
        />
      </div>

      {/* Penales (knockout) */}
      {isKnockout && (
        <div style={s.penalRow}>
          <span style={s.penalLabel}>Pen.</span>
          <input
            name="penalty1"
            type="number"
            min={0}
            max={99}
            defaultValue={match.penalty1 ?? ''}
            placeholder="–"
            disabled={isPending}
            style={{ ...s.scoreInput, width: '44px' }}
          />
          <span style={s.scoreSep}>–</span>
          <input
            name="penalty2"
            type="number"
            min={0}
            max={99}
            defaultValue={match.penalty2 ?? ''}
            placeholder="–"
            disabled={isPending}
            style={{ ...s.scoreInput, width: '44px' }}
          />
          <span style={s.penalLabel}>(solo si hubo)</span>
        </div>
      )}

      {/* Botón */}
      <button type="submit" disabled={isPending} style={isPending ? { ...s.btn, opacity: 0.5 } : s.btn}>
        {isPending ? 'Guardando…' : hasResult ? 'Actualizar' : 'Guardar'}
      </button>

      {/* Feedback */}
      {state?.error && (
        <p style={s.feedError}>✕ {state.error}</p>
      )}
      {result && (
        <p style={result.errors.length > 0 ? s.feedWarn : s.feedOk}>
          {result.errors.length > 0
            ? `⚠ ${result.errors[0]}`
            : `✓ ${result.predictionsUpdated} pronósticos · ${result.usersUpdated} usuarios${result.standingsUpdated ? ' · standings ✓' : ''}${result.groupPredictionsScored ? ' · clasificación ✓' : ''}`
          }
        </p>
      )}
    </form>
  )
}

// ── MatchCard — tarjeta de un partido ────────────────────────────────────────

function MatchCard({ match, teams }: { match: MatchRow; teams: { id: number; name: string }[] }) {
  const [openResult, setOpenResult] = useState(false)
  const [openTeams,  setOpenTeams]  = useState(false)
  const hasResult  = match.score1 !== null
  const isKnockout = match.phase !== 'group'
  const color = match.groupName ? (GROUP_COLORS[match.groupName] ?? '#5b8cff') : '#7c5cff'
  const pillLabel = match.groupName?.replace('Group ', '') ?? (match.round ?? match.phase.toUpperCase().slice(0,2))

  return (
    <div style={s.card}>
      {/* Color bar lateral */}
      <div style={{ ...s.colorBar, background: color }} />

      <div style={s.cardBody}>
        {/* Meta */}
        <div style={s.cardMeta}>
          <span style={{ ...s.pill, background: color, color: '#0a0e1a' }}>{pillLabel}</span>
          <span style={s.metaDate}>{fmtDate(match.date)}</span>
          {match.ground && <span style={s.metaGround}>{match.ground}</span>}
          {match.matchNum && <span style={s.metaNum}>Partido #{match.matchNum}</span>}
        </div>

        {/* Equipos + resultado actual */}
        <div style={s.teamsRow}>
          <span style={s.teamName}>{match.team1Name}</span>
          <span style={s.currentScore}>
            {hasResult
              ? `${match.score1} – ${match.score2}${match.penalty1 !== null ? ` (${match.penalty1}–${match.penalty2} pen)` : ''}`
              : '— vs —'}
          </span>
          <span style={{ ...s.teamName, textAlign: 'right' }}>{match.team2Name}</span>
        </div>

        {/* Botones de acción */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button style={s.toggleBtn} onClick={() => { setOpenResult(o => !o); setOpenTeams(false) }}>
            {openResult ? '▲ Cerrar' : (hasResult ? '✏ Editar resultado' : '+ Ingresar resultado')}
          </button>
          {isKnockout && (
            <button
              style={{ ...s.toggleBtn, borderColor: 'rgba(124,92,255,0.3)', color: '#c46bff' }}
              onClick={() => { setOpenTeams(o => !o); setOpenResult(false) }}
            >
              {openTeams ? '▲ Cerrar' : '⚙ Asignar equipos'}
            </button>
          )}
        </div>

        {openResult && <MatchForm match={match} />}
        {openTeams  && <TeamAssignForm match={match} teams={teams} />}
      </div>
    </div>
  )
}

// ── AdminPanel — componente principal ─────────────────────────────────────────

export function AdminPanel({ matches, teams, scoredGroups }: { matches: MatchRow[]; teams: { id: number; name: string }[]; scoredGroups: Set<string> }) {
  const [phaseFilter, setPhaseFilter] = useState<'all' | 'group' | 'knockout'>('all')
  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'finished' | 'pending'>('all')

  const groups = [...new Set(
    matches.filter(m => m.phase === 'group' && m.groupName).map(m => m.groupName!)
  )].sort()

  const filtered = matches.filter(m => {
    if (phaseFilter === 'group' && m.phase !== 'group') return false
    if (phaseFilter === 'knockout' && m.phase === 'group') return false
    if (phaseFilter === 'group' && groupFilter !== 'all' && m.groupName !== groupFilter) return false
    if (statusFilter === 'finished' && m.status !== 'finished') return false
    if (statusFilter === 'pending' && m.status === 'finished') return false
    return true
  })

  return (
    <div style={s.wrap}>
      {/* Cabecera */}
      <div style={s.header}>
        <h1 style={s.title}>SUPER ADMIN</h1>
        <p style={s.subtitle}>QUINIELA MUNDIAL 2026 — Resultados</p>
        <p style={s.warning}>⚠ Consola privada del sistema · Acceso exclusivo del super admin</p>
      </div>

      {/* Filtros de fase */}
      <div style={s.filterRow}>
        {(['all','group','knockout'] as const).map(f => (
          <button key={f} onClick={() => { setPhaseFilter(f); setGroupFilter('all') }}
            style={phaseFilter === f ? { ...s.filterBtn, ...s.filterBtnOn } : s.filterBtn}>
            {f === 'all' ? 'Todos' : f === 'group' ? 'Grupos' : 'Eliminatoria'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {(['all','pending','finished'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            style={statusFilter === f ? { ...s.filterBtn, ...s.filterBtnOn } : s.filterBtn}>
            {f === 'all' ? 'Todos' : f === 'pending' ? 'Sin resultado' : 'Con resultado'}
          </button>
        ))}
      </div>

      {/* Filtro de grupo (solo cuando fase=grupo) */}
      {phaseFilter === 'group' && (
        <div style={s.groupChips}>
          <button onClick={() => setGroupFilter('all')}
            style={groupFilter === 'all' ? { ...s.groupChip, ...s.groupChipOn } : s.groupChip}>
            Todos
          </button>
          {groups.map(g => {
            const letter = g.replace('Group ', '')
            const color = GROUP_COLORS[g] ?? '#5b8cff'
            const scored = scoredGroups.has(g)
            return (
              <button key={g} onClick={() => setGroupFilter(g)}
                style={{
                  ...(groupFilter === g ? { ...s.groupChip, ...s.groupChipOn } : s.groupChip),
                  borderColor: groupFilter === g ? color : scored ? 'rgba(74,222,128,0.35)' : undefined,
                  color: groupFilter === g ? color : undefined,
                }}>
                {letter}{scored && <span style={s.scoredDot}>✓</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Contador */}
      <p style={s.count}>
        {filtered.length} partido{filtered.length !== 1 ? 's' : ''}
        {' · '}
        {filtered.filter(m => m.status === 'finished').length} con resultado
      </p>

      {/* Lista de partidos */}
      <div style={s.list}>
        {filtered.map(m => <MatchCard key={m.id} match={m} teams={teams} />)}
      </div>
    </div>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const s = {
  wrap: { maxWidth: '860px', margin: '0 auto', padding: '2rem 1.25rem 5rem' },
  header: { marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1.5rem' },
  title: { fontFamily: 'var(--font-anton), Anton, sans-serif', fontSize: '2rem', color: '#fff', margin: 0, letterSpacing: '0.02em' },
  subtitle: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#93a6c6', margin: '0.25rem 0 0.75rem' },
  warning: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontSize: '0.8rem', color: '#e8434f', fontWeight: 700, margin: 0 },

  filterRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' as const, marginBottom: '12px' },
  filterBtn: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em', textTransform: 'uppercase' as const, padding: '8px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: '#0d1b32', color: '#93a6c6', cursor: 'pointer' },
  filterBtnOn: { background: 'rgba(59,154,225,0.15)', borderColor: '#3b9ae1', color: '#3b9ae1' },

  groupChips: { display: 'flex', gap: '6px', flexWrap: 'wrap' as const, marginBottom: '12px' },
  groupChip: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 800, fontSize: '12px', padding: '6px 12px', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.1)', background: '#0d1b32', color: '#5f7196', cursor: 'pointer' },
  groupChipOn: { background: 'rgba(255,255,255,0.05)' },

  count: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontSize: '0.75rem', color: '#5f7196', fontWeight: 600, margin: '0 0 1rem' },

  list: { display: 'flex', flexDirection: 'column' as const, gap: '10px' },

  card: { position: 'relative' as const, display: 'flex', background: 'linear-gradient(180deg,#11233f,#0d1b32)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', overflow: 'hidden' },
  colorBar: { width: '4px', flexShrink: 0 },
  cardBody: { flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column' as const, gap: '10px' },

  cardMeta: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const },
  pill: { fontFamily: 'var(--font-anton), Anton, sans-serif', fontSize: '12px', padding: '3px 8px', borderRadius: '6px', fontWeight: 400 },
  metaDate: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontSize: '12px', color: '#93a6c6', fontWeight: 600 },
  metaGround: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontSize: '11px', color: '#5f7196', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  metaNum: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontSize: '11px', color: '#5f7196', marginLeft: 'auto' },

  teamsRow: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '10px' },
  teamName: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 700, fontSize: '14px', color: '#eef4fb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  currentScore: { fontFamily: 'var(--font-anton), Anton, sans-serif', fontSize: '18px', color: '#f7c948', textAlign: 'center' as const, letterSpacing: '0.02em', whiteSpace: 'nowrap' as const },

  toggleBtn: { alignSelf: 'flex-start', fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#93a6c6', cursor: 'pointer' },

  form: { display: 'flex', flexDirection: 'column' as const, gap: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.07)' },

  scoreRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  scoreInput: { width: '60px', height: '50px', fontFamily: 'var(--font-anton), Anton, sans-serif', fontSize: '24px', textAlign: 'center' as const, background: '#070c18', border: '1.5px solid rgba(120,170,230,0.2)', borderRadius: '10px', color: '#fff', outline: 'none', caretColor: '#f7c948', padding: 0 },
  scoreSep: { fontFamily: 'var(--font-anton), Anton, sans-serif', fontSize: '20px', color: '#5f7196' },

  penalRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  penalLabel: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontSize: '11px', color: '#5f7196', fontWeight: 700 },

  btn: { alignSelf: 'flex-start', fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 800, fontSize: '12px', letterSpacing: '0.04em', textTransform: 'uppercase' as const, padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'linear-gradient(180deg,#fbd75f,#e7af2e)', color: '#2a1d00', cursor: 'pointer', boxShadow: '0 4px 14px rgba(247,201,72,0.3)' },

  scoredDot: { marginLeft: '4px', fontSize: '10px', color: '#4ade80', verticalAlign: 'middle' },
  feedOk:   { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontSize: '12px', fontWeight: 700, color: '#4ade80', margin: 0 },
  feedWarn: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontSize: '12px', fontWeight: 700, color: '#f7c948', margin: 0 },
  feedError:{ fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontSize: '12px', fontWeight: 700, color: '#e8434f', margin: 0 },

  teamSelect: { fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontSize: '13px', fontWeight: 600, background: '#070c18', border: '1.5px solid rgba(120,170,230,0.2)', borderRadius: '8px', color: '#eef4fb', padding: '6px 10px', minWidth: '180px', outline: 'none' },
} as const
