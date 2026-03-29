'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, RefreshCw } from 'lucide-react'
import nextDynamic from 'next/dynamic'

type Collector = {
  staff_id: string
  name: string
  photo_url: string | null
  lat: number
  lng: number
  last_seen: string
  minutes_ago: number
}

const LiveMap = nextDynamic(() => import('./LiveMap'), { ssr: false })

export default function MapPage() {
  const router = useRouter()
  const [collectors, setCollectors] = useState<Collector[]>([])
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchCollectors = useCallback(async () => {
    try {
      const res = await fetch('/api/map/collectors-live')
      const data = await res.json()
      setCollectors(data.collectors || [])
      setLastUpdate(new Date())
    } catch { /* offline */ }
  }, [])

  useEffect(() => { fetchCollectors() }, [fetchCollectors])

  // Auto-refresh every 30s
  useEffect(() => {
    intervalRef.current = setInterval(fetchCollectors, 30000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchCollectors])

  // Tick display
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 5000)
    return () => clearInterval(t)
  }, [])

  const displaySeconds = lastUpdate ? Math.floor((Date.now() - lastUpdate.getTime()) / 1000) : null

  async function handleRefresh() {
    setRefreshing(true)
    await fetchCollectors()
    setRefreshing(false)
  }

  function handleCollectorTap(staffId: string) {
    router.push(`/wallets?highlight=${staffId}`)
  }

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

      {/* Map */}
      <div className="flex-1 relative">
        <LiveMap collectors={collectors} onCollectorTap={handleCollectorTap} />
      </div>

      {/* Collector list at bottom */}
      {collectors.length > 0 && (
        <div className="border-t px-3 py-2 flex gap-2 overflow-x-auto no-scrollbar" style={{ background: '#FFF', borderColor: 'var(--border)' }}>
          {collectors.map(c => (
            <button key={c.staff_id}
              onClick={() => handleCollectorTap(c.staff_id)}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
              style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#3B82F6' }} />
              {c.name.split(' ')[0]}
              {c.minutes_ago <= 5 && <span className="text-[9px]" style={{ color: 'var(--success)' }}>●</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
