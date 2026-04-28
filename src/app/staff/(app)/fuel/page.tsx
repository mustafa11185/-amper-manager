'use client'

import { useState, useEffect } from 'react'
import { Fuel, Droplets, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

type GeneratorFuel = {
  id: string
  name: string
  fuel_level_pct: number | null
  last_fuel_update: string | null
  engines: { id: string; name: string }[]
}

export default function FuelPage() {
  const [generators, setGenerators] = useState<GeneratorFuel[]>([])
  const [loading, setLoading] = useState(true)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [liters, setLiters] = useState('')
  const [cost, setCost] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/engines')
      .then(r => r.json())
      .then(d => { setGenerators(d.generators || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleAddFuel(engineId: string) {
    if (!liters) return
    setSaving(true)
    try {
      const res = await fetch('/api/engines/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine_id: engineId,
          type: 'fuel',
          value: parseFloat(liters),
          cost_iqd: cost ? parseFloat(cost) : undefined,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('تم إضافة الوقود')
      setAddingTo(null)
      setLiters('')
      setCost('')
      // Refresh
      const d = await fetch('/api/engines').then(r => r.json())
      setGenerators(d.generators || [])
    } catch {
      toast.error('خطأ')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-24" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">الوقود</h1>

      {generators.map(gen => (
        <div key={gen.id} className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Fuel size={18} className="text-gold" />
            <h2 className="text-sm font-bold">{gen.name}</h2>
          </div>

          {/* Fuel gauge */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-text-muted">مستوى الوقود</span>
              <span className="font-num text-sm font-bold">{gen.fuel_level_pct ?? 0}%</span>
            </div>
            <div className="h-4 bg-bg-muted rounded-full overflow-hidden">
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

          {/* Add fuel per engine */}
          {gen.engines.map(eng => (
            <div key={eng.id}>
              {addingTo === eng.id ? (
                <div className="space-y-2 mt-2 p-3 bg-bg-muted rounded-xl">
                  <p className="text-xs font-bold">{eng.name} — إضافة وقود</p>
                  <input
                    type="number" dir="ltr" placeholder="الكمية (لتر)"
                    value={liters} onChange={e => setLiters(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-border bg-bg-base text-sm font-num"
                  />
                  <input
                    type="number" dir="ltr" placeholder="التكلفة (د.ع) — اختياري"
                    value={cost} onChange={e => setCost(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-border bg-bg-base text-sm font-num"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setAddingTo(null)} className="flex-1 h-9 rounded-lg bg-bg-surface border border-border text-xs font-bold text-text-muted">إلغاء</button>
                    <button
                      onClick={() => handleAddFuel(eng.id)}
                      disabled={saving || !liters}
                      className="flex-1 h-9 rounded-lg bg-gold text-white text-xs font-bold disabled:opacity-60"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'إضافة'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingTo(eng.id)}
                  className="w-full h-10 mt-2 rounded-xl bg-gold-soft text-gold text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Droplets size={14} />
                  إضافة وقود — {eng.name}
                </button>
              )}
            </div>
          ))}
        </div>
      ))}

      {generators.length === 0 && (
        <p className="text-center text-text-muted text-sm py-8">لا توجد مولدات</p>
      )}
    </div>
  )
}
