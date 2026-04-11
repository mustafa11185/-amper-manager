// GET /api/system-health
//
// Owner-only smoke check that verifies the oil + fuel + cron pipeline
// is wired correctly. Useful right after a deployment to confirm:
//   • Prisma schema has the new columns
//   • Cron route is reachable
//   • Recent oil/fuel notifications exist (proof the cron is firing)
//   • OperatorPermission has can_record_oil_change + can_add_fuel
//
// Returns a structured report with one row per check.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLastCronRun } from '../cron/check-iot-alerts/route'

type Check = {
  id: string
  label: string
  ok: boolean
  detail?: string
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'accountant') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const tenantId = user.tenantId as string
  const checks: Check[] = []

  // ── 1. Engine schema columns exist ──
  try {
    const sample = await prisma.engine.findFirst({
      where: { generator: { branch: { tenant_id: tenantId } } },
      select: {
        id: true,
        oil_summer_days: true,
        oil_winter_days: true,
        oil_normal_days: true,
        last_oil_change_at: true,
      },
    })
    checks.push({
      id: 'engine_oil_columns',
      label: 'حقول جدول الدهن في Engine',
      ok: true,
      detail: sample == null
        ? 'النظام جاهز لكن لا يوجد محرك بعد'
        : 'الأعمدة موجودة في قاعدة البيانات',
    })
  } catch (e: any) {
    checks.push({
      id: 'engine_oil_columns',
      label: 'حقول جدول الدهن في Engine',
      ok: false,
      detail: `يجب تشغيل prisma db push: ${e.message}`,
    })
  }

  // ── 2. FuelLog new columns ──
  try {
    await prisma.fuelLog.findFirst({
      select: {
        id: true,
        generator_id: true,
        event_type: true,
        liters_after: true,
      },
    })
    checks.push({
      id: 'fuel_log_columns',
      label: 'حقول FuelLog الجديدة',
      ok: true,
      detail: 'الأعمدة موجودة',
    })
  } catch (e: any) {
    checks.push({
      id: 'fuel_log_columns',
      label: 'حقول FuelLog الجديدة',
      ok: false,
      detail: `migration ناقصة: ${e.message}`,
    })
  }

  // ── 3. OperatorPermission columns ──
  try {
    await prisma.operatorPermission.findFirst({
      select: { id: true, can_record_oil_change: true, can_add_fuel: true },
    })
    checks.push({
      id: 'operator_permission',
      label: 'صلاحيات المشغّل (دهن + وقود)',
      ok: true,
    })
  } catch (e: any) {
    checks.push({
      id: 'operator_permission',
      label: 'صلاحيات المشغّل (دهن + وقود)',
      ok: false,
      detail: e.message,
    })
  }

  // ── 4. Cron last run ──
  const lastRun = getLastCronRun()
  if (lastRun) {
    const ageMs = Date.now() - new Date(lastRun.finished_at).getTime()
    const ageMinutes = Math.floor(ageMs / 60000)
    checks.push({
      id: 'cron_last_run',
      label: 'آخر تشغيل للـ cron',
      ok: lastRun.ok && ageMinutes < 120,
      detail: `منذ ${ageMinutes} دقيقة · ${lastRun.alerts_created} تنبيه · ${lastRun.ok ? 'نجح' : 'فشل'}`,
    })
  } else {
    checks.push({
      id: 'cron_last_run',
      label: 'آخر تشغيل للـ cron',
      ok: false,
      detail: 'لم يتم تشغيله بعد منذ آخر cold start. تأكد من vercel.json + جدولة الـ cron.',
    })
  }

  // ── 5. Recent notifications (proof cron created something) ──
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recent = await prisma.notification.count({
      where: {
        tenant_id: tenantId,
        type: { in: ['oil_soon', 'oil_today', 'oil_overdue', 'oil_critical', 'fuel_warning'] },
        created_at: { gte: since },
      },
    })
    checks.push({
      id: 'recent_alerts',
      label: 'تنبيهات الـ24 ساعة الأخيرة',
      ok: true,
      detail: `${recent} تنبيه (للدهن أو الوقود)`,
    })
  } catch (e: any) {
    checks.push({
      id: 'recent_alerts',
      label: 'تنبيهات الـ24 ساعة الأخيرة',
      ok: false,
      detail: e.message,
    })
  }

  // ── 6. Generators have tank capacity configured ──
  try {
    const gens = await prisma.generator.findMany({
      where: { branch: { tenant_id: tenantId } },
      select: { id: true, name: true, tank_capacity_liters: true },
    })
    const missing = gens.filter((g) => g.tank_capacity_liters == null || g.tank_capacity_liters <= 0)
    checks.push({
      id: 'tank_capacity',
      label: 'سعة خزانات الوقود',
      ok: missing.length === 0,
      detail: missing.length === 0
        ? `كل المولدات (${gens.length}) لها سعة خزان محددة`
        : `${missing.length} مولدة بدون سعة خزان: ${missing.map((g) => g.name).join('، ')}`,
    })
  } catch (e: any) {
    checks.push({
      id: 'tank_capacity',
      label: 'سعة خزانات الوقود',
      ok: false,
      detail: e.message,
    })
  }

  const allOk = checks.every((c) => c.ok)

  return NextResponse.json({
    healthy: allOk,
    timestamp: new Date().toISOString(),
    checks,
  })
}
