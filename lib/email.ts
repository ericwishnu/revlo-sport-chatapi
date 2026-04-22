import nodemailer from 'nodemailer'
import { formatCurrency } from './utils'

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

export type InvoiceEmailData = {
  invoiceNumber: string
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  items: {
    name: string
    sku?: string | null
    quantity: number
    unitPrice: number
    lineTotal: number
  }[]
  subtotal: number
  shippingCost: number
  discountAmount: number
  totalAmount: number
  notes?: string | null
  storeName: string
  storeEmail?: string | null
  storeWhatsapp?: string | null
}

export async function sendInvoiceEmail(data: InvoiceEmailData) {
  const itemRows = data.items
    .map(
      (item) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;">
        <strong style="color:#111;">${item.name}</strong>
        ${item.sku ? `<br><span style="color:#9ca3af;font-size:12px;">SKU: ${item.sku}</span>` : ''}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:14px;color:#374151;">${item.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:14px;color:#374151;">${formatCurrency(item.unitPrice)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:14px;font-weight:600;color:#111;">${formatCurrency(item.lineTotal)}</td>
    </tr>`
    )
    .join('')

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Invoice ${data.invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#1d4ed8;padding:28px 32px;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${data.storeName}</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Invoice Pembelian</p>
    </div>

    <!-- Invoice Meta -->
    <div style="padding:28px 32px;border-bottom:1px solid #e5e7eb;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Kepada</p>
            <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#111;">${data.customerName}</p>
            <p style="margin:2px 0 0;font-size:13px;color:#6b7280;">${data.customerEmail}</p>
            ${data.customerPhone ? `<p style="margin:2px 0 0;font-size:13px;color:#6b7280;">${data.customerPhone}</p>` : ''}
          </td>
          <td style="vertical-align:top;text-align:right;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">No. Invoice</p>
            <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#1d4ed8;">${data.invoiceNumber}</p>
            <p style="margin:2px 0 0;font-size:13px;color:#6b7280;">${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </td>
        </tr>
      </table>
    </div>

    <!-- Items Table -->
    <div style="padding:28px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Produk</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Qty</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Harga</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <!-- Totals -->
      <div style="margin-top:20px;margin-left:auto;max-width:260px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:5px 0;font-size:14px;color:#6b7280;">Subtotal</td>
            <td style="padding:5px 0;font-size:14px;color:#374151;text-align:right;">${formatCurrency(data.subtotal)}</td>
          </tr>
          ${
            data.shippingCost > 0
              ? `<tr>
            <td style="padding:5px 0;font-size:14px;color:#6b7280;">Ongkos Kirim</td>
            <td style="padding:5px 0;font-size:14px;color:#374151;text-align:right;">${formatCurrency(data.shippingCost)}</td>
          </tr>`
              : ''
          }
          ${
            data.discountAmount > 0
              ? `<tr>
            <td style="padding:5px 0;font-size:14px;color:#16a34a;">Diskon</td>
            <td style="padding:5px 0;font-size:14px;color:#16a34a;text-align:right;">-${formatCurrency(data.discountAmount)}</td>
          </tr>`
              : ''
          }
          <tr>
            <td colspan="2" style="padding-top:10px;"><div style="border-top:2px solid #e5e7eb;"></div></td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:16px;font-weight:700;color:#111;">Total</td>
            <td style="padding:8px 0;font-size:16px;font-weight:700;color:#1d4ed8;text-align:right;">${formatCurrency(data.totalAmount)}</td>
          </tr>
        </table>
      </div>

      <!-- Notes -->
      ${
        data.notes
          ? `<div style="margin-top:20px;padding:14px;background:#f9fafb;border-radius:8px;border-left:3px solid #1d4ed8;">
        <p style="margin:0;font-size:13px;color:#374151;"><strong>Catatan:</strong> ${data.notes}</p>
      </div>`
          : ''
      }
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:13px;color:#6b7280;">Terima kasih telah berbelanja di <strong style="color:#374151;">${data.storeName}</strong>!</p>
      ${
        data.storeWhatsapp
          ? `<p style="margin:6px 0 0;font-size:13px;color:#6b7280;">Hubungi kami via WhatsApp: <a href="https://wa.me/${data.storeWhatsapp.replace(/\D/g, '')}" style="color:#1d4ed8;text-decoration:none;">${data.storeWhatsapp}</a></p>`
          : ''
      }
      ${
        data.storeEmail
          ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Email: <a href="mailto:${data.storeEmail}" style="color:#1d4ed8;text-decoration:none;">${data.storeEmail}</a></p>`
          : ''
      }
    </div>
  </div>
</body>
</html>`

  const transporter = getTransporter()
  await transporter.sendMail({
    from: `"${data.storeName}" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
    to: data.customerEmail,
    subject: `Invoice ${data.invoiceNumber} - ${data.storeName}`,
    html,
  })
}
