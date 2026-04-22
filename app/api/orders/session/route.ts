import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

const ORDER_SESSION_STATUSES = new Set([
  'DRAFT',
  'AWAITING_CONFIRMATION',
  'CONFIRMED',
  'CANCELLED',
])

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.floor(parsed)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)

  const statusParam = (searchParams.get('status') || '').toUpperCase().trim()
  if (statusParam && !ORDER_SESSION_STATUSES.has(statusParam)) {
    return NextResponse.json(
      {
        error:
          'Status tidak valid. Gunakan: DRAFT, AWAITING_CONFIRMATION, CONFIRMED, atau CANCELLED.',
      },
      { status: 400 }
    )
  }

  const customerPhone = (searchParams.get('customerPhone') || '').trim()
  const activeOnly = searchParams.get('activeOnly') === 'true'
  const limit = Math.min(parsePositiveInt(searchParams.get('limit'), 50), 200)
  const page = parsePositiveInt(searchParams.get('page'), 1)
  const skip = (page - 1) * limit

  const where = {
    ...(statusParam ? { status: statusParam as any } : {}),
    ...(customerPhone ? { customerPhone: { contains: customerPhone } } : {}),
    ...(activeOnly ? { expiresAt: { gt: new Date() } } : {}),
  }

  const [total, sessions] = await Promise.all([
    db.whatsAppOrderSession.count({ where }),
    db.whatsAppOrderSession.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
  ])

  const invoiceIds = sessions.map((item) => item.invoiceId).filter((id): id is string => Boolean(id))

  const invoices = invoiceIds.length
    ? await db.invoice.findMany({
        where: { id: { in: invoiceIds } },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          paymentStatus: true,
          orderStatus: true,
          createdAt: true,
        },
      })
    : []

  const invoiceMap = new Map(invoices.map((item) => [item.id, item]))

  return NextResponse.json({
    meta: {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    data: sessions.map((item) => ({
      ...item,
      invoice: item.invoiceId ? invoiceMap.get(item.invoiceId) ?? null : null,
    })),
  })
}
