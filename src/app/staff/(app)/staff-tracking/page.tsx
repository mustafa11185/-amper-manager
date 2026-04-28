'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Calendar, Clock, MapPin } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const CollectorMiniMap = dynamic(() => import('@/components/CollectorMiniMap'), { ssr: false })

type Collector = {
  staff_id: string
  name: string
  photo_url: string | null
  lat: number
  lng: number
  last_seen: string
  minutes_ago: number
}

type Stop = {
  lat: number
  lng: number
  started_at: string
  duration_minutes: number
}

type StopData = {
  current_location: { lat: number; lng: number } | null
  stops: Stop[]
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function formatDateAr(d: Date): string {
  return d.toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })
}

export default function StaffTrackingPage() {
  const [date, setDate] = useState(() => new Date())
  const [collectors, setCollectors] = useState<Collector[]>([])
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null)
  const [stopData, setStopData] = useState<StopData | null>(null)
  const [loading, setLoading] = useState(false)

  const isToday = formatDate(date) === formatDate(new Date())

  // Fetch collectors
  useEffect(() => {
    fetch('/api/map/collectors-live')
      .then(r => r.json())
      .then(d => {
        const list = d.collectors || []
        setCollectors(list)
        if (list.length > 0 && !selectedStaff) setSelectedStaff(list[0].staff_id)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch stops when collector or date changes
  const fetchStops = useCallback(async () => {
    if (!selectedStaff) return
    setLoading(true)
    try {
      const dateStr = formatDate(date)
      const res = await fetch(`/api/map/collector-stops?staff_id=${selectedStaff}&date=${dateStr}`)
      const d = await res.json()
      setStopData(d)
    } catch { setStopData(null) }
    setLoading(false)
  }, [selectedStaff, date])

  useEffect(() => { fetchStops() }, [fetchStops])

  function prevDay() {
    setDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n })
  }
  function nextDay() {
    if (isToday) return
    setDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n })
  }

  const totalStops = stopData?.stops.length ?? 0
  const totalMinutes = stopData?.stops.reduce((a, s) => a + s.duration_minutes, 0) ?? 0
  const selected = collectors.find(c => c.staff_id === selectedStaff)

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Link href="/staff/dashboard" className="text-text-muted"><ChevronLeft size={20} /></Link>
        <h1 className="text-lg font-bold">تتبع الموظفين</h1>
      </div>

      {/* Date picker */}
      <div className="flex items-center justify-between bg-bg-surface rounded-2xl p-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <button onClick={prevDay} className="w-8 h-8 rounded-lg flex items-center justify-center bg-bg-muted">
          <ChevronRight className="w-4 h-4 text-text-secondary" />
        </button>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-primary" />
          <span className="text-sm font-bold">{formatDateAr(date)}</span>
          {isToday && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-primary text-white font-bold">اليوم</span>}
        </div>
        <button onClick={nextDay} disabled={isToday}
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-bg-muted disabled:opacity-30">
          <ChevronLeft className="w-4 h-4 text-text-secondary" />
        </button>
      </div>

      {/* Collector tabs */}
      {collectors.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {collectors.map(c => (
            <button key={c.staff_id}
              onClick={() => setSelectedStaff(c.staff_id)}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all"
              style={{
                background: selectedStaff === c.staff_id ? 'var(--blue-soft)' : 'var(--bg-muted)',
                border: selectedStaff === c.staff_id ? '1.5px solid var(--blue-primary)' : '1.5px solid transparent',
                color: selectedStaff === c.staff_id ? 'var(--blue-primary)' : 'var(--text-secondary)',
              }}
            >
              {c.name.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      {/* Summary */}
      {!loading && stopData && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-bg-surface rounded-2xl p-3 text-center" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-[10px] text-text-muted mb-0.5">عدد التوقفات</p>
            <p className="font-num text-xl font-bold" style={{ color: totalStops > 0 ? 'var(--warning)' : 'var(--success)' }}>
              {totalStops}
            </p>
          </div>
          <div className="bg-bg-surface rounded-2xl p-3 text-center" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-[10px] text-text-muted mb-0.5">إجمالي وقت التوقف</p>
            <p className="font-num text-xl font-bold" style={{ color: totalMinutes > 20 ? 'var(--danger)' : totalMinutes > 0 ? 'var(--warning)' : 'var(--success)' }}>
              {totalMinutes} <span className="text-xs text-text-muted">دقيقة</span>
            </p>
          </div>
        </div>
      )}

      {/* Map */}
      {loading ? (
        <div className="skeleton h-[220px] rounded-2xl" />
      ) : stopData ? (
        <CollectorMiniMap
          currentLocation={isToday ? stopData.current_location : null}
          stops={stopData.stops}
        />
      ) : (
        <div className="bg-bg-surface rounded-2xl p-6 text-center">
          <MapPin className="w-8 h-8 mx-auto mb-2 text-text-muted" />
          <p className="text-xs text-text-muted">لا توجد بيانات موقع</p>
        </div>
      )}

      {/* Stop list */}
      {stopData && stopData.stops.length > 0 && (
        <div className="bg-bg-surface rounded-2xl p-4 space-y-2" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <p className="text-xs font-bold text-text-secondary mb-2">تفاصيل التوقفات</p>
          {stopData.stops.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-2" style={{ borderBottom: i < stopData.stops.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.duration_minutes >= 10 ? '#EF4444' : '#F59E0B' }} />
                <div>
                  <p className="text-xs font-bold">توقف {s.duration_minutes} دقيقة</p>
                  <p className="text-[10px] text-text-muted flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {formatTime(s.started_at)}
                  </p>
                </div>
              </div>
              <span className="font-num text-sm font-bold" style={{ color: s.duration_minutes >= 10 ? 'var(--danger)' : 'var(--warning)' }}>
                {s.duration_minutes} د
              </span>
            </div>
          ))}
        </div>
      )}

      {stopData && stopData.stops.length === 0 && !loading && (
        <div className="bg-emerald-50 rounded-2xl p-4 text-center">
          <p className="text-sm font-bold text-success">لا توجد توقفات {isToday ? 'اليوم' : 'في هذا اليوم'} ✅</p>
          {selected && isToday && (
            <p className="text-[10px] text-text-muted mt-1">
              {selected.name} يعمل بشكل طبيعي
            </p>
          )}
        </div>
      )}
    </div>
  )
}
