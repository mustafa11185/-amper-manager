import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveBranchIds } from '@/lib/branch-scope'

// Carbon footprint report — based on diesel consumption
// 1 liter of diesel ≈ 2.68 kg CO2
const CO2_PER_LITER_KG = 2.68

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string

  const months = parseInt(req.nextUrl.searchParams.get('months') ?? '6')
  const since = new Date()
  since.setMonth(since.getMonth() - months)

  const branchIds = await resolveBranchIds(req, user)
  const where: any = { tenant_id: tenantId, window_end: { gte: since }, branch_id: { in: branchIds } }

  const consumption = await prisma.fuelConsumption.findMany({
    where,
    orderBy: { window_end: 'asc' },
  })

  // Total
  const totalLiters = consumption.reduce((s, c) => s + Number(c.liters_consumed), 0)
  const totalCO2 = totalLiters * CO2_PER_LITER_KG
  const totalRuntimeHours = consumption.reduce((s, c) => s + (Number(c.runtime_minutes) / 60), 0)

  // Monthly breakdown
  const monthly: Record<string, { liters: number; co2_kg: number; cost: number }> = {}
  for (const c of consumption) {
    const key = `${c.window_end.getFullYear()}-${(c.window_end.getMonth() + 1).toString().padStart(2, '0')}`
    if (!monthly[key]) monthly[key] = { liters: 0, co2_kg: 0, cost: 0 }
    monthly[key].liters += Number(c.liters_consumed)
    monthly[key].co2_kg += Number(c.liters_consumed) * CO2_PER_LITER_KG
    monthly[key].cost += Number(c.cost_iqd ?? 0)
  }

  // Per generator
  const byGen: Record<string, { liters: number; co2_kg: number; runtime_h: number; name?: string }> = {}
  for (const c of consumption) {
    if (!byGen[c.generator_id]) byGen[c.generator_id] = { liters: 0, co2_kg: 0, runtime_h: 0 }
    byGen[c.generator_id].liters += Number(c.liters_consumed)
    byGen[c.generator_id].co2_kg += Number(c.liters_consumed) * CO2_PER_LITER_KG
    byGen[c.generator_id].runtime_h += Number(c.runtime_minutes) / 60
  }
  const genIds = Object.keys(byGen)
  if (genIds.length > 0) {
    const generators = await prisma.generator.findMany({
      where: { id: { in: genIds } },
      select: { id: true, name: true },
    })
    for (const g of generators) {
      if (byGen[g.id]) byGen[g.id].name = g.name
    }
  }

  // Equivalent metrics (educational)
  const equivCarsKm = totalCO2 / 0.121  // Average car: 121g CO2/km
  const equivTreesNeeded = totalCO2 / 21  // Tree absorbs ~21 kg CO2/year

  return NextResponse.json({
    period_months: months,
    summary: {
      total_liters: totalLiters,
      total_co2_kg: totalCO2,
      total_co2_tons: totalCO2 / 1000,
      total_runtime_hours: totalRuntimeHours,
      avg_lph: totalRuntimeHours > 0 ? totalLiters / totalRuntimeHours : 0,
    },
    equivalents: {
      car_km: Math.round(equivCarsKm),
      trees_needed_yearly: Math.round(equivTreesNeeded),
    },
    monthly: Object.entries(monthly)
      .map(([k, v]) => ({ period: k, ...v }))
      .sort((a, b) => a.period.localeCompare(b.period)),
    by_generator: Object.entries(byGen)
      .map(([id, data]) => ({ generator_id: id, ...data }))
      .sort((a, b) => b.liters - a.liters),
    recommendations: [
      'استخدم محركات أكثر كفاءة لتقليل L/h',
      'افحص الفلاتر دورياً — فلتر مسدود يزيد الاستهلاك 15%',
      'صيانة منتظمة تخفض الانبعاثات 10-20%',
      'استبدال المحركات القديمة بأخرى Tier 4 الحديثة',
    ],
  })
}
