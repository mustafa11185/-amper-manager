'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Phone, Lock, KeyRound, Loader2 } from 'lucide-react'

type LoginTab = 'owner' | 'staff'

export default function LoginContent() {
  const router = useRouter()
  const [tab, setTab] = useState<LoginTab>('owner')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!phone || !password) {
      toast.error('يرجى ملء جميع الحقول')
      return
    }

    setLoading(true)
    const res = await signIn('credentials', {
      phone,
      password,
      role: tab,
      redirect: false,
    })
    setLoading(false)

    if (res?.error) {
      toast.error(tab === 'owner' ? 'رقم الهاتف أو كلمة المرور غير صحيحة' : 'رقم الهاتف أو الرمز غير صحيح')
      return
    }

    const session = await fetch('/api/auth/session').then(r => r.json())
    const role = session?.user?.role

    if (role === 'operator') {
      router.push('/staff/attendance')
    } else {
      router.push('/staff/dashboard')
    }
  }

  return (
    <div className="min-h-dvh bg-bg-base flex items-center justify-center px-4">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 20%, rgba(27,79,216,0.06) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(124,58,237,0.05) 0%, transparent 50%)',
        }}
      />

      <div className="relative w-full max-w-[360px]">
        <div
          className="bg-bg-surface rounded-[20px] p-6 pt-8"
          style={{ boxShadow: 'var(--shadow-lg)' }}
        >
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 mb-3">
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="logoGrad" x1="0" y1="0" x2="48" y2="48">
                    <stop offset="0%" stopColor="#7C3AED" />
                    <stop offset="100%" stopColor="#1B4FD8" />
                  </linearGradient>
                </defs>
                <path
                  d="M24 2L43.5 13.25V35.75L24 46L4.5 35.75V13.25L24 2Z"
                  fill="url(#logoGrad)"
                />
                <path
                  d="M24 14L16 28H22L20 34L32 22H26L28 14H24Z"
                  fill="white"
                />
              </svg>
            </div>
            <h1 className="font-rajdhani text-xl font-bold text-text-primary tracking-tight">
              Amper
            </h1>
            <p className="text-text-muted text-sm">تسجيل الدخول</p>
          </div>

          <div className="flex bg-bg-muted rounded-xl p-1 mb-6">
            <button
              type="button"
              onClick={() => { setTab('owner'); setPhone(''); setPassword('') }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === 'owner'
                  ? 'bg-bg-surface text-blue-primary shadow-sm'
                  : 'text-text-muted'
              }`}
            >
              المالك
            </button>
            <button
              type="button"
              onClick={() => { setTab('staff'); setPhone(''); setPassword('') }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === 'staff'
                  ? 'bg-bg-surface text-blue-primary shadow-sm'
                  : 'text-text-muted'
              }`}
            >
              الموظف
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                رقم الهاتف
              </label>
              <div className="relative">
                <Phone size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07xxxxxxxxx"
                  dir="ltr"
                  className="w-full h-11 pr-10 pl-4 rounded-xl border border-border bg-bg-base text-text-primary text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-blue-primary focus:ring-2 focus:ring-blue-primary/10 transition-all font-data"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                {tab === 'owner' ? 'كلمة المرور' : 'الرمز السري (PIN)'}
              </label>
              <div className="relative">
                {tab === 'owner' ? (
                  <Lock size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
                ) : (
                  <KeyRound size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
                )}
                <input
                  type={tab === 'staff' ? 'tel' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tab === 'owner' ? '••••••••' : '••••'}
                  dir="ltr"
                  maxLength={tab === 'staff' ? 6 : undefined}
                  className="w-full h-11 pr-10 pl-4 rounded-xl border border-border bg-bg-base text-text-primary text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-blue-primary focus:ring-2 focus:ring-blue-primary/10 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #1B4FD8, #7C3AED)',
                boxShadow: '0 4px 20px rgba(27,79,216,0.25)',
              }}
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                'تسجيل الدخول'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-text-muted text-xs mt-4">
          أمبير — إدارة المولدات
        </p>
      </div>
    </div>
  )
}
