'use client'

import { useState, useMemo } from 'react'
import { esName, flagCode } from '@/lib/teams-data'

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type Participant = {
  userId: string
  displayName: string
  groupPoints: number
  knockoutPoints: number
  isCurrentUser: boolean
  /** Puntos ganados en partidos jugados hoy (America/New_York) */
  todayPoints: number
}

export type ResultMatch = {
  id: number
  date: string           // YYYY-MM-DD
  kickoffUtc: string | null
  team1Name: string
  team2Name: string
  score1: number | null
  score2: number | null
  ground: string | null
  groupName: string | null
  round: string | null   // "Round of 32", "Quarter-final", etc. — solo eliminatoria
  status: string         // 'scheduled' | 'live' | 'finished'
  predVisible: boolean   // true cuando ya cerró y podemos mostrar pronósticos ajenos
}

export type PredsByMatch = Record<number, Record<string, { s1: number | null; s2: number | null }>>

/** Predicción confirmada de orden de grupo para un participante (todos los lugares no-nulos). */
export type GroupPredEntry = {
  userId: string
  groupId: number
  groupName: string
  places: [string, string, string, string]  // [1°, 2°, 3°, 4°] — nombres de equipo
}

/** Pronósticos especiales de un participante (podio + bota de oro + MVP). */
export type SpecialPredEntry = {
  userId: string
  goldTeamName: string | null
  silverTeamName: string | null
  bronzeTeamName: string | null
  goldenBootPlayerName: string | null
  mvpPlayerName: string | null
}

type Props = {
  participants: Participant[]
  resultMatches: ResultMatch[]
  predsByMatch: PredsByMatch
  userPredMatchIds: Set<number>
  hasTodayMatches: boolean
  groupPredEntries: GroupPredEntry[]
  modGroupStandings: boolean
  modKnockoutMatches: boolean
  isClassificationLocked: boolean
  classificationLockLabel: string
  /** Pronósticos especiales de todos los participantes (vacío si el usuario no pronosticó). */
  specialPredEntries: SpecialPredEntry[]
  /** true si ya cerró el módulo de pronósticos especiales (28 jun 00:00 ET). */
  isPodiumLocked: boolean
  modPodium: boolean
  modGoldenBoot: boolean
  modMvp: boolean
}

// ── Constantes ────────────────────────────────────────────────────────────────

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

const SCORING_RULES = [
  { p: 6, txt: 'Aciertas el resultado + goles L + goles V' },
  { p: 4, txt: 'Aciertas el resultado + goles L o goles V' },
  { p: 3, txt: 'Aciertas solo el resultado (G/E/P)' },
  { p: 1, txt: 'Aciertas goles L o goles V' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const DOW_ES  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MON_ES  = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function fmtDateLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${DOW_ES[dt.getDay()]} ${d} ${MON_ES[m - 1]}`
}

function predChip(s1: number | null, s2: number | null) {
  if (s1 === null || s2 === null) return <span className="predchip" style={{ color: 'var(--mut2)' }}>—</span>
  return <span className="predchip">{s1}–{s2}</span>
}

// ── MatchChip ─────────────────────────────────────────────────────────────────

function MatchChip({ match, selected, onClick, hasPred }: {
  match: ResultMatch; selected: boolean; onClick: () => void; hasPred: boolean
}) {
  const isKnockout = !match.groupName
  const color = isKnockout
    ? (match.round ? (ROUND_COLORS[match.round] ?? '#7c5cff') : '#7c5cff')
    : (GROUP_COLORS[match.groupName!] ?? '#5b8cff')
  const isLive = match.status === 'live'
  const hasResult = match.score1 !== null
  const grp = isKnockout
    ? (match.round ? (ROUND_ABBR[match.round] ?? match.round.slice(0, 3)) : '–')
    : match.groupName!.replace('Group ', '')

  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
      padding: '10px 12px 8px', borderRadius: '12px', cursor: 'pointer',
      border: selected ? `1.5px solid ${color}` : '1px solid rgba(255,255,255,0.08)',
      background: selected ? `color-mix(in srgb,${color} 14%,#11233f)` : 'linear-gradient(180deg,#11233f,#0d1b32)',
      boxShadow: selected ? `0 0 0 1px ${color}, 0 4px 16px rgba(0,0,0,.4)` : 'none',
      minWidth: '88px', maxWidth: '110px',
      transition: '.15s', flexShrink: 0, position: 'relative' as const,
    }}>
      {isLive && (
        <span style={{
          position: 'absolute', top: '5px', right: '7px',
          width: '6px', height: '6px', borderRadius: '50%',
          background: 'var(--mag)', animation: 'blink 1.1s infinite',
        }} />
      )}

      <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: selected ? color : 'var(--mut2)' }}>
        {grp}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <img src={`https://flagcdn.com/w40/${flagCode(match.team1Name)}.png`} alt="" loading="lazy"
          style={{ width: '22px', height: '15px', objectFit: 'cover', borderRadius: '2px', outline: '1px solid rgba(255,255,255,.15)' }} />
        <span style={{
          fontFamily: 'var(--font-anton),Anton,sans-serif', fontSize: '16px', letterSpacing: '.01em',
          color: hasResult ? '#fff' : 'var(--mut2)', minWidth: '34px', textAlign: 'center' as const,
        }}>
          {hasResult ? `${match.score1}:${match.score2}` : '–:–'}
        </span>
        <img src={`https://flagcdn.com/w40/${flagCode(match.team2Name)}.png`} alt="" loading="lazy"
          style={{ width: '22px', height: '15px', objectFit: 'cover', borderRadius: '2px', outline: '1px solid rgba(255,255,255,.15)' }} />
      </div>

      {/* Estado del partido */}
      <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: isLive ? 'var(--mag)' : 'var(--mut2)' }}>
        {isLive ? '● vivo' : hasResult ? 'Final' : (
          match.kickoffUtc
            ? new Date(match.kickoffUtc).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false })
            : 'Programado'
        )}
      </span>

      {/* Alerta de sin pronóstico */}
      {!hasPred && (
        <span style={{
          fontSize: '8px', fontWeight: 900, letterSpacing: '.04em',
          textTransform: 'uppercase' as const,
          color: '#fff',
          background: '#ff8a3d',
          borderRadius: '4px',
          padding: '2px 5px',
          lineHeight: 1.3,
        }}>
          ¡Sin pron.!
        </span>
      )}
    </button>
  )
}

// ── ResultadosView ────────────────────────────────────────────────────────────

export function ResultadosView({ participants, resultMatches, predsByMatch, userPredMatchIds, hasTodayMatches, groupPredEntries, modGroupStandings, modKnockoutMatches, isClassificationLocked, classificationLockLabel, specialPredEntries, isPodiumLocked, modPodium, modGoldenBoot, modMvp }: Props) {
  // Fechas disponibles (días que tienen al menos un partido), en orden ASC
  const availableDates = useMemo(
    () => [...new Set(resultMatches.map(m => m.date))].sort(),
    [resultMatches],
  )

  // Fecha por defecto: hoy en ET; si no hay partidos hoy, el próximo día con partidos;
  // si todos son pasados, el último disponible.
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (availableDates.length === 0) return ''
    const todayET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
    if (availableDates.includes(todayET)) return todayET
    const next = availableDates.find(d => d > todayET)
    return next ?? availableDates[availableDates.length - 1]
  })

  const dateIdx = availableDates.indexOf(selectedDate)
  const canPrev = dateIdx > 0
  const canNext = dateIdx < availableDates.length - 1

  function prevDay() { if (canPrev) setSelectedDate(availableDates[dateIdx - 1]) }
  function nextDay() { if (canNext) setSelectedDate(availableDates[dateIdx + 1]) }

  // Partidos del día seleccionado
  const dayMatches = useMemo(
    () => resultMatches.filter(m => m.date === selectedDate),
    [resultMatches, selectedDate],
  )

  // Partido seleccionado dentro del día
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = useMemo(() => {
    const fromState = dayMatches.find(m => m.id === selectedId)
    // Si el partido seleccionado no es del día actual, usar el primero del día
    return fromState ?? dayMatches[0] ?? null
  }, [dayMatches, selectedId])

  // Predicciones para el partido seleccionado
  const matchPreds = selected?.predVisible ? (predsByMatch[selected.id] ?? {}) : {}

  type SortKey = 'total' | 'grp' | 'ko' | 'hoy'
  const [sortKey, setSortKey] = useState<SortKey>('total')

  // Ranking con empates: mismos puntos = misma posición (ranking denso 1,2,2,3…)
  const sorted = useMemo(() => {
    const list = participants.map(p => ({
      ...p,
      total: p.groupPoints + p.knockoutPoints,
      pred: matchPreds[p.userId] ?? null,
    }))
    const val = (p: typeof list[0]) =>
      sortKey === 'grp' ? p.groupPoints :
      sortKey === 'ko'  ? p.knockoutPoints :
      sortKey === 'hoy' ? p.todayPoints :
      p.total
    list.sort((a, b) => val(b) - val(a))
    let rank = 1
    return list.map((p, i) => {
      if (i > 0 && val(p) < val(list[i - 1])) rank = i + 1
      return { ...p, rank }
    })
  }, [participants, matchPreds, sortKey])

  const color = selected?.groupName ? (GROUP_COLORS[selected.groupName] ?? '#5b8cff') : '#5b8cff'
  const isLive = selected?.status === 'live'
  const isFinished = selected?.status === 'finished'
  const hasResult = selected?.score1 !== null

  // La tabla de posiciones se muestra siempre.
  // El selector de fecha y los chips solo aparecen cuando hay partidos con fecha.

  // Leaderboard (siempre visible; sort estable: puntos DESC, luego orden de registro)
  const leaderboard = (
    <section className="lb-card">
      <div className="lb-head">
        <span className="lb-ico">🏆</span> Posiciones de la quiniela
      </div>
      <table className="lb">
        <colgroup>
          {/* Columna nombre: sin ancho fijo → absorbe lo que sobre */}
          <col />
          <col style={{ width: '50px' }} />
          {hasTodayMatches && <col style={{ width: '40px' }} />}
          {modKnockoutMatches ? (
            <>
              <col style={{ width: '42px' }} />
              <col style={{ width: '38px' }} />
              <col style={{ width: '46px' }} />
            </>
          ) : (
            <col style={{ width: '50px' }} />
          )}
        </colgroup>
        <thead>
          <tr>
            <th className="l">Participante</th>
            <th style={{ textAlign:'center', padding:'10px 4px', fontSize:'9px', color:'var(--mut2)', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:800 }}>Pron.</th>
            {hasTodayMatches && (
              <th onClick={() => setSortKey('hoy')} style={{ color: sortKey === 'hoy' ? '#4ade80' : '#4ade8099', textAlign:'right', padding:'10px 4px 10px 0', fontSize:'9px', fontWeight:800, letterSpacing:'.04em', textTransform:'uppercase', cursor:'pointer', userSelect:'none' }}>
                Hoy{sortKey === 'hoy' ? ' ▼' : ''}
              </th>
            )}
            {modKnockoutMatches ? (
              <>
                <th onClick={() => setSortKey('grp')} style={{ textAlign:'right', padding:'10px 4px 10px 0', fontSize:'9px', color: sortKey === 'grp' ? 'var(--txt)' : 'var(--mut2)', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:800, cursor:'pointer', userSelect:'none' }}>
                  Grp{sortKey === 'grp' ? ' ▼' : ''}
                </th>
                <th onClick={() => setSortKey('ko')} style={{ textAlign:'right', padding:'10px 4px 10px 0', fontSize:'9px', color: sortKey === 'ko' ? '#c46bff' : '#c46bff99', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:800, cursor:'pointer', userSelect:'none' }}>
                  KO{sortKey === 'ko' ? ' ▼' : ''}
                </th>
                <th onClick={() => setSortKey('total')} style={{ textAlign:'right', padding:'10px 8px 10px 0', fontSize:'9px', color: sortKey === 'total' ? 'var(--txt)' : 'var(--mut2)', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:800, cursor:'pointer', userSelect:'none' }}>
                  Total{sortKey === 'total' ? ' ▼' : ''}
                </th>
              </>
            ) : (
              <th style={{ textAlign:'right', padding:'10px 8px 10px 0', fontSize:'9px', color:'var(--mut2)', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:800 }}>Pts</th>
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.userId} className={r.isCurrentUser ? 'me' : ''}>
              <td style={{ display:'flex', alignItems:'center', gap:'11px', padding:'11px 16px', borderTop:'1px solid var(--line)', color:'var(--txt)', fontWeight:700, overflow:'hidden', minWidth:0 }}>
                <span className={`rank${r.rank <= 3 ? ` r${r.rank}` : ''}`}>{r.rank}</span>
                <span className="lbname" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>
                  {r.displayName}
                  {r.isCurrentUser && <em> · tú</em>}
                </span>
              </td>
              {/* Pronóstico — nowrap garantiza un solo renglón */}
              <td style={{ textAlign:'center', padding:'11px 4px', borderTop:'1px solid var(--line)', whiteSpace:'nowrap', overflow:'hidden' }}>
                {selected?.predVisible
                  ? predChip(r.pred?.s1 ?? null, r.pred?.s2 ?? null)
                  : <span className="predchip" style={{ color:'var(--mut2)' }}>—</span>
                }
              </td>
              {/* Hoy — 40px, padding mínimo */}
              {hasTodayMatches && (
                <td style={{ padding:'11px 4px 11px 0', textAlign:'right', borderTop:'1px solid var(--line)', fontWeight:800, fontSize:'13px', color: r.todayPoints > 0 ? '#4ade80' : 'var(--mut2)', fontFamily:'var(--font-archivo),Archivo,sans-serif' }}>
                  {r.todayPoints > 0 ? `+${r.todayPoints}` : '—'}
                </td>
              )}
              {/* Columnas de puntos */}
              {modKnockoutMatches ? (
                <>
                  <td style={{ padding:'11px 4px 11px 0', textAlign:'right', borderTop:'1px solid var(--line)', color:'var(--mut)', fontWeight:800, fontSize:'13px', fontFamily:'var(--font-archivo),Archivo,sans-serif' }}>{r.groupPoints}</td>
                  <td style={{ padding:'11px 4px 11px 0', textAlign:'right', borderTop:'1px solid var(--line)', color:'#c46bff', fontWeight:800, fontSize:'13px', fontFamily:'var(--font-archivo),Archivo,sans-serif' }}>{r.knockoutPoints}</td>
                  <td style={{ padding:'11px 8px 11px 0', textAlign:'right', borderTop:'1px solid var(--line)', color:'#fff', fontWeight:900, fontSize:'15px', fontFamily:'var(--font-archivo),Archivo,sans-serif' }}>{r.total}</td>
                </>
              ) : (
                <td style={{ padding:'11px 8px 11px 0', textAlign:'right', borderTop:'1px solid var(--line)', color:'#fff', fontWeight:900, fontSize:'15px', fontFamily:'var(--font-archivo),Archivo,sans-serif' }}>{r.total}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="lb-foot">
        {selected?.predVisible
          ? `Pronósticos para ${esName(selected.team1Name)} vs ${esName(selected.team2Name)}`
          : availableDates.length === 0
            ? 'El torneo comienza el 11 de junio · orden inicial por registro'
            : 'Los pronósticos se revelan cuando cierra el partido'
        }
      </div>
    </section>
  )

  return (
    <main className="results">

      {/* Sin partidos: solo leaderboard + reglas */}
      {availableDates.length === 0 ? (
        <>
          {leaderboard}
          {!isPodiumLocked && modGroupStandings && (
            <GroupClassSection entries={groupPredEntries} participants={participants} isLocked={isClassificationLocked} lockLabel={classificationLockLabel} />
          )}
          {isPodiumLocked && (modPodium || modGoldenBoot || modMvp) && (
            <SpecialesSection entries={specialPredEntries} participants={participants} modPodium={modPodium} modGoldenBoot={modGoldenBoot} modMvp={modMvp} />
          )}
          <ScoringRules />
        </>
      ) : (
        <>
          {/* Navegador de fecha */}
          <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'14px' }}>
            <button onClick={prevDay} disabled={!canPrev} aria-label="Día anterior"
              style={{ width:'34px', height:'34px', borderRadius:'8px', cursor: canPrev ? 'pointer' : 'default', border:'1px solid rgba(255,255,255,0.1)', background:'var(--card2)', color: canPrev ? 'var(--txt)' : 'var(--mut2)', fontFamily:'var(--font-archivo),Archivo,sans-serif', fontWeight:800, fontSize:'18px', display:'flex', alignItems:'center', justifyContent:'center', opacity: canPrev ? 1 : 0.35, transition:'.15s' }}>
              ‹
            </button>
            <span style={{ fontFamily:'var(--font-archivo),Archivo,sans-serif', fontWeight:800, fontSize:'14px', letterSpacing:'.04em', textTransform:'uppercase' as const, color:'#fff', flex:1, textAlign:'center' as const }}>
              {fmtDateLabel(selectedDate)}
            </span>
            <button onClick={nextDay} disabled={!canNext} aria-label="Día siguiente"
              style={{ width:'34px', height:'34px', borderRadius:'8px', cursor: canNext ? 'pointer' : 'default', border:'1px solid rgba(255,255,255,0.1)', background:'var(--card2)', color: canNext ? 'var(--txt)' : 'var(--mut2)', fontFamily:'var(--font-archivo),Archivo,sans-serif', fontWeight:800, fontSize:'18px', display:'flex', alignItems:'center', justifyContent:'center', opacity: canNext ? 1 : 0.35, transition:'.15s' }}>
              ›
            </button>
          </div>

          {/* Chips del día */}
          <div style={{ position:'relative', marginBottom:'18px' }}>
            <div style={{ position:'absolute', right:0, top:0, bottom:'6px', width:'36px', background:'linear-gradient(90deg,transparent,var(--bg))', pointerEvents:'none', zIndex:1 }} />
            <div style={{ display:'flex', gap:'8px', overflowX:'auto', paddingBottom:'6px', paddingRight:'36px', scrollbarWidth:'none' as const }}>
              {dayMatches.map(m => (
                <MatchChip key={m.id} match={m} selected={selected?.id === m.id} onClick={() => setSelectedId(m.id)} hasPred={userPredMatchIds.has(m.id)} />
              ))}
            </div>
          </div>

          {/* Grid leaderboard + partido */}
          <div className="res-grid">
            {leaderboard}

            {selected && (
              <section className="live-wrap">
                <div className="live-card" style={{ '--gc': color } as React.CSSProperties}>
                  <div className="live-top">
                    {isLive
                      ? <span className="live-badge"><i />{' '}EN VIVO</span>
                      : isFinished
                        ? <span style={{ display:'inline-flex', alignItems:'center', gap:'7px', fontWeight:900, fontSize:'12px', letterSpacing:'.1em', color:'#fff', background:'rgba(74,222,128,0.25)', border:'1px solid rgba(74,222,128,0.35)', padding:'6px 11px', borderRadius:'99px' }}>✓ FINALIZADO</span>
                        : <span style={{ display:'inline-flex', alignItems:'center', gap:'7px', fontWeight:900, fontSize:'12px', letterSpacing:'.1em', color:'var(--mut)', background:'rgba(255,255,255,0.07)', border:'1px solid var(--line)', padding:'6px 11px', borderRadius:'99px' }}>PROGRAMADO</span>
                    }
                    {selected.groupName && (
                      <span className="grp-pill" style={{ '--gc': color } as React.CSSProperties}>
                        {selected.groupName.replace('Group ', '')}
                      </span>
                    )}
                  </div>
                  <div className="live-body">
                    <div className="live-team">
                      <img className="flag lg" loading="lazy"
                        src={`https://flagcdn.com/w80/${flagCode(selected.team1Name)}.png`}
                        srcSet={`https://flagcdn.com/w160/${flagCode(selected.team1Name)}.png 2x`}
                        alt={esName(selected.team1Name)} />
                      <span className="lt-name">{esName(selected.team1Name)}</span>
                    </div>
                    <div className="live-score">
                      <span>{hasResult ? selected.score1 : '–'}</span>
                      <b>:</b>
                      <span>{hasResult ? selected.score2 : '–'}</span>
                    </div>
                    <div className="live-team">
                      <img className="flag lg" loading="lazy"
                        src={`https://flagcdn.com/w80/${flagCode(selected.team2Name)}.png`}
                        srcSet={`https://flagcdn.com/w160/${flagCode(selected.team2Name)}.png 2x`}
                        alt={esName(selected.team2Name)} />
                      <span className="lt-name">{esName(selected.team2Name)}</span>
                    </div>
                  </div>
                  {selected.ground && <div className="live-venue">{selected.ground}</div>}
                </div>
                <div className="live-note">
                  {isLive ? 'Partido en curso' : isFinished ? 'Resultado final' : 'Aún no ha comenzado'}
                </div>
              </section>
            )}
          </div>

          {!isPodiumLocked && modGroupStandings && (
            <GroupClassSection entries={groupPredEntries} participants={participants} isLocked={isClassificationLocked} lockLabel={classificationLockLabel} />
          )}
          {isPodiumLocked && (modPodium || modGoldenBoot || modMvp) && (
            <SpecialesSection entries={specialPredEntries} participants={participants} modPodium={modPodium} modGoldenBoot={modGoldenBoot} modMvp={modMvp} />
          )}
          <ScoringRules />
        </>
      )}
    </main>
  )
}

// ── Pronósticos de clasificación de grupos ────────────────────────────────────

const PLACE_COLORS = ['#f7c948', '#b0b8c1', '#cd7f32', 'var(--mut2)'] as const
const PLACE_LABELS = ['1°', '2°', '3°', '4°'] as const

function GroupClassSection({ entries, participants, isLocked, lockLabel }: {
  entries: GroupPredEntry[]
  participants: Participant[]
  isLocked: boolean
  lockLabel: string
}) {
  // Grupos únicos con predicciones, ordenados por nombre
  const groups = useMemo(() => {
    const seen = new Map<number, string>()
    for (const e of entries) if (!seen.has(e.groupId)) seen.set(e.groupId, e.groupName)
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [entries])

  const [selectedGroupId, setSelectedGroupId] = useState<number>(() => groups[0]?.id ?? 0)

  // Participantes del grupo seleccionado, en el mismo orden que el leaderboard
  const rows = useMemo(() => {
    const byUser = new Map(entries.filter(e => e.groupId === selectedGroupId).map(e => [e.userId, e]))
    return participants
      .filter(p => byUser.has(p.userId))
      .map(p => ({ ...p, places: byUser.get(p.userId)!.places }))
  }, [entries, selectedGroupId, participants])

  const selectedGroup = groups.find(g => g.id === selectedGroupId)
  const groupColor = selectedGroup ? (GROUP_COLORS[selectedGroup.name] ?? '#5b8cff') : '#5b8cff'
  const groupLetter = selectedGroup ? selectedGroup.name.replace('Group ', '') : ''

  return (
    <section style={{ marginTop: '10px' }}>
      {/* Header */}
      <div className="lb-head" style={{ marginBottom: '12px' }}>
        <span className="lb-ico">📋</span> Pronósticos: clasificación de grupos
      </div>

      {/* Antes del cierre: solo aviso */}
      {!isLocked && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'linear-gradient(135deg,rgba(92,139,255,0.10),rgba(124,92,255,0.08))',
          border: '1px solid rgba(92,139,255,0.20)',
          borderRadius: '12px',
          padding: '14px 16px',
          marginBottom: '4px',
        }}>
          <span style={{ fontSize: '20px', flexShrink: 0 }}>🔒</span>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--mut)' }}>
            Los pronósticos de clasificación de cada participante se revelarán el{' '}
            <strong style={{ color: '#fff' }}>{lockLabel}</strong>,
            cuando cierre este módulo.
          </p>
        </div>
      )}

      {/* Después del cierre: tabla completa */}
      {isLocked && (
        <>
          {/* Selector de grupos — scrollable en móvil */}
      <div style={{ position: 'relative', marginBottom: '14px' }}>
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '32px', background: 'linear-gradient(90deg,transparent,var(--bg))', pointerEvents: 'none', zIndex: 1 }} />
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px', paddingRight: '32px', scrollbarWidth: 'none' as const }}>
          {groups.map(g => {
            const gc = GROUP_COLORS[g.name] ?? '#5b8cff'
            const active = g.id === selectedGroupId
            const letter = g.name.replace('Group ', '')
            return (
              <button
                key={g.id}
                onClick={() => setSelectedGroupId(g.id)}
                style={{
                  flexShrink: 0,
                  padding: '5px 12px',
                  borderRadius: '99px',
                  fontFamily: 'var(--font-archivo),Archivo,sans-serif',
                  fontWeight: 900,
                  fontSize: '12px',
                  letterSpacing: '.06em',
                  cursor: 'pointer',
                  border: active ? `1.5px solid ${gc}` : '1px solid rgba(255,255,255,0.1)',
                  background: active ? `color-mix(in srgb,${gc} 18%,#0d1b32)` : 'var(--card2)',
                  color: active ? gc : 'var(--mut)',
                  transition: '.13s',
                }}
              >
                {letter}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tabla de predicciones del grupo */}
      <div style={{
        background: 'linear-gradient(180deg,#0f2040,#0a1628)',
        border: `1px solid color-mix(in srgb,${groupColor} 30%,rgba(255,255,255,0.06))`,
        borderRadius: '14px',
        overflow: 'hidden',
      }}>
        {/* Encabezado del grupo */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 14px 8px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{
            fontFamily: 'var(--font-anton),Anton,sans-serif',
            fontSize: '13px', letterSpacing: '.08em', textTransform: 'uppercase' as const,
            color: groupColor,
          }}>
            Grupo {groupLetter}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--mut2)', fontWeight: 700 }}>
            · {rows.length} {rows.length === 1 ? 'pronóstico' : 'pronósticos'}
          </span>
        </div>

        {/* Cabecera de columnas */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr repeat(4, 54px)',
          padding: '6px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase' as const, color: 'var(--mut2)' }}>Participante</span>
          {PLACE_LABELS.map((lbl, i) => (
            <span key={lbl} style={{ fontSize: '9px', fontWeight: 900, letterSpacing: '.04em', textAlign: 'center' as const, color: PLACE_COLORS[i] }}>{lbl}</span>
          ))}
        </div>

        {/* Filas */}
        {rows.length === 0 ? (
          <div style={{ padding: '18px 14px', color: 'var(--mut2)', fontSize: '13px', textAlign: 'center' as const }}>
            Nadie ha pronosticado este grupo aún
          </div>
        ) : rows.map((r, idx) => (
          <div
            key={r.userId}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr repeat(4, 54px)',
              padding: '9px 14px',
              borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.05)' : undefined,
              background: r.isCurrentUser ? 'rgba(255,255,255,0.03)' : undefined,
            }}
          >
            {/* Nombre */}
            <span style={{
              fontWeight: 700, fontSize: '13px', color: 'var(--txt)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              {r.displayName}
              {r.isCurrentUser && <em style={{ fontSize: '11px', color: 'var(--mut2)', fontStyle: 'italic' as const }}>· tú</em>}
            </span>

            {/* 4 equipos en orden */}
            {r.places.map((teamName, pi) => (
              <div key={pi} style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '3px' }}>
                <img
                  src={`https://flagcdn.com/w40/${flagCode(teamName)}.png`}
                  alt={esName(teamName)}
                  loading="lazy"
                  style={{ width: '26px', height: '17px', objectFit: 'cover', borderRadius: '2px', outline: '1px solid rgba(255,255,255,.12)' }}
                />
                <span style={{ fontSize: '8px', fontWeight: 700, color: 'var(--mut)', letterSpacing: '.02em', textAlign: 'center' as const, lineHeight: 1.1, maxWidth: '48px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                  {esName(teamName)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
        </>
      )}
    </section>
  )
}

// ── Pronósticos especiales ────────────────────────────────────────────────────

function TeamCell({ name }: { name: string | null }) {
  if (!name) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: '10px', color: 'var(--mut2)', fontWeight: 700 }}>—</span>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '3px' }}>
      <img
        src={`https://flagcdn.com/w40/${flagCode(name)}.png`}
        alt={esName(name)}
        loading="lazy"
        style={{ width: '26px', height: '17px', objectFit: 'cover' as const, borderRadius: '2px', outline: '1px solid rgba(255,255,255,.12)' }}
      />
      <span style={{ fontSize: '8px', fontWeight: 700, color: 'var(--mut)', letterSpacing: '.02em', textAlign: 'center' as const, lineHeight: 1.1, maxWidth: '48px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
        {esName(name)}
      </span>
    </div>
  )
}

function PlayerCell({ name }: { name: string | null }) {
  return (
    <span style={{
      fontSize: '10px', fontWeight: 600,
      color: name ? 'var(--txt)' : 'var(--mut2)',
      textAlign: 'center' as const,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
      display: 'block', padding: '0 2px',
    }}>
      {name ?? '—'}
    </span>
  )
}

function SpecialesSection({ entries, participants, modPodium, modGoldenBoot, modMvp }: {
  entries: SpecialPredEntry[]
  participants: Participant[]
  modPodium: boolean
  modGoldenBoot: boolean
  modMvp: boolean
}) {
  const entryByUser = new Map(entries.map(e => [e.userId, e]))
  const rows = participants.map(p => ({ ...p, entry: entryByUser.get(p.userId) ?? null }))

  const gridCols = [
    '1fr',
    ...(modPodium ? ['54px', '54px', '54px'] : []),
    ...(modGoldenBoot ? ['72px'] : []),
    ...(modMvp ? ['72px'] : []),
  ].join(' ')

  return (
    <section style={{ marginTop: '10px' }}>
      <div className="lb-head" style={{ marginBottom: '12px' }}>
        <span className="lb-ico">🏆</span> Pronósticos especiales
      </div>

      {entries.length === 0 ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'linear-gradient(135deg,rgba(247,201,72,0.06),rgba(124,92,255,0.04))',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px', padding: '14px 16px',
        }}>
          <span style={{ fontSize: '20px', flexShrink: 0 }}>🔒</span>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--mut)' }}>
            No participaste en los pronósticos especiales, por lo que no puedes ver los de los demás.
          </p>
        </div>
      ) : (
        <div style={{
          background: 'linear-gradient(180deg,#0f2040,#0a1628)',
          border: '1px solid rgba(247,201,72,0.18)',
          borderRadius: '14px', overflow: 'hidden',
        }}>
          {/* Cabecera */}
          <div style={{ display: 'grid', gridTemplateColumns: gridCols, padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase' as const, color: 'var(--mut2)' }}>Participante</span>
            {modPodium && <>
              <span style={{ fontSize: '9px', fontWeight: 900, textAlign: 'center' as const, color: '#f7c948' }}>🥇</span>
              <span style={{ fontSize: '9px', fontWeight: 900, textAlign: 'center' as const, color: '#b0b8c1' }}>🥈</span>
              <span style={{ fontSize: '9px', fontWeight: 900, textAlign: 'center' as const, color: '#cd7f32' }}>🥉</span>
            </>}
            {modGoldenBoot && <span style={{ fontSize: '9px', fontWeight: 900, textAlign: 'center' as const, color: '#f7c948' }}>⚽ Bota</span>}
            {modMvp && <span style={{ fontSize: '9px', fontWeight: 900, textAlign: 'center' as const, color: '#3dd5ff' }}>⭐ MVP</span>}
          </div>

          {/* Filas */}
          {rows.map((r, idx) => (
            <div
              key={r.userId}
              style={{
                display: 'grid', gridTemplateColumns: gridCols,
                padding: '9px 14px', alignItems: 'center',
                borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.05)' : undefined,
                background: r.isCurrentUser ? 'rgba(255,255,255,0.03)' : undefined,
              }}
            >
              <span style={{
                fontWeight: 700, fontSize: '13px', color: 'var(--txt)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                {r.displayName}
                {r.isCurrentUser && <em style={{ fontSize: '11px', color: 'var(--mut2)', fontStyle: 'italic' as const }}>· tú</em>}
              </span>
              {modPodium && <>
                <TeamCell name={r.entry?.goldTeamName ?? null} />
                <TeamCell name={r.entry?.silverTeamName ?? null} />
                <TeamCell name={r.entry?.bronzeTeamName ?? null} />
              </>}
              {modGoldenBoot && <PlayerCell name={r.entry?.goldenBootPlayerName ?? null} />}
              {modMvp && <PlayerCell name={r.entry?.mvpPlayerName ?? null} />}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Sistemas de puntuación ────────────────────────────────────────────────────

function ScoringRules() {
  return (
    <>
      {/* Partidos */}
      <section className="scoring">
        <h3>¿Cómo se puntúan los partidos?</h3>
        <div className="rules">
          {SCORING_RULES.map(r => (
            <div className="rule" key={r.p}>
              <span className="rpts">{r.p}<small>pts</small></span>
              <span className="rtxt">{r.txt}</span>
            </div>
          ))}
        </div>
        <p className="scoring-legend">
          L = goles del local · V = goles del visitante · Resultado = quién gana o empate
        </p>
      </section>

      {/* Clasificación por grupo */}
      <section className="scoring">
        <h3>¿Cómo se puntúa la clasificación por grupo?</h3>
        <div className="rules">
          {[
            { p: 5, txt: 'Los 4 equipos en el orden exacto (pleno)' },
            { p: 2, txt: '2 equipos en su posición exacta' },
            { p: 1, txt: '1 equipo en su posición exacta' },
          ].map(r => (
            <div className="rule" key={r.p}>
              <span className="rpts">{r.p}<small>pts</small></span>
              <span className="rtxt">{r.txt}</span>
            </div>
          ))}
        </div>
        <p className="scoring-legend">
          Por grupo (A–L) · se evalúa al terminar la fase de grupos
        </p>
      </section>

      {/* Especiales */}
      <section className="scoring">
        <h3>¿Cómo se puntúan los especiales?</h3>
        <div className="rules">
          {[
            { p: 7, txt: 'Campeón (oro) acertado' },
            { p: 6, txt: 'Bota de oro (máximo goleador) acertada' },
            { p: 6, txt: 'MVP del torneo acertado' },
            { p: 5, txt: 'Subcampeón (plata) acertado' },
            { p: 3, txt: 'Tercer lugar (bronce) acertado' },
          ].map(r => (
            <div className="rule" key={r.txt}>
              <span className="rpts">{r.p}<small>pts</small></span>
              <span className="rtxt">{r.txt}</span>
            </div>
          ))}
        </div>
        <p className="scoring-legend">
          Cada acierto suma independientemente · máximo 27 pts en especiales
        </p>
      </section>
    </>
  )
}
