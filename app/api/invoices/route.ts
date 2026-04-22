import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendInvoiceEmail } from '@/lib/email'
import { z } from 'zod'

const itemSchema = z.object({
  productId: z.string().optional().nullable(),
  variantId: z.string().optional().nullable(),
  name: z.string().min(1),
  sku: z.string().optional().nullable(),
  unitPrice: z.number().min(0),
  quantity: z.number().int().min(1),
})

const schema = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerPhone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1),
  shippingCost: z.number().min(0).default(0),
  discountAmount: z.number().min(0).default(0),
  sendEmail: z.boolean().default(true),
})

async function generateInvoiceNumber(): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const count = await db.invoice.count()
  const seq = String(count + 1).padStart(4, '0')
  return `INV-${dateStr}-${seq}`
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const paymentStatus = searchParams.get('paymentStatus') ?? ''
  const deliveryStatus = searchParams.get('deliveryStatus') ?? ''

  const invoices = await db.invoice.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { invoiceNumber: { contains: search } },
                { customerName: { contains: search } },
                { customerEmail: { contains: search } },
              ],
            }
          : {},
        paymentStatus ? { paymentStatus: paymentStatus as any } : {},
        deliveryStatus ? { deliveryStatus: deliveryStatus as any } : {},
      ],
    },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(invoices)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const data = schema.parse(body)

    const resolvedItems = data.items.map((item) => ({
      productId: item.productId ?? null,
      variantId: item.variantId ?? null,
      name: item.name,
      sku: item.sku ?? null,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.unitPrice * item.quantity,
    }))

    const subtotal = resolvedItems.reduce((sum, i) => sum + i.lineTotal, 0)
    const totalAmount = subtotal + data.shippingCost - data.discountAmount
    const invoiceNumber = await generateInvoiceNumber()

    const invoice = await db.invoice.create({
      data: {
        invoiceNumber,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone ?? null,
        notes: data.notes ?? null,
        subtotal,
        shippingCost: data.shippingCost,
        discountAmount: data.discountAmount,
        totalAmount,
        items: { create: resolvedItems },
      },
      include: { items: true },
    })

    let deliveryStatus: 'PENDING' | 'SENT' | 'FAILED' = 'PENDING'
    let deliveryError: string | null = null

    if (data.sendEmail) {
      const settings = await db.siteSettings.findUnique({ where: { id: 'singleton' } })
      try {
        await sendInvoiceEmail({
          invoiceNumber,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          items: resolvedItems,
          subtotal,
          shippingCost: data.shippingCost,
          discountAmount: data.discountAmount,
          totalAmount,
          notes: data.notes,
          storeName: settings?.storeName ?? 'Revlo Sport',
          storeEmail: settings?.email,
          storeWhatsapp: settings?.whatsapp,
        })
        deliveryStatus = 'SENT'
      } catch (emailErr) {
        deliveryStatus = 'FAILED'
        deliveryError = emailErr instanceof Error ? emailErr.message : 'Email error'
      }

      await db.invoice.update({
        where: { id: invoice.id },
        data: {
          deliveryStatus,
          deliveryError,
          deliveredAt: deliveryStatus === 'SENT' ? new Date() : null,
        },
      })
    }

    return NextResponse.json({ ...invoice, deliveryStatus, deliveryError }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validasi gagal', details: error.errors }, { status: 400 })
    }
    console.error('POST /api/invoices error:', error)
    return NextResponse.json({ error: 'Gagal membuat invoice' }, { status: 500 })
  }
}
