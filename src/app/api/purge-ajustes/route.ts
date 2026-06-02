import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  revalidatePath('/campeonato/[id]/ajustes', 'page')
  return NextResponse.json({ ok: true, ts: Date.now() })
}
