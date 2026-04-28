'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import {
  Zap, Thermometer, Clock, Droplets, Plus, Power, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'

type EngineData = {
  id: string
  name: string
  runtime_hours: number
  oil_change_hours: number
  temperature_logs: { temp_celsius: number }[]
  fuel_logs: { fuel_level_percent: number }[]
}

type GeneratorData = {
  id: string
  name: string
  run_status: boolean
  fuel_level_pct: number | null
  engines: EngineData[]
}

export default function OpEnginesPage() {
  const { data: session } = useSession()
  const [generators, setGenerators] = useState<GeneratorData[]>([])
  const [loading, setLoading] = useState(true)
  const [checkedIn, setCheckedIn] = useState(true) // Assume checked in; will verify
  const [permissions, setPermissions] = useState<any>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/engines').then(r => r.json()),
      fetch(`/api/staff/${(session?.user as any)?.id}`).then(r => r.json()).catch(() => null),
    ]).then(([engData, staffData]) => {
      setGenerators(engData.generators || [])
      if (staffData?.staff?.operator_permission) {
        setPermissions(staffData.staff.operator_permission)
      }
      setLoading(false)
    }).catch(() => setLoading(false))

    // Check if checked in today
    const userId = (session?.user as any)?.id
    if (userId) {
      fetch(`/api/operator/shifts?staff_id=${userId}&limit=1`)
        .then(r => r.json())
        .then(data => {
          const today = new Date().toISOString().split('T')[0]
          const todayShift = data.shifts?.find((s: any) =>
            new Date(s.shift_date).toISOString().split('T')[0] === today && s.check_in_at
          )
          setCheckedIn(!!todayShift)
        })
        .catch(() => {})
    }
  }, [session])

  const requireCheckin = permissions?.require_shift_checkin ?? true

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">المحركات</h1>

      {/* Not checked in warning */}
      {requireCheckin && !checkedIn && (
        <div className="bg-gold-soft rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle size={20} className="text-gold shrink-0" />
          <div>
            <p className="text-sm font-bold text-text-primary">سجّل حضورك أولاً</p>
            <p className="text-xs text-text-muted">يجب تسجيل الحضور قبل إجراء أي عملية</p>
          </div>
        </div>
      )}

      {generators.map(gen => (
        <div key={gen.id} className="space-y-2">
          {/* Generator status */}
          <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${gen.run_status ? 'bg-success' : 'bg-danger'}`} />
                <h2 className="text-sm font-bold">{gen.name}</h2>
              </div>

              {permissions?.can_toggle_generator && (
                <button
                  disabled={requireCheckin && !checkedIn}
                  onClick={async () => {
                    try {
                      await fetch(`/api/engines/${gen.id}/run-status`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ run_status: !gen.run_status }),
                      })
                      setGenerators(prev => prev.map(g =>
                        g.id === gen.id ? { ...g, run_status: !g.run_status } : g
                      ))
                      toast.success(gen.run_status ? 'تم الإيقاف' : 'تم التشغيل')
                    } catch {
                      toast.error('خطأ')
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-40 ${
                    gen.run_status ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
                  }`}
                >
                  <Power size={14} />
                  {gen.run_status ? 'إيقاف' : 'تشغيل'}
                </button>
              )}
            </div>

            {/* Fuel gauge */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-text-muted">الوقود:</span>
              <div className="flex-1 h-2 bg-bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${gen.fuel_level_pct ?? 0}%`,
                    background: (gen.fuel_level_pct ?? 0) > 50 ? '#059669' :
                                (gen.fuel_level_pct ?? 0) > 20 ? '#D97706' : '#DC2626',
                  }}
                />
              </div>
              <span className="font-num text-xs font-bold">{gen.fuel_level_pct ?? 0}%</span>
            </div>
          </div>

          {/* Engines */}
          {gen.engines.map(engine => {
            const temp = engine.temperature_logs[0]?.temp_celsius ?? null
            const runtime = Number(engine.runtime_hours)
            const oilPct = Math.min(100, (runtime / engine.oil_change_hours) * 100)

            return (
              <div key={engine.id} className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold">{engine.name}</h3>
                  {temp !== null && (
                    <div className={`flex items-center gap-1 ${
                      temp > 90 ? 'text-danger' : temp > 70 ? 'text-gold' : 'text-success'
                    }`}>
                      <Thermometer size={14} />
                      <span className="font-num text-sm font-bold">{temp}°C</span>
                    </div>
                  )}
                </div>

                {/* Runtime */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1">
                    <Clock size={12} className="text-text-muted" />
                    <span className="text-xs text-text-muted">ساعات التشغيل</span>
                  </div>
                  <span className="font-num text-xs font-bold">{runtime.toFixed(1)} / {engine.oil_change_hours}</span>
                </div>
                <div className="h-2 bg-bg-muted rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full rounded-full ${oilPct > 90 ? 'bg-danger' : oilPct > 70 ? 'bg-gold' : 'bg-success'}`}
                    style={{ width: `${oilPct}%` }}
                  />
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  {permissions?.can_add_fuel && (
                    <button
                      disabled={requireCheckin && !checkedIn}
                      onClick={async () => {
                        const liters = prompt('أدخل عدد اللترات:')
                        if (!liters) return
                        try {
                          await fetch('/api/engines/log', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ engine_id: engine.id, type: 'fuel', value: parseFloat(liters) }),
                          })
                          toast.success('تم إضافة الوقود')
                        } catch { toast.error('خطأ') }
                      }}
                      className="flex-1 h-9 rounded-xl bg-gold-soft text-gold text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-40"
                    >
                      <Droplets size={13} /> وقود
                    </button>
                  )}
                  {permissions?.can_log_hours && (
                    <button
                      disabled={requireCheckin && !checkedIn}
                      onClick={async () => {
                        const hrs = prompt('أدخل عدد الساعات:')
                        if (!hrs) return
                        try {
                          await fetch('/api/engines/log', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ engine_id: engine.id, type: 'hours', value: parseFloat(hrs) }),
                          })
                          toast.success('تم إضافة الساعات')
                        } catch { toast.error('خطأ') }
                      }}
                      className="flex-1 h-9 rounded-xl bg-blue-soft text-blue-primary text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-40"
                    >
                      <Plus size={13} /> ساعات
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
