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
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  price: z.number().min(0).optional(),
  stock: z.number().int().optional().nullable(),
  sku: z.string().optional().nullable(),
  imageUrl: imageUrlSchema.optional().nullable(),
  isActive: z.boolean().optional(),
  categoryId: z.string().optional().nullable(),
})

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const body = await req.json()
    const data = schema.parse(body)

    const product = await db.product.update({
      where: { id },
      data,
      include: { category: true },
    })
    return NextResponse.json(product)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 })
    }
    if (error instanceof Error && error.message.includes('Unique constraint failed')) {
      return NextResponse.json({ error: 'SKU sudah ada' }, { status: 409 })
    }
    console.error('PUT /api/products/[id] error:', error)
    return NextResponse.json(
      { error: 'Gagal memperbarui produk' },
      { status: 500 }
    )
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    await db.product.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 })
    }
    console.error('DELETE /api/products/[id] error:', error)
    return NextResponse.json(
      { error: 'Gagal menghapus produk' },
      { status: 500 }
    )
  }
}
