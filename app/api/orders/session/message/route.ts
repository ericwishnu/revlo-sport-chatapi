import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { processMessage, processMessageByPhone } from '@/lib/orderSession'

// Accept either sessionId or customerPhone to look up the active session
const schema = z.object({
  sessionId: z.string().optional(),
  customerPhone: z.string().optional(),
  message: z.string().min(1, 'Pesan tidak boleh kosong'),
}).refine((d) => d.sessionId || d.customerPhone, {
  message: 'sessionId atau customerPhone wajib diisi',
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = schema.parse(body)

    const result = data.sessionId
      ? await processMessage(data.sessionId, data.message)
      : await processMessageByPhone(data.customerPhone!, data.message)

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validasi gagal', details: error.errors }, { status: 400 })
    }
    const msg = error instanceof Error ? error.message : 'Gagal memproses pesan'
    const isNotFound = msg.includes('tidak ditemukan') || msg.includes('tidak ada sesi')
    return NextResponse.json({ error: msg }, { status: isNotFound ? 404 : 500 })
  }
}
