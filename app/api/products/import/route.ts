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
  stock: z.number().int().min(0).default(0),
  imageUrl: imageUrlSchema.optional().nullable(),
  isActive: z.boolean().default(true),
})

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  price: z.number().min(0),
  stock: z.number().int().optional().nullable(),
  sku: z.string().optional().nullable(),
  imageUrl: imageUrlSchema.optional().nullable(),
  isActive: z.boolean().default(true),
  categoryName: z.string().optional().nullable(),
  variants: z.array(variantSchema).optional().default([]),
})

const importSchema = z.object({
  products: z.array(productSchema).min(1),
})

function normalizeText(value?: string | null) {
  return value?.trim() || null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    let rawData: unknown

    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file') as File | null
      if (!file) {
        return NextResponse.json({ error: 'File import tidak ditemukan' }, { status: 400 })
      }
      const text = await file.text()
      rawData = JSON.parse(text)
    } else {
      rawData = await req.json()
    }

    const parsed = importSchema.parse(rawData)

    let created = 0
    let updated = 0
    let failed = 0

    for (const item of parsed.products) {
      try {
        const categoryName = normalizeText(item.categoryName)
        let categoryId: string | null = null

        if (categoryName) {
          const category = await db.category.upsert({
            where: { name: categoryName },
            update: {},
            create: { name: categoryName },
          })
          categoryId = category.id
        }

        const productData = {
          name: item.name.trim(),
          description: normalizeText(item.description),
          price: item.price,
          stock: item.stock ?? null,
          sku: normalizeText(item.sku),
          imageUrl: normalizeText(item.imageUrl),
          isActive: item.isActive,
          categoryId,
        }

        let productId: string

        if (productData.sku) {
          const existing = await db.product.findUnique({ where: { sku: productData.sku } })
          if (existing) {
            await db.product.update({
              where: { id: existing.id },
              data: productData,
            })
            updated += 1
            productId = existing.id
          } else {
            const createdProduct = await db.product.create({ data: productData })
            created += 1
            productId = createdProduct.id
          }
        } else {
          const createdProduct = await db.product.create({ data: productData })
          created += 1
          productId = createdProduct.id
        }

        for (const v of item.variants) {
          const variantData = {
            name: v.name.trim(),
            color: normalizeText(v.color),
            sku: normalizeText(v.sku),
            stock: v.stock,
            imageUrl: normalizeText(v.imageUrl),
            isActive: v.isActive,
          }

          if (variantData.sku) {
            const existingVariant = await db.productVariant.findFirst({
              where: { productId, sku: variantData.sku },
            })

            if (existingVariant) {
              await db.productVariant.update({
                where: { id: existingVariant.id },
                data: variantData,
              })
            } else {
              await db.productVariant.create({
                data: { ...variantData, productId },
              })
            }
          } else {
            await db.productVariant.create({
              data: { ...variantData, productId },
            })
          }
        }
      } catch (error) {
        failed += 1
        console.error('Import item error:', error)
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: parsed.products.length,
        created,
        updated,
        failed,
      },
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Format JSON tidak valid' }, { status: 400 })
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      )
    }

    console.error('POST /api/products/import error:', error)
    return NextResponse.json({ error: 'Gagal import produk' }, { status: 500 })
  }
}
