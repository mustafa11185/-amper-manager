'use client'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
export default function PaymentSuccessPage() {
  const params = useSearchParams()
  const subscriberId = params?.get('subscriber') || ''

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(5,150,105,0.1)' }}>
        <CheckCircle2 className="w-10 h-10" style={{ color: '#059669' }} />
      </div>
      <h1 className="text-xl font-bold mb-2">تم الدفع بنجاح ✅</h1>
      <p className="text-sm text-text-muted mb-6">شكراً لك — تم تسجيل الدفعة الإلكترونية</p>
      <Link href={subscriberId ? `/staff/subscribers/${subscriberId}` : '/staff/dashboard'}
        className="h-11 px-6 rounded-xl text-white text-sm font-bold flex items-center justify-center"
        style={{ background: '#1B4FD8' }}>
        العودة
      </Link>
    </div>
  )
}