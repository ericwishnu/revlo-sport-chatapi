import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const products = await db.product.findMany({
      include: {
        category: true,
        variants: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const payload = {
      meta: {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        source: 'revlo.sport',
      },
      products: products.map((p) => ({
        name: p.name,
        description: p.description,
        price: p.price,
        stock: p.stock,
        sku: p.sku,
        imageUrl: p.imageUrl,
        isActive: p.isActive,
        categoryName: p.category?.name ?? null,
        variants: p.variants.map((v) => ({
          name: v.name,
          color: v.color,
          sku: v.sku,
          stock: v.stock,
          imageUrl: v.imageUrl,
          isActive: v.isActive,
        })),
      })),
    }

    return NextResponse.json(payload, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('GET /api/products/export error:', error)
    return NextResponse.json({ error: 'Gagal export produk' }, { status: 500 })
  }
}
