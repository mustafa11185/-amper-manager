'use client'
// Invoice generation debug page. Visit /invoices/debug in the manager-app
// web UI after logging in as owner/manager — fetches the diagnostic
// endpoint using the existing session cookie and renders everything
// in Arabic. Zero terminal / console knowledge required.
//
// Also exposes three one-click actions:
//   - Run generate (live)
//   - Run generate dry-run (via diagnostic simulation — read-only)
//   - Reverse last generation

import { useEffect, useState } from 'react'

type Diagnostic = {
  branch: { id: string; name: string }
  now: string
  billing_period: { month: number; year: number }
  pricing: { price_per_amp_normal: number; price_per_amp_gold: number } | null
  active_subscribers: number
  current_month_invoices: {
    total: number
    subscribers_with_invoice: number
    subscribers_without_invoice: number
    missing_subscribers?: Array<{ id: string; name: string }>
    by_state: {
      fully_paid: number
      partially_paid: number
      unpaid: number
      rolled_to_debt: number
    }
  }
  past_unpaid: {
    count: number
    affected_subscribers: number
    total_amount: number
  }
  simulation: {
    would_create: number
    would_update: number
    would_skip: number
    would_roll_to_debt_count: number
    would_roll_to_debt_amount: number
    expected_revenue: number
    blocked_by_daily_lock: boolean
  }
  last_generation_log: {
    id: string
    generated_at: string
    invoice_count: number
    debt_count: number
    is_reversed: boolean
    reversed_at: string | null
    billing_month: number
    billing_year: number
  } | null
}

export default function InvoicesDebugPage() {
  const [data, setData] = useState<Diagnostic | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/invoices/diagnostic', { credentials: 'include' })
      const j = await r.json()
      if (!r.ok) {
        setError(j.error || 'خطأ غير معروف')
      } else {
        setData(j)
      }
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const runGenerate = async () => {
    if (!data) return
    if (!confirm(`هل أنت متأكد من إصدار فواتير ${data.simulation.would_create} مشترك جديد + تحديث ${data.simulation.would_update}؟`)) return
    setRunning(true)
    setActionMessage(null)
    try {
      const r = await fetch('/api/invoices/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: data.branch.id }),
      })
      const j = await r.json()
      if (!r.ok) {
        setActionMessage('❌ فشل: ' + (j.error || r.statusText))
      } else {
        setActionMessage(
          `✅ تم بنجاح!\n\nأُنشئت: ${j.generated}\nحُدّثت: ${j.updated ?? 0}\nتُخطّيت: ${j.skipped ?? 0}\nديون أُضيفت: ${j.debts_added ?? 0}`,
        )
        setTimeout(load, 500)
      }
    } catch (e) {
      setActionMessage('❌ خطأ: ' + (e as Error).message)
    }
    setRunning(false)
  }

  const runReverse = async () => {
    if (!data) return
    if (!confirm('عكس آخر إصدار فواتير؟ سيتم حذف الفواتير الجديدة وإعادة الديون للحالة السابقة.')) return
    setRunning(true)
    setActionMessage(null)
    try {
      const r = await fetch('/api/invoices/reverse-last-generation', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: data.branch.id }),
      })
      const j = await r.json()
      if (!r.ok) {
        setActionMessage('❌ فشل: ' + (j.error || r.statusText))
      } else {
        setActionMessage('✅ تم عكس آخر إصدار بنجاح')
        setTimeout(load, 500)
      }
    } catch (e) {
      setActionMessage('❌ خطأ: ' + (e as Error).message)
    }
    setRunning(false)
  }

  const runCleanup = async () => {
    if (!data) return
    if (!confirm('تنظيف الحالة المتسخة: سيُعيد كل الفواتير المُعلَّمة rolled_to_debt في الشهر الحالي إلى غير مدفوعة. استعمل فقط إذا عندك فواتير الشهر الحالي في حالة متسخة.')) return
    setRunning(true)
    setActionMessage(null)
    try {
      const r = await fetch('/api/invoices/cleanup-current-month', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: data.branch.id }),
      })
      const j = await r.json()
      if (!r.ok) {
        setActionMessage('❌ فشل: ' + (j.error || r.statusText))
      } else {
        setActionMessage(`✅ تم تنظيف ${j.cleaned ?? 0} فاتورة`)
        setTimeout(load, 500)
      }
    } catch (e) {
      setActionMessage('❌ خطأ: ' + (e as Error).message)
    }
    setRunning(false)
  }

  // "إصدار المتبقين فقط" — calls generate-new-only which creates
  // invoices for every active subscriber that doesn't already have
  // one for the current billing period. Safe to run repeatedly: it
  // never touches existing invoices and never rolls anything to debt.
  const runGenerateMissing = async () => {
    if (!data) return
    const missing = data.current_month_invoices.subscribers_without_invoice
    if (missing === 0) {
      setActionMessage('✅ لا يوجد مشتركون بلا فاتورة — كل شي تمام')
      return
    }
    if (!confirm(`إنشاء فواتير فقط للـ ${missing} مشترك الذين بلا فاتورة؟ لن يمسّ الموجود.`)) return
    setRunning(true)
    setActionMessage(null)
    try {
      const r = await fetch('/api/invoices/generate-new-only', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: data.branch.id }),
      })
      const j = await r.json()
      if (!r.ok) {
        setActionMessage('❌ فشل: ' + (j.error || r.statusText))
      } else {
        setActionMessage(`✅ تم إنشاء ${j.invoices_created ?? 0} فاتورة جديدة للمتبقين`)
        setTimeout(load, 500)
      }
    } catch (e) {
      setActionMessage('❌ خطأ: ' + (e as Error).message)
    }
    setRunning(false)
  }

  if (loading)
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        جاري تحميل التشخيص...
      </div>
    )

  if (error)
    return (
      <div style={{ padding: 20, color: 'red', textAlign: 'center' }}>
        خطأ: {error}
        <br />
        <button onClick={load} style={btn}>إعادة المحاولة</button>
      </div>
    )

  if (!data) return null

  const st = data.current_month_invoices.by_state
  const hasDirtyState = st.rolled_to_debt > 0
  const missingInvoices =
    data.current_month_invoices.subscribers_without_invoice > 0

  return (
    <div dir="rtl" style={{ padding: 16, fontFamily: 'system-ui', maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>
        🔧 تشخيص إصدار الفواتير
      </h1>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
        الفرع: <b>{data.branch.name}</b> •{' '}
        الشهر: <b>{data.billing_period.month}/{data.billing_period.year}</b>
      </div>

      {/* Warnings */}
      {hasDirtyState && (
        <div style={warn}>
          ⚠️ حالة متسخة: توجد {st.rolled_to_debt} فاتورة في الشهر الحالي مُعلَّمة <code>rolled_to_debt</code>. استعمل زر "تنظيف الحالة المتسخة" قبل إعادة الإصدار.
        </div>
      )}
      {missingInvoices && !hasDirtyState && (
        <div style={warn}>
          ⚠️ {data.current_month_invoices.subscribers_without_invoice} مشترك بدون فاتورة للشهر الحالي. اضغط "إصدار الفواتير" لإنشائها.
        </div>
      )}
      {data.simulation.blocked_by_daily_lock && (
        <div style={errBox}>
          ❌ القفل اليومي مفعّل — تم إصدار سابق اليوم. اضغط "عكس آخر إصدار" أولاً.
        </div>
      )}

      {/* State */}
      <h2 style={h2}>📊 الحالة الحالية</h2>
      <div style={grid}>
        <Row label="مشتركون نشطون" value={data.active_subscribers.toString()} />
        <Row label="فواتير الشهر الحالي" value={data.current_month_invoices.total.toString()} />
        <Row label="مشتركون عندهم فاتورة" value={data.current_month_invoices.subscribers_with_invoice.toString()} />
        <Row
          label="مشتركون بدون فاتورة"
          value={data.current_month_invoices.subscribers_without_invoice.toString()}
          bad={missingInvoices}
        />
      </div>

      {data.current_month_invoices.missing_subscribers && data.current_month_invoices.missing_subscribers.length > 0 && (
        <div style={{ ...box, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', marginTop: 10 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>🚨 المشتركون بدون فاتورة للشهر الحالي:</div>
          <div style={{ maxHeight: 180, overflowY: 'auto', fontSize: 12, lineHeight: 1.8 }}>
            {data.current_month_invoices.missing_subscribers.map((s, i) => (
              <div key={s.id}>
                {i + 1}. {s.name}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: '#7f1d1d' }}>
            اضغط زر "📋 إصدار المتبقين فقط" لإنشاء فواتيرهم بضغطة واحدة.
          </div>
        </div>
      )}

      <h2 style={h2}>📋 تقسيم فواتير الشهر الحالي</h2>
      <div style={grid}>
        <Row label="مدفوعة كلياً ✓" value={st.fully_paid.toString()} />
        <Row label="مدفوعة جزئياً" value={st.partially_paid.toString()} />
        <Row label="غير مدفوعة" value={st.unpaid.toString()} />
        <Row
          label="rolled_to_debt (متسخة)"
          value={st.rolled_to_debt.toString()}
          bad={st.rolled_to_debt > 0}
        />
      </div>

      <h2 style={h2}>🔮 محاكاة: لو أصدرت الآن</h2>
      <div style={grid}>
        <Row label="سيُنشأ" value={data.simulation.would_create.toString()} good={data.simulation.would_create > 0} />
        <Row label="سيُحدَّث" value={data.simulation.would_update.toString()} />
        <Row label="سيُتخطّى" value={data.simulation.would_skip.toString()} bad={data.simulation.would_skip > 0} />
        <Row label="ديون جديدة (مشترك)" value={data.simulation.would_roll_to_debt_count.toString()} />
        <Row label="ديون جديدة (مبلغ)" value={fmt(data.simulation.would_roll_to_debt_amount)} />
        <Row label="الإيراد المتوقع" value={fmt(data.simulation.expected_revenue)} />
      </div>

      <h2 style={h2}>📜 آخر إصدار</h2>
      {data.last_generation_log ? (
        <div style={grid}>
          <Row label="التاريخ" value={new Date(data.last_generation_log.generated_at).toLocaleString('ar-IQ')} />
          <Row label="عدد الفواتير" value={data.last_generation_log.invoice_count.toString()} />
          <Row label="ديون" value={data.last_generation_log.debt_count.toString()} />
          <Row
            label="معكوس"
            value={data.last_generation_log.is_reversed ? 'نعم' : 'لا'}
          />
        </div>
      ) : (
        <div style={{ color: '#64748b', fontSize: 13 }}>لا يوجد إصدار سابق</div>
      )}

      {actionMessage && (
        <div
          style={{
            ...box,
            background: actionMessage.startsWith('✅') ? '#dcfce7' : '#fef2f2',
            color: actionMessage.startsWith('✅') ? '#166534' : '#991b1b',
            whiteSpace: 'pre-line',
          }}
        >
          {actionMessage}
        </div>
      )}

      <h2 style={h2}>⚡ إجراءات</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <button onClick={runGenerate} disabled={running} style={btnPrimary}>
          📋 إصدار الفواتير الآن
        </button>
        <button
          onClick={runGenerateMissing}
          disabled={running || data.current_month_invoices.subscribers_without_invoice === 0}
          style={{
            ...btnPrimary,
            background: data.current_month_invoices.subscribers_without_invoice > 0 ? '#10b981' : btnPrimary.background,
          }}
        >
          📋 إصدار المتبقين فقط ({data.current_month_invoices.subscribers_without_invoice})
        </button>
        <button onClick={runReverse} disabled={running || !data.last_generation_log || data.last_generation_log.is_reversed} style={btnWarn}>
          ↩ عكس آخر إصدار
        </button>
        <button onClick={runCleanup} disabled={running || !hasDirtyState} style={btnDanger}>
          🧹 تنظيف الحالة المتسخة
        </button>
        <button onClick={load} disabled={running} style={btn}>
          🔄 تحديث التشخيص
        </button>
      </div>
    </div>
  )
}

function Row({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #e5e7eb',
        background: bad ? '#fef2f2' : good ? '#dcfce7' : 'white',
      }}
    >
      <span style={{ color: '#64748b', fontSize: 13 }}>{label}</span>
      <b style={{ color: bad ? '#991b1b' : good ? '#166534' : '#0f172a' }}>{value}</b>
    </div>
  )
}

function fmt(n: number) {
  return new Intl.NumberFormat('en').format(n) + ' د.ع'
}

const h2: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  marginTop: 18,
  marginBottom: 8,
  color: '#0f172a',
}
const grid: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  overflow: 'hidden',
  background: 'white',
}
const btn: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  border: '1px solid #e5e7eb',
  background: 'white',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
}
const btnPrimary: React.CSSProperties = {
  ...btn,
  background: '#1a56a0',
  color: 'white',
  border: 'none',
}
const btnWarn: React.CSSProperties = {
  ...btn,
  background: '#f59e0b',
  color: 'white',
  border: 'none',
}
const btnDanger: React.CSSProperties = {
  ...btn,
  background: '#dc2626',
  color: 'white',
  border: 'none',
}
const box: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 600,
  marginTop: 16,
}
const warn: React.CSSProperties = {
  ...box,
  background: '#fef3c7',
  color: '#92400e',
  border: '1px solid #fcd34d',
}
const errBox: React.CSSProperties = {
  ...box,
  background: '#fef2f2',
  color: '#991b1b',
  border: '1px solid #fecaca',
}
