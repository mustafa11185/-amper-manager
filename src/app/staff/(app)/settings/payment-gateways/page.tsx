'use client'
export const dynamic = 'force-dynamic'

// Owner page to enter & enable per-tenant payment-gateway credentials
// (ZainCash, Qi, AsiaPay). Plaintext fields ONLY leave the browser inside
// HTTPS POST to /api/settings/payment-gateways, where they're encrypted
// before being persisted. We never read plaintext back — the GET endpoint
// only returns metadata (enabled/default/test_mode/last_validated).

import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ChevronLeft, ShieldCheck, Lock } from 'lucide-react'

type GatewayName = 'zaincash' | 'qi' | 'asiapay'

interface ConfiguredRow {
  gateway: GatewayName
  is_enabled: boolean
  is_default: boolean
  is_test_mode: boolean
  display_name: string | null
  last_validated_at: string | null
  updated_at: string
}

interface FormState {
  // Shared toggles
  is_enabled: boolean
  is_default: boolean
  is_test_mode: boolean
  display_name: string
  // Gateway-specific fields are stored as a free-form record. Each panel
  // reads the keys it needs.
  fields: Record<string, string>
}

const FIELD_DEFS: Record<GatewayName, { key: string; label: string; help?: string; secret?: boolean }[]> = {
  zaincash: [
    { key: 'client_id', label: 'Client ID', help: 'يأتي من ZainCash بعد قبول طلبك' },
    { key: 'client_secret', label: 'Client Secret', secret: true },
    { key: 'api_key', label: 'API Key (لتوقيع JWT)', secret: true, help: 'مختلف عن Client Secret — يستعمل لتحقق توكن callback' },
    { key: 'service_type', label: 'Service Type', help: 'مثل JAWS — يخصصها فريق ZainCash لكل تاجر' },
    { key: 'msisdn', label: 'رقم MSISDN التاجر', help: 'اختياري — للعرض فقط' },
  ],
  qi: [
    { key: 'username', label: 'Username', help: 'يأتي من Qi بعد قبول طلبك' },
    { key: 'password', label: 'Password', secret: true },
    { key: 'terminal_id', label: 'Terminal ID', help: 'X-Terminal-Id — معرّف نقطة البيع' },
  ],
  asiapay: [
    { key: 'app_id', label: 'App ID' },
    { key: 'app_key', label: 'App Key' },
    { key: 'app_secret', label: 'App Secret', secret: true },
    { key: 'private_key', label: 'Private Key (للتوقيع)', secret: true },
    { key: 'merchant_code', label: 'Merchant Code' },
    { key: 'domain_url', label: 'Domain URL', help: 'sandbox أو production كما زوّدتك AsiaPay' },
  ],
}

const GATEWAYS: { name: GatewayName; label: string; tagline: string }[] = [
  { name: 'zaincash', label: 'ZainCash', tagline: 'محفظة Zain — الأكثر انتشاراً' },
  { name: 'qi', label: 'Qi Card', tagline: 'كروت ماستركارد/فيزا' },
  { name: 'asiapay', label: 'AsiaPay', tagline: 'محفظة آسيا حوالة' },
]

export default function PaymentGatewaysPage() {
  const [configured, setConfigured] = useState<ConfiguredRow[]>([])
  const [active, setActive] = useState<GatewayName>('zaincash')
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [loading, setLoading] = useState(true)

  function emptyForm(): FormState {
    return {
      is_enabled: false,
      is_default: false,
      is_test_mode: true,
      display_name: '',
      fields: {},
    }
  }

  async function loadConfigured() {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/payment-gateways')
      if (res.ok) {
        const d = await res.json()
        setConfigured(d.gateways || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadConfigured() }, [])

  // When the active gateway changes, prefill the toggles from the existing
  // row (if any). Plaintext credential fields stay blank — owner re-enters
  // them. This is intentional: the server only returns metadata.
  useEffect(() => {
    const row = configured.find(r => r.gateway === active)
    setForm({
      is_enabled: row?.is_enabled ?? false,
      is_default: row?.is_default ?? false,
      is_test_mode: row?.is_test_mode ?? true,
      display_name: row?.display_name ?? '',
      fields: {},
    })
  }, [active, configured])

  async function testConnection() {
    setTesting(true)
    try {
      const res = await fetch('/api/settings/payment-gateways/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: active }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        toast.success(data.message || '✓ الاتصال ناجح')
        await loadConfigured()
      } else {
        toast.error(data.error || 'فشل الاختبار')
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setTesting(false)
    }
  }

  async function save() {
    const fieldDefs = FIELD_DEFS[active]
    // Required-field check (mirrors server-side validation)
    const required = fieldDefs.filter(f => f.key !== 'msisdn').map(f => f.key)
    for (const k of required) {
      if (!form.fields[k]?.trim()) {
        toast.error(`الحقل ${fieldDefs.find(f => f.key === k)?.label} مطلوب`)
        return
      }
    }
    setSaving(true)
    try {
      const res = await fetch('/api/settings/payment-gateways', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway: active,
          credentials: form.fields,
          is_enabled: form.is_enabled,
          is_default: form.is_default,
          is_test_mode: form.is_test_mode,
          display_name: form.display_name.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل الحفظ')
      toast.success('✓ تم حفظ الإعدادات')
      await loadConfigured()
      // Clear plaintext fields after successful save so they don't linger.
      setForm(f => ({ ...f, fields: {} }))
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const fieldDefs = FIELD_DEFS[active]
  const existingRow = configured.find(r => r.gateway === active)

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-3xl mx-auto px-4">
        <Link href="/staff/settings" className="inline-flex items-center gap-1 text-blue-600 mb-4 hover:underline">
          <ChevronLeft className="w-4 h-4" /> الإعدادات
        </Link>

        <div className="bg-white rounded-xl shadow-sm p-5 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">بوابات الدفع الإلكتروني</h1>
              <p className="text-sm text-gray-600 mt-1">
                لكل بوابة (ZainCash، Qi، AsiaPay) سجّل حساب تاجر بنفسك وأدخل بياناتك أدناه.
                المدفوعات ستدخل حسابك مباشرة — أمبير لا يلمس الأموال.
              </p>
              <p className="text-xs text-amber-600 mt-2 inline-flex items-center gap-1">
                <Lock className="w-3 h-3" /> البيانات السرّية مشفّرة في القاعدة (AES-256-GCM)
              </p>
              <p className="text-xs text-gray-500 mt-2">
                للبوابات القديمة (FuratPay / APS):{' '}
                <Link href="/staff/settings" className="text-blue-600 underline">
                  إعدادات &gt; بوابات قديمة
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Gateway tabs */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {GATEWAYS.map(g => {
            const row = configured.find(c => c.gateway === g.name)
            return (
              <button
                key={g.name}
                onClick={() => setActive(g.name)}
                className={`p-3 rounded-xl border-2 text-right transition ${
                  active === g.name ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="font-bold text-sm text-gray-900 flex items-center justify-between gap-2">
                  {g.label}
                  {row?.is_default && <span className="text-[9px] bg-green-600 text-white px-1.5 py-0.5 rounded">افتراضي</span>}
                </div>
                <div className="text-[11px] text-gray-500 mt-1">{g.tagline}</div>
                <div className="text-[10px] mt-2">
                  {row ? (
                    <span className={row.is_enabled ? 'text-green-600' : 'text-gray-400'}>
                      {row.is_enabled ? '● مفعّل' : '○ غير مفعّل'}
                      {row.is_test_mode && row.is_enabled && ' (تجريبي)'}
                    </span>
                  ) : (
                    <span className="text-gray-400">○ غير مكوّن</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          {loading ? (
            <div className="text-center text-gray-400 py-8">جارٍ التحميل...</div>
          ) : (
            <>
              <h2 className="font-bold text-base text-gray-900 mb-1">
                إعداد {GATEWAYS.find(g => g.name === active)!.label}
              </h2>
              {existingRow && (
                <p className="text-xs text-gray-500 mb-3">
                  آخر تحديث: {new Date(existingRow.updated_at).toLocaleString('ar-IQ')}
                  {' — '}
                  أدخل البيانات مرة أخرى لاستبدالها (لا تظهر بعد الحفظ لأسباب أمنية).
                </p>
              )}

              <div className="space-y-3">
                {fieldDefs.map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {f.label}
                      {f.secret && <Lock className="w-3 h-3 inline mx-1 text-amber-500" />}
                    </label>
                    <input
                      type={f.secret ? 'password' : 'text'}
                      autoComplete="off"
                      value={form.fields[f.key] || ''}
                      onChange={e => setForm(s => ({ ...s, fields: { ...s.fields, [f.key]: e.target.value } }))}
                      placeholder={existingRow ? '••• محفوظ — أدخل قيمة جديدة للاستبدال' : ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    />
                    {f.help && <p className="text-[11px] text-gray-500 mt-1">{f.help}</p>}
                  </div>
                ))}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">اسم العرض (اختياري)</label>
                  <input
                    value={form.display_name}
                    onChange={e => setForm(s => ({ ...s, display_name: e.target.value }))}
                    placeholder="مثلاً: حساب ZainCash الرئيسي"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="border-t mt-5 pt-4 space-y-3">
                <ToggleRow
                  label="تفعيل البوابة"
                  description="عند الإيقاف، لن تظهر للمشتركين كخيار دفع"
                  checked={form.is_enabled}
                  onChange={v => setForm(s => ({ ...s, is_enabled: v }))}
                />
                <ToggleRow
                  label="بيئة تجريبية (UAT/Sandbox)"
                  description="فعّل أثناء الاختبار. أوقفه فقط بعد استلام كريدنشلز Production"
                  checked={form.is_test_mode}
                  onChange={v => setForm(s => ({ ...s, is_test_mode: v }))}
                />
                <ToggleRow
                  label="جعلها البوابة الافتراضية"
                  description="ستُستخدم تلقائياً عندما يدفع المشترك"
                  checked={form.is_default}
                  onChange={v => setForm(s => ({ ...s, is_default: v }))}
                />
              </div>

              <div className="flex gap-2 mt-5">
                <button
                  onClick={save}
                  disabled={saving || testing}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold rounded-lg text-sm"
                >
                  {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
                </button>
                <button
                  onClick={testConnection}
                  disabled={!existingRow || saving || testing}
                  title={!existingRow ? 'احفظ البيانات أولاً قبل الاختبار' : 'يستدعي بوابة الدفع للتحقق من البيانات'}
                  className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 disabled:opacity-40 disabled:cursor-not-allowed font-bold rounded-lg text-sm border border-amber-200"
                >
                  {testing ? 'جارٍ الاختبار...' : '🧪 اختبار الاتصال'}
                </button>
              </div>
              {existingRow?.last_validated_at && (
                <p className="text-[10px] text-gray-400 mt-2 text-left">
                  آخر اختبار ناجح: {new Date(existingRow.last_validated_at).toLocaleString('ar-IQ')}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <div className="text-[11px] text-gray-500">{description}</div>
      </div>
    </div>
  )
}
