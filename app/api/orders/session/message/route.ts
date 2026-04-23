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
  CHECK_INVOICE: [
    'cek invoice',
    'invoice saya',
    'lihat invoice',
    'cek riwayat transaksi',
    'riwayat transaksi',
    'riwayat invoice',
    'cek riwayat pesanan',
    'riwayat pesanan',
    'history pesanan',
    'cek history pesanan',
  ],
  // Payment confirmation uses includes() — customer may append context
  PAYMENT_CONFIRM: ['sudah transfer', 'sudah bayar', 'konfirmasi pembayaran', 'saya sudah transfer'],
} as const

type GlobalCommand = keyof typeof GLOBAL_COMMANDS

type NumericMenuAction = GlobalCommand | 'HANDOFF' | 'STATIC'

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

async function detectNumericMenuAction(
  message: string
): Promise<{ action: NumericMenuAction; staticContent?: string } | null> {
  const normalized = message.toLowerCase().trim()
  if (!/^\d+$/.test(normalized)) return null

  const menu = await db.whatsappMenu.findFirst({
    where: { isActive: true, menuKey: normalized },
    select: {
      title: true,
      type: true,
      prompt: true,
      content: true,
    },
  })

  if (!menu) return null

  if (menu.type === 'STATIC') {
    return {
      action: 'STATIC',
      staticContent: menu.content?.trim() || 'Informasi untuk menu ini belum tersedia.',
    }
  }

  if (menu.type === 'HANDOFF') {
    return { action: 'HANDOFF' }
  }

  const menuText = `${menu.title} ${menu.prompt ?? ''} ${menu.content ?? ''}`.toLowerCase()

  if (/(riwayat|invoice|transaksi)/.test(menuText)) {
    return { action: 'CHECK_INVOICE' }
  }

  if (/(status|cek status)/.test(menuText)) {
    return { action: 'ORDER_STATUS' }
  }

  return null
}

async function hasActiveOrderSession(customerPhone: string): Promise<boolean> {
  const activeSession = await db.whatsAppOrderSession.findFirst({
    where: {
      customerPhone,
      status: { in: ['DRAFT', 'AWAITING_CONFIRMATION'] },
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  })

  return Boolean(activeSession)
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

    let customerPhone = data.customerPhone
    if (!customerPhone && data.sessionId) {
      const session = await db.whatsAppOrderSession.findUnique({
        where: { id: data.sessionId },
        select: { customerPhone: true },
      })
      customerPhone = session?.customerPhone
    }

    const normalizedMessage = data.message.toLowerCase().trim()
    const numericMenuAction = await detectNumericMenuAction(data.message)
    if (numericMenuAction && customerPhone) {
      const hasActive = await hasActiveOrderSession(customerPhone)
      if (!hasActive) {
        if (numericMenuAction.action === 'CHECK_INVOICE') {
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

        if (numericMenuAction.action === 'ORDER_STATUS') {
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

        if (numericMenuAction.action === 'STATIC') {
          return NextResponse.json(
            {
              sessionId: data.sessionId ?? null,
              customerPhone,
              status: 'collecting',
              currentStep: 'info',
              reply: numericMenuAction.staticContent,
            },
            { status: 200 }
          )
        }

        if (numericMenuAction.action === 'HANDOFF') {
          return NextResponse.json(
            {
              sessionId: data.sessionId ?? null,
              customerPhone,
              status: 'collecting',
              currentStep: 'handoff',
              reply:
                'Baik, saya bantu hubungkan ke admin. Mohon tunggu sebentar, tim kami akan segera merespons ya.',
            },
            { status: 200 }
          )
        }
      }
    }

    const globalCmd = detectGlobalCommand(data.message)

    if (globalCmd) {
      // Resolve customerPhone — required for all global commands
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
