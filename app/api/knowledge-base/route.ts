import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function parseBankAccounts(raw: string | null | undefined) {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (!process.env.KB_API_KEY || key !== process.env.KB_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [products, faqs, shippingMethods, settings] = await Promise.all([
      db.product.findMany({
        where: { isActive: true },
        include: {
          category: true,
          variants: {
            where: { isActive: true },
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      }),
      db.faq.findMany({
        where: { isActive: true },
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      }),
      db.shippingMethod.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      db.siteSettings.findFirst(),
    ])

    const idrFormat = (amount: number) =>
      new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
      }).format(amount)

    const knowledge = {
      language_default: settings?.languageDefault ?? 'id',
      store_name: settings?.storeName ?? 'Revlo Sport',
      communication_style: settings?.communicationStyle ?? 'ramah, singkat, persuasif, sopan',
      store: {
        description: settings?.storeDesc ?? null,
        whatsapp: settings?.whatsapp ?? null,
        email: settings?.email ?? null,
        address: settings?.address ?? null,
      },
      bank_accounts: parseBankAccounts(settings?.bankAccountsJson),
      products: products.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        price: p.price,
        price_formatted: idrFormat(p.price),
        stock: p.stock ?? null,
        sku: p.sku ?? null,
        category: p.category?.name ?? null,
        image_url: p.imageUrl ?? null,
        variants: p.variants.map(v => ({
          id: v.id,
          name: v.name,
          color: v.color ?? null,
          sku: v.sku ?? null,
          stock: v.stock,
          image_url: v.imageUrl ?? null,
        })),
      })),
      faq: faqs.map(f => ({
        id: f.id,
        category: f.category,
        question: f.question,
        answer: f.answer,
      })),
      policies: shippingMethods.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description ?? null,
        estimated_days: s.estimatedDays,
        cost: s.isFree ? 0 : (s.cost ?? null),
        cost_formatted: s.isFree ? 'Gratis' : s.cost != null ? idrFormat(s.cost) : null,
        is_free: s.isFree,
      })),
      last_updated: settings?.updatedAt?.toISOString() ?? new Date().toISOString(),
    }

    return NextResponse.json(knowledge, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error('GET /api/knowledge-base error:', error)
    return NextResponse.json({ error: 'Gagal mengambil data' }, { status: 500 })
  }
}

