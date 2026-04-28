'use client'
// Universal post-payment landing page. Two audiences:
//   - Subscribers (cookie-auth) coming back from a gateway redirect — they
//     should land on /portal/home so they see the updated invoice state.
//   - Staff (next-auth) who initiated a payment from the manager web UI —
//     they get a `?subscriber=<id>` query param so they jump back to the
//     subscriber detail page they came from.
// Both come through the same URL because the gateway-callback handler
// doesn't know who initiated the payment; we infer from the query string.

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'

function SuccessInner() {
  const params = useSearchParams()
  const subscriberId = params?.get('subscriber') || ''

  // Default destination — the subscriber portal — covers the common case
  // (gateway redirect from a portal-initiated payment). Staff-initiated
  // flows still get back to the subscriber detail page via ?subscriber=.
  const href = subscriberId ? `/staff/subscribers/${subscriberId}` : '/portal/home'
  const label = subscriberId ? 'العودة' : 'العودة لصفحتي'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(5,150,105,0.1)' }}>
        <CheckCircle2 className="w-10 h-10" style={{ color: '#059669' }} />
      </div>
      <h1 className="text-xl font-bold mb-2">تم الدفع بنجاح ✅</h1>
      <p className="text-sm text-text-muted mb-6">شكراً لك — تم تسجيل الدفعة الإلكترونية</p>
      <Link href={href}
        className="h-11 px-6 rounded-xl text-white text-sm font-bold flex items-center justify-center"
        style={{ background: '#1B4FD8' }}>
        {label}
      </Link>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <SuccessInner />
    </Suspense>
  )
}
