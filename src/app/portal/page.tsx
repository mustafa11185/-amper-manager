'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import AmperLogoBrand from "@/components/AmperLogoBrand"

export default function HomePage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Check if already logged in (via localStorage — httpOnly cookie not readable from JS)
  useEffect(() => {
    const saved = localStorage.getItem('amper_code')

    // Auto-login via ?code= query param (from printed QR)
    const params = new URLSearchParams(window.location.search)
    const qrCode = params.get('code')
    const codeToUse = qrCode
      ? qrCode.toUpperCase().trim().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '')
      : saved

    if (!codeToUse || codeToUse.length < 6) return

    setLoading(true)
    fetch('/api/portal/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codeToUse }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          localStorage.setItem('amper_code', codeToUse)
          router.replace('/portal/home')
        } else {
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))
  }, [router])

  function cleanCode(raw: string): string {
    return raw.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '')
  }

  function handleChange(raw: string) {
    setCode(cleanCode(raw))
    setError('')
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text')
    setCode(cleanCode(pasted))
    setError('')
  }

  async function handleSubmit() {
    const c = cleanCode(code)
    if (c.length < 10) { setError('ادخل الكود كاملاً'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/portal/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c }),
      })
      const data = await res.json()
      if (data.ok) {
        localStorage.setItem('amper_code', c)
        router.push('/portal/home')
      } else {
        setError(data.error || 'الكود غير صحيح')
        setCode('')
        inputRef.current?.focus()
      }
    } catch (err: any) {
      setError(`خطأ في الاتصال${err?.message ? ': ' + err.message : ''}`)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: '#FFFFFF' }}>
      {/* Top gradient section */}
      <div style={{
        background: 'linear-gradient(135deg, #1A56A0, #2563EB)',
        padding: '60px 24px 48px',
        textAlign: 'center',
        color: 'white',
        borderRadius: '0 0 32px 32px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <AmperLogoBrand variant="icon" size="xl" />
        </div>
        <h1 className="text-3xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>أمبير</h1>
        <p className="text-sm mt-2" style={{ opacity: 0.7 }}>نظام إدارة المولدات الذكي</p>
      </div>

      {/* Bottom white section with form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-[340px] space-y-6 text-center">
          <p className="text-base font-bold" style={{ color: '#0F172A' }}>ادخل كودك</p>

          {/* Code input */}
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            value={code}
            onChange={e => handleChange(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="BG-05-001-482"
            dir="ltr"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full text-center font-mono font-bold outline-none tracking-wider"
            style={{
              height: 56,
              fontSize: 22,
              background: '#F8F9FF',
              border: code ? '1.5px solid #1A56A0' : '1.5px solid rgba(0,0,0,0.06)',
              borderRadius: 14,
              color: '#0F172A',
              caretColor: '#1A56A0',
              boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
            }}
          />

          {error && <p className="text-xs font-bold" style={{ color: '#C62828' }}>{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={loading || cleanCode(code).length < 10}
            className="w-full h-14 text-white text-base font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: '#1A56A0', borderRadius: 14 }}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {loading ? 'جاري الدخول...' : 'دخول'}
          </button>

          <p className="text-xs" style={{ color: '#8E8E93' }}>الكود مطبوع على إيصال الدفع أو رسالة واتساب من مولدتك</p>
          <p className="text-[10px]" style={{ color: '#94A3B8' }}>مدعوم من أمبير ⚡ · v2.6</p>
        </div>
      </div>
    </div>
  )
}
