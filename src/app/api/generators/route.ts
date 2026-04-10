import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
