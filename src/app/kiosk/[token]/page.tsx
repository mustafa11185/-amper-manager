'use client'
import { useEffect, useRef, useState, use } from 'react'

type KioskData = {
  kiosk: { id: string; name: string }
  branch: { id: string; name: string }
  timestamp: string
  stats: {
    total_subs: number
    active_subs: number
    unpaid_count: number
    today_revenue: number
    month_revenue: number
    present_staff: number
  }
  generators: Array<{ id: string; name: string; run_status: boolean | null; fuel_level_pct: number | null }>
  iot: Array<{
    device_id: string
    name: string | null
    is_online: boolean
    last_seen: string | null
    engines: Array<{ id: string; name: string }>
    latest: any
  }>
  alerts: Array<{ id: string; type: string; title: string; body: string; created_at: string }>
}

const CACHE_KEY = 'amper_kiosk_cache'
const POLL_INTERVAL = 30_000

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}م`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}ك`
  return n.toFixed(0)
}

function timeAgo(iso: string | null) {
  if (!iso) return '—'
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (sec < 60) return `${sec}ث`
  if (sec < 3600) return `${Math.floor(sec / 60)}د`
  if (sec < 86400) return `${Math.floor(sec / 3600)}س`
  return `${Math.floor(sec / 86400)}ي`
}

export default function KioskPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<KioskData | null>(null)
  const [online, setOnline] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [now, setNow] = useState(new Date())
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Load from cache first
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY + ':' + token)
      if (cached) {
        const parsed = JSON.parse(cached)
        setData(parsed.data)
        setLastUpdate(new Date(parsed.savedAt))
      }
    } catch {}
  }, [token])

  // Tick clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Online/offline detection
  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    updateOnline()
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  // Fetch loop
  useEffect(() => {
    let cancelled = false
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/kiosk-display/${token}`, { cache: 'no-store' })
        if (!res.ok) {
          if (res.status === 404) setError('رمز Kiosk غير صالح أو معطّل')
          return
        }
        const json = await res.json()
        if (cancelled) return
        setData(json)
        setLastUpdate(new Date())
        setError(null)
        try {
          localStorage.setItem(CACHE_KEY + ':' + token, JSON.stringify({ data: json, savedAt: Date.now() }))
        } catch {}
      } catch {
        // Network error — keep cached data, mark offline
      }
    }
    fetchData()
    timerRef.current = setInterval(fetchData, POLL_INTERVAL)
    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [token])

  // Hide cursor for kiosk mode
  useEffect(() => {
    document.body.style.cursor = 'none'
    return () => { document.body.style.cursor = 'auto' }
  }, [])

  // Wake Lock — keep screen on 24/7
  useEffect(() => {
    let wakeLock: any = null
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen')
        }
      } catch {}
    }
    acquire()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      try { wakeLock?.release?.() } catch {}
    }
  }, [])

  // Auto-fullscreen on first user interaction
  useEffect(() => {
    const goFullscreen = () => {
      try { document.documentElement.requestFullscreen?.() } catch {}
      document.removeEventListener('click', goFullscreen)
    }
    document.addEventListener('click', goFullscreen)
    return () => document.removeEventListener('click', goFullscreen)
  }, [])

  if (error && !data) {
    return (
      <div style={styles.error}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontSize: 24 }}>{error}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={styles.loading}>
        <div style={{ fontSize: 24 }}>جاري التحميل...</div>
      </div>
    )
  }

  const stale = lastUpdate ? (Date.now() - lastUpdate.getTime()) > 90_000 : true
  const showOfflineBadge = !online || stale

  return (
    <div style={styles.root} dir="rtl">
      {/* ── Header ── */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>⚡ {data.branch.name}</div>
          <div style={styles.subtitle}>{data.kiosk.name}</div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={styles.clock}>
            {now.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div style={styles.date}>
            {now.toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </div>

      {/* ── Offline indicator ── */}
      {showOfflineBadge && (
        <div style={styles.offlineBar}>
          🔴 وضع غير متصل — آخر تحديث: {lastUpdate ? timeAgo(lastUpdate.toISOString()) : '—'}
        </div>
      )}

      {/* ── Stats grid ── */}
      <div style={styles.statsGrid}>
        <StatCard label="إيرادات اليوم" value={fmt(data.stats.today_revenue)} unit="د.ع" color="#10b981" icon="💰" />
        <StatCard label="إيرادات الشهر" value={fmt(data.stats.month_revenue)} unit="د.ع" color="#3b82f6" icon="📊" />
        <StatCard label="مشتركون نشطون" value={String(data.stats.active_subs)} unit="مشترك" color="#8b5cf6" icon="👥" />
        <StatCard label="غير مدفوع" value={String(data.stats.unpaid_count)} unit="مشترك" color="#ef4444" icon="⚠️" />
        <StatCard label="جباة في الميدان" value={String(data.stats.present_staff)} unit="جابي" color="#f59e0b" icon="🚚" />
        <StatCard label="مولدات" value={String(data.generators.length)} unit="مولدة" color="#06b6d4" icon="🔌" />
      </div>

      {/* ── IoT live ── */}
      {data.iot.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>📡 الحساسات الحية</div>
          <div style={styles.iotGrid}>
            {data.iot.map(d => {
              const tele = d.latest
              return (
                <div key={d.device_id} style={{
                  ...styles.iotCard,
                  borderColor: d.is_online ? '#10b981' : '#6b7280',
                }}>
                  <div style={styles.iotHeader}>
                    <span style={{ fontSize: 16, fontWeight: 800 }}>{d.name || '—'}</span>
                    <span style={{
                      fontSize: 11,
                      padding: '2px 10px',
                      borderRadius: 20,
                      background: d.is_online ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)',
                      color: d.is_online ? '#10b981' : '#9ca3af',
                      fontWeight: 700,
                    }}>
                      {d.is_online ? '● متصل' : '○ غير متصل'}
                    </span>
                  </div>
                  {tele ? (
                    <div style={styles.iotMetrics}>
                      {tele.temperature_c != null && (
                        <Metric icon="🌡" value={`${tele.temperature_c}°`} color="#ef4444" />
                      )}
                      {tele.fuel_pct != null && (
                        <Metric icon="⛽" value={`${Math.round(tele.fuel_pct)}%`} color="#3b82f6" />
                      )}
                      {tele.current_a != null && (
                        <Metric icon="⚡" value={`${tele.current_a}A`} color="#f59e0b" />
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>لا توجد قراءات بعد</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Alerts ── */}
      {data.alerts.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>🚨 تنبيهات (آخر 24 ساعة)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.alerts.map(a => (
              <div key={a.id} style={styles.alert}>
                <span style={{ fontWeight: 800 }}>{a.title}</span>
                <span style={{ fontSize: 13, color: '#9ca3af', marginRight: 8 }}>{a.body}</span>
                <span style={{ marginRight: 'auto', fontSize: 11, color: '#6b7280' }}>{timeAgo(a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={styles.footer}>
        Amper IoT Kiosk • آخر تحديث: {lastUpdate ? lastUpdate.toLocaleTimeString('ar-IQ') : '—'}
      </div>
    </div>
  )
}

function StatCard({ label, value, unit, color, icon }: any) {
  return (
    <div style={{ ...styles.statCard, borderColor: color + '40' }}>
      <div style={{ fontSize: 32 }}>{icon}</div>
      <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 900, color, marginTop: 4, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{unit}</div>
    </div>
  )
}

function Metric({ icon, value, color }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 18, fontWeight: 800, color }}>
      <span>{icon}</span>
      <span>{value}</span>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #060D1A 0%, #0D1B2A 100%)',
    color: '#E2E8F0',
    fontFamily: 'Tajawal, sans-serif',
    padding: 24,
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: '1px solid rgba(45,140,255,0.15)',
  },
  title: { fontSize: 32, fontWeight: 900, color: '#2D8CFF' },
  subtitle: { fontSize: 14, color: '#64748B', marginTop: 4 },
  clock: { fontSize: 36, fontWeight: 900, fontFamily: 'monospace', color: '#fff' },
  date: { fontSize: 14, color: '#64748B', marginTop: 4 },
  offlineBar: {
    background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.4)',
    color: '#fca5a5',
    padding: '10px 16px',
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 14,
    fontWeight: 700,
    textAlign: 'center',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    background: 'rgba(13,27,42,0.8)',
    border: '1px solid',
    borderRadius: 16,
    padding: 16,
    textAlign: 'center' as const,
  },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 800,
    marginBottom: 12,
    color: '#94a3b8',
  },
  iotGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
  },
  iotCard: {
    background: 'rgba(13,27,42,0.8)',
    border: '2px solid',
    borderRadius: 16,
    padding: 16,
  },
  iotHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  iotMetrics: {
    display: 'flex',
    gap: 16,
    marginTop: 12,
  },
  alert: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 10,
    padding: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
  },
  footer: {
    textAlign: 'center' as const,
    color: '#475569',
    fontSize: 11,
    marginTop: 20,
    paddingTop: 16,
    borderTop: '1px solid rgba(45,140,255,0.1)',
  },
  loading: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#060D1A',
    color: '#fff',
    fontFamily: 'Tajawal, sans-serif',
  },
  error: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    background: '#060D1A',
    color: '#fca5a5',
    fontFamily: 'Tajawal, sans-serif',
    textAlign: 'center' as const,
  },
}
