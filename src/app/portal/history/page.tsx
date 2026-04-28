'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle2, Clock, Loader2, CreditCard, Banknote } from 'lucide-react'
import { formatBillingMonth } from '@/lib/billing-months'

const fmt = (n: number) => Number(n).toLocaleString('en')

type PaymentRecord = {
  id: string
  billing_month: number
  billing_year: number
  total_amount_due: number
  amount_paid: number
  is_fully_paid: boolean
  payment_method: string
  created_at: string
  updated_at: string
}

type OnlineRecord = {
  id: string
  amount: number
  gateway: string
  gateway_ref: string | null
  status: string
  created_at: string
}

function methodLabel(method: string): string {
  const map: Record<string, string> = {
    cash: 'نقدي',
    qi_card: 'كي كارد',
    visa: 'فيزا',
    mastercard: 'ماستركارد',
    zaincash: 'زين كاش',
    online: 'إلكتروني',
    pos: 'نقطة بيع',
  }
  return map[method] || method
}

function methodIcon(method: string) {
  if (method === 'cash') return <Banknote className="w-4 h-4" style={{ color: '#2E7D32' }} />
  return <CreditCard className="w-4 h-4" style={{ color: '#0F172A' }} />
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function PaymentHistoryPage() {
  const router = useRouter()
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [onlinePayments, setOnlinePayments] = useState<OnlineRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/subscriber/payment-history')
      .then(r => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then(d => {
        setPayments(d.payments || [])
        setOnlinePayments(d.online_payments || [])
        setLoading(false)
      })
      .catch(() => {
        setError('خطأ في تحميل البيانات')
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh" style={{ background: '#F0F4FF' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#1B4FD8' }} />
      </div>
    )
  }

  return (
    <div className="min-h-dvh pb-8" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="p-4 flex items-center gap-3">
        <button
          onClick={() => router.push('/portal/home')}
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: '#EBF0FF' }}
        >
          <ArrowRight className="w-5 h-5" style={{ color: '#1B4FD8' }} />
        </button>
        <h1 className="text-lg font-bold" style={{ color: '#0F172A' }}>سجل الدفعات</h1>
      </div>

      <div className="px-4 space-y-3">
        {error && (
          <div className="rounded-xl p-4 text-center text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
            {error}
          </div>
        )}

        {payments.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl" style={{ background: '#F1F5F9' }}>
              💳
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>لا توجد دفعات سابقة</p>
          </div>
        )}

        {payments.map((p, i) => (
          <div
            key={p.id}
            className="py-3 animate-fade-in"
            style={{ borderBottom: i < payments.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {methodIcon(p.payment_method)}
                <span className="text-[11px] font-medium" style={{ color: p.payment_method === 'cash' ? '#2E7D32' : '#0F172A' }}>
                  {methodLabel(p.payment_method)}
                </span>
                {p.is_fully_paid ? (
                  <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#16A34A' }} />
                ) : (
                  <Clock className="w-3.5 h-3.5" style={{ color: '#FF9500' }} />
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-right">{formatBillingMonth(p.billing_month, p.billing_year)}</p>
                <p className="text-[10px] mt-0.5 text-right" style={{ color: '#94A3B8' }}>
                  {formatDate(p.updated_at)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between mt-1.5">
              <div>
                {!p.is_fully_paid && (
                  <p className="text-[10px]" style={{ color: '#FF9500' }}>
                    من أصل {fmt(p.total_amount_due)} د.ع
                  </p>
                )}
              </div>
              <p className="font-num text-xl font-black" style={{ color: '#0F172A' }}>
                {fmt(p.amount_paid)} <span className="text-[10px] font-normal" style={{ color: '#94A3B8' }}>د.ع</span>
              </p>
            </div>
          </div>
        ))}

        {/* Online payments section */}
        {onlinePayments.length > 0 && (
          <>
            <div className="pt-3">
              <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>
                الدفعات الإلكترونية
              </p>
            </div>
            {onlinePayments.map((op, i) => (
              <div
                key={op.id}
                className="py-3 animate-fade-in"
                style={{ borderBottom: i < onlinePayments.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" style={{ color: '#0F172A' }} />
                    <span className="text-[11px] font-medium" style={{ color: '#0F172A' }}>
                      {op.gateway}
                    </span>
                    <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#16A34A' }} />
                  </div>
                  <div className="text-right">
                    <p className="text-[10px]" style={{ color: '#94A3B8' }}>{formatDate(op.created_at)}</p>
                    {op.gateway_ref && (
                      <p className="text-[9px] font-mono mt-0.5" style={{ color: '#94A3B8' }}>
                        #{op.gateway_ref.slice(0, 12)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-end mt-1">
                  <p className="font-num text-xl font-black" style={{ color: '#0F172A' }}>
                    {fmt(op.amount)} <span className="text-[10px] font-normal" style={{ color: '#94A3B8' }}>د.ع</span>
                  </p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
