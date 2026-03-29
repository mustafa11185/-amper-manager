'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus, ChevronLeft, Filter } from 'lucide-react'
import toast from 'react-hot-toast'
// iraq-geo import removed — province/district fields removed from form

type Subscriber = {
  id: string
  serial_number: string
  name: string
  phone: string | null
  subscription_type: string
  amperage: number
  total_debt: number
  is_active: boolean
  governorate: string | null
  needs_attention: boolean
}

const FILTER_CHIPS = [
  { key: '', label: 'الكل' },
  { key: 'gold', label: 'ذهبي', type: 'type' },
  { key: 'normal', label: 'عادي', type: 'type' },
  { key: 'unpaid', label: 'غير المدفوعين', type: 'status' },
  { key: 'debt', label: 'ديون', type: 'status' },
]

const GOVERNORATES = [
  'بغداد', 'البصرة', 'نينوى', 'أربيل', 'النجف', 'كربلاء', 'ذي قار', 'بابل',
  'ديالى', 'الأنبار', 'كركوك', 'صلاح الدين', 'واسط', 'المثنى', 'ميسان',
  'القادسية', 'دهوك', 'السليمانية',
]

export default function SubscribersPage() {
  const router = useRouter()
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [governorate, setGovernorate] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showGovFilter, setShowGovFilter] = useState(false)
  const observerRef = useRef<HTMLDivElement>(null)

  const fetchSubscribers = useCallback(async (pageNum: number, reset: boolean) => {
    const chip = FILTER_CHIPS.find(c => c.key === activeFilter)
    const typeParam = chip && 'type' in chip && chip.type === 'type' ? activeFilter : ''
    const statusParam = chip && 'type' in chip && chip.type === 'status' ? activeFilter : ''

    const params = new URLSearchParams({
      page: String(pageNum),
      limit: '20',
      ...(search && { search }),
      ...(typeParam && { type: typeParam }),
      ...(statusParam && { status: statusParam }),
      ...(governorate && { governorate }),
    })

    const res = await fetch(`/api/subscribers?${params}`)
    const data = await res.json()

    if (reset) {
      setSubscribers(data.subscribers)
    } else {
      setSubscribers(prev => [...prev, ...data.subscribers])
    }
    setHasMore(pageNum < data.pages)
    setLoading(false)
  }, [search, activeFilter, governorate])

  // Reset on filter/search change
  useEffect(() => {
    setLoading(true)
    setPage(1)
    fetchSubscribers(1, true)
  }, [fetchSubscribers])

  // Infinite scroll
  useEffect(() => {
    if (!observerRef.current || !hasMore) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loading) {
        const nextPage = page + 1
        setPage(nextPage)
        fetchSubscribers(nextPage, false)
      }
    }, { threshold: 0.5 })
    observer.observe(observerRef.current)
    return () => observer.disconnect()
  }, [hasMore, loading, page, fetchSubscribers])

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">المشتركون</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="w-9 h-9 rounded-xl bg-blue-primary text-white flex items-center justify-center"
          style={{ boxShadow: '0 4px 20px rgba(27,79,216,0.25)' }}
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الرقم أو الهاتف..."
          className="w-full h-10 pr-9 pl-10 rounded-xl border border-border bg-bg-surface text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-blue-primary transition-all"
        />
        <button
          onClick={() => setShowGovFilter(!showGovFilter)}
          className={`absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center ${governorate ? 'bg-blue-primary text-white' : 'text-text-muted'}`}
        >
          <Filter size={14} />
        </button>
      </div>

      {/* Governorate dropdown */}
      {showGovFilter && (
        <div className="bg-bg-surface rounded-xl border border-border p-2 max-h-48 overflow-y-auto">
          <button
            onClick={() => { setGovernorate(''); setShowGovFilter(false) }}
            className={`w-full text-right text-sm px-3 py-1.5 rounded-lg ${!governorate ? 'bg-blue-soft text-blue-primary font-bold' : ''}`}
          >
            كل المحافظات
          </button>
          {GOVERNORATES.map(g => (
            <button
              key={g}
              onClick={() => { setGovernorate(g); setShowGovFilter(false) }}
              className={`w-full text-right text-sm px-3 py-1.5 rounded-lg ${governorate === g ? 'bg-blue-soft text-blue-primary font-bold' : ''}`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {FILTER_CHIPS.map(chip => (
          <button
            key={chip.key}
            onClick={() => setActiveFilter(chip.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              activeFilter === chip.key
                ? 'bg-blue-primary text-white'
                : 'bg-bg-surface text-text-muted border border-border'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading && subscribers.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-2xl" />
          ))}
        </div>
      ) : subscribers.length === 0 ? (
        <p className="text-center text-text-muted py-8 text-sm">لا يوجد مشتركون</p>
      ) : (
        <div className="space-y-2">
          {subscribers.map(sub => (
            <button
              key={sub.id}
              onClick={() => router.push(`/subscribers/${sub.id}`)}
              className="w-full bg-bg-surface rounded-2xl p-3 flex items-center gap-3 text-right"
              style={{ boxShadow: 'var(--shadow-sm)' }}
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-xl bg-bg-muted flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-text-muted">{sub.name?.charAt(0)}</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-text-primary truncate">{sub.name}</p>
                  {sub.needs_attention && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-danger/10 text-danger font-bold shrink-0">⚠️ متأخر</span>
                  )}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                    sub.subscription_type === 'gold'
                      ? 'bg-gold-soft text-gold'
                      : 'bg-blue-soft text-blue-primary'
                  }`}>
                    {sub.subscription_type === 'gold' ? 'ذهبي' : 'عادي'}
                  </span>
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                  <span className="font-num">{Number(sub.amperage)}</span> أمبير
                  {sub.governorate && <span> · {sub.governorate}</span>}
                </p>
              </div>

              {/* Debt + Arrow */}
              <div className="flex items-center gap-2 shrink-0">
                {Number(sub.total_debt) > 0 && (
                  <span className="font-num text-xs text-danger font-bold">
                    {Number(sub.total_debt).toLocaleString()}
                  </span>
                )}
                <ChevronLeft size={16} className="text-text-muted" />
              </div>
            </button>
          ))}

          {/* Infinite scroll trigger */}
          {hasMore && <div ref={observerRef} className="h-8" />}
        </div>
      )}

      {/* Add Subscriber Modal */}
      {showAdd && <AddSubscriberModal onClose={() => setShowAdd(false)} onSuccess={() => {
        setShowAdd(false)
        setPage(1)
        fetchSubscribers(1, true)
      }} />}
    </div>
  )
}

function AddSubscriberModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: '', phone: '', address: '', alley: '', alley_id: '',
    amperage: '', subscription_type: 'normal',
    branch_id: '', generator_id: '',
  })
  const [branches, setBranches] = useState<{ id: string; name: string; generators: { id: string; name: string }[] }[]>([])
  const [alleyOptions, setAlleyOptions] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    // Fetch branches + generators
    fetch('/api/branches')
      .then(r => r.json())
      .then(data => {
        setBranches(data.branches || [])
        if (data.branches?.length === 1) {
          setForm(f => ({ ...f, branch_id: data.branches[0].id }))
          if (data.branches[0].generators?.length === 1) {
            setForm(f => ({ ...f, generator_id: data.branches[0].generators[0].id }))
          }
        }
      })
      .catch(() => {})
  }, [])

  // Fetch alleys when branch changes
  useEffect(() => {
    if (!form.branch_id) { setAlleyOptions([]); return }
    fetch(`/api/alleys?branch_id=${form.branch_id}`)
      .then(r => r.json())
      .then(d => setAlleyOptions((d.alleys || []).filter((a: any) => a.is_active)))
      .catch(() => setAlleyOptions([]))
  }, [form.branch_id])

  function captureGPS() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => toast.error('تعذر الحصول على الموقع')
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.amperage || !form.branch_id || !form.generator_id) {
      toast.error('يرجى ملء الحقول المطلوبة')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amperage: parseFloat(form.amperage),
          gps_lat: gps?.lat,
          gps_lng: gps?.lng,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success('تم إضافة المشترك')
      onSuccess()
    } catch (err: any) {
      toast.error(err.message || 'خطأ في الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const selectedBranch = branches.find(b => b.id === form.branch_id)

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="fixed bottom-0 left-0 right-0 mx-auto max-w-[390px] bg-bg-surface rounded-t-[20px] flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-base font-bold">مشترك جديد</h2>
          <button onClick={onClose} className="text-text-muted text-sm">إلغاء</button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-3">
          <InputField label="الاسم *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
          <InputField label="الهاتف" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} type="tel" dir="ltr" />
          <InputField label="العنوان" value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} />
          {/* Alley dropdown */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">الزقاق</label>
            {alleyOptions.length > 0 ? (
              <select
                value={form.alley_id}
                onChange={e => {
                  const selected = alleyOptions.find(a => a.id === e.target.value)
                  setForm(f => ({ ...f, alley_id: e.target.value, alley: selected?.name || '' }))
                }}
                className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm"
              >
                <option value="">اختر الزقاق</option>
                {alleyOptions.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            ) : (
              <InputField label="" value={form.alley} onChange={v => setForm(f => ({ ...f, alley: v }))} />
            )}
          </div>

          <InputField label="الأمبير *" value={form.amperage} onChange={v => setForm(f => ({ ...f, amperage: v }))} type="number" />

          {/* Subscription type */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">نوع الاشتراك</label>
            <div className="flex gap-2">
              {['normal', 'gold'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, subscription_type: t }))}
                  className={`flex-1 h-10 rounded-xl text-xs font-bold transition-all ${
                    form.subscription_type === t
                      ? t === 'gold' ? 'bg-gold-soft text-gold border-2 border-gold' : 'bg-blue-soft text-blue-primary border-2 border-blue-primary'
                      : 'bg-bg-muted text-text-muted border border-border'
                  }`}
                >
                  {t === 'gold' ? 'ذهبي' : 'عادي'}
                </button>
              ))}
            </div>
          </div>

          {/* Branch */}
          {branches.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">الفرع *</label>
              <select
                value={form.branch_id}
                onChange={e => setForm(f => ({ ...f, branch_id: e.target.value, generator_id: '' }))}
                className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm"
              >
                <option value="">اختر الفرع</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          {/* Generator */}
          {selectedBranch && selectedBranch.generators.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">المولد *</label>
              <select
                value={form.generator_id}
                onChange={e => setForm(f => ({ ...f, generator_id: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm"
              >
                <option value="">اختر المولد</option>
                {selectedBranch.generators.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}

          {/* GPS */}
          <button
            type="button"
            onClick={captureGPS}
            className="w-full h-10 rounded-xl border border-border text-sm text-text-secondary flex items-center justify-center gap-2"
          >
            📍 {gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : 'تحديد الموقع GPS'}
          </button>
        </form>

        {/* Footer */}
        <div className="shrink-0 bg-bg-surface" style={{ padding: '12px 20px 56px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={e => { e.preventDefault(); handleSubmit(e as any) }}
            disabled={saving}
            className="w-full h-11 rounded-xl text-white font-bold text-sm disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #1B4FD8, #7C3AED)' }}
          >
            {saving ? 'جاري الحفظ...' : 'إضافة المشترك'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InputField({ label, value, onChange, type = 'text', dir }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; dir?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
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
