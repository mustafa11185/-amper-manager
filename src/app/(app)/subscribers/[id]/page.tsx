'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  ArrowRight, CreditCard, ArrowUpCircle, ArrowDownCircle,
  MapPin, Phone as PhoneIcon, Tag, Link2, Pencil, X, Loader2,
  Copy, RefreshCw, MessageCircle, Trash2, AlertCircle,
} from 'lucide-react'
import { formatBillingMonth } from '@/lib/billing-months'
import toast from 'react-hot-toast'
import { openWhatsApp } from '@/lib/whatsapp'

type SubscriberDetail = {
  id: string
  serial_number: string
  name: string
  phone: string | null
  address: string | null
  alley: string | null
  governorate: string | null
  amperage: number
  subscription_type: string
  total_debt: number
  is_active: boolean
  gps_lat: number | null
  gps_lng: number | null
  created_at: string
  branch: { name: string }
  invoices: {
    id: string
    billing_month: number
    billing_year: number
    total_amount_due: number
    amount_paid: number
    is_fully_paid: boolean
  }[]
  discounts: {
    id: string
    discount_type: string
    discount_value: number
    reason: string | null
    is_active: boolean
  }[]
}

const MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']


export default function SubscriberDetailPage() {
  const params = useParams()
  const id = params?.id as string
  const router = useRouter()
  const { data: session } = useSession()
  const [sub, setSub] = useState<SubscriberDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<any>({})
  const [alleyOptions, setAlleyOptions] = useState<{ id: string; name: string }[]>([])
  const [editSaving, setEditSaving] = useState(false)

  function loadSub() {
    fetch(`/api/subscribers/${id}`)
      .then(r => r.json())
      .then(data => { setSub(data.subscriber); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadSub() }, [id])

  const role = session?.user?.role
  const isOwner = role === 'owner'
  const canEdit = isOwner || role === 'accountant'

  function openEdit() {
    if (!sub) return
    setEditForm({
      name: sub.name,
      phone: sub.phone || '',
      address: sub.address || '',
      alley: sub.alley || '',
      alley_id: (sub as any).alley_id || '',
      governorate: sub.governorate || '',
      amperage: String(Number(sub.amperage)),
      subscription_type: sub.subscription_type,
    })
    // Fetch alleys for branch
    fetch(`/api/alleys?branch_id=${(sub as any).branch_id || ''}`)
      .then(r => r.json())
      .then(d => setAlleyOptions((d.alleys || []).filter((a: any) => a.is_active)))
      .catch(() => setAlleyOptions([]))
    setEditing(true)
  }

  async function saveEdit() {
    setEditSaving(true)
    try {
      const res = await fetch(`/api/subscribers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          amperage: parseFloat(editForm.amperage),
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      toast.success('تم تحديث المشترك')
      setEditing(false)
      loadSub()
    } catch (err: any) {
      toast.error(err.message || 'خطأ في الحفظ')
    }
    setEditSaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-24" />
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
    )
  }

  if (!sub) {
    return <p className="text-center text-text-muted py-8">المشترك غير موجود</p>
  }

  async function handleUpgrade(type: 'gold' | 'normal') {
    try {
      const res = await fetch(`/api/subscribers/${id}/upgrade`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription_type: type }),
      })
      if (!res.ok) throw new Error()
      toast.success(type === 'gold' ? 'تمت الترقية للذهبي' : 'تم التخفيض للعادي')
      // Refresh from server
      const refreshRes = await fetch(`/api/subscribers/${id}`)
      const refreshData = await refreshRes.json()
      if (refreshData.subscriber) setSub(refreshData.subscriber)
      else setSub(prev => prev ? { ...prev, subscription_type: type } : prev)
    } catch {
      toast.error('خطأ في تغيير الاشتراك')
    }
  }

  return (
    <div className="space-y-3">
      {/* Back + Header */}
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-text-muted">
        <ArrowRight size={16} />
        المشتركون
      </button>

      {/* Subscriber Info Card */}
      <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-base font-bold">{sub.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={openEdit}
                className="w-8 h-8 rounded-lg bg-bg-muted flex items-center justify-center text-text-muted"
              >
                <Pencil size={14} />
              </button>
            )}
            <span className={`text-[11px] px-3 py-1 rounded-full font-bold ${
              sub.subscription_type === 'gold' ? 'bg-gold-soft text-gold' : 'bg-blue-soft text-blue-primary'
            }`}>
              {sub.subscription_type === 'gold' ? 'ذهبي' : 'عادي'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <InfoRow icon={Tag} label="أمبير" value={`${Number(sub.amperage)}`} />
          {sub.governorate && <InfoRow icon={MapPin} label="المحافظة" value={sub.governorate} />}
          {sub.phone && <InfoRow icon={PhoneIcon} label="الهاتف" value={sub.phone} />}
          {sub.alley && <InfoRow icon={MapPin} label="الزقاق" value={sub.alley} />}
        </div>

        {sub.gps_lat && sub.gps_lng ? (
          <a
            href={`https://maps.google.com/?q=${sub.gps_lat},${sub.gps_lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-1 text-xs text-blue-primary"
          >
            <MapPin size={12} /> 📍 الموقع على الخريطة
          </a>
        ) : (
          <p className="mt-2 text-[10px] text-text-muted flex items-center gap-1">
            <MapPin size={12} /> لا يوجد موقع محفوظ
          </p>
        )}
      </div>

      {/* Current month invoice + Debt */}
      {(() => {
        const currentInv = sub.invoices.find(i => !i.is_fully_paid)
        const monthDue = currentInv ? Number(currentInv.total_amount_due) - Number(currentInv.amount_paid) : 0
        return (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-bg-surface rounded-2xl p-3.5" style={{ boxShadow: 'var(--shadow-md)' }}>
              <p className="text-[10px] text-text-muted mb-1">المستحق هذا الشهر</p>
              <p className={`font-num text-xl font-bold ${monthDue > 0 ? 'text-blue-primary' : 'text-success'}`}>
                {monthDue.toLocaleString()}
                <span className="text-[10px] mr-0.5 text-text-muted">د.ع</span>
              </p>
              {currentInv && (
                <p className="text-[9px] text-text-muted mt-0.5">
                  {formatBillingMonth(currentInv.billing_month, currentInv.billing_year)}
                </p>
              )}
            </div>
            <div className="bg-bg-surface rounded-2xl p-3.5" style={{ boxShadow: 'var(--shadow-md)' }}>
              <p className="text-[10px] text-text-muted mb-1">الديون المتراكمة</p>
              <p className={`font-num text-xl font-bold ${Number(sub.total_debt) > 0 ? 'text-danger' : 'text-success'}`}>
                {Number(sub.total_debt).toLocaleString()}
                <span className="text-[10px] mr-0.5 text-text-muted">د.ع</span>
              </p>
            </div>
          </div>
        )
      })()}

      {/* Payment buttons */}
      <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/pos?subscriber=${sub.id}`)}
            className="flex-1 h-10 rounded-xl bg-blue-primary text-white text-xs font-bold flex items-center justify-center gap-1.5"
            style={{ boxShadow: '0 4px 20px rgba(27,79,216,0.25)' }}
          >
            <CreditCard size={14} />
            دفع فاتورة الشهر
          </button>
          {Number(sub.total_debt) > 0 && (
            <button
              onClick={() => router.push(`/pos?subscriber=${sub.id}&type=debt`)}
              className="flex-1 h-10 rounded-xl bg-danger/10 text-danger text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <CreditCard size={14} />
              دفع الديون
            </button>
          )}
        </div>
        {/* Discount only available via POS payment flow */}
      </div>

      {/* Subscriber app share */}
      <SubscriberShareSection subId={sub.id} subName={sub.name} subPhone={sub.phone} serial={sub.serial_number} isOwner={isOwner} />

      {/* Upgrade/Downgrade */}
      {isOwner && (
        <div className="flex gap-2">
          {sub.subscription_type === 'normal' ? (
            <button
              onClick={() => handleUpgrade('gold')}
              className="flex-1 h-10 rounded-xl bg-gold-soft text-gold text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <ArrowUpCircle size={14} />
              ترقية للذهبي
            </button>
          ) : (
            <button
              onClick={() => handleUpgrade('normal')}
              className="flex-1 h-10 rounded-xl bg-bg-muted text-text-secondary text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <ArrowDownCircle size={14} />
              تخفيض للعادي
            </button>
          )}
        </div>
      )}

      {/* Public Link (Gold+) */}
      {session?.user?.plan && session.user.plan !== 'basic' && sub.subscription_type === 'gold' && (
        <div className="bg-violet-soft/50 rounded-2xl p-3 flex items-center gap-2">
          <Link2 size={14} className="text-violet" />
          <p className="text-xs text-text-secondary flex-1">رابط المشترك العام</p>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/public/${sub.id}`)
              toast.success('تم نسخ الرابط')
            }}
            className="text-xs text-violet font-bold"
          >
            نسخ
          </button>
        </div>
      )}

      {/* Invoices */}
      <InvoicesSection invoices={sub.invoices} isOwner={isOwner} subscriberId={id} onRefresh={loadSub} />

      {/* Discounts */}
      {sub.discounts.length > 0 && (
        <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
          <h3 className="text-sm font-bold mb-3">الخصومات النشطة</h3>
          <div className="space-y-2">
            {sub.discounts.map(d => (
              <div key={d.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <p className="text-xs">{d.reason || 'خصم'}</p>
                <span className="font-num text-xs text-success font-bold">
                  {d.discount_type === 'pct' ? `${Number(d.discount_value)}%` : `${Number(d.discount_value).toLocaleString()} د.ع`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete subscriber — owner only */}
      {isOwner && sub && (
        <DeleteSubscriberSection subscriberId={sub.id} subscriberName={sub.name} />
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={e => { if (e.target === e.currentTarget) setEditing(false) }}>
          <div className="fixed bottom-0 left-0 right-0 mx-auto max-w-[390px] bg-bg-surface rounded-t-[20px] flex flex-col" style={{ maxHeight: '90vh' }}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-base font-bold">تعديل المشترك</h2>
              <button onClick={() => setEditing(false)} className="w-8 h-8 rounded-lg bg-bg-muted flex items-center justify-center text-text-muted">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <EditField label="الاسم" value={editForm.name} onChange={v => setEditForm((f: any) => ({ ...f, name: v }))} />
              <EditField label="الهاتف" value={editForm.phone} onChange={v => setEditForm((f: any) => ({ ...f, phone: v }))} type="tel" dir="ltr" />
              <EditField label="العنوان" value={editForm.address} onChange={v => setEditForm((f: any) => ({ ...f, address: v }))} />

              {/* Alley dropdown */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">الزقاق</label>
                {alleyOptions.length > 0 ? (
                  <select
                    value={editForm.alley_id}
                    onChange={e => {
                      const sel = alleyOptions.find(a => a.id === e.target.value)
                      setEditForm((f: any) => ({ ...f, alley_id: e.target.value, alley: sel?.name || '' }))
                    }}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm"
                  >
                    <option value="">بدون زقاق</option>
                    {alleyOptions.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                ) : (
                  <EditField label="" value={editForm.alley} onChange={v => setEditForm((f: any) => ({ ...f, alley: v }))} />
                )}
              </div>

              <EditField label="الأمبير" value={editForm.amperage} onChange={v => setEditForm((f: any) => ({ ...f, amperage: v }))} type="number" />

              {/* Subscription type */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">نوع الاشتراك</label>
                <div className="flex gap-2">
                  {['normal', 'gold'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEditForm((f: any) => ({ ...f, subscription_type: t }))}
                      className={`flex-1 h-10 rounded-xl text-xs font-bold transition-all ${
                        editForm.subscription_type === t
                          ? t === 'gold' ? 'bg-gold-soft text-gold border-2 border-gold' : 'bg-blue-soft text-blue-primary border-2 border-blue-primary'
                          : 'bg-bg-muted text-text-muted border border-border'
                      }`}
                    >
                      {t === 'gold' ? 'ذهبي' : 'عادي'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 bg-bg-surface" style={{ padding: '12px 20px 56px', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={saveEdit}
                disabled={editSaving || !editForm.name || !editForm.amperage}
                className="w-full h-11 rounded-xl text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #1B4FD8, #7C3AED)' }}
              >
                {editSaving ? <Loader2 size={16} className="animate-spin" /> : 'حفظ التعديلات'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EditField({ label, value, onChange, type = 'text', dir }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; dir?: string
}) {
  return (
    <div>
      {label && <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        dir={dir}
        className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm focus:outline-none focus:border-blue-primary transition-all"
      />
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={12} className="text-text-muted shrink-0" />
      <span className="text-text-muted">{label}:</span>
      <span className="text-text-primary font-medium">{value}</span>
    </div>
  )
}

function SubscriberShareSection({ subId, subName, subPhone, serial, isOwner }: {
  subId: string; subName: string; subPhone: string | null; serial: string; isOwner: boolean
}) {
  const [accessCode, setAccessCode] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    fetch(`/api/subscribers/${subId}`)
      .then(r => r.json())
      .then(d => setAccessCode(d.subscriber?.access_code ?? null))
      .catch(() => {})
  }, [subId])

  const handleShare = () => {
    if (!accessCode) { toast.error('لا يوجد كود — جدّد الكود أولاً'); return }
    const msg = `مرحباً ${subName} 👋\n\nتطبيق متابعة فاتورتك جاهز!\n\n📲 حمّل التطبيق:\nhttp://localhost:3005\n\n🔑 كودك: ${accessCode}\n(الأرقام الأولى ثابتة — فقط آخر 3 أرقام تتغير إذا نسيتها)\n\nافتح التطبيق وادخل كودك لتتابع:\n✅ فاتورتك الشهرية\n✅ الديون السابقة\n✅ حالة المولدة\n✅ الدفع الإلكتروني\n\nمدعوم من أمبير ⚡`
    if (subPhone) {
      openWhatsApp(subPhone, msg)
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
    }
  }

  const [showRegenConfirm, setShowRegenConfirm] = useState(false)

  const handleRegenerate = async () => {
    setRegenerating(true)
    setShowRegenConfirm(false)
    try {
      const res = await fetch(`/api/subscribers/${subId}/regenerate-code`, { method: 'PUT' })
      const d = await res.json()
      if (d.access_code) {
        setAccessCode(d.access_code)
        toast.success('تم تجديد الكود')
        // Immediately open WhatsApp with new code
        const msg = `مرحباً ${subName} 👋\n\nتم تجديد كود التطبيق الخاص بك:\n\n🔑 كودك الجديد: ${d.access_code}\n(الأرقام الأولى ثابتة — فقط آخر 3 أرقام تتغير)\n\n📲 افتح التطبيق: http://localhost:3005\n\nمدعوم من أمبير ⚡`
        if (subPhone) {
          openWhatsApp(subPhone, msg)
        } else {
          window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
        }
      } else toast.error(d.error || 'خطأ')
    } catch { toast.error('خطأ') }
    setRegenerating(false)
  }

  return (
    <div className="bg-bg-surface rounded-2xl p-4 space-y-2" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <p className="text-xs font-bold text-text-secondary">كود التطبيق</p>
      {accessCode ? (
        <div className="flex items-center gap-2 mb-2">
          <span className="font-mono text-lg font-bold text-blue-primary tracking-widest" dir="ltr">{accessCode}</span>
          <button onClick={() => { navigator.clipboard.writeText(accessCode); toast.success('تم نسخ الكود') }}
            className="text-[10px] px-2 py-1 rounded-lg bg-blue-soft text-blue-primary font-bold flex items-center gap-1">
            <Copy size={10} /> نسخ
          </button>
        </div>
      ) : (
        <p className="text-xs text-text-muted">لا يوجد كود — اضغط تجديد</p>
      )}
      <div className="flex gap-2">
        <button onClick={handleShare}
          className="flex-1 h-9 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1"
          style={{ background: '#ECFDF5', color: '#059669' }}>
          <MessageCircle size={12} /> 📱 إرسال كود التطبيق
        </button>
        {isOwner && (
          <button onClick={() => setShowRegenConfirm(true)} disabled={regenerating}
            className="h-9 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 bg-bg-muted text-text-secondary border border-border disabled:opacity-50">
            <RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} /> 🔄
          </button>
        )}
      </div>

      {showRegenConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50"
          onClick={e => { if (e.target === e.currentTarget) setShowRegenConfirm(false) }}>
          <div className="fixed bottom-0 left-0 right-0 mx-auto max-w-[390px] bg-bg-surface rounded-t-[20px] flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="p-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-sm font-bold">⚠️ تجديد كود المشترك</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <p className="text-xs text-text-secondary">سيتوقف الكود القديم فوراً</p>
              <p className="text-xs text-text-secondary">يجب إرسال الكود الجديد للمشترك عبر واتساب</p>
            </div>
            <div className="shrink-0 bg-bg-surface flex gap-2" style={{ padding: '12px 20px 56px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShowRegenConfirm(false)}
                className="flex-1 h-10 rounded-xl bg-bg-muted text-text-secondary text-xs font-bold">إلغاء</button>
              <button onClick={handleRegenerate} disabled={regenerating}
                className="flex-1 h-10 rounded-xl bg-blue-primary text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1">
                {regenerating ? <Loader2 size={14} className="animate-spin" /> : null}
                تجديد وإرسال →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function OwnerDiscountButton({ subscriberId, onSuccess }: { subscriberId: string; onSuccess: () => void }) {
  const [show, setShow] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const handleApply = async () => {
    if (!amount || Number(amount) <= 0) { toast.error('أدخل مبلغ الخصم'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/subscribers/${subscriberId}/discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount), reason }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || 'تم تطبيق الخصم')
        setShow(false); setAmount(''); setReason('')
        onSuccess()
      } else {
        toast.error(data.error || 'فشل تطبيق الخصم')
      }
    } catch { toast.error('خطأ في الاتصال') }
    setSaving(false)
  }

  return (
    <>
      <button onClick={() => setShow(true)} className="w-full h-9 mt-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5" style={{ background: 'var(--gold-soft)', color: 'var(--gold)' }}>
        🎁 إضافة خصم
      </button>
      {show && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={e => { if (e.target === e.currentTarget) setShow(false) }}>
          <div className="fixed bottom-0 left-0 right-0 mx-auto max-w-[390px] bg-bg-surface rounded-t-[20px] flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="p-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-sm font-bold">خصم فوري (من المالك)</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} dir="ltr" placeholder="مبلغ الخصم (د.ع)"
                className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base font-num text-sm" />
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="السبب (اختياري)"
                className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm" />
            </div>
            <div className="shrink-0 bg-bg-surface flex gap-2" style={{ padding: '12px 20px 56px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShow(false)} className="flex-1 h-10 rounded-xl bg-bg-muted text-text-muted text-xs font-bold">إلغاء</button>
              <button onClick={handleApply} disabled={saving || !amount}
                className="flex-1 h-10 rounded-xl text-white text-xs font-bold disabled:opacity-50" style={{ background: 'var(--gold)' }}>
                {saving ? 'جاري...' : 'تطبيق الخصم'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function InvoicesSection({ invoices, isOwner, subscriberId, onRefresh }: {
  invoices: SubscriberDetail['invoices']; isOwner: boolean; subscriberId: string; onRefresh: () => void
}) {
  const [reverseInv, setReverseInv] = useState<{ id: string; month: number; year: number } | null>(null)
  const [reverseReason, setReverseReason] = useState('')
  const [reversing, setReversing] = useState(false)

  async function handleReverse() {
    if (!reverseInv || !reverseReason.trim()) { toast.error('السبب مطلوب'); return }
    setReversing(true)
    try {
      const res = await fetch(`/api/invoices/${reverseInv.id}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reverseReason }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('✅ تم إلغاء الدفع')
        setReverseInv(null)
        setReverseReason('')
        onRefresh()
      } else {
        toast.error(data.error || 'فشل الإلغاء')
      }
    } catch { toast.error('خطأ في الاتصال') }
    setReversing(false)
  }

  return (
    <>
      <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
        <h3 className="text-sm font-bold mb-3">الفواتير</h3>
        {invoices.length === 0 ? (
          <p className="text-xs text-text-muted text-center py-4">لا توجد فواتير</p>
        ) : (
          <div className="space-y-2">
            {invoices.map(inv => (
              <div key={inv.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-xs font-medium">
                    الشهر المحصّل: <span className="font-num font-bold text-blue-primary">{formatBillingMonth(inv.billing_month, inv.billing_year)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-left">
                    <p className="font-num text-xs">
                      {Number(inv.amount_paid).toLocaleString()} / {Number(inv.total_amount_due).toLocaleString()}
                    </p>
                    <span className={`text-[10px] ${inv.is_fully_paid ? 'text-success' : 'text-danger'}`}>
                      {inv.is_fully_paid ? 'مدفوعة' : 'غير مدفوعة'}
                    </span>
                  </div>
                  {isOwner && inv.is_fully_paid && (
                    <button
                      onClick={() => setReverseInv({ id: inv.id, month: inv.billing_month, year: inv.billing_year })}
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: '#FEF2F2' }}
                      title="إلغاء الدفع"
                    >
                      <span className="text-xs">↩️</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reversal bottom sheet modal */}
      {reverseInv && (
        <div className="fixed inset-0 z-50 bg-black/50"
          onClick={e => { if (e.target === e.currentTarget) { setReverseInv(null); setReverseReason('') } }}>
          <div className="fixed bottom-0 left-0 right-0 mx-auto max-w-[390px] bg-bg-surface rounded-t-[20px] flex flex-col" style={{ maxHeight: '90vh' }}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-sm font-bold">إلغاء دفع فاتورة {formatBillingMonth(reverseInv.month, reverseInv.year)}</h3>
              <button onClick={() => { setReverseInv(null); setReverseReason('') }}
                className="w-8 h-8 rounded-lg bg-bg-muted flex items-center justify-center text-text-muted">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.05)' }}>
                <AlertCircle size={16} className="text-danger shrink-0 mt-0.5" />
                <p className="text-xs text-danger">هذا الإجراء سيُعيد الفاتورة لحالة غير مدفوعة وسيُعاد المبلغ لمحفظة الجابي</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">السبب <span className="text-danger">*</span></label>
                <input
                  type="text"
                  value={reverseReason}
                  onChange={e => setReverseReason(e.target.value)}
                  placeholder="مثال: خطأ في التحصيل — مبلغ خاطئ"
                  className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm focus:outline-none focus:border-blue-primary"
                />
              </div>

            </div>

            {/* Footer */}
            <div className="shrink-0 bg-bg-surface flex gap-2" style={{ padding: '12px 20px 56px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => { setReverseInv(null); setReverseReason('') }}
                className="flex-1 h-10 rounded-xl bg-bg-muted text-text-secondary text-xs font-bold">
                إغلاق
              </button>
              <button onClick={handleReverse}
                disabled={reversing || !reverseReason.trim()}
                className="flex-1 h-10 rounded-xl bg-blue-primary text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1">
                {reversing ? <Loader2 size={14} className="animate-spin" /> : null}
                {reversing ? 'جاري...' : 'تأكيد الإلغاء'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function DeleteSubscriberSection({ subscriberId, subscriberName }: { subscriberId: string; subscriberName: string }) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (confirmText !== subscriberName) { toast.error('اكتب اسم المشترك بشكل صحيح'); return }
    setDeleting(true)
    try {
      const res = await fetch(`/api/subscribers/${subscriberId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('تم حذف المشترك')
        router.push('/subscribers')
      } else {
        const data = await res.json()
        toast.error(data.error || 'فشل الحذف')
      }
    } catch { toast.error('خطأ') }
    setDeleting(false)
  }

  return (
    <>
      <button onClick={() => setShowModal(true)}
        className="w-full h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
        style={{ background: '#FEF2F2', color: '#EF4444' }}>
        <Trash2 size={14} /> 🗑️ حذف المشترك
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setConfirmText('') } }}>
          <div className="fixed bottom-0 left-0 right-0 mx-auto max-w-[390px] bg-bg-surface rounded-t-[20px] flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="shrink-0 p-4 text-center" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: '#FEF2F2' }}>
                <AlertCircle size={24} style={{ color: '#EF4444' }} />
              </div>
              <h3 className="text-base font-bold mb-1">⚠️ حذف المشترك</h3>
              <p className="text-xs text-text-muted">
                سيتم حذف <strong>{subscriberName}</strong> وجميع فواتيره نهائياً
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <label className="block text-xs font-medium text-text-secondary mb-1">
                اكتب &ldquo;{subscriberName}&rdquo; للتأكيد
              </label>
              <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm focus:outline-none" />
            </div>
            <div className="shrink-0 bg-bg-surface flex gap-2" style={{ padding: '12px 20px 56px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => { setShowModal(false); setConfirmText('') }}
                className="flex-1 h-10 rounded-xl bg-bg-muted text-text-secondary text-xs font-bold">
                إلغاء
              </button>
              <button onClick={handleDelete}
                disabled={deleting || confirmText !== subscriberName}
                className="flex-1 h-10 rounded-xl text-white text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-1"
                style={{ background: '#EF4444' }}>
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                حذف نهائياً
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
