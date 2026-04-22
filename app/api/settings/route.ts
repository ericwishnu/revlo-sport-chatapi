import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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

function parsePaymentMethods(raw: string | null | undefined) {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await db.siteSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', storeName: 'Revlo Sport' },
  })
  return NextResponse.json({
    ...settings,
    bankAccounts: parseBankAccounts(settings.bankAccountsJson),
    paymentMethods: parsePaymentMethods(settings.paymentMethodsJson),
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    storeName,
    storeDesc,
    whatsapp,
    email,
    address,
    languageDefault,
    communicationStyle,
    bankAccounts,
    paymentMethods,
  } = await req.json()

  const normalizedBankAccounts = Array.isArray(bankAccounts)
    ? bankAccounts
        .map((account) => ({
          bankName: account.bankName?.trim() || '',
          accountNumber: account.accountNumber?.trim() || '',
          accountHolder: account.accountHolder?.trim() || '',
        }))
        .filter((account) => account.bankName && account.accountNumber && account.accountHolder)
    : []

  const normalizedPaymentMethods = Array.isArray(paymentMethods)
    ? Array.from(
        new Set(
          paymentMethods
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter(Boolean)
        )
      )
    : []

  const settings = await db.siteSettings.upsert({
    where: { id: 'singleton' },
    update: {
      storeName,
      storeDesc,
      whatsapp,
      email,
      address,
      languageDefault,
      communicationStyle,
      bankAccountsJson: JSON.stringify(normalizedBankAccounts),
      paymentMethodsJson: JSON.stringify(normalizedPaymentMethods),
    },
    create: {
      id: 'singleton',
      storeName,
      storeDesc,
      whatsapp,
      email,
      address,
      languageDefault,
      communicationStyle,
      bankAccountsJson: JSON.stringify(normalizedBankAccounts),
      paymentMethodsJson: JSON.stringify(normalizedPaymentMethods),
    },
  })
  return NextResponse.json({
    ...settings,
    bankAccounts: normalizedBankAccounts,
    paymentMethods: normalizedPaymentMethods,
  })
}
