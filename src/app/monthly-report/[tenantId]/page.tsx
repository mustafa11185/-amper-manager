import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return n.toLocaleString('ar-IQ') }

export default async function MonthlyReportPage({
  params, searchParams,
}: {
  params: Promise<{ tenantId: string }>
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const { tenantId } = await params
  const sp = await searchParams
  const now = new Date()
  const month = parseInt(sp.month ?? String(now.getMonth() + 1))
  const year = parseInt(sp.year ?? String(now.getFullYear()))

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, owner_name: true },
  })
  if (!tenant) return notFound()

  const periodStart = new Date(year, month - 1, 1)
  const periodEnd = new Date(year, month, 0, 23, 59, 59)
  const branches = await prisma.branch.findMany({ where: { tenant_id: tenantId }, select: { id: true } })
  const branchIds = branches.map(b => b.id)

  const [revenueAgg, fuelAgg, expenseAgg, theftCount, overloadCount, voltageCount,
    activeSubs, partnersCount, distributionsAgg] = await Promise.all([
    prisma.invoice.aggregate({
      _sum: { amount_paid: true }, _count: true,
      where: { branch_id: { in: branchIds }, billing_month: month, billing_year: year },
    }),
    prisma.fuelConsumption.aggregate({
      _sum: { cost_iqd: true, liters_consumed: true, runtime_minutes: true },
      where: { tenant_id: tenantId, window_end: { gte: periodStart, lte: periodEnd } },
    }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { branch_id: { in: branchIds }, created_at: { gte: periodStart, lte: periodEnd } },
    }),
    prisma.fuelEvent.count({ where: { tenant_id: tenantId, type: 'theft_suspected', occurred_at: { gte: periodStart, lte: periodEnd } } }),
    prisma.overloadEvent.count({ where: { tenant_id: tenantId, detected_at: { gte: periodStart, lte: periodEnd } } }),
    prisma.voltageEvent.count({ where: { tenant_id: tenantId, type: { in: ['low_critical', 'high_critical'] }, detected_at: { gte: periodStart, lte: periodEnd } } }),
    prisma.subscriber.count({ where: { branch_id: { in: branchIds }, is_active: true } }),
    prisma.partner.count({ where: { tenant_id: tenantId, is_active: true } }),
    prisma.partnerWithdrawal.aggregate({
      _sum: { amount: true },
      where: { tenant_id: tenantId, type: 'profit_distribution', occurred_at: { gte: periodStart, lte: periodEnd } },
    }),
  ])

  const revenue = Number(revenueAgg._sum.amount_paid ?? 0)
  const fuelCost = Number(fuelAgg._sum.cost_iqd ?? 0)
  const liters = Number(fuelAgg._sum.liters_consumed ?? 0)
  const runtimeH = Number(fuelAgg._sum.runtime_minutes ?? 0) / 60
  const expenses = Number(expenseAgg._sum.amount ?? 0)
  const profit = revenue - fuelCost - expenses
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0
  const lph = runtimeH > 0 ? liters / runtimeH : 0
  const distributed = Number(distributionsAgg._sum.amount ?? 0)

  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

  return (
    <html dir="rtl" lang="ar">
      <head>
        <meta charSet="utf-8" />
        <title>تقرير {months[month - 1]} {year} — {tenant.name}</title>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800;900&display=swap');
          * { box-sizing: border-box; }
          body {
            font-family: 'Cairo', sans-serif;
            background: #f8fafc;
            color: #1e293b;
            margin: 0; padding: 20px;
          }
          .page {
            max-width: 900px; margin: 0 auto; background: white;
            padding: 40px; border-radius: 16px;
            box-shadow: 0 4px 30px rgba(0,0,0,0.08);
          }
          .header {
            background: linear-gradient(135deg, #1A56A0, #2563EB);
            color: white; margin: -40px -40px 24px -40px; padding: 30px 40px;
            border-radius: 16px 16px 0 0;
          }
          .header .brand { font-size: 28px; font-weight: 900; }
          .header .period { font-size: 16px; opacity: 0.9; margin-top: 4px; }
          .hero {
            background: linear-gradient(135deg, #065F46, #0F766E);
            color: white; padding: 24px; border-radius: 14px; margin-bottom: 20px;
            text-align: center;
          }
          .hero .label { font-size: 13px; opacity: 0.85; }
          .hero .value { font-size: 48px; font-weight: 900; margin: 8px 0; }
          .hero .margin { font-size: 14px; opacity: 0.9; }
          .grid {
            display: grid; grid-template-columns: repeat(3, 1fr);
            gap: 12px; margin-bottom: 20px;
          }
          .stat {
            background: #f1f5f9; padding: 16px; border-radius: 12px;
          }
          .stat .icon { font-size: 24px; }
          .stat .label { font-size: 11px; color: #64748b; margin-top: 4px; }
          .stat .value { font-size: 20px; font-weight: 900; margin-top: 4px; }
          h2 { font-size: 18px; margin: 24px 0 12px; color: #1e293b; }
          .alerts {
            display: grid; grid-template-columns: repeat(3, 1fr);
            gap: 8px; margin-bottom: 16px;
          }
          .alert {
            padding: 12px; border-radius: 10px; text-align: center;
            border: 1px solid;
          }
          .alert.theft { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
          .alert.overload { background: #fff7ed; border-color: #fed7aa; color: #9a3412; }
          .alert.voltage { background: #faf5ff; border-color: #e9d5ff; color: #6b21a8; }
          .alert .num { font-size: 24px; font-weight: 900; }
          .alert .lbl { font-size: 11px; }
          .footer {
            margin-top: 30px; padding-top: 16px; border-top: 1px solid #e2e8f0;
            font-size: 11px; color: #94a3b8; text-align: center;
          }
          .print-btn {
            position: fixed; top: 20px; left: 20px;
            background: #1A56A0; color: white; padding: 10px 18px;
            border-radius: 8px; border: none;
            font-family: 'Cairo', sans-serif; font-weight: 700; cursor: pointer; font-size: 13px;
          }
          @media print {
            body { background: white; padding: 0; }
            .page { box-shadow: none; }
            .print-btn { display: none; }
          }
        `}</style>
      </head>
      <body>
        <button className="print-btn" onClick={() => window.print()}>🖨️ طباعة / حفظ PDF</button>
        <div className="page">
          <div className="header">
            <div className="brand">⚡ {tenant.name}</div>
            <div className="period">📊 التقرير الشهري — {months[month - 1]} {year}</div>
          </div>

          <div className="hero">
            <div className="label">الربح الصافي للشهر</div>
            <div className="value">{fmt(profit)} د.ع</div>
            <div className="margin">هامش الربح {margin.toFixed(0)}%</div>
          </div>

          <h2>💰 الأداء المالي</h2>
          <div className="grid">
            <div className="stat">
              <div className="icon">💵</div>
              <div className="label">الإيرادات</div>
              <div className="value">{fmt(revenue)} د.ع</div>
            </div>
            <div className="stat">
              <div className="icon">⛽</div>
              <div className="label">كلفة الوقود</div>
              <div className="value">{fmt(fuelCost)} د.ع</div>
            </div>
            <div className="stat">
              <div className="icon">📋</div>
              <div className="label">المصاريف الأخرى</div>
              <div className="value">{fmt(expenses)} د.ع</div>
            </div>
            <div className="stat">
              <div className="icon">👥</div>
              <div className="label">المشتركون النشطون</div>
              <div className="value">{activeSubs}</div>
            </div>
            <div className="stat">
              <div className="icon">🧾</div>
              <div className="label">الفواتير</div>
              <div className="value">{revenueAgg._count}</div>
            </div>
            <div className="stat">
              <div className="icon">🤝</div>
              <div className="label">الشركاء</div>
              <div className="value">{partnersCount}</div>
            </div>
          </div>

          <h2>⛽ كفاءة التشغيل</h2>
          <div className="grid">
            <div className="stat">
              <div className="icon">⏱️</div>
              <div className="label">ساعات التشغيل</div>
              <div className="value">{runtimeH.toFixed(0)} س</div>
            </div>
            <div className="stat">
              <div className="icon">⛽</div>
              <div className="label">إجمالي اللترات</div>
              <div className="value">{liters.toFixed(0)} L</div>
            </div>
            <div className="stat">
              <div className="icon">📊</div>
              <div className="label">معدل L/ساعة</div>
              <div className="value">{lph.toFixed(2)}</div>
            </div>
          </div>

          <h2>🚨 الأحداث المرصودة</h2>
          <div className="alerts">
            <div className="alert theft">
              <div className="num">{theftCount}</div>
              <div className="lbl">سرقة وقود مشتبهة</div>
            </div>
            <div className="alert overload">
              <div className="num">{overloadCount}</div>
              <div className="lbl">استهلاك مخالف</div>
            </div>
            <div className="alert voltage">
              <div className="num">{voltageCount}</div>
              <div className="lbl">فولتية حرجة</div>
            </div>
          </div>

          {distributed > 0 && (
            <>
              <h2>👥 توزيعات الشركاء</h2>
              <div style={{
                background: '#f0fdf4', padding: 16, borderRadius: 12,
                border: '1px solid #bbf7d0',
              }}>
                <div style={{ fontSize: 12, color: '#166534' }}>إجمالي الموزّع كأرباح</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#166534', marginTop: 4 }}>
                  {fmt(distributed)} د.ع
                </div>
              </div>
            </>
          )}

          <div className="footer">
            صُنع تلقائياً بواسطة Amper • نظام إدارة المولدات الذكي 🇮🇶
          </div>
        </div>
      </body>
    </html>
  )
}
