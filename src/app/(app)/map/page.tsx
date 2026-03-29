'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, User, Home, PauseCircle, RefreshCw } from 'lucide-react'
import dynamic from 'next/dynamic'

// ── Types ──────────────────────────────────────────────
type Collector = {
  staff_id: string
  name: string
  lat: number
  lng: number
  last_seen: string
  minutes_ago: number
  is_stop: boolean
  stop_duration_min: number
}

type PathPoint = {
  lat: number
  lng: number
  logged_at: string
  is_stop: boolean
  stop_minutes: number
}

type SubPin = {
  id: string
  name: string
  serial_number: string
  lat: number
  lng: number
  is_paid: boolean
  total_debt: number
}

// ── Dynamic import to avoid SSR issues with Leaflet ───
const MapView = dynamic(() => import('./MapView'), { ssr: false })

export default function MapPage() {
  const router = useRouter()
  const [collectors, setCollectors] = useState<Collector[]>([])
  const [subscribers, setSubscribers] = useState<SubPin[]>([])
  const [paths, setPaths] = useState<Record<string, PathPoint[]>>({})
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Layer toggles
  const [showCollectors, setShowCollectors] = useState(true)
  const [showSubscribers, setShowSubscribers] = useState(false)
  const [showStops, setShowStops] = useState(true)

  // Selected collector for path display
  const [selectedCollector, setSelectedCollector] = useState<string | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchCollectors = useCallback(async () => {
    try {
      const res = await fetch('/api/map/collectors-live')
      const data = await res.json()
      setCollectors(data.collectors || [])
      setLastUpdate(new Date())
    } catch { /* offline */ }
  }, [])

  const fetchSubscribers = useCallback(async () => {
    try {
      const res = await fetch('/api/map/subscribers')
      const data = await res.json()
      setSubscribers(data.subscribers || [])
    } catch { /* offline */ }
  }, [])

  const fetchPath = useCallback(async (staffId: string) => {
    try {
      const res = await fetch(`/api/map/collector-path?staff_id=${staffId}&date=today`)
      const data = await res.json()
      setPaths(prev => ({ ...prev, [staffId]: data.path || [] }))
    } catch { /* offline */ }
  }, [])

  // Initial load
  useEffect(() => {
    fetchCollectors()
    fetchSubscribers()
  }, [fetchCollectors, fetchSubscribers])

  // Auto-refresh collectors every 30s
  useEffect(() => {
    intervalRef.current = setInterval(fetchCollectors, 30000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchCollectors])

  // Fetch path when collector selected
  useEffect(() => {
    if (selectedCollector) fetchPath(selectedCollector)
  }, [selectedCollector, fetchPath])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchCollectors()
    if (selectedCollector) await fetchPath(selectedCollector)
    setRefreshing(false)
  }

  function handleCollectorClick(staffId: string) {
    setSelectedCollector(prev => (prev === staffId ? null : staffId))
  }

  const secondsAgo = lastUpdate
    ? Math.floor((Date.now() - lastUpdate.getTime()) / 1000)
    : null

  // Auto-tick the seconds counter
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 5000)
    return () => clearInterval(t)
  }, [])

  const displaySeconds = lastUpdate
    ? Math.floor((Date.now() - lastUpdate.getTime()) / 1000)
    : null

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-base)' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ background: '#FFF', borderColor: 'var(--border)' }}>
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
          <ArrowRight className="w-4 h-4" /> رجوع
        </button>
        <div className="flex items-center gap-2">
          {displaySeconds != null && (
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              آخر تحديث: منذ {displaySeconds < 60 ? `${displaySeconds} ثانية` : `${Math.floor(displaySeconds / 60)} دقيقة`}
            </span>
          )}
          <button onClick={handleRefresh} disabled={refreshing}
            className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--bg-muted)' }}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} style={{ color: 'var(--blue-primary)' }} />
          </button>
        </div>
      </div>

      {/* Toggle buttons */}
      <div className="flex items-center gap-2 px-4 py-2" style={{ background: '#FFF', borderBottom: '1px solid var(--border)' }}>
        <ToggleBtn active={showCollectors} onClick={() => setShowCollectors(!showCollectors)} icon={<User className="w-3.5 h-3.5" />} label="الجباة" />
        <ToggleBtn active={showSubscribers} onClick={() => setShowSubscribers(!showSubscribers)} icon={<Home className="w-3.5 h-3.5" />} label="المشتركون" />
        <ToggleBtn active={showStops} onClick={() => setShowStops(!showStops)} icon={<PauseCircle className="w-3.5 h-3.5" />} label="التوقفات" />
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapView
          collectors={showCollectors ? collectors : []}
          subscribers={showSubscribers ? subscribers : []}
          paths={selectedCollector ? (paths[selectedCollector] || []) : []}
          showStops={showStops}
          selectedCollector={selectedCollector}
          onCollectorClick={handleCollectorClick}
        />
      </div>

      {/* Collector list at bottom */}
      {showCollectors && collectors.length > 0 && (
        <div className="border-t px-3 py-2 flex gap-2 overflow-x-auto no-scrollbar" style={{ background: '#FFF', borderColor: 'var(--border)' }}>
          {collectors.map(c => (
            <button key={c.staff_id}
              onClick={() => handleCollectorClick(c.staff_id)}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all"
              style={{
                background: selectedCollector === c.staff_id ? 'var(--blue-soft)' : 'var(--bg-muted)',
                border: selectedCollector === c.staff_id ? '1.5px solid var(--blue-primary)' : '1.5px solid transparent',
                color: selectedCollector === c.staff_id ? 'var(--blue-primary)' : 'var(--text-secondary)',
              }}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{
                background: c.is_stop && c.stop_duration_min >= 3 ? '#EF4444'
                  : c.is_stop ? '#F59E0B'
                  : '#3B82F6',
              }} />
              {c.name.split(' ')[0]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ToggleBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all"
      style={{
        background: active ? 'var(--blue-primary)' : 'var(--bg-muted)',
        color: active ? '#FFF' : 'var(--text-muted)',
      }}
    >
      {icon} {label}
    </button>
  )
}
