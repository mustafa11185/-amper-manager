import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/generators
 *
 * Lists generators visible to the current session.
 *
 * Auth & scoping:
 *   • Owner   → all generators in the tenant
 *   • Staff   → only the generator(s) of their own branch
 *
 * Optional query params:
 *   • branch_id — restrict to a specific branch (owner only)
 *
 * Response shape:
 * ```ts
 * {
 *   generators: Array<{
 *     id: string,
 *     name: string,
 *     branch_id: string,
 *     branch_name: string,
 *     run_status: boolean,
 *     fuel_level_pct: number | null,
 *     tank_capacity_liters: number | null,
 *     latest_fuel_pct: number | null,    // from FuelLog if available
 *     last_fuel_update: string | null,   // ISO timestamp
 *     iot_online: boolean,               // any IoT device is online
 *     engines_count: number,
 *   }>
 * }
 * ```
 *
 * Used by:
 *   • staff_flutter FuelManagementScreen — to resolve the active
 *     generator id when none is passed explicitly.
 *   • Engine settings screen — generator dropdown when adding an
 *     engine.
 *   • Various wallet/finance screens that need a generator name.
 *
 * Stability:
 *   • Adding new fields is safe (additive).
 *   • Removing or renaming fields is a BREAKING change for the
 *     Flutter app. Bump the route to /v2 if a removal is needed.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const tenantId = user.tenantId as string
  const branchId = user.branchId as string | undefined

  const branchFilter = user.role === 'owner'
    ? { tenant_id: tenantId }
    : { id: branchId }

  const branches = await prisma.branch.findMany({
    where: branchFilter,
    select: { id: true, name: true },
  })
  const branchIds = branches.map(b => b.id)

  const generators = await prisma.generator.findMany({
    where: { branch_id: { in: branchIds }, is_active: true },
    include: {
      branch: { select: { name: true } },
      iot_devices: { select: { is_online: true, last_seen: true } },
      engines: { select: { id: true, name: true } },
    },
    orderBy: { created_at: 'asc' },
  }) as any[]

  const result = await Promise.all(
    generators.map(async (gen: any) => {
      const engineIds = gen.engines.map((e: any) => e.id)

      const latestTemp = engineIds.length > 0
        ? await prisma.temperatureLog.findFirst({
            where: { engine_id: { in: engineIds } },
            orderBy: { logged_at: 'desc' },
          })
        : null

      const latestFuel = engineIds.length > 0
        ? await prisma.fuelLog.findFirst({
            where: { engine_id: { in: engineIds } },
            orderBy: { logged_at: 'desc' },
          })
        : null

      const isOnline = gen.iot_devices.some((d: any) => d.is_online)
      const lastSeen = gen.iot_devices
        .map((d: any) => d.last_seen)
        .filter(Boolean)
        .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0] ?? null

      return {
        id: gen.id,
        name: gen.name,
        branch_id: gen.branch_id,
        branch_name: gen.branch.name,
        run_status: gen.run_status,
        fuel_level_pct: gen.fuel_level_pct,
        is_online: isOnline,
        last_seen: lastSeen,
        latest_temp: latestTemp?.temp_celsius ?? null,
        latest_fuel_pct: latestFuel?.fuel_level_percent ?? null,
        engines: gen.engines.map((e: any) => ({ id: e.id, name: e.name })),
      }
    })
  )

  return NextResponse.json({ generators: result })
}
