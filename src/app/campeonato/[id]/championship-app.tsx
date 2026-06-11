'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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

// Momentos del vídeo de fondo del hero (vidfondo.mp4) asociados a cada pestaña.
const TAB_VIDEO_TIME: Record<Tab, number> = {
  esp: 0,
  cal: 0.417,
  grp: 0.917,
  res: 1.5,
}

// vidfondo.mp4 está a 24 fps.
const FRAME_STEP = 1 / 24
const FRAME_DURATION_MS = 1000 / 24

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
  const [videoReady, setVideoReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const videoCleanupRef = useRef<(() => void) | null>(null)
  const videoInteractedRef = useRef(false)

  // Recorre el vídeo fotograma a fotograma desde su posición actual hasta
  // `target`, hacia delante o hacia atrás según corresponda, sin loops ni
  // rodeos. El ritmo se marca con un temporizador a la velocidad real del
  // vídeo (24 fps) en vez de encadenar por el evento `seeked`: en Safari
  // ese evento se dispara casi al instante y los fotogramas pasaban volando.
  function seekVideoTo(target: number) {
    const video = videoRef.current
    if (!video) return

    videoCleanupRef.current?.()
    videoCleanupRef.current = null
    videoInteractedRef.current = true
    setVideoReady(true)
    video.pause()

    const start = video.currentTime
    const dir = target > start ? 1 : target < start ? -1 : 0
    if (dir === 0) return

    let timeoutId: ReturnType<typeof setTimeout> | null = null

    function step() {
      const t = video!.currentTime
      const reached = dir > 0 ? t >= target - 0.001 : t <= target + 0.001
      if (reached) {
        if (Math.abs(t - target) > 0.001) video!.currentTime = target
        videoCleanupRef.current = null
        return
      }
      const next = t + dir * FRAME_STEP
      const overshoot = dir > 0 ? next >= target : next <= target
      video!.currentTime = overshoot ? target : next
      timeoutId = setTimeout(step, FRAME_DURATION_MS)
    }

    videoCleanupRef.current = () => {
      if (timeoutId !== null) clearTimeout(timeoutId)
    }

    step()
  }

  useEffect(() => {
    return () => {
      videoCleanupRef.current?.()
    }
  }, [])

  function selectTab(next: Tab) {
    setTab(next)
    seekVideoTo(TAB_VIDEO_TIME[next])
  }

  // En móvil (sobre todo iOS) el vídeo no decodifica/buffera fotogramas hasta
  // que se reproduce al menos una vez, aunque tenga preload="auto". Dejamos
  // que el clip (autoplay, mudo, ~2s) se reproduzca entero una vez al cargar
  // para forzar el buffering completo, y al terminar lo dejamos fijo en el
  // fotograma de la pestaña activa (salvo que el usuario ya haya interactuado).
  function handleVideoReady() {
    if (videoInteractedRef.current) return
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = TAB_VIDEO_TIME[tab]
    }
    setVideoReady(true)
  }

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

      {/* ── Hero — imagen fija que no cambia al navegar tabs ── */}
      <header className="hero">
        <div className="hero-art" role="img" aria-label={`Campeonato ${championshipName}`}>
          <video
            ref={videoRef}
            className={'hero-video' + (videoReady ? ' ready' : '')}
            src="/quiniela/vidfondo.mp4"
            muted
            playsInline
            autoPlay
            preload="auto"
            onEnded={handleVideoReady}
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
