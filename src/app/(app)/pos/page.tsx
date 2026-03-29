'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import {
  Search, Banknote, Smartphone, CreditCard, CheckCircle2,
  Printer, MessageCircle, ChevronRight, Gift, Loader2, WifiOff,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { queuePayment, getPendingPayments, syncOfflinePayments } from '@/lib/offline-queue'

type SearchResult = {
  id: string
  serial_number: string
  name: string
  phone: string | null
  subscription_type: string
  amperage: number
  total_debt: number
  alley: string | null
}

type AlleyInfo = { id: string; name: string; total: number; unpaid: number }

type Step = 'search' | 'amount' | 'method' | 'success'

function PosPageContent() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()

  const [step, setStep] = useState<Step>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [amount, setAmount] = useState('')
  const [payType, setPayType] = useState<'invoice' | 'debt' | 'all'>('invoice')
  const [monthlyDue, setMonthlyDue] = useState(0) // current month invoice remaining
  const [activeBillingMonth, setActiveBillingMonth] = useState<number | null>(null)
  const [activeBillingYear, setActiveBillingYear] = useState<number | null>(null)
  const [method, setMethod] = useState<'cash' | 'zaincash' | 'card'>('cash')
  const [processing, setProcessing] = useState(false)
  const [payResult, setPayResult] = useState<any>(null)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  // POS filters
  const [typeFilter, setTypeFilter] = useState<'' | 'gold' | 'normal'>('')
  const [alleyFilter, setAlleyFilter] = useState('')
  const [unpaidOnly, setUnpaidOnly] = useState(false)
  const [alleys, setAlleys] = useState<AlleyInfo[]>([])
  const [browseResults, setBrowseResults] = useState<SearchResult[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browsePage, setBrowsePage] = useState(1)
  const [browseHasMore, setBrowseHasMore] = useState(false)

  // Discount request
  const [showDiscount, setShowDiscount] = useState(false)
  const [discountAmount, setDiscountAmount] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [discountPending, setDiscountPending] = useState(false)

  // Capture GPS on mount
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { }
    )
  }, [])

  // Fetch active billing month from pricing settings
  useEffect(() => {
    fetch('/api/settings/pricing')
      .then(r => r.json())
      .then(d => {
        const p = (d.pricing || [])[0]?.pricing
        if (p?.effective_from) {
          const eff = new Date(p.effective_from)
          setActiveBillingMonth(eff.getMonth() + 1)
          setActiveBillingYear(eff.getFullYear())
        }
      })
      .catch(() => { })
  }, [])

  // Check offline status
  useEffect(() => {
    const handleOnline = () => { setIsOffline(false); syncOfflinePayments() }
    const handleOffline = () => setIsOffline(true)
    setIsOffline(!navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Check pending offline payments
  useEffect(() => {
    getPendingPayments().then(p => setPendingCount(p.length)).catch(() => { })
  }, [step])

  // Pre-select subscriber from URL param
  useEffect(() => {
    const subId = searchParams?.get('subscriber')
    const urlType = searchParams?.get('type')
    if (subId) {
      fetch(`/api/subscribers/${subId}`)
        .then(r => r.json())
        .then(data => {
          if (data.subscriber) {
            selectSubscriber(data.subscriber).then(() => {
              // Override pay type if specified in URL
              if (urlType === 'debt') {
                const debt = Number(data.subscriber.total_debt)
                if (debt > 0) {
                  setPayType('debt')
                  setAmount(String(debt))
                }
              }
            })
          }
        })
        .catch(() => { })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Fetch alleys on mount
  useEffect(() => {
    fetch('/api/subscribers/alleys')
      .then(r => r.json())
      .then(data => setAlleys(data.alleys || []))
      .catch(() => { })
  }, [])

  // Browse subscribers with filters (when not searching by text)
  const fetchBrowse = useCallback(async (pageNum: number, reset: boolean) => {
    setBrowseLoading(true)
    const params = new URLSearchParams({
      page: String(pageNum),
      limit: '20',
      sort: 'debt_desc',
    })
    if (typeFilter) params.set('type', typeFilter)
    if (alleyFilter) params.set('alley_id', alleyFilter)
    if (unpaidOnly) params.set('status', 'unpaid')

    try {
      const res = await fetch(`/api/subscribers?${params}`)
      const data = await res.json()
      if (reset) {
        setBrowseResults(data.subscribers || [])
      } else {
        setBrowseResults(prev => [...prev, ...(data.subscribers || [])])
      }
      setBrowseHasMore(pageNum < (data.pages || 1))
    } catch {
      if (reset) setBrowseResults([])
    }
    setBrowseLoading(false)
  }, [typeFilter, alleyFilter, unpaidOnly])

  // Re-fetch browse when filters change
  useEffect(() => {
    setBrowsePage(1)
    fetchBrowse(1, true)
  }, [fetchBrowse])

  // Search subscribers by text
  const doSearch = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const params = new URLSearchParams({ search: q, limit: '10', sort: 'debt_desc' })
      if (typeFilter) params.set('type', typeFilter)
      if (unpaidOnly) params.set('status', 'unpaid')
      const res = await fetch(`/api/subscribers?${params}`)
      const data = await res.json()
      setResults(data.subscribers || [])
    } catch {
      setResults([])
    }
    setSearching(false)
  }, [typeFilter, unpaidOnly])

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300)
    return () => clearTimeout(timer)
  }, [query, doSearch])

  async function selectSubscriber(sub: SearchResult) {
    setSelected(sub)
    setStep('amount')

    // Fetch full subscriber data with current invoice
    let invoiceDue = 0
    try {
      const res = await fetch(`/api/subscribers/${sub.id}`)
      const data = await res.json()
      const s = data.subscriber
      if (s?.current_invoice && !s.current_invoice.is_fully_paid) {
        invoiceDue = Math.max(0, Number(s.current_invoice.total_amount_due) - Number(s.current_invoice.amount_paid))
      }
      // Update subscriber with fresh data
      if (s) {
        sub = { ...sub, total_debt: Number(s.total_debt) }
        setSelected(sub)
      }
    } catch { /* ignore */ }

    setMonthlyDue(Math.max(0, invoiceDue))
    const debt = Number(sub.total_debt)

    // Default to invoice if there is one, otherwise debt, otherwise all
    if (invoiceDue > 0) {
      setPayType('invoice')
      setAmount(String(invoiceDue))
    } else if (debt > 0) {
      setPayType('debt')
      setAmount(String(debt))
    } else {
      setPayType('all')
      setAmount('0')
    }
  }

  async function handlePayment() {
    if (!selected || !amount || Number(amount) <= 0) return
    setProcessing(true)

    const payload = {
      subscriber_id: selected.id,
      amount: Number(amount),
      pay_type: payType,
      billing_month: activeBillingMonth || (new Date().getMonth() + 1),
      payment_method: method,
      discount_amount: appliedDiscount,
      discount_reason: discountReason || undefined,
      gps_lat: gps?.lat || null,
      gps_lng: gps?.lng || null,
    }

    if (isOffline) {
      // Queue offline
      await queuePayment({
        ...payload,
        subscriber_name: selected.name,
        created_at: new Date().toISOString(),
      })
      setPayResult({
        paid: Number(amount),
        subscriber_name: selected.name,
        offline: true,
      })
      setStep('success')
      setProcessing(false)
      return
    }

    try {
      const res = await fetch('/api/pos/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      const data = await res.json()
      setPayResult(data)
      setStep('success')
    } catch (err: any) {
      toast.error(err.message || 'خطأ في الدفع')
    }
    setProcessing(false)
  }

  // Discount state for applied discount (owner: immediate, collector: request)
  const [appliedDiscount, setAppliedDiscount] = useState(0)

  function handleApplyDiscount() {
    if (!selected || !discountAmount) return
    const disc = Number(discountAmount)
    if (disc <= 0) return
    const role = (session?.user as any)?.role

    if (role === 'owner' || role === 'accountant') {
      // Owner/accountant: apply immediately to amount
      setAppliedDiscount(disc)
      const currentAmt = Number(amount)
      setAmount(String(Math.max(0, currentAmt - disc)))
      setShowDiscount(false)
      setDiscountAmount('')
      setDiscountReason('')
      toast.success(`تم تطبيق خصم ${disc.toLocaleString('en')} د.ع`)
    } else {
      // Collector: send request and wait
      setDiscountPending(true)
      fetch('/api/discounts/collector-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriber_id: selected.id, amount: disc, reason: discountReason || undefined }),
      }).then(res => {
        if (res.ok) toast.success('تم إرسال طلب الخصم — بانتظار الموافقة')
        else toast.error('خطأ في إرسال الطلب')
      }).catch(() => toast.error('خطأ')).finally(() => {
        setDiscountPending(false)
        setShowDiscount(false)
        setDiscountAmount('')
        setDiscountReason('')
      })
    }
  }

  function resetFlow() {
    setStep('search')
    setSelected(null)
    setAmount('')
    setQuery('')
    setResults([])
    setPayResult(null)
    setShowDiscount(false)
    setAppliedDiscount(0)
  }

  const canDiscount = (session?.user as any)?.canCollect || session?.user?.role === 'owner'

  return (
    <div className="space-y-4">
      {/* Offline banner */}
      {isOffline && (
        <div className="bg-gold-soft rounded-xl p-3 flex items-center gap-2">
          <WifiOff size={16} className="text-gold" />
          <p className="text-xs text-text-primary font-medium">لا يوجد اتصال — الدفعات ستُحفظ محلياً</p>
        </div>
      )}

      {pendingCount > 0 && !isOffline && (
        <button
          onClick={() => { syncOfflinePayments(); toast.success('جاري المزامنة...') }}
          className="w-full bg-blue-soft rounded-xl p-3 flex items-center gap-2"
        >
          <WifiOff size={16} className="text-blue-primary" />
          <p className="text-xs text-blue-primary font-medium">{pendingCount} دفعة بانتظار المزامنة — اضغط للمزامنة</p>
        </button>
      )}

      {/* STEP 1: Search + Browse */}
      {step === 'search' && (
        <>
          <h1 className="text-lg font-bold">نقطة الدفع</h1>

          {/* Search bar */}
          <div className="relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="بحث بالاسم أو الرقم أو الهاتف..."
              autoFocus
              className="w-full h-11 pr-9 pl-4 rounded-xl border border-border bg-bg-surface text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-blue-primary"
            />
          </div>

          {/* Type chips: الكل | ذهبي | عادي */}
          <div className="flex gap-2">
            {([
              { key: '' as const, label: 'الكل' },
              { key: 'gold' as const, label: 'ذهبي' },
              { key: 'normal' as const, label: 'عادي' },
            ]).map(chip => (
              <button
                key={chip.key}
                onClick={() => setTypeFilter(chip.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${typeFilter === chip.key
                  ? chip.key === 'gold' ? 'bg-gold text-white' : 'bg-blue-primary text-white'
                  : 'bg-bg-surface text-text-muted border border-border'
                  }`}
              >
                {chip.label}
              </button>
            ))}

            {/* Unpaid toggle */}
            <button
              onClick={() => setUnpaidOnly(v => !v)}
              className={`mr-auto px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${unpaidOnly
                ? 'bg-danger text-white'
                : 'bg-bg-surface text-text-muted border border-border'
                }`}
            >
              {unpaidOnly ? '✓ ' : ''}غير المدفوعين
            </button>
          </div>

          {/* Alley chips */}
          {alleys.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                onClick={() => setAlleyFilter('')}
                className={`shrink-0 px-3 py-1 rounded-lg text-[11px] font-medium transition-all ${!alleyFilter
                  ? 'bg-violet text-white'
                  : 'bg-bg-surface text-text-muted border border-border'
                  }`}
              >
                كل الأزقة
              </button>
              {alleys.map(a => (
                <button
                  key={a.id}
                  onClick={() => setAlleyFilter(alleyFilter === a.id ? '' : a.id)}
                  className={`shrink-0 px-3 py-1 rounded-lg text-[11px] font-medium transition-all ${alleyFilter === a.id
                    ? 'bg-violet text-white'
                    : 'bg-bg-surface text-text-muted border border-border'
                    }`}
                >
                  {a.name}
                  {a.unpaid > 0 && (
                    <span className={`font-num text-[10px] mr-0.5 ${alleyFilter === a.id ? 'text-white/80' : 'text-danger'
                      }`}>
                      ({a.unpaid})
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Search results (text query active) */}
          {query.length >= 2 ? (
            <>
              {searching && (
                <div className="flex justify-center py-4">
                  <Loader2 size={20} className="animate-spin text-text-muted" />
                </div>
              )}
              {!searching && results.length === 0 && (
                <p className="text-center text-text-muted text-xs py-4">لا توجد نتائج</p>
              )}
              <div className="space-y-2">
                {results.map(sub => (
                  <SubscriberRow key={sub.id} sub={sub} onSelect={selectSubscriber} />
                ))}
              </div>
            </>
          ) : (
            /* Browse results (filters active, no text search) */
            <>
              {browseLoading && browseResults.length === 0 && (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-16 rounded-2xl" />)}
                </div>
              )}
              {!browseLoading && browseResults.length === 0 && (
                <p className="text-center text-text-muted text-xs py-4">لا يوجد مشتركون</p>
              )}
              <div className="space-y-2">
                {browseResults.map(sub => (
                  <SubscriberRow key={sub.id} sub={sub} onSelect={selectSubscriber} />
                ))}
                {browseHasMore && (
                  <button
                    onClick={() => {
                      const next = browsePage + 1
                      setBrowsePage(next)
                      fetchBrowse(next, false)
                    }}
                    disabled={browseLoading}
                    className="w-full h-9 rounded-xl bg-bg-surface border border-border text-xs text-text-muted font-medium"
                  >
                    {browseLoading ? 'جاري التحميل...' : 'تحميل المزيد'}
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* STEP 2: Amount */}
      {step === 'amount' && selected && (
        <>
          <button onClick={() => { setStep('search'); setSelected(null) }} className="text-sm text-text-muted flex items-center gap-1">
            <ChevronRight size={14} /> رجوع
          </button>

          {/* Subscriber card */}
          <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold">{selected.name}</p>
                <p className="font-data text-xs text-text-muted">#{selected.serial_number}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${selected.subscription_type === 'gold' ? 'bg-gold-soft text-gold' : 'bg-blue-soft text-blue-primary'
                }`}>
                {selected.subscription_type === 'gold' ? 'ذهبي' : 'عادي'}
              </span>
            </div>
          </div>

          {/* Payment type selector */}
          {(() => {
            const debt = Number(selected.total_debt)
            const allTotal = monthlyDue + debt
            return (
              <div className="space-y-2">
                <p className="text-xs font-bold text-text-secondary">نوع الدفعة</p>
                <div className="grid grid-cols-3 gap-2">
                  {/* Invoice */}
                  <button
                    onClick={() => { setPayType('invoice'); setAmount(String(monthlyDue)) }}
                    disabled={monthlyDue <= 0}
                    className={`rounded-2xl p-3 text-center transition-all disabled:opacity-30 ${payType === 'invoice'
                      ? 'bg-blue-primary text-white ring-2 ring-blue-primary ring-offset-2'
                      : 'bg-bg-surface border border-border'
                      }`}
                    style={{ boxShadow: payType === 'invoice' ? '0 4px 20px rgba(27,79,216,0.2)' : 'var(--shadow-sm)' }}
                  >
                    <p className="text-[10px] mb-1 opacity-80">فاتورة الشهر</p>
                    <p className={`font-num text-base font-bold ${payType === 'invoice' ? '' : 'text-blue-primary'}`}>
                      {monthlyDue.toLocaleString()}
                    </p>
                    <p className="text-[9px] opacity-60">د.ع</p>
                  </button>

                  {/* Debt */}
                  <button
                    onClick={() => { setPayType('debt'); setAmount(String(debt)) }}
                    disabled={debt <= 0}
                    className={`rounded-2xl p-3 text-center transition-all disabled:opacity-30 ${payType === 'debt'
                      ? 'bg-danger text-white ring-2 ring-danger ring-offset-2'
                      : 'bg-bg-surface border border-border'
                      }`}
                    style={{ boxShadow: payType === 'debt' ? '0 4px 20px rgba(220,38,38,0.2)' : 'var(--shadow-sm)' }}
                  >
                    <p className="text-[10px] mb-1 opacity-80">الديون</p>
                    <p className={`font-num text-base font-bold ${payType === 'debt' ? '' : 'text-danger'}`}>
                      {debt.toLocaleString()}
                    </p>
                    <p className="text-[9px] opacity-60">د.ع</p>
                  </button>

                  {/* All */}
                  <button
                    onClick={() => { setPayType('all'); setAmount(String(allTotal)) }}
                    disabled={allTotal <= 0}
                    className={`rounded-2xl p-3 text-center transition-all disabled:opacity-30 ${payType === 'all'
                      ? 'bg-success text-white ring-2 ring-success ring-offset-2'
                      : 'bg-bg-surface border border-border'
                      }`}
                    style={{ boxShadow: payType === 'all' ? '0 4px 20px rgba(5,150,105,0.2)' : 'var(--shadow-sm)' }}
                  >
                    <p className="text-[10px] mb-1 opacity-80">الكل</p>
                    <p className={`font-num text-base font-bold ${payType === 'all' ? '' : 'text-success'}`}>
                      {allTotal.toLocaleString()}
                    </p>
                    <p className="text-[9px] opacity-60">د.ع</p>
                  </button>
                </div>
              </div>
            )
          })()}

          {/* Amount display / input */}
          <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
            {payType === 'debt' ? (
              <>
                <label className="block text-xs font-medium text-text-secondary mb-2">المبلغ المدفوع</label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => {
                    const v = e.target.value
                    const max = Number(selected.total_debt)
                    if (v === '' || (Number(v) >= 0 && Number(v) <= max)) setAmount(v)
                  }}
                  dir="ltr"
                  min={1}
                  className="w-full h-14 text-center font-num text-3xl font-bold rounded-xl border border-border bg-bg-base focus:outline-none focus:border-danger text-danger"
                />
                <p className="text-[10px] text-text-muted mt-1.5 text-center">
                  الدين الكلي: <span className="font-num font-bold text-danger">{Number(selected.total_debt).toLocaleString()}</span> د.ع — يمكنك دفع جزء منه
                </p>
              </>
            ) : (
              <div className="text-center">
                <p className="text-xs text-text-muted mb-1">المبلغ المستحق</p>
                <p className="font-num text-3xl font-bold text-text-primary">
                  {Number(amount).toLocaleString()}
                  <span className="text-sm mr-1 text-text-muted">د.ع</span>
                </p>
                {activeBillingMonth && payType === 'invoice' && (
                  <p className="text-[10px] text-text-muted mt-1">
                    الشهر المحصّل: <span className="font-num font-bold text-blue-primary">{activeBillingMonth}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Discount button */}
          {canDiscount && (
            <button
              onClick={() => setShowDiscount(true)}
              className="w-full h-10 rounded-xl bg-gold-soft text-gold text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Gift size={14} />
              إضافة خصم
            </button>
          )}

          {/* Discount bottom sheet */}
          {showDiscount && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
              <div className="bg-bg-surface w-full max-w-[390px] rounded-t-[20px] p-5 pb-8">
                <h3 className="text-sm font-bold mb-3">{((session?.user as any)?.role === 'owner' || (session?.user as any)?.role === 'accountant') ? 'خصم فوري' : 'طلب خصم'}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">المبلغ</label>
                    <input
                      type="number"
                      value={discountAmount}
                      onChange={e => setDiscountAmount(e.target.value)}
                      dir="ltr"
                      className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base font-num text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">السبب (اختياري)</label>
                    <input
                      type="text"
                      value={discountReason}
                      onChange={e => setDiscountReason(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowDiscount(false)}
                      className="flex-1 h-10 rounded-xl bg-bg-muted text-text-secondary text-xs font-bold"
                    >
                      إلغاء
                    </button>
                    <button
                      onClick={handleApplyDiscount}
                      disabled={discountPending || !discountAmount}
                      className="flex-1 h-10 rounded-xl bg-gold text-white text-xs font-bold disabled:opacity-60"
                    >
                      {discountPending ? 'جاري...' : ((session?.user as any)?.role === 'owner' || (session?.user as any)?.role === 'accountant') ? 'تطبيق الخصم' : 'إرسال الطلب'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setStep('method')}
            disabled={!amount || Number(amount) <= 0}
            className="w-full h-12 rounded-xl text-white font-bold text-sm disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #1B4FD8, #7C3AED)' }}
          >
            التالي — اختر طريقة الدفع
          </button>
        </>
      )}

      {/* STEP 3: Payment Method */}
      {step === 'method' && selected && (
        <>
          <button onClick={() => setStep('amount')} className="text-sm text-text-muted flex items-center gap-1">
            <ChevronRight size={14} /> رجوع
          </button>

          <h2 className="text-base font-bold">طريقة الدفع</h2>

          <div className="space-y-2">
            <MethodButton
              icon={Banknote}
              label="نقداً"
              desc="استلام نقدي مباشر"
              active={method === 'cash'}
              onClick={() => setMethod('cash')}
            />
            {session?.user?.plan && session.user.plan !== 'basic' && (
              <MethodButton
                icon={Smartphone}
                label="زين كاش"
                desc="دفع إلكتروني عبر زين كاش"
                active={method === 'zaincash'}
                onClick={() => setMethod('zaincash')}
              />
            )}
            <MethodButton
              icon={CreditCard}
              label="بطاقة"
              desc="الدفع عبر جهاز POS"
              active={method === 'card'}
              onClick={() => setMethod('card')}
            />
          </div>

          <div className="bg-bg-surface rounded-2xl p-4 text-center" style={{ boxShadow: 'var(--shadow-md)' }}>
            <p className="text-xs text-text-muted mb-1">المبلغ</p>
            <p className="font-num text-2xl font-bold text-text-primary">
              {Number(amount).toLocaleString()}
              <span className="text-sm mr-1">د.ع</span>
            </p>
            {activeBillingMonth && (
              <p className="text-xs text-text-muted mt-2">
                الشهر المحصّل: <span className="font-num font-bold text-blue-primary">{activeBillingMonth}</span>
              </p>
            )}
          </div>

          <button
            onClick={handlePayment}
            disabled={processing}
            className="w-full h-12 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #1B4FD8, #7C3AED)' }}
          >
            {processing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>تأكيد الدفع</>
            )}
          </button>
        </>
      )}

      {/* STEP 4: Success */}
      {step === 'success' && payResult && (
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center">
            <CheckCircle2 size={40} className="text-success" />
          </div>

          <h2 className="text-lg font-bold text-success">تم الدفع بنجاح</h2>

          {payResult.offline && (
            <div className="bg-gold-soft rounded-xl p-3 flex items-center gap-2">
              <WifiOff size={14} className="text-gold" />
              <p className="text-xs text-text-primary">سيتم المزامنة عند عودة الإنترنت</p>
            </div>
          )}

          <div className="bg-bg-surface rounded-2xl p-4 w-full text-center" style={{ boxShadow: 'var(--shadow-md)' }}>
            <p className="text-sm text-text-muted mb-1">{payResult.subscriber_name}</p>
            <p className="font-num text-3xl font-bold text-text-primary">
              {Number(payResult.paid).toLocaleString()}
              <span className="text-sm mr-1">د.ع</span>
            </p>
            {payResult.remaining_debt !== undefined && (
              <p className="text-xs text-text-muted mt-2">
                الدين المتبقي: <span className="font-num font-bold text-danger">
                  {Number(payResult.remaining_debt).toLocaleString()} د.ع
                </span>
              </p>
            )}
            {payResult.billing_month && (
              <p className="text-xs text-text-muted mt-1">
                الشهر المحصّل: <span className="font-num font-bold text-blue-primary">{payResult.billing_month}</span>
              </p>
            )}
          </div>

          <div className="flex gap-3 w-full">
            <button className="flex-1 h-10 rounded-xl bg-bg-surface border border-border text-xs font-bold flex items-center justify-center gap-1.5">
              <Printer size={14} />
              طباعة
            </button>
            <button className="flex-1 h-10 rounded-xl bg-success/10 text-success text-xs font-bold flex items-center justify-center gap-1.5">
              <MessageCircle size={14} />
              واتساب
            </button>
          </div>

          <button
            onClick={resetFlow}
            className="w-full h-11 rounded-xl bg-blue-primary text-white text-sm font-bold"
          >
            دفعة جديدة
          </button>
        </div>
      )}
    </div>
  )
}

function MethodButton({
  icon: Icon, label, desc, active, onClick,
}: {
  icon: React.ElementType; label: string; desc: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-2xl p-4 flex items-center gap-3 text-right transition-all ${active
        ? 'bg-blue-soft border-2 border-blue-primary'
        : 'bg-bg-surface border border-border'
        }`}
      style={{ boxShadow: active ? '0 4px 20px rgba(27,79,216,0.12)' : 'var(--shadow-sm)' }}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? 'bg-blue-primary text-white' : 'bg-bg-muted text-text-muted'
        }`}>
        <Icon size={18} />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-bold ${active ? 'text-blue-primary' : 'text-text-primary'}`}>{label}</p>
        <p className="text-xs text-text-muted">{desc}</p>
      </div>
      {active && (
        <div className="w-5 h-5 rounded-full bg-blue-primary flex items-center justify-center">
          <CheckCircle2 size={12} className="text-white" />
        </div>
      )}
    </button>
  )
}

function SubscriberRow({ sub, onSelect }: { sub: SearchResult; onSelect: (s: SearchResult) => void }) {
  return (
    <button
      onClick={() => onSelect(sub)}
      className="w-full bg-bg-surface rounded-2xl p-3.5 flex items-center gap-3 text-right"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="w-10 h-10 rounded-xl bg-bg-muted flex items-center justify-center shrink-0">
        <span className="font-data text-xs text-text-muted">{sub.serial_number}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate">{sub.name}</p>
        <p className="text-xs text-text-muted">
          <span className="font-num">{Number(sub.amperage)}</span> أمبير
          {' · '}
          <span className={sub.subscription_type === 'gold' ? 'text-gold' : 'text-blue-primary'}>
            {sub.subscription_type === 'gold' ? 'ذهبي' : 'عادي'}
          </span>
          {sub.alley && (
            <span className="text-text-muted/60"> · {sub.alley}</span>
          )}
        </p>
      </div>
      <div className="text-left shrink-0">
        {Number(sub.total_debt) > 0 && (
          <p className="font-num text-sm text-danger font-bold">
            {Number(sub.total_debt).toLocaleString()}
            <span className="text-[10px] mr-0.5">د.ع</span>
          </p>
        )}
      </div>
    </button>
  )
}

export default function PosPage() { return <Suspense fallback={null}><PosPageContent /></Suspense> }
