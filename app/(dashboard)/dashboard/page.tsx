import { db } from '@/lib/db'
import { Package, Truck, HelpCircle, Bot } from 'lucide-react'

export default async function DashboardPage() {
  const [productCount, shippingCount, faqCount] = await Promise.all([
    db.product.count({ where: { isActive: true } }),
    db.shippingMethod.count({ where: { isActive: true } }),
    db.faq.count({ where: { isActive: true } }),
  ])

  const stats = [
    { label: 'Produk Aktif', value: productCount, icon: Package, color: 'text-blue-600 bg-blue-50' },
    { label: 'Metode Pengiriman', value: shippingCount, icon: Truck, color: 'text-green-600 bg-green-50' },
    { label: 'FAQ', value: faqCount, icon: HelpCircle, color: 'text-purple-600 bg-purple-50' },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Ringkasan konten knowledge base chatbot Anda</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border p-5">
            <div className="flex items-center gap-4">
              <div className={`p-2.5 rounded-lg ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-sm text-gray-500">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-start gap-3">
          <Bot className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h2 className="font-semibold text-gray-900 mb-1">Endpoint Chatbot</h2>
            <p className="text-sm text-gray-500 mb-3">
              Gunakan URL berikut pada chatbot Anda untuk mendapatkan data terbaru.
            </p>
            <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-3">
              <code className="text-sm text-blue-600 flex-1">GET /api/knowledge-base?key=YOUR_API_KEY</code>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              API Key dikonfigurasi melalui environment variable <code className="bg-gray-100 px-1 rounded">KB_API_KEY</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
