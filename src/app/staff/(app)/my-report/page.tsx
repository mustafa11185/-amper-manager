'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import {
  Send, Banknote, Smartphone, CreditCard, Loader2, CheckCircle2,
  Wallet, TrendingUp, Receipt,
} from 'lucide-react'
import toast from 'react-hot-toast'
import ExpenseButton from '@/components/ExpenseButton'

type ShiftData = {
  check_in_at: string | null
  check_out_at: string | null
  target_subscribers: number
  visited_subscribers: number
  collected_cash: number
  collected_electronic: number
  hours_worked: number | null
}

type WalletData = {
  total_collected: number
  total_delivered: number
  balance: number
}

type ExpenseItem = {
  id: string
  category: string
  amount: number
  description: string | null
  created_at: string
}

type ExpensesData = {
  expenses: ExpenseItem[]
  sum: number
  total: number
}

type ReportSummary = {
  total_cash: number
  total_zaincash: number
  total_card: number
  total_collected: number
  invoices_count: number
  visited: number
}

export default function MyReportPage() {
  const { data: session } = useSession()
  const [shift, setShift] = useState<ShiftData | null>(null)
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [expenses, setExpenses] = useState<ExpensesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [summary, setSummary] = useState<ReportSummary | null>(null)

  const user = session?.user as any

  useEffect(() => {
    if (!user?.id) return

    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    Promise.all([
      fetch(`/api/collector/shift/today?staff_id=${user.id}`)
        .then(r => r.json())
        .catch(() => ({})),
      fetch('/api/wallets')
        .then(r => r.json())
        .catch(() => ({ wallets: [] })),
      fetch(`/api/expenses?month=${month}&year=${year}&limit=10`)
        .then(r => r.json())
        .catch(() => ({ expenses: [], sum: 0, total: 0 })),
      fetch('/api/collector/today-summary')
        .then(r => r.json())
        .catch(() => ({ total_cash: 0, total_zaincash: 0, total_card: 0, total_collected: 0, invoices_count: 0 })),
    ]).then(([shiftData, walletData, expensesData, todaySummary]) => {
      setShift(shiftData.shift || null)
      // Find this user's wallet from the wallets array
      const myWallet = (walletData.wallets || []).find((w: any) => w.staff_id === user.id)
      if (myWallet) {
        setWallet({
          total_collected: Number(myWallet.total_collected),
          total_delivered: Number(myWallet.total_delivered),
          balance: Number(myWallet.balance),
        })
      }
      setExpenses(expensesData)
      // Use actual today's collections from invoices, not shift data
      setSummary(todaySummary)
      setLoading(false)
    })
  }, [user?.id])

  async function handleSendReport() {
    setSending(true)
    try {
      const res = await fetch('/api/collector-report/send', { method: 'POST' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSummary(data.summary)
      setSent(true)
      toast.success('تم إرسال التقرير')
    } catch {
      toast.error('خطأ في إرسال التقرير')
    }
    setSending(false)
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
      </div>
    )
  }

  const reportData = summary || {
    total_cash: Number(shift?.collected_cash || 0),
    total_zaincash: 0,
    total_card: 0,
    total_collected: Number(shift?.collected_cash || 0) + Number(shift?.collected_electronic || 0),
    invoices_count: shift?.visited_subscribers || 0,
    visited: shift?.visited_subscribers || 0,
  }

  return (
    <div className="space-y-4 pb-20">
      <h1 className="text-lg font-bold">تقريري اليومي</h1>

      {/* Shift status */}
      {shift?.check_in_at && (
        <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2.5 h-2.5 rounded-full ${shift.check_out_at ? 'bg-text-muted' : 'bg-success animate-pulse'}`} />
            <span className="text-xs font-medium">
              {shift.check_out_at ? 'الجولة منتهية' : 'الجولة جارية'}
            </span>
          </div>
          <div className="flex justify-between text-xs text-text-muted">
            <span>
              بدأت: {new Date(shift.check_in_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
            </span>
            {shift.check_out_at && (
              <span>
                انتهت: {new Date(shift.check_out_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          {shift.hours_worked && (
            <p className="text-xs text-text-muted mt-1">
              مدة العمل: <span className="font-num font-bold">{Number(shift.hours_worked).toFixed(1)}</span> ساعة
            </p>
          )}
        </div>
      )}

      {/* Today's collections summary */}
      <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Wallet size={16} className="text-blue-primary" />
          <h3 className="text-sm font-bold">تحصيل اليوم</h3>
        </div>

        <div className="space-y-2.5">
          <ReportRow icon={Banknote} label="نقداً" amount={reportData.total_cash} color="text-success" />
          <ReportRow icon={Smartphone} label="زين كاش" amount={reportData.total_zaincash} color="text-blue-primary" />
          <ReportRow icon={CreditCard} label="بطاقة" amount={reportData.total_card} color="text-violet" />

          <div className="border-t border-border pt-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">الإجمالي</span>
              <span className="font-num text-lg font-bold text-text-primary">
                {reportData.total_collected.toLocaleString()}
                <span className="text-xs mr-1">د.ع</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* This month's wallet totals */}
      {wallet && (
        <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-success" />
            <h3 className="text-sm font-bold">محفظتي هذا الشهر</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-bg-muted rounded-xl p-3 text-center">
              <p className="text-[10px] text-text-muted mb-0.5">إجمالي المحصّل</p>
              <p className="font-num text-lg font-bold text-blue-primary">
                {Number(wallet.total_collected).toLocaleString()}
                <span className="text-[10px] mr-0.5 text-text-muted">د.ع</span>
              </p>
            </div>
            <div className="bg-bg-muted rounded-xl p-3 text-center">
              <p className="text-[10px] text-text-muted mb-0.5">الرصيد المتبقي</p>
              <p className="font-num text-lg font-bold text-warning">
                {Number(wallet.balance).toLocaleString()}
                <span className="text-[10px] mr-0.5 text-text-muted">د.ع</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* This month's expenses */}
      <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-danger" />
            <h3 className="text-sm font-bold">مصروفات الشهر</h3>
          </div>
          <span className="font-num text-sm font-bold text-danger">
            {(expenses?.sum || 0).toLocaleString()}
            <span className="text-[10px] mr-0.5">د.ع</span>
          </span>
        </div>

        {expenses && expenses.expenses.length > 0 ? (
          <div className="space-y-2">
            {expenses.expenses.map((exp) => (
              <div key={exp.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <div>
                  <span className="text-xs font-medium">{exp.category}</span>
                  {exp.description && (
                    <p className="text-[10px] text-text-muted">{exp.description}</p>
                  )}
                </div>
                <span className="font-num text-xs font-bold text-text-secondary">
                  {Number(exp.amount).toLocaleString()}
                  <span className="text-[10px] mr-0.5">د.ع</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted text-center py-3">لا توجد مصروفات هذا الشهر</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-bg-surface rounded-2xl p-3.5 text-center" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <p className="text-[10px] text-text-muted mb-0.5">فواتير محصلة</p>
          <p className="font-num text-xl font-bold text-blue-primary">{reportData.invoices_count}</p>
        </div>
        <div className="bg-bg-surface rounded-2xl p-3.5 text-center" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <p className="text-[10px] text-text-muted mb-0.5">مشتركون زرتهم</p>
          <p className="font-num text-xl font-bold text-blue-primary">{reportData.visited}</p>
        </div>
      </div>

      {/* Daily target progress */}
      {shift && shift.target_subscribers > 0 && (
        <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold">الهدف اليومي</span>
            <span className="font-num text-xs font-bold">
              {shift.visited_subscribers}/{shift.target_subscribers}
            </span>
          </div>
          <div className="h-2.5 bg-bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-primary"
              style={{ width: `${Math.min(100, (shift.visited_subscribers / shift.target_subscribers) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Send report button */}
      {sent ? (
        <div className="flex items-center justify-center gap-2 py-3">
          <CheckCircle2 size={18} className="text-success" />
          <span className="text-sm font-bold text-success">تم إرسال التقرير</span>
        </div>
      ) : (
        <button
          onClick={handleSendReport}
          disabled={sending}
          className="w-full h-12 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #1B4FD8, #7C3AED)' }}
        >
          {sending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <>
              <Send size={16} />
              إرسال تقريري اليومي
            </>
          )}
        </button>
      )}

      {/* Floating expense button */}
      <ExpenseButton branchId={(user as any)?.branchId} />
    </div>
  )
}

function ReportRow({
  icon: Icon, label, amount, color,
}: {
  icon: React.ElementType; label: string; amount: number; color: string
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon size={14} className={color} />
        <span className="text-xs text-text-secondary">{label}</span>
      </div>
      <span className={`font-num text-sm font-bold ${color}`}>
        {amount.toLocaleString()}
        <span className="text-[10px] mr-0.5">د.ع</span>
      </span>
    </div>
  )
}
