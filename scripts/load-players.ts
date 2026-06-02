#!/usr/bin/env npx tsx
/**
 * scripts/load-players.ts
 *
 * Carga los jugadores del Mundial 2026 desde BallDontLie a la tabla `players`
 * de Supabase. Idempotente: re-ejecutar actualiza sin duplicar.
 *
 * Uso:
 *   npx tsx scripts/load-players.ts            # carga real
 *   npx tsx scripts/load-players.ts --dry-run  # solo muestra el mapa, no inserta
 *   npx tsx scripts/load-players.ts --show-teams # muestra unmatched y sale
 *
 * Prerequisito en Supabase (ejecutar una vez):
 *   ALTER TABLE players ADD COLUMN IF NOT EXISTS source_id INTEGER;
 *   CREATE UNIQUE INDEX IF NOT EXISTS players_source_id_idx ON players(source_id);
 *
 * Variables de entorno necesarias en .env.local:
 *   BALLDONTLIE_API_KEY        ← key de balldontlie.io
 *   NEXT_PUBLIC_SUPABASE_URL   ← ya existe
 *   SUPABASE_SERVICE_ROLE_KEY  ← secret key (Settings > API > service_role)
 */

import { resolve } from 'path'

// Cargar .env.local antes de todo
const { config } = await import('dotenv')
config({ path: resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

// ── Config ─────────────────────────────────────────────────────────────────

const BDL_BASE = 'https://api.balldontlie.io/fifa/worldcup/v1'
const BDL_KEY = process.env.BALLDONTLIE_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const IS_DRY_RUN = process.argv.includes('--dry-run')
const SHOW_TEAMS = process.argv.includes('--show-teams')

// ── Mapa de nombres ─────────────────────────────────────────────────────────
//
// Clave  = nombre exacto que devuelve BallDontLie
// Valor  = nombre exacto en NUESTRA tabla `teams`
//
// Solo hay entrada cuando difieren. Los exactos no necesitan mapeo.
// Ajusta las entradas ⚠ con el nombre que tenga tu DB.

// Verificado contra SELECT name FROM teams (2026-05-31).
// Solo entradas donde BDL name ≠ DB name.
const BDL_TO_DB: Record<string, string> = {
  "Côte d'Ivoire": 'Ivory Coast',
  'Türkiye':       'Turkey',
  'Cabo Verde':    'Cape Verde',
  'Czechia':       'Czech Republic',
  // Coinciden exactamente (no necesitan entrada):
  // 'USA' · 'Bosnia & Herzegovina' · 'Curaçao' · 'DR Congo' · 'South Korea'
}

// ── Tipos ───────────────────────────────────────────────────────────────────

interface BdlTeam {
  id: number
  name: string
  country_code: string
  confederation: string
}

interface BdlPlayer {
  id: number
  name: string
  short_name?: string
  position?: string
  jersey_number?: number
  country_code?: string
  country_name?: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function bdlFetch<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  const items: T[] = []
  let cursor: string | null = null
  let pageCount = 0

  do {
    const url = new URL(`${BDL_BASE}${path}`)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.append(k, v)
    }
    if (cursor) url.searchParams.set('cursor', cursor)

    const res = await fetch(url.toString(), {
      headers: { Authorization: BDL_KEY! },
    })

    if (res.status === 401) {
      throw new Error(
        `BallDontLie API devolvió 401 en ${path}.\n` +
        `Tu API key está en el plan Free (solo /teams). Para cargar jugadores\n` +
        `necesitas el plan GOAT ($39.99/mes) en https://www.balldontlie.io/pricing`
      )
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`BallDontLie ${res.status} en ${path}: ${body}`)
    }

    const json = await res.json()
    items.push(...(json.data ?? []))
    cursor = json.meta?.next_cursor ?? null
    pageCount++

    // Rate-limit conservador: 60 req/min en GOAT → ~1 req/s
    await sleep(250)
  } while (cursor)

  return items
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function dbName(bdlName: string): string {
  return BDL_TO_DB[bdlName] ?? bdlName
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Validar env vars
  const missing: string[] = []
  if (!BDL_KEY) missing.push('BALLDONTLIE_API_KEY')
  if (!SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length) {
    console.error(`❌ Variables de entorno faltantes: ${missing.join(', ')}`)
    console.error(`   Agrégalas a .env.local`)
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log('🌍  Leyendo equipos de BallDontLie...')
  const bdlTeams = await bdlFetch<BdlTeam>('/teams', { 'seasons[]': '2026', per_page: '100' })
  console.log(`    ${bdlTeams.length} equipos recibidos`)

  console.log('🗄️   Leyendo equipos de Supabase...')
  const { data: dbTeams, error: dbErr } = await supabase
    .from('teams')
    .select('id, name')
  if (dbErr) throw new Error(`Supabase teams: ${dbErr.message}`)
  console.log(`    ${dbTeams!.length} equipos en DB`)

  // Construir mapa: nombre DB → DB team_id
  const dbByName = new Map<string, number>(dbTeams!.map((t) => [t.name, t.id]))

  // Construir mapa: BDL team_id → { bdlName, mappedDbName, ourTeamId | null }
  const teamMap: Array<{
    bdlId: number
    bdlName: string
    bdlCode: string
    mappedName: string
    ourId: number | null
  }> = bdlTeams.map((t) => {
    const mapped = dbName(t.name)
    const ourId = dbByName.get(mapped) ?? null
    return { bdlId: t.id, bdlName: t.name, bdlCode: t.country_code, mappedName: mapped, ourId }
  })

  const matched = teamMap.filter((t) => t.ourId !== null)
  const unmatched = teamMap.filter((t) => t.ourId === null)

  // ── Mostrar mapa ──────────────────────────────────────────────────────────
  console.log('\n📋  Mapa de equipos (BallDontLie → Supabase DB):')
  console.log('─'.repeat(72))
  for (const t of [...teamMap].sort((a, b) => a.bdlName.localeCompare(b.bdlName))) {
    const status = t.ourId ? `✅ DB id=${t.ourId}` : '❌ SIN MATCH'
    const arrow = t.bdlName !== t.mappedName ? ` → "${t.mappedName}"` : ''
    console.log(`  [${t.bdlCode}] "${t.bdlName}"${arrow}   ${status}`)
  }
  console.log('─'.repeat(72))
  console.log(`  Matched: ${matched.length}/48   Sin match: ${unmatched.length}`)
  if (unmatched.length > 0) {
    console.log('\n⚠️   Equipos sin match en DB:')
    for (const t of unmatched) {
      console.log(`     "${t.bdlName}" → buscó "${t.mappedName}" — no encontrado`)
    }
    console.log('\n   Ajusta BDL_TO_DB en el script para corregirlos.')
  }

  if (SHOW_TEAMS || IS_DRY_RUN) {
    console.log(IS_DRY_RUN ? '\n[dry-run] Terminado sin insertar.' : '\n[show-teams] Terminado.')
    return
  }

  if (unmatched.length > 0) {
    console.warn('\n⚠️   Continuando con equipos sin match excluidos. Sus jugadores NO se cargarán.')
  }

  // ── Cargar jugadores ──────────────────────────────────────────────────────
  // Mapa: BDL country_code → nuestro team_id
  const codeToOurId = new Map<string, number>()
  for (const t of matched) codeToOurId.set(t.bdlCode, t.ourId!)

  console.log('\n🔄  Leyendo jugadores de BallDontLie (puede tomar unos segundos)...')
  const bdlPlayers = await bdlFetch<BdlPlayer>('/players', {
    'seasons[]': '2026',
    per_page: '100',
  })
  console.log(`    ${bdlPlayers.length} jugadores recibidos`)

  // Construir filas a insertar
  const rows: Array<{
    source_id: number
    name: string
    team_id: number
    position: string | null
    jersey_number: number | null
  }> = []

  const skipped: string[] = []

  for (const p of bdlPlayers) {
    // Identificar equipo por country_code del jugador
    const code = p.country_code ?? ''
    const ourTeamId = codeToOurId.get(code)
    if (!ourTeamId) {
      // Podría ser un jugador de un equipo sin match o sin country_code
      skipped.push(`${p.name} (code=${code})`)
      continue
    }
    rows.push({
      source_id: p.id,
      name: p.name,
      team_id: ourTeamId,
      position: p.position ?? null,
      jersey_number: p.jersey_number ?? null,
    })
  }

  if (skipped.length > 0) {
    console.warn(`\n⚠️   ${skipped.length} jugadores sin equipo reconocido (omitidos):`)
    for (const s of skipped.slice(0, 10)) console.warn(`     ${s}`)
    if (skipped.length > 10) console.warn(`     ... y ${skipped.length - 10} más`)
  }

  console.log(`\n💾  Haciendo upsert de ${rows.length} jugadores en Supabase...`)

  // Upsert en lotes de 200 para no superar el límite de payload
  const BATCH = 200
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error: upsertErr } = await supabase
      .from('players')
      .upsert(batch, {
        onConflict: 'source_id',
        ignoreDuplicates: false, // actualiza en cada re-ejecución
      })
    if (upsertErr) {
      if (upsertErr.message.includes('source_id')) {
        console.error('\n❌  La columna source_id no existe en players. Ejecuta primero en Supabase SQL:')
        console.error('     ALTER TABLE players ADD COLUMN IF NOT EXISTS source_id INTEGER;')
        console.error('     CREATE UNIQUE INDEX IF NOT EXISTS players_source_id_idx ON players(source_id);')
        process.exit(1)
      }
      throw new Error(`Upsert error: ${upsertErr.message}`)
    }
    inserted += batch.length
    process.stdout.write(`\r    ${inserted}/${rows.length} jugadores...`)
  }
  console.log()

  // ── Resumen ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(52))
  console.log('  RESUMEN')
  console.log('═'.repeat(52))
  console.log(`  Equipos procesados:    ${matched.length}/48`)
  console.log(`  Jugadores cargados:    ${inserted}`)
  console.log(`  Jugadores omitidos:    ${skipped.length}`)
  if (unmatched.length > 0) {
    console.log(`  Equipos sin match:     ${unmatched.length} (${unmatched.map((t) => t.bdlName).join(', ')})`)
  }
  console.log('═'.repeat(52))
  console.log('\n✅  Listo.')
}

main().catch((err) => {
  console.error('\n❌  Error fatal:', err.message ?? err)
  process.exit(1)
})
