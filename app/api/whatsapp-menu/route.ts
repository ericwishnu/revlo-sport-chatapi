import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Public endpoint — dipakai oleh WhatsApp bot, tidak perlu auth
export async function GET() {
  const menus = await db.whatsappMenu.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      menuKey: true,
      title: true,
      type: true,
      prompt: true,
      content: true,
    },
  })

  const formatted = menus.map((m) => ({
    key: m.menuKey,
    title: m.title,
    type: m.type.toLowerCase(),
    ...(m.prompt ? { prompt: m.prompt } : {}),
    ...(m.content ? { content: m.content } : {}),
  }))

  return NextResponse.json({ menus: formatted })
}
