import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendInvoiceEmail } from '@/lib/email'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: { items: true },
  })

  if (!invoice) return NextResponse.json({ error: 'Invoice tidak ditemukan' }, { status: 404 })

  const settings = await db.siteSettings.findUnique({ where: { id: 'singleton' } })

  try {
    await sendInvoiceEmail({
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      customerEmail: invoice.customerEmail,
      customerPhone: invoice.customerPhone,
      items: invoice.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
      subtotal: invoice.subtotal,
      shippingCost: invoice.shippingCost,
      discountAmount: invoice.discountAmount,
      totalAmount: invoice.totalAmount,
      notes: invoice.notes,
      storeName: settings?.storeName ?? 'Revlo Sport',
      storeEmail: settings?.email,
      storeWhatsapp: settings?.whatsapp,
    })

    await db.invoice.update({
      where: { id },
      data: {
        deliveryStatus: 'SENT',
        deliveryError: null,
        deliveredAt: new Date(),
      },
    })

    return NextResponse.json({ message: `Invoice berhasil dikirim ke ${invoice.customerEmail}` })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Gagal mengirim email'
    await db.invoice.update({
      where: { id },
      data: { deliveryStatus: 'FAILED', deliveryError: msg },
    })
    console.error('POST /api/invoices/[id]/send error:', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
