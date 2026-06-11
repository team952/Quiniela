/**
 * Fechas de cierre globales del torneo — iguales para todos los campeonatos.
 * Por defecto a las 00:00 America/New_York (EDT en junio/julio 2026 = UTC-4),
 * salvo excepciones puntuales documentadas junto a la constante.
 *
 * NO se usa un offset fijo: la hora UTC se deriva del runtime de Intl para
 * que funcione correctamente si el sistema operativo tiene los datos de tz
 * actualizados (p. ej. si NY cambiara de EDT a EST en un ajuste político futuro).
 */

export const LOCK_TIMEZONE = 'America/New_York'

/**
 * Cierra la clasificación por grupo: 2026-06-11 12:00 ET.
 * Excepción puntual: el cierre normal era 00:00 ET, pero se extendió hasta
 * el mediodía de ese mismo día porque varios participantes (incluido el
 * creador) no llegaron a tiempo a las 00:00.
 */
export const CLASSIFICATION_LOCK = localTimeToUTC('2026-06-11', 12, LOCK_TIMEZONE)

/** Cierra podio, bota de oro y MVP: 2026-06-28 00:00 ET */
export const PODIUM_BOOT_MVP_LOCK = localMidnightToUTC('2026-06-28', LOCK_TIMEZONE)

/**
 * Excepciones puntuales al cierre diario de partidos (normalmente 00:00 ET
 * del día del partido, ver `isMatchLocked`). Mismo motivo que
 * `CLASSIFICATION_LOCK`: el 2026-06-11 se descubrió tarde que el cierre de
 * medianoche ya había pasado, así que SOLO los partidos de ESE día se
 * bloquean a las 12:00 ET en vez de 00:00 ET. El resto de los días sigue
 * siendo 00:00 ET (no listados aquí).
 */
const MATCH_LOCK_HOUR_OVERRIDES: Record<string, number> = {
  '2026-06-11': 12,
}

/** true si la fecha de cierre ya pasó (usa `now` inyectable para tests). */
export function isModuleLocked(lock: Date, now: Date = new Date()): boolean {
  return now >= lock
}

/**
 * true si el partido ya está bloqueado.
 * El cierre es las 00:00 America/New_York del día del partido (salvo
 * excepción puntual en `MATCH_LOCK_HOUR_OVERRIDES`), derivado de kickoff_utc
 * (fuente de verdad). Si kickoff_utc es null (eliminatoria sin fecha), el
 * partido NO está bloqueado.
 */
export function isMatchLocked(kickoffUtc: string | null): boolean {
  if (!kickoffUtc) return false
  const matchDateET = new Intl.DateTimeFormat('en-CA', {
    timeZone: LOCK_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(kickoffUtc))
  const lockHour = MATCH_LOCK_HOUR_OVERRIDES[matchDateET] ?? 0
  return Date.now() >= localTimeToUTC(matchDateET, lockHour, LOCK_TIMEZONE).getTime()
}

/**
 * Formatea una fecha de cierre para mostrar en la UI:
 * "11 jun 2026, 12:00 ET"
 */
export function formatLockDate(lock: Date): string {
  const parts = new Intl.DateTimeFormat('es', {
    timeZone: LOCK_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(lock)

  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  const year = parts.find((p) => p.type === 'year')?.value ?? ''
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
  // hour12: false puede devolver "24" para medianoche; lo normalizamos.
  const hour = String(parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24).padStart(2, '0')

  return `${day} ${month} ${year}, ${hour}:${minute} ET`
}

/**
 * Devuelve el instante UTC correspondiente a las 00:00 de MAÑANA en `tz`.
 * Útil para saber si quedan partidos de eliminatoria con lock en el futuro.
 */
export function tomorrowMidnightInTZ(tz: string): Date {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  const [y, m, d] = todayStr.split('-').map(Number)
  const tomorrowStr = `${y}-${String(m).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`
  return localMidnightToUTC(tomorrowStr, tz)
}

/**
 * Calcula el instante UTC que corresponde a las 00:00 del día `isoDate`
 * en la zona horaria `tz`, sin asumir ningún offset fijo.
 *
 * Técnica: se toma el mediodía UTC del mismo día (12:00 UTC) y se lee qué
 * hora local produce en `tz` vía Intl. La diferencia respecto a 12 es el
 * offset. Luego se aplica ese offset para obtener el medianoche local en UTC.
 */
function localMidnightToUTC(isoDate: string, tz: string): Date {
  return localTimeToUTC(isoDate, 0, tz)
}

/**
 * Calcula el instante UTC que corresponde a las `hour`:00 del día `isoDate`
 * en la zona horaria `tz`, sin asumir ningún offset fijo.
 *
 * Técnica: se toma el mediodía UTC del mismo día (12:00 UTC) y se lee qué
 * hora local produce en `tz` vía Intl. La diferencia respecto a 12 es el
 * offset. Luego se aplica ese offset para obtener la hora local pedida en UTC.
 */
function localTimeToUTC(isoDate: string, hour: number, tz: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number)
  const noonUTC = Date.UTC(y, m - 1, d, 12, 0, 0)

  const localHourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).format(new Date(noonUTC))

  // hour12: false puede devolver "24" para medianoche; lo normalizamos.
  const localHour = parseInt(localHourStr, 10) % 24

  // localHour = 12 + offsetHours  →  offsetHours = localHour - 12
  // hora local pedida en UTC = Date.UTC(y, m-1, d, hour - offsetHours)
  const offsetHours = localHour - 12
  return new Date(Date.UTC(y, m - 1, d, hour - offsetHours, 0, 0))
}
