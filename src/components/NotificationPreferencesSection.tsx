'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Save } from 'lucide-react'

type PrefType = {
  key: string
  label: string
  category: string
  category_label: string
  enabled: boolean
}

export default function NotificationPreferencesSection() {
  const [types, setTypes] = useState<PrefType[]>([])
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/notification-preferences', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        setTypes(data.types || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const toggle = (key: string) => {
    setTypes((prev) =>
      prev.map((t) => (t.key === key ? { ...t, enabled: !t.enabled } : t)),
    )
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: types.map((t) => ({ type: t.key, enabled: t.enabled })),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'فشل الحفظ')
      }
      setDirty(false)
      toast.success('تم حفظ التفضيلات')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div
        className="h-32 rounded-2xl animate-pulse"
        style={{ background: 'var(--bg-surface)' }}
      />
    )
  }

  // Group by category, preserving catalog order.
  const groups = new Map<string, { label: string; items: PrefType[] }>()
  for (const t of types) {
    if (!groups.has(t.category)) {
      groups.set(t.category, { label: t.category_label, items: [] })
    }
    groups.get(t.category)!.items.push(t)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold">تفضيلات التنبيهات</h2>
        <p className="text-xs text-text-muted mt-1">
          تحكّم بأنواع التنبيهات التي تصل لحسابك. التعديل يؤثّر على جميع موظفي المولدة.
        </p>
      </div>

      {Array.from(groups.entries()).map(([category, group]) => (
        <div
          key={category}
          className="bg-bg-surface rounded-2xl overflow-hidden"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          <div
            className="px-4 py-2.5 text-xs font-bold text-text-muted"
            style={{ background: 'var(--bg-base)' }}
          >
            {group.label}
          </div>
          {group.items.map((t) => (
            <div
              key={t.key}
              className="px-4 py-3 flex items-center gap-3 border-b border-border last:border-0"
            >
              <span className="flex-1 text-sm">{t.label}</span>
              <button
                onClick={() => toggle(t.key)}
                aria-label={t.label}
                className="relative w-11 h-6 rounded-full transition-colors"
                style={{
                  background: t.enabled ? 'var(--blue-primary)' : '#CBD5E1',
                }}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all"
                  style={{
                    left: t.enabled ? 'calc(100% - 22px)' : '2px',
                  }}
                />
              </button>
            </div>
          ))}
        </div>
      ))}

      <button
        onClick={save}
        disabled={!dirty || saving}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm text-white transition-opacity"
        style={{
          background: 'linear-gradient(135deg, #1B4FD8, #7C3AED)',
          opacity: dirty && !saving ? 1 : 0.5,
          cursor: dirty && !saving ? 'pointer' : 'not-allowed',
        }}
      >
        <Save size={16} />
        {saving ? 'جاري الحفظ...' : 'حفظ التفضيلات'}
      </button>
    </div>
  )
}
