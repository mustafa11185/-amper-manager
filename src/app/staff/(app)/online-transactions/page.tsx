'use client'
export const dynamic = 'force-dynamic'

// Owner page — drill into every online payment for the tenant. Backed by
// /api/payment/online-transactions which already supports filtering by
// period, gateway, and status. The row list is capped at 200 server-side.

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { ChevronLeft, CreditCard, CheckCircle2, XCircle, Clock, Loader2, Download } from 'lucide-react'

type Period = 'today' | 'month' | 'all'
type Status = 'all' | 'success' | 'failed' | 'pending' | 'expired' | 'refunded'

type Tx = {
  id: string
  amount: number
  gateway: string
  gateway_ref: string
  status: string
  commission: number
  subscriber_name: string
  subscriber_code: string
  invoice_id: string | null
  created_at: string
}

type Summary = {
  total: number
  count: number
  by_gateway: Record<string, { count: number; total: number }>
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'اليوم' },
  { key: 'month', label: 'هذا الشهر' },
  { key: 'all', label: 'الكل' },
]
const STATUSES: { key: Status; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'success', label: 'ناجحة' },
  { key: 'failed', label: 'فشلت' },
  { key: 'pending', label: 'قيد الانتظار' },
  { key: 'expired', label: 'منتهية' },
  { key: 'refunded', label: 'مُستردّة' },
]

const GATEWAY_LABELS: Record<string, string> = {
  zaincash: 'ZainCash',
  qi: 'Qi',
  asiapay: 'AsiaPay',
}

const fmt = (n: number) => Number(n).toLocaleString('en')

export default function OnlineTransactionsPage() {
  const [period, setPeriod] = useState<Period>('month')
  const [gateway, setGateway] = useState<string>('all')
  const [status, setStatus] = useState<Status>('all')
  const [transactions, setTransactions] = useState<Tx[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams({ period, gateway, status })
    fetch(`/api/payment/online-transactions?${qs.toString()}`)
      .then(r => r.json())
      .then(d => {
        setTransactions(d.transactions ?? [])
        setSummary(d.summary ?? null)
      })
      .catch(() => { setTransactions([]); setSummary(null) })
      .finally(() => setLoading(false))
  }, [period, gateway, status])

  // Distinct gateway names that appeared in the current dataset — drives
  // both the filter dropdown and the per-gateway chip row.
  const distinctGateways = useMemo(() => {
    if (!summary) return []
    return Object.keys(summary.by_gateway).sort()
  }, [summary])

  function exportCsv() {
    const header = ['التاريخ', 'المشترك', 'الكود', 'البوابة', 'المبلغ', 'العمولة', 'الحالة', 'المعرّف']
    const rows = transactions.map(t => [
      new Date(t.created_at).toLocaleString('ar-IQ'),
      t.subscriber_name,
      t.subscriber_code,
      GATEWAY_LABELS[t.gateway] ?? t.gateway,
      String(t.amount),
      String(Math.round(t.commission)),
      t.status,
      t.gateway_ref,
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `online-transactions-${period}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-5xl mx-auto px-4">
        <Link href="/staff/dashboard" className="inline-flex items-center gap-1 text-blue-600 mb-4 hover:underline text-sm">
          <ChevronLeft className="w-4 h-4" /> الرئيسية
        </Link>

        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm p-5 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">سجل الدفعات الإلكترونية</h1>
                <p className="text-sm text-gray-600 mt-0.5">عرض كل المعاملات عبر بوابات الدفع</p>
              </div>
            </div>
            <button
              onClick={exportCsv}
              disabled={transactions.length === 0}
              className="h-9 px-3 rounded-lg bg-bg-muted text-blue-600 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 space-y-3">
          <div>
            <p className="text-[10px] text-gray-500 mb-1.5">الفترة</p>
            <div className="flex gap-2">
              {PERIODS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`flex-1 h-9 rounded-lg text-xs font-medium transition ${
                    period === p.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-gray-500 mb-1.5">البوابة</p>
              <select
                value={gateway}
                onChange={e => setGateway(e.target.value)}
                className="w-full h-9 px-2 rounded-lg border border-gray-200 text-xs bg-white"
              >
                <option value="all">كل البوابات</option>
                {Object.entries(GATEWAY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 mb-1.5">الحالة</p>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as Status)}
                className="w-full h-9 px-2 rounded-lg border border-gray-200 text-xs bg-white"
              >
                {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Summary */}
        {summary && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-lg p-3 bg-blue-50">
                <p className="text-[10px] text-blue-700 mb-1">إجمالي المعاملات الناجحة</p>
                <p className="text-xl font-bold font-num text-blue-900">{fmt(summary.count)}</p>
              </div>
              <div className="rounded-lg p-3 bg-green-50">
                <p className="text-[10px] text-green-700 mb-1">إجمالي الإيرادات</p>
                <p className="text-xl font-bold font-num text-green-900">{fmt(summary.total)} <span className="text-xs">د.ع</span></p>
              </div>
            </div>
            {distinctGateways.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-500 mb-1.5">حسب البوابة</p>
                <div className="flex flex-wrap gap-2">
                  {distinctGateways.map(g => (
                    <div key={g} className="rounded-lg px-2.5 py-1.5 bg-gray-50 border border-gray-200 text-xs">
                      <span className="font-medium text-gray-700">{GATEWAY_LABELS[g] ?? g}</span>
                      <span className="text-gray-400 mx-1">·</span>
                      <span className="font-num text-gray-900">{fmt(summary.by_gateway[g].count)}</span>
                      <span className="text-gray-400 mx-1">·</span>
                      <span className="font-num font-bold text-green-700">{fmt(summary.by_gateway[g].total)} د.ع</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Transaction list */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-gray-400">
              <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
              <p className="text-sm">جارٍ التحميل...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <p className="text-sm">لا توجد معاملات في هذه الفترة</p>
            </div>
          ) : (
            <ul>
              {transactions.map(t => (
                <li key={t.id} className="flex items-center gap-3 p-4 border-b border-gray-100 last:border-b-0">
                  <StatusIcon status={t.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="text-sm font-bold text-gray-900 truncate">{t.subscriber_name || '—'}</p>
                      <p className="text-sm font-bold font-num text-gray-900 flex-shrink-0">{fmt(t.amount)} <span className="text-[10px] font-normal text-gray-500">د.ع</span></p>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                      <span className="truncate">
                        {t.subscriber_code ? `#${t.subscriber_code}` : ''}
                        {t.subscriber_code && ' · '}
                        <span className="font-medium" style={{ color: '#1B4FD8' }}>{GATEWAY_LABELS[t.gateway] ?? t.gateway}</span>
                      </span>
                      <span className="flex-shrink-0 font-num">{new Date(t.created_at).toLocaleString('ar-IQ', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {transactions.length === 200 && (
          <p className="text-center text-[10px] text-gray-400 mt-3">يُعرض أحدث 200 معاملة فقط — استخدم الفلاتر لتقليل الفترة</p>
        )}
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  const map: Record<string, { Icon: any; color: string; bg: string }> = {
    success: { Icon: CheckCircle2, color: '#15803D', bg: '#DCFCE7' },
    failed: { Icon: XCircle, color: '#B91C1C', bg: '#FEE2E2' },
    expired: { Icon: XCircle, color: '#B91C1C', bg: '#FEE2E2' },
    pending: { Icon: Clock, color: '#A16207', bg: '#FEF3C7' },
    refunded: { Icon: XCircle, color: '#7C3AED', bg: '#EDE9FE' },
  }
  const cfg = map[status] ?? { Icon: Clock, color: '#64748B', bg: '#F1F5F9' }
  const { Icon } = cfg
  return (
    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg, color: cfg.color }}>
      <Icon className="w-4 h-4" />
    </div>
  )
}
