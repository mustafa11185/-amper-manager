'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Clock, Calendar, ChevronLeft } from 'lucide-react'

type Shift = {
  id: string
  shift_date: string
  check_in_at: string | null
  check_out_at: string | null
  hours_worked: number | null
  status: string
}

export default function OpLogsPage() {
  const { data: session } = useSession()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week')

  useEffect(() => {
    const staffId = (session?.user as any)?.id
    if (!staffId) return

    const limit = period === 'today' ? 1 : period === 'week' ? 7 : 30
    fetch(`/api/operator/shifts?staff_id=${staffId}&limit=${limit}`)
      .then(r => r.json())
      .then(data => { setShifts(data.shifts || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [session, period])

  const totalHours = shifts.reduce((acc, s) => acc + (Number(s.hours_worked) || 0), 0)

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">سجلاتي</h1>

      {/* Period tabs */}
      <div className="flex bg-bg-muted rounded-xl p-1">
        {([
          { key: 'today', label: 'اليوم' },
          { key: 'week', label: 'الأسبوع' },
          { key: 'month', label: 'الشهر' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => { setPeriod(t.key); setLoading(true) }}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
              period === t.key ? 'bg-bg-surface text-blue-primary shadow-sm' : 'text-text-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="bg-bg-surface rounded-2xl p-4 text-center" style={{ boxShadow: 'var(--shadow-md)' }}>
        <p className="text-xs text-text-muted mb-1">إجمالي الساعات</p>
        <p className="font-num text-3xl font-bold text-blue-primary">
          {totalHours.toFixed(1)}
          <span className="text-sm mr-1">ساعة</span>
        </p>
        <p className="text-xs text-text-muted mt-1">{shifts.length} وردية</p>
      </div>

      {/* Timeline */}
      <div className="space-y-2">
        {shifts.length === 0 ? (
          <p className="text-center text-sm text-text-muted py-4">لا توجد سجلات</p>
        ) : shifts.map(shift => {
          const date = new Date(shift.shift_date)
          const dayName = date.toLocaleDateString('ar-IQ', { weekday: 'short' })
          const dateStr = date.toLocaleDateString('ar-IQ', { day: 'numeric', month: 'short' })

          return (
            <div
              key={shift.id}
              className="bg-bg-surface rounded-2xl p-3.5 flex items-center gap-3"
              style={{ boxShadow: 'var(--shadow-sm)' }}
            >
              {/* Date badge */}
              <div className="w-12 h-12 rounded-xl bg-bg-muted flex flex-col items-center justify-center shrink-0">
                <span className="text-[10px] text-text-muted">{dayName}</span>
                <span className="font-num text-xs font-bold">{dateStr}</span>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    shift.status === 'completed' ? 'bg-success' :
                    shift.status === 'checked_in' ? 'bg-blue-primary' :
                    'bg-text-muted'
                  }`} />
                  <span className="text-xs font-medium">
                    {shift.status === 'completed' ? 'مكتمل' :
                     shift.status === 'checked_in' ? 'جاري' : 'متوقع'}
                  </span>
                </div>
                {shift.check_in_at && (
                  <p className="text-[11px] text-text-muted mt-0.5">
                    {new Date(shift.check_in_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                    {shift.check_out_at && (
                      <> — {new Date(shift.check_out_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}</>
                    )}
                  </p>
                )}
              </div>

              {/* Hours */}
              {shift.hours_worked !== null && (
                <div className="text-left shrink-0">
                  <p className="font-num text-sm font-bold text-blue-primary">
                    {Number(shift.hours_worked).toFixed(1)}
                  </p>
                  <p className="text-[10px] text-text-muted">ساعة</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
