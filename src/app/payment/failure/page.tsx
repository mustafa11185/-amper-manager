'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AmperLogoBrand from "@/components/AmperLogoBrand"

function FailureContent() {
  const router = useRouter()
  const params = useSearchParams()
  const ref = params?.get('ref') ?? ''
  // Auto-redirect after 30 seconds — long enough for the user to read what
  // happened and decide whether to retry. Earlier 8s was too aggressive.
  const [countdown, setCountdown] = useState(30)

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(timer); router.push('/portal/home?tab=pay'); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [router])

  return (
    <div dir="rtl" style={{
      minHeight: '100dvh',
      background: '#FFF5F5',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 16, padding: '40px 24px',
        textAlign: 'center', maxWidth: 360, width: '100%',
        boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
      }}>
        <AmperLogoBrand width={56} />
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: '#C62828',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '20px auto 16px', color: 'white', fontSize: 32, fontWeight: 700,
        }}>✕</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>لم تكتمل عملية الدفع</h2>
        <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 4 }}>
          ربما تم إلغاء العملية أو رفضها من البوابة.
        </p>
        <p style={{ fontSize: 12, color: '#94A3B8', marginBottom: 20 }}>
          لم يُسحب أي مبلغ — يمكنك المحاولة مرة أخرى أو طلب الجابي.
        </p>
        {ref && (
          <p style={{ fontSize: 10, color: '#CBD5E1', marginBottom: 20, fontFamily: 'monospace' }}>
            #{ref.slice(0, 8)}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => router.push('/portal/home?tab=pay')}
            style={{
              background: '#1B4FD8', color: 'white', border: 'none',
              padding: '12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700,
              cursor: 'pointer', width: '100%',
            }}
          >
            🔄 حاول مرة أخرى
          </button>
          <button
            onClick={() => router.push('/portal/home?tab=contact')}
            style={{
              background: 'transparent', color: '#1B4FD8',
              border: '1px solid rgba(27,79,216,0.25)',
              padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', width: '100%',
            }}
          >
            📞 اطلب الجابي بدلاً من الدفع
          </button>
          <p style={{ fontSize: 10, color: '#CBD5E1', marginTop: 4 }}>
            إعادة توجيه تلقائية خلال {countdown}ث
          </p>
        </div>
      </div>
    </div>
  )
}

export default function PaymentFailurePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#FFF5F5' }} />}>
      <FailureContent />
    </Suspense>
  )
}
