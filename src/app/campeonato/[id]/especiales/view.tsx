'use client'

import { useState, useRef, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  saveGroupPrediction as saveGroupPredictionAction,
  saveSpecialPrediction as saveSpecialPredictionAction,
} from './actions'

// ── Public types (used by page.tsx) ──────────────────────────────────────────

export type GroupWithTeams = {
  id: number
  name: string
  teams: { id: number; name: string; flagUrl: string | null }[]
}

export type TeamRow = {
  id: number
  name: string
  flagUrl: string | null
}

export type PlayerRow = {
  id: number
  name: string
  club: string | null
  position: 'GK' | 'DEF' | 'MID' | 'FWD'
  teamId: number
  teamName: string
}

type GroupPrediction = {
  groupId: number
  firstPlace: number | null
  secondPlace: number | null
  thirdPlace: number | null
  fourthPlace: number | null
}

type SpecialPrediction = {
  goldTeamId: number | null
  silverTeamId: number | null
  bronzeTeamId: number | null
  goldenBootPlayerId: number | null
  mvpPlayerId: number | null
}

type Props = {
  championshipId: string
  userId: string
  championshipName: string
  /** Si true, oculta el back link (ya hay tabs en el layout padre) */
  embedded?: boolean
  modules: {
    groupStandings: boolean
    podium: boolean
    goldenBoot: boolean
    mvp: boolean
  }
  isClassificationLocked: boolean
  isPodiumLocked: boolean
  classificationLockLabel: string
  podiumLockLabel: string
  groups: GroupWithTeams[]
  teams: TeamRow[]
  players: PlayerRow[]
  initialGroupPredictions: GroupPrediction[]
  initialSpecialPrediction: SpecialPrediction | null
}

// ── Static data from handoff ──────────────────────────────────────────────────

const FLAG_CODES: Record<string, string> = {
  Mexico: 'mx', 'South Africa': 'za', 'South Korea': 'kr', 'Czech Republic': 'cz',
  Canada: 'ca', 'Bosnia & Herzegovina': 'ba', Qatar: 'qa', Switzerland: 'ch',
  Brazil: 'br', Morocco: 'ma', Haiti: 'ht', Scotland: 'gb-sct', USA: 'us',
  Paraguay: 'py', Australia: 'au', Turkey: 'tr', Germany: 'de', 'Curaçao': 'cw',
  'Ivory Coast': 'ci', Ecuador: 'ec', Netherlands: 'nl', Japan: 'jp', Sweden: 'se',
  Tunisia: 'tn', Belgium: 'be', Egypt: 'eg', Iran: 'ir', 'New Zealand': 'nz',
  Spain: 'es', 'Cape Verde': 'cv', 'Saudi Arabia': 'sa', Uruguay: 'uy', France: 'fr',
  Senegal: 'sn', Iraq: 'iq', Norway: 'no', Argentina: 'ar', Algeria: 'dz',
  Austria: 'at', Jordan: 'jo', Portugal: 'pt', 'DR Congo': 'cd', Uzbekistan: 'uz',
  Colombia: 'co', England: 'gb-eng', Croatia: 'hr', Ghana: 'gh', Panama: 'pa',
}

const ES_NAMES: Record<string, string> = {
  Mexico: 'México', 'South Africa': 'Sudáfrica', 'South Korea': 'Corea del Sur',
  'Czech Republic': 'Chequia', Canada: 'Canadá', 'Bosnia & Herzegovina': 'Bosnia y Herzeg.',
  Qatar: 'Catar', Switzerland: 'Suiza', Brazil: 'Brasil', Morocco: 'Marruecos',
  Haiti: 'Haití', Scotland: 'Escocia', USA: 'Estados Unidos', Paraguay: 'Paraguay',
  Australia: 'Australia', Turkey: 'Turquía', Germany: 'Alemania', 'Curaçao': 'Curazao',
  'Ivory Coast': 'Costa de Marfil', Ecuador: 'Ecuador', Netherlands: 'Países Bajos',
  Japan: 'Japón', Sweden: 'Suecia', Tunisia: 'Túnez', Belgium: 'Bélgica',
  Egypt: 'Egipto', Iran: 'Irán', 'New Zealand': 'Nueva Zelanda', Spain: 'España',
  'Cape Verde': 'Cabo Verde', 'Saudi Arabia': 'Arabia Saudita', Uruguay: 'Uruguay',
  France: 'Francia', Senegal: 'Senegal', Iraq: 'Irak', Norway: 'Noruega',
  Argentina: 'Argentina', Algeria: 'Argelia', Austria: 'Austria', Jordan: 'Jordania',
  Portugal: 'Portugal', 'DR Congo': 'RD Congo', Uzbekistan: 'Uzbekistán',
  Colombia: 'Colombia', England: 'Inglaterra', Croatia: 'Croacia', Ghana: 'Ghana',
  Panama: 'Panamá',
}

const GROUP_COLORS: Record<string, string> = {
  'Group A': '#ff2d78', 'Group B': '#ff8a3d', 'Group C': '#ffd23f',
  'Group D': '#7ee787', 'Group E': '#19e3c0', 'Group F': '#3dd5ff',
  'Group G': '#5b8cff', 'Group H': '#7c5cff', 'Group I': '#c46bff',
  'Group J': '#ff5cae', 'Group K': '#ff6b6b', 'Group L': '#9bd45b',
}

const ORD = ['1.º', '2.º', '3.º', '4.º']

const POS_ORDER = ['FWD', 'MID', 'DEF', 'GK'] as const
const POS_LABEL: Record<string, string> = {
  FWD: 'Delanteros', MID: 'Centrocampistas', DEF: 'Defensas', GK: 'Porteros',
}

function flagUrl(teamName: string) {
  const code = FLAG_CODES[teamName] ?? 'un'
  return `https://flagcdn.com/w80/${code}.png`
}
function esName(teamName: string) { return ES_NAMES[teamName] ?? teamName }

// ── SVG icons (copied from handoff) ──────────────────────────────────────────

const DragIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
    <circle cx="9" cy="6" r="1.7" /><circle cx="15" cy="6" r="1.7" />
    <circle cx="9" cy="12" r="1.7" /><circle cx="15" cy="12" r="1.7" />
    <circle cx="9" cy="18" r="1.7" /><circle cx="15" cy="18" r="1.7" />
  </svg>
)

const PencilIconSm = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

// ── EspHead — copiado del handoff ─────────────────────────────────────────────

function EspHead({
  icon, color, title, closeLabel, status,
}: {
  icon: string; color: string; title: string; closeLabel: string; status: 'open' | 'done' | 'closed'
}) {
  const statusLabel = status === 'done' ? 'Confirmado' : status === 'closed' ? 'Cerrado' : 'Abierto'
  return (
    <div className="esp-bhead">
      <span className="esp-ico" style={{ '--gc': color } as React.CSSProperties}>{icon}</span>
      <span className="esp-htxt">
        <span className="esp-title">{title}</span>
        <span className="esp-close">Cierra {closeLabel}</span>
      </span>
      <span className={`esp-status ${status}`}>{statusLabel}</span>
    </div>
  )
}

// ── EspFoot — copiado del handoff ─────────────────────────────────────────────

function EspFoot({
  locked, confirmed, canConfirm, onConfirm, onEdit, hint,
}: {
  locked: boolean; confirmed: boolean; canConfirm: boolean
  onConfirm: () => void; onEdit: () => void; hint?: string
}) {
  if (locked) {
    return (
      <div className="esp-foot">
        <span className="esp-closed-note">Pronóstico cerrado · ya no se puede modificar</span>
      </div>
    )
  }
  if (confirmed) {
    return (
      <div className="esp-foot">
        <button className="btn icon-edit" onClick={onEdit} title="Editar">
          <span style={{ display: 'inline-flex' }}>{PencilIconSm}</span>
          <span>Editar</span>
        </button>
        <span className="esp-hint">Pronóstico confirmado</span>
      </div>
    )
  }
  return (
    <div className="esp-foot">
      <button
        className={'btn confirm' + (canConfirm ? '' : ' disabled')}
        disabled={!canConfirm}
        onClick={onConfirm}
      >
        Confirmar
      </button>
      {hint && <span className="esp-hint">{hint}</span>}
    </div>
  )
}

// ── OrderList — copiado del handoff, adaptado a team objects ──────────────────

type TeamInList = { id: number; name: string }

function OrderList({
  teams, locked, onReorder, color,
}: {
  teams: TeamInList[]; locked: boolean; onReorder: (next: TeamInList[]) => void; color: string
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  return (
    <ul className="sortlist">
      {teams.map((t, i) => (
        <li
          key={t.id}
          className={
            'sortitem' +
            (i < 2 ? ' qual' : '') +
            (locked ? ' locked' : '') +
            (dragIdx === i ? ' dragging' : '')
          }
          style={{ '--gc': color } as React.CSSProperties}
          draggable={!locked}
          onDragStart={() => setDragIdx(i)}
          onDragOver={(e) => {
            e.preventDefault()
            if (dragIdx === null || dragIdx === i) return
            const next = teams.slice()
            const [moved] = next.splice(dragIdx, 1)
            next.splice(i, 0, moved)
            setDragIdx(i)
            onReorder(next)
          }}
          onDragEnd={() => setDragIdx(null)}
          onDrop={(e) => { e.preventDefault(); setDragIdx(null) }}
        >
          <span className="srank">{ORD[i]}</span>
          <img
            className="sflag"
            src={flagUrl(t.name)}
            srcSet={`https://flagcdn.com/w160/${FLAG_CODES[t.name] ?? 'un'}.png 2x`}
            alt={esName(t.name)}
            loading="lazy"
          />
          <span className="sname">{esName(t.name)}</span>
          {i < 2 && <span className="squal">Clasifica</span>}
          {!locked && <span className="shandle">{DragIcon}</span>}
        </li>
      ))}
    </ul>
  )
}

// ── TeamPlayerPicker — adaptado a datos reales de la BD ───────────────────────

function TeamPlayerPicker({
  players, state, locked, onChange,
}: {
  players: PlayerRow[]
  state: { teamId: number | null; playerId: number | null }
  locked: boolean
  onChange: (teamId: number | null, playerId: number | null) => void
}) {
  // Unique teams from loaded players, sorted by Spanish name
  const teamOptions = useMemo(() => {
    const seen = new Map<number, string>()
    for (const p of players) if (!seen.has(p.teamId)) seen.set(p.teamId, p.teamName)
    return [...seen.entries()].sort((a, b) => esName(a[1]).localeCompare(esName(b[1])))
  }, [players])

  const selectedTeamPlayers = useMemo(() => {
    if (!state.teamId) return []
    return players.filter((p) => p.teamId === state.teamId)
  }, [players, state.teamId])

  const byPos = useMemo(() =>
    POS_ORDER.map((pos) => ({
      pos, label: POS_LABEL[pos],
      ps: selectedTeamPlayers
        .filter((p) => p.position === pos)
        .sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((g) => g.ps.length > 0),
    [selectedTeamPlayers]
  )

  return (
    <div className="esp-picker tpp">
      <div className="tpp-row">
        <label className="tpp-lab">Selección</label>
        <select
          className="esp-select"
          value={state.teamId ?? ''}
          disabled={locked}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null
            onChange(id, null)
          }}
        >
          <option value="">— Elegir selección —</option>
          {teamOptions.map(([id, name]) => (
            <option key={id} value={id}>{esName(name)}</option>
          ))}
        </select>
      </div>

      {state.teamId && (
        <div className="tpp-row">
          <label className="tpp-lab">Jugador</label>
          {byPos.length === 0 ? (
            <div className="tpp-pending">
              Plantilla pendiente de cargar · disponible más cerca del torneo
            </div>
          ) : (
            <select
              className="esp-select"
              value={state.playerId ?? ''}
              disabled={locked}
              onChange={(e) => onChange(state.teamId, e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Elegir jugador —</option>
              {byPos.map(({ pos, label, ps }) => (
                <optgroup key={pos} label={label}>
                  {ps.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.club ? ` · ${p.club}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}

// ── PlayerChosen — copiado del handoff, adaptado ─────────────────────────────

function PlayerChosen({ player }: { player: PlayerRow }) {
  const code = FLAG_CODES[player.teamName] ?? 'un'
  return (
    <div className="esp-chosen">
      <img
        className="pc-flag"
        src={`https://flagcdn.com/w80/${code}.png`}
        srcSet={`https://flagcdn.com/w160/${code}.png 2x`}
        alt={esName(player.teamName)}
      />
      <div className="pc-info">
        <span className="pc-name">{player.name}</span>
        <span className="pc-team">{esName(player.teamName)}</span>
      </div>
    </div>
  )
}

// ── EspecialesView — componente principal ─────────────────────────────────────

export function EspecialesView({
  championshipId,
  userId,
  championshipName,
  modules,
  isClassificationLocked,
  isPodiumLocked,
  classificationLockLabel,
  podiumLockLabel,
  groups,
  teams,
  players,
  initialGroupPredictions,
  initialSpecialPrediction,
  embedded = false,
}: Props) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Group order state: groupId → ordered TeamInList[]
  const buildInitialOrders = (): Map<number, TeamInList[]> => {
    const m = new Map<number, TeamInList[]>()
    for (const g of groups) {
      const pred = initialGroupPredictions.find((p) => p.groupId === g.id)
      const orderedIds = pred
        ? [pred.firstPlace, pred.secondPlace, pred.thirdPlace, pred.fourthPlace].filter((x): x is number => x !== null)
        : []
      const placed: TeamInList[] = []
      for (const id of orderedIds) {
        const t = g.teams.find((x) => x.id === id)
        if (t) placed.push({ id: t.id, name: t.name })
      }
      for (const t of g.teams) {
        if (!placed.find((p) => p.id === t.id)) placed.push({ id: t.id, name: t.name })
      }
      m.set(g.id, placed)
    }
    return m
  }

  const [groupOrders, setGroupOrders] = useState<Map<number, TeamInList[]>>(buildInitialOrders)
  const [ordenConfirmed, setOrdenConfirmed] = useState(false)

  const [special, setSpecial] = useState<SpecialPrediction>(
    initialSpecialPrediction ?? {
      goldTeamId: null, silverTeamId: null, bronzeTeamId: null,
      goldenBootPlayerId: null, mvpPlayerId: null,
    },
  )
  const [podioConfirmed, setPodioConfirmed] = useState(false)
  const [botaState, setBotaState] = useState<{ teamId: number | null; playerId: number | null }>({
    teamId: initialSpecialPrediction?.goldenBootPlayerId
      ? players.find((p) => p.id === initialSpecialPrediction.goldenBootPlayerId)?.teamId ?? null
      : null,
    playerId: initialSpecialPrediction?.goldenBootPlayerId ?? null,
  })
  const [botaConfirmed, setBotaConfirmed] = useState(false)
  const [mvpState, setMvpState] = useState<{ teamId: number | null; playerId: number | null }>({
    teamId: initialSpecialPrediction?.mvpPlayerId
      ? players.find((p) => p.id === initialSpecialPrediction.mvpPlayerId)?.teamId ?? null
      : null,
    playerId: initialSpecialPrediction?.mvpPlayerId ?? null,
  })
  const [mvpConfirmed, setMvpConfirmed] = useState(false)

  // ── Save helpers ──────────────────────────────────────────────────────────

  function flash(ok: boolean) {
    setSaveStatus(ok ? 'saved' : 'error')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaveStatus('idle'), 2500)
  }

  const saveGroupOrder = useCallback(
    async (groupId: number, ordered: TeamInList[]) => {
      setSaveStatus('saving')
      const { error } = await saveGroupPredictionAction(
        championshipId, groupId,
        ordered[0]?.id ?? null, ordered[1]?.id ?? null,
        ordered[2]?.id ?? null, ordered[3]?.id ?? null,
      )
      flash(!error)
    },
    [championshipId],
  )

  const saveSpecial = useCallback(
    async (patch: Partial<SpecialPrediction>) => {
      setSaveStatus('saving')
      const next = { ...special, ...patch }
      const { error } = await saveSpecialPredictionAction(
        championshipId,
        next.goldTeamId, next.silverTeamId, next.bronzeTeamId,
        next.goldenBootPlayerId, next.mvpPlayerId,
      )
      flash(!error)
      return next
    },
    [championshipId, special],
  )

  // ── Derived values ────────────────────────────────────────────────────────

  // Selector de grupo activo
  const [selectedGroup, setSelectedGroup] = useState(groups[0]?.name ?? 'Group A')

  const currentGroupData = groups.find((g) => g.name === selectedGroup)
  const currentOrder = currentGroupData ? (groupOrders.get(currentGroupData.id) ?? []) : []
  const gColor = GROUP_COLORS[selectedGroup] ?? '#3b9ae1'

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams])
  const podioReady =
    special.goldTeamId !== null &&
    special.silverTeamId !== null &&
    special.bronzeTeamId !== null &&
    new Set([special.goldTeamId, special.silverTeamId, special.bronzeTeamId]).size === 3

  const teamsAlpha = useMemo(
    () => teams.slice().sort((a, b) => esName(a.name).localeCompare(esName(b.name))),
    [teams],
  )

  // Podio slots — mismo orden visual que handoff: Plata | Oro | Bronce
  const podSlots = [
    { k: 'silver' as const, cls: 'g2', medal: '2', label: 'Plata', fieldId: 'silverTeamId' as const },
    { k: 'gold'   as const, cls: 'g1', medal: '1', label: 'Oro',   fieldId: 'goldTeamId'   as const },
    { k: 'bronze' as const, cls: 'g3', medal: '3', label: 'Bronce', fieldId: 'bronzeTeamId' as const },
  ]

  const podioReserved = [special.goldTeamId, special.silverTeamId, special.bronzeTeamId].filter(Boolean) as number[]

  // ── Render ────────────────────────────────────────────────────────────────

  const hasAnyModule = modules.groupStandings || modules.podium || modules.goldenBoot || modules.mvp

  return (
    <>
      {/* Save toast */}
      {saveStatus !== 'idle' && (
        <div
          className="esp-save-toast"
          style={{
            background: saveStatus === 'saving' ? 'rgba(59,154,225,0.18)' : saveStatus === 'saved' ? 'rgba(74,222,128,0.15)' : 'rgba(232,67,79,0.15)',
            borderColor: saveStatus === 'saving' ? '#3b9ae1' : saveStatus === 'saved' ? '#4ade80' : '#e8434f',
            color: saveStatus === 'saving' ? '#3b9ae1' : saveStatus === 'saved' ? '#4ade80' : '#e8434f',
          }}
        >
          {saveStatus === 'saving' ? '● Guardando…' : saveStatus === 'saved' ? '✓ Guardado' : '✕ Error'}
        </div>
      )}

      {/* Back link — solo cuando es página directa, no embebida en el app */}
      {!embedded && (
        <div style={{ marginBottom: '8px' }}>
          <Link href={`/campeonato/${championshipId}`} style={{ fontFamily: 'var(--font-archivo), Archivo, sans-serif', fontWeight: 600, fontSize: '0.8rem', color: 'var(--mut2)', textDecoration: 'none' }}>
            ← {championshipName}
          </Link>
        </div>
      )}

      <main className="esp-wrap">

        {/* ── 1. Orden de grupos ── */}
        {modules.groupStandings && (
          <section className="esp-block">
            <EspHead
              icon="#" color={gColor} title="Orden de los grupos"
              closeLabel={classificationLockLabel}
              status={isClassificationLocked ? 'closed' : ordenConfirmed ? 'done' : 'open'}
            />
            <div className="esp-body">
              <div className="esp-grpsel">
                {groups.map((g) => {
                  const col = GROUP_COLORS[g.name] ?? '#3b9ae1'
                  const groupLetter = g.name.replace('Group ', '')
                  return (
                    <button
                      key={g.id}
                      className={'chip' + (selectedGroup === g.name ? ' on' : '')}
                      style={{ '--gc': col } as React.CSSProperties}
                      onClick={() => setSelectedGroup(g.name)}
                    >
                      <i style={{ background: col }} />
                      {groupLetter}
                    </button>
                  )
                })}
              </div>

              <OrderList
                teams={currentOrder}
                locked={isClassificationLocked || ordenConfirmed}
                color={gColor}
                onReorder={(next) => {
                  if (!currentGroupData) return
                  setGroupOrders((prev) => new Map(prev).set(currentGroupData.id, next))
                  saveGroupOrder(currentGroupData.id, next)
                }}
              />

              {!isClassificationLocked && !ordenConfirmed && (
                <p className="sort-hint">Arrastra para ordenar del 1.º al 4.º · los dos primeros clasifican</p>
              )}

              <EspFoot
                locked={isClassificationLocked}
                confirmed={ordenConfirmed}
                canConfirm={true}
                onConfirm={() => {
                  setOrdenConfirmed(true)
                  if (currentGroupData) saveGroupOrder(currentGroupData.id, currentOrder)
                }}
                onEdit={() => setOrdenConfirmed(false)}
                hint="Confirma el orden de los 12 grupos"
              />
            </div>
          </section>
        )}

        {/* ── 2. Podio ── */}
        {modules.podium && (
          <section className="esp-block">
            <EspHead
              icon="★" color="#f7c948" title="Podio"
              closeLabel={podiumLockLabel}
              status={isPodiumLocked ? 'closed' : podioConfirmed ? 'done' : 'open'}
            />
            <div className="esp-body">
              {/* Gradas de podio */}
              <div className="podium">
                {podSlots.map((s) => {
                  const teamId = special[s.fieldId]
                  const team = teamId ? teamsById.get(teamId) : null
                  return (
                    <div className={'pod-slot ' + s.cls} key={s.k}>
                      <div className="pod-stand">
                        <span className="pod-medal">{s.medal}</span>
                        <div className="pod-disp">
                          {team ? (
                            <>
                              <img
                                className="pod-flag"
                                src={flagUrl(team.name)}
                                alt={esName(team.name)}
                              />
                              <span className="pod-name">{esName(team.name)}</span>
                            </>
                          ) : (
                            <span className="pod-empty">—</span>
                          )}
                        </div>
                        <div className="pod-riser" />
                      </div>
                      <span className="pod-label">{s.label}</span>
                    </div>
                  )
                })}
              </div>

              {/* Selectores bajo el podio */}
              {!isPodiumLocked && !podioConfirmed && (
                <div className="podium-picks">
                  {podSlots.map((s) => {
                    const others = podioReserved.filter((id) => id !== special[s.fieldId])
                    return (
                      <div className="pp-cell" key={s.k}>
                        <label>{s.label}</label>
                        <select
                          className="esp-select"
                          value={special[s.fieldId] ?? ''}
                          onChange={async (e) => {
                            const val = e.target.value ? Number(e.target.value) : null
                            const next = { ...special, [s.fieldId]: val }
                            setSpecial(next)
                            await saveSpecial({ [s.fieldId]: val })
                          }}
                        >
                          <option value="">— Elegir —</option>
                          {teamsAlpha.map((t) => (
                            <option key={t.id} value={t.id} disabled={others.includes(t.id)}>
                              {esName(t.name)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
              )}

              <EspFoot
                locked={isPodiumLocked}
                confirmed={podioConfirmed}
                canConfirm={podioReady}
                onConfirm={async () => {
                  await saveSpecial({})
                  setPodioConfirmed(true)
                }}
                onEdit={() => setPodioConfirmed(false)}
                hint="Elige oro, plata y bronce (equipos distintos)"
              />
            </div>
          </section>
        )}

        {/* ── 3. Bota de oro ── */}
        {modules.goldenBoot && (
          <section className="esp-block">
            <EspHead
              icon="⚽" color="#f7c948" title="Bota de Oro"
              closeLabel={podiumLockLabel}
              status={isPodiumLocked ? 'closed' : botaConfirmed ? 'done' : 'open'}
            />
            <div className="esp-body">
              {botaConfirmed && botaState.playerId ? (
                <PlayerChosen player={players.find((p) => p.id === botaState.playerId)!} />
              ) : (
                <TeamPlayerPicker
                  players={players}
                  state={botaState}
                  locked={isPodiumLocked || botaConfirmed}
                  onChange={async (teamId, playerId) => {
                    setBotaState({ teamId, playerId })
                    if (playerId !== null) {
                      const next = await saveSpecial({ goldenBootPlayerId: playerId })
                      setSpecial(next)
                    }
                  }}
                />
              )}
              <EspFoot
                locked={isPodiumLocked}
                confirmed={botaConfirmed}
                canConfirm={!!(botaState.teamId && botaState.playerId)}
                onConfirm={async () => {
                  if (botaState.playerId) {
                    const next = await saveSpecial({ goldenBootPlayerId: botaState.playerId })
                    setSpecial(next)
                  }
                  setBotaConfirmed(true)
                }}
                onEdit={() => setBotaConfirmed(false)}
                hint="Máximo goleador del torneo"
              />
            </div>
          </section>
        )}

        {/* ── 4. MVP ── */}
        {modules.mvp && (
          <section className="esp-block">
            <EspHead
              icon="♛" color="#f7c948" title="MVP"
              closeLabel={podiumLockLabel}
              status={isPodiumLocked ? 'closed' : mvpConfirmed ? 'done' : 'open'}
            />
            <div className="esp-body">
              {mvpConfirmed && mvpState.playerId ? (
                <PlayerChosen player={players.find((p) => p.id === mvpState.playerId)!} />
              ) : (
                <TeamPlayerPicker
                  players={players}
                  state={mvpState}
                  locked={isPodiumLocked || mvpConfirmed}
                  onChange={async (teamId, playerId) => {
                    setMvpState({ teamId, playerId })
                    if (playerId !== null) {
                      const next = await saveSpecial({ mvpPlayerId: playerId })
                      setSpecial(next)
                    }
                  }}
                />
              )}
              <EspFoot
                locked={isPodiumLocked}
                confirmed={mvpConfirmed}
                canConfirm={!!(mvpState.teamId && mvpState.playerId)}
                onConfirm={async () => {
                  if (mvpState.playerId) {
                    const next = await saveSpecial({ mvpPlayerId: mvpState.playerId })
                    setSpecial(next)
                  }
                  setMvpConfirmed(true)
                }}
                onEdit={() => setMvpConfirmed(false)}
                hint="Mejor jugador del torneo"
              />
            </div>
          </section>
        )}

        {!hasAnyModule && (
          <section className="esp-block">
            <div className="esp-body" style={{ textAlign: 'center', padding: '2rem' }}>
              <p style={{ color: 'var(--mut)', fontWeight: 600, margin: '0 0 1rem' }}>
                Este campeonato no tiene módulos especiales activos.
              </p>
              <Link
                href={`/campeonato/${championshipId}/ajustes`}
                style={{ color: 'var(--vio)', fontWeight: 700, fontSize: '0.875rem' }}
              >
                Configurar módulos →
              </Link>
            </div>
          </section>
        )}

      </main>
    </>
  )
}
