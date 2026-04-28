'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BarChart3, Users, Wallet, Receipt, Clock, CreditCard,
  Download, Printer, ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { MONTHS as BILLING_MONTHS, monthName } from '@/lib/billing-months'
const MONTHS = ['', ...BILLING_MONTHS.map(m => m.local)]
const fmt = (n: number) => Number(n).toLocaleString('en')

type ReportData = {
  financial: {
    monthly_revenue: { month: number; year: number; total: number }[]
    cash_this_month: number
    online_this_month: number
    total_debt: number
    collection_rate: number
  }
  subscribers: {
    total: number; gold_count: number; normal_count: number
    gold_amperage: number; normal_amperage: number
    unpaid_count: number; unpaid_total: number
    top_debtors: { name: string; debt: number }[]
  }
  collectors: {
    id: string; name: string; collected: number; delivered: number
    balance: number; payment_count: number; late_days: number
  }[]
  expenses: { total: number; by_category: Record<string, number> }
  attendance: {
    id: string; name: string; role: string
    present: number; absent: number; avg_late: number; total_late_min: number
  }[]
  online_payments: {
    list: { id: string; date: string; subscriber_name: string; amount: number; status: string; tran_ref: string }[]
    total_success: number; success_rate: number
    by_gateway?: Record<string, { count: number; total: number }>
  }
}

const GATEWAY_LABEL: Record<string, string> = {
  zaincash: 'ZainCash',
  qi: 'Qi',
  asiapay: 'AsiaPay',
}

type Section = 'financial' | 'subscribers' | 'collectors' | 'expenses' | 'attendance' | 'online'

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [openSections, setOpenSections] = useState<Set<Section>>(new Set(['financial']))
  const [refreshing, setRefreshing] = useState(false)

  function refresh() {
    setRefreshing(true)
    fetch('/api/reports')
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); setRefreshing(false) })
      .catch(() => { setLoading(false); setRefreshing(false) })
  }

  useEffect(() => { refresh() }, [])

  function toggle(s: Section) {
    setOpenSections(prev => {
      const n = new Set(prev)
      n.has(s) ? n.delete(s) : n.add(s)
      return n
    })
  }

  function exportCSV() {
    if (!data) return
    const rows: string[] = ['القسم,البند,القيمة']
    rows.push(`مالي,إيرادات نقدية,${data.financial.cash_this_month}`)
    rows.push(`مالي,إيرادات إلكترونية,${data.financial.online_this_month}`)
    rows.push(`مالي,إجمالي الإيرادات,${data.financial.cash_this_month + data.financial.online_this_month}`)
    rows.push(`مالي,الديون,${data.financial.total_debt}`)
    rows.push(`مالي,نسبة التحصيل,${data.financial.collection_rate}%`)
    rows.push(`مشتركون,إجمالي,${data.subscribers.total}`)
    rows.push(`مشتركون,ذهبي,${data.subscribers.gold_count}`)
    rows.push(`مشتركون,عادي,${data.subscribers.normal_count}`)
    rows.push(`مشتركون,غير مدفوعين,${data.subscribers.unpaid_count}`)
    for (const c of data.collectors) {
      rows.push(`جباة,${c.name},محصّل: ${c.collected} / مسلّم: ${c.delivered} / محفظة: ${c.balance} / دفعات: ${c.payment_count}`)
    }
    for (const [cat, val] of Object.entries(data.expenses.by_category)) {
      rows.push(`مصروفات,${cat},${val}`)
    }
    for (const a of data.attendance) {
      rows.push(`حضور,${a.name},حضور: ${a.present} / غياب: ${a.absent} / تأخير: ${a.total_late_min} دقيقة`)
    }
    for (const p of data.online_payments.list) {
      rows.push(`دفع إلكتروني,${p.subscriber_name},${p.amount} - ${p.status} - ${p.tran_ref}`)
    }

    const bom = '\uFEFF'
    const blob = new Blob([bom + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `amper-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('تم تحميل التقرير')
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-40" />
        {[1, 2, 3].map(i => <div key={i} className="skeleton h-32 rounded-2xl" />)}
      </div>
    )
  }

  if (!data) {
    return <p className="text-center text-text-muted py-8">فشل تحميل التقارير</p>
  }

  const totalRevenue = data.financial.cash_this_month + data.financial.online_this_month
  const maxBar = Math.max(...data.financial.monthly_revenue.map(r => r.total), 1)
  const categoryLabels: Record<string, string> = { fuel: 'وقود', oil: 'زيت', maintenance: 'صيانة', salaries: 'رواتب', rent: 'إيجار', other: 'أخرى' }

  return (
    <div className="space-y-3 print:space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={20} className="text-blue-primary" />
          <h1 className="text-lg font-bold">التقارير</h1>
        </div>
        <button onClick={refresh} disabled={refreshing} className="w-8 h-8 rounded-lg flex items-center justify-center bg-bg-muted">
          <RefreshCw size={14} className={`text-blue-primary ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Export buttons */}
      <div className="flex gap-2 print:hidden">
        <button onClick={exportCSV} className="flex-1 h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-bg-surface border border-border">
          <Download size={14} /> 📊 تصدير Excel
        </button>
        <button onClick={() => window.print()} className="flex-1 h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-bg-surface border border-border">
          <Printer size={14} /> 🖨️ طباعة التقرير
        </button>
      </div>

      {/* ── A) FINANCIAL ── */}
      <SectionHeader icon={BarChart3} title="التقرير المالي" open={openSections.has('financial')} onToggle={() => toggle('financial')} />
      {openSections.has('financial') && (
        <div className="space-y-3">
          {/* Revenue bar chart */}
          <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
            <p className="text-xs font-bold text-text-secondary mb-3">الإيرادات — آخر 6 أشهر</p>
            <div className="flex items-end gap-1.5 h-32">
              {data.financial.monthly_revenue.map((r, i) => {
                const h = maxBar > 0 ? (r.total / maxBar) * 100 : 0
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="font-num text-[9px] text-text-muted">{r.total > 0 ? `${Math.round(r.total / 1000)}k` : '0'}</span>
                    <div className="w-full rounded-t-lg transition-all" style={{ height: `${Math.max(h, 4)}%`, background: 'linear-gradient(to top, #1B4FD8, #7C3AED)' }} />
                    <span className="text-[9px] text-text-muted">{MONTHS[r.month]?.slice(0, 3)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* This month breakdown */}
          <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
            <p className="text-xs font-bold text-text-secondary mb-3">هذا الشهر</p>
            <div className="space-y-2">
              <StatRow label="إيرادات نقدية" value={`${fmt(data.financial.cash_this_month)} د.ع`} color="var(--blue-primary)" />
              <StatRow label="إيرادات إلكترونية" value={`${fmt(data.financial.online_this_month)} د.ع`} color="#7C3AED" />
              <div className="border-t border-border pt-2">
                <StatRow label="إجمالي الإيرادات" value={`${fmt(totalRevenue)} د.ع`} color="#059669" bold />
              </div>
              <StatRow label="الديون المتراكمة" value={`${fmt(data.financial.total_debt)} د.ع`} color="#EF4444" />
              <StatRow label="نسبة التحصيل" value={`${data.financial.collection_rate}%`} color={data.financial.collection_rate >= 80 ? '#059669' : '#D97706'} />
            </div>
          </div>
        </div>
      )}

      {/* ── B) SUBSCRIBERS ── */}
      <SectionHeader icon={Users} title="تقرير المشتركين" open={openSections.has('subscribers')} onToggle={() => toggle('subscribers')} />
      {openSections.has('subscribers') && (
        <div className="bg-bg-surface rounded-2xl p-4 space-y-3" style={{ boxShadow: 'var(--shadow-md)' }}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat label="إجمالي" value={data.subscribers.total} color="var(--blue-primary)" />
            <MiniStat label="ذهبي" value={data.subscribers.gold_count} sub={`${data.subscribers.gold_amperage}A`} color="#D97706" />
            <MiniStat label="عادي" value={data.subscribers.normal_count} sub={`${data.subscribers.normal_amperage}A`} color="var(--blue-primary)" />
          </div>
          <div className="rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.05)' }}>
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">غير المدفوعين</span>
              <span className="font-bold" style={{ color: '#EF4444' }}>{data.subscribers.unpaid_count} — {fmt(data.subscribers.unpaid_total)} د.ع</span>
            </div>
          </div>
          {data.subscribers.top_debtors.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-text-muted mb-1.5">أعلى 5 مدينين</p>
              {data.subscribers.top_debtors.map((d, i) => (
                <div key={i} className="flex justify-between py-1 text-xs border-b border-border last:border-0">
                  <span>{d.name}</span>
                  <span className="font-num font-bold" style={{ color: '#EF4444' }}>{fmt(d.debt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── C) COLLECTORS ── */}
      <SectionHeader icon={Wallet} title="تقرير الجباة" open={openSections.has('collectors')} onToggle={() => toggle('collectors')} />
      {openSections.has('collectors') && (
        <div className="space-y-2">
          {data.collectors.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">لا يوجد جباة</p>
          ) : data.collectors.map(c => (
            <div key={c.id} className="bg-bg-surface rounded-2xl p-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <p className="text-sm font-bold mb-2">{c.name}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                <span className="text-text-muted">المحصّل هذا الشهر</span><span className="font-num font-bold text-left">{fmt(c.collected)}</span>
                <span className="text-text-muted">المسلّم</span><span className="font-num font-bold text-left">{fmt(c.delivered)}</span>
                <span className="text-text-muted">المحفظة</span><span className={`font-num font-bold text-left ${c.balance > 0 ? 'text-danger' : 'text-success'}`}>{fmt(c.balance)}</span>
                <span className="text-text-muted">عدد الدفعات</span><span className="font-num font-bold text-left">{c.payment_count}</span>
                <span className="text-text-muted">التأخيرات</span><span className={`font-num font-bold text-left ${c.late_days > 0 ? 'text-gold' : ''}`}>{c.late_days} يوم</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── D) EXPENSES ── */}
      <SectionHeader icon={Receipt} title="تقرير المصروفات" open={openSections.has('expenses')} onToggle={() => toggle('expenses')} />
      {openSections.has('expenses') && (
        <div className="bg-bg-surface rounded-2xl p-4 space-y-3" style={{ boxShadow: 'var(--shadow-md)' }}>
          <div className="text-center">
            <p className="text-[10px] text-text-muted mb-0.5">إجمالي هذا الشهر</p>
            <p className="font-num text-xl font-bold" style={{ color: '#EF4444' }}>{fmt(data.expenses.total)} <span className="text-xs text-text-muted">د.ع</span></p>
          </div>
          {Object.keys(data.expenses.by_category).length > 0 ? (
            <div className="space-y-1.5">
              {Object.entries(data.expenses.by_category).map(([cat, val]) => {
                const pct = data.expenses.total > 0 ? (val / data.expenses.total) * 100 : 0
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span>{categoryLabels[cat] || cat}</span>
                      <span className="font-num font-bold">{fmt(val)}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#D97706' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-text-muted text-center">لا توجد مصروفات هذا الشهر</p>
          )}
        </div>
      )}

      {/* ── E) ATTENDANCE ── */}
      <SectionHeader icon={Clock} title="تقرير الحضور" open={openSections.has('attendance')} onToggle={() => toggle('attendance')} />
      {openSections.has('attendance') && (
        <div className="space-y-2">
          {data.attendance.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">لا يوجد موظفون</p>
          ) : data.attendance.map(a => (
            <div key={a.id} className="bg-bg-surface rounded-2xl p-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold">{a.name}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{
                  background: a.role === 'collector' ? 'var(--blue-soft)' : 'rgba(217,119,6,0.1)',
                  color: a.role === 'collector' ? 'var(--blue-primary)' : '#D97706',
                }}>{a.role === 'collector' ? 'جابي' : 'مشغل'}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="font-num text-sm font-bold" style={{ color: '#059669' }}>{a.present}</p>
                  <p className="text-[9px] text-text-muted">حضور</p>
                </div>
                <div>
                  <p className="font-num text-sm font-bold" style={{ color: '#EF4444' }}>{a.absent}</p>
                  <p className="text-[9px] text-text-muted">غياب</p>
                </div>
                <div>
                  <p className="font-num text-sm font-bold" style={{ color: '#D97706' }}>{a.avg_late}</p>
                  <p className="text-[9px] text-text-muted">متوسط تأخير (د)</p>
                </div>
                <div>
                  <p className="font-num text-sm font-bold">{a.total_late_min}</p>
                  <p className="text-[9px] text-text-muted">إجمالي (د)</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── F) ONLINE PAYMENTS ── */}
      <SectionHeader icon={CreditCard} title="الدفع الإلكتروني" open={openSections.has('online')} onToggle={() => toggle('online')} />
      {openSections.has('online') && (
        <div className="space-y-3">
          <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
            <div className="grid grid-cols-2 gap-3 text-center mb-3">
              <div>
                <p className="font-num text-lg font-bold" style={{ color: '#7C3AED' }}>{fmt(data.online_payments.total_success)}</p>
                <p className="text-[10px] text-text-muted">إجمالي الناجح (د.ع)</p>
              </div>
              <div>
                <p className="font-num text-lg font-bold" style={{ color: data.online_payments.success_rate >= 80 ? '#059669' : '#D97706' }}>{data.online_payments.success_rate}%</p>
                <p className="text-[10px] text-text-muted">نسبة النجاح</p>
              </div>
            </div>
            {data.online_payments.by_gateway && Object.keys(data.online_payments.by_gateway).length > 0 && (
              <div className="border-t border-border pt-2.5">
                <p className="text-[10px] text-text-muted mb-1.5">حسب البوابة</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(data.online_payments.by_gateway)
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([gw, agg]) => (
                      <div key={gw} className="rounded-lg px-2 py-1 bg-bg-muted border border-border text-[10px]">
                        <span className="font-medium">{GATEWAY_LABEL[gw] ?? gw}</span>
                        <span className="text-text-muted mx-1">·</span>
                        <span className="font-num text-violet font-bold">{fmt(agg.total)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
          {data.online_payments.list.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">لا توجد عمليات دفع إلكتروني</p>
          ) : (
            <div className="space-y-1.5">
              {data.online_payments.list.slice(0, 20).map(p => (
                <div key={p.id} className="bg-bg-surface rounded-xl p-3 flex items-center justify-between" style={{ boxShadow: 'var(--shadow-sm)' }}>
                  <div>
                    <p className="text-xs font-bold">{p.subscriber_name}</p>
                    <p className="text-[10px] text-text-muted font-num">{new Date(p.date).toLocaleDateString('ar-IQ')}</p>
                  </div>
                  <div className="text-left">
                    <p className="font-num text-xs font-bold">{fmt(p.amount)} <span className="text-[9px] text-text-muted">د.ع</span></p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                      p.status === 'success' ? 'bg-emerald-50 text-success'
                        : p.status === 'pending' ? 'bg-gold-soft text-gold'
                          : 'bg-red-50 text-danger'
                    }`}>
                      {p.status === 'success' ? 'ناجح' : p.status === 'pending' ? 'معلّق' : 'فشل'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link
            href="/staff/online-transactions"
            className="block text-center text-xs font-bold text-blue-primary py-3 mt-2 rounded-xl bg-blue-soft hover:bg-blue-soft/80 transition"
          >
            عرض كل المعاملات + فلاتر متقدّمة ←
          </Link>
        </div>
      )}
    </div>
  )
}

function SectionHeader({ icon: Icon, title, open, onToggle }: {
  icon: React.ElementType; title: string; open: boolean; onToggle: () => void
}) {
  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between bg-bg-surface rounded-2xl p-3.5 print:break-inside-avoid"
      style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-blue-primary" />
        <span className="text-sm font-bold">{title}</span>
      </div>
      {open ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
    </button>
  )
}

function StatRow({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-text-muted">{label}</span>
      <span className={`font-num ${bold ? 'font-bold text-sm' : 'font-bold'}`} style={{ color }}>{value}</span>
    </div>
  )
}

function MiniStat({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div className="rounded-xl p-2" style={{ background: 'var(--bg-muted)' }}>
      <p className="font-num text-lg font-bold" style={{ color }}>{value}</p>
      <p className="text-[10px] text-text-muted">{label}</p>
      {sub && <p className="text-[9px] font-num text-text-muted">{sub}</p>}
    </div>
  )
}
