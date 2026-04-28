'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Camera, MapPin, Clock, StopCircle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

type ShiftData = {
  id: string
  check_in_at: string | null
  check_out_at: string | null
  hours_worked: number | null
  status: string
}

export default function AttendancePage() {
  const { data: session } = useSession()
  const [shift, setShift] = useState<ShiftData | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    // Get today's shift
    fetch(`/api/operator/shifts?staff_id=${(session?.user as any)?.id}&limit=1`)
      .then(r => r.json())
      .then(data => {
        const today = new Date().toISOString().split('T')[0]
        const todayShift = data.shifts?.find((s: any) =>
          new Date(s.shift_date).toISOString().split('T')[0] === today
        )
        setShift(todayShift || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session])

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    )
  }, [])

  const isCheckedIn = shift?.check_in_at && !shift?.check_out_at

  async function handleCheckIn() {
    setProcessing(true)
    try {
      const res = await fetch('/api/operator/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gps_lat: gps?.lat,
          gps_lng: gps?.lng,
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setShift(data.shift)
      toast.success('تم تسجيل الحضور')
    } catch {
      toast.error('خطأ في تسجيل الحضور')
    }
    setProcessing(false)
  }

  async function handleCheckOut() {
    setProcessing(true)
    try {
      const res = await fetch('/api/operator/check-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gps_lat: gps?.lat,
          gps_lng: gps?.lng,
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setShift(data.shift)
      toast.success('تم إنهاء الدوام')
    } catch {
      toast.error('خطأ في إنهاء الدوام')
    }
    setProcessing(false)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    )
  }

  // Not checked in — full screen check-in
  if (!isCheckedIn && !shift?.check_out_at) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="w-24 h-24 rounded-full bg-blue-soft flex items-center justify-center">
          <Camera size={40} className="text-blue-primary" />
        </div>

        <div className="text-center">
          <h1 className="text-xl font-bold mb-1">سجّل حضورك</h1>
          <p className="text-sm text-text-muted">التقط صورة وحدد موقعك لبدء الدوام</p>
        </div>

        {gps ? (
          <div className="flex items-center gap-1.5 text-xs text-success">
            <MapPin size={12} />
            <span>تم تحديد الموقع</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <MapPin size={12} />
            <span>جاري تحديد الموقع...</span>
          </div>
        )}

        <button
          onClick={handleCheckIn}
          disabled={processing}
          className="w-48 h-14 rounded-2xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          style={{
            background: 'linear-gradient(135deg, #1B4FD8, #7C3AED)',
            boxShadow: '0 8px 30px rgba(27,79,216,0.3)',
          }}
        >
          {processing ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <>
              <Camera size={18} />
              تسجيل الحضور
            </>
          )}
        </button>
      </div>
    )
  }

  // Checked in — show status
  if (isCheckedIn) {
    const checkInTime = new Date(shift!.check_in_at!)
    const elapsed = (Date.now() - checkInTime.getTime()) / 3600000

    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold">الدوام</h1>

        {/* Status card */}
        <div className="bg-bg-surface rounded-2xl p-5" style={{ boxShadow: 'var(--shadow-md)' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
              <Clock size={24} className="text-success" />
            </div>
            <div>
              <p className="text-sm font-bold text-success">أنت في الدوام</p>
              <p className="text-xs text-text-muted">
                منذ {checkInTime.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          <div className="bg-bg-muted rounded-xl p-4 text-center mb-4">
            <p className="text-xs text-text-muted mb-1">ساعات العمل</p>
            <p className="font-num text-3xl font-bold text-text-primary">
              {Math.floor(elapsed)}
              <span className="text-lg">:{String(Math.floor((elapsed % 1) * 60)).padStart(2, '0')}</span>
            </p>
          </div>

          <button
            onClick={handleCheckOut}
            disabled={processing}
            className="w-full h-12 rounded-xl bg-danger/10 text-danger font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {processing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                <StopCircle size={18} />
                إنهاء الدوام
              </>
            )}
          </button>
        </div>

        {/* Quick access */}
        <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <p className="text-xs text-text-muted mb-2">الإجراءات المتاحة</p>
          <div className="grid grid-cols-2 gap-2">
            <a href="/op-engines" className="h-12 rounded-xl bg-blue-soft text-blue-primary text-xs font-bold flex items-center justify-center gap-1.5">
              ⚡ المحركات
            </a>
            <a href="/op-logs" className="h-12 rounded-xl bg-violet-soft text-violet text-xs font-bold flex items-center justify-center gap-1.5">
              📋 سجلاتي
            </a>
          </div>
        </div>
      </div>
    )
  }

  // Shift completed
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">الدوام</h1>
      <div className="bg-bg-surface rounded-2xl p-5 text-center" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
          <Clock size={28} className="text-success" />
        </div>
        <p className="text-sm font-bold text-success mb-1">تم إنهاء الدوام</p>
        <p className="font-num text-lg font-bold">
          {Number(shift?.hours_worked || 0).toFixed(1)} ساعة
        </p>
      </div>
    </div>
  )
}
