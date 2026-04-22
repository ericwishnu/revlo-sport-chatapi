import { db } from './db'
import { formatCurrency } from './utils'

const SESSION_EXPIRY_HOURS = 24

export const PAYMENT_METHODS = [
  'Transfer BCA',
  'Transfer Mandiri',
  'Transfer BRI',
  'Transfer BNI',
  'COD (Bayar di Tempat)',
]

export interface OrderPayload {
  productId?: string
  productName?: string
  productPrice?: number
  hasVariants?: boolean
  variantId?: string | null
  variantName?: string | null
  quantity?: number
  customerName?: string
  shippingAddress?: string
  shippingMethodId?: string
  shippingMethodName?: string
  shippingCost?: number
  paymentMethod?: string
  notes?: string | null
}

export interface SessionApiResponse {
  sessionId: string
  customerPhone: string
  status: 'collecting' | 'awaiting_confirmation' | 'confirmed' | 'cancelled'
  currentStep: string
  reply: string
  invoiceText?: string
  invoiceId?: string
}

type StoreBankAccount = {
  bankName: string
  accountNumber: string
  accountHolder: string
}

// ---------- Helpers ----------

function sessionExpiry(): Date {
  const d = new Date()
  d.setHours(d.getHours() + SESSION_EXPIRY_HOURS)
  return d
}

async function generateInvoiceNumber(): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const count = await db.invoice.count()
  const seq = String(count + 1).padStart(4, '0')
  return `INV-${dateStr}-${seq}`
}

function toApiStatus(
  dbStatus: string
): 'collecting' | 'awaiting_confirmation' | 'confirmed' | 'cancelled' {
  if (dbStatus === 'AWAITING_CONFIRMATION') return 'awaiting_confirmation'
  if (dbStatus === 'CONFIRMED') return 'confirmed'
  if (dbStatus === 'CANCELLED') return 'cancelled'
  return 'collecting'
}

// ---------- DB queries ----------

async function getActiveProducts() {
  return db.product.findMany({
    where: { isActive: true },
    include: {
      variants: { where: { isActive: true }, orderBy: { name: 'asc' } },
    },
    orderBy: { name: 'asc' },
  })
}

async function getActiveShippingMethods() {
  return db.shippingMethod.findMany({
    where: { isActive: true },
    orderBy: { cost: 'asc' },
  })
}

// ---------- Stock helpers ----------

function productHasStock(p: {
  stock: number | null
  variants: { stock: number }[]
}): boolean {
  if (p.variants.length > 0) return p.variants.some((v) => v.stock > 0)
  return p.stock === null || p.stock > 0
}

// ---------- Prompt builders ----------

async function buildProductListReply(): Promise<string> {
  const products = await getActiveProducts()
  if (products.length === 0) return 'Maaf, saat ini belum ada produk yang tersedia.'

  const lines = products.map((p, i) => {
    const stockLabel = productHasStock(p) ? 'stok tersedia' : 'stok sedang kosong'
    return `${i + 1}. ${p.name} - ${formatCurrency(p.price)} (${stockLabel})`
  })

  return [
    'Halo! Silakan pilih produk yang ingin dipesan:',
    '',
    ...lines,
    '',
    'Balas dengan nomor produk pilihan Anda.',
  ].join('\n')
}

async function buildVariantListReply(
  productId: string,
  productName: string
): Promise<string> {
  const variants = await db.productVariant.findMany({
    where: { productId, isActive: true },
    orderBy: { name: 'asc' },
  })

  const lines = variants.map((v, i) => {
    const stockLabel = v.stock > 0 ? 'stok tersedia' : 'stok sedang kosong'
    return `${i + 1}. ${v.name} (${stockLabel})`
  })

  return [
    `Pilih varian untuk *${productName}*:`,
    '',
    ...lines,
    '',
    'Balas dengan nomor pilihan.',
  ].join('\n')
}

async function buildShippingListReply(): Promise<string> {
  const methods = await getActiveShippingMethods()
  if (methods.length === 0) return 'Maaf, belum ada metode pengiriman tersedia.'

  const lines = methods.map((m, i) => {
    const costLabel = m.isFree ? 'Gratis' : formatCurrency(m.cost ?? 0)
    return `${i + 1}. ${m.name} (${m.estimatedDays}) - ${costLabel}`
  })

  return [
    'Pilih metode pengiriman:',
    '',
    ...lines,
    '',
    'Balas dengan nomor pilihan.',
  ].join('\n')
}

function buildPaymentListReply(): string {
  const lines = PAYMENT_METHODS.map((m, i) => `${i + 1}. ${m}`)
  return [
    'Pilih metode pembayaran:',
    '',
    ...lines,
    '',
    'Balas dengan nomor pilihan.',
  ].join('\n')
}

function buildQuantityPrompt(itemLabel: string): string {
  return `Berapa jumlah *${itemLabel}* yang ingin dipesan? (contoh: 2)`
}

const NAME_PROMPT = 'Siapa nama penerima pesanan ini?'
const ADDRESS_PROMPT =
  'Silakan kirim alamat lengkap pengiriman (termasuk kota dan kode pos jika ada).'
const NOTES_PROMPT =
  'Ada catatan tambahan untuk pesanan ini?\n(Balas "-" jika tidak ada catatan)'

function parseBankAccounts(raw: string | null | undefined): StoreBankAccount[] {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => ({
        bankName: item?.bankName?.trim() || '',
        accountNumber: item?.accountNumber?.trim() || '',
        accountHolder: item?.accountHolder?.trim() || '',
      }))
      .filter((item) => item.bankName && item.accountNumber && item.accountHolder)
  } catch {
    return []
  }
}

function isTransferPaymentMethod(paymentMethod?: string | null): boolean {
  return (paymentMethod || '').toLowerCase().startsWith('transfer')
}

function resolveTransferAccount(
  paymentMethod: string | undefined,
  accounts: StoreBankAccount[]
): StoreBankAccount | null {
  if (!isTransferPaymentMethod(paymentMethod) || accounts.length === 0) return null

  const method = (paymentMethod || '').toLowerCase()
  const matched = accounts.find((account) => method.includes(account.bankName.toLowerCase()))
  return matched || accounts[0]
}

// ---------- Summary & invoice text ----------

export function buildConfirmationSummary(p: OrderPayload): string {
  const itemLabel = p.variantName
    ? `${p.productName} - ${p.variantName}`
    : (p.productName ?? '-')
  const qty = p.quantity ?? 0
  const unitPrice = p.productPrice ?? 0
  const subtotal = unitPrice * qty
  const shippingCost = p.shippingCost ?? 0
  const total = subtotal + shippingCost

  return [
    '*📋 Konfirmasi Pesanan*',
    '',
    `Produk: ${itemLabel}`,
    `Jumlah: ${qty} pcs`,
    `Harga Satuan: ${formatCurrency(unitPrice)}`,
    `Subtotal: ${formatCurrency(subtotal)}`,
    '',
    `Penerima: ${p.customerName ?? '-'}`,
    `Alamat: ${p.shippingAddress ?? '-'}`,
    '',
    `Pengiriman: ${p.shippingMethodName ?? '-'}`,
    `Ongkir: ${formatCurrency(shippingCost)}`,
    '',
    `Metode Pembayaran: ${p.paymentMethod ?? '-'}`,
    ...(p.notes ? [`Catatan: ${p.notes}`] : []),
    '',
    `*Total: ${formatCurrency(total)}*`,
    '',
    'Balas:',
    '✅ *YA* - Konfirmasi pesanan',
    '✏️ *UBAH* - Ubah data pesanan',
    '❌ *BATAL* - Batalkan pesanan',
  ].join('\n')
}

function buildEditMenu(hasVariants: boolean): string {
  const options = hasVariants
    ? [
        '1. Produk',
        '2. Varian',
        '3. Jumlah',
        '4. Nama penerima',
        '5. Alamat pengiriman',
        '6. Metode pengiriman',
        '7. Metode pembayaran',
        '8. Catatan',
      ]
    : [
        '1. Produk',
        '2. Jumlah',
        '3. Nama penerima',
        '4. Alamat pengiriman',
        '5. Metode pengiriman',
        '6. Metode pembayaran',
        '7. Catatan',
      ]

  return ['Pilih data yang ingin diubah:', '', ...options, '', 'Balas dengan nomor pilihan.'].join(
    '\n'
  )
}

function editStepMap(idx: number, hasVariants: boolean): string | null {
  if (hasVariants) {
    const map: Record<number, string> = {
      1: 'select_product',
      2: 'select_variant',
      3: 'select_quantity',
      4: 'enter_name',
      5: 'enter_address',
      6: 'select_shipping',
      7: 'select_payment',
      8: 'enter_notes',
    }
    return map[idx] ?? null
  } else {
    const map: Record<number, string> = {
      1: 'select_product',
      2: 'select_quantity',
      3: 'enter_name',
      4: 'enter_address',
      5: 'select_shipping',
      6: 'select_payment',
      7: 'enter_notes',
    }
    return map[idx] ?? null
  }
}

export function buildInvoiceText(
  invoiceNumber: string,
  customerPhone: string,
  payload: OrderPayload,
  storeName: string,
  bankAccounts: StoreBankAccount[]
): string {
  const itemLabel = payload.variantName
    ? `${payload.productName} - ${payload.variantName}`
    : (payload.productName ?? '-')
  const qty = payload.quantity ?? 0
  const unitPrice = payload.productPrice ?? 0
  const subtotal = unitPrice * qty
  const shippingCost = payload.shippingCost ?? 0
  const total = subtotal + shippingCost
  const dateStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const transferAccount = resolveTransferAccount(payload.paymentMethod, bankAccounts)

  const transferBlock = transferAccount
    ? [
        'Tujuan Transfer:',
        `Bank: ${transferAccount.bankName}`,
        `No. Rekening: ${transferAccount.accountNumber}`,
        `Atas Nama: ${transferAccount.accountHolder}`,
        '',
      ]
    : []
  const paymentInstruction = transferAccount
    ? 'Setelah transfer, mohon konfirmasi pembayaran ke CS agar pesanan bisa diverifikasi.'
    : 'Pesanan Anda akan diproses sesuai metode pembayaran yang dipilih.'

  return [
    '━━━━━━━━━━━━━━━━━━━━━━━',
    `  INVOICE ${storeName.toUpperCase()}`,
    '━━━━━━━━━━━━━━━━━━━━━━━',
    `No. Invoice: ${invoiceNumber}`,
    `Tanggal: ${dateStr}`,
    '',
    `Nama: ${payload.customerName ?? '-'}`,
    `No. HP: ${customerPhone}`,
    `Alamat: ${payload.shippingAddress ?? '-'}`,
    '',
    'DETAIL PESANAN:',
    `• ${itemLabel} x${qty}`,
    `  = ${formatCurrency(subtotal)}`,
    '',
    `Subtotal: ${formatCurrency(subtotal)}`,
    `Ongkir (${payload.shippingMethodName ?? '-'}): ${formatCurrency(shippingCost)}`,
    `TOTAL: ${formatCurrency(total)}`,
    '',
    `Metode Pembayaran: ${payload.paymentMethod ?? '-'}`,
    'Status: Menunggu Pembayaran',
    '',
    ...transferBlock,
    paymentInstruction,
    `Terima kasih telah berbelanja di ${storeName}!`,
    '━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n')
}

// ---------- Prompt for current step (used when resuming) ----------

async function getPromptForStep(step: string, payload: OrderPayload): Promise<string> {
  switch (step) {
    case 'select_product':
      return buildProductListReply()
    case 'select_variant':
      return buildVariantListReply(payload.productId!, payload.productName!)
    case 'select_quantity': {
      const label = payload.variantName
        ? `${payload.productName} - ${payload.variantName}`
        : (payload.productName ?? 'produk')
      return buildQuantityPrompt(label)
    }
    case 'enter_name':
      return NAME_PROMPT
    case 'enter_address':
      return ADDRESS_PROMPT
    case 'select_shipping':
      return buildShippingListReply()
    case 'select_payment':
      return buildPaymentListReply()
    case 'enter_notes':
      return NOTES_PROMPT
    case 'awaiting_confirmation':
      return buildConfirmationSummary(payload)
    case 'select_edit_field':
      return buildEditMenu(payload.hasVariants ?? false)
    default:
      return 'Balas dengan pilihan Anda.'
  }
}

// ---------- Confirm order ----------

async function confirmOrder(
  sessionId: string,
  payload: OrderPayload,
  customerPhone: string
): Promise<SessionApiResponse> {
  // Final stock check before confirming
  if (payload.variantId) {
    const variant = await db.productVariant.findUnique({ where: { id: payload.variantId } })
    if (variant && variant.stock < (payload.quantity ?? 0)) {
      return {
        sessionId,
        customerPhone,
        status: 'awaiting_confirmation',
        currentStep: 'awaiting_confirmation',
        reply: 'Maaf, stok tidak mencukupi untuk pesanan ini. Silakan ketik *UBAH* untuk mengubah jumlah.',
      }
    }
  } else if (payload.productId) {
    const product = await db.product.findUnique({ where: { id: payload.productId } })
    if (product && product.stock !== null && product.stock < (payload.quantity ?? 0)) {
      return {
        sessionId,
        customerPhone,
        status: 'awaiting_confirmation',
        currentStep: 'awaiting_confirmation',
        reply: 'Maaf, stok tidak mencukupi untuk pesanan ini. Silakan ketik *UBAH* untuk mengubah jumlah.',
      }
    }
  }

  const unitPrice = payload.productPrice!
  const qty = payload.quantity!
  const subtotal = unitPrice * qty
  const shippingCost = payload.shippingCost ?? 0
  const totalAmount = subtotal + shippingCost
  const invoiceNumber = await generateInvoiceNumber()

  const itemLabel = payload.variantName
    ? `${payload.productName} - ${payload.variantName}`
    : payload.productName!

  const notes = [
    payload.notes,
    `Pembayaran via: ${payload.paymentMethod}`,
  ]
    .filter(Boolean)
    .join(' | ')

  const invoice = await db.invoice.create({
    data: {
      invoiceNumber,
      customerName: payload.customerName!,
      customerEmail: null,
      customerPhone,
      notes: notes || null,
      subtotal,
      shippingCost,
      discountAmount: 0,
      totalAmount,
      orderStatus: 'AWAITING_PAYMENT',
      items: {
        create: [
          {
            productId: payload.productId!,
            variantId: payload.variantId ?? null,
            name: itemLabel,
            sku: null,
            unitPrice,
            quantity: qty,
            lineTotal: subtotal,
          },
        ],
      },
    },
  })

  await db.whatsAppOrderSession.update({
    where: { id: sessionId },
    data: {
      status: 'CONFIRMED',
      invoiceId: invoice.id,
      payloadJson: payload as object,
    },
  })

  const settings = await db.siteSettings.findUnique({ where: { id: 'singleton' } })
  const storeName = settings?.storeName ?? 'Revlo Sport'
  const bankAccounts = parseBankAccounts(settings?.bankAccountsJson)
  const invoiceText = buildInvoiceText(invoiceNumber, customerPhone, payload, storeName, bankAccounts)

  return {
    sessionId,
    customerPhone,
    status: 'confirmed',
    currentStep: 'confirmed',
    reply: invoiceText,
    invoiceText,
    invoiceId: invoice.id,
  }
}

// ---------- Public API ----------

export async function startSession(customerPhone: string): Promise<SessionApiResponse> {
  // Resume existing active session
  const existing = await db.whatsAppOrderSession.findFirst({
    where: {
      customerPhone,
      status: { in: ['DRAFT', 'AWAITING_CONFIRMATION'] },
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (existing) {
    const payload = existing.payloadJson as OrderPayload
    const prompt = await getPromptForStep(existing.currentStep, payload)
    return {
      sessionId: existing.id,
      customerPhone,
      status: toApiStatus(existing.status),
      currentStep: existing.currentStep,
      reply: `Anda masih memiliki sesi pemesanan yang aktif. Melanjutkan dari langkah sebelumnya.\n\n${prompt}`,
    }
  }

  // Create new session
  const productListReply = await buildProductListReply()
  const session = await db.whatsAppOrderSession.create({
    data: {
      customerPhone,
      status: 'DRAFT',
      currentStep: 'select_product',
      payloadJson: {} as object,
      expiresAt: sessionExpiry(),
    },
  })

  return {
    sessionId: session.id,
    customerPhone,
    status: 'collecting',
    currentStep: 'select_product',
    reply: productListReply,
  }
}

export async function processMessage(
  sessionId: string,
  userMessage: string
): Promise<SessionApiResponse> {
  const session = await db.whatsAppOrderSession.findUnique({ where: { id: sessionId } })
  if (!session) throw new Error('Sesi tidak ditemukan')
  if (session.status === 'CONFIRMED')
    throw new Error('Pesanan sudah dikonfirmasi. Silakan mulai sesi baru untuk memesan lagi.')
  if (session.status === 'CANCELLED')
    throw new Error('Sesi sudah dibatalkan. Silakan mulai sesi baru.')
  if (session.expiresAt < new Date())
    throw new Error('Sesi telah kedaluwarsa. Silakan mulai sesi baru.')

  const payload = session.payloadJson as OrderPayload
  const input = userMessage.trim()

  let nextStep = session.currentStep
  let updatedPayload: OrderPayload = { ...payload }
  let reply = ''
  let newStatus: 'DRAFT' | 'AWAITING_CONFIRMATION' = session.status as
    | 'DRAFT'
    | 'AWAITING_CONFIRMATION'

  switch (session.currentStep) {
    case 'select_product': {
      const products = await getActiveProducts()
      const idx = parseInt(input, 10)
      if (isNaN(idx) || idx < 1 || idx > products.length) {
        reply = `Pilihan tidak valid. Silakan balas dengan angka 1–${products.length}.`
        break
      }
      const product = products[idx - 1]
      const activeVariants = product.variants
      updatedPayload = {
        ...updatedPayload,
        productId: product.id,
        productName: product.name,
        productPrice: product.price,
        hasVariants: activeVariants.length > 0,
        variantId: null,
        variantName: null,
      }
      if (activeVariants.length > 0) {
        nextStep = 'select_variant'
        reply = await buildVariantListReply(product.id, product.name)
      } else {
        nextStep = 'select_quantity'
        reply = buildQuantityPrompt(product.name)
      }
      break
    }

    case 'select_variant': {
      const variants = await db.productVariant.findMany({
        where: { productId: updatedPayload.productId!, isActive: true },
        orderBy: { name: 'asc' },
      })
      const idx = parseInt(input, 10)
      if (isNaN(idx) || idx < 1 || idx > variants.length) {
        reply = `Pilihan tidak valid. Silakan balas dengan angka 1–${variants.length}.`
        break
      }
      const variant = variants[idx - 1]
      updatedPayload.variantId = variant.id
      updatedPayload.variantName = variant.name
      nextStep = 'select_quantity'
      reply = buildQuantityPrompt(`${updatedPayload.productName} - ${variant.name}`)
      break
    }

    case 'select_quantity': {
      const qty = parseInt(input, 10)
      if (isNaN(qty) || qty < 1) {
        reply = 'Jumlah tidak valid. Silakan masukkan angka minimal 1.'
        break
      }
      // Stock check — never expose exact numbers to customer
      if (updatedPayload.variantId) {
        const variant = await db.productVariant.findUnique({
          where: { id: updatedPayload.variantId },
        })
        if (variant && variant.stock < qty) {
          reply =
            'Maaf, saat ini stok tidak mencukupi untuk jumlah tersebut. Silakan masukkan jumlah yang lebih kecil.'
          break
        }
      } else if (updatedPayload.productId) {
        const product = await db.product.findUnique({ where: { id: updatedPayload.productId } })
        if (product && product.stock !== null && product.stock < qty) {
          reply =
            'Maaf, saat ini stok tidak mencukupi untuk jumlah tersebut. Silakan masukkan jumlah yang lebih kecil.'
          break
        }
      }
      updatedPayload.quantity = qty
      nextStep = 'enter_name'
      reply = NAME_PROMPT
      break
    }

    case 'enter_name': {
      if (!input) {
        reply = 'Nama tidak boleh kosong. Silakan masukkan nama penerima.'
        break
      }
      updatedPayload.customerName = input
      nextStep = 'enter_address'
      reply = ADDRESS_PROMPT
      break
    }

    case 'enter_address': {
      if (!input) {
        reply = 'Alamat tidak boleh kosong. Silakan masukkan alamat lengkap.'
        break
      }
      updatedPayload.shippingAddress = input
      nextStep = 'select_shipping'
      reply = await buildShippingListReply()
      break
    }

    case 'select_shipping': {
      const methods = await getActiveShippingMethods()
      const idx = parseInt(input, 10)
      if (isNaN(idx) || idx < 1 || idx > methods.length) {
        reply = `Pilihan tidak valid. Silakan balas dengan angka 1–${methods.length}.`
        break
      }
      const method = methods[idx - 1]
      updatedPayload.shippingMethodId = method.id
      updatedPayload.shippingMethodName = method.name
      updatedPayload.shippingCost = method.isFree ? 0 : (method.cost ?? 0)
      nextStep = 'select_payment'
      reply = buildPaymentListReply()
      break
    }

    case 'select_payment': {
      const idx = parseInt(input, 10)
      if (isNaN(idx) || idx < 1 || idx > PAYMENT_METHODS.length) {
        reply = `Pilihan tidak valid. Silakan balas dengan angka 1–${PAYMENT_METHODS.length}.`
        break
      }
      updatedPayload.paymentMethod = PAYMENT_METHODS[idx - 1]
      nextStep = 'enter_notes'
      reply = NOTES_PROMPT
      break
    }

    case 'enter_notes': {
      updatedPayload.notes =
        input === '-' || input.toLowerCase() === 'skip' ? null : input || null
      nextStep = 'awaiting_confirmation'
      newStatus = 'AWAITING_CONFIRMATION'
      reply = buildConfirmationSummary(updatedPayload)
      break
    }

    case 'awaiting_confirmation': {
      const cmd = input.toUpperCase()
      if (cmd === 'YA') {
        return confirmOrder(session.id, updatedPayload, session.customerPhone)
      }
      if (cmd === 'UBAH') {
        nextStep = 'select_edit_field'
        newStatus = 'DRAFT'
        reply = buildEditMenu(updatedPayload.hasVariants ?? false)
        break
      }
      if (cmd === 'BATAL') {
        return cancelSession(session.id)
      }
      reply = 'Balas *YA* untuk konfirmasi, *UBAH* untuk mengubah, atau *BATAL* untuk membatalkan.'
      break
    }

    case 'select_edit_field': {
      const idx = parseInt(input, 10)
      const targetStep = editStepMap(idx, updatedPayload.hasVariants ?? false)
      if (!targetStep) {
        const max = updatedPayload.hasVariants ? 8 : 7
        reply = `Pilihan tidak valid. Silakan balas dengan angka 1–${max}.`
        break
      }
      nextStep = targetStep
      newStatus = 'DRAFT'
      reply = await getPromptForStep(targetStep, updatedPayload)
      break
    }

    default:
      reply = 'Terjadi kesalahan pada sesi. Silakan mulai sesi baru.'
  }

  await db.whatsAppOrderSession.update({
    where: { id: sessionId },
    data: {
      currentStep: nextStep,
      payloadJson: updatedPayload as object,
      status: newStatus,
    },
  })

  return {
    sessionId: session.id,
    customerPhone: session.customerPhone,
    status: toApiStatus(newStatus),
    currentStep: nextStep,
    reply,
  }
}

export async function processMessageByPhone(
  customerPhone: string,
  userMessage: string
): Promise<SessionApiResponse> {
  const session = await db.whatsAppOrderSession.findFirst({
    where: {
      customerPhone,
      status: { in: ['DRAFT', 'AWAITING_CONFIRMATION'] },
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!session) throw new Error('Tidak ada sesi aktif. Silakan mulai sesi baru.')
  return processMessage(session.id, userMessage)
}

export async function claimPayment(
  input: { sessionId: string } | { customerPhone: string },
  customerNote?: string
): Promise<{ reply: string; invoiceNumber: string | null }> {
  // Resolve the invoice from session or phone
  let invoiceId: string | null = null

  if ('sessionId' in input) {
    const session = await db.whatsAppOrderSession.findUnique({ where: { id: input.sessionId } })
    if (!session) throw new Error('Sesi tidak ditemukan')
    if (session.status !== 'CONFIRMED') throw new Error('Pesanan belum dikonfirmasi atau sudah dibatalkan')
    invoiceId = session.invoiceId ?? null
  } else {
    const session = await db.whatsAppOrderSession.findFirst({
      where: {
        customerPhone: input.customerPhone,
        status: 'CONFIRMED',
      },
      orderBy: { updatedAt: 'desc' },
    })
    if (!session) throw new Error('Tidak ada pesanan yang dikonfirmasi untuk nomor ini')
    invoiceId = session.invoiceId ?? null
  }

  if (!invoiceId) throw new Error('Invoice tidak ditemukan untuk pesanan ini')

  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) throw new Error('Invoice tidak ditemukan')

  if (invoice.paymentStatus === 'PAID') {
    return {
      reply:
        'Pembayaran Anda sudah tercatat lunas. Terima kasih telah berbelanja di Revlo Sport! 🏸',
      invoiceNumber: invoice.invoiceNumber,
    }
  }

  if (invoice.paymentClaimedAt) {
    return {
      reply:
        `Konfirmasi pembayaran Anda sudah kami terima sebelumnya (${invoice.paymentClaimedAt.toLocaleDateString('id-ID')}). ` +
        'Tim kami sedang melakukan verifikasi. Mohon tunggu sebentar ya!',
      invoiceNumber: invoice.invoiceNumber,
    }
  }

  const claimedAt = new Date()
  const claimNote = customerNote?.trim() || null

  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      paymentClaimedAt: claimedAt,
      paymentClaimNote: claimNote,
      orderStatus: 'AWAITING_VERIFICATION',
    },
  })

  const dateStr = claimedAt.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return {
    reply: [
      `✅ Terima kasih! Konfirmasi pembayaran untuk *${invoice.invoiceNumber}* telah kami terima pada ${dateStr}.`,
      '',
      'Pembayaran Anda akan diverifikasi admin.',
      'Status pesanan akan diupdate setelah dicek.',
      'Mohon tunggu sebentar ya! 😊',
    ].join('\n'),
    invoiceNumber: invoice.invoiceNumber,
  }
}

export async function cancelSession(sessionId: string): Promise<SessionApiResponse> {
  const session = await db.whatsAppOrderSession.findUnique({ where: { id: sessionId } })
  if (!session) throw new Error('Sesi tidak ditemukan')

  await db.whatsAppOrderSession.update({
    where: { id: sessionId },
    data: { status: 'CANCELLED' },
  })

  return {
    sessionId,
    customerPhone: session.customerPhone,
    status: 'cancelled',
    currentStep: 'cancelled',
    reply: 'Pesanan telah dibatalkan. Ketik "ORDER" jika ingin memesan lagi. Terima kasih!',
  }
}

export async function cancelSessionByPhone(
  customerPhone: string
): Promise<{ cancelled: boolean; sessionId: string | null; reply: string }> {
  const session = await db.whatsAppOrderSession.findFirst({
    where: {
      customerPhone,
      status: { in: ['DRAFT', 'AWAITING_CONFIRMATION'] },
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!session) {
    return {
      cancelled: false,
      sessionId: null,
      reply: 'Saat ini tidak ada pesanan aktif yang sedang diproses.',
    }
  }

  await db.whatsAppOrderSession.update({
    where: { id: session.id },
    data: { status: 'CANCELLED' },
  })

  return {
    cancelled: true,
    sessionId: session.id,
    reply: 'Baik, pesanan Anda saya batalkan.',
  }
}

export async function getMainMenuText(): Promise<string> {
  const menuItems = await db.whatsappMenu.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })

  if (menuItems.length === 0) {
    return [
      'Baik, saya kembalikan ke menu utama ya.',
      '',
      'Ketik *ORDER* untuk mulai memesan produk.',
    ].join('\n')
  }

  const lines = menuItems.map((item, i) => `${i + 1}. ${item.title}`)
  return [
    'Baik, saya kembalikan ke menu utama ya.',
    '',
    'Silakan pilih menu:',
    '',
    ...lines,
    '',
    'Balas dengan angka pilihan Anda.',
  ].join('\n')
}

export async function getOrderStatus(customerPhone: string): Promise<string> {
  const activeSession = await db.whatsAppOrderSession.findFirst({
    where: {
      customerPhone,
      status: { in: ['DRAFT', 'AWAITING_CONFIRMATION'] },
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (activeSession) {
    if (activeSession.status === 'AWAITING_CONFIRMATION') {
      return 'Pesanan Anda sedang menunggu konfirmasi. Balas *YA* untuk konfirmasi, *UBAH* untuk mengubah, atau *BATAL* untuk membatalkan.'
    }
    return 'Anda sedang dalam proses pemesanan. Silakan lanjutkan dengan memilih pilihan sesuai pertanyaan sebelumnya.'
  }

  const confirmedSession = await db.whatsAppOrderSession.findFirst({
    where: {
      customerPhone,
      status: 'CONFIRMED',
      invoiceId: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
  })

  if (!confirmedSession?.invoiceId) {
    return 'Saat ini belum ada pesanan yang terdata untuk nomor ini.'
  }

  const invoice = await db.invoice.findUnique({ where: { id: confirmedSession.invoiceId } })
  if (!invoice) {
    return 'Saat ini belum ada pesanan yang terdata untuk nomor ini.'
  }

  const statusMap: Record<string, string> = {
    AWAITING_PAYMENT: `Pesanan Anda (*${invoice.invoiceNumber}*) sedang menunggu pembayaran.`,
    AWAITING_VERIFICATION: `Pembayaran Anda untuk *${invoice.invoiceNumber}* sedang menunggu verifikasi admin.`,
    PAYMENT_CONFIRMED: `Pembayaran pesanan *${invoice.invoiceNumber}* sudah dikonfirmasi. Pesanan sedang diproses.`,
    PROCESSING: `Pesanan *${invoice.invoiceNumber}* Anda sedang diproses.`,
    COMPLETED: `Pesanan *${invoice.invoiceNumber}* Anda sudah selesai. Terima kasih telah berbelanja! 🎉`,
  }

  return (
    statusMap[invoice.orderStatus] ??
    `Status pesanan *${invoice.invoiceNumber}*: ${invoice.orderStatus}.`
  )
}

export async function getLatestInvoiceText(customerPhone: string): Promise<string> {
  const session = await db.whatsAppOrderSession.findFirst({
    where: {
      customerPhone,
      status: 'CONFIRMED',
      invoiceId: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
  })

  if (!session?.invoiceId) {
    return 'Belum ada invoice untuk nomor ini.'
  }

  const invoice = await db.invoice.findUnique({ where: { id: session.invoiceId } })
  if (!invoice) {
    return 'Belum ada invoice untuk nomor ini.'
  }

  const settings = await db.siteSettings.findUnique({ where: { id: 'singleton' } })
  const storeName = settings?.storeName ?? 'Revlo Sport'
  const bankAccounts = parseBankAccounts(settings?.bankAccountsJson)
  const payload = session.payloadJson as OrderPayload

  return buildInvoiceText(invoice.invoiceNumber, customerPhone, payload, storeName, bankAccounts)
}
