import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const updateSchema = z.object({
  paymentStatus: z.enum(['UNPAID', 'PAID', 'CANCELLED']).optional(),
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

    const invoice = await db.invoice.update({
      where: { id },
      data,
      include: { items: true },
    })

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
