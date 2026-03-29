'use client'
export const dynamic = 'force-dynamic'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import {
  Users, Banknote, HandCoins, AlertTriangle, UserX,
  Zap, Fuel, Sun, Moon, UserCheck, Gift, ArrowUpCircle, Bell,
  CreditCard, BarChart3, Wallet, Clock, Thermometer, Receipt, MapPin,
} from 'lucide-react'
import Link from 'next/link'
import CollectorBanner from '@/components/CollectorBanner'
import GaugeCard, { ManualReadingModal } from '@/components/GaugeCard'

type DashboardStats = {
  total_subscribers: number
  monthly_revenue: number
  monthly_total_due: number
  monthly_collected: number
  monthly_deliveries: number
  collection_rate: number
  total_debt: number
  unpaid_count: number
  generator: {
    name: string
    run_status: boolean
    fuel_level_pct: number | null
    last_fuel_update: string | null
    current_temp: number | null
  } | null
  gold_hours_today: number
  normal_hours_today: number
  operators_present: number
  operators_total: number
  total_amperage: number
  gold_amperage: number
  normal_amperage: number
  is_owner_collector: boolean
  pending_discount_requests: {
    id: string
    amount: number
    reason: string | null
    subscriber: { name: string }
    staff: { name: string }
  }[]
  pending_upgrade_requests: number
  alerts: {
    id: string
    title: string | null
    body: string
    created_at: string
  }[]
  collector_wallets: {
    id: string
    staff_id: string
    staff_name: string | null
    staff_photo: string | null
    is_owner: boolean
    balance: number
    total_delivered: number
  }[]
  total_wallet_balance: number
  top_debtors: { id: string; name: string; debt: number }[]
  gauges: {
    engine_id: string | null
    branch_id: string | null
    temperature: { value: number; logged_at: string } | null
    fuel: { value: number; logged_at: string | null } | null
    oil_pressure: { value: number; logged_at: string } | null
    load: { value: number; logged_at: string } | null
    runtime_hours: { current: number; max: number } | null
  }
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  suffix,
  badge,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  color: string
  suffix?: string
  badge?: string
}) {
  const colorMap: Record<string, { bg: string; text: string; iconBg: string }> = {
    blue: { bg: 'bg-blue-soft', text: 'text-blue-primary', iconBg: 'bg-blue-primary/10' },
    green: { bg: 'bg-emerald-50', text: 'text-success', iconBg: 'bg-success/10' },
    gold: { bg: 'bg-gold-soft', text: 'text-gold', iconBg: 'bg-gold/10' },
    red: { bg: 'bg-red-50', text: 'text-danger', iconBg: 'bg-danger/10' },
    violet: { bg: 'bg-violet-soft', text: 'text-violet', iconBg: 'bg-violet/10' },
    gray: { bg: 'bg-bg-muted', text: 'text-text-secondary', iconBg: 'bg-text-muted/10' },
  }
  const c = colorMap[color] || colorMap.blue

  return (
    <div className="bg-bg-surface rounded-2xl p-3.5" style={{ boxShadow: 'var(--shadow-md)' }}>
      <div className="flex items-start justify-between mb-2">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${c.iconBg}`}>
          <Icon size={16} className={c.text} />
        </div>
        {badge && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${c.bg} ${c.text}`}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-text-muted text-[11px] mb-0.5">{label}</p>
      <p className={`font-num text-lg ${c.text}`}>
        {value}
        {suffix && <span className="text-xs mr-1">{suffix}</span>}
      </p>
    </div>
  )
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

function formatMoney(n: any): string {
  try {
    const num = Number(n)
    if (!n && n !== 0) return '0'
    if (isNaN(num)) return '0'
    return num.toLocaleString('en-US')
  } catch { return '0' }
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [myWallet, setMyWallet] = useState<{ total_collected: number; total_delivered: number; balance: number } | null>(null)
  const [engineData, setEngineData] = useState<any>(null)
  const [gaugeModal, setGaugeModal] = useState<{ type: string; unit: string; label: string } | null>(null)

  function refresh() {
    setError(null)
    fetch('/api/dashboard/stats')
      .then(r => {
        if (!r.ok) throw new Error(`API ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (data.error) throw new Error(data.error)
        setStats(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Dashboard fetch error:', err)
        setError('فشل تحميل البيانات')
        setLoading(false)
      })
  }

  useEffect(() => { refresh() }, [])

  // Auto-refetch on window focus
  useEffect(() => {
    const handleFocus = () => refresh()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // Fetch wallet for collector/cashier
  useEffect(() => {
    const r = (session?.user as any)?.role
    if (r === 'collector' || r === 'cashier' || r === 'accountant') {
      fetch('/api/wallets').then(r => r.json()).then(d => {
        const staffId = (session?.user as any)?.id
        const w = (d.wallets || []).find((w: any) => w.staff_id === staffId)
        if (w) setMyWallet({ total_collected: Number(w.total_collected), total_delivered: Number(w.total_delivered), balance: Number(w.balance) })
      }).catch(() => {})
    }
    if (r === 'operator') {
      fetch('/api/engines').then(r => r.json()).then(d => {
        setEngineData(d.generators?.[0] || null)
      }).catch(() => {})
    }
  }, [session])

  const role = (session?.user as any)?.role as string
  const isOwner = role === 'owner'
  const isAccountant = role === 'accountant'
  const isCollector = role === 'collector'
  const isCashier = role === 'cashier'
  const isOperator = role === 'operator'
  const canSeeFinance = isOwner || isAccountant
  const canSeeEngine = isOwner || isOperator

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'right' }}>
        <p className="text-danger font-bold mb-2">حدث خطأ</p>
        <p className="text-text-muted text-sm mb-4">{error}</p>
        <button onClick={refresh} className="px-4 py-2 rounded-xl bg-blue-primary text-white text-sm font-bold">إعادة المحاولة</button>
      </div>
    )
  }

  if (!stats) {
    return <p className="text-center text-text-muted py-8">لا توجد بيانات</p>
  }

  const fmt = (n: any) => formatMoney(n)
  const wallets = stats?.collector_wallets ?? []
  const debtors = stats?.top_debtors ?? []

  return (
    <div className="space-y-4">
      {/* Grace period banner */}
      <GracePeriodBanner />

      {/* A) HERO CARD */}
      {canSeeFinance && (
        <Link href="/subscribers" className="block rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #1B4FD8 0%, #7C3AED 100%)', boxShadow: '0 8px 32px rgba(27,79,216,0.3)' }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: stats?.generator?.run_status ? '#22C55E' : '#EF4444', boxShadow: stats?.generator?.run_status ? '0 0 8px #22C55E' : 'none' }} />
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px', fontWeight: 500 }}>{stats?.generator?.name ?? 'المولدة'}</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginBottom: '2px' }}>إيرادات الشهر</p>
          <p className="font-num" style={{ color: '#FFFFFF', fontSize: '28px', fontWeight: 700, marginBottom: '16px' }}>{fmt(stats?.monthly_revenue)} <span style={{ fontSize: '14px', fontWeight: 400, color: 'rgba(255,255,255,0.5)' }}>د.ع</span></p>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-2 text-center" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <p className="font-num" style={{ color: '#FFFFFF', fontSize: '18px', fontWeight: 600 }}>{stats?.collection_rate ?? 0}%</p>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>المحصّل</p>
            </div>
            <div className="rounded-xl p-2 text-center" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <p className="font-num" style={{ color: '#FFFFFF', fontSize: '18px', fontWeight: 600 }}>{stats?.unpaid_count ?? 0}</p>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>غير المدفوعين</p>
            </div>
            <div className="rounded-xl p-2 text-center" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <p className="font-num" style={{ color: '#FFFFFF', fontSize: '18px', fontWeight: 600 }}>{stats?.total_subscribers ?? 0}</p>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>المشتركون</p>
            </div>
          </div>
        </Link>
      )}

      {/* Collector banner */}
      {(isCollector || isCashier) && <CollectorBanner />}

      {/* B) COLLECTORS WALLETS */}
      {canSeeFinance && wallets.length > 0 && (
        <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold">محافظ الجباة</span>
            <span className="font-num text-sm font-bold text-danger">{fmt(stats?.total_wallet_balance)} د.ع</span>
          </div>
          <div className="space-y-2">
            {wallets.map((w: any) => (
              <Link key={w.id} href="/wallets" className="flex items-center gap-3 p-2 rounded-xl" style={{ background: 'var(--bg-muted)' }}>
                <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center shrink-0" style={{ background: 'var(--bg-base)' }}>
                  {w.staff_photo ? <img src={w.staff_photo} alt="" className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-text-muted">{w.staff_name?.charAt(0)}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{w.staff_name}</p>
                  <p className="text-[10px] text-text-muted">المحفظة</p>
                </div>
                <span className={`font-num text-base font-bold ${w.balance > 0 ? 'text-danger' : 'text-success'}`}>{fmt(w.balance)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* C) ENGINE GAUGES */}
      {canSeeEngine && stats?.gauges && (
        <Link href="/engines" className="block bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-2.5 h-2.5 rounded-full ${stats?.generator?.run_status ? 'bg-success' : 'bg-danger'}`} />
            <span className="text-sm font-bold">حالة المحرك</span>
            <span className="text-[10px] text-text-muted">{stats?.generator?.run_status ? 'يعمل' : 'متوقف'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <GaugeCard value={stats.gauges.temperature?.value ?? null} max={120} unit="°C" label="الحرارة" icon="🌡️" colorScheme="temperature" lastUpdated={stats.gauges.temperature?.logged_at} onManualEntry={() => setGaugeModal({ type: 'temperature', unit: '°C', label: 'الحرارة' })} />
            <GaugeCard value={stats.gauges.fuel?.value ?? null} max={100} unit="%" label="الوقود" icon="⛽" colorScheme="fuel" lastUpdated={stats.gauges.fuel?.logged_at} onManualEntry={() => setGaugeModal({ type: 'fuel', unit: '%', label: 'الوقود' })} />
            <GaugeCard value={stats.gauges.oil_pressure?.value ?? null} max={10} unit="bar" label="الدهن" icon="🔧" colorScheme="oil_pressure" lastUpdated={stats.gauges.oil_pressure?.logged_at} onManualEntry={() => setGaugeModal({ type: 'oil_pressure', unit: 'bar', label: 'ضغط الدهن' })} />
            <GaugeCard
              value={stats.gauges.load?.value ?? null}
              max={Math.max(100, (stats.gauges.load?.value ?? 0) * 1.5, (stats?.total_amperage ?? 100))}
              unit="A" label="الحمل" icon="⚡" colorScheme="load"
              lastUpdated={stats.gauges.load?.logged_at}
              onManualEntry={() => setGaugeModal({ type: 'load', unit: 'A', label: 'الحمل الكهربائي' })}
            />
          </div>
          {stats.gauges.runtime_hours && (
            <div className="mt-2 p-3 rounded-xl" style={{ background: 'var(--bg-muted)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium">ساعات الزيت</span>
                <span className="font-num text-xs font-bold">{stats.gauges.runtime_hours.current.toFixed(0)} / {stats.gauges.runtime_hours.max}</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: `${Math.min(100, (stats.gauges.runtime_hours.current / stats.gauges.runtime_hours.max) * 100)}%`,
                  background: stats.gauges.runtime_hours.current >= stats.gauges.runtime_hours.max ? '#DC2626' : stats.gauges.runtime_hours.current >= stats.gauges.runtime_hours.max * 0.8 ? '#D97706' : '#059669',
                }} />
              </div>
            </div>
          )}
        </Link>
      )}

      {/* Manual reading modal */}
      {gaugeModal && stats?.gauges?.engine_id && (
        <ManualReadingModal type={gaugeModal.type} unit={gaugeModal.unit} label={gaugeModal.label} engineId={stats.gauges.engine_id} branchId={stats.gauges.branch_id ?? ''} onClose={() => setGaugeModal(null)} onSuccess={() => { setGaugeModal(null); refresh() }} />
      )}

      {/* D) QUICK STATS */}
      {canSeeFinance && (
        <div className="grid grid-cols-2 gap-3">
          <Link href="/debts" className="bg-bg-surface rounded-2xl p-3.5 flex items-center gap-3" style={{ boxShadow: 'var(--shadow-md)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-danger/10"><AlertTriangle size={16} className="text-danger" /></div>
            <div className="flex-1"><p className="text-[10px] text-text-muted">الديون</p><p className="font-num text-sm font-bold text-danger">{fmt(stats?.total_debt)}</p></div>
          </Link>
          <Link href="/subscribers" className="bg-bg-surface rounded-2xl p-3.5 flex items-center gap-3" style={{ boxShadow: 'var(--shadow-md)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-violet/10"><Zap size={16} className="text-violet" /></div>
            <div className="flex-1"><p className="text-[10px] text-text-muted">الأمبير</p><p className="font-num text-sm font-bold">{stats?.total_amperage ?? 0}A</p></div>
          </Link>
          <Link href="/expenses" className="bg-bg-surface rounded-2xl p-3.5 flex items-center gap-3" style={{ boxShadow: 'var(--shadow-md)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gold/10"><Receipt size={16} className="text-gold" /></div>
            <div className="flex-1"><p className="text-[10px] text-text-muted">المصروفات</p><p className="font-num text-sm font-bold text-gold">—</p></div>
          </Link>
          <Link href="/subscribers" className="bg-bg-surface rounded-2xl p-3.5 flex items-center gap-3" style={{ boxShadow: 'var(--shadow-md)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-blue-primary/10"><Users size={16} className="text-blue-primary" /></div>
            <div className="flex-1"><p className="text-[10px] text-text-muted">المشتركون</p><p className="font-num text-sm font-bold">{stats?.total_subscribers ?? 0}</p></div>
          </Link>
        </div>
      )}

      {/* E) AMPERAGE DISTRIBUTION */}
      {canSeeFinance && (stats?.total_amperage ?? 0) > 0 && (
        <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
          <p className="text-xs font-bold text-text-secondary mb-2">توزيع الأمبير</p>
          <div className="flex items-center gap-4 text-center">
            <div className="flex-1"><p className="font-num text-lg font-bold text-violet">{stats?.total_amperage ?? 0}</p><p className="text-[10px] text-text-muted">إجمالي</p></div>
            <div className="w-px h-8 bg-border" />
            <div className="flex-1"><p className="font-num text-lg font-bold text-gold">{stats?.gold_amperage ?? 0}</p><p className="text-[10px] text-text-muted">ذهبي</p></div>
            <div className="w-px h-8 bg-border" />
            <div className="flex-1"><p className="font-num text-lg font-bold text-blue-primary">{stats?.normal_amperage ?? 0}</p><p className="text-[10px] text-text-muted">عادي</p></div>
          </div>
        </div>
      )}

      {/* Discount requests — owner only */}
      {isOwner && (stats?.pending_discount_requests ?? []).length > 0 && (
        <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
          <p className="text-sm font-bold mb-3 flex items-center gap-1.5"><Gift size={14} className="text-gold" /> طلبات خصم</p>
          {(stats?.pending_discount_requests ?? []).map((d: any) => (
            <div key={d.id} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <div><p className="text-xs font-bold">{d.subscriber?.name}</p><p className="text-[10px] text-text-muted">{d.staff?.name} — {Number(d.amount).toLocaleString('en')} د.ع</p></div>
              <div className="flex gap-1">
                <button onClick={() => handleDiscountAction(d.id, 'approve')} className="px-2 py-1 rounded text-[10px] font-bold bg-success/10 text-success">قبول</button>
                <button onClick={() => handleDiscountAction(d.id, 'reject')} className="px-2 py-1 rounded text-[10px] font-bold bg-danger/10 text-danger">رفض</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top debtors */}
      {canSeeFinance && debtors.length > 0 && (
        <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold flex items-center gap-1.5"><AlertTriangle size={12} className="text-danger" /> أكبر المدينين</span>
            <Link href="/debts" className="text-[10px] text-blue-primary font-bold">الكل</Link>
          </div>
          {debtors.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between py-1.5">
              <span className="text-xs">{d.name}</span>
              <span className="font-num text-xs font-bold text-danger">{fmt(d.debt)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Floating map button */}
      {canSeeFinance && (
        <Link
          href="/map"
          className="fixed left-4 bottom-24 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
          style={{ background: 'linear-gradient(135deg, #1B4FD8, #7C3AED)', boxShadow: '0 4px 20px rgba(27,79,216,0.4)' }}
        >
          <MapPin className="w-5 h-5 text-white" />
        </Link>
      )}
    </div>
  )
}


function OwnerAsCollectorCard() {
  // This checks if the owner is also acting as collector
  // We'll show it if the session indicates is_owner_acting
  const { data: session } = useSession()
  // For owners, we check staff records — but since owner is virtual,
  // we show this card and let the API determine visibility
  // For simplicity, always show for owner
  return (
    <div className="bg-gold-soft rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <p className="text-sm font-bold text-text-primary mb-3">🎩 أنت تعمل كجابي بنفسك</p>
      <div className="flex gap-2">
        <Link
          href="/pos"
          className="flex-1 h-10 rounded-xl bg-blue-primary text-white text-xs font-bold flex items-center justify-center gap-1.5"
        >
          <CreditCard size={14} />
          فتح POS
        </Link>
        <Link
          href="/my-report"
          className="flex-1 h-10 rounded-xl bg-bg-surface border border-border text-text-primary text-xs font-bold flex items-center justify-center gap-1.5"
        >
          <BarChart3 size={14} />
          تقريري اليومي
        </Link>
      </div>
    </div>
  )
}

function GracePeriodBanner() {
  const [show, setShow] = useState(false)
  const [daysLeft, setDaysLeft] = useState(0)

  useEffect(() => {
    fetch('/api/subscription-status')
      .then(r => r.json())
      .then(d => {
        if (d.is_in_grace_period) {
          setShow(true)
          setDaysLeft(d.days_left ?? 0)
        }
      })
      .catch(() => {})
  }, [])

  if (!show) return null

  return (
    <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
      <span className="text-xl">⚠️</span>
      <div className="flex-1">
        <p className="text-xs font-bold text-danger">اشتراكك ينتهي خلال {daysLeft} أيام</p>
        <p className="text-[10px] text-text-muted">تواصل مع أمبير للتجديد</p>
      </div>
    </div>
  )
}

async function handleDiscountAction(id: string, action: 'approve' | 'reject') {
  try {
    await fetch(`/api/discounts/collector-request/${id}/${action}`, { method: 'PUT' })
    window.location.reload()
  } catch {
    // silent fail — will reload anyway
  }
}
