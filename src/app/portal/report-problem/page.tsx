'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

const KINDS: { key: string; label: string }[] = [
  { key: 'no_redirect',       label: 'البوابة لم تفتح / لم تظهر صفحة الدفع' },
  { key: 'paid_not_credited', label: 'دفعت لكن الفاتورة لا تزال مفتوحة' },
  { key: 'duplicate_charge',  label: 'سُحب المبلغ مرّتين' },
  { key: 'wrong_amount',      label: 'سُحب مبلغ خاطئ' },
  { key: 'other',             label: 'مشكلة أخرى' },
]

export default function ReportProblemPage() {
  const router = useRouter()
  const [kind, setKind] = useState('no_redirect')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function submit() {
    if (description.trim().length < 10) {
      toast.error('الرجاء كتابة وصف تفصيلي')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/portal/report-payment-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, description: description.trim() }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? 'فشل الإرسال')
      setDone(true)
    } catch (e: any) {
      toast.error(e.message ?? 'فشل الإرسال')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="px-4 py-10 space-y-4 text-center">
        <CheckCircle2 className="w-14 h-14 mx-auto" style={{ color: '#10B981' }} />
        <h1 className="text-lg font-bold">تم استلام بلاغك</h1>
        <p className="text-[12px] leading-7" style={{ color: '#475569' }}>
          سيراجع التاجر البلاغ ويتواصل معك. للحالات المستعجلة استخدم زر «اتصل بالجابي» في الصفحة الرئيسية.
        </p>
        <button onClick={() => router.replace('/portal/home')} className="rounded-xl px-5 py-2 text-sm font-bold mt-4" style={{ background: '#1A56A0', color: '#FFFFFF' }}>
          العودة للرئيسية
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 space-y-4">
      <Toaster position="top-center" />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">الإبلاغ عن مشكلة دفع</h1>
        <Link href="/portal/home?tab=pay" className="rounded-full p-2" style={{ background: '#F1F5F9' }}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold" style={{ color: '#475569' }}>نوع المشكلة</p>
        <div className="space-y-2">
          {KINDS.map(k => (
            <label key={k.key} className="flex items-center gap-2 rounded-xl px-3 py-3 cursor-pointer" style={{ background: kind === k.key ? '#EEF2FF' : '#FFFFFF', border: '1px solid', borderColor: kind === k.key ? '#1A56A0' : 'rgba(0,0,0,0.06)' }}>
              <input type="radio" name="kind" value={k.key} checked={kind === k.key} onChange={() => setKind(k.key)} />
              <span className="text-[13px] flex-1 text-right" style={{ color: '#0F172A' }}>{k.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold" style={{ color: '#475569' }}>الوصف <span style={{ color: '#94A3B8' }}>(تفاصيل قدر الإمكان)</span></p>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="مثلاً: حاولت الدفع الساعة 3:00 عبر Qi، خصم البنك 25,000 د.ع لكن الفاتورة لا تزال مفتوحة في التطبيق."
          rows={6}
          maxLength={2000}
          className="w-full rounded-xl p-3 text-[13px] outline-none"
          style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', resize: 'none' }}
        />
        <p className="text-[10px] text-left" style={{ color: '#94A3B8' }}>{description.length} / 2000</p>
      </div>

      <button
        onClick={submit}
        disabled={submitting}
        className="w-full rounded-xl py-3 text-sm font-bold disabled:opacity-50"
        style={{ background: '#1A56A0', color: '#FFFFFF' }}
      >
        {submitting ? (<span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> جارٍ الإرسال…</span>) : 'إرسال البلاغ'}
      </button>

      <p className="text-center text-[10px] pt-2" style={{ color: '#94A3B8' }}>
        البلاغ يصل لصاحب المولدة. الاسترجاع يتم عبره وليس عبر أمبير.
      </p>
    </div>
  )
}
