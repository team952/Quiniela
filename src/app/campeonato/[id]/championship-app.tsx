'use client'

import { useState } from 'react'
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
        <button className={'tab' + (tab === 'esp' ? ' on' : '')} onClick={() => setTab('esp')}>
          Especiales
        </button>
        <button className={'tab' + (tab === 'cal' ? ' on' : '')} onClick={() => setTab('cal')}>
          Calendario
        </button>
        <button className={'tab' + (tab === 'grp' ? ' on' : '')} onClick={() => setTab('grp')}>
          Tablas de grupo
        </button>
        <button className={'tab' + (tab === 'res' ? ' on' : '')} onClick={() => setTab('res')}>
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
