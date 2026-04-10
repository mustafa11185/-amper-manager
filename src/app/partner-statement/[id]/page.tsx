import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'

// Public printable statement — accessed via signed URL or token
// For now, accessible only if you know the partner ID (assumes app session)
export const dynamic = 'force-dynamic'

function fmt(n: number) {
  return n.toLocaleString('ar-IQ')
}

export default async function PartnerStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { id } = await params
  const { from, to } = await searchParams

  const partner = await prisma.partner.findUnique({
    where: { id },
    include: {
      shares: { where: { effective_to: null } },
    },
  })
  if (!partner) return notFound()

  const tenant = await prisma.tenant.findUnique({
    where: { id: partner.tenant_id },
    select: { name: true, owner_name: true },
  })

  const fromDate = from ? new Date(from) : null
  const toDate = to ? new Date(to) : null

  // Opening balance
  let opening = 0
  if (fromDate) {
    const [c, w] = await Promise.all([
      prisma.partnerContribution.aggregate({
        _sum: { amount: true },
        where: { partner_id: id, occurred_at: { lt: fromDate } },
      }),
      prisma.partnerWithdrawal.aggregate({
        _sum: { amount: true },
        where: { partner_id: id, occurred_at: { lt: fromDate } },
      }),
    ])
    opening = Number(c._sum.amount ?? 0) - Number(w._sum.amount ?? 0)
  }

  const dateFilter: any = {}
  if (fromDate) dateFilter.gte = fromDate
  if (toDate) dateFilter.lte = toDate

  const [contributions, withdrawals] = await Promise.all([
    prisma.partnerContribution.findMany({
      where: { partner_id: id, ...(fromDate || toDate ? { occurred_at: dateFilter } : {}) },
      orderBy: { occurred_at: 'asc' },
    }),
    prisma.partnerWithdrawal.findMany({
      where: { partner_id: id, ...(fromDate || toDate ? { occurred_at: dateFilter } : {}) },
      orderBy: { occurred_at: 'asc' },
    }),
  ])

  type Mov = { date: Date; type: 'in' | 'out'; subtype: string; amount: number; desc: string | null; balance?: number }
  const movements: Mov[] = [
    ...contributions.map(c => ({
      date: c.occurred_at, type: 'in' as const, subtype: c.type,
      amount: Number(c.amount), desc: c.description,
    })),
    ...withdrawals.map(w => ({
      date: w.occurred_at, type: 'out' as const, subtype: w.type,
      amount: Number(w.amount), desc: w.description,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

  let running = opening
  for (const m of movements) {
    running += m.type === 'in' ? m.amount : -m.amount
    m.balance = running
  }

  const totalIn = contributions.reduce((s, c) => s + Number(c.amount), 0)
  const totalOut = withdrawals.reduce((s, w) => s + Number(w.amount), 0)
  const closing = opening + totalIn - totalOut

  const subtypeLabels: Record<string, string> = {
    capital: 'رأس مال',
    loan: 'قرض للمشروع',
    expense_payment: 'دفع مصاريف',
    other: 'أخرى',
    profit_distribution: 'توزيع أرباح',
    personal_withdrawal: 'سحب شخصي',
    salary: 'راتب',
  }

  return (
    <html dir="rtl" lang="ar">
      <head>
        <meta charSet="utf-8" />
        <title>كشف حساب — {partner.name}</title>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800;900&display=swap');
          * { box-sizing: border-box; }
          body {
            font-family: 'Cairo', sans-serif;
            background: #f8fafc;
            color: #1e293b;
            margin: 0;
            padding: 20px;
          }
          .page {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.05);
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid #1A56A0;
            padding-bottom: 20px;
            margin-bottom: 24px;
          }
          .header .brand { font-size: 24px; font-weight: 900; color: #1A56A0; }
          .header .meta { text-align: left; font-size: 12px; color: #64748b; }
          .title { font-size: 28px; font-weight: 900; margin: 12px 0 4px; }
          .subtitle { font-size: 14px; color: #64748b; margin-bottom: 24px; }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 24px;
          }
          .info-card {
            background: #f1f5f9;
            padding: 12px 16px;
            border-radius: 8px;
          }
          .info-label { font-size: 11px; color: #64748b; font-weight: 600; }
          .info-value { font-size: 14px; font-weight: 800; margin-top: 4px; }
          .balance-card {
            background: linear-gradient(135deg, #1A56A0, #2563EB);
            color: white;
            padding: 20px;
            border-radius: 12px;
            margin: 20px 0;
            text-align: center;
          }
          .balance-label { font-size: 12px; opacity: 0.9; }
          .balance-value { font-size: 32px; font-weight: 900; margin-top: 4px; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 16px;
            font-size: 13px;
          }
          thead {
            background: #1A56A0;
            color: white;
          }
          th, td {
            padding: 10px;
            text-align: right;
            border-bottom: 1px solid #e2e8f0;
          }
          th { font-weight: 700; }
          tr:nth-child(even) td { background: #f8fafc; }
          .in { color: #16a34a; font-weight: 700; }
          .out { color: #dc2626; font-weight: 700; }
          .totals {
            background: #f1f5f9;
            padding: 16px;
            border-radius: 8px;
            margin-top: 16px;
          }
          .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            font-size: 13px;
          }
          .totals-row.final {
            border-top: 2px solid #1A56A0;
            padding-top: 8px;
            margin-top: 8px;
            font-size: 16px;
            font-weight: 900;
          }
          .footer {
            margin-top: 30px;
            padding-top: 16px;
            border-top: 1px solid #e2e8f0;
            font-size: 11px;
            color: #94a3b8;
            text-align: center;
          }
          .print-btn {
            position: fixed;
            top: 20px;
            left: 20px;
            background: #1A56A0;
            color: white;
            padding: 10px 18px;
            border-radius: 8px;
            border: none;
            font-family: 'Cairo', sans-serif;
            font-weight: 700;
            cursor: pointer;
            font-size: 13px;
          }
          @media print {
            body { background: white; padding: 0; }
            .page { box-shadow: none; padding: 20px; }
            .print-btn { display: none; }
          }
        `}</style>
      </head>
      <body>
        <button className="print-btn" onClick={() => window.print()}>🖨️ طباعة / حفظ PDF</button>
        <div className="page">
          <div className="header">
            <div>
              <div className="brand">⚡ {tenant?.name ?? 'Amper'}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{tenant?.owner_name}</div>
            </div>
            <div className="meta">
              تاريخ الإصدار<br/>
              <strong>{new Date().toLocaleDateString('ar-IQ', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
            </div>
          </div>

          <div className="title">كشف حساب الشريك</div>
          <div className="subtitle">{partner.name}</div>

          <div className="info-grid">
            <div className="info-card">
              <div className="info-label">رقم الهاتف</div>
              <div className="info-value">{partner.phone || '—'}</div>
            </div>
            <div className="info-card">
              <div className="info-label">الحصة</div>
              <div className="info-value">
                {partner.shares.length > 0
                  ? `${Number(partner.shares[0].percentage)}%`
                  : '—'}
              </div>
            </div>
            <div className="info-card">
              <div className="info-label">من تاريخ</div>
              <div className="info-value">{from || 'البداية'}</div>
            </div>
            <div className="info-card">
              <div className="info-label">إلى تاريخ</div>
              <div className="info-value">{to || 'الآن'}</div>
            </div>
          </div>

          <div className="balance-card">
            <div className="balance-label">الرصيد الحالي</div>
            <div className="balance-value">{fmt(closing)} د.ع</div>
          </div>

          <h3 style={{ fontSize: 16, marginTop: 24, marginBottom: 8 }}>الحركات</h3>
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>الوصف</th>
                <th>وارد</th>
                <th>صادر</th>
                <th>الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {opening !== 0 && (
                <tr>
                  <td colSpan={5}><strong>الرصيد الافتتاحي</strong></td>
                  <td><strong>{fmt(opening)}</strong></td>
                </tr>
              )}
              {movements.map((m, i) => (
                <tr key={i}>
                  <td>{m.date.toLocaleDateString('ar-IQ', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                  <td>{subtypeLabels[m.subtype] ?? m.subtype}</td>
                  <td>{m.desc || '—'}</td>
                  <td className="in">{m.type === 'in' ? fmt(m.amount) : '—'}</td>
                  <td className="out">{m.type === 'out' ? fmt(m.amount) : '—'}</td>
                  <td>{fmt(m.balance ?? 0)}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8' }}>لا توجد حركات</td></tr>
              )}
            </tbody>
          </table>

          <div className="totals">
            <div className="totals-row">
              <span>الرصيد الافتتاحي</span>
              <span>{fmt(opening)} د.ع</span>
            </div>
            <div className="totals-row">
              <span>إجمالي الوارد (مساهمات + توزيعات)</span>
              <span className="in">+ {fmt(totalIn)} د.ع</span>
            </div>
            <div className="totals-row">
              <span>إجمالي الصادر (سحوبات)</span>
              <span className="out">− {fmt(totalOut)} د.ع</span>
            </div>
            <div className="totals-row final">
              <span>الرصيد الختامي</span>
              <span>{fmt(closing)} د.ع</span>
            </div>
          </div>

          <div className="footer">
            صُنع بواسطة Amper • نظام إدارة المولدات الذكي
          </div>
        </div>
      </body>
    </html>
  )
}
