import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { processMessage } from '@/lib/orderSession'

const schema = z.object({
  sessionId: z.string().min(1, 'sessionId wajib diisi'),
})

// Explicit confirm endpoint — equivalent to sending "YA" in the message flow.
// Bot can call this directly when customer confirms via button/quick-reply.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionId } = schema.parse(body)
    const result = await processMessage(sessionId, 'YA')
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validasi gagal', details: error.errors }, { status: 400 })
    }
    const msg = error instanceof Error ? error.message : 'Gagal mengkonfirmasi pesanan'
    const isNotFound = msg.includes('tidak ditemukan')
    return NextResponse.json({ error: msg }, { status: isNotFound ? 404 : 500 })
  }
}
