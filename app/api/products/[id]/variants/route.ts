import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const imageUrlSchema = z.union([
  z.string().url(),
  z.string().startsWith('/uploads/'),
])

const variantSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  stock: z.number().int().min(0),
  imageUrl: imageUrlSchema.optional().nullable(),
  isActive: z.boolean().default(true),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    
    // Verify product exists
    const product = await db.product.findUnique({ where: { id } })
    if (!product) {
      return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 })
    }

    const variants = await db.productVariant.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(variants)
  } catch (error) {
    console.error('GET variants error:', error)
    return NextResponse.json({ error: 'Gagal mengambil variant' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const body = await req.json()
    
    // Verify product exists
    const product = await db.product.findUnique({ where: { id } })
    if (!product) {
      return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 })
    }

    const data = variantSchema.parse(body)

    const variant = await db.productVariant.create({
      data: {
        ...data,
        productId: id,
      },
    })
    return NextResponse.json(variant, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }))
      return NextResponse.json(
        { error: 'Validation error', details: fieldErrors },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message.includes('Unique constraint failed')) {
      return NextResponse.json({ error: 'SKU variant sudah ada untuk produk ini' }, { status: 409 })
    }
    console.error('POST variant error:', error)
    return NextResponse.json({ error: 'Gagal membuat variant' }, { status: 500 })
  }
}
