import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const imageUrlSchema = z.union([
  z.string().url(),
  z.string().startsWith('/uploads/'),
])

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  price: z.number().min(0),
  stock: z.number().int().optional().nullable(),
  sku: z.string().optional().nullable(),
  imageUrl: imageUrlSchema.optional().nullable(),
  isActive: z.boolean().default(true),
  categoryId: z.string().optional().nullable(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const products = await db.product.findMany({
    include: { category: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(products)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const data = schema.parse(body)

    const product = await db.product.create({ data, include: { category: true } })
    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message.includes('Unique constraint failed')) {
      return NextResponse.json({ error: 'SKU sudah ada' }, { status: 409 })
    }
    console.error('POST /api/products error:', error)
    return NextResponse.json(
      { error: 'Gagal membuat produk' },
      { status: 500 }
    )
  }
}
