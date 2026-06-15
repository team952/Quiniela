'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { EspecialesView, type GroupWithTeams, type PlayerRow, type TeamRow } from './especiales/view'
import { CalendarioView, type MatchForCal, type InitPred } from './calendario/calendario-view'
import { TablaView, type GroupStanding } from './tablas/tablas-view'
import { ResultadosView, type Participant, type ResultMatch, type PredsByMatch, type GroupPredEntry } from './resultados/resultados-view'

type Props = {
  championshipId: string
  userId: string
  championshipName: string
  displayName: string
  isCreator: boolean
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
  initialGroupPredictions: {
    groupId: number
    firstPlace: number | null
    secondPlace: number | null
    thirdPlace: number | null
    fourthPlace: number | null
  }[]
  initialSpecialPrediction: {
    goldTeamId: number | null
    silverTeamId: number | null
    bronzeTeamId: number | null
    goldenBootPlayerId: number | null
    mvpPlayerId: number | null
  } | null
  groupMatches: MatchForCal[]
  initialMatchPredictions: InitPred[]
  groupStandings: GroupStanding[]
  participants: Participant[]
  resultMatches: ResultMatch[]
  predsByMatch: PredsByMatch
  hasTodayMatches: boolean
  groupPredEntries: GroupPredEntry[]
  modGroupStandings: boolean
  otherChampionships: { id: string; name: string }[]
}

type Tab = 'esp' | 'cal' | 'grp' | 'res'

// Fotogramas clave de la secuencia de fondo del hero
// (public/sec/Reducido00..59.jpg, 60 imágenes a 30 fps) asociados a cada pestaña.
const TAB_FRAME: Record<Tab, number> = {
  esp: 0,
  cal: 17,
  grp: 25,
  res: 59,
}

const TOTAL_FRAMES = 60
const FRAME_DURATION_MS = 1000 / 30

// Subir este número cada vez que se reemplacen las imágenes de public/sec/:
// cambia la URL y evita que el navegador siga sirviendo las versiones
// anteriores desde caché con el mismo nombre de archivo.
const FRAME_ASSET_VERSION = 2

function frameSrc(frame: number) {
  return `/quiniela/sec/Reducido${String(frame).padStart(2, '0')}.jpg?v=${FRAME_ASSET_VERSION}`
}

export function ChampionshipApp({
  championshipId,
  userId,
  championshipName,
  displayName,
  isCreator,
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
  groupMatches,
  initialMatchPredictions,
  groupStandings,
  participants,
  resultMatches,
  predsByMatch,
  hasTodayMatches,
  groupPredEntries,
  modGroupStandings,
  otherChampionships,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('cal')
  const [bgReady, setBgReady] = useState(false)
  const bgRef = useRef<HTMLImageElement>(null)
  const bgFrameRef = useRef(0)
  const bgCleanupRef = useRef<(() => void) | null>(null)
  const frameUrlsRef = useRef<string[]>([])

  // El <img> del fondo viene en el HTML servido por SSR: si ya termina de
  // cargar antes de que React hidrate y registre `onLoad`, ese evento nativo
  // se pierde y `bgReady` nunca pasa a true. Si al montar ya está completa,
  // la marcamos lista directamente.
  useEffect(() => {
    if (bgRef.current?.complete) setBgReady(true)
  }, [])

  // Precarga las 61 imágenes como blob URLs en memoria: así el cambio de
  // fotograma (cada ~33ms) es instantáneo, sin depender de la latencia de
  // red de cada `<img src>` (en local los ficheros se sirven al instante,
  // pero desplegado cada cambio de src dispara una petición y los fotogramas
  // intermedios nunca llegan a pintarse).
  useEffect(() => {
    let cancelled = false
    Promise.all(
      Array.from({ length: TOTAL_FRAMES }, (_, i) =>
        fetch(frameSrc(i))
          .then(res => res.blob())
          .then(blob => {
            if (!cancelled) frameUrlsRef.current[i] = URL.createObjectURL(blob)
          })
      )
    )
    return () => {
      cancelled = true
      bgCleanupRef.current?.()
      frameUrlsRef.current.forEach(url => url && URL.revokeObjectURL(url))
    }
  }, [])

  // Recorre la secuencia de fotogramas desde el actual hasta `target`, hacia
  // delante o hacia atrás según corresponda, sin saltos ni loops.
  function seekFrameTo(target: number) {
    const img = bgRef.current
    if (!img) return

    bgCleanupRef.current?.()
    bgCleanupRef.current = null

    const start = bgFrameRef.current
    const dir = target > start ? 1 : target < start ? -1 : 0
    if (dir === 0) return

    // Si los fotogramas aún no están cacheados en memoria, salta directo
    // al destino sin animar (evita el "tirón" mientras carga la secuencia).
    if (!frameUrlsRef.current[target]) {
      bgFrameRef.current = target
      img.src = frameSrc(target)
      return
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null

    function step() {
      const next = bgFrameRef.current + dir
      bgFrameRef.current = next
      img!.src = frameUrlsRef.current[next] ?? frameSrc(next)
      if (next === target) {
        bgCleanupRef.current = null
        return
      }
      timeoutId = setTimeout(step, FRAME_DURATION_MS)
    }

    bgCleanupRef.current = () => {
      if (timeoutId !== null) clearTimeout(timeoutId)
    }

    step()
  }

  function selectTab(next: Tab) {
    setTab(next)
    seekFrameTo(TAB_FRAME[next])
  }

  // ── Realtime — refresca la vista cuando el polling de resultados en vivo
  // (y su cascada de puntuación) actualiza matches/standings/predictions/championship_users.
  // Si el canal se cae (corte de red, límite del plan free), se reconecta solo
  // y al reconectar pide un refresh único para ponerse al día — sin pollear
  // por tiempo, para no gastar datos de quienes tienen internet limitado.
  useEffect(() => {
    const supabase = createClient()
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let reconnectId: ReturnType<typeof setTimeout> | null = null
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    let hadError = false

    function scheduleRefresh() {
      if (timeoutId !== null) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        timeoutId = null
        router.refresh()
      }, 1000)
    }

    function connect() {
      channel = supabase
        .channel(`live-updates-${championshipId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, scheduleRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'standings' }, scheduleRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'championship_users', filter: `championship_id=eq.${championshipId}` }, scheduleRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions', filter: `championship_id=eq.${championshipId}` }, scheduleRefresh)
        .subscribe((status) => {
          if (cancelled) return
          if (status === 'SUBSCRIBED') {
            if (hadError) {
              hadError = false
              router.refresh()
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            hadError = true
            if (channel) supabase.removeChannel(channel)
            reconnectId = setTimeout(connect, 3000)
          }
        })
    }

    connect()

    return () => {
      cancelled = true
      if (timeoutId !== null) clearTimeout(timeoutId)
      if (reconnectId !== null) clearTimeout(reconnectId)
      if (channel) supabase.removeChannel(channel)
    }
  }, [championshipId, router])

  // Set de matchIds con pronóstico confirmado — compartido entre Calendario y Resultados.
  // Arranca con las predicciones cargadas del servidor y crece cuando el usuario confirma.
  const [confirmedMatchIds, setConfirmedMatchIds] = useState<Set<number>>(
    () => new Set(initialMatchPredictions.map(p => p.matchId))
  )
  function handlePredictionConfirmed(matchId: number) {
    setConfirmedMatchIds(prev => new Set([...prev, matchId]))
  }

  return (
    <div className="wrap">

      {/* ── Hero — fondo animado en sincronía con las pestañas ── */}
      <header className="hero">
        <div className="hero-art" role="img" aria-label={`Campeonato ${championshipName}`}>
          <img
            ref={bgRef}
            className={'hero-bg' + (bgReady ? ' ready' : '')}
            src={frameSrc(0)}
            alt=""
            onLoad={() => setBgReady(true)}
          />
          {/* Overlay con nombre del campeonato */}
          <div className="hero-info">
            <p className="hero-champ-label">Campeonato</p>
            <h1 className="hero-champ-name">{championshipName}</h1>
            <p className="hero-member">
              Jugando como: <strong>{displayName}</strong>
            </p>
          </div>
        </div>
      </header>

      {/* ── Tabs de navegación ── */}
      <div className="tabs">
        <button className={'tab' + (tab === 'esp' ? ' on' : '')} onClick={() => selectTab('esp')}>
          Especiales
        </button>
        <button className={'tab' + (tab === 'cal' ? ' on' : '')} onClick={() => selectTab('cal')}>
          Calendario
        </button>
        <button className={'tab' + (tab === 'grp' ? ' on' : '')} onClick={() => selectTab('grp')}>
          Tablas de grupo
        </button>
        <button className={'tab' + (tab === 'res' ? ' on' : '')} onClick={() => selectTab('res')}>
          Resultados
        </button>
        {isCreator && (
          <button
            className="tab settings"
            onClick={() => router.push(`/campeonato/${championshipId}/configurar`)}
          >
            ⚙ Ajustes
          </button>
        )}
      </div>

      {/* ── Contenido de cada tab ──────────────────────────────────────────────
           Todos los tabs se montan una vez y se muestran/ocultan con CSS.
           Esto preserva el estado local (pronósticos confirmados, orden de grupos,
           podio seleccionado) al cambiar de pestaña sin necesidad de re-fetch.
      ── */}

      <div style={{ display: tab === 'esp' ? 'block' : 'none' }}>
        <EspecialesView
          championshipId={championshipId}
          userId={userId}
          championshipName={championshipName}
          modules={modules}
          isClassificationLocked={isClassificationLocked}
          isPodiumLocked={isPodiumLocked}
          classificationLockLabel={classificationLockLabel}
          podiumLockLabel={podiumLockLabel}
          groups={groups}
          teams={teams}
          players={players}
          initialGroupPredictions={initialGroupPredictions}
          initialSpecialPrediction={initialSpecialPrediction}
          embedded
        />
      </div>

      <div style={{ display: tab === 'cal' ? 'block' : 'none' }}>
        <CalendarioView
          championshipId={championshipId}
          matches={groupMatches}
          initialPredictions={initialMatchPredictions}
          onPredictionConfirmed={handlePredictionConfirmed}
          otherChampionships={otherChampionships}
        />
      </div>

      <div style={{ display: tab === 'grp' ? 'block' : 'none' }}>
        <TablaView groups={groupStandings} />
      </div>

      <div style={{ display: tab === 'res' ? 'block' : 'none' }}>
        <ResultadosView
          participants={participants}
          resultMatches={resultMatches}
          predsByMatch={predsByMatch}
          userPredMatchIds={confirmedMatchIds}
          hasTodayMatches={hasTodayMatches}
          groupPredEntries={groupPredEntries}
          modGroupStandings={modGroupStandings}
          isClassificationLocked={isClassificationLocked}
          classificationLockLabel={classificationLockLabel}
        />
      </div>

    </div>
  )
}
