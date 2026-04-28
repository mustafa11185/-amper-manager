'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import {
  Zap, Thermometer, Clock, Droplets, Fuel, Plus,
  AlertTriangle, Power, Timer, Gauge,
} from 'lucide-react'
import toast from 'react-hot-toast'

type EngineData = {
  id: string
  name: string
  model: string | null
  oil_change_hours: number
  runtime_hours: number
  temperature_logs: { temp_celsius: number; logged_at: string }[]
  fuel_logs: { fuel_level_percent: number; fuel_added_liters: number | null; logged_at: string }[]
}

type GeneratorData = {
  id: string
  name: string
  run_status: boolean
  fuel_level_pct: number | null
  last_fuel_update: string | null
  manual_override_allowed: boolean
  engines: EngineData[]
  manual_overrides: { id: string; expires_at: string; activated_at: string }[]
}

export default function EnginesPage() {
  const { data: session } = useSession()
  const [generators, setGenerators] = useState<GeneratorData[]>([])
  const [loading, setLoading] = useState(true)
  const [showFuelModal, setShowFuelModal] = useState<string | null>(null) // engine_id
  const [showHoursModal, setShowHoursModal] = useState<string | null>(null) // engine_id
  const [showManualModal, setShowManualModal] = useState<string | null>(null) // generator_id

  useEffect(() => {
    fetchEngines()
  }, [])

  async function fetchEngines() {
    try {
      const res = await fetch('/api/engines')
      const data = await res.json()
      setGenerators(data.generators || [])
    } catch {
      toast.error('خطأ في تحميل البيانات')
    }
    setLoading(false)
  }

  async function toggleRunStatus(genId: string, current: boolean) {
    try {
      await fetch(`/api/engines/${genId}/run-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_status: !current }),
      })
      setGenerators(prev => prev.map(g =>
        g.id === genId ? { ...g, run_status: !current } : g
      ))
      toast.success(!current ? 'تم التشغيل' : 'تم الإيقاف')
    } catch {
      toast.error('خطأ')
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-32" />
        {[1, 2].map(i => <div key={i} className="skeleton h-48 rounded-2xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">المحركات</h1>

      {generators.length === 0 ? (
        <p className="text-center text-text-muted py-8 text-sm">لا توجد مولدات</p>
      ) : generators.map(gen => (
        <div key={gen.id} className="space-y-3">
          {/* Generator header */}
          <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${gen.run_status ? 'bg-success' : 'bg-danger'}`} />
                <h2 className="text-sm font-bold">{gen.name}</h2>
              </div>
              <button
                onClick={() => toggleRunStatus(gen.id, gen.run_status)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  gen.run_status
                    ? 'bg-danger/10 text-danger'
                    : 'bg-success/10 text-success'
                }`}
              >
                <Power size={14} />
                {gen.run_status ? 'إيقاف' : 'تشغيل'}
              </button>
            </div>

            {/* Fuel gauge */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Fuel size={14} className="text-gold" />
                  <span className="text-xs text-text-muted">الوقود</span>
                </div>
                <span className="font-num text-sm font-bold">
                  {gen.fuel_level_pct ?? 0}%
                </span>
              </div>
              <div className="h-3 bg-bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${gen.fuel_level_pct ?? 0}%`,
                    background: (gen.fuel_level_pct ?? 0) > 50 ? '#059669' :
                                (gen.fuel_level_pct ?? 0) > 20 ? '#D97706' : '#DC2626',
                  }}
                />
              </div>
              {gen.last_fuel_update && (
                <p className="text-[10px] text-text-muted mt-1">
                  آخر تحديث: {new Date(gen.last_fuel_update).toLocaleString('ar-IQ')}
                </p>
              )}
            </div>

            {/* Manual Override */}
            {gen.manual_override_allowed && (
              <ManualOverrideSection
                generatorId={gen.id}
                activeOverride={gen.manual_overrides[0] || null}
                onActivate={() => setShowManualModal(gen.id)}
              />
            )}
          </div>

          {/* Engines */}
          {gen.engines.map(engine => (
            <EngineCard
              key={engine.id}
              engine={engine}
              onAddFuel={() => setShowFuelModal(engine.id)}
              onAddHours={() => setShowHoursModal(engine.id)}
            />
          ))}
        </div>
      ))}

      {/* Add Fuel Modal */}
      {showFuelModal && (
        <LogModal
          title="إضافة وقود"
          fields={[
            { key: 'value', label: 'الكمية (لتر)', type: 'number' },
            { key: 'cost_iqd', label: 'التكلفة (د.ع)', type: 'number' },
            { key: 'notes', label: 'ملاحظات', type: 'text' },
          ]}
          onSubmit={async (data) => {
            await fetch('/api/engines/log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ engine_id: showFuelModal, type: 'fuel', ...data }),
            })
            toast.success('تم إضافة الوقود')
            setShowFuelModal(null)
            fetchEngines()
          }}
          onClose={() => setShowFuelModal(null)}
        />
      )}

      {/* Add Hours Modal */}
      {showHoursModal && (
        <LogModal
          title="إضافة ساعات"
          fields={[
            { key: 'value', label: 'عدد الساعات', type: 'number' },
          ]}
          onSubmit={async (data) => {
            await fetch('/api/engines/log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ engine_id: showHoursModal, type: 'hours', ...data }),
            })
            toast.success('تم إضافة الساعات')
            setShowHoursModal(null)
            fetchEngines()
          }}
          onClose={() => setShowHoursModal(null)}
        />
      )}

      {/* Manual Override Modal */}
      {showManualModal && (
        <LogModal
          title="تفعيل التحكم اليدوي"
          fields={[
            { key: 'value', label: 'المدة (ساعات — حد أقصى ٤)', type: 'number' },
            { key: 'notes', label: 'السبب', type: 'text' },
          ]}
          onSubmit={async (data) => {
            await fetch('/api/engines/log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                engine_id: '_',
                generator_id: showManualModal,
                type: 'manual_override',
                ...data,
              }),
            })
            toast.success('تم تفعيل التحكم اليدوي')
            setShowManualModal(null)
            fetchEngines()
          }}
          onClose={() => setShowManualModal(null)}
        />
      )}
    </div>
  )
}

function EngineCard({
  engine,
  onAddFuel,
  onAddHours,
}: {
  engine: EngineData
  onAddFuel: () => void
  onAddHours: () => void
}) {
  const temp = engine.temperature_logs[0]?.temp_celsius ?? null
  const tempColor = temp !== null
    ? temp > 90 ? 'text-danger' : temp > 70 ? 'text-gold' : 'text-success'
    : 'text-text-muted'

  const runtime = Number(engine.runtime_hours)
  const oilChangeAt = engine.oil_change_hours
  const oilPct = Math.min(100, (runtime / oilChangeAt) * 100)
  const oilColor = oilPct > 90 ? 'bg-danger' : oilPct > 70 ? 'bg-gold' : 'bg-success'

  return (
    <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold">{engine.name}</h3>
          {engine.model && <p className="text-[10px] text-text-muted">{engine.model}</p>}
        </div>
        {temp !== null && (
          <div className={`flex items-center gap-1 ${tempColor}`}>
            <Thermometer size={14} />
            <span className="font-num text-sm font-bold">{temp}°C</span>
          </div>
        )}
      </div>

      {/* Runtime + Oil Change */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-text-muted" />
            <span className="text-xs text-text-muted">ساعات التشغيل</span>
          </div>
          <span className="font-num text-xs font-bold">
            {runtime.toFixed(1)} / {oilChangeAt}
          </span>
        </div>
        <div className="h-2 bg-bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${oilColor}`}
            style={{ width: `${oilPct}%` }}
          />
        </div>
        <p className="text-[10px] text-text-muted mt-0.5">
          {oilPct >= 90 ? '⚠️ يلزم تغيير الزيت' : `تغيير الزيت عند ${oilChangeAt} ساعة`}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={onAddFuel}
          className="flex-1 h-9 rounded-xl bg-gold-soft text-gold text-xs font-bold flex items-center justify-center gap-1"
        >
          <Droplets size={13} />
          إضافة وقود
        </button>
        <button
          onClick={onAddHours}
          className="flex-1 h-9 rounded-xl bg-blue-soft text-blue-primary text-xs font-bold flex items-center justify-center gap-1"
        >
          <Plus size={13} />
          إضافة ساعات
        </button>
      </div>
    </div>
  )
}

function ManualOverrideSection({
  generatorId,
  activeOverride,
  onActivate,
}: {
  generatorId: string
  activeOverride: { id: string; expires_at: string; activated_at: string } | null
  onActivate: () => void
}) {
  if (activeOverride) {
    const expires = new Date(activeOverride.expires_at)
    const remaining = Math.max(0, expires.getTime() - Date.now())
    const hours = Math.floor(remaining / 3600000)
    const mins = Math.floor((remaining % 3600000) / 60000)

    return (
      <div className="bg-gold-soft/50 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-1">
          <Timer size={14} className="text-gold" />
          <span className="text-xs font-bold text-gold">التحكم اليدوي مفعّل</span>
        </div>
        <p className="font-num text-xs text-text-secondary">
          متبقي: {hours} ساعة {mins} دقيقة
        </p>
      </div>
    )
  }

  return (
    <button
      onClick={onActivate}
      className="w-full h-9 rounded-xl bg-gold-soft/50 text-gold text-xs font-bold flex items-center justify-center gap-1.5"
    >
      <AlertTriangle size={13} />
      تفعيل التحكم اليدوي
    </button>
  )
}

function LogModal({
  title,
  fields,
  onSubmit,
  onClose,
}: {
  title: string
  fields: { key: string; label: string; type: string }[]
  onSubmit: (data: Record<string, any>) => Promise<void>
  onClose: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const data: Record<string, any> = {}
      for (const f of fields) {
        data[f.key] = f.type === 'number' ? parseFloat(values[f.key] || '0') : values[f.key] || ''
      }
      await onSubmit(data)
    } catch {
      toast.error('خطأ في الحفظ')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
      <div className="bg-bg-surface w-full max-w-[390px] rounded-t-[20px] p-5 pb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold">{title}</h3>
          <button onClick={onClose} className="text-text-muted text-sm">إلغاء</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs text-text-secondary mb-1">{f.label}</label>
              <input
                type={f.type}
                value={values[f.key] || ''}
                onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                dir={f.type === 'number' ? 'ltr' : undefined}
                className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm font-num focus:outline-none focus:border-blue-primary"
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={saving}
            className="w-full h-11 rounded-xl text-white font-bold text-sm disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #1B4FD8, #7C3AED)' }}
          >
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </form>
      </div>
    </div>
  )
}
