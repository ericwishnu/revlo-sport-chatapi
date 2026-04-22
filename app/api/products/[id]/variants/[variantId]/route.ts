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
  name: z.string().min(1).optional(),
  color: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  stock: z.number().int().min(0).optional(),
  imageUrl: imageUrlSchema.optional().nullable(),
  isActive: z.boolean().optional(),
})

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id, variantId } = await params
    const body = await req.json()
    const data = variantSchema.parse(body)

    const variant = await db.productVariant.update({
      where: { id: variantId, productId: id },
      data,
    })
    return NextResponse.json(variant)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      return NextResponse.json({ error: 'Variant tidak ditemukan' }, { status: 404 })
    }
    if (error instanceof Error && error.message.includes('Unique constraint failed')) {
      return NextResponse.json({ error: 'SKU variant sudah ada' }, { status: 409 })
    }
    console.error('PUT variant error:', error)
    return NextResponse.json({ error: 'Gagal memperbarui variant' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id, variantId } = await params
    
    await db.productVariant.delete({
      where: { id: variantId, productId: id },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      return NextResponse.json({ error: 'Variant tidak ditemukan' }, { status: 404 })
    }
    console.error('DELETE variant error:', error)
    return NextResponse.json({ error: 'Gagal menghapus variant' }, { status: 500 })
  }
}
