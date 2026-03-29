'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { openWhatsApp } from '@/lib/whatsapp'

const CollectorMiniMap = dynamic(() => import('@/components/CollectorMiniMap'), { ssr: false })

function Skeleton() {
  return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-32 rounded-2xl" />)}</div>
}

export default function WalletsPage() {
  const [wallets, setWallets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deliverStaffId, setDeliverStaffId] = useState<string | null>(null)
  const [deliverMax, setDeliverMax] = useState(0)
  const [deliverAmount, setDeliverAmount] = useState('')
  const [delivering, setDelivering] = useState(false)
  const [historyStaffId, setHistoryStaffId] = useState<string | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [mapStaffId, setMapStaffId] = useState<string | null>(null)
  const [mapData, setMapData] = useState<{ current_location: { lat: number; lng: number } | null; stops: any[] } | null>(null)
  const [mapLoading, setMapLoading] = useState(false)

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

  async function toggleMap(staffId: string) {
    if (mapStaffId === staffId) { setMapStaffId(null); return }
    setMapStaffId(staffId)
    setMapLoading(true)
    try {
      const res = await fetch(`/api/map/collector-stops?staff_id=${staffId}&date=today`)
      const d = await res.json()
      setMapData(d)
    } catch { setMapData(null) }
    setMapLoading(false)
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
      const staff = wallets.find(w => w.staff_id === deliverStaffId)?.staff
      toast.success(`تم استلام ${Number(deliverAmount).toLocaleString('en')} د.ع`)
      if (staff?.phone) {
        const msg = `✅ تم استلام مبلغ ${Number(deliverAmount).toLocaleString('en')} د.ع\n📅 ${new Date().toLocaleDateString('ar-IQ')}\n\nشكراً لك 🙏`
        openWhatsApp(staff.phone, msg)
      }
      setDeliverStaffId(null)
      setDeliverAmount('')
      refresh()
    } catch { toast.error('خطأ في الاستلام') }
    setDelivering(false)
  }

  if (loading) return <div className="p-4"><Skeleton /></div>

  const totalWallets = wallets.reduce((a: number, w: any) => a + Number(w.balance), 0)

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Link href="/dashboard" className="text-text-muted"><ChevronLeft size={20} /></Link>
        <h1 className="text-lg font-bold">محافظ الجباة</h1>
      </div>

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

            {/* Wallet balance */}
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
                className={`flex-1 h-11 rounded-xl text-xs font-bold ${historyStaffId === w.staff_id ? 'bg-violet/10 text-violet' : 'bg-bg-muted text-text-muted'}`}>
                سجل التعاملات
              </button>
            </div>

            {/* Map toggle button */}
            <button onClick={() => toggleMap(w.staff_id)}
              className={`w-full mt-2 h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${mapStaffId === w.staff_id ? 'bg-blue-primary/10 text-blue-primary' : 'bg-bg-muted text-text-muted'}`}>
              <MapPin className="w-3.5 h-3.5" /> خريطة اليوم
            </button>

            {/* Collector map */}
            {mapStaffId === w.staff_id && (
              <div className="mt-3">
                {mapLoading ? <div className="skeleton h-[220px] rounded-2xl" /> : mapData ? (
                  <>
                    <CollectorMiniMap
                      currentLocation={mapData.current_location}
                      stops={mapData.stops}
                    />
                    {mapData.stops.length > 0 && (
                      <p className="text-[10px] text-text-muted mt-1.5 text-center">
                        {mapData.stops.length} توقفات اليوم — إجمالي {mapData.stops.reduce((a: number, s: any) => a + s.duration_minutes, 0)} دقيقة
                      </p>
                    )}
                    {mapData.stops.length === 0 && mapData.current_location && (
                      <p className="text-[10px] text-success mt-1.5 text-center">لا توجد توقفات اليوم ✅</p>
                    )}
                    {!mapData.current_location && (
                      <p className="text-[10px] text-text-muted mt-1.5 text-center">لا يوجد موقع — الجابي لم يسجل دخول اليوم</p>
                    )}
                  </>
                ) : (
                  <p className="text-[10px] text-text-muted text-center py-4">فشل تحميل الخريطة</p>
                )}
              </div>
            )}

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
