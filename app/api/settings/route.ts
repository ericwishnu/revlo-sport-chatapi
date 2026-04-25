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
    automationWebhookSecret: undefined,
    automationSecretIsSet: !!settings.automationWebhookSecret,
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
    automationWebhookUrl,
    automationEnabled,
    automationWebhookSecret,
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

  // Only overwrite the secret when a non-empty value is explicitly provided
  const secretUpdate =
    typeof automationWebhookSecret === 'string' && automationWebhookSecret.length > 0
      ? { automationWebhookSecret }
      : {}

  const sharedData = {
    storeName,
    storeDesc,
    whatsapp,
    email,
    address,
    languageDefault,
    communicationStyle,
    bankAccountsJson: JSON.stringify(normalizedBankAccounts),
    paymentMethodsJson: JSON.stringify(normalizedPaymentMethods),
    automationWebhookUrl: automationWebhookUrl ?? null,
    automationEnabled: automationEnabled === true,
    ...secretUpdate,
  }

  const settings = await db.siteSettings.upsert({
    where: { id: 'singleton' },
    update: sharedData,
    create: { id: 'singleton', ...sharedData },
  })

  return NextResponse.json({
    ...settings,
    bankAccounts: normalizedBankAccounts,
    paymentMethods: normalizedPaymentMethods,
    automationWebhookSecret: undefined,
    automationSecretIsSet: !!settings.automationWebhookSecret,
  })
}
