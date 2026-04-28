'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Wallet, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'

export default function WalletPage() {
  const { data: session } = useSession()
  const [wallet, setWallet] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const staffId = (session?.user as any)?.id
    if (!staffId) return

    Promise.all([
      fetch('/api/wallets').then(r => r.json()),
      fetch(`/api/wallet/history?staff_id=${staffId}&months=6`).then(r => r.json()),
    ]).then(([wData, hData]) => {
      const myWallet = (wData.wallets || []).find((w: any) => w.staff_id === staffId)
      setWallet(myWallet || null)
      setHistory(hData.deliveries || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [session])

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-24" />
        <div className="skeleton h-32 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">المحفظة</h1>

      {wallet ? (
        <>
          <div className="bg-bg-surface rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-md)' }}>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="w-8 h-8 rounded-xl bg-success/10 flex items-center justify-center mx-auto mb-1">
                  <ArrowDownCircle size={16} className="text-success" />
                </div>
                <p className="text-[10px] text-text-muted">المحصّل</p>
                <p className="font-num text-sm font-bold text-success">{Number(wallet.total_collected).toLocaleString()}</p>
              </div>
              <div>
                <div className="w-8 h-8 rounded-xl bg-blue-soft flex items-center justify-center mx-auto mb-1">
                  <ArrowUpCircle size={16} className="text-blue-primary" />
                </div>
                <p className="text-[10px] text-text-muted">المسلّم</p>
                <p className="font-num text-sm font-bold">{Number(wallet.total_delivered).toLocaleString()}</p>
              </div>
              <div>
                <div className="w-8 h-8 rounded-xl bg-gold-soft flex items-center justify-center mx-auto mb-1">
                  <Wallet size={16} className="text-gold" />
                </div>
                <p className="text-[10px] text-text-muted">الرصيد</p>
                <p className={`font-num text-sm font-bold ${Number(wallet.balance) > 0 ? 'text-danger' : 'text-success'}`}>
                  {Number(wallet.balance).toLocaleString()}
                </p>
              </div>
            </div>
            <p className="text-center text-[10px] text-text-muted mt-2">د.ع</p>
          </div>

          {/* History */}
          <h3 className="text-sm font-bold">سجل التسليمات</h3>
          {history.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">لا توجد تسليمات</p>
          ) : (
            <div className="space-y-2">
              {history.map((d: any) => (
                <div key={d.id} className="bg-bg-surface rounded-xl p-3 flex items-center justify-between" style={{ boxShadow: 'var(--shadow-sm)' }}>
                  <div>
                    <p className="text-xs text-text-muted">
                      {new Date(d.delivered_at).toLocaleDateString('ar-IQ')}
                    </p>
                  </div>
                  <p className="font-num text-sm font-bold text-blue-primary">
                    {Number(d.amount).toLocaleString()} <span className="text-[10px]">د.ع</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-center text-text-muted text-sm py-8">لا توجد محفظة مرتبطة بحسابك</p>
      )}
    </div>
  )
}
