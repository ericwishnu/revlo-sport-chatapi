import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  cancelSessionByPhone,
  claimPayment,
  getLatestInvoiceText,
  getMainMenuText,
  getOrderStatus,
  processMessage,
  processMessageByPhone,
} from '@/lib/orderSession'
import { db } from '@/lib/db'

// Exact-match keywords for menu/cancel/status/invoice commands
const GLOBAL_COMMANDS = {
  MENU: ['menu', 'menu utama', 'home', 'mulai lagi'],
  CANCEL_ORDER: ['batal pesanan'],
  ORDER_STATUS: ['status pesanan', 'cek status', 'status transaksi'],
  CHECK_INVOICE: ['cek invoice', 'invoice saya', 'lihat invoice'],
  // Payment confirmation uses includes() — customer may append context
  PAYMENT_CONFIRM: ['sudah transfer', 'sudah bayar', 'konfirmasi pembayaran', 'saya sudah transfer'],
} as const

type GlobalCommand = keyof typeof GLOBAL_COMMANDS

function detectGlobalCommand(message: string): GlobalCommand | null {
  const normalized = message.toLowerCase().trim()

  // Payment confirmation: flexible (customer may write extra context)
  if (GLOBAL_COMMANDS.PAYMENT_CONFIRM.some((kw) => normalized.includes(kw))) {
    return 'PAYMENT_CONFIRM'
  }

  // All other global commands: exact match only
  for (const cmd of ['MENU', 'CANCEL_ORDER', 'ORDER_STATUS', 'CHECK_INVOICE'] as const) {
    if (GLOBAL_COMMANDS[cmd].some((kw) => normalized === kw)) {
      return cmd
    }
  }

  return null
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

    const globalCmd = detectGlobalCommand(data.message)

    if (globalCmd) {
      // Resolve customerPhone — required for all global commands
      let customerPhone = data.customerPhone
      if (!customerPhone && data.sessionId) {
        const session = await db.whatsAppOrderSession.findUnique({
          where: { id: data.sessionId },
          select: { customerPhone: true },
        })
        customerPhone = session?.customerPhone
      }
      if (!customerPhone) {
        return NextResponse.json(
          { error: 'customerPhone diperlukan untuk perintah ini' },
          { status: 400 }
        )
      }

      if (globalCmd === 'MENU') {
        // Cancel active session if any, then return main menu
        await cancelSessionByPhone(customerPhone)
        const menuText = await getMainMenuText()
        return NextResponse.json(
          {
            sessionId: null,
            customerPhone,
            status: 'cancelled',
            currentStep: 'main_menu',
            reply: menuText,
          },
          { status: 200 }
        )
      }

      if (globalCmd === 'CANCEL_ORDER') {
        const result = await cancelSessionByPhone(customerPhone)
        return NextResponse.json(
          {
            sessionId: result.sessionId ?? data.sessionId ?? null,
            customerPhone,
            status: 'cancelled',
            currentStep: 'cancelled',
            reply: result.reply,
          },
          { status: 200 }
        )
      }

      if (globalCmd === 'ORDER_STATUS') {
        const statusText = await getOrderStatus(customerPhone)
        return NextResponse.json(
          {
            sessionId: data.sessionId ?? null,
            customerPhone,
            status: 'collecting',
            currentStep: 'info',
            reply: statusText,
          },
          { status: 200 }
        )
      }

      if (globalCmd === 'CHECK_INVOICE') {
        const invoiceText = await getLatestInvoiceText(customerPhone)
        return NextResponse.json(
          {
            sessionId: data.sessionId ?? null,
            customerPhone,
            status: 'collecting',
            currentStep: 'info',
            reply: invoiceText,
          },
          { status: 200 }
        )
      }

      if (globalCmd === 'PAYMENT_CONFIRM') {
        const claimResult = data.sessionId
          ? await claimPayment({ sessionId: data.sessionId }, data.message)
          : await claimPayment({ customerPhone }, data.message)
        return NextResponse.json(
          {
            sessionId: data.sessionId ?? null,
            customerPhone,
            status: 'confirmed',
            currentStep: 'confirmed',
            reply: claimResult.reply,
            invoiceNumber: claimResult.invoiceNumber,
          },
          { status: 200 }
        )
      }
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
