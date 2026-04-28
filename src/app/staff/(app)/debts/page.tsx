'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CreditCard } from 'lucide-react'

type Debtor = { id: string; name: string; alley: string | null; amperage: number; total_debt: number }

export default function DebtsPage() {
  const router = useRouter()
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/subscribers?status=debt&limit=200&sort=debt_desc')
      .then(r => r.json())
      .then(d => { setDebtors((d.subscribers || []).map((s: any) => ({ ...s, amperage: Number(s.amperage), total_debt: Number(s.total_debt) }))); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const totalDebt = debtors.reduce((a, d) => a + d.total_debt, 0)
  const fmt = (n: number) => Number(n).toLocaleString('en')

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold flex items-center gap-2">
        <AlertTriangle size={18} className="text-danger" /> الديون
      </h1>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
          <p className="text-[10px] text-text-muted mb-1">إجمالي الديون</p>
          <p className="font-num text-xl font-bold text-danger">{fmt(totalDebt)} <span className="text-xs text-text-muted">د.ع</span></p>
        </div>
        <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
          <p className="text-[10px] text-text-muted mb-1">عدد المدينين</p>
          <p className="font-num text-xl font-bold">{debtors.length}</p>
        </div>
      </div>

      <div className="bg-bg-surface rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-md)' }}>
        {loading ? (
          <div className="p-8 text-center text-text-muted text-sm">جاري التحميل...</div>
        ) : debtors.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm">لا يوجد مدينون</div>
        ) : debtors.map((d, i) => (
          <div key={d.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: i < debtors.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{d.name}</p>
              <p className="text-xs text-text-muted">{d.alley || '—'} · {d.amperage}A</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-num text-sm font-bold text-danger">{fmt(d.total_debt)}</span>
              <button onClick={() => router.push(`/staff/pos?subscriber=${d.id}&type=debt`)}
                className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--blue-soft)' }}>
                <CreditCard size={14} className="text-blue-primary" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
