'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Zap, CreditCard, Phone, AlertTriangle, CheckCircle2,
  Clock, Loader2, FileText, PhoneCall, LogOut, Bell,
  Star, Send, ChevronDown, History, ArrowLeft,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

const fmt = (n: number) => Number(n).toLocaleString('en')
import { formatBillingMonth, monthName } from '@/lib/billing-months'
import AmperLogoBrand from "@/components/AmperLogoBrand"

type SubData = {
  id: string; name: string; serial_number: string; subscription_type: string
  amperage: number; total_debt: number; branch_name: string; price_per_amp: number | null
  current_invoice: { id: string; billing_month: number; billing_year: number; total_amount_due: number; amount_paid: number; is_fully_paid: boolean } | null
  invoices_history: { id: string; billing_month: number; billing_year: number; total_amount_due: number; amount_paid: number; is_fully_paid: boolean }[]
  generator_status: { name: string; run_status: boolean; last_seen: string | null; is_online: boolean; gold_hours_today?: number; normal_hours_today?: number } | null
  settings: { primary_color: string; welcome_message: string | null; collector_call_enabled: boolean }
}

type PaymentOption = {
  gateway: string
  label: string
  sublabel: string
  badge: 'qi' | 'visa' | 'mastercard' | 'zaincash' | 'asiapay' | 'generic'
  isTestMode: boolean
}

type Tab = 'home' | 'pay' | 'history' | 'alerts' | 'contact'

const VALID_TABS: Tab[] = ['home', 'pay', 'history', 'alerts', 'contact']

// Outer wrapper: Suspense boundary required for useSearchParams in Next 16+.
// Without it, the build fails to prerender even with `dynamic = 'force-dynamic'`.
export default function SubscriberHomePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-dvh" style={{ background: '#F0F4FF' }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#1A56A0' }} />
    </div>}>
      <SubscriberHomeInner />
    </Suspense>
  )
}

function SubscriberHomeInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Allow deep links like /portal/home?tab=pay (used by /payment/failure
  // → "حاول مرة أخرى" so the user lands directly on the pay flow).
  const initialTab = (() => {
    const t = searchParams?.get('tab')
    return t && (VALID_TABS as string[]).includes(t) ? (t as Tab) : 'home'
  })()
  const [data, setData] = useState<SubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [callingCollector, setCallingCollector] = useState(false)
  // Payment options come from /api/portal/payment-options — the server
  // joins per-tenant gateway credentials with per-branch legacy settings,
  // so the UI never has to re-derive that logic.
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([])
  const [payLoading, setPayLoading] = useState<string | null>(null)
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const fetchMe = () => fetch('/api/portal/me')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { router.replace('/portal'); })
    const fetchPaymentOptions = () => fetch('/api/portal/payment-options')
      .then(r => r.ok ? r.json() : { options: [] })
      .then(d => setPaymentOptions(d.options ?? []))
      .catch(() => setPaymentOptions([]))
    const fetchAnnouncements = () => fetch('/api/portal/announcements').then(r => r.json()).then(d => setAnnouncements(d.announcements ?? [])).catch(() => {})
    const fetchUnread = () => fetch('/api/announcements/unread-count').then(r => r.json()).then(d => setUnreadCount(d.count ?? 0)).catch(() => {})

    fetchMe()
    fetchPaymentOptions()
    fetchAnnouncements()
    fetchUnread()

    // Refresh when tab becomes visible
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchMe()
        fetchAnnouncements()
        fetchUnread()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    // Poll notifications every 5 minutes
    const interval = setInterval(() => {
      fetchUnread()
      fetchAnnouncements()
    }, 5 * 60 * 1000)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [router])

  const onTabClick = (key: Tab) => {
    setTab(key)
    if (key === 'alerts' && unreadCount > 0) {
      setUnreadCount(0)
      const ids = announcements.map((a: any) => a.id)
      if (ids.length) {
        fetch('/api/announcements/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ announcement_ids: ids }),
        }).catch(() => {})
      }
    }
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-dvh" style={{ background: '#F0F4FF' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#1A56A0' }} />
      </div>
    )
  }

  const brandColor = data.settings.primary_color || '#1A56A0'
  const inv = data.current_invoice
  const invoiceDue = inv ? inv.total_amount_due - inv.amount_paid : 0
  const hasPayment = paymentOptions.length > 0
  const invMonthName = inv ? formatBillingMonth(inv.billing_month, inv.billing_year) : ''
  const totalDue = invoiceDue + (data?.total_debt ?? 0)

  // Single payment entry point — every option button calls this with its
  // gateway key. Server handles routing (new adapter vs legacy createPayment).
  async function handlePayment(gateway: string) {
    if (totalDue <= 0) { toast.error('لا يوجد مبلغ مستحق'); return }
    setPayLoading(gateway)
    try {
      const res = await fetch('/api/payment/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: data?.current_invoice?.id ?? null,
          amount: totalDue,
          payment_method: gateway,
        }),
      })
      const result = await res.json()
      if (result.payment_url) {
        window.location.href = result.payment_url
        return
      }
      toast.error(result.error || 'فشل إنشاء رابط الدفع')
    } catch {
      toast.error('خطأ في الاتصال')
    }
    setPayLoading(null)
  }

  async function logout() {
    try { await fetch('/api/portal/logout', { method: 'POST' }) } catch (_) {}
    document.cookie = 'subscriber_id=; path=/; max-age=0'
    localStorage.removeItem('amper_code')
    router.replace('/portal')
  }

  async function handleCallCollector() {
    setCallingCollector(true)
    try {
      const res = await fetch('/api/portal/collector-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const result = await res.json()
      if (res.ok && result.ok) {
        toast.success(result.message || 'تم إرسال الطلب — سيتواصل معك الجابي')
      } else {
        toast.error(result.error || 'فشل إرسال الطلب')
      }
    } catch { toast.error('خطأ في الاتصال — حاول مرة أخرى') }
    setCallingCollector(false)
  }

  const tabs: { key: Tab; icon: any; label: string }[] = [
    { key: 'home', icon: Zap, label: 'الرئيسية' },
    { key: 'pay', icon: CreditCard, label: 'الدفع' },
    { key: 'history', icon: FileText, label: 'الفواتير' },
    { key: 'alerts', icon: Bell, label: 'إشعارات' },
    { key: 'contact', icon: Phone, label: 'تواصل' },
  ]

  return (
    <>
      <Toaster position="top-center" />
      <div className="flex-1 pb-20" style={{ background: '#F0F4FF', color: '#0F172A' }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1A56A0, #2563EB)',
          padding: '20px 16px 24px',
          color: 'white',
          position: 'relative',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={logout} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 12, padding: '8px 12px', color: 'white', cursor: 'pointer' }}>
              <LogOut size={18} />
            </button>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{data.name}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{data.branch_name}</div>
            </div>
            <div style={{ width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AmperLogoBrand variant="icon" size="md" />
            </div>
          </div>
        </div>

        <div className="px-4 space-y-4">
          {tab === 'home' && (
            <>
              {/* Feature 6: Unpaid invoice banner */}
              {inv && !inv.is_fully_paid && (
                <div
                  className="rounded-xl p-4 flex items-center justify-between animate-fade-in"
                  style={{ background: '#FEF2F2', borderRight: '3px solid #C62828', boxShadow: 'none' }}
                >
                  <button
                    onClick={() => setTab('pay')}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 flex-shrink-0"
                    style={{ background: '#1A56A0', color: '#FFF' }}
                  >
                    ادفع الآن
                    <ArrowLeft className="w-3 h-3" />
                  </button>
                  <div className="text-right">
                    <p className="text-xs font-bold flex items-center justify-end gap-1" style={{ color: '#C62828' }}>
                      <span>فاتورة {invMonthName} غير مدفوعة</span>
                    </p>
                    <p className="font-num text-lg font-bold mt-0.5" style={{ color: '#0F172A' }}>
                      {fmt(invoiceDue)} <span className="text-[10px]" style={{ color: '#94A3B8' }}>د.ع</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Generator status */}
              {data.generator_status && (
                <div className="py-3 px-1 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {(data.generator_status.gold_hours_today != null || data.generator_status.normal_hours_today != null) && (
                      <>
                        <span className="text-[10px]" style={{ color: '#94A3B8' }}>{data.generator_status.gold_hours_today ?? 0}h ذهبي</span>
                        <span className="text-[10px]" style={{ color: '#94A3B8' }}>{data.generator_status.normal_hours_today ?? 0}h عادي</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: '#8E8E93' }}>{data.generator_status.name}</span>
                    <span className="text-[10px]" style={{ color: data.generator_status.run_status ? '#2E7D32' : '#C62828' }}>{data.generator_status.run_status ? 'تعمل' : 'متوقفة'}</span>
                    <div className={`w-2 h-2 rounded-full ${data.generator_status.run_status ? 'pulse-green' : 'pulse-dot-red'}`} style={{ background: data.generator_status.run_status ? '#2E7D32' : '#C62828' }} />
                  </div>
                </div>
              )}

              {/* Invoice amount */}
              <div className="text-center" style={{ background: '#FFFFFF', boxShadow: '0 2px 8px rgba(15,23,42,0.06)', padding: '24px 16px', borderRadius: 16 }}>
                <p className="text-sm mb-3" style={{ color: '#8E8E93' }}>المبلغ المستحق</p>
                <p className="font-num text-4xl font-black" style={{ color: '#0F172A' }}>{fmt(invoiceDue)}<span className="text-sm mr-1 font-normal" style={{ color: '#8E8E93' }}>د.ع</span></p>
                <p className="text-xs mt-1" style={{ color: '#8E8E93' }}>دينار عراقي</p>
                {inv && (
                  <p className="text-xs mt-2" style={{ color: '#8E8E93' }}>
                    {formatBillingMonth(inv.billing_month, inv.billing_year)} — {data.amperage} أمبير
                  </p>
                )}
                {inv?.is_fully_paid && <p className="text-xs mt-2" style={{ color: '#16A34A' }}>مدفوعة بالكامل</p>}
                {inv && !inv.is_fully_paid && hasPayment && (
                  <button
                    onClick={() => setTab('pay')}
                    className="w-full text-white text-sm font-bold mt-6"
                    style={{ background: '#1A56A0', height: 52, borderRadius: 14 }}
                  >
                    ادفع الآن
                  </button>
                )}
              </div>

              {/* Upsell for normal subscribers */}
              {inv?.is_fully_paid && data.subscription_type === 'normal' && (
                <UpsellCard />
              )}

              {/* Debt */}
              {data.total_debt > 0 && (
                <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: 'rgba(239,68,68,0.1)' }}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" style={{ color: '#EF4444' }} />
                    <span className="text-xs">ديون سابقة</span>
                  </div>
                  <span className="font-num text-sm font-bold" style={{ color: '#EF4444' }}>{fmt(data.total_debt)} د.ع</span>
                </div>
              )}

              {/* Feature 7: Payment history link */}
              <button
                onClick={() => router.push('/portal/history')}
                className="w-full rounded-2xl p-4 flex items-center justify-between"
                style={{ background: '#FFFFFF', boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }}
              >
                <ArrowLeft className="w-4 h-4" style={{ color: '#94A3B8' }} />
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-sm font-bold text-right" style={{ color: '#0F172A' }}>سجل الدفعات</p>
                    <p className="text-[10px] text-right" style={{ color: '#94A3B8' }}>عرض جميع الدفعات السابقة</p>
                  </div>
                  <History className="w-5 h-5" style={{ color: '#1A56A0' }} />
                </div>
              </button>

              {/* Feature 10: Change subscription request */}
              <ChangeRequestCard
                amperage={data.amperage}
                subscriptionType={data.subscription_type}
              />

              {/* Feature 8: Service rating */}
              <RatingCard subscriberId={data.id} />
            </>
          )}

          {tab === 'pay' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold">الدفع</h2>
              {!hasPayment ? (
                <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--bg-surface)', boxShadow: 'var(--shadow-card)' }}>
                  <div className="w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(100,116,139,0.08)' }}>
                    <CreditCard className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <p className="text-sm font-bold mb-1">الدفع متاح عند الجابي فقط</p>
                  <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>تواصل مع صاحب المولدة لتفعيل الدفع الإلكتروني</p>
                  {data.settings.collector_call_enabled && (
                    <button onClick={handleCallCollector} disabled={callingCollector}
                      className="w-full h-12 rounded-xl text-sm font-bold text-white disabled:opacity-60" style={{ background: '#1A56A0' }}>
                      {callingCollector ? 'جاري...' : '📞 أرسل الجابي'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Amount card */}
                  <div className="overflow-hidden" style={{ background: 'linear-gradient(135deg, #1A56A0, #2563EB)', borderRadius: 16 }}>
                    <div className="p-5 text-center">
                      <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>المبلغ المستحق</p>
                      <p className="font-num text-4xl font-bold" style={{ color: '#FFFFFF' }}>{fmt(totalDue)}<span className="text-sm mr-1" style={{ color: 'rgba(255,255,255,0.5)' }}>د.ع</span></p>
                    </div>
                    <div className="flex" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                      <div className="flex-1 p-3 text-center" style={{ borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                        <p className="text-[10px] mb-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>فاتورة {invMonthName}</p>
                        <p className="font-bold font-num text-sm" style={{ color: '#FFFFFF' }}>{fmt(invoiceDue)}</p>
                      </div>
                      <div className="flex-1 p-3 text-center">
                        <p className="text-[10px] mb-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>ديون سابقة</p>
                        <p className={`font-bold font-num text-sm`} style={{ color: data.total_debt > 0 ? '#FCA5A5' : '#FFFFFF' }}>{fmt(data.total_debt)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Prominent test-mode banner — when ANY enabled gateway is
                      in sandbox mode, the subscriber sees this BEFORE picking
                      a method, so they don't accidentally try a UAT card.
                      Per-button inline tag is kept for clarity. */}
                  {paymentOptions.some(o => o.isTestMode) && (
                    <div
                      className="rounded-xl p-3 text-[11px] flex items-start gap-2"
                      style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}
                    >
                      <span style={{ fontSize: 16 }}>⚠️</span>
                      <p>
                        <strong>وضع تجريبي:</strong> بعض البوابات في وضع UAT.
                        لا تستخدم بطاقتك الفعلية — سيُرفض الدفع.
                      </p>
                    </div>
                  )}

                  <p className="text-[11px] text-right" style={{ color: 'var(--text-muted)' }}>اختر طريقة الدفع</p>

                  {paymentOptions.map(opt => {
                    const isLoading = payLoading === opt.gateway
                    const disabled = payLoading !== null && !isLoading
                    return (
                      <button
                        key={opt.gateway}
                        onClick={() => handlePayment(opt.gateway)}
                        disabled={disabled || isLoading}
                        className="w-full rounded-xl p-3 flex items-center justify-between disabled:opacity-50"
                        style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)' }}
                      >
                        <span style={{ color: 'var(--text-muted)' }}>{isLoading ? '⏳' : '›'}</span>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{opt.label}</p>
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              {opt.sublabel}
                              {opt.isTestMode && <span className="mr-1" style={{ color: '#D97706' }}> · وضع تجريبي</span>}
                            </p>
                          </div>
                          <PaymentBadge kind={opt.badge} />
                        </div>
                      </button>
                    )
                  })}

                  <p className="text-center text-[10px]" style={{ color: '#94A3B8' }}>🔒 دفع آمن ومشفّر</p>
                </div>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold">سجل الفواتير</h2>
              {data.invoices_history.length === 0 ? (
                <p className="text-center text-xs py-8" style={{ color: '#94A3B8' }}>لا توجد فواتير</p>
              ) : data.invoices_history.map((inv, i) => (
                <div key={inv.id} className="py-3 flex items-center justify-between" style={{ borderBottom: i < data.invoices_history.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
                  <div className="flex items-center gap-2">
                    <span className="font-num text-lg font-bold" style={{ color: '#0F172A' }}>{fmt(inv.total_amount_due)}</span>
                    <span className="text-[10px]" style={{ color: '#94A3B8' }}>د.ع</span>
                    {inv.is_fully_paid ? (
                      <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#16A34A' }} />
                    ) : (
                      <Clock className="w-3.5 h-3.5" style={{ color: '#C62828' }} />
                    )}
                  </div>
                  <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{formatBillingMonth(inv.billing_month, inv.billing_year)}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'alerts' && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold">الإشعارات</h2>
              {announcements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl" style={{ background: '#F1F5F9' }}>📭</div>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>لا توجد إشعارات</p>
                </div>
              ) : announcements.map((a: any) => {
                const cfg: Record<string, { emoji: string; label: string; bg: string; color: string }> = {
                  maintenance: { emoji: '🔧', label: 'صيانة', bg: '#FFF3E0', color: '#E65100' },
                  emergency: { emoji: '⚡', label: 'طارئ', bg: '#FFEBEE', color: '#C62828' },
                  price: { emoji: '💰', label: 'تسعيرة', bg: '#E8F5E9', color: '#2E7D32' },
                  general: { emoji: '📢', label: 'إعلان', bg: '#E3F2FD', color: '#1565C0' },
                }
                const c = cfg[a.type] ?? cfg.general
                const dt = new Date(a.created_at)
                const diff = Date.now() - dt.getTime()
                const mins = Math.floor(diff / 60000)
                const timeAgo = mins < 60 ? `منذ ${mins} دقيقة` : mins < 1440 ? `منذ ${Math.floor(mins / 60)} ساعة` : `منذ ${Math.floor(mins / 1440)} يوم`
                return (
                  <div key={a.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: `1px solid ${c.bg}`, boxShadow: 'var(--shadow-card)' }}>
                    {a.is_urgent && <div className="text-white text-xs font-bold text-center py-1.5" style={{ background: '#EF4444' }}>🚨 إشعار عاجل</div>}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px]" style={{ color: c.color }}>{timeAgo}</span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.color }}>{c.emoji} {c.label}</span>
                      </div>
                      <p className="text-sm leading-relaxed text-right" style={{ color: 'var(--text-secondary)' }}>{a.message}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'contact' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold">تواصل</h2>
              {data.settings.collector_call_enabled && (
                <button onClick={handleCallCollector} disabled={callingCollector}
                  className="w-full h-14 rounded-xl text-white text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: '#1A56A0' }}>
                  <PhoneCall className="w-5 h-5" />
                  {callingCollector ? 'جاري...' : '📞 اطلب زيارة الجابي'}
                </button>
              )}
              <button onClick={logout}
                className="w-full h-12 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: '#EF4444' }}>
                <LogOut className="w-4 h-4" /> تسجيل الخروج
              </button>
            </div>
          )}
        </div>

        {/* Bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-50" style={{ background: '#FFFFFF', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="max-w-[390px] mx-auto flex items-center justify-around h-16 pb-[env(safe-area-inset-bottom)]">
            {tabs.map(t => {
              const isActive = tab === t.key
              const Icon = t.icon
              return (
                <button key={t.key} onClick={() => onTabClick(t.key)} className="flex flex-col items-center gap-1 py-2 px-3">
                  <span className="relative inline-block">
                    <Icon className="w-5 h-5" style={{ color: isActive ? '#1A56A0' : '#8E8E93' }} />
                    {t.key === 'alerts' && unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-2 flex items-center justify-center rounded-full text-white font-bold" style={{ background: '#C62828', minWidth: '16px', height: '16px', fontSize: '9px', padding: '0 4px' }}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px]" style={{ color: isActive ? '#1A56A0' : '#8E8E93', fontWeight: isActive ? 700 : 400 }}>{t.label}</span>
                </button>
              )
            })}
          </div>
        </nav>

        {/* PWA install banner */}
        <InstallBanner />
      </div>
    </>
  )
}

// Visual badge per payment-method type. Driven by /api/portal/payment-options
// so adding a new gateway only needs a new `badge` value + a case here.
function PaymentBadge({ kind }: { kind: 'qi' | 'visa' | 'mastercard' | 'zaincash' | 'asiapay' | 'generic' }) {
  if (kind === 'qi') {
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-white text-[10px] font-black px-1.5 py-0.5 rounded" style={{ background: '#009944' }}>QI</span>
        <svg width="24" height="16" viewBox="0 0 32 20"><circle cx="12" cy="10" r="9" fill="#EB001B" /><circle cx="20" cy="10" r="9" fill="#F79E1B" /><path d="M16 3.3a9 9 0 0 1 0 13.4 9 9 0 0 1 0-13.4z" fill="#FF5F00" /></svg>
      </div>
    )
  }
  if (kind === 'zaincash') {
    return (
      <div className="rounded px-2 py-1" style={{ background: '#009944' }}>
        <span className="text-white text-sm font-black">Z</span>
      </div>
    )
  }
  if (kind === 'asiapay') {
    return (
      <div className="rounded px-2 py-1" style={{ background: '#0066B3' }}>
        <span className="text-white text-[10px] font-black">AsiaPay</span>
      </div>
    )
  }
  if (kind === 'mastercard') {
    return (
      <svg width="32" height="20" viewBox="0 0 32 20" aria-label="Mastercard">
        <circle cx="12" cy="10" r="9" fill="#EB001B" /><circle cx="20" cy="10" r="9" fill="#F79E1B" />
        <path d="M16 3.3a9 9 0 0 1 0 13.4 9 9 0 0 1 0-13.4z" fill="#FF5F00" />
      </svg>
    )
  }
  // visa + generic fall through to a Visa-style badge
  return (
    <div className="rounded px-2 py-1" style={{ background: '#1A1F71' }}>
      <span className="text-white text-sm font-black italic">VISA</span>
    </div>
  )
}

function UpsellCard() {
  const [show, setShow] = useState(true)

  if (!show) return null

  return (
    <div className="rounded-xl p-4" style={{ background: '#FFFBEB', borderRight: '3px solid #FF9500' }}>
      <div className="flex items-start justify-between mb-2">
        <button onClick={() => setShow(false)} className="text-xs" style={{ color: '#94A3B8' }}>✕</button>
        <span className="text-base">⭐</span>
      </div>
      <p className="text-sm font-bold mb-1 text-right" style={{ color: '#0F172A' }}>هل تعلم؟</p>
      <p className="text-xs leading-relaxed text-right" style={{ color: '#8E8E93' }}>مشتركو الذهبي يحصلون على ساعات أكثر — تحدث مع صاحب المولدة للترقية</p>
    </div>
  )
}

function RatingCard({ subscriberId }: { subscriberId: string }) {
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const key = `amper_rated_${new Date().getFullYear()}_${new Date().getMonth()}`
    if (localStorage.getItem(key)) setSubmitted(true)
  }, [])

  async function handleSubmit() {
    if (rating === 0) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/subscriber/rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment: comment || undefined }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setSubmitted(true)
        const key = `amper_rated_${new Date().getFullYear()}_${new Date().getMonth()}`
        localStorage.setItem(key, 'true')
        toast.success('شكراً لتقييمك!')
      } else {
        toast.error(data.error || 'فشل إرسال التقييم')
      }
    } catch {
      toast.error('خطأ في الاتصال')
    }
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div className="rounded-2xl p-5 text-center" style={{ background: 'var(--bg-surface)', boxShadow: 'var(--shadow-card)' }}>
        <p className="text-2xl mb-2">⭐</p>
        <p className="text-sm font-bold" style={{ color: '#2E7D32' }}>شكراً لتقييمك!</p>
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>يساعدنا تقييمك على تحسين الخدمة</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg-surface)', boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Star className="w-5 h-5" style={{ color: '#FF9500' }} />
        <p className="text-sm font-bold">قيّم الخدمة</p>
      </div>

      {/* Stars */}
      <div className="flex items-center justify-center gap-2 mb-3" dir="ltr">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            className="transition-transform"
            style={{ transform: (hovered >= n || rating >= n) ? 'scale(1.15)' : 'scale(1)' }}
          >
            <Star
              className="w-8 h-8"
              fill={(hovered >= n || rating >= n) ? '#F59E0B' : 'none'}
              style={{ color: (hovered >= n || rating >= n) ? '#F59E0B' : '#CBD5E1' }}
            />
          </button>
        ))}
      </div>

      {/* Comment */}
      <div className="mb-3">
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="ملاحظة (اختياري) 💬"
          rows={2}
          className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
          style={{ background: '#F8FAFC', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={rating === 0 || submitting}
        className="w-full h-11 rounded-xl text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: rating > 0 ? '#1A56A0' : '#94A3B8' }}
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {submitting ? 'جاري الإرسال...' : 'إرسال التقييم'}
      </button>
    </div>
  )
}

function ChangeRequestCard({ amperage, subscriptionType }: { amperage: number; subscriptionType: string }) {
  const [expanded, setExpanded] = useState(false)
  const [reqAmperage, setReqAmperage] = useState(String(amperage))
  const [reqType, setReqType] = useState(subscriptionType)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const amperageOptions = [1, 2, 3, 5, 7, 10, 15, 20, 25, 30, 40, 50]
  const typeLabel = (t: string) => t === 'gold' ? 'ذهبي' : 'عادي'

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/subscriber/change-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requested_amperage: Number(reqAmperage),
          requested_type: reqType,
          notes: notes || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setSubmitted(true)
        toast.success(data.message || 'تم إرسال طلبك')
      } else {
        toast.error(data.error || 'فشل إرسال الطلب')
      }
    } catch {
      toast.error('خطأ في الاتصال')
    }
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div className="rounded-2xl p-5 text-center" style={{ background: 'var(--bg-surface)', boxShadow: 'var(--shadow-card)' }}>
        <p className="text-2xl mb-2">⚡</p>
        <p className="text-sm font-bold" style={{ color: '#2E7D32' }}>تم إرسال طلبك</p>
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>سيتواصل معك المدير قريباً</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-surface)', boxShadow: 'var(--shadow-card)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between"
      >
        <ChevronDown
          className="w-4 h-4 transition-transform"
          style={{ color: 'var(--text-muted)', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-sm font-bold">طلب تغيير الاشتراك</p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              الحالي: {amperage} أمبير — {typeLabel(subscriptionType)}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.08)' }}>
            <Zap className="w-5 h-5" style={{ color: '#7C3AED' }} />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="pt-3">
            <label className="text-[11px] block text-right mb-1" style={{ color: 'var(--text-muted)' }}>الأمبير الجديد</label>
            <select
              value={reqAmperage}
              onChange={e => setReqAmperage(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none appearance-none"
              style={{ background: '#F8FAFC', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              {amperageOptions.map(a => (
                <option key={a} value={a}>{a} أمبير{a === amperage ? ' (الحالي)' : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] block text-right mb-1" style={{ color: 'var(--text-muted)' }}>نوع الاشتراك</label>
            <select
              value={reqType}
              onChange={e => setReqType(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none appearance-none"
              style={{ background: '#F8FAFC', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="normal">عادي{subscriptionType === 'normal' ? ' (الحالي)' : ''}</option>
              <option value="gold">ذهبي{subscriptionType === 'gold' ? ' (الحالي)' : ''}</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] block text-right mb-1" style={{ color: 'var(--text-muted)' }}>ملاحظات (اختياري)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="أي تفاصيل إضافية..."
              rows={2}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
              style={{ background: '#F8FAFC', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || (Number(reqAmperage) === amperage && reqType === subscriptionType)}
            className="w-full h-11 rounded-xl text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: '#1A56A0' }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitting ? 'جاري الإرسال...' : 'إرسال الطلب'}
          </button>
        </div>
      )}
    </div>
  )
}

function InstallBanner() {
  const [prompt, setPrompt] = useState<any>(null)
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('pwa_dismissed') === 'true') return
    // iOS detection
    const ua = navigator.userAgent
    if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) {
      const standalone = (navigator as any).standalone
      if (!standalone) { setIsIOS(true); setShow(true) }
      return
    }
    // Android/Chrome
    const handler = (e: any) => { e.preventDefault(); setPrompt(e); setShow(true) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!show) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 max-w-[358px] mx-auto">
      <div className="rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }}>
        <div className="flex items-start justify-between mb-2">
          <p className="text-xs font-bold" style={{ color: '#0F172A' }}>أضف التطبيق لشاشتك الرئيسية</p>
          <button onClick={() => { setShow(false); localStorage.setItem('pwa_dismissed', 'true') }}
            className="text-xs" style={{ color: 'var(--text-muted)' }}>✕</button>
        </div>
        {isIOS ? (
          <p className="text-[10px] mb-2" style={{ color: '#94A3B8' }}>
            اضغط <span style={{ color: '#0F172A' }}>مشاركة ↗</span> ثم <span style={{ color: '#0F172A' }}>إضافة للشاشة الرئيسية</span>
          </p>
        ) : (
          <button onClick={async () => {
            if (prompt) { prompt.prompt(); const r = await prompt.userChoice; if (r.outcome === 'accepted') setShow(false) }
          }}
            className="w-full h-9 rounded-xl text-white text-xs font-bold" style={{ background: '#1A56A0' }}>
            إضافة للشاشة الرئيسية
          </button>
        )}
      </div>
    </div>
  )
}
