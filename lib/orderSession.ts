import { db } from './db'
import { formatCurrency } from './utils'
import { parseOrderMessage } from './nlpOrderParser'
import { sendAutomationWebhook, extractPaymentMethod } from './automationWebhook'

const SESSION_EXPIRY_HOURS = 24
const BACK_TO_MENU_HINT = 'Balas *0* untuk kembali ke menu utama.'

export const PAYMENT_METHODS = [
  'Transfer BCA',
  'Transfer Mandiri',
  'Transfer BRI',
  'Transfer BNI',
  'COD (Bayar di Tempat)',
]

function parsePaymentMethods(raw: string | null | undefined): string[] {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return Array.from(
      new Set(
        parsed
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter(Boolean)
      )
    )
  } catch {
    return []
  }
}

async function getPaymentMethods(): Promise<string[]> {
  const settings = await db.siteSettings.findUnique({ where: { id: 'singleton' } })
  const configured = parsePaymentMethods(settings?.paymentMethodsJson)
  return configured.length > 0 ? configured : PAYMENT_METHODS
}

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
    BACK_TO_MENU_HINT,
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
    BACK_TO_MENU_HINT,
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
    BACK_TO_MENU_HINT,
  ].join('\n')
}

async function buildPaymentListReply(): Promise<string> {
  const paymentMethods = await getPaymentMethods()
  const lines = paymentMethods.map((m, i) => `${i + 1}. ${m}`)
  return [
    'Pilih metode pembayaran:',
    '',
    ...lines,
    '',
    'Balas dengan nomor pilihan.',
    BACK_TO_MENU_HINT,
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
    BACK_TO_MENU_HINT,
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

  return [
    'Pilih data yang ingin diubah:',
    '',
    ...options,
    '',
    'Balas dengan nomor pilihan.',
    BACK_TO_MENU_HINT,
  ].join('\n')
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

  void sendAutomationWebhook('invoice_created', {
    customer: { name: payload.customerName!, phone: customerPhone },
    order: {
      sessionId,
      invoiceId: invoice.id,
      invoiceNumber,
      orderStatus: 'AWAITING_PAYMENT',
      paymentStatus: 'UNPAID',
      paymentMethod: payload.paymentMethod ?? null,
      subtotal,
      shippingCost,
      total: totalAmount,
    },
    items: [
      {
        productName: payload.productName!,
        variantName: payload.variantName ?? null,
        quantity: qty,
        unitPrice,
        subtotal,
      },
    ],
    meta: { channel: 'whatsapp', note: payload.notes ?? null },
  })

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

export async function tryNLPOrder(
  customerPhone: string,
  message: string
): Promise<SessionApiResponse | null> {
  const products = await getActiveProducts()
  const parsed = parseOrderMessage(message, products)

  if (!parsed.intentDetected || !parsed.productId) {
    return null
  }

  const payload: OrderPayload = {
    productId: parsed.productId,
    productName: parsed.productName!,
    productPrice: parsed.productPrice!,
    hasVariants: parsed.hasVariants,
  }

  let nextStep = 'select_quantity'

  if (parsed.hasVariants) {
    if (parsed.variantId) {
      payload.variantId = parsed.variantId
      payload.variantName = parsed.variantName
    } else {
      nextStep = 'select_variant'
    }
  }

  if (nextStep === 'select_quantity' && parsed.quantity !== null && parsed.quantity > 0) {
    let stockValid = true
    if (payload.variantId) {
      const variant = await db.productVariant.findUnique({ where: { id: payload.variantId } })
      if (variant && variant.stock < parsed.quantity) stockValid = false
    } else {
      const product = await db.product.findUnique({ where: { id: payload.productId } })
      if (product && product.stock !== null && product.stock < parsed.quantity) stockValid = false
    }

    if (stockValid) {
      payload.quantity = parsed.quantity
      nextStep = 'enter_name'
    }
  }

  const session = await db.whatsAppOrderSession.create({
    data: {
      customerPhone,
      status: 'DRAFT',
      currentStep: nextStep,
      payloadJson: payload as object,
      expiresAt: sessionExpiry(),
    },
  })

  const prompt = await getPromptForStep(nextStep, payload)
  const itemLabel = payload.variantName
    ? `${payload.productName} - ${payload.variantName}`
    : payload.productName
  const prefix = payload.quantity
    ? `Baik, Anda ingin memesan ${itemLabel} sebanyak ${payload.quantity}.`
    : `Baik, Anda ingin memesan ${itemLabel}.`

  return {
    sessionId: session.id,
    customerPhone,
    status: 'collecting',
    currentStep: nextStep,
    reply: `${prefix}\n\n${prompt}`,
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
      
      let product = null
      let matchedVariant = null
      let matchedQuantity = null

      if (!isNaN(idx) && idx >= 1 && idx <= products.length) {
        product = products[idx - 1]
      } else {
        const parsed = parseOrderMessage(input, products)
        if (parsed.productId) {
          product = products.find((p) => p.id === parsed.productId) || null
          if (product && parsed.variantId) {
            matchedVariant = product.variants.find((v) => v.id === parsed.variantId) || null
          }
          if (parsed.quantity) {
            matchedQuantity = parsed.quantity
          }
        }
      }

      if (!product) {
        reply = `Pilihan tidak valid. Silakan balas dengan angka 1–${products.length} atau sebutkan nama produk.`
        break
      }

      const activeVariants = product.variants
      updatedPayload = {
        ...updatedPayload,
        productId: product.id,
        productName: product.name,
        productPrice: product.price,
        hasVariants: activeVariants.length > 0,
        variantId: matchedVariant ? matchedVariant.id : null,
        variantName: matchedVariant ? matchedVariant.name : null,
      }

      if (activeVariants.length > 0 && !matchedVariant) {
        nextStep = 'select_variant'
        reply = await buildVariantListReply(product.id, product.name)
      } else if (matchedQuantity && matchedQuantity > 0) {
        // Assume stock is valid for simplicity in jump, or just let select_quantity handle it next time if it fails here
        updatedPayload.quantity = matchedQuantity
        nextStep = 'enter_name'
        reply = NAME_PROMPT
      } else {
        nextStep = 'select_quantity'
        const label = matchedVariant 
          ? `${product.name} - ${matchedVariant.name}` 
          : product.name
        reply = buildQuantityPrompt(label)
      }
      break
    }

    case 'select_variant': {
      const variants = await db.productVariant.findMany({
        where: { productId: updatedPayload.productId!, isActive: true },
        orderBy: { name: 'asc' },
      })
      const idx = parseInt(input, 10)
      
      let variant = null
      let matchedQuantity = null

      if (!isNaN(idx) && idx >= 1 && idx <= variants.length) {
        variant = variants[idx - 1]
      } else {
        // Fake a product array to reuse matchProductAndVariant or just parse it directly
        // We'll just re-run parseOrderMessage with a mock product array containing just this product
        const mockProducts = [{
          id: updatedPayload.productId,
          name: updatedPayload.productName,
          price: updatedPayload.productPrice,
          variants: variants
        }]
        const parsed = parseOrderMessage(input, mockProducts)
        if (parsed.variantId) {
          variant = variants.find((v) => v.id === parsed.variantId) || null
        }
        if (parsed.quantity) {
          matchedQuantity = parsed.quantity
        }
      }

      if (!variant) {
        reply = `Pilihan tidak valid. Silakan balas dengan angka 1–${variants.length} atau sebutkan nama varian.`
        break
      }
      
      updatedPayload.variantId = variant.id
      updatedPayload.variantName = variant.name
      
      if (matchedQuantity && matchedQuantity > 0) {
        updatedPayload.quantity = matchedQuantity
        nextStep = 'enter_name'
        reply = NAME_PROMPT
      } else {
        nextStep = 'select_quantity'
        reply = buildQuantityPrompt(`${updatedPayload.productName} - ${variant.name}`)
      }
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
      reply = await buildPaymentListReply()
      break
    }

    case 'select_payment': {
      const paymentMethods = await getPaymentMethods()
      const idx = parseInt(input, 10)
      if (isNaN(idx) || idx < 1 || idx > paymentMethods.length) {
        reply = `Pilihan tidak valid. Silakan balas dengan angka 1–${paymentMethods.length}.`
        break
      }
      updatedPayload.paymentMethod = paymentMethods[idx - 1]
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

  // --- Fast-forward logic for edits ---
  // Jika paymentMethod sudah ada, artinya form pernah diselesaikan sampai akhir.
  if (
    updatedPayload.paymentMethod &&
    session.currentStep !== 'select_edit_field' &&
    session.currentStep !== 'awaiting_confirmation'
  ) {
    const fastForwardTriggers = [
      'enter_name',
      'enter_address',
      'select_shipping',
      'select_payment',
      'enter_notes',
    ]

    if (fastForwardTriggers.includes(nextStep)) {
      nextStep = 'awaiting_confirmation'
      newStatus = 'AWAITING_CONFIRMATION'
      reply = buildConfirmationSummary(updatedPayload)
    }
  }
  // --- End of Fast-forward logic ---

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

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true },
  })
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

  void sendAutomationWebhook('payment_claimed', {
    customer: { name: invoice.customerName, phone: invoice.customerPhone ?? null },
    order: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      orderStatus: 'AWAITING_VERIFICATION',
      paymentStatus: 'UNPAID',
      paymentMethod: extractPaymentMethod(invoice.notes),
      subtotal: invoice.subtotal,
      shippingCost: invoice.shippingCost,
      total: invoice.totalAmount,
    },
    items: invoice.items.map((item) => ({
      productName: item.name,
      variantName: null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.lineTotal,
    })),
    meta: { channel: 'whatsapp', note: claimNote },
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
      'Halo! 👋 Selamat datang di Revlo Sport.',
      '',
      'Ketik *ORDER* untuk mulai memesan produk.',
    ].join('\n')
  }

  const lines = menuItems.map((item, i) => `${i + 1}. ${item.title}`)
  return [
    'Halo! 👋 Selamat datang di Revlo Sport.',
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

function getPaymentStatusLabel(status: 'UNPAID' | 'PAID' | 'CANCELLED'): string {
  const map: Record<'UNPAID' | 'PAID' | 'CANCELLED', string> = {
    UNPAID: 'Menunggu Pembayaran',
    PAID: 'Lunas',
    CANCELLED: 'Dibatalkan',
  }
  return map[status]
}

function getOrderStatusLabel(status: string): string {
  const map: Record<string, string> = {
    AWAITING_PAYMENT: 'Menunggu Pembayaran',
    AWAITING_VERIFICATION: 'Menunggu Verifikasi Pembayaran',
    PAYMENT_CONFIRMED: 'Pembayaran Terkonfirmasi',
    PROCESSING: 'Sedang Diproses',
    COMPLETED: 'Selesai',
  }
  return map[status] ?? status
}

function extractPaymentMethodFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null
  const matched = notes.match(/Pembayaran via:\s*([^|\n]+)/i)
  return matched?.[1]?.trim() || null
}

function formatInvoiceDate(d: Date): string {
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

async function getInvoicesForCustomer(customerPhone: string) {
  const directInvoices = await db.invoice.findMany({
    where: { customerPhone },
    include: {
      items: {
        include: {
          variant: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  if (directInvoices.length > 0) return directInvoices

  const sessions = await db.whatsAppOrderSession.findMany({
    where: {
      customerPhone,
      status: 'CONFIRMED',
      invoiceId: { not: null },
    },
    select: { invoiceId: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  })

  const invoiceIds = Array.from(
    new Set(
      sessions
        .map((session) => session.invoiceId)
        .filter((invoiceId): invoiceId is string => typeof invoiceId === 'string' && invoiceId.length > 0)
    )
  )

  if (invoiceIds.length === 0) return []

  const fallbackInvoices = await db.invoice.findMany({
    where: { id: { in: invoiceIds } },
    include: {
      items: {
        include: {
          variant: {
            select: { name: true },
          },
        },
      },
    },
  })

  const unique: Record<string, (typeof fallbackInvoices)[number]> = {}
  for (const session of sessions) {
    const invoice = fallbackInvoices.find((item) => item.id === session.invoiceId)
    if (invoice) unique[invoice.id] = invoice
  }

  return Object.values(unique).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

function buildInvoiceDetailText(
  invoice: any,
  customerPhone: string,
  payload: OrderPayload,
  storeName: string,
  bankAccounts: StoreBankAccount[]
): string {
  const paymentMethod = payload.paymentMethod ?? extractPaymentMethodFromNotes(invoice.notes) ?? '-'
  const shippingMethodName = payload.shippingMethodName ?? 'Pengiriman'
  const shippingAddress = payload.shippingAddress ?? '-'
  const paymentStatusLabel = getPaymentStatusLabel(invoice.paymentStatus)
  const orderStatusLabel = getOrderStatusLabel(invoice.orderStatus)

  const itemLines = invoice.items.map((item: any) => {
    const variantSuffix =
      item.variant?.name && !item.name.toLowerCase().includes(item.variant.name.toLowerCase())
        ? ` - ${item.variant.name}`
        : ''
    return `• ${item.name}${variantSuffix} x${item.quantity}\n  = ${formatCurrency(item.lineTotal)}`
  })

  const transferAccount = resolveTransferAccount(paymentMethod, bankAccounts)
  const showTransferInstruction =
    Boolean(transferAccount) &&
    invoice.paymentStatus === 'UNPAID' &&
    invoice.orderStatus === 'AWAITING_PAYMENT'

  const transferLines = showTransferInstruction && transferAccount
    ? [
        '',
        'Tujuan Transfer:',
        `Bank: ${transferAccount.bankName}`,
        `No. Rekening: ${transferAccount.accountNumber}`,
        `Atas Nama: ${transferAccount.accountHolder}`,
        '',
        'Jika sudah transfer, balas:',
        '*SUDAH TRANSFER*',
      ]
    : []

  return [
    '━━━━━━━━━━━━━━━━━━━━━━━',
    `DETAIL INVOICE ${storeName.toUpperCase()}`,
    '━━━━━━━━━━━━━━━━━━━━━━━',
    `No. Invoice: ${invoice.invoiceNumber}`,
    `Tanggal: ${formatInvoiceDate(invoice.createdAt)}`,
    '',
    `Nama: ${invoice.customerName}`,
    `No. HP: ${invoice.customerPhone ?? customerPhone}`,
    `Alamat: ${shippingAddress}`,
    '',
    'DETAIL PESANAN:',
    ...(itemLines.length > 0 ? itemLines : ['• -']),
    '',
    `Subtotal: ${formatCurrency(invoice.subtotal)}`,
    `Ongkir (${shippingMethodName}): ${formatCurrency(invoice.shippingCost)}`,
    `TOTAL: ${formatCurrency(invoice.totalAmount)}`,
    '',
    `Metode Pembayaran: ${paymentMethod}`,
    `Status Pembayaran: ${paymentStatusLabel}`,
    `Status Pesanan: ${orderStatusLabel}`,
    ...transferLines,
    '━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n')
}

export async function getTransactionHistoryList(customerPhone: string): Promise<string> {
  const invoices = await getInvoicesForCustomer(customerPhone)
  if (invoices.length === 0) {
    return ['Tidak ada riwayat pesanan.', BACK_TO_MENU_HINT].join('\n')
  }

  const lines = invoices.map((invoice, index) => {
    return `${index + 1}. ${invoice.invoiceNumber} | ${formatInvoiceDate(invoice.createdAt)} | ${formatCurrency(invoice.totalAmount)}`
  })

  return [
    '📚 *Riwayat Transaksi Anda*',
    '',
    ...lines,
    '',
    'Balas *DETAIL 1* untuk melihat detail transaksi.',
    BACK_TO_MENU_HINT,
  ].join('\n')
}

export async function getPaymentStatusList(customerPhone: string): Promise<string> {
  const invoices = await getInvoicesForCustomer(customerPhone)
  if (invoices.length === 0) {
    return ['Tidak ada riwayat pesanan.', BACK_TO_MENU_HINT].join('\n')
  }

  const lines = invoices.map((invoice, index) => {
    return `${index + 1}. ${invoice.invoiceNumber} | Bayar: ${getPaymentStatusLabel(invoice.paymentStatus)} | Pesanan: ${getOrderStatusLabel(invoice.orderStatus)}`
  })

  return [
    '💳 *Status Pembayaran & Pesanan*',
    '',
    ...lines,
    '',
    'Balas *STATUS 1* untuk melihat status item tertentu.',
    BACK_TO_MENU_HINT,
  ].join('\n')
}

export async function getInvoiceDetailByIndex(
  customerPhone: string,
  index: number
): Promise<string> {
  const invoices = await getInvoicesForCustomer(customerPhone)
  if (invoices.length === 0) {
    return ['Tidak ada riwayat pesanan.', BACK_TO_MENU_HINT].join('\n')
  }
  if (!Number.isInteger(index) || index < 1 || index > invoices.length) {
    return [
      `Pilihan tidak valid. Balas DETAIL 1 sampai DETAIL ${invoices.length}.`,
      BACK_TO_MENU_HINT,
    ].join('\n')
  }

  const invoice = invoices[index - 1]
  const session = await db.whatsAppOrderSession.findFirst({
    where: {
      customerPhone,
      status: 'CONFIRMED',
      invoiceId: invoice.id,
    },
    orderBy: { updatedAt: 'desc' },
  })

  const settings = await db.siteSettings.findUnique({ where: { id: 'singleton' } })
  const payload = (session?.payloadJson ?? {}) as OrderPayload
  const storeName = settings?.storeName ?? 'Revlo Sport'
  const bankAccounts = parseBankAccounts(settings?.bankAccountsJson)

  return buildInvoiceDetailText(invoice, customerPhone, payload, storeName, bankAccounts)
}

export async function getPaymentStatusByIndex(
  customerPhone: string,
  index: number
): Promise<string> {
  const invoices = await getInvoicesForCustomer(customerPhone)
  if (invoices.length === 0) {
    return ['Tidak ada riwayat pesanan.', BACK_TO_MENU_HINT].join('\n')
  }
  if (!Number.isInteger(index) || index < 1 || index > invoices.length) {
    return [
      `Pilihan tidak valid. Balas STATUS 1 sampai STATUS ${invoices.length}.`,
      BACK_TO_MENU_HINT,
    ].join('\n')
  }

  const invoice = invoices[index - 1]

  return [
    `📌 *Status Transaksi ${invoice.invoiceNumber}*`,
    '',
    `Tanggal: ${formatInvoiceDate(invoice.createdAt)}`,
    `Total: ${formatCurrency(invoice.totalAmount)}`,
    `Status Pembayaran: ${getPaymentStatusLabel(invoice.paymentStatus)}`,
    `Status Pesanan: ${getOrderStatusLabel(invoice.orderStatus)}`,
    '',
    `Balas *DETAIL ${index}* untuk melihat detail invoice ini.`,
    BACK_TO_MENU_HINT,
  ].join('\n')
}

export async function getLatestInvoiceText(customerPhone: string): Promise<string> {
  return getInvoiceDetailByIndex(customerPhone, 1)
}
