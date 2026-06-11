/**
 * GET /api/poll-live
 *
 * Endpoint de polling de resultados en vivo via football-data.org.
 * Llamado por Vercel Cron (cada minuto) y/o por un cron externo (ej. cron-job.org cada 30s).
 *
 * Flujo:
 *  1. Verificar Authorization: Bearer {CRON_SECRET}
 *  2. Si no hay partidos pendientes HOY → retorna sin llamar a la API (ahorra cuota)
 *  3. Obtiene los partidos del día desde football-data.org
 *  4. Para partidos EN VIVO    → actualiza score en matches (sin cascade)
 *  5. Para partidos FINALIZADOS → llama processMatchResult (cascade completo)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processMatchResult } from '@/lib/scoring/engine'

const FD_BASE    = 'https://api.football-data.org/v4'
const FD_KEY     = process.env.FOOTBALL_DATA_API_KEY ?? ''
const CRON_SECRET = process.env.CRON_SECRET ?? ''

type FDScore = { home: number | null; away: number | null }
type FDMatch = {
  id: number
  status: 'SCHEDULED' | 'TIMED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'POSTPONED' | 'CANCELLED'
  homeTeam: { name: string }
  awayTeam: { name: string }
  score: {
    duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT'
    fullTime:   FDScore
    extraTime?: FDScore
    penalties?: FDScore
  }
}

function makeAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!FD_KEY || FD_KEY === 'TU_TOKEN_AQUI') {
    return NextResponse.json({ error: 'FOOTBALL_DATA_API_KEY not configured' }, { status: 500 })
  }

  const admin = makeAdmin()

  // ── 2. ¿Hay partidos pendientes hoy? ──────────────────────────────────────
  // Usa la fecha en America/New_York (hora del torneo) y también el día anterior
  // por si un partido nocturno de ET cruza medianoche UTC.
  const now = new Date()
  const todayET = toETDate(now)
  const yesterdayET = toETDate(new Date(now.getTime() - 24 * 60 * 60 * 1000))

  const { data: pendingMatches } = await admin
    .from('matches')
    .select('id, fd_match_id, score1, score2, status, date')
    .not('fd_match_id', 'is', null)
    .neq('status', 'finished')
    .in('date', [todayET, yesterdayET])

  if (!pendingMatches?.length) {
    return NextResponse.json({ updated: 0, skipped: 0, message: 'No pending matches today' })
  }

  // ── 3. Obtener partidos del día desde football-data.org ────────────────────
  // football-data.org filtra por utcDate (UTC), no por fecha ET. Un partido
  // nocturno de hoy en ET (p. ej. 22:00 ET) cae en el día UTC SIGUIENTE, así
  // que ampliamos el rango un día en cada extremo para no perdernos esos casos.
  const fdRes = await fetch(
    `${FD_BASE}/competitions/WC/matches?dateFrom=${yesterdayET}&dateTo=${addDaysToISODate(todayET, 1)}`,
    {
      headers: { 'X-Auth-Token': FD_KEY },
      // No cache — siempre queremos datos frescos
      cache: 'no-store',
    },
  )

  if (!fdRes.ok) {
    const body = await fdRes.text()
    return NextResponse.json(
      { error: `football-data.org error: ${fdRes.status}`, detail: body },
      { status: 502 },
    )
  }

  const { matches: fdMatches } = await fdRes.json() as { matches: FDMatch[] }

  // Índice por fd_match_id
  const fdById = new Map(fdMatches.map(m => [m.id, m]))

  // ── 4 & 5. Procesar cada partido pendiente ─────────────────────────────────
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (const match of pendingMatches) {
    const fdId  = match.fd_match_id as number
    const fdMatch = fdById.get(fdId)

    if (!fdMatch) { skipped++; continue }

    const { status: fdStatus, score } = fdMatch
    const home = score.fullTime.home ?? 0
    const away = score.fullTime.away ?? 0

    if (fdStatus === 'IN_PLAY' || fdStatus === 'PAUSED') {
      // Partido en curso — actualizar marcador visible SIN cascade
      // (el motor de puntuación solo corre al finalizar)
      const sameScore = match.score1 === home && match.score2 === away
      const alreadyLive = match.status === 'live'
      if (sameScore && alreadyLive) { skipped++; continue }

      const { error } = await admin
        .from('matches')
        .update({ score1: home, score2: away, status: 'live' })
        .eq('id', match.id as number)

      if (error) { errors.push(`live update match ${match.id}: ${error.message}`); continue }
      updated++

    } else if (fdStatus === 'FINISHED') {
      // Partido finalizado — cascade completo
      // Para eliminatoria con penales usamos score regulación (fullTime), no penales,
      // para el marcador del pronóstico; los penales se guardan aparte.
      let penalty1: number | null = null
      let penalty2: number | null = null

      if (score.duration === 'PENALTY_SHOOTOUT') {
        penalty1 = score.penalties?.home ?? null
        penalty2 = score.penalties?.away ?? null
      }

      const result = await processMatchResult(admin, {
        matchId: match.id as number,
        score1:  home,
        score2:  away,
        penalty1,
        penalty2,
      })

      if (result.errors.length > 0) {
        errors.push(...result.errors.map(e => `match ${match.id}: ${e}`))
      } else {
        updated++
      }

    } else {
      // SCHEDULED, TIMED, POSTPONED, CANCELLED — nada que hacer
      skipped++
    }
  }

  return NextResponse.json({
    updated,
    skipped,
    errors,
    checkedAt: now.toISOString(),
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toETDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d)
}

function addDaysToISODate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
