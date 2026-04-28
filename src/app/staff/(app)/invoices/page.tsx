'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { FileText, RotateCcw, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatBillingMonth } from '@/lib/billing-months'

type Invoice = {
  id: string
  billing_month: number
  billing_year: number
  total_amount_due: number
  amount_paid: number
  is_fully_paid: boolean
  subscriber: { name: string; serial_number: string }
}

export default function InvoicesPage() {
  const { data: session } = useSession()
  const isOwner = (session?.user as any)?.role === 'owner'
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  // Reverse modal
  const [reverseId, setReverseId] = useState<string | null>(null)
  const [reverseReason, setReverseReason] = useState('')
  const [reversing, setReversing] = useState(false)

  function refresh() {
    setLoading(true)
    fetch(`/api/invoices?page=${page}&limit=20`)
      .then(r => r.json())
      .then(d => { setInvoices(d.invoices || []); setTotal(d.total || 0); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [page])

  async function handleReverse() {
    if (!reverseId || !reverseReason.trim()) { toast.error('السبب مطلوب'); return }
    setReversing(true)
    try {
      const res = await fetch(`/api/invoices/${reverseId}/reverse`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reverseReason }),
      })
      if (res.ok) {
        toast.success('تم إلغاء الدفع وتسجيله في السجل')
        setReverseId(null); setReverseReason('')
        refresh()
      } else {
        const err = await res.json()
        toast.error(err.error || 'فشل الإلغاء')
      }
    } catch { toast.error('خطأ في الاتصال') }
    setReversing(false)
  }

  const totalPages = Math.ceil(total / 20)

  if (loading && invoices.length === 0) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-24" />
        {[1,2,3,4].map(i => <div key={i} className="skeleton h-16 rounded-2xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">الفواتير</h1>
        <span className="text-xs text-text-muted font-num">{total} فاتورة</span>
      </div>

      {invoices.length === 0 ? (
        <p className="text-center text-text-muted text-sm py-8">لا توجد فواتير</p>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => (
            <div key={inv.id} className="bg-bg-surface rounded-2xl p-3.5 flex items-center gap-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${inv.is_fully_paid ? 'bg-success/10' : 'bg-danger/10'}`}>
                <FileText size={16} className={inv.is_fully_paid ? 'text-success' : 'text-danger'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{inv.subscriber?.name}</p>
                <p className="text-xs text-text-muted">
                  الشهر المحصّل: <span className="font-num font-bold">{formatBillingMonth(inv.billing_month, inv.billing_year)}</span>
                  {' · #'}{inv.subscriber?.serial_number}
                </p>
              </div>
              <div className="text-left shrink-0 flex items-center gap-2">
                <div>
                  <p className="font-num text-xs font-bold">
                    {Number(inv.amount_paid).toLocaleString()} / {Number(inv.total_amount_due).toLocaleString()}
                  </p>
                  <p className={`text-[10px] text-left ${inv.is_fully_paid ? 'text-success' : 'text-danger'}`}>
                    {inv.is_fully_paid ? 'مدفوعة' : 'غير مدفوعة'}
                  </p>
                </div>
                {isOwner && inv.is_fully_paid && (
                  <button onClick={() => setReverseId(inv.id)} className="w-7 h-7 rounded-lg bg-danger/10 flex items-center justify-center text-danger" title="إلغاء الدفع">
                    <RotateCcw size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="h-8 px-3 rounded-lg bg-bg-surface border border-border text-xs disabled:opacity-40">السابق</button>
          <span className="font-num text-xs text-text-muted">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="h-8 px-3 rounded-lg bg-bg-surface border border-border text-xs disabled:opacity-40">التالي</button>
        </div>
      )}

      {/* Reverse modal */}
      {reverseId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
          <div className="bg-bg-surface w-full max-w-[390px] rounded-t-[20px] p-5 pb-8">
            <h3 className="text-sm font-bold mb-3">إلغاء الدفع</h3>
            <p className="text-xs text-text-muted mb-3">سيتم إرجاع حالة الفاتورة إلى "غير مدفوعة" وتسجيل السبب.</p>
            <input type="text" value={reverseReason} onChange={e => setReverseReason(e.target.value)} placeholder="السبب (مطلوب)"
              className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm mb-3" />
            <div className="flex gap-2">
              <button onClick={() => { setReverseId(null); setReverseReason('') }}
                className="flex-1 h-10 rounded-xl bg-bg-muted text-text-secondary text-xs font-bold">إلغاء</button>
              <button onClick={handleReverse} disabled={reversing || !reverseReason.trim()}
                className="flex-1 h-10 rounded-xl bg-danger text-white text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-60">
                {reversing ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={12} />} تأكيد الإلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
