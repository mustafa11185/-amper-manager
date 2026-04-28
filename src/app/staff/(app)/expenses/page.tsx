'use client'

import { useEffect, useState } from 'react'
import { Receipt, Plus, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

const CATEGORIES = ['وقود', 'زيت', 'صيانة', 'رواتب', 'إيجار', 'أخرى']

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ category: 'وقود', amount: '', description: '' })
  const [saving, setSaving] = useState(false)

  function refresh() {
    fetch('/api/expenses').then(r => r.json()).then(d => { setExpenses(d.expenses || []); setTotal(d.monthly_total || 0); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => { refresh() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount) return
    setSaving(true)
    try {
      const res = await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (res.ok) { toast.success('تم إضافة المصروف'); setShowAdd(false); setForm({ category: 'وقود', amount: '', description: '' }); refresh() }
    } catch { toast.error('خطأ') }
    setSaving(false)
  }

  const fmt = (n: number) => Number(n).toLocaleString('en')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold flex items-center gap-2"><Receipt size={18} className="text-gold" /> المصروفات</h1>
        <button onClick={() => setShowAdd(true)} className="h-8 px-3 rounded-xl text-xs font-bold text-white" style={{ background: 'var(--blue-primary)' }}>+ مصروف</button>
      </div>

      <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
        <p className="text-[10px] text-text-muted mb-1">مصروفات الشهر</p>
        <p className="font-num text-xl font-bold text-gold">{fmt(total)} <span className="text-xs text-text-muted">د.ع</span></p>
      </div>

      <div className="bg-bg-surface rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-md)' }}>
        {loading ? <div className="p-8 text-center text-sm text-text-muted">جاري التحميل...</div> : expenses.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-muted">لا توجد مصروفات هذا الشهر</div>
        ) : expenses.map((exp: any, i: number) => (
          <div key={exp.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: i < expenses.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div>
              <p className="text-sm font-bold">{exp.category}</p>
              <p className="text-xs text-text-muted">{exp.description || '—'} · {new Date(exp.created_at).toLocaleDateString('en')}</p>
            </div>
            <span className="font-num text-sm font-bold text-gold">{fmt(exp.amount)} <span className="text-[10px] text-text-muted">د.ع</span></span>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
          <div className="bg-bg-surface w-full max-w-[390px] rounded-t-[20px] p-5 pb-8">
            <h3 className="text-sm font-bold mb-3">مصروف جديد</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="المبلغ (د.ع)" dir="ltr"
                className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base font-num text-sm" />
              <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="ملاحظات (اختياري)"
                className="w-full h-10 px-3 rounded-xl border border-border bg-bg-base text-sm" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 h-10 rounded-xl bg-bg-muted text-text-muted text-xs font-bold">إلغاء</button>
                <button type="submit" disabled={saving || !form.amount} className="flex-1 h-10 rounded-xl bg-blue-primary text-white text-xs font-bold disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'حفظ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
