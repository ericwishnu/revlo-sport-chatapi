import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { claimPayment, processMessage, processMessageByPhone } from '@/lib/orderSession'

const PAYMENT_CONFIRM_KEYWORDS = [
  'sudah transfer',
  'sudah bayar',
  'konfirmasi pembayaran',
]

function isPaymentConfirmationMessage(message: string): boolean {
  const normalized = message.toLowerCase().trim()
  return PAYMENT_CONFIRM_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

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

    if (isPaymentConfirmationMessage(data.message)) {
      const claimResult = data.sessionId
        ? await claimPayment({ sessionId: data.sessionId }, data.message)
        : await claimPayment({ customerPhone: data.customerPhone! }, data.message)

      return NextResponse.json(
        {
          sessionId: data.sessionId ?? null,
          customerPhone: data.customerPhone ?? null,
          status: 'confirmed',
          currentStep: 'confirmed',
          reply: claimResult.reply,
          invoiceNumber: claimResult.invoiceNumber,
        },
        { status: 200 }
      )
    }

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
