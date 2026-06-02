/**
 * Fechas de cierre globales del torneo — iguales para todos los campeonatos.
 * Todas a las 00:00 America/New_York (EDT en junio/julio 2026 = UTC-4).
 *
 * NO se usa un offset fijo: la hora UTC se deriva del runtime de Intl para
 * que funcione correctamente si el sistema operativo tiene los datos de tz
 * actualizados (p. ej. si NY cambiara de EDT a EST en un ajuste político futuro).
 */

export const LOCK_TIMEZONE = 'America/New_York'

/** Cierra la clasificación por grupo: 2026-06-11 00:00 ET */
export const CLASSIFICATION_LOCK = localMidnightToUTC('2026-06-11', LOCK_TIMEZONE)

/** Cierra podio, bota de oro y MVP: 2026-06-28 00:00 ET */
export const PODIUM_BOOT_MVP_LOCK = localMidnightToUTC('2026-06-28', LOCK_TIMEZONE)

/** true si la fecha de cierre ya pasó (usa `now` inyectable para tests). */
export function isModuleLocked(lock: Date, now: Date = new Date()): boolean {
  return now >= lock
}

/**
 * true si el partido ya está bloqueado.
 * El cierre es las 00:00 America/New_York del día del partido,
 * derivado de kickoff_utc (fuente de verdad).
 * Si kickoff_utc es null (eliminatoria sin fecha), el partido NO está bloqueado.
 */
export function isMatchLocked(kickoffUtc: string | null): boolean {
  if (!kickoffUtc) return false
  const matchDateET = new Intl.DateTimeFormat('en-CA', {
    timeZone: LOCK_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(kickoffUtc))
  return Date.now() >= localMidnightToUTC(matchDateET, LOCK_TIMEZONE).getTime()
}

/**
 * Formatea una fecha de cierre para mostrar en la UI:
 * "11 jun 2026, 00:00 ET"
 */
export function formatLockDate(lock: Date): string {
  const parts = new Intl.DateTimeFormat('es', {
    timeZone: LOCK_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(lock)

  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  const year = parts.find((p) => p.type === 'year')?.value ?? ''

  return `${day} ${month} ${year}, 00:00 ET`
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
  // midnight local (00:00) en UTC = Date.UTC(y, m-1, d, -offsetHours)
  const offsetHours = localHour - 12
  return new Date(Date.UTC(y, m - 1, d, -offsetHours, 0, 0))
}
