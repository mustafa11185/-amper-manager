'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import {
  Building2, DollarSign, Wallet, MessageSquare, Users, GitBranch,
  QrCode, Smartphone, Monitor, MapPin, Tag, Palette, CreditCard,
  ChevronLeft, LogOut, Shield, LayoutList, Pencil, Trash2, Plus,
  Bell, ShieldCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import NotificationPreferencesSection from '@/components/NotificationPreferencesSection'
import { planLabelAr, isGoldOrHigher, isFleetOrHigher, normalizePlan } from '@/lib/plan'

type SettingsSection =
  | 'menu' | 'generator' | 'pricing' | 'wallets' | 'branch-info' | 'payment' | 'whatsapp'
  | 'staff' | 'branches' | 'alleys' | 'kiosk' | 'subscriber-app' | 'pos-devices'
  | 'operators' | 'staff-tracking' | 'discounts' | 'theme' | 'notifications'

export default function SettingsPage() {
  const { data: session } = useSession()
  const [section, setSection] = useState<SettingsSection>('menu')
  const role = session?.user?.role
  const isOwner = role === 'owner'
  const isOperator = role === 'operator'
  const isAccountant = role === 'accountant'
  const canCollect = session?.user?.canCollect
  // Normalize against legacy plan names — the DB may still hold
  // `gold`/`basic`/`trial` on old rows, while company-admin now
  // writes `business`/`pro`/`starter`. Always compare through the
  // helper so new plan names light up the right features.
  const plan = normalizePlan(session?.user?.plan)
  const isGold = isGoldOrHigher(plan)
  const isFleet = isFleetOrHigher(plan)

  if (section !== 'menu') {
    return (
      <div className="space-y-4">
        <button onClick={() => setSection('menu')} className="flex items-center gap-1 text-sm text-text-muted">
          <ChevronLeft size={16} /> الإعدادات
        </button>
        {section === 'generator' && <GeneratorSection />}
        {section === 'pricing' && <PricingSection />}
        {section === 'wallets' && <WalletsSection />}
        {section === 'branch-info' && <BranchInfoSection />}
        {section === 'whatsapp' && <WhatsappSection />}
        {section === 'staff' && <StaffSection plan={plan} />}
        {section === 'branches' && <BranchesSection isFleet={isFleet} />}
        {section === 'alleys' && <AlleysSection />}
        {section === 'kiosk' && <KioskSection />}
        {section === 'subscriber-app' && <SubscriberAppSettingsSection />}
        {section === 'pos-devices' && <PosDevicesSection />}
        {section === 'operators' && <OperatorsSection />}
        {section === 'staff-tracking' && <StaffTrackingSection />}
        {section === 'discounts' && <DiscountsSection />}
        {section === 'theme' && <ThemeSection />}
        {section === 'notifications' && <NotificationPreferencesSection />}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">الإعدادات</h1>

      {/* User card */}
      <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-primary to-violet flex items-center justify-center text-white font-bold text-lg">
            {session?.user?.name?.charAt(0) || '؟'}
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold">{session?.user?.name}</p>
            <p className="text-xs text-text-muted">
              {isOwner ? 'مالك المولد' : session?.user?.role === 'collector' ? 'جابي' :
               session?.user?.role === 'operator' ? 'مشغل' :
               session?.user?.role === 'accountant' ? 'محاسب' : 'أمين صندوق'}
            </p>
          </div>
          {isOwner && plan && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
              isFleet ? 'bg-violet-soft text-violet' :
              isGold ? 'bg-gold-soft text-gold' :
              'bg-blue-soft text-blue-primary'
            }`}>
              {planLabelAr(plan)}
            </span>
          )}
        </div>
      </div>

      {/* Menu items */}
      <div className="bg-bg-surface rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-md)' }}>
        {/* Owner: all sections */}
        {isOwner && (
          <>
            <MenuItem icon={Building2} label="معلومات المولد" onClick={() => setSection('generator')} />
            <MenuItem icon={DollarSign} label="التسعير الشهري" onClick={() => setSection('pricing')} />
            <MenuItem icon={Wallet} label="محافظ الجباة" onClick={() => setSection('wallets')} />
            <MenuItem icon={MapPin} label="معلومات المشروع" onClick={() => setSection('branch-info')} />
            <MenuItem icon={ShieldCheck} label="بوابات الدفع الإلكتروني" onClick={() => { window.location.href = '/staff/settings/payment-gateways' }} />
            <MenuItem icon={MessageSquare} label="واتساب" onClick={() => setSection('whatsapp')} badge={!isGold ? 'Gold' : undefined} />
            <MenuItem icon={Users} label="إدارة الموظفين" onClick={() => setSection('staff')} />
            <MenuItem icon={GitBranch} label="الفروع" onClick={() => setSection('branches')} badge={!isFleet ? 'Fleet' : undefined} />
            <MenuItem icon={LayoutList} label="الأزقة" onClick={() => setSection('alleys')} />
            <MenuItem icon={QrCode} label="أجهزة الكيوسك" onClick={() => setSection('kiosk')} />
            <MenuItem icon={Smartphone} label="تطبيق المشتركين" onClick={() => setSection('subscriber-app')} badge={!isGold ? 'Gold' : undefined} />
            <MenuItem icon={Monitor} label="أجهزة POS" onClick={() => setSection('pos-devices')} badge={!isFleet ? 'Fleet' : undefined} />
            <MenuItem icon={Shield} label="إدارة المشغلين" onClick={() => setSection('operators')} />
            <MenuItem icon={MapPin} label="تتبع الموظفين" onClick={() => setSection('staff-tracking')} />
            <MenuItem icon={Tag} label="الخصومات" onClick={() => setSection('discounts')} />
            <MenuItem icon={Bell} label="تفضيلات التنبيهات" onClick={() => setSection('notifications')} />
          </>
        )}
        {/* Accountant with can_collect: wallet only */}
        {isAccountant && canCollect && (
          <MenuItem icon={Wallet} label="محفظتي" onClick={() => setSection('wallets')} />
        )}
        {/* Operator: own schedule view */}
        {isOperator && (
          <MenuItem icon={Shield} label="جدولي وصلاحياتي" onClick={() => setSection('operators')} />
        )}
        {/* Theme: all roles */}
        <MenuItem icon={Palette} label="المظهر" onClick={() => setSection('theme')} />
      </div>

      {/* Sign out */}
      <button
        onClick={() => signOut({ callbackUrl: '/staff/login' })}
        className="w-full bg-bg-surface rounded-2xl p-4 flex items-center gap-3 text-danger"
        style={{ boxShadow: 'var(--shadow-sm)' }}
      >
        <LogOut size={18} />
        <span className="text-sm font-bold">تسجيل الخروج</span>
      </button>
    </div>
  )
}

function MenuItem({ icon: Icon, label, onClick, badge }: {
  icon: React.ElementType; label: string; onClick: () => void; badge?: string
}) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3.5 flex items-center gap-3 border-b border-border last:border-0 text-right"
    >
      <Icon size={18} className="text-text-muted shrink-0" />
      <span className="flex-1 text-sm font-medium">{label}</span>
      {badge && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gold-soft text-gold font-bold">{badge}</span>
      )}
      <ChevronLeft size={14} className="text-text-muted" />
    </button>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION A: Generator Info
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function GeneratorSection() {
  const [branches, setBranches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/branches')
      .then(r => r.json())
      .then(d => { setBranches(d.branches || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton />

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">معلومات المولد</h2>
      {branches.map(b => (
        <div key={b.id} className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
          <h3 className="text-sm font-bold mb-2">{b.name}</h3>
          {b.generators?.map((g: any) => (
            <div key={g.id} className="text-xs text-text-secondary py-1 border-b border-border last:border-0">
              {g.name}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION B: Monthly Pricing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { MONTHS as BILLING_MONTHS, formatBillingMonth, monthName } from '@/lib/billing-months'
const AR_MONTHS = BILLING_MONTHS.map(m => m.local)

function PricingSection() {
  const [pricingData, setPricingData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBranch, setSelectedBranch] = useState('')
  const [priceNormal, setPriceNormal] = useState(0)
  const [priceGold, setPriceGold] = useState(0)
  const [billingMonth, setBillingMonth] = useState(0)
  const [billingYear, setBillingYear] = useState(0)
  const [fetchError, setFetchError] = useState(false)
  const [noPricing, setNoPricing] = useState(false)

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false)
  const [editNormal, setEditNormal] = useState('')
  const [editGold, setEditGold] = useState('')
  const [editMonth, setEditMonth] = useState(0)
  const [editYear, setEditYear] = useState(0)
  const [saving, setSaving] = useState(false)

  // Generate
  const [generating, setGenerating] = useState(false)
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false)
  const [preCheckData, setPreCheckData] = useState<any>(null)
  const [preCheckError, setPreCheckError] = useState('')
  const [highlightEdit, setHighlightEdit] = useState(false)

  // Reverse
  const [reversing, setReversing] = useState(false)
  const [showReverseConfirm, setShowReverseConfirm] = useState(false)

  useEffect(() => { fetchPricing() }, [])

  function fetchPricing() {
    setFetchError(false)
    fetch('/api/settings/pricing')
      .then(r => r.json())
      .then(d => {
        const records = d.pricing || []
        setPricingData(records)
        if (records.length > 0) {
          const first = records[0]
          setSelectedBranch(first.branch.id)
          loadBranchPricing(first)
          setNoPricing(!first.pricing)
        } else {
          setNoPricing(true)
        }
        setLoading(false)
      })
      .catch(() => { setFetchError(true); setLoading(false) })
  }

  function loadBranchPricing(record: any) {
    const p = record.pricing
    if (p) {
      setPriceNormal(Number(p.price_per_amp_normal ?? 0))
      setPriceGold(Number(p.price_per_amp_gold ?? 0))
      if (p.effective_from) {
        const eff = new Date(p.effective_from)
        setBillingMonth(eff.getMonth() + 1)
        setBillingYear(eff.getFullYear())
      }
      setNoPricing(false)
    } else {
      setPriceNormal(0); setPriceGold(0)
      setBillingMonth(0); setBillingYear(0)
      setNoPricing(true)
    }
  }

  function handleBranchChange(branchId: string) {
    setSelectedBranch(branchId)
    const record = pricingData.find((r: any) => r.branch.id === branchId)
    if (record) loadBranchPricing(record)
  }

  function openEditModal() {
    setEditNormal(priceNormal > 0 ? String(priceNormal) : '')
    setEditGold(priceGold > 0 ? String(priceGold) : '')
    setEditMonth(billingMonth || new Date().getMonth() + 1)
    setEditYear(billingYear || new Date().getFullYear())
    setShowEditModal(true)
    setHighlightEdit(false)
  }

  async function handleSaveEdit() {
    if (!editNormal || Number(editNormal) <= 0 || !editGold || Number(editGold) <= 0) {
      toast.error('السعر يجب أن يكون أكبر من صفر'); return
    }
    if (!editMonth || !editYear) {
      toast.error('يجب تحديد الشهر والسنة'); return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/settings/update-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: selectedBranch,
          price_per_amp_normal: Number(editNormal),
          price_per_amp_gold: Number(editGold),
          billing_month: editMonth,
          billing_year: editYear,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل تحديث الأسعار')
      toast.success('تم تحديث السعر والشهر')
      setShowEditModal(false)
      fetchPricing()
    } catch (err: any) {
      toast.error(err.message || 'فشل تحديث الأسعار')
    } finally {
      setSaving(false)
    }
  }

  async function handlePreCheck() {
    setPreCheckError('')
    setPreCheckData(null)
    try {
      const res = await fetch('/api/invoices/pre-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: selectedBranch }),
      })
      const data = await res.json()
      if (data.check_failed === 'no_pricing') {
        setPreCheckError('يجب تحديد سعر الأمبير أولاً')
        setHighlightEdit(true)
        return
      }
      if (data.check_failed === 'no_month') {
        setPreCheckError('يجب تحديد الشهر المستحق أولاً')
        setHighlightEdit(true)
        return
      }
      if (data.check_failed === 'already_today') {
        setPreCheckError(data.error)
        return
      }
      if (!data.ok) {
        setPreCheckError(data.error || 'خطأ غير متوقع')
        return
      }
      setPreCheckData(data)
      setShowGenerateConfirm(true)
    } catch {
      setPreCheckError('خطأ في الاتصال')
    }
  }

  async function handleGenerate() {
    setShowGenerateConfirm(false)
    setGenerating(true)
    try {
      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: selectedBranch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`تم إصدار ${data.generated} فاتورة — ${data.debts_added} تحولوا لديون`)
    } catch (err: any) {
      toast.error(err.message || 'خطأ في إصدار الفواتير')
    } finally {
      setGenerating(false)
    }
  }

  async function handleReverse() {
    setShowReverseConfirm(false)
    setReversing(true)
    try {
      const res = await fetch('/api/invoices/reverse-last-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: selectedBranch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(data.message || 'تم التراجع بنجاح')
      fetchPricing()
    } catch (err: any) {
      toast.error(err.message || 'خطأ في التراجع')
    } finally {
      setReversing(false)
    }
  }

  if (loading) return <Skeleton />

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">التسعير الشهري</h2>

      {fetchError && (
        <div className="rounded-xl p-3 text-xs font-bold text-center" style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--gold)' }}>
          تعذر الاتصال بالخادم
        </div>
      )}

      {noPricing && !fetchError && (
        <div className="rounded-xl p-3 text-xs text-center" style={{ background: 'var(--blue-soft)', color: 'var(--blue-primary)' }}>
          لم يتم تحديد سعر الأمبير بعد — اضغط تعديل السعر والشهر
        </div>
      )}

      {/* Branch selector */}
      {pricingData.length > 1 && (
        <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
          <label className="text-xs text-text-muted block mb-1">الفرع</label>
          <select value={selectedBranch} onChange={e => handleBranchChange(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm">
            {pricingData.map((r: any) => (
              <option key={r.branch.id} value={r.branch.id}>{r.branch.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Read-only pricing display */}
      <div className="bg-bg-surface rounded-2xl p-4 space-y-3" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-text-muted">الشهر المستحق</p>
          <p className="text-sm font-bold font-num">
            {billingMonth > 0 && billingYear > 0
              ? formatBillingMonth(billingMonth, billingYear)
              : <span className="text-text-muted">غير محدد</span>}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-text-muted">سعر العادي</p>
          <p className="text-sm font-bold font-num text-blue-primary">
            {priceNormal > 0 ? `${priceNormal.toLocaleString('en')} د.ع` : <span className="text-text-muted">—</span>}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-text-muted">سعر الذهبي</p>
          <p className="text-sm font-bold font-num text-gold">
            {priceGold > 0 ? `${priceGold.toLocaleString('en')} د.ع` : <span className="text-text-muted">—</span>}
          </p>
        </div>
      </div>

      {/* Generate invoices button */}
      <button
        onClick={handlePreCheck}
        disabled={generating}
        className="w-full h-12 rounded-xl text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: 'var(--blue-primary)' }}
      >
        {generating ? 'جاري الإصدار...' : '📄 إصدار الفواتير'}
      </button>
      <p className="text-[10px] text-text-muted text-center -mt-1">
        سيحول المشتركين غير المدفوعين إلى ديون وينشئ فواتير جديدة لشهر {billingMonth > 0 ? monthName(billingMonth) : '...'}
      </p>

      {/* Pre-check error */}
      {preCheckError && (
        <div className="rounded-xl p-3 text-xs font-bold text-center" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
          {preCheckError}
        </div>
      )}

      <div className="h-px" style={{ background: 'var(--border)' }} />

      {/* Edit price & month button */}
      <button
        onClick={openEditModal}
        className="w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
        style={{
          background: highlightEdit ? 'rgba(239,68,68,0.1)' : 'var(--bg-surface)',
          color: highlightEdit ? 'var(--danger)' : 'var(--text-secondary)',
          border: highlightEdit ? '2px solid var(--danger)' : '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        💾 تعديل السعر والشهر
      </button>

      {/* Reverse last generation */}
      <button
        onClick={() => setShowReverseConfirm(true)}
        disabled={reversing}
        className="w-full h-10 rounded-xl text-xs font-bold disabled:opacity-50"
        style={{ color: 'var(--text-muted)', background: 'transparent' }}
      >
        {reversing ? 'جاري التراجع...' : '↩️ تراجع عن آخر إصدار'}
      </button>

      {/* ── Edit Modal (Bottom Sheet) ── */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/50"
          onClick={e => { if (e.target === e.currentTarget) setShowEditModal(false) }}>
          <div className="fixed bottom-0 left-0 right-0 mx-auto max-w-[420px] bg-bg-surface rounded-t-[20px] flex flex-col" style={{ maxHeight: '85vh' }}>
            {/* Header */}
            <div className="shrink-0 p-4 text-center" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-sm font-bold">تعديل السعر والشهر</h3>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-text-muted block mb-1">الشهر</label>
                  <select value={editMonth} onChange={e => setEditMonth(parseInt(e.target.value))}
                    className="w-full h-10 px-2 rounded-xl border border-border bg-bg-base text-sm font-bold">
                    {AR_MONTHS.map((name, i) => (
                      <option key={i + 1} value={i + 1}>{name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-text-muted block mb-1">السنة</label>
                  <input type="number" value={editYear || ''} onChange={e => setEditYear(parseInt(e.target.value) || 0)}
                    dir="ltr" className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base font-num text-sm font-bold text-center" />
                </div>
              </div>

              <div>
                <label className="text-xs text-text-muted block mb-1.5">سعر الأمبير العادي</label>
                <div className="relative">
                  <input type="number" value={editNormal} onChange={e => setEditNormal(e.target.value)}
                    placeholder="0" dir="ltr"
                    className="w-full h-12 px-3 pl-14 rounded-xl border border-border bg-bg-base font-num text-lg font-bold text-blue-primary focus:outline-none focus:border-blue-primary" />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">د.ع</span>
                </div>
              </div>

              <div>
                <label className="text-xs text-text-muted block mb-1.5">سعر الأمبير الذهبي</label>
                <div className="relative">
                  <input type="number" value={editGold} onChange={e => setEditGold(e.target.value)}
                    placeholder="0" dir="ltr"
                    className="w-full h-12 px-3 pl-14 rounded-xl border border-border bg-bg-base font-num text-lg font-bold text-gold focus:outline-none focus:border-gold" />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">د.ع</span>
                </div>
              </div>
            </div>

            {/* Footer — always visible above bottom nav */}
            <div className="shrink-0 p-4" style={{ paddingBottom: 56, borderTop: '1px solid var(--border)' }}>
              <div className="flex gap-2">
                <button onClick={() => setShowEditModal(false)}
                  className="flex-1 h-11 rounded-xl bg-bg-muted text-text-secondary text-sm font-bold">
                  إلغاء
                </button>
                <button onClick={handleSaveEdit} disabled={saving}
                  className="flex-1 h-11 rounded-xl bg-blue-primary text-white text-sm font-bold disabled:opacity-50">
                  {saving ? 'جاري...' : '✅ تأكيد التعديل'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Generate Confirm Modal ── */}
      {showGenerateConfirm && preCheckData && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="bg-bg-surface w-full max-w-[340px] rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-center">تأكيد إصدار الفواتير</h3>
            <div className="bg-bg-muted rounded-xl p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">الشهر</span>
                <span className="font-bold font-num">{formatBillingMonth(preCheckData.billing_month || 1, preCheckData.billing_year)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">المشتركون النشطون</span>
                <span className="font-bold font-num text-blue-primary">{preCheckData.active_count}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">غير المدفوعين → ديون</span>
                <span className="font-bold font-num text-danger">{preCheckData.unpaid_count}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">فواتير جديدة ستُنشأ</span>
                <span className="font-bold font-num text-blue-primary">{preCheckData.active_count}</span>
              </div>
            </div>
            <p className="text-[10px] text-danger text-center font-bold">
              يمكن التراجع عن الإصدار لاحقاً
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowGenerateConfirm(false)}
                className="flex-1 h-10 rounded-xl bg-bg-muted text-text-secondary text-xs font-bold">
                إلغاء
              </button>
              <button onClick={handleGenerate} disabled={generating}
                className="flex-1 h-10 rounded-xl bg-blue-primary text-white text-xs font-bold disabled:opacity-50">
                {generating ? 'جاري...' : '✅ إصدار'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reverse Confirm Modal ── */}
      {showReverseConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="bg-bg-surface w-full max-w-[340px] rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-center">تراجع عن آخر إصدار</h3>
            <p className="text-xs text-text-muted text-center">
              سيتم حذف الفواتير المُصدرة في آخر عملية وإعادة الديون للحالة السابقة
            </p>
            <p className="text-[10px] text-danger text-center font-bold">
              سيتم حذف الفواتير واستعادة الديون — هل أنت متأكد؟
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowReverseConfirm(false)}
                className="flex-1 h-10 rounded-xl bg-bg-muted text-text-secondary text-xs font-bold">
                إلغاء
              </button>
              <button onClick={handleReverse} disabled={reversing}
                className="flex-1 h-10 rounded-xl text-white text-xs font-bold disabled:opacity-50"
                style={{ background: 'var(--danger)' }}>
                {reversing ? 'جاري...' : '↩️ تأكيد التراجع'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION C: Collector Wallets
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function WalletsSection() {
  const [wallets, setWallets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deliverStaffId, setDeliverStaffId] = useState<string | null>(null)
  const [deliverMax, setDeliverMax] = useState(0)
  const [deliverAmount, setDeliverAmount] = useState('')
  const [delivering, setDelivering] = useState(false)
  const [historyStaffId, setHistoryStaffId] = useState<string | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  function refresh() {
    fetch('/api/wallets').then(r => r.json()).then(d => { setWallets(d.wallets || []); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => { refresh() }, [])

  async function toggleHistory(staffId: string) {
    if (historyStaffId === staffId) { setHistoryStaffId(null); return }
    setHistoryStaffId(staffId)
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/wallet/history?staff_id=${staffId}&months=3`)
      const d = await res.json()
      setHistory(d.deliveries || [])
    } catch { setHistory([]) }
    setHistoryLoading(false)
  }

  async function handleDeliver() {
    if (!deliverStaffId || !deliverAmount || Number(deliverAmount) <= 0) return
    if (Number(deliverAmount) > deliverMax) { toast.error(`الحد الأقصى: ${deliverMax.toLocaleString('en')} د.ع`); return }
    setDelivering(true)
    try {
      const res = await fetch('/api/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_staff_id: deliverStaffId, amount: Number(deliverAmount) }),
      })
      if (!res.ok) throw new Error()
      const remaining = deliverMax - Number(deliverAmount)
      toast.success(`تم استلام ${Number(deliverAmount).toLocaleString('en')} د.ع. المحفظة الآن: ${remaining.toLocaleString('en')} د.ع`)
      setDeliverStaffId(null)
      setDeliverAmount('')
      refresh()
    } catch { toast.error('خطأ في الاستلام') }
    setDelivering(false)
  }

  if (loading) return <Skeleton />

  const totalWallets = wallets.reduce((a: number, w: any) => a + Number(w.balance), 0)

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">محافظ الجباة</h2>

      {/* Total bar */}
      {wallets.length > 0 && totalWallets > 0 && (
        <div className="bg-danger/10 rounded-2xl p-4 text-center">
          <p className="text-xs text-danger font-medium mb-1">إجمالي المحافظ</p>
          <p className="font-num text-2xl font-bold text-danger">{totalWallets.toLocaleString('en')} <span className="text-sm">د.ع</span></p>
        </div>
      )}

      {wallets.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-4">لا توجد محافظ</p>
      ) : wallets.map((w: any) => {
        const balance = Number(w.balance)
        const delivered = Number(w.total_delivered)
        const photo = w.staff?.photo_url
        return (
          <div key={w.id} className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
            {/* Header with photo */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center shrink-0" style={{ background: 'var(--bg-muted)' }}>
                {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <span className="text-sm font-bold text-text-muted">{w.staff?.name?.charAt(0)}</span>}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">{w.staff?.name}</p>
                {w.staff?.is_owner_acting && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gold-soft text-gold font-bold">مالك</span>}
              </div>
            </div>

            {/* Wallet balance — prominent */}
            <div className="mb-3">
              <p className="text-[10px] text-text-muted mb-0.5">المحفظة</p>
              <p className={`font-num text-xl font-bold ${balance > 0 ? 'text-danger' : 'text-success'}`}>{balance.toLocaleString('en')} <span className="text-xs text-text-muted">د.ع</span></p>
            </div>

            <div className="mb-3">
              <p className="text-[10px] text-text-muted mb-0.5">المُستلَم هذا الشهر</p>
              <p className="font-num text-sm font-bold">{delivered.toLocaleString('en')} <span className="text-xs text-text-muted">د.ع</span></p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {balance > 0 && (
                <button onClick={() => { setDeliverStaffId(w.staff_id); setDeliverMax(balance); setDeliverAmount(String(balance)); }}
                  style={{ background: '#059669', color: 'white', borderRadius: 12, padding: '12px 20px', border: 'none', fontSize: 14, fontWeight: 700 }}
                  className="flex-1">
                  💰 استلام من الجابي
                </button>
              )}
              <button onClick={() => toggleHistory(w.staff_id)}
                className={`flex-1 h-9 rounded-xl text-xs font-bold ${historyStaffId === w.staff_id ? 'bg-violet/10 text-violet' : 'bg-bg-muted text-text-muted'}`}>
                سجل التعاملات
              </button>
            </div>

            {/* Transaction history */}
            {historyStaffId === w.staff_id && (
              <div className="mt-3 space-y-1.5">
                {historyLoading ? <div className="skeleton h-16 rounded-xl" /> : history.length === 0 ? (
                  <p className="text-[10px] text-text-muted text-center py-2">لا توجد تعاملات</p>
                ) : history.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <p className="text-[10px] font-num text-text-muted">{new Date(d.delivered_at).toLocaleDateString('en')}</p>
                      <p className="text-[10px]" style={{ color: d.received_by_owner ? 'var(--danger)' : 'var(--success)' }}>
                        {d.received_by_owner ? '➖ تسليم للمدير' : '➕ استلام فاتورة'}
                      </p>
                    </div>
                    <p className="font-num text-xs font-bold" style={{ color: d.received_by_owner ? 'var(--danger)' : 'var(--success)' }}>
                      {d.received_by_owner ? '-' : '+'}{Number(d.amount).toLocaleString('en')} <span className="text-[9px] text-text-muted">د.ع</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Deliver modal — bottom sheet */}
      {deliverStaffId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setDeliverStaffId(null); setDeliverAmount(''); } }}>
          <div style={{ background: 'var(--bg-surface)', width: '100%', maxWidth: 390, borderRadius: '20px 20px 0 0', padding: 20, paddingBottom: 56 }}>
            <h3 className="text-sm font-bold mb-2">استلام من الجابي</h3>
            <p className="text-xs text-text-muted mb-3">الحد الأقصى: <span className="font-num font-bold text-danger">{deliverMax.toLocaleString('en')}</span> د.ع</p>
            <input type="number" value={deliverAmount}
              onChange={e => { const v = Number(e.target.value); if (v >= 0 && v <= deliverMax) setDeliverAmount(e.target.value) }}
              dir="ltr" className="w-full h-12 px-3 rounded-xl border border-border bg-bg-base font-num text-lg text-center mb-4" />
            <div className="flex gap-2">
              <button onClick={() => { setDeliverStaffId(null); setDeliverAmount('') }}
                className="flex-1 h-12 rounded-xl bg-bg-muted text-text-secondary text-sm font-bold">إلغاء</button>
              <button onClick={handleDeliver} disabled={delivering || !deliverAmount || Number(deliverAmount) <= 0}
                style={{ background: '#059669', color: 'white', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 700, opacity: (delivering || !deliverAmount || Number(deliverAmount) <= 0) ? 0.5 : 1 }}
                className="flex-1 h-12">
                {delivering ? 'جاري...' : 'تأكيد الاستلام'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION D0: Branch Info (معلومات المشروع)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function BranchInfoSection() {
  const [info, setInfo] = useState({
    whatsapp_number: '',
    gps_lat: null as number | null,
    gps_lng: null as number | null,
    address: '',
    is_online_payment_enabled: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [gettingGps, setGettingGps] = useState(false)

  useEffect(() => {
    fetch('/api/settings/branch-info')
      .then(r => r.json())
      .then(d => {
        setInfo({
          whatsapp_number: d.whatsapp_number || '',
          gps_lat: d.gps_lat ?? null,
          gps_lng: d.gps_lng ?? null,
          address: d.address || '',
          is_online_payment_enabled: !!d.is_online_payment_enabled,
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const getLocation = () => {
    if (!navigator.geolocation) { toast.error('المتصفح لا يدعم تحديد الموقع'); return }
    setGettingGps(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setInfo(prev => ({ ...prev, gps_lat: pos.coords.latitude, gps_lng: pos.coords.longitude }))
        setGettingGps(false)
        toast.success('تم تحديد الموقع')
      },
      () => { toast.error('فشل تحديد الموقع'); setGettingGps(false) },
      { enableHighAccuracy: true }
    )
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/branch-info', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(info),
      })
      if (res.ok) toast.success('تم الحفظ')
      else toast.error('خطأ في الحفظ')
    } catch { toast.error('خطأ') }
    setSaving(false)
  }

  if (loading) return <Skeleton />

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">معلومات المشروع</h2>

      {/* WhatsApp number */}
      <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">رقم واتساب الرئيسي</label>
        <input
          type="tel"
          value={info.whatsapp_number}
          onChange={e => setInfo(prev => ({ ...prev, whatsapp_number: e.target.value }))}
          placeholder="07XX XXXX XXX"
          dir="ltr"
          className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm font-num"
        />
        <p className="text-[10px] text-text-muted mt-1">يُستخدم لجميع رسائل واتساب</p>
      </div>

      {/* GPS */}
      <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">موقع المولدة (GPS)</label>
        <button
          onClick={getLocation}
          disabled={gettingGps}
          className="w-full h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-blue-soft text-blue-primary disabled:opacity-50 mb-2"
        >
          {gettingGps ? 'جاري تحديد الموقع...' : '📍 تحديد موقعي الحالي'}
        </button>
        {info.gps_lat && info.gps_lng && (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <div className="flex-1">
                <p className="text-[10px] text-text-muted">خط العرض</p>
                <p className="font-num text-xs">{info.gps_lat.toFixed(6)}</p>
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-text-muted">خط الطول</p>
                <p className="font-num text-xs">{info.gps_lng.toFixed(6)}</p>
              </div>
            </div>
            <a
              href={`https://maps.google.com/?q=${info.gps_lat},${info.gps_lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 h-9 rounded-xl text-xs font-bold bg-bg-muted text-blue-primary"
            >
              🗺️ فتح الخريطة
            </a>
          </div>
        )}
      </div>

      {/* Address */}
      <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">عنوان المولدة</label>
        <input
          type="text"
          value={info.address}
          onChange={e => setInfo(prev => ({ ...prev, address: e.target.value }))}
          placeholder="مثال: حي الكرادة، شارع 52"
          className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm"
        />
      </div>

      {/* Online payment master toggle (per-branch kill switch). When off,
          subscriber portal hides all gateway buttons regardless of which
          gateways the tenant has configured. */}
      <button
        type="button"
        onClick={() => setInfo(prev => ({ ...prev, is_online_payment_enabled: !prev.is_online_payment_enabled }))}
        className="bg-bg-surface rounded-2xl p-4 w-full flex items-center justify-between text-right"
        style={{ boxShadow: 'var(--shadow-md)' }}
      >
        <div className="flex-1 pr-3">
          <p className="text-sm font-bold text-text-primary mb-0.5">الدفع الإلكتروني عبر تطبيق المشترك</p>
          <p className="text-[11px] text-text-muted leading-relaxed">
            عند تفعيله، يرى المشترك أزرار الدفع (Qi / AsiaPay / ZainCash) إذا كانت بياناتك مسجَّلة في
            <span className="text-blue-primary font-medium">{' '}بوابات الدفع</span>.
          </p>
        </div>
        <div
          className="w-12 h-7 rounded-full relative transition-colors flex-shrink-0"
          style={{ background: info.is_online_payment_enabled ? '#1B4FD8' : '#CBD5E1' }}
        >
          <div
            className="absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all shadow"
            style={{ [info.is_online_payment_enabled ? 'right' : 'left']: '2px' }}
          />
        </div>
      </button>

      {/* Save */}
      <button
        onClick={save}
        disabled={saving}
        className="w-full h-11 rounded-xl text-white font-bold text-sm disabled:opacity-60"
        style={{ background: 'linear-gradient(135deg, #1B4FD8, #7C3AED)' }}
      >
        {saving ? 'جاري الحفظ...' : 'حفظ معلومات المشروع'}
      </button>
    </div>
  )
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION D: WhatsApp
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function WhatsappSection() {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">إعدادات واتساب</h2>
      <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">إرسال التقارير عبر واتساب</p>
          <ToggleSwitch defaultOn={false} onChange={() => {}} />
        </div>
        <div className="space-y-2">
          <p className="text-xs text-text-muted">المستلم</p>
          <select className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm">
            <option value="owner">المالك</option>
            <option value="accountant">المحاسب</option>
            <option value="custom">رقم مخصص</option>
          </select>
          <p className="text-xs text-text-muted">وقت الإرسال التلقائي</p>
          <input type="time" defaultValue="23:00" className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm" dir="ltr" />
        </div>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION E: Staff Management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function StaffSection({ plan }: { plan: string }) {
  const [staff, setStaff] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const isGold = isGoldOrHigher(plan)

  function refresh() {
    fetch('/api/staff').then(r => r.json()).then(d => setStaff(d.staff || []))
  }

  async function deactivateStaff(id: string, name: string) {
    if (!confirm(`تعطيل ${name}؟`)) return
    try {
      const res = await fetch(`/api/staff/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      })
      if (!res.ok) throw new Error()
      toast.success('تم تعطيل الموظف')
      refresh()
    } catch {
      toast.error('خطأ في تعطيل الموظف')
    }
  }

  useEffect(() => {
    fetch('/api/staff')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => { setStaff(d.staff || []); setLoading(false) })
      .catch(() => { setStaff([]); setLoading(false) })
  }, [])

  const roleLabel: Record<string, string> = {
    collector: 'جابي', operator: 'مشغل', accountant: 'محاسب', cashier: 'أمين صندوق',
  }

  if (loading) return <Skeleton />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">إدارة الموظفين</h2>
        <button onClick={() => setShowAdd(true)} className="h-8 px-3 rounded-xl bg-blue-primary text-white text-xs font-bold">
          + موظف جديد
        </button>
      </div>

      {(['collector', 'operator', 'accountant', 'cashier'] as const).map(role => {
        const roleStaff = staff.filter(s => s.role === role)
        if (roleStaff.length === 0 && ((role === 'accountant' || role === 'cashier') && !isGold)) return null

        return (
          <div key={role}>
            <p className="text-xs font-bold text-text-muted mb-2 flex items-center gap-1">
              {roleLabel[role]}
              {(role === 'accountant' || role === 'cashier') && !isGold && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gold-soft text-gold">Gold+</span>
              )}
            </p>
            {roleStaff.length === 0 ? (
              <p className="text-xs text-text-muted/50 mb-2">لا يوجد</p>
            ) : roleStaff.map(s => (
              <div key={s.id} className={`bg-bg-surface rounded-2xl p-3 mb-2 flex items-center justify-between ${!s.is_active ? 'opacity-50' : ''}`} style={{ boxShadow: 'var(--shadow-sm)' }}>
                {/* Staff avatar */}
                <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center shrink-0 ml-2.5" style={{ background: 'var(--bg-muted)' }}>
                  {s.photo_url ? (
                    <img src={s.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>{s.name?.charAt(0)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${s.is_active ? 'bg-success' : 'bg-danger'}`} />
                    <p className="text-sm font-bold truncate">{s.name}</p>
                    {!s.is_active && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-danger/10 text-danger shrink-0">معطّل</span>}
                  </div>
                  <p className="text-xs text-text-muted mr-3.5">{s.phone || '—'}</p>
                  {s.is_owner_acting && <p className="text-[10px] text-gold font-bold mr-3.5">يُدار بواسطة المالك</p>}
                  {/* Permission summary */}
                  <div className="flex flex-wrap gap-1 mr-3.5 mt-0.5">
                    {s.role === 'collector' && s.collector_permission && (
                      <>
                        {s.collector_permission.can_give_discount && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-gold-soft text-gold">خصم</span>}
                        {s.collector_permission.require_shift_checkin && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-soft text-blue-primary">GPS</span>}
                        {s.can_operate && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-violet/10 text-violet">مشغل</span>}
                      </>
                    )}
                    {s.role === 'operator' && s.operator_permission && (
                      <>
                        {s.operator_permission.can_toggle_generator && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-success/10 text-success">تشغيل</span>}
                        {s.operator_permission.can_add_fuel && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-soft text-blue-primary">وقود</span>}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setEditingId(s.id)} className="w-7 h-7 rounded-lg bg-bg-muted flex items-center justify-center text-text-muted">
                    <Pencil size={12} />
                  </button>
                  {s.is_active && (
                    <button onClick={() => deactivateStaff(s.id, s.name)} className="w-7 h-7 rounded-lg bg-danger/10 flex items-center justify-center text-danger">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      })}

      {showAdd && <StaffFormModal mode="add" plan={plan} onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); refresh() }} />}
      {editingId && <StaffFormModal mode="edit" plan={plan} staffId={editingId} initialData={staff.find(s => s.id === editingId)} onClose={() => setEditingId(null)} onSuccess={() => { setEditingId(null); refresh() }} />}
    </div>
  )
}

function RolePermFields({ role, perms, onChange }: { role: string; perms: any; onChange: (p: any) => void }) {
  if (role === 'collector') {
    return (
      <div className="space-y-2 bg-bg-muted rounded-xl p-3">
        <p className="text-[10px] font-bold text-text-muted">صلاحيات الجابي</p>
        <div className="flex items-center justify-between">
          <span className="text-xs">يمنح خصومات</span>
          <ToggleSwitch defaultOn={perms.can_give_discount || false} onChange={v => onChange({ ...perms, can_give_discount: v })} />
        </div>
        {perms.can_give_discount && (
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-text-muted">الحد الأقصى (د.ع)</label>
              <input type="number" dir="ltr" value={perms.discount_max_amount || ''} onChange={e => onChange({ ...perms, discount_max_amount: Number(e.target.value) || 0 })}
                className="w-full h-8 px-2 rounded-lg border border-border bg-bg-base text-xs font-num" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-text-muted">المهلة (دقيقة)</label>
              <input type="number" dir="ltr" value={perms.discount_timeout_min || ''} onChange={e => onChange({ ...perms, discount_timeout_min: Number(e.target.value) || 15 })}
                className="w-full h-8 px-2 rounded-lg border border-border bg-bg-base text-xs font-num" />
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-text-muted">السياج الجغرافي (م)</label>
            <input type="number" dir="ltr" value={perms.geofence_radius_m || ''} onChange={e => onChange({ ...perms, geofence_radius_m: Number(e.target.value) || 2000 })}
              className="w-full h-8 px-2 rounded-lg border border-border bg-bg-base text-xs font-num" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-text-muted">الهدف اليومي</label>
            <input type="number" dir="ltr" value={perms.daily_target || ''} onChange={e => onChange({ ...perms, daily_target: Number(e.target.value) || 0 })}
              className="w-full h-8 px-2 rounded-lg border border-border bg-bg-base text-xs font-num" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-text-muted">وقت بدء العمل</label>
            <input type="time" value={perms.shift_start_time || ''} onChange={e => onChange({ ...perms, shift_start_time: e.target.value || null })}
              className="w-full h-8 px-2 rounded-lg border border-border bg-bg-base text-xs font-num" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-text-muted">وقت انتهاء العمل</label>
            <input type="time" value={perms.shift_end_time || ''} onChange={e => onChange({ ...perms, shift_end_time: e.target.value || null })}
              className="w-full h-8 px-2 rounded-lg border border-border bg-bg-base text-xs font-num" />
          </div>
        </div>
      </div>
    )
  }
  if (role === 'operator') {
    return (
      <div className="space-y-2 bg-bg-muted rounded-xl p-3">
        <p className="text-[10px] font-bold text-text-muted">صلاحيات المشغل</p>
        <div className="flex items-center justify-between">
          <span className="text-xs">تشغيل/إيقاف المولد</span>
          <ToggleSwitch defaultOn={perms.can_toggle_generator || false} onChange={v => onChange({ ...perms, can_toggle_generator: v })} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs">إضافة وقود</span>
          <ToggleSwitch defaultOn={perms.can_add_fuel ?? true} onChange={v => onChange({ ...perms, can_add_fuel: v })} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs">التحكم اليدوي</span>
          <ToggleSwitch defaultOn={perms.can_manual_mode || false} onChange={v => onChange({ ...perms, can_manual_mode: v })} />
        </div>
        <div>
          <label className="text-[10px] text-text-muted">السياج الجغرافي (م)</label>
          <input type="number" dir="ltr" value={perms.geofence_radius_m || ''} onChange={e => onChange({ ...perms, geofence_radius_m: Number(e.target.value) || 500 })}
            className="w-full h-8 px-2 rounded-lg border border-border bg-bg-base text-xs font-num" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-text-muted">وقت بدء العمل</label>
            <input type="time" value={perms.shift_start_time || ''} onChange={e => onChange({ ...perms, shift_start_time: e.target.value || null })}
              className="w-full h-8 px-2 rounded-lg border border-border bg-bg-base text-xs font-num" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-text-muted">وقت انتهاء العمل</label>
            <input type="time" value={perms.shift_end_time || ''} onChange={e => onChange({ ...perms, shift_end_time: e.target.value || null })}
              className="w-full h-8 px-2 rounded-lg border border-border bg-bg-base text-xs font-num" />
          </div>
        </div>
      </div>
    )
  }
  if (role === 'accountant') {
    return (
      <div className="space-y-2 bg-bg-muted rounded-xl p-3">
        <p className="text-[10px] font-bold text-text-muted">صلاحيات المحاسب</p>
        <div className="flex items-center justify-between">
          <span className="text-xs">يستلم نقداً (وصول POS)</span>
          <ToggleSwitch defaultOn={perms.can_collect || false} onChange={v => onChange({ ...perms, can_collect: v })} />
        </div>
      </div>
    )
  }
  return null
}

function StaffFormModal({ mode, plan, staffId, initialData, onClose, onSuccess }: {
  mode: 'add' | 'edit'; plan: string; staffId?: string; initialData?: any; onClose: () => void; onSuccess: () => void
}) {
  const isEdit = mode === 'edit'
  const isGold = isGoldOrHigher(plan)

  const [form, setForm] = useState(() => {
    if (isEdit && initialData) {
      return {
        name: initialData.name || '', phone: initialData.phone || '', pin: initialData.pin || '',
        is_owner_acting: initialData.is_owner_acting || false, is_active: initialData.is_active ?? true,
        can_collect: initialData.can_collect ?? true, can_operate: initialData.can_operate ?? true,
        branch_id: initialData.branch_id || '',
      }
    }
    return { name: '', phone: '', pin: '', is_owner_acting: false, is_active: true, can_collect: true, can_operate: true, branch_id: '' }
  })

  const [collectorPerms, setCollectorPerms] = useState<any>(() => {
    const cp = isEdit && initialData?.collector_permission ? { ...initialData.collector_permission } : {}
    return {
      can_give_discount: cp.can_give_discount ?? true,
      discount_max_amount: cp.discount_max_amount ?? 0,
      discount_timeout_min: cp.discount_timeout_min ?? 15,
      daily_target: cp.daily_target ?? 0,
      geofence_radius_m: cp.geofence_radius_m ?? 2000,
      shift_start_time: cp.shift_start_time ?? '',
      shift_end_time: cp.shift_end_time ?? '',
    }
  })

  const [operatorPerms, setOperatorPerms] = useState<any>(() => {
    const op = isEdit && initialData?.operator_permission ? { ...initialData.operator_permission } : {}
    return {
      can_toggle_generator: op.can_toggle_generator ?? true,
      can_add_fuel: op.can_add_fuel ?? true,
      can_log_hours: op.can_log_hours ?? true,
      can_manual_mode: op.can_manual_mode ?? false,
      shift_start_time: op.shift_start_time ?? '',
      shift_end_time: op.shift_end_time ?? '',
    }
  })

  const [branches, setBranches] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/branches').then(r => r.json()).then(d => {
      setBranches(d.branches || [])
      if (!isEdit && d.branches?.length === 1) setForm(f => ({ ...f, branch_id: d.branches[0].id }))
    })
  }, [isEdit])

  async function handleSubmit() {
    if (!form.name.trim()) { toast.error('الاسم مطلوب'); return }
    if (!form.phone.trim()) { toast.error('الهاتف مطلوب'); return }
    if (!form.pin || form.pin.length < 4) { toast.error('الرمز السري يجب أن يكون 4-6 أرقام'); return }
    if (!form.can_collect && !form.can_operate) { toast.error('يجب تفعيل صلاحية واحدة على الأقل'); return }

    // Auto-set role
    let role = 'collector'
    if (form.can_collect && form.can_operate) role = 'collector'
    else if (form.can_collect) role = 'collector'
    else if (form.can_operate) role = 'operator'

    setSaving(true)
    try {
      if (isEdit && staffId) {
        const body: any = { ...form, role, collector_permission: form.can_collect ? collectorPerms : undefined, operator_permission: form.can_operate ? operatorPerms : undefined }
        const res = await fetch(`/api/staff/${staffId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) throw new Error()
        toast.success('تم تحديث الموظف')
      } else {
        if (!form.branch_id) { toast.error('الفرع مطلوب'); setSaving(false); return }
        const body: any = { ...form, role }
        const res = await fetch('/api/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err?.error || 'فشل الإضافة') }
        const data = await res.json()
        // Save permissions
        const permBody: any = {}
        if (form.can_collect) permBody.collector_permission = collectorPerms
        if (form.can_operate) permBody.operator_permission = operatorPerms
        if (Object.keys(permBody).length > 0) {
          await fetch(`/api/staff/${data.staff.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(permBody) })
        }
        toast.success('تم إضافة الموظف')
      }
      onSuccess()
    } catch (err: any) { toast.error(err.message || 'خطأ في الحفظ') }
    setSaving(false)
  }

  // Shared shift times
  const shiftStart = form.can_collect ? collectorPerms.shift_start_time : operatorPerms.shift_start_time
  const shiftEnd = form.can_collect ? collectorPerms.shift_end_time : operatorPerms.shift_end_time
  const setShift = (start: string, end: string) => {
    if (form.can_collect) setCollectorPerms((p: any) => ({ ...p, shift_start_time: start, shift_end_time: end }))
    if (form.can_operate) setOperatorPerms((p: any) => ({ ...p, shift_start_time: start, shift_end_time: end }))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      {/* Dark overlay */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />

      {/* Sheet */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '390px', height: '90vh', background: 'white', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', zIndex: 1 }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button onClick={onClose} style={{ color: '#64748B', background: 'none', border: 'none', fontSize: '15px', cursor: 'pointer' }}>إلغاء</button>
          <span style={{ fontWeight: 700, fontSize: 17 }}>{isEdit ? 'تعديل الموظف' : 'موظف جديد'}</span>
          <div style={{ width: 40 }} />
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto' as const, padding: '16px 20px', WebkitOverflowScrolling: 'touch' as any }}>
        <div className="space-y-4">
          {/* Section 1: Basic info */}
          <div>
            <p className="text-[10px] font-bold text-text-muted pb-1 mb-2" style={{ borderBottom: '1px solid var(--border)' }}>المعلومات الأساسية</p>
            <div className="space-y-2">
              <input type="text" placeholder="الاسم *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm" />
              <input type="tel" placeholder="الهاتف *" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} dir="ltr"
                className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm font-num" style={{ textAlign: 'right' }} />
              <input type="text" placeholder="الرمز السري (4-6 أرقام) *" value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value }))} dir="ltr" maxLength={6}
                className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm font-num" style={{ textAlign: 'right' }} />
              {!isEdit && branches.length > 1 && (
                <select value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm">
                  <option value="">اختر الفرع</option>
                  {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              <div className="flex items-center justify-between py-1">
                <span className="text-xs">أدير هذا الدور بنفسي</span>
                <ToggleSwitch defaultOn={form.is_owner_acting} onChange={v => setForm(f => ({ ...f, is_owner_acting: v }))} />
              </div>
              {isEdit && (
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs">نشط</span>
                  <ToggleSwitch defaultOn={form.is_active} onChange={v => setForm(f => ({ ...f, is_active: v }))} />
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Permission toggles */}
          <div className="rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '4px 12px' }}>
            <p className="text-[10px] font-bold text-text-muted py-2">ماذا يستطيع هذا الموظف؟</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="text-xs font-medium">يحصّل 💳</span>
              <ToggleSwitch defaultOn={form.can_collect} onChange={v => setForm(f => ({ ...f, can_collect: v }))} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="text-xs font-medium">يشغّل ⚡</span>
              <ToggleSwitch defaultOn={form.can_operate} onChange={v => setForm(f => ({ ...f, can_operate: v }))} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium">يحاسب 📊</span>
                {!isGold && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-gold-soft text-gold font-bold">Gold+</span>}
              </div>
              <ToggleSwitch defaultOn={false} onChange={() => { if (!isGold) toast.error('يتطلب باقة Gold أو أعلى') }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium">صندوق 💰</span>
                {!isGold && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-gold-soft text-gold font-bold">Gold+</span>}
              </div>
              <ToggleSwitch defaultOn={false} onChange={() => { if (!isGold) toast.error('يتطلب باقة Gold أو أعلى') }} />
            </div>
            {form.can_collect && form.can_operate && (
              <p className="text-[10px] text-blue-primary font-bold py-2 text-center">هذا الموظف جابي ومشغل في نفس الوقت</p>
            )}
          </div>

          {/* Section 3: Shift times (shared) */}
          {(form.can_collect || form.can_operate) && (
            <div>
              <p className="text-[10px] font-bold text-text-muted pb-1 mb-2" style={{ borderBottom: '1px solid var(--border)' }}>إعدادات العمل</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-text-muted">وقت بدء العمل</label>
                  <input type="time" value={shiftStart} onChange={e => setShift(e.target.value, shiftEnd)}
                    className="w-full h-8 px-2 rounded-lg border border-border bg-bg-base text-xs font-num" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-text-muted">وقت انتهاء العمل</label>
                  <input type="time" value={shiftEnd} onChange={e => setShift(shiftStart, e.target.value)}
                    className="w-full h-8 px-2 rounded-lg border border-border bg-bg-base text-xs font-num" />
                </div>
              </div>
              <div className="mt-2">
                <label className="text-[10px] text-text-muted">السياج الجغرافي (م)</label>
                <input type="number" dir="ltr" value={collectorPerms.geofence_radius_m} onChange={e => setCollectorPerms((p: any) => ({ ...p, geofence_radius_m: Number(e.target.value) || 2000 }))}
                  className="w-full h-8 px-2 rounded-lg border border-border bg-bg-base text-xs font-num" />
              </div>
            </div>
          )}

          {/* Section 4: Collector permissions */}
          {form.can_collect && (
            <div>
              <p className="text-[10px] font-bold text-text-muted pb-1 mb-2" style={{ borderBottom: '1px solid var(--border)' }}>صلاحيات التحصيل</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs">يمنح خصومات</span>
                  <ToggleSwitch defaultOn={collectorPerms.can_give_discount} onChange={v => setCollectorPerms((p: any) => ({ ...p, can_give_discount: v }))} />
                </div>
                {collectorPerms.can_give_discount && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-text-muted">الحد الأقصى (د.ع)</label>
                      <input type="number" dir="ltr" value={collectorPerms.discount_max_amount || ''} onChange={e => setCollectorPerms((p: any) => ({ ...p, discount_max_amount: Number(e.target.value) || 0 }))}
                        className="w-full h-8 px-2 rounded-lg border border-border bg-bg-base text-xs font-num" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-text-muted">المهلة (دقيقة)</label>
                      <input type="number" dir="ltr" value={collectorPerms.discount_timeout_min || ''} onChange={e => setCollectorPerms((p: any) => ({ ...p, discount_timeout_min: Number(e.target.value) || 15 }))}
                        className="w-full h-8 px-2 rounded-lg border border-border bg-bg-base text-xs font-num" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-[10px] text-text-muted">الهدف اليومي (0 = بدون)</label>
                  <input type="number" dir="ltr" value={collectorPerms.daily_target || ''} onChange={e => setCollectorPerms((p: any) => ({ ...p, daily_target: Number(e.target.value) || 0 }))}
                    className="w-full h-8 px-2 rounded-lg border border-border bg-bg-base text-xs font-num" />
                </div>
              </div>
            </div>
          )}

          {/* Section 5: Operator permissions */}
          {form.can_operate && (
            <div>
              <p className="text-[10px] font-bold text-text-muted pb-1 mb-2" style={{ borderBottom: '1px solid var(--border)' }}>صلاحيات التشغيل</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs">يشغّل/يوقف المولد</span>
                  <ToggleSwitch defaultOn={operatorPerms.can_toggle_generator} onChange={v => setOperatorPerms((p: any) => ({ ...p, can_toggle_generator: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs">يضيف وقود</span>
                  <ToggleSwitch defaultOn={operatorPerms.can_add_fuel} onChange={v => setOperatorPerms((p: any) => ({ ...p, can_add_fuel: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs">يسجّل ساعات التشغيل</span>
                  <ToggleSwitch defaultOn={operatorPerms.can_log_hours} onChange={v => setOperatorPerms((p: any) => ({ ...p, can_log_hours: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-danger font-bold">التحكم اليدوي (خطير)</span>
                  <ToggleSwitch defaultOn={operatorPerms.can_manual_mode} onChange={v => setOperatorPerms((p: any) => ({ ...p, can_manual_mode: v }))} />
                </div>
              </div>
            </div>
          )}

        </div>
        </div>

        {/* Fixed footer with save button */}
        <div style={{ padding: '12px 20px 56px', borderTop: '1px solid #eee', background: 'white', flexShrink: 0 }}>
          <button type="button" onClick={handleSubmit} disabled={saving}
            style={{ width: '100%', padding: '16px', background: saving ? '#93a3b8' : '#1B4FD8', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة الموظف'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION L: Subscriber App
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SubscriberAppSettingsSection() {
  const [wizardStep, setWizardStep] = useState(0)
  const [wizardCompleted, setWizardCompleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({
    primary_color: '#1B4FD8',
    welcome_message: '',
    is_active: false,
  })

  const colors = ['#1B4FD8', '#7C3AED', '#059669', '#DC2626', '#D97706', '#0891B2']

  useEffect(() => {
    // Check if wizard was completed
    const completed = localStorage.getItem('subscriber_app_wizard_completed') === 'true'
    setWizardCompleted(completed)

    // Fetch current settings
    fetch('/api/settings/subscriber-app')
      .then(r => r.json())
      .then(d => {
        if (d.settings) {
          setSettings({
            primary_color: d.settings.primary_color || '#1B4FD8',
            welcome_message: d.settings.welcome_message || '',
            is_active: d.settings.is_active ?? false,
          })
          if (d.settings.is_active) setWizardCompleted(true)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const saveSettings = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/subscriber-app', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) toast.success('تم الحفظ')
      else toast.error('خطأ في الحفظ')
    } catch { toast.error('خطأ') }
    setSaving(false)
  }

  const completeWizard = async () => {
    await saveSettings()
    localStorage.setItem('subscriber_app_wizard_completed', 'true')
    setWizardCompleted(true)
    setWizardStep(0)
  }

  if (loading) return <Skeleton />

  // Show wizard only for first-time setup
  if (!wizardCompleted && !settings.is_active) {
    return (
      <div className="space-y-4">
        <h2 className="text-base font-bold">إعداد تطبيق المشتركين</h2>

        {/* Progress bar */}
        <div className="flex gap-1">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex-1 h-1.5 rounded-full" style={{ background: wizardStep >= s - 1 ? 'var(--blue-primary)' : 'var(--bg-muted)' }} />
          ))}
        </div>

        {wizardStep === 0 && (
          <div className="space-y-4">
            <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
              <p className="text-sm font-bold mb-3">اختر لون تطبيقك</p>
              <div className="grid grid-cols-6 gap-2 mb-4">
                {colors.map(c => (
                  <button key={c} onClick={() => setSettings(s => ({ ...s, primary_color: c }))}
                    className="w-10 h-10 rounded-xl transition-all" style={{
                      background: c,
                      border: settings.primary_color === c ? '3px solid var(--text-primary)' : '3px solid transparent',
                      boxShadow: settings.primary_color === c ? `0 0 12px ${c}40` : 'none',
                    }} />
                ))}
              </div>
              {/* Preview */}
              <div className="rounded-xl p-4 text-white text-center" style={{ background: settings.primary_color }}>
                <p className="text-xs opacity-80 mb-1">معاينة التطبيق</p>
                <p className="text-sm font-bold">فاتورة شهر 3 — مارس</p>
                <p className="font-num text-2xl font-bold mt-1">25,000 <span className="text-xs">د.ع</span></p>
              </div>
            </div>
            <button onClick={() => setWizardStep(1)}
              className="w-full h-11 rounded-xl text-white font-bold text-sm" style={{ background: 'var(--blue-primary)' }}>
              التالي &rarr;
            </button>
          </div>
        )}

        {wizardStep === 1 && (
          <div className="space-y-4">
            <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
              <p className="text-sm font-bold mb-3">رسالة الترحيب</p>
              <textarea
                value={settings.welcome_message}
                onChange={e => setSettings(s => ({ ...s, welcome_message: e.target.value }))}
                rows={3}
                placeholder="مرحباً بك في تطبيق المولدة — يمكنك متابعة فاتورتك وحالة المولدة من هنا"
                className="w-full px-3 py-2 rounded-xl border border-border bg-bg-base text-sm resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setWizardStep(0)} className="flex-1 h-11 rounded-xl bg-bg-muted text-text-secondary text-sm font-bold">&larr; السابق</button>
              <button onClick={() => setWizardStep(2)} className="flex-1 h-11 rounded-xl text-white font-bold text-sm" style={{ background: 'var(--blue-primary)' }}>التالي &rarr;</button>
            </div>
          </div>
        )}

        {wizardStep === 2 && (
          <div className="space-y-4">
            <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
              <p className="text-sm font-bold mb-2">الدفع الإلكتروني (اختياري)</p>
              <p className="text-xs text-text-muted mb-3">فعّل الدفع الإلكتروني ليدفع مشتركوك بالبطاقة</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setWizardStep(3)} className="flex-1 h-11 rounded-xl bg-bg-muted text-text-muted text-sm font-bold">تفعيل لاحقاً</button>
              <button onClick={() => { setWizardStep(3) }} className="flex-1 h-11 rounded-xl text-white font-bold text-sm" style={{ background: 'var(--blue-primary)' }}>إعداد الآن &rarr;</button>
            </div>
          </div>
        )}

        {wizardStep === 3 && (
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ background: 'rgba(5,150,105,0.1)' }}>
              <span className="text-3xl">🎉</span>
            </div>
            <h3 className="text-base font-bold">جاهز!</h3>
            <p className="text-xs text-text-muted">تم إعداد تطبيق المشتركين بنجاح</p>
            {/* Preview card */}
            <div className="rounded-xl p-4 text-white" style={{ background: settings.primary_color }}>
              <p className="text-sm font-bold">{settings.welcome_message || 'مرحباً بك'}</p>
            </div>
            <button onClick={completeWizard} disabled={saving}
              className="w-full h-11 rounded-xl text-white font-bold text-sm disabled:opacity-60" style={{ background: 'var(--blue-primary)' }}>
              {saving ? 'جاري...' : 'إنهاء الإعداد'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // Normal settings view (after wizard)
  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">تطبيق المشتركين</h2>

      <div className="bg-bg-surface rounded-2xl p-4 space-y-3" style={{ boxShadow: 'var(--shadow-md)' }}>
        {/* Color */}
        <div>
          <p className="text-xs font-medium text-text-secondary mb-1.5">لون التطبيق</p>
          <div className="flex gap-2">
            {colors.map(c => (
              <button key={c} onClick={() => setSettings(s => ({ ...s, primary_color: c }))}
                className="w-8 h-8 rounded-lg" style={{
                  background: c,
                  border: settings.primary_color === c ? '3px solid var(--text-primary)' : '2px solid transparent',
                }} />
            ))}
          </div>
        </div>

        {/* Welcome message */}
        <div>
          <p className="text-xs font-medium text-text-secondary mb-1">رسالة الترحيب</p>
          <textarea value={settings.welcome_message}
            onChange={e => setSettings(s => ({ ...s, welcome_message: e.target.value }))}
            rows={2} className="w-full px-3 py-2 rounded-xl border border-border bg-bg-base text-sm resize-none" />
        </div>

        <button onClick={saveSettings} disabled={saving}
          className="w-full h-10 rounded-xl text-white font-bold text-sm disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #1B4FD8, #7C3AED)' }}>
          {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
        </button>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION M: POS Devices
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function PosDevicesSection() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">أجهزة POS</h2>
        <button className="h-8 px-3 rounded-xl bg-blue-primary text-white text-xs font-bold">+ إضافة جهاز</button>
      </div>
      <div className="bg-bg-surface rounded-2xl p-4 text-center" style={{ boxShadow: 'var(--shadow-md)' }}>
        <Monitor size={32} className="text-text-muted mx-auto mb-2" />
        <p className="text-xs text-text-muted">لا توجد أجهزة مسجلة</p>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION N: Operator Management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function OperatorsSection() {
  const [staff, setStaff] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/staff').then(r => r.json()).then(d => {
      setStaff((d.staff || []).filter((s: any) => s.role === 'operator'))
      setLoading(false)
    })
  }, [])

  if (loading) return <Skeleton />

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">إدارة المشغلين</h2>
      {staff.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-4">لا يوجد مشغلون</p>
      ) : staff.map(s => (
        <div key={s.id} className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold">{s.name}</p>
            <span className={`w-3 h-3 rounded-full ${s.is_active ? 'bg-success' : 'bg-text-muted'}`} />
          </div>
          {s.operator_permission && (
            <div className="space-y-2">
              <PermToggle label="تسجيل الساعات" value={s.operator_permission.can_log_hours} />
              <PermToggle label="إضافة وقود" value={s.operator_permission.can_add_fuel} />
              <PermToggle label="تشغيل/إيقاف المولد" value={s.operator_permission.can_toggle_generator} />
              <PermToggle label="التحكم اليدوي" value={s.operator_permission.can_manual_mode} />
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">نطاق السياج الجغرافي</span>
                <span className="font-num text-xs font-bold">{s.operator_permission.geofence_radius_m}م</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION O: Staff Tracking
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function StaffTrackingSection() {
  const [staff, setStaff] = useState<any[]>([])
  const [tab, setTab] = useState<'collectors' | 'map' | 'attendance'>('collectors')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/staff').then(r => r.json()).then(d => {
      setStaff((d.staff || []).filter((s: any) => s.role === 'collector'))
      setLoading(false)
    })
  }, [])

  if (loading) return <Skeleton />

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">تتبع الموظفين</h2>

      {/* Tabs */}
      <div className="flex bg-bg-muted rounded-xl p-1">
        {([
          { key: 'collectors', label: 'الجباة' },
          { key: 'map', label: 'الخريطة' },
          { key: 'attendance', label: 'الحضور' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
              tab === t.key ? 'bg-bg-surface text-blue-primary shadow-sm' : 'text-text-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'collectors' && (
        <div className="space-y-2">
          {staff.map(s => (
            <div key={s.id} className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <p className="text-sm font-bold mb-2">{s.name}</p>
              {s.collector_permission && (
                <div className="space-y-2">
                  <PermToggle label="يمنح خصومات" value={s.collector_permission.can_give_discount} />
                  {s.collector_permission.can_give_discount && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-secondary">الحد الأقصى</span>
                      <span className="font-num text-xs font-bold">{Number(s.collector_permission.discount_max_amount).toLocaleString()} د.ع</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">السياج الجغرافي</span>
                    <span className="font-num text-xs font-bold">{s.collector_permission.geofence_radius_m}م</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">الهدف اليومي</span>
                    <span className="font-num text-xs font-bold">{s.collector_permission.daily_target}</span>
                  </div>
                  <PermToggle label="كشف الاحتيال" value={s.collector_permission.fraud_detection} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'map' && (
        <Link href="/staff/staff-tracking"
          className="bg-bg-surface rounded-2xl p-6 text-center block" style={{ boxShadow: 'var(--shadow-md)' }}>
          <MapPin size={32} className="text-blue-primary mx-auto mb-2" />
          <p className="text-sm font-bold text-text-primary mb-1">خريطة تتبع الجباة</p>
          <p className="text-xs text-text-muted">اضغط لفتح صفحة التتبع التفصيلية مع التوقفات والتقارير اليومية</p>
        </Link>
      )}

      {tab === 'attendance' && (
        <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
          <p className="text-xs text-text-muted text-center py-4">سجل الحضور — آخر 30 يوم</p>
        </div>
      )}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION P: Discounts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function DiscountsSection() {
  const [tab, setTab] = useState<'subscriber' | 'amper'>('subscriber')
  const [discounts, setDiscounts] = useState<any[]>([])
  const [tenantDiscounts, setTenantDiscounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/discounts/subscriber').then(r => r.json()),
    ]).then(([sub]) => {
      setDiscounts(sub.discounts || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton />

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">الخصومات</h2>

      <div className="flex bg-bg-muted rounded-xl p-1">
        <button onClick={() => setTab('subscriber')}
          className={`flex-1 py-2 text-xs font-medium rounded-lg ${tab === 'subscriber' ? 'bg-bg-surface text-blue-primary shadow-sm' : 'text-text-muted'}`}>
          خصومات المشتركين
        </button>
        <button onClick={() => setTab('amper')}
          className={`flex-1 py-2 text-xs font-medium rounded-lg ${tab === 'amper' ? 'bg-bg-surface text-blue-primary shadow-sm' : 'text-text-muted'}`}>
          خصومات أمبير
        </button>
      </div>

      {tab === 'subscriber' && (
        <>
          <button className="w-full h-9 rounded-xl bg-blue-soft text-blue-primary text-xs font-bold">+ إضافة خصم</button>
          {discounts.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">لا توجد خصومات نشطة</p>
          ) : discounts.map(d => (
            <div key={d.id} className="bg-bg-surface rounded-2xl p-3 flex items-center justify-between" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div>
                <p className="text-sm font-medium">{d.subscriber?.name || 'عام'}</p>
                <p className="text-xs text-text-muted">{d.reason || '—'}</p>
              </div>
              <span className="font-num text-sm font-bold text-success">
                {d.discount_type === 'pct' ? `${Number(d.discount_value)}%` : `${Number(d.discount_value).toLocaleString()} د.ع`}
              </span>
            </div>
          ))}
        </>
      )}

      {tab === 'amper' && (
        <div className="bg-bg-surface rounded-2xl p-4 text-center" style={{ boxShadow: 'var(--shadow-md)' }}>
          <p className="text-xs text-text-muted">الخصومات الممنوحة من فريق أمبير (للقراءة فقط)</p>
        </div>
      )}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Theme Section
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Alleys Section
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function AlleysSection() {
  const [alleys, setAlleys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState<any[]>([])
  const [activeBranch, setActiveBranch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addOrder, setAddOrder] = useState('0')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editOrder, setEditOrder] = useState('0')

  useEffect(() => {
    fetch('/api/branches').then(r => r.json()).then(d => {
      const b = d.branches || []
      setBranches(b)
      if (b.length > 0) setActiveBranch(b[0].id)
    })
  }, [])

  useEffect(() => {
    if (!activeBranch) return
    setLoading(true)
    fetch(`/api/alleys?branch_id=${activeBranch}`)
      .then(r => r.json())
      .then(d => { setAlleys(d.alleys || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [activeBranch])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/alleys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), branch_id: activeBranch, sort_order: parseInt(addOrder) || 0 }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      toast.success('تم إضافة الزقاق')
      setAddName(''); setAddOrder('0'); setShowAdd(false)
      // Refresh
      const d = await fetch(`/api/alleys?branch_id=${activeBranch}`).then(r => r.json())
      setAlleys(d.alleys || [])
    } catch (err: any) { toast.error(err.message || 'خطأ') }
    setSaving(false)
  }

  async function handleEdit(id: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/alleys/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), sort_order: parseInt(editOrder) || 0 }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      toast.success('تم التحديث')
      setEditId(null)
      const d = await fetch(`/api/alleys?branch_id=${activeBranch}`).then(r => r.json())
      setAlleys(d.alleys || [])
    } catch (err: any) { toast.error(err.message || 'خطأ') }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/alleys/${id}`, { method: 'DELETE' })
      toast.success('تم الحذف')
      setAlleys(prev => prev.filter(a => a.id !== id))
    } catch { toast.error('خطأ في الحذف') }
  }

  if (loading) return <Skeleton />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">الأزقة</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="h-8 px-3 rounded-xl bg-blue-primary text-white text-xs font-bold flex items-center gap-1"
        >
          <Plus size={13} /> إضافة زقاق
        </button>
      </div>

      {/* Branch selector if multiple */}
      {branches.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {branches.map((b: any) => (
            <button
              key={b.id}
              onClick={() => setActiveBranch(b.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${
                activeBranch === b.id ? 'bg-blue-primary text-white' : 'bg-bg-surface text-text-muted border border-border'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-bg-surface rounded-2xl p-4 space-y-3" style={{ boxShadow: 'var(--shadow-md)' }}>
          <input
            type="text"
            value={addName}
            onChange={e => setAddName(e.target.value)}
            placeholder="اسم الزقاق (مثال: زقاق 5)"
            className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm focus:outline-none focus:border-blue-primary"
            autoFocus
          />
          <input
            type="number"
            value={addOrder}
            onChange={e => setAddOrder(e.target.value)}
            placeholder="الترتيب"
            dir="ltr"
            className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm font-num focus:outline-none focus:border-blue-primary"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="flex-1 h-9 rounded-xl bg-bg-muted text-text-secondary text-xs font-bold">إلغاء</button>
            <button type="submit" disabled={saving || !addName.trim()} className="flex-1 h-9 rounded-xl bg-blue-primary text-white text-xs font-bold disabled:opacity-60">
              {saving ? 'جاري الحفظ...' : 'إضافة'}
            </button>
          </div>
        </form>
      )}

      {/* Alleys list */}
      {alleys.length === 0 ? (
        <p className="text-center text-text-muted text-sm py-4">لا توجد أزقة — أضف أزقة لتنظيم المشتركين</p>
      ) : (
        <div className="space-y-2">
          {alleys.map(a => (
            <div key={a.id} className="bg-bg-surface rounded-2xl p-3.5 flex items-center gap-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
              {editId === a.id ? (
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-border bg-bg-base text-sm"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number" dir="ltr"
                      value={editOrder}
                      onChange={e => setEditOrder(e.target.value)}
                      className="w-20 h-9 px-2 rounded-lg border border-border bg-bg-base text-sm font-num"
                      placeholder="ترتيب"
                    />
                    <button onClick={() => setEditId(null)} className="h-9 px-3 rounded-lg bg-bg-muted text-text-muted text-xs font-bold">إلغاء</button>
                    <button onClick={() => handleEdit(a.id)} disabled={saving} className="h-9 px-3 rounded-lg bg-blue-primary text-white text-xs font-bold disabled:opacity-60">حفظ</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-8 h-8 rounded-lg bg-bg-muted flex items-center justify-center shrink-0">
                    <span className="font-num text-xs text-text-muted">{a.sort_order}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">{a.name}</p>
                    <p className="text-[10px] text-text-muted">{a._count?.subscribers || 0} مشترك</p>
                  </div>
                  <button
                    onClick={() => { setEditId(a.id); setEditName(a.name); setEditOrder(String(a.sort_order)) }}
                    className="w-8 h-8 rounded-lg bg-bg-muted flex items-center justify-center text-text-muted"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="w-8 h-8 rounded-lg bg-danger/10 flex items-center justify-center text-danger"
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ThemeSection() {
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('amper-theme') as any) || 'auto'
    }
    return 'auto'
  })

  function changeTheme(t: 'auto' | 'light' | 'dark') {
    setTheme(t)
    localStorage.setItem('amper-theme', t)
  }

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">المظهر</h2>
      <div className="bg-bg-surface rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-md)' }}>
        {([
          { key: 'auto', label: 'تلقائي' },
          { key: 'light', label: 'فاتح' },
          { key: 'dark', label: 'داكن' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => changeTheme(t.key)}
            className="w-full px-4 py-3.5 flex items-center justify-between border-b border-border last:border-0"
          >
            <span className="text-sm">{t.label}</span>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              theme === t.key ? 'border-blue-primary' : 'border-border'
            }`}>
              {theme === t.key && <div className="w-3 h-3 rounded-full bg-blue-primary" />}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shared Components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ToggleSwitch({ defaultOn, onChange }: { defaultOn: boolean; onChange: (v: boolean) => void }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <button
      type="button"
      onClick={() => { setOn(!on); onChange(!on) }}
      className={`w-10 h-6 rounded-full transition-all relative ${on ? 'bg-blue-primary' : 'bg-border'}`}
    >
      <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
        on ? 'left-1' : 'right-1'
      }`} />
    </button>
  )
}

function PermToggle({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className={`text-xs font-bold ${value ? 'text-success' : 'text-text-muted'}`}>
        {value ? '✓' : '✗'}
      </span>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-8 w-32" />
      <div className="skeleton h-32 rounded-2xl" />
      <div className="skeleton h-24 rounded-2xl" />
    </div>
  )
}

function BranchesSection({ isFleet }: { isFleet: boolean }) {
  return <div className="space-y-3"><h2 className="text-base font-bold">إدارة الفروع</h2><p className="text-sm text-text-muted">قريباً</p></div>
}

function KioskSection() {
  return <div className="space-y-3"><h2 className="text-base font-bold">شاشة الكيوسك</h2><p className="text-sm text-text-muted">قريباً</p></div>
}
