#!/usr/bin/env npx tsx
/**
 * scripts/reset-all-data.ts
 *
 * Borra TODOS los campeonatos y sus datos relacionados, y resetea
 * los resultados de partidos a NULL para empezar de cero.
 *
 * Uso:
 *   npx tsx scripts/reset-all-data.ts --dry   # muestra conteo sin tocar nada
 *   npx tsx scripts/reset-all-data.ts          # pide confirmación y ejecuta
 */

import { resolve } from 'path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import * as readline from 'readline/promises'

config({ path: resolve(process.cwd(), '.env.local') })

const IS_DRY = process.argv.includes('--dry')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

async function countRows(table: string): Promise<number> {
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true })
  return count ?? 0
}

async function main() {
  console.log('\n=== RESET ALL DATA ===\n')

  // Conteos actuales
  const counts = {
    special_predictions: await countRows('special_predictions'),
    group_predictions:   await countRows('group_predictions'),
    predictions:         await countRows('predictions'),
    championship_users:  await countRows('championship_users'),
    championships:       await countRows('championships'),
    standings:           await countRows('standings'),
  }

  // Partidos con resultado
  const { count: matchesWithResult } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .not('score1', 'is', null)

  console.log('Filas que se eliminarán / resetearán:')
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(24)} ${n} filas`)
  }
  console.log(`  ${'matches (con resultado)'.padEnd(24)} ${matchesWithResult ?? 0} filas → score1/score2/penalty1/penalty2 = NULL, status = 'scheduled'`)

  if (IS_DRY) {
    console.log('\n[DRY RUN] No se ha modificado nada.\n')
    process.exit(0)
  }

  // Confirmación interactiva
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('\nEscribe RESET para confirmar (cualquier otra cosa cancela): ')
  rl.close()

  if (answer.trim() !== 'RESET') {
    console.log('Cancelado.\n')
    process.exit(0)
  }

  console.log('\nEjecutando...\n')

  // Borrado en orden de dependencias FK
  const steps: Array<{ label: string; fn: () => Promise<number | null> }> = [
    {
      label: 'DELETE special_predictions',
      fn: async () => {
        const { error, count } = await supabase
          .from('special_predictions').delete({ count: 'exact' }).not('id', 'is', null)
        if (error) throw error
        return count
      },
    },
    {
      label: 'DELETE group_predictions',
      fn: async () => {
        const { error, count } = await supabase
          .from('group_predictions').delete({ count: 'exact' }).not('id', 'is', null)
        if (error) throw error
        return count
      },
    },
    {
      label: 'DELETE predictions',
      fn: async () => {
        const { error, count } = await supabase
          .from('predictions').delete({ count: 'exact' }).not('id', 'is', null)
        if (error) throw error
        return count
      },
    },
    {
      label: 'DELETE championship_users',
      fn: async () => {
        const { error, count } = await supabase
          .from('championship_users').delete({ count: 'exact' }).not('id', 'is', null)
        if (error) throw error
        return count
      },
    },
    {
      label: 'DELETE championships',
      fn: async () => {
        const { error, count } = await supabase
          .from('championships').delete({ count: 'exact' }).not('id', 'is', null)
        if (error) throw error
        return count
      },
    },
    {
      label: 'DELETE standings',
      fn: async () => {
        const { error, count } = await supabase
          .from('standings').delete({ count: 'exact' }).not('id', 'is', null)
        if (error) throw error
        return count
      },
    },
    {
      label: 'UPDATE matches → NULL / scheduled',
      fn: async () => {
        const { error, count } = await supabase
          .from('matches')
          .update({
            score1: null, score2: null,
            penalty1: null, penalty2: null,
            status: 'scheduled',
          }, { count: 'exact' })
          .not('id', 'is', null)
        if (error) throw error
        return count
      },
    },
  ]

  for (const step of steps) {
    try {
      const affected = await step.fn()
      console.log(`  ✓ ${step.label} — ${affected ?? '?'} filas`)
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as Record<string, unknown>).message)
          : JSON.stringify(err)
      console.error(`  ✗ ${step.label} — ERROR: ${msg}`)
      process.exit(1)
    }
  }

  console.log('\nReset completado.\n')
}

main()
