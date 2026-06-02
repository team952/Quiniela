#!/usr/bin/env npx tsx
/**
 * scripts/load-players-from-file.ts
 *
 * SINCRONIZA la tabla `players` con el archivo de plantillas:
 * - Upserta los jugadores del archivo.
 * - BORRA de players los jugadores de cada selección que ya NO estén en el archivo.
 * - Las selecciones vacías en el archivo (Ecuador, Arabia Saudita, Irak)
 *   NO se tocan — sus jugadores quedan intactos.
 * - Si un jugador a borrar está referenciado en special_predictions, se AVISA
 *   en el log y NO se borra (queda para revisión manual).
 *
 * Uso:
 *   npx tsx "scripts/load-players-from-file.ts" --dry   # muestra el plan sin ejecutar
 *   npx tsx "scripts/load-players-from-file.ts"          # sincronización real
 *
 * Prerequisitos en Supabase (una sola vez):
 *   ALTER TABLE players ADD COLUMN IF NOT EXISTS club TEXT;
 *   ALTER TABLE players ADD COLUMN IF NOT EXISTS source_key TEXT;
 *   CREATE UNIQUE INDEX IF NOT EXISTS players_source_key_idx ON players(source_key);
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { config } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

config({ path: resolve(process.cwd(), '.env.local') })

const IS_DRY = process.argv.includes('--dry')

// ── Mapa ES→EN (verificado contra SELECT name FROM teams) ───────────────────

const FILE_TO_DB: Record<string, string> = {
  Mexico: 'Mexico', Sudáfrica: 'South Africa', 'Corea del Sur': 'South Korea',
  Czechia: 'Czech Republic', Canadá: 'Canada', 'Bosnia-Herzegovina': 'Bosnia & Herzegovina',
  Qatar: 'Qatar', Suiza: 'Switzerland', Brasil: 'Brazil', Morocco: 'Morocco',
  Haití: 'Haiti', Escocia: 'Scotland', 'Estados Unidos': 'USA', Australia: 'Australia',
  Paraguay: 'Paraguay', Turquía: 'Turkey', Alemania: 'Germany', Curazao: 'Curaçao',
  'Costa de Marfil': 'Ivory Coast', Ecuador: 'Ecuador', 'Países Bajos': 'Netherlands',
  Japón: 'Japan', Suecia: 'Sweden', Túnez: 'Tunisia', Bélgica: 'Belgium',
  Egipto: 'Egypt', Irán: 'Iran', 'Nueva Zelanda': 'New Zealand', España: 'Spain',
  'Cabo Verde': 'Cape Verde', Uruguay: 'Uruguay', 'Arabia Saudita': 'Saudi Arabia',
  Francia: 'France', Senegal: 'Senegal', Irak: 'Iraq', Noruega: 'Norway',
  Argentina: 'Argentina', Argelia: 'Algeria', Austria: 'Austria', Jordania: 'Jordan',
  Portugal: 'Portugal', 'RD Congo': 'DR Congo', Uzbekistán: 'Uzbekistan',
  Colombia: 'Colombia', Inglaterra: 'England', Croacia: 'Croatia', Ghana: 'Ghana',
  Panamá: 'Panama',
}

// ── Tipos ────────────────────────────────────────────────────────────────────

type Position = 'GK' | 'DEF' | 'MID' | 'FWD'

interface ParsedPlayer { name: string; club: string | null; position: Position }
interface ParsedTeam   { fileTeamName: string; dbTeamName: string; players: ParsedPlayer[] }

interface DbPlayer {
  id: number
  source_key: string | null
  name: string
  club: string | null
}

interface SpecialRef {
  championship_id: string
  user_id: string
  role: 'bota_de_oro' | 'mvp'
}

interface PlayerWithRefs {
  player: DbPlayer
  refs: SpecialRef[]
}

interface TeamSyncPlan {
  fileTeamName: string
  dbTeamName:   string
  teamId:       number
  /** Jugadores del archivo (ya deduplicados por source_key) */
  toUpsert:  UpsertRow[]
  /** DB players cuyo source_key ya NO está en el archivo */
  safeDelete:   DbPlayer[]       // se borrarán
  blockedDelete: PlayerWithRefs[] // referenciados en special_predictions — no se borran
  /** Cuántos ya existen en DB (se actualizarán) */
  updateCount: number
  /** Cuántos son nuevos */
  addCount: number
}

interface UpsertRow {
  source_key: string
  name: string
  club: string | null
  position: Position
  team_id: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function cleanName(raw: string): string {
  return raw.replace(/>/g, '').replace(/;/g, '').replace(/\.\s*$/, '').replace(/\s+/g, ' ').trim()
}

function cleanClub(raw: string): string {
  return raw.replace(/-[A-Z]{2,3}$/, '').trim()
}

function normForKey(s: string): string {
  return s.toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

function makeSourceKey(teamId: number, name: string, club: string | null): string {
  return `${teamId}:${normForKey(name)}:${normForKey(club ?? '')}`
}

function isGroupHeader(line: string) { return /^Gr?u?po\s+[A-Z]/i.test(line) }
function isDTLine(line: string) { return /^Directo?r?\s+T[eé]c?.?nico?/i.test(line) }
function isDateLine(line: string) { return /anunciad[ao]|pre.?lista|convocatoria|por anunciarse|prelista/i.test(line) }

const POS_PREFIXES: [RegExp, Position][] = [
  [/^porteros\s*:/i, 'GK'], [/^defensas?\s*:/i, 'DEF'], [/^defensores?\s*:/i, 'DEF'],
  [/^centrocampistas?\s*:/i, 'MID'], [/^mediocampistas?\s*:/i, 'MID'], [/^delanteros?\s*:/i, 'FWD'],
]

function matchPosition(line: string): { pos: Position; rest: string } | null {
  for (const [rx, pos] of POS_PREFIXES) {
    if (rx.test(line)) return { pos, rest: line.replace(rx, '').trim() }
  }
  return null
}

function parsePlayers(raw: string, pos: Position): ParsedPlayer[] {
  if (!raw.trim()) return []
  const normalized = raw.replace(/\s+y\s+/g, ', ')
  const players: ParsedPlayer[] = []
  for (const seg of normalized.split(',').map(s => s.trim()).filter(Boolean)) {
    const match = seg.match(/^([^(]+?)\s*\(\s*([^)]+?)\s*\)\s*[>]?\s*\.?\s*$/)
    if (match) {
      const name = cleanName(match[1])
      if (name) players.push({ name, club: cleanClub(match[2]), position: pos })
    } else if (seg.includes('(')) {
      const name = cleanName(seg.split('(')[0])
      if (name) players.push({ name, club: null, position: pos })
    } else {
      const name = cleanName(seg)
      if (name) players.push({ name, club: null, position: pos })
    }
  }
  return players
}

function parseFile(content: string): ParsedTeam[] {
  const lines = content.split(/\r?\n/)
  const teams: ParsedTeam[] = []
  let teamName: string | null = null, dbName: string | null = null
  let players: ParsedPlayer[] = []

  function flush() {
    if (teamName) { teams.push({ fileTeamName: teamName, dbTeamName: dbName!, players }); teamName = null; dbName = null; players = [] }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || isGroupHeader(line) || isDTLine(line) || isDateLine(line)) continue
    const pm = matchPosition(line)
    if (pm) { players.push(...parsePlayers(pm.rest, pm.pos)); continue }
    if (!line.includes(':') && !line.includes('(')) {
      flush()
      teamName = line
      dbName = FILE_TO_DB[line] ?? `⚠ SIN MAP: "${line}"`
    }
  }
  flush()
  return teams
}

// ── Conexión Supabase ─────────────────────────────────────────────────────────

function initSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const missing = [!url && 'NEXT_PUBLIC_SUPABASE_URL', !key && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean)
  if (missing.length) {
    console.error(`❌  Variables faltantes: ${missing.join(', ')}`)
    process.exit(1)
  }
  return createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } })
}

// ── Construcción del plan de sincronización ───────────────────────────────────
//
// Para cada selección CON jugadores en el archivo:
//   - Arma los UpsertRow (deduplicados por source_key)
//   - Compara contra el estado actual en DB
//   - Clasifica en: add / update / safeDelete / blockedDelete (referenciados)
//
// Las selecciones vacías en el archivo (Ecuador, Arabia, Irak) → NO aparecen
// en el plan → no se tocan en la DB.

async function buildSyncPlans(
  parsedTeams: ParsedTeam[],
  supabase: SupabaseClient,
): Promise<TeamSyncPlan[]> {
  // 1. Mapa name → teamId
  const { data: dbTeams, error: teamsErr } = await supabase.from('teams').select('id, name')
  if (teamsErr) throw new Error(`teams: ${teamsErr.message}`)
  const dbByName = new Map<string, number>(dbTeams!.map(t => [t.name as string, t.id as number]))

  // 2. Equipos del archivo que tienen jugadores y están mapeados
  const teamsWithPlayers = parsedTeams.filter(t => t.players.length > 0 && !t.dbTeamName.startsWith('⚠'))
  const teamIds = teamsWithPlayers
    .map(t => dbByName.get(t.dbTeamName))
    .filter((id): id is number => id !== undefined)

  if (teamIds.length === 0) return []

  // 3. Todos los players actuales en DB para esos equipos (una sola query)
  const { data: dbPlayersRaw, error: playersErr } = await supabase
    .from('players')
    .select('id, source_key, name, club, team_id')
    .in('team_id', teamIds)
  if (playersErr) throw new Error(`players: ${playersErr.message}`)

  // Agrupar por team_id
  const dbByTeam = new Map<number, DbPlayer[]>()
  for (const p of dbPlayersRaw ?? []) {
    const tid = p.team_id as number
    if (!dbByTeam.has(tid)) dbByTeam.set(tid, [])
    dbByTeam.get(tid)!.push({ id: p.id as number, source_key: p.source_key as string | null, name: p.name as string, club: p.club as string | null })
  }

  // 4. Construir plan por equipo
  const plans: TeamSyncPlan[] = []
  const allDeleteCandidates: DbPlayer[] = []
  const teamIdForCandidate = new Map<number, number>() // player.id → teamId (para lookup posterior)

  for (const t of teamsWithPlayers) {
    const teamId = dbByName.get(t.dbTeamName)
    if (teamId === undefined) continue

    const currentDb: DbPlayer[] = dbByTeam.get(teamId) ?? []
    const dbKeyMap = new Map<string, DbPlayer>(
      currentDb.map(p => [p.source_key ?? '', p])
    )

    // Armar upsert rows (deduplicados)
    const seen = new Map<string, UpsertRow>()
    for (const p of t.players) {
      const key = makeSourceKey(teamId, p.name, p.club)
      if (!seen.has(key)) seen.set(key, { source_key: key, name: p.name, club: p.club, position: p.position, team_id: teamId })
    }
    const toUpsert = [...seen.values()]
    const fileKeySet = new Set(toUpsert.map(r => r.source_key))

    // Calcular add vs update
    const addCount    = toUpsert.filter(r => !dbKeyMap.has(r.source_key)).length
    const updateCount = toUpsert.filter(r =>  dbKeyMap.has(r.source_key)).length

    // Jugadores a borrar: en DB pero no en archivo
    const toDelete = currentDb.filter(p => !fileKeySet.has(p.source_key ?? ''))

    for (const p of toDelete) teamIdForCandidate.set(p.id, teamId)
    allDeleteCandidates.push(...toDelete)

    plans.push({ fileTeamName: t.fileTeamName, dbTeamName: t.dbTeamName, teamId, toUpsert, safeDelete: [], blockedDelete: [], addCount, updateCount })
  }

  if (allDeleteCandidates.length === 0) return plans

  // 5. Consultar special_predictions para los candidatos a borrar
  const candidateIds = allDeleteCandidates.map(p => p.id)
  const { data: specRefs, error: specErr } = await supabase
    .from('special_predictions')
    .select('championship_id, user_id, golden_boot_player_id, mvp_player_id')
    .or(`golden_boot_player_id.in.(${candidateIds.join(',')}),mvp_player_id.in.(${candidateIds.join(',')})`)
  if (specErr) throw new Error(`special_predictions: ${specErr.message}`)

  // Construir mapa player_id → refs
  const refsById = new Map<number, SpecialRef[]>()
  for (const row of specRefs ?? []) {
    const gb = row.golden_boot_player_id as number | null
    const mv = row.mvp_player_id as number | null
    if (gb && candidateIds.includes(gb)) {
      if (!refsById.has(gb)) refsById.set(gb, [])
      refsById.get(gb)!.push({ championship_id: row.championship_id as string, user_id: row.user_id as string, role: 'bota_de_oro' })
    }
    if (mv && candidateIds.includes(mv)) {
      if (!refsById.has(mv)) refsById.set(mv, [])
      refsById.get(mv)!.push({ championship_id: row.championship_id as string, user_id: row.user_id as string, role: 'mvp' })
    }
  }

  // 6. Clasificar candidatos: safe vs blocked
  const playerWithTeam = new Map<number, string>(
    plans.map(p => [p.teamId, p.fileTeamName]).flatMap(([tid, name]) =>
      (dbByTeam.get(tid as number) ?? []).map(p => [p.id, name as string])
    )
  )

  for (const plan of plans) {
    const toDelete = allDeleteCandidates.filter(p => teamIdForCandidate.get(p.id) === plan.teamId)
    for (const p of toDelete) {
      const refs = refsById.get(p.id) ?? []
      if (refs.length > 0) {
        plan.blockedDelete.push({ player: p, refs })
      } else {
        plan.safeDelete.push(p)
      }
    }
  }

  return plans
}

// ── Dry-run ───────────────────────────────────────────────────────────────────

async function runDry(parsedTeams: ParsedTeam[]): Promise<void> {
  console.log('\n🔗  Conectando a Supabase para calcular el diff...')
  const supabase = initSupabase()
  const plans = await buildSyncPlans(parsedTeams, supabase)

  const w = (s: string, n: number) => s.slice(0, n).padEnd(n)

  console.log('\n📋  DRY RUN — PLAN DE SINCRONIZACIÓN POR SELECCIÓN')
  console.log('─'.repeat(92))
  console.log(
    `  ${w('Selección', 22)}  ${w('DB name', 22)}  ${'En archivo'.padStart(10)}  ${'+AGREGA'.padStart(8)}  ${'~ACTUALIZA'.padStart(10)}  ${'-BORRA'.padStart(7)}  ${'⛔BLOQ'.padStart(6)}`
  )
  console.log('─'.repeat(92))

  let totalAdd = 0, totalUpdate = 0, totalSafeDel = 0, totalBlocked = 0

  for (const p of plans) {
    totalAdd     += p.addCount
    totalUpdate  += p.updateCount
    totalSafeDel += p.safeDelete.length
    totalBlocked += p.blockedDelete.length
    const inFile = p.toUpsert.length
    const safeDel = p.safeDelete.length
    const blocked = p.blockedDelete.length
    const safStr  = safeDel > 0 ? safeDel.toString().padStart(7) : '      —'
    const blkStr  = blocked > 0 ? blocked.toString().padStart(6) : '     —'
    console.log(
      `  ${w(p.fileTeamName, 22)}  ${w(p.dbTeamName, 22)}  ${inFile.toString().padStart(10)}  ${p.addCount.toString().padStart(8)}  ${p.updateCount.toString().padStart(10)}  ${safStr}  ${blkStr}`
    )
  }

  // Equipos vacíos (no se tocan)
  const emptyTeams = parsedTeams.filter(t => t.players.length === 0 && !t.dbTeamName.startsWith('⚠'))
  const unmapped   = parsedTeams.filter(t => t.dbTeamName.startsWith('⚠'))

  if (emptyTeams.length > 0) {
    console.log(`\n  (Sin tocar — vacíos en el archivo: ${emptyTeams.map(t => t.fileTeamName).join(', ')})`)
  }

  console.log('─'.repeat(92))
  console.log(
    `  Total: +${totalAdd} nuevos  ~${totalUpdate} actualizan  -${totalSafeDel} borran  ⛔${totalBlocked} bloqueados`
  )

  // ── Jugadores BLOQUEADOS (referenciados en special_predictions) ────────────
  const allBlocked = plans.flatMap(p => p.blockedDelete.map(b => ({ ...b, teamName: p.fileTeamName })))
  if (allBlocked.length > 0) {
    console.log(`\n⛔  JUGADORES A BORRAR REFERENCIADOS EN SPECIAL_PREDICTIONS (${allBlocked.length}):`)
    console.log('    Se conservarán en players hasta que resuelvas manualmente.\n')
    for (const b of allBlocked) {
      console.log(`    [${b.teamName}] "${b.player.name}" (${b.player.club ?? '—'}) — player_id=${b.player.id}`)
      for (const ref of b.refs) {
        console.log(`       → ${ref.role.toUpperCase()}  championship=${ref.championship_id}  user=${ref.user_id}`)
      }
    }
    console.log()
    console.log('    Para resolver: cambia el pronóstico afectado en special_predictions')
    console.log('    (pon null o el id del jugador correcto) y luego vuelve a correr el script.')
  } else {
    console.log('\n  ✅ Ningún jugador a borrar está referenciado en special_predictions.')
  }

  // ── Jugadores a BORRAR (safe) ─────────────────────────────────────────────
  const allSafe = plans.flatMap(p => p.safeDelete.map(s => ({ ...s, teamName: p.fileTeamName })))
  if (allSafe.length > 0) {
    console.log(`\n🗑️   JUGADORES QUE SE BORRARÁN (${allSafe.length}):`)
    for (const s of allSafe) {
      console.log(`    [${s.teamName}] "${s.name}" (${s.club ?? '—'}) id=${s.id}`)
    }
  }

  if (unmapped.length > 0) {
    console.log(`\n⚠️   Sin mapeo (omitidos): ${unmapped.map(t => t.fileTeamName).join(', ')}`)
  }

  console.log('\n[dry-run] Nada fue modificado. Corre sin --dry para ejecutar.')
}

// ── Sincronización real ───────────────────────────────────────────────────────

async function runSync(parsedTeams: ParsedTeam[]): Promise<void> {
  const supabase = initSupabase()

  // Verificar columnas requeridas
  console.log('🔍  Verificando esquema...')
  const { error: schemaErr } = await supabase.from('players').select('source_key, club').limit(0)
  if (schemaErr) {
    if (schemaErr.message.includes('source_key') || schemaErr.message.includes('club')) {
      console.error('\n❌  Columnas faltantes en players. Ejecuta en Supabase SQL:')
      console.error('     ALTER TABLE players ADD COLUMN IF NOT EXISTS club TEXT;')
      console.error('     ALTER TABLE players ADD COLUMN IF NOT EXISTS source_key TEXT;')
      console.error('     CREATE UNIQUE INDEX IF NOT EXISTS players_source_key_idx ON players(source_key);')
    } else {
      console.error(`❌  ${schemaErr.message}`)
    }
    process.exit(1)
  }

  console.log('📐  Calculando plan de sincronización...')
  const plans = await buildSyncPlans(parsedTeams, supabase)

  const totalUpsert  = plans.reduce((s, p) => s + p.toUpsert.length, 0)
  const totalSafeDel = plans.reduce((s, p) => s + p.safeDelete.length, 0)
  const totalBlocked = plans.reduce((s, p) => s + p.blockedDelete.length, 0)

  console.log(`\n   ${plans.length} selecciones  |  +/~ ${totalUpsert} upsert  |  -${totalSafeDel} borrar  |  ⛔${totalBlocked} bloqueados`)

  // ── Avisar sobre bloqueados ───────────────────────────────────────────────
  if (totalBlocked > 0) {
    console.log(`\n⛔  ${totalBlocked} jugador(es) referenciados en special_predictions NO se borrarán:`)
    for (const plan of plans) {
      for (const b of plan.blockedDelete) {
        const roles = b.refs.map(r => r.role.toUpperCase()).join(', ')
        console.warn(`    [${plan.fileTeamName}] "${b.player.name}" id=${b.player.id}  → ${roles}`)
      }
    }
    console.log('    (modifica esos pronósticos y vuelve a correr el script)')
  }

  // ── Upsert ────────────────────────────────────────────────────────────────
  const allRows = plans.flatMap(p => p.toUpsert)
  console.log(`\n💾  Upsert de ${allRows.length} jugadores...`)
  const BATCH = 200
  let upsertDone = 0
  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH)
    const { error: upErr } = await supabase
      .from('players')
      .upsert(batch, { onConflict: 'source_key', ignoreDuplicates: false })
    if (upErr) { console.error(`\n❌  Upsert: ${upErr.message}`); process.exit(1) }
    upsertDone += batch.length
    process.stdout.write(`\r    ${upsertDone}/${allRows.length}...`)
  }
  console.log()

  // ── Delete (solo los safe) ────────────────────────────────────────────────
  const allSafeIds = plans.flatMap(p => p.safeDelete.map(s => s.id))
  if (allSafeIds.length > 0) {
    console.log(`🗑️   Borrando ${allSafeIds.length} jugadores no referenciados...`)
    const DEL_BATCH = 200
    let delDone = 0
    for (let i = 0; i < allSafeIds.length; i += DEL_BATCH) {
      const batch = allSafeIds.slice(i, i + DEL_BATCH)
      const { error: delErr } = await supabase.from('players').delete().in('id', batch)
      if (delErr) { console.error(`\n❌  Delete: ${delErr.message}`); process.exit(1) }
      delDone += batch.length
      process.stdout.write(`\r    ${delDone}/${allSafeIds.length}...`)
    }
    console.log()
  } else {
    console.log('🗑️   Sin jugadores para borrar.')
  }

  // ── Resumen ───────────────────────────────────────────────────────────────
  const totalAdd    = plans.reduce((s, p) => s + p.addCount, 0)
  const totalUpdate = plans.reduce((s, p) => s + p.updateCount, 0)
  const emptyCount  = parsedTeams.filter(t => t.players.length === 0 && !t.dbTeamName.startsWith('⚠')).length
  console.log()
  console.log('═'.repeat(60))
  console.log('  RESUMEN DE SINCRONIZACIÓN')
  console.log('═'.repeat(60))
  console.log(`  Selecciones sincronizadas: ${plans.length}`)
  console.log(`  Selecciones vacías (intocadas): ${emptyCount}`)
  console.log(`  Jugadores nuevos (+):       ${totalAdd}`)
  console.log(`  Jugadores actualizados (~): ${totalUpdate}`)
  console.log(`  Jugadores borrados (-):     ${allSafeIds.length}`)
  console.log(`  Jugadores bloqueados (⛔):  ${totalBlocked}`)
  console.log('═'.repeat(60))
  console.log('\n✅  Sincronización completa.')
}

// ── Entry point ───────────────────────────────────────────────────────────────

const DATA_FILE = resolve(process.cwd(), 'scripts', 'data', 'plantillas extraoficiales.txt')
let content: string
try {
  content = readFileSync(DATA_FILE, 'utf-8')
} catch {
  console.error(`❌  Archivo no encontrado: ${DATA_FILE}`)
  process.exit(1)
}

const parsedTeams = parseFile(content)

if (IS_DRY) {
  runDry(parsedTeams).catch(err => { console.error('❌', err.message ?? err); process.exit(1) })
} else {
  runSync(parsedTeams).catch(err => { console.error('❌', err.message ?? err); process.exit(1) })
}
