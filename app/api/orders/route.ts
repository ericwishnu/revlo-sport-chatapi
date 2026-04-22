import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendInvoiceEmail } from '@/lib/email'
import { z } from 'zod'

const itemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional().nullable(),
  quantity: z.number().int().min(1),
})

const schema = z.object({
  customerName: z.string().min(1, 'Nama customer wajib diisi'),
  customerEmail: z.string().email('Email tidak valid'),
  customerPhone: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1, 'Minimal 1 item'),
  shippingCost: z.number().min(0).default(0),
  discountAmount: z.number().min(0).default(0),
  notes: z.string().optional().nullable(),
})

async function generateInvoiceNumber(): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const count = await db.invoice.count()
  const seq = String(count + 1).padStart(4, '0')
  return `INV-${dateStr}-${seq}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = schema.parse(body)

    const productIds = data.items.map((i) => i.productId)
    const products = await db.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      include: { variants: true },
    })

    const productMap = new Map(products.map((p) => [p.id, p]))

    const resolvedItems: {
      productId: string
      variantId: string | null
      name: string
      sku: string | null
      unitPrice: number
      quantity: number
      lineTotal: number
    }[] = []

    for (const item of data.items) {
      const product = productMap.get(item.productId)
      if (!product) {
        return NextResponse.json(
          { error: `Produk dengan ID ${item.productId} tidak ditemukan atau tidak aktif` },
          { status: 400 }
        )
      }

      let unitPrice = product.price
      let itemName = product.name
      let sku = product.sku ?? null
      let variantId: string | null = null

      if (item.variantId) {
        const variant = product.variants.find((v) => v.id === item.variantId && v.isActive)
        if (!variant) {
          return NextResponse.json(
            { error: `Variant ${item.variantId} tidak ditemukan` },
            { status: 400 }
          )
        }
        variantId = variant.id
        itemName = `${product.name} - ${variant.name}`
        sku = variant.sku ?? product.sku ?? null
      }

      resolvedItems.push({
        productId: product.id,
        variantId,
        name: itemName,
        sku,
        unitPrice,
        quantity: item.quantity,
        lineTotal: unitPrice * item.quantity,
      })
    }

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
        items: {
          create: resolvedItems,
        },
      },
      include: { items: true },
    })

    const settings = await db.siteSettings.findUnique({ where: { id: 'singleton' } })
    const storeName = settings?.storeName ?? 'Revlo Sport'

    let deliveryStatus: 'SENT' | 'FAILED' = 'SENT'
    let deliveryError: string | null = null

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
        storeName,
        storeEmail: settings?.email,
        storeWhatsapp: settings?.whatsapp,
      })
    } catch (emailErr) {
      deliveryStatus = 'FAILED'
      deliveryError = emailErr instanceof Error ? emailErr.message : 'Gagal mengirim email'
    }

    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        deliveryStatus,
        deliveryError,
        deliveredAt: deliveryStatus === 'SENT' ? new Date() : null,
      },
    })

    return NextResponse.json(
      {
        invoice: { ...invoice, deliveryStatus, deliveryError },
        message:
          deliveryStatus === 'SENT'
            ? `Invoice berhasil dibuat dan dikirim ke ${data.customerEmail}`
            : `Invoice berhasil dibuat, namun email gagal dikirim: ${deliveryError}`,
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: error.errors },
        { status: 400 }
      )
    }
    console.error('POST /api/orders error:', error)
    return NextResponse.json({ error: 'Gagal membuat order' }, { status: 500 })
  }
}
