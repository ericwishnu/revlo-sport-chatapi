import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendAutomationWebhook, extractPaymentMethod, AutomationEvent } from '@/lib/automationWebhook'
import { z } from 'zod'

const updateSchema = z.object({
  paymentStatus: z.enum(['UNPAID', 'PAID', 'CANCELLED']).optional(),
  orderStatus: z
    .enum([
      'AWAITING_PAYMENT',
      'AWAITING_VERIFICATION',
      'PAYMENT_CONFIRMED',
      'PROCESSING',
      'COMPLETED',
    ])
    .optional(),
  deliveryStatus: z.enum(['PENDING', 'SENT', 'FAILED']).optional(),
  notes: z.string().optional().nullable(),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      items: {
        include: { product: true, variant: true },
      },
    },
  })

  if (!invoice) return NextResponse.json({ error: 'Invoice tidak ditemukan' }, { status: 404 })
  return NextResponse.json(invoice)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    const updateData: z.infer<typeof updateSchema> = { ...data }

    if (data.paymentStatus === 'PAID' && !data.orderStatus) {
      updateData.orderStatus = 'PAYMENT_CONFIRMED'
    }
    if (data.paymentStatus === 'UNPAID' && !data.orderStatus) {
      updateData.orderStatus = 'AWAITING_PAYMENT'
    }
    if (data.paymentStatus === 'CANCELLED' && !data.orderStatus) {
      updateData.orderStatus = 'AWAITING_PAYMENT'
    }

    if (data.orderStatus === 'AWAITING_PAYMENT' && !data.paymentStatus) {
      updateData.paymentStatus = 'UNPAID'
    }
    if (data.orderStatus === 'AWAITING_VERIFICATION' && !data.paymentStatus) {
      updateData.paymentStatus = 'UNPAID'
    }
    if (data.orderStatus === 'PAYMENT_CONFIRMED' && !data.paymentStatus) {
      updateData.paymentStatus = 'PAID'
    }
    if (data.orderStatus === 'PROCESSING' && !data.paymentStatus) {
      updateData.paymentStatus = 'PAID'
    }
    if (data.orderStatus === 'COMPLETED' && !data.paymentStatus) {
      updateData.paymentStatus = 'PAID'
    }

    const invoice = await db.invoice.update({
      where: { id },
      data: updateData,
      include: { items: true },
    })

    let automationEvent: AutomationEvent | null = null
    if (data.orderStatus === 'COMPLETED') {
      automationEvent = 'order_completed'
    } else if (data.paymentStatus === 'PAID' || data.orderStatus === 'PAYMENT_CONFIRMED') {
      automationEvent = 'payment_verified'
    } else if (data.paymentStatus === 'CANCELLED') {
      automationEvent = 'order_cancelled'
    }

    if (automationEvent) {
      void sendAutomationWebhook(automationEvent, {
        customer: { name: invoice.customerName, phone: invoice.customerPhone ?? null },
        order: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          orderStatus: invoice.orderStatus,
          paymentStatus: invoice.paymentStatus,
          paymentMethod: extractPaymentMethod(invoice.notes),
          subtotal: invoice.subtotal,
          shippingCost: invoice.shippingCost,
          total: invoice.totalAmount,
        },
        items: invoice.items.map((item) => ({
          productName: item.name,
          variantName: null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.lineTotal,
        })),
        meta: { channel: 'dashboard', note: invoice.notes ?? null },
      })
    }

    return NextResponse.json(invoice)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validasi gagal', details: error.errors }, { status: 400 })
    }
    console.error('PUT /api/invoices/[id] error:', error)
    return NextResponse.json({ error: 'Gagal memperbarui invoice' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    await db.invoice.delete({ where: { id } })
    return NextResponse.json({ message: 'Invoice berhasil dihapus' })
  } catch {
    return NextResponse.json({ error: 'Invoice tidak ditemukan' }, { status: 404 })
  }
}
