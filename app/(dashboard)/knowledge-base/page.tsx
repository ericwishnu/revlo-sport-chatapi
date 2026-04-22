import Link from 'next/link'
import { db } from '@/lib/db'
import { Bot, Copy, ExternalLink, Package, HelpCircle, Truck } from 'lucide-react'

export default async function KnowledgeBasePage() {
  const [productCount, faqCount, shippingCount, settings] = await Promise.all([
    db.product.count({ where: { isActive: true } }),
    db.faq.count({ where: { isActive: true } }),
    db.shippingMethod.count({ where: { isActive: true } }),
    db.siteSettings.findFirst(),
  ])

  const apiPath = '/api/knowledge-base?key=YOUR_KB_API_KEY'
  const preview = {
    language_default: settings?.languageDefault ?? 'id',
    store_name: settings?.storeName ?? 'Revlo Sport',
    communication_style: settings?.communicationStyle ?? 'ramah, singkat, persuasif, sopan',
    products: `${productCount} data aktif`,
    faq: `${faqCount} data aktif`,
    policies: `${shippingCount} data aktif`,
    last_updated: settings?.updatedAt?.toISOString() ?? new Date().toISOString(),
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
        <p className="text-sm text-gray-500 mt-1">
          Endpoint ini dipakai agent atau chatbot untuk mengambil seluruh data toko dalam satu request.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border rounded-xl p-5 flex items-center gap-4">
          <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{productCount}</p>
            <p className="text-sm text-gray-500">Produk aktif</p>
          </div>
        </div>
        <div className="bg-white border rounded-xl p-5 flex items-center gap-4">
          <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{faqCount}</p>
            <p className="text-sm text-gray-500">FAQ aktif</p>
          </div>
        </div>
        <div className="bg-white border rounded-xl p-5 flex items-center gap-4">
          <div className="p-2.5 rounded-lg bg-green-50 text-green-600">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{shippingCount}</p>
            <p className="text-sm text-gray-500">Kebijakan / pengiriman</p>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Bot className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900">Endpoint API</h2>
            <p className="text-sm text-gray-500 mt-1">
              Gunakan endpoint berikut pada agent. Ganti placeholder key dengan nilai dari environment variable <span className="font-mono text-gray-700">KB_API_KEY</span>.
            </p>
          </div>
        </div>

        <div className="bg-gray-50 border rounded-lg px-4 py-3 flex items-center gap-3 overflow-x-auto">
          <code className="text-sm text-blue-700 whitespace-nowrap flex-1">GET {apiPath}</code>
          <Copy className="w-4 h-4 text-gray-400" />
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            Atur Store Info
          </Link>
          <a
            href={apiPath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Buka Endpoint
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-3">Preview Struktur Response</h2>
        <pre className="text-sm bg-gray-50 border rounded-lg p-4 overflow-x-auto text-gray-800">{JSON.stringify(preview, null, 2)}</pre>
      </div>
    </div>
  )
}