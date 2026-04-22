import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { claimPayment } from '@/lib/orderSession'

const schema = z
  .object({
    sessionId: z.string().optional(),
    customerPhone: z.string().optional(),
    note: z.string().optional(),
  })
  .refine((d) => d.sessionId || d.customerPhone, {
    message: 'sessionId atau customerPhone wajib diisi',
  })

// Called by the bot when customer sends proof of payment / says they have transferred.
// Sets paymentClaimedAt on the invoice so admin knows to verify.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = schema.parse(body)

    const result = await claimPayment(
      data.sessionId ? { sessionId: data.sessionId } : { customerPhone: data.customerPhone! },
      data.note
    )

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validasi gagal', details: error.errors }, { status: 400 })
    }
    const msg = error instanceof Error ? error.message : 'Gagal memproses konfirmasi pembayaran'
    const isNotFound = msg.includes('tidak ditemukan') || msg.includes('tidak ada pesanan')
    return NextResponse.json({ error: msg }, { status: isNotFound ? 404 : 500 })
  }
}
