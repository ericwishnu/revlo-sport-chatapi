import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { startSession } from '@/lib/orderSession'

const schema = z.object({
  customerPhone: z.string().min(1, 'Nomor HP wajib diisi'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { customerPhone } = schema.parse(body)
    const result = await startSession(customerPhone)
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validasi gagal', details: error.errors }, { status: 400 })
    }
    console.error('POST /api/orders/session/start error:', error)
    return NextResponse.json({ error: 'Gagal memulai sesi pemesanan' }, { status: 500 })
  }
}
