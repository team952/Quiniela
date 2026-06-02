/**
 * seed-fd-match-ids.ts
 *
 * Mapea los fixture IDs de football-data.org a nuestra tabla `matches`.
 * Prerrequisito en Supabase (ejecutar una sola vez en el SQL editor):
 *
 *   ALTER TABLE matches ADD COLUMN fd_match_id INT UNIQUE;
 *   CREATE INDEX ON matches(fd_match_id);
 *
 * Uso:
 *   npx tsx scripts/seed-fd-match-ids.ts          ← actualiza la BD
 *   npx tsx scripts/seed-fd-match-ids.ts --dry     ← solo muestra el diff
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const DRY = process.argv.includes('--dry')
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY!
const FD_BASE = 'https://api.football-data.org/v4'

// ── Normalización de nombres de equipo ────────────────────────────────────────
// football-data.org usa nombres distintos a los nuestros en algunos casos.
const FD_ALIASES: Record<string, string> = {
  'United States':        'USA',
  "Côte d'Ivoire":        'Ivory Coast',
  'Korea Republic':       'South Korea',
  'Cape Verde Islands':   'Cape Verde',
  'Bosnia-Herzegovina':   'Bosnia & Herzegovina',
  'Bosnia & Herzegovina': 'Bosnia & Herzegovina',
  'Curacao':              'Curaçao',
  'Czechia':              'Czech Republic',
  'Congo DR':             'DR Congo',
}

function normalize(s: string | null | undefined): string {
  if (!s) return ''
  return (FD_ALIASES[s] ?? s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // quita tildes
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!FD_KEY || FD_KEY === 'TU_TOKEN_AQUI') {
    console.error('Falta FOOTBALL_DATA_API_KEY en .env.local')
    process.exit(1)
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // 1. Traer todos los partidos del WC 2026 desde football-data.org
  console.log('Obteniendo partidos de football-data.org…')
  const res = await fetch(`${FD_BASE}/competitions/WC/matches`, {
    headers: { 'X-Auth-Token': FD_KEY },
  })
  if (!res.ok) {
    console.error(`API error: ${res.status} ${await res.text()}`)
    process.exit(1)
  }
  const { matches: fdMatches } = await res.json() as {
    matches: Array<{
      id: number
      utcDate: string
      homeTeam: { name: string }
      awayTeam: { name: string }
      status: string
    }>
  }
  console.log(`  → ${fdMatches.length} partidos obtenidos`)

  // 2. Traer nuestros partidos de la BD
  const { data: ourMatches, error } = await admin
    .from('matches')
    .select('id, date, team1_id, team2_id, team1_placeholder, team2_placeholder, fd_match_id')
    .order('date').order('id')

  if (error) { console.error('Error leyendo matches:', error.message); process.exit(1) }

  // 3. Construir lookup: fecha + equipo → nuestro match
  const { data: teams } = await admin.from('teams').select('id, name')
  const teamNameById = new Map<number, string>((teams ?? []).map(t => [t.id as number, t.name as string]))

  type OurMatch = { id: number; date: string; team1_id: number | null; team2_id: number | null; team1_placeholder: string | null; team2_placeholder: string | null; fd_match_id: number | null }

  const byKey = new Map<string, OurMatch>()
  for (const m of (ourMatches ?? []) as OurMatch[]) {
    const t1 = m.team1_id ? (teamNameById.get(m.team1_id) ?? '') : (m.team1_placeholder ?? '')
    const t2 = m.team2_id ? (teamNameById.get(m.team2_id) ?? '') : (m.team2_placeholder ?? '')
    const key = `${m.date}|${normalize(t1)}|${normalize(t2)}`
    byKey.set(key, m)
  }

  // 4. Emparejar y actualizar
  const updates: { ourId: number; fdId: number; date: string; t1: string; t2: string }[] = []
  const unmatched: typeof fdMatches = []

  for (const fm of fdMatches) {
    const date = fm.utcDate.slice(0, 10)  // YYYY-MM-DD (UTC)
    const t1n = normalize(fm.homeTeam?.name)
    const t2n = normalize(fm.awayTeam?.name)
    // Si los equipos no están resueltos aún (knockout futuro), no hay clave útil
    if (!t1n || !t2n) { unmatched.push(fm); continue }

    const key = `${date}|${t1n}|${t2n}`
    const our = byKey.get(key)

    // Intentar también buscando un día antes/después (offsets horarios)
    const yesterday = new Date(date); yesterday.setDate(yesterday.getDate() - 1)
    const tomorrow  = new Date(date); tomorrow.setDate(tomorrow.getDate() + 1)
    const keyY = `${yesterday.toISOString().slice(0,10)}|${t1n}|${t2n}`
    const keyT = `${tomorrow.toISOString().slice(0,10)}|${t1n}|${t2n}`

    const match = our ?? byKey.get(keyY) ?? byKey.get(keyT)

    if (!match) {
      unmatched.push(fm)
      continue
    }
    if (match.fd_match_id === fm.id) continue  // ya estaba mapeado

    updates.push({ ourId: match.id, fdId: fm.id, date, t1: fm.homeTeam.name, t2: fm.awayTeam.name })
  }

  // 5. Mostrar y/o aplicar
  if (updates.length === 0 && unmatched.length === 0) {
    console.log('✓ Todo ya estaba mapeado, nada que hacer.')
    return
  }

  if (updates.length > 0) {
    console.log(`\n${DRY ? '[DRY] ' : ''}Mapeos a aplicar (${updates.length}):`)
    for (const u of updates) {
      console.log(`  ${u.date}  ${u.t1} vs ${u.t2}  →  fd_match_id=${u.fdId} (nuestro id=${u.ourId})`)
    }
  }

  if (unmatched.length > 0) {
    console.log(`\n⚠️  Sin emparejar (${unmatched.length}) — revisar nombres:`)
    for (const fm of unmatched) {
      console.log(`  [fd#${fm.id}] ${fm.utcDate.slice(0,10)}  ${fm.homeTeam.name} vs ${fm.awayTeam.name}`)
    }
    console.log('\n  → Añade los nombres al mapa FD_ALIASES en este script y vuelve a correr.')
  }

  if (!DRY && updates.length > 0) {
    console.log('\nAplicando actualizaciones…')
    let ok = 0, fail = 0
    for (const u of updates) {
      const { error: err } = await admin.from('matches').update({ fd_match_id: u.fdId }).eq('id', u.ourId)
      if (err) { console.error(`  ✕ id=${u.ourId}: ${err.message}`); fail++ }
      else ok++
    }
    console.log(`\n✓ ${ok} actualizados${fail ? `, ${fail} fallidos` : ''}`)
  }

  if (DRY) console.log('\n(Modo --dry: no se escribió nada en la BD)')
}

main().catch(e => { console.error(e); process.exit(1) })
