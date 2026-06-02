'use client'

/**
 * CalendarioView — pestaña Calendario de la quiniela.
 *
 * Los componentes MatchCard, DaySection y los estilos son una adaptación
 * directa del handoff de Claude Design (app.jsx + CSS literal copiado en
 * globals.css). Se sustituye el localStorage por Supabase y se añade el
 * concepto de "bloqueado por fecha" sin alterar el look & feel.
 */

import { useState, useTransition, useMemo } from 'react'
import { savePrediction, copyPredictions } from './actions'
import { flagCode, esName } from '@/lib/teams-data'

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type MatchForCal = {
  id: number
  date: string          // YYYY-MM-DD
  time: string
  ground: string | null
  phase: string         // 'group' | 'knockout'
  groupName: string | null   // "Group A" — null para eliminatoria
  round: string | null  // "Round of 32", "Quarter-final", etc.
  team1Name: string     // nombre real o placeholder ("2A", "3A/B/C/D/F")
  team2Name: string
  teamsResolved: boolean // true si ambos team_id están asignados
  isLocked: boolean
}

export type InitPred = {
  matchId: number
  score1: number | null
  score2: number | null
}

type Props = {
  championshipId: string
  matches: MatchForCal[]
  initialPredictions: InitPred[]
  /** Callback para notificar a ChampionshipApp que se confirmó un pronóstico */
  onPredictionConfirmed?: (matchId: number) => void
  /** Otros campeonatos del usuario — si hay alguno, se habilita "Copiar pronósticos" */
  otherChampionships: { id: string; name: string }[]
}

// ── Constantes copiadas del handoff ───────────────────────────────────────────

const DOW = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const MON = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

const GROUP_COLORS: Record<string, string> = {
  'Group A':'#ff2d78','Group B':'#ff8a3d','Group C':'#ffd23f',
  'Group D':'#7ee787','Group E':'#19e3c0','Group F':'#3dd5ff',
  'Group G':'#5b8cff','Group H':'#7c5cff','Group I':'#c46bff',
  'Group J':'#ff5cae','Group K':'#ff6b6b','Group L':'#9bd45b',
}

const ROUND_COLORS: Record<string, string> = {
  'Round of 32':          '#7c5cff',
  'Round of 16':          '#c46bff',
  'Quarter-final':        '#ff5cae',
  'Semi-final':           '#ff8a3d',
  'Final':                '#f7c948',
  'Match for third place':'#19e3c0',
}

const ROUND_ABBR: Record<string, string> = {
  'Round of 32':          'R32',
  'Round of 16':          'R16',
  'Quarter-final':        'QF',
  'Semi-final':           'SF',
  'Final':                'F',
  'Match for third place':'3°',
}

const ROUND_ES: Record<string, string> = {
  'Round of 32':          'RONDA DE 32',
  'Round of 16':          'OCTAVOS DE FINAL',
  'Quarter-final':        'CUARTOS DE FINAL',
  'Semi-final':           'SEMIFINALES',
  'Final':                'FINAL',
  'Match for third place':'TERCER LUGAR',
}

// Helpers del handoff
function parseLocalDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function dayLabel(s: string) {
  const dt = parseLocalDate(s)
  return { dow: DOW[dt.getDay()], d: dt.getDate(), mon: MON[dt.getMonth()] }
}
function localTime(timeStr: string) {
  const m = timeStr.match(/(\d{1,2}:\d{2})\s*(UTC[+-]?\d*)/)
  return m ? { t: m[1], tz: m[2] } : { t: timeStr, tz: '' }
}
function groupLetter(g: string) { return g.replace('Group ', '') }

// ── Icono lápiz — idéntico al handoff ────────────────────────────────────────

const PencilIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

// ── Estado por partido ────────────────────────────────────────────────────────

type PredState = { s1: string; s2: string; confirmed: boolean }

function buildInitialPreds(preds: InitPred[]): Map<number, PredState> {
  const map = new Map<number, PredState>()
  for (const p of preds) {
    map.set(p.matchId, {
      s1: p.score1 !== null ? String(p.score1) : '',
      s2: p.score2 !== null ? String(p.score2) : '',
      confirmed: p.score1 !== null && p.score2 !== null,
    })
  }
  return map
}

// ── PhaseHeader — separador visual entre fases y rondas ──────────────────────

function PhaseHeader({ round, isFirst }: { round: string; isFirst: boolean }) {
  const color = ROUND_COLORS[round] ?? '#7c5cff'
  const label = ROUND_ES[round]     ?? round
  const abbr  = ROUND_ABBR[round]   ?? '?'

  if (isFirst) {
    return (
      <div style={{ margin: '44px 0 30px' }}>
        <div style={{
          height: '1px',
          background: `linear-gradient(to right, transparent, ${color}60, ${color}90, ${color}60, transparent)`,
          marginBottom: '14px',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ flex: 1, height: '1px', background: `linear-gradient(to right, transparent, ${color}35)` }} />
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '9px',
            fontFamily: 'var(--font-archivo),Archivo,sans-serif',
            fontWeight: 800, fontSize: '12px', letterSpacing: '.12em',
            color, textTransform: 'uppercase',
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '26px', height: '26px', borderRadius: '6px',
              background: `${color}1a`, border: `1.5px solid ${color}55`,
              fontSize: '11px', fontWeight: 800, letterSpacing: 0, flexShrink: 0,
            }}>{abbr}</span>
            {label}
          </span>
          <div style={{ flex: 1, height: '1px', background: `linear-gradient(to left, transparent, ${color}35)` }} />
        </div>
        <div style={{
          height: '1px',
          background: `linear-gradient(to right, transparent, ${color}40, ${color}65, ${color}40, transparent)`,
          marginTop: '14px',
        }} />
      </div>
    )
  }

  return (
    <div style={{ margin: '38px 0 22px', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '22px', height: '22px', borderRadius: '5px',
        background: `${color}1a`, border: `1.5px solid ${color}50`,
        fontFamily: 'var(--font-archivo),Archivo,sans-serif',
        fontSize: '10px', fontWeight: 800, color, letterSpacing: 0, flexShrink: 0,
      }}>{abbr}</span>
      <span style={{
        fontFamily: 'var(--font-archivo),Archivo,sans-serif',
        fontWeight: 800, fontSize: '11px', letterSpacing: '.1em',
        color, textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}>{label}</span>
      <div style={{ flex: 1, height: '1px', background: `linear-gradient(to right, ${color}50, transparent)` }} />
    </div>
  )
}

// ── MatchCard — copiado del handoff y adaptado ────────────────────────────────

function MatchCard({
  match, state, saving, error,
  onConfirm, onEdit, onSetScore, onClearScore,
}: {
  match: MatchForCal
  state: PredState
  saving: boolean
  error: string | null
  onConfirm: (s1: number, s2: number) => void
  onEdit: () => void
  onSetScore: (side: 's1' | 's2', val: string) => void
  onClearScore: () => void
}) {
  const isKnockout = match.phase !== 'group'
  const color = isKnockout
    ? (ROUND_COLORS[match.round ?? ''] ?? '#7c5cff')
    : (match.groupName ? (GROUP_COLORS[match.groupName] ?? '#5b8cff') : '#5b8cff')
  const pillLabel = isKnockout
    ? (ROUND_ABBR[match.round ?? ''] ?? match.round ?? 'KO')
    : groupLetter(match.groupName ?? '?')

  const time    = localTime(match.time)
  const { s1, s2, confirmed } = state

  const both = s1 !== '' && s2 !== ''
  const n1 = +s1, n2 = +s2
  const w1   = confirmed && n1 > n2
  const w2   = confirmed && n2 > n1
  const draw = confirmed && n1 === n2

  const t1es = esName(match.team1Name)
  const t2es = esName(match.team2Name)
  const c1   = flagCode(match.team1Name)
  const c2   = flagCode(match.team2Name)

  // El handoff usa 'locked' para el estado confirmado (coincide con los estilos)
  const cardClass = 'match' + (confirmed ? ' locked' : '')

  // helper del handoff
  const sideClass = (win: boolean, lose: boolean) =>
    'team' + (win ? ' win' : '') + (lose ? ' lose' : '')

  // Partido pendiente de equipos — no se puede pronosticar aún
  if (isKnockout && !match.teamsResolved) {
    return (
      <div className="match" style={{ '--gc': color } as React.CSSProperties}>
        <div className="match-top">
          <span className="grp-pill" style={{ '--gc': color } as React.CSSProperties}>{pillLabel}</span>
          <span className="venue">{match.ground ?? ''}</span>
          <span className="kick">{time.t}<small>{time.tz}</small></span>
        </div>
        <div className="match-body">
          <div className="team">
            <span className="tname" style={{ opacity: 0.5 }}>{match.team1Name}</span>
          </div>
          <div className="score" style={{ opacity: 0.4 }}>
            <span className="sc" style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>–</span>
            <span className="dash">:</span>
            <span className="sc" style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>–</span>
          </div>
          <div className="team r">
            <span className="tname" style={{ opacity: 0.5 }}>{match.team2Name}</span>
          </div>
        </div>
        <div className="match-foot">
          <div className="result">
            <span style={{ fontFamily: 'var(--font-archivo),Archivo,sans-serif', fontSize: '11px', fontWeight: 700, color: 'var(--mut2)' }}>
              ⏳ Equipos pendientes de clasificar
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className={cardClass} style={{ '--gc': color } as React.CSSProperties}>
        {/* match-top */}
        <div className="match-top">
          <span className="grp-pill" style={{ '--gc': color } as React.CSSProperties}>
            {pillLabel}
          </span>
          <span className="venue">{match.ground ?? ''}</span>
          <span className="kick">
            {time.t}<small>{time.tz}</small>
          </span>
        </div>

        {/* match-body */}
        <div className="match-body">
          <div className={sideClass(w1, w2 || (draw ? false : false))}>
            <img className="flag" loading="lazy"
              src={`https://flagcdn.com/w80/${c1}.png`}
              srcSet={`https://flagcdn.com/w160/${c1}.png 2x`}
              alt={t1es}
            />
            <span className="tname">{t1es}</span>
            {confirmed && w1 && <span className="tick">✓</span>}
          </div>

          <div className="score">
            <input
              type="text" inputMode="numeric" className="sc"
              value={s1} placeholder="–"
              disabled={confirmed || match.isLocked || saving}
              onChange={e => onSetScore('s1', e.target.value)}
              aria-label={`Goles ${t1es}`}
            />
            <span className="dash">:</span>
            <input
              type="text" inputMode="numeric" className="sc"
              value={s2} placeholder="–"
              disabled={confirmed || match.isLocked || saving}
              onChange={e => onSetScore('s2', e.target.value)}
              aria-label={`Goles ${t2es}`}
            />
          </div>

          <div className={sideClass(w2, w1) + ' r'}>
            {confirmed && w2 && <span className="tick">✓</span>}
            <span className="tname">{t2es}</span>
            <img className="flag" loading="lazy"
              src={`https://flagcdn.com/w80/${c2}.png`}
              srcSet={`https://flagcdn.com/w160/${c2}.png 2x`}
              alt={t2es}
            />
          </div>
        </div>

        {/* match-foot */}
        <div className="match-foot">
          {match.isLocked ? (
            /* Partido cerrado por fecha */
            <div className="result">
              {confirmed
                ? <span className="res-tag" style={{ '--gc': color } as React.CSSProperties}>
                    {draw ? 'Empate' : 'Gana ' + (n1 > n2 ? t1es : t2es)}
                  </span>
                : <span className="res-closed">🔒 Partido cerrado · sin pronóstico guardado</span>
              }
            </div>
          ) : confirmed ? (
            /* Confirmado y editable */
            <div className="result">
              <span className="res-tag" style={{ '--gc': color } as React.CSSProperties}>
                {draw ? 'Empate' : 'Gana ' + (n1 > n2 ? t1es : t2es)}
              </span>
              <button className="btn icon-edit" onClick={onEdit} title="Editar pronóstico">
                {PencilIcon}<span>Editar</span>
              </button>
            </div>
          ) : (
            /* Sin confirmar */
            <div className="result">
              <button
                className={'btn confirm' + (both && !saving ? '' : ' disabled')}
                disabled={!both || saving}
                onClick={() => onConfirm(+s1, +s2)}
              >
                {saving ? 'Guardando…' : 'Confirmar pronóstico'}
              </button>
              <button
                className="btn icon-edit"
                disabled={(!s1 && !s2) || saving}
                onClick={onClearScore}
                title="Borrar marcador"
              >
                {PencilIcon}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p style={{ fontFamily: 'var(--font-archivo),Archivo,sans-serif', fontSize: '11px', fontWeight: 700, color: 'var(--mag)', margin: '4px 0 0 6px' }}>
          ✕ {error}
        </p>
      )}
    </div>
  )
}

// ── CalendarioView ────────────────────────────────────────────────────────────

export function CalendarioView({ championshipId, matches, initialPredictions, onPredictionConfirmed, otherChampionships }: Props) {
  const [preds,   setPreds]  = useState(() => buildInitialPreds(initialPredictions))
  const [filter,  setFilter] = useState('all')
  const [saving,  setSaving] = useState<number | null>(null)
  const [errors,  setErrors] = useState<Map<number, string>>(new Map())
  const [, startTransition]  = useTransition()

  // ── Copiar pronósticos ───────────────────────────────────────────────────────
  const [copySourceId, setCopySourceId] = useState<string>('')
  const [copying,      setCopying]      = useState(false)
  const [copyResult,   setCopyResult]   = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleCopy() {
    if (!copySourceId) return
    setCopying(true)
    setCopyResult(null)
    const res = await copyPredictions(copySourceId, championshipId)
    setCopying(false)
    if (res.error) {
      setCopyResult({ ok: false, msg: res.error })
    } else {
      setCopyResult({ ok: true, msg: `✓ ${res.copied} pronósticos copiados${res.skipped ? ` · ${res.skipped} omitidos (bloqueados)` : ''}` })
      startTransition(() => {
        for (const p of res.predictions) {
          patch(p.matchId, { s1: String(p.score1), s2: String(p.score2), confirmed: true })
          onPredictionConfirmed?.(p.matchId)
        }
      })
    }
  }

  // Grupos únicos para los chips de filtro (solo fase de grupos, no null)
  const groups = useMemo(
    () => [...new Set(matches.filter(m => m.groupName).map(m => m.groupName!))].sort(),
    [matches],
  )
  const hasKnockout = useMemo(() => matches.some(m => m.phase !== 'group'), [matches])

  // Progreso — solo partidos con equipos resueltos (los pendientes no se pueden pronosticar)
  const predictable = useMemo(() => matches.filter(m => m.teamsResolved), [matches])
  const confirmedCount = useMemo(
    () => predictable.filter(m => {
      const p = preds.get(m.id)
      return p?.confirmed ?? false
    }).length,
    [predictable, preds],
  )
  const total = predictable.length
  const pct   = total > 0 ? Math.round((confirmedCount / total) * 100) : 0

  // Filtrado + agrupación por día
  const visible = useMemo(() => {
    if (filter === 'all') return matches
    if (filter === 'knockout') return matches.filter(m => m.phase !== 'group')
    return matches.filter(m => m.groupName === filter)
  }, [matches, filter])
  const days = useMemo(() => {
    const map = new Map<string, MatchForCal[]>()
    for (const m of visible) {
      if (!map.has(m.date)) map.set(m.date, [])
      map.get(m.date)!.push(m)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [visible])

  // Helpers de estado
  const getPred = (id: number): PredState =>
    preds.get(id) ?? { s1: '', s2: '', confirmed: false }

  function patch(id: number, changes: Partial<PredState>) {
    setPreds(prev => {
      const cur  = prev.get(id) ?? { s1: '', s2: '', confirmed: false }
      const next = new Map(prev)
      next.set(id, { ...cur, ...changes })
      return next
    })
  }

  async function handleConfirm(matchId: number, s1: number, s2: number) {
    setSaving(matchId)
    setErrors(prev => { const m = new Map(prev); m.delete(matchId); return m })
    const res = await savePrediction(championshipId, matchId, s1, s2)
    setSaving(null)
    if (res.error) {
      setErrors(prev => new Map(prev).set(matchId, res.error!))
    } else {
      startTransition(() => {
        setPreds(prev => {
          const next = new Map(prev)
          next.set(matchId, { s1: String(s1), s2: String(s2), confirmed: true })
          return next
        })
      })
      onPredictionConfirmed?.(matchId)
    }
  }

  return (
    <div>
      {/* Barra de progreso — copiada del handoff */}
      <div className="progress">
        <div className="pbar">
          <div className="pfill" style={{ width: `${pct}%` }} />
        </div>
        <div className="pmeta">
          <strong>{confirmedCount}</strong> / {total} partidos pronosticados
          <span className="ppct">{pct}%</span>
        </div>
      </div>

      {/* Aviso de cierre */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px',
        background: 'rgba(59,154,225,0.07)',
        border: '1px solid rgba(59,154,225,0.18)',
        borderRadius: '10px',
        padding: '11px 14px',
        marginBottom: '16px',
      }}>
        <span style={{ fontSize: '15px', lineHeight: 1, flexShrink: 0, marginTop: '1px' }}>🕛</span>
        <p style={{
          fontFamily: 'var(--font-archivo),Archivo,sans-serif',
          fontSize: '12px', fontWeight: 600, lineHeight: 1.5,
          color: '#93a6c6', margin: 0,
        }}>
          Los pronósticos cierran a las <strong style={{ color: '#b8cde8', fontWeight: 800 }}>00:00 hora de Miami</strong> del día de cada partido.
          {' '}Pronóstica con tiempo — te recomendamos hacerlo <strong style={{ color: '#b8cde8', fontWeight: 800 }}>el día anterior o antes</strong>.
        </p>
      </div>

      {/* Copiar pronósticos — solo aparece cuando hay otros campeonatos */}
      {otherChampionships.length > 0 && (
        <div style={{
          marginBottom: '20px',
          background: 'linear-gradient(180deg,#11233f,#0d1b32)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px',
          padding: '14px 16px',
        }}>
          <p style={{
            fontFamily: 'var(--font-archivo),Archivo,sans-serif',
            fontWeight: 800, fontSize: '10px', letterSpacing: '.1em',
            textTransform: 'uppercase' as const, color: 'var(--mut2)',
            margin: '0 0 10px',
          }}>
            Copiar pronósticos de otro campeonato
          </p>

          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px', marginBottom: '12px' }}>
            {otherChampionships.map(c => {
              const sel = copySourceId === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => { setCopySourceId(c.id); setCopyResult(null) }}
                  disabled={copying}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 14px', borderRadius: '10px', width: '100%',
                    border: sel ? '1px solid rgba(247,201,72,0.45)' : '1px solid rgba(255,255,255,0.07)',
                    background: sel ? 'rgba(247,201,72,0.07)' : 'rgba(255,255,255,0.02)',
                    cursor: copying ? 'default' : 'pointer',
                    transition: '.15s', textAlign: 'left' as const,
                  }}
                >
                  {/* Radio visual */}
                  <span style={{
                    width: '17px', height: '17px', borderRadius: '50%', flexShrink: 0,
                    border: sel ? '5px solid #f7c948' : '1.5px solid rgba(255,255,255,0.2)',
                    background: sel ? '#f7c948' : 'transparent',
                    transition: '.15s', boxSizing: 'border-box' as const,
                  }} />
                  <span style={{
                    fontFamily: 'var(--font-archivo),Archivo,sans-serif',
                    fontWeight: 700, fontSize: '13px',
                    color: sel ? '#f7c948' : 'var(--txt)',
                    transition: '.15s',
                  }}>
                    {c.name}
                  </span>
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const }}>
            <button
              disabled={!copySourceId || copying}
              onClick={handleCopy}
              style={{
                padding: '8px 18px', borderRadius: '8px', border: 'none',
                fontFamily: 'var(--font-archivo),Archivo,sans-serif',
                fontWeight: 700, fontSize: '12px', letterSpacing: '.04em',
                cursor: copySourceId && !copying ? 'pointer' : 'not-allowed',
                background: copySourceId && !copying
                  ? 'linear-gradient(180deg,#fbd75f,#e7af2e)'
                  : 'rgba(255,255,255,0.07)',
                color: copySourceId && !copying ? '#1a1200' : 'var(--mut2)',
                opacity: !copySourceId || copying ? 0.55 : 1,
                transition: '.15s',
              }}
            >
              {copying ? 'Copiando…' : 'Copiar pronósticos'}
            </button>

            {copyResult && (
              <span style={{
                fontFamily: 'var(--font-archivo),Archivo,sans-serif',
                fontSize: '12px', fontWeight: 700,
                color: copyResult.ok ? '#4ade80' : 'var(--mag)',
              }}>
                {copyResult.msg}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Filtros por grupo — mismos chips que el handoff */}
      <div className="filters" style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginBottom: '26px' }}>
        <button className={`chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
          Todos
        </button>
        {groups.map(g => {
          const col = GROUP_COLORS[g] ?? '#5b8cff'
          return (
            <button key={g}
              className={`chip${filter === g ? ' on' : ''}`}
              style={{ '--gc': col } as React.CSSProperties}
              onClick={() => setFilter(g)}
            >
              <i style={{ background: col }} />{groupLetter(g)}
            </button>
          )
        })}
        {hasKnockout && (
          <button
            className={`chip${filter === 'knockout' ? ' on' : ''}`}
            style={{ '--gc': '#7c5cff' } as React.CSSProperties}
            onClick={() => setFilter('knockout')}
          >
            <i style={{ background: '#7c5cff' }} />Eliminatoria
          </button>
        )}
      </div>

      {/* Calendario — estructura exacta del handoff */}
      <main className="cal">
        {(() => {
          const sections: React.ReactNode[] = []
          let prevPhase: string | null = null
          let prevRound: string | null = null

          for (const [date, dayMatches] of days) {
            const first = dayMatches[0]
            const curPhase = first.phase
            const curRound = curPhase !== 'group' ? (first.round ?? null) : null

            // Inyectar cabecera de ronda al entrar en eliminatoria o cambiar de ronda
            if (curPhase !== 'group' && curRound !== prevRound) {
              sections.push(
                <PhaseHeader
                  key={`hdr-${curRound}`}
                  round={curRound ?? 'Round of 32'}
                  isFirst={prevPhase === 'group'}
                />
              )
            }

            prevPhase = curPhase
            if (curPhase !== 'group') prevRound = curRound

            const dl = dayLabel(date)
            sections.push(
              <section className="day" key={date}>
                <div className="day-head">
                  <div className="dnum">{dl.d}</div>
                  <div className="dtxt">
                    <span className="ddow">{dl.dow}</span>
                    <span className="dmon">{dl.mon}</span>
                  </div>
                  <span className="dcount">
                    {dayMatches.length} {dayMatches.length === 1 ? 'partido' : 'partidos'}
                  </span>
                </div>
                <div className="day-matches">
                  {dayMatches.map(m => {
                    const state = getPred(m.id)
                    return (
                      <MatchCard
                        key={m.id}
                        match={m}
                        state={state}
                        saving={saving === m.id}
                        error={errors.get(m.id) ?? null}
                        onConfirm={(s1, s2) => handleConfirm(m.id, s1, s2)}
                        onEdit={() => patch(m.id, { confirmed: false })}
                        onSetScore={(side, val) =>
                          patch(m.id, { [side]: val.replace(/[^0-9]/g, '').slice(0, 2), confirmed: false } as Partial<PredState>)
                        }
                        onClearScore={() => patch(m.id, { s1: '', s2: '', confirmed: false })}
                      />
                    )
                  })}
                </div>
              </section>
            )
          }

          return sections
        })()}

        {days.length === 0 && (
          <p style={{ color: 'var(--mut2)', fontWeight: 600, fontSize: '14px', textAlign: 'center', padding: '3rem 0' }}>
            No hay partidos para este filtro.
          </p>
        )}
      </main>
    </div>
  )
}
