'use client'

import { useEffect, useState, use } from 'react'
import { Loader2, Printer } from 'lucide-react'
import { formatBillingMonth } from '@/lib/billing-months'

const fmt = (n: number) => Number(n).toLocaleString('en')

type Receipt = {
  id: string
  amount: number
  gateway: string
  gateway_ref: string | null
  created_at: string
  subscriber: { name: string | null; serial_number: string | null; phone: string | null }
  branch: { name: string | null; governorate: string | null }
  tenant: { name: string | null }
  invoice: { billing_month: number; billing_year: number; total_amount_due: number } | null
}

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/portal/receipt/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(setReceipt)
      .catch(() => setError('الإيصال غير متاح'))
  }, [id])

  if (error) {
    return <div className="px-4 py-10 text-center text-sm" style={{ color: '#94A3B8' }}>{error}</div>
  }
  if (!receipt) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" style={{ color: '#1B4FD8' }} /></div>
  }

  const date = new Date(receipt.created_at)
  const dateStr = date.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = date.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="receipt-shell" style={{ background: '#F8FAFC', minHeight: '100dvh' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .receipt-shell { background: #FFFFFF !important; }
          .receipt-card { box-shadow: none !important; border: none !important; }
          @page { size: A6; margin: 8mm; }
        }
      `}</style>

      <div className="no-print px-4 pt-4 pb-2 flex items-center justify-between">
        <button onClick={() => window.history.back()} className="text-xs font-bold" style={{ color: '#475569' }}>← رجوع</button>
        <button onClick={() => window.print()} className="rounded-xl px-4 py-2 text-xs font-bold inline-flex items-center gap-2" style={{ background: '#1B4FD8', color: '#FFFFFF' }}>
          <Printer className="w-4 h-4" /> تحميل / طباعة PDF
        </button>
      </div>

      <div className="receipt-card mx-auto max-w-[360px] mt-3 p-5 space-y-4 rounded-2xl" style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="text-center space-y-1">
          <p className="text-[11px] font-bold tracking-widest" style={{ color: '#1B4FD8' }}>AMPER ⚡</p>
          <h1 className="text-base font-black" style={{ color: '#0F172A' }}>إيصال دفع إلكتروني</h1>
          <p className="text-[10px]" style={{ color: '#94A3B8' }}>{receipt.tenant.name ?? ''}</p>
        </div>

        <div style={{ borderTop: '1px dashed rgba(0,0,0,0.15)' }} />

        <Row label="التاريخ" value={`${dateStr} · ${timeStr}`} />
        <Row label="المشترك" value={receipt.subscriber.name ?? '-'} />
        {receipt.subscriber.serial_number && <Row label="رقم العداد" value={receipt.subscriber.serial_number} />}
        {receipt.branch.name && <Row label="المولدة" value={`${receipt.branch.name}${receipt.branch.governorate ? ' — ' + receipt.branch.governorate : ''}`} />}
        {receipt.invoice && (
          <Row label="الفاتورة" value={formatBillingMonth(receipt.invoice.billing_month, receipt.invoice.billing_year)} />
        )}
        <Row label="البوابة" value={receipt.gateway} />
        {receipt.gateway_ref && <Row label="المعرف" value={receipt.gateway_ref.slice(0, 24)} mono />}

        <div style={{ borderTop: '1px dashed rgba(0,0,0,0.15)' }} />

        <div className="flex items-center justify-between">
          <span className="text-xs font-bold" style={{ color: '#475569' }}>المبلغ المدفوع</span>
          <span className="font-num text-2xl font-black" style={{ color: '#0F172A' }}>{fmt(receipt.amount)} <span className="text-xs font-normal">د.ع</span></span>
        </div>

        <div className="rounded-lg px-3 py-2 text-[10px] text-center" style={{ background: '#ECFDF5', color: '#065F46' }}>
          ✅ تم استلام الدفعة بنجاح
        </div>

        <p className="text-center text-[9px] pt-2" style={{ color: '#94A3B8' }}>
          هذا إيصال إلكتروني — لا يحتاج توقيع.<br/>
          للاستفسار تواصل مع التاجر مباشرة.
        </p>
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span style={{ color: '#94A3B8' }}>{label}</span>
      <span className={mono ? 'font-mono' : ''} style={{ color: '#0F172A' }}>{value}</span>
    </div>
  )
}
