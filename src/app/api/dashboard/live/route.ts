import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface GenWithRelations {
  id: string;
  name: string;
  run_status: boolean;
  fuel_level_pct: number | null;
  branch: {
    name: string;
    tenant: { name: string };
  };
  iot_devices: Array<{ is_online: boolean; last_seen: Date | null }>;
  engines: Array<{ id: string }>;
}

export async function GET() {
  const generators = (await prisma.generator.findMany({
    where: { is_active: true },
    include: {
      branch: { include: { tenant: { select: { name: true } } } },
      iot_devices: { select: { is_online: true, last_seen: true } },
      engines: { select: { id: true } },
    },
    orderBy: { created_at: "asc" },
  })) as unknown as GenWithRelations[];

  const result = await Promise.all(
    generators.map(async (gen) => {
      const engineIds = gen.engines.map((e) => e.id);

      const latestTemp =
        engineIds.length > 0
          ? await prisma.temperatureLog.findFirst({
              where: { engine_id: { in: engineIds } },
              orderBy: { logged_at: "desc" },
            })
          : null;

      const latestFuel =
        engineIds.length > 0
          ? await prisma.fuelLog.findFirst({
              where: { engine_id: { in: engineIds } },
              orderBy: { logged_at: "desc" },
            })
          : null;

      const isOnline = gen.iot_devices.some((d) => d.is_online);
      const lastSeen =
        gen.iot_devices
          .map((d) => d.last_seen)
          .filter(Boolean)
          .sort(
            (a, b) => (b?.getTime() ?? 0) - (a?.getTime() ?? 0)
          )[0] ?? null;

      return {
        id: gen.id,
        name: gen.name,
        branch_name: gen.branch.name,
        tenant_name: gen.branch.tenant.name,
        run_status: gen.run_status,
        fuel_level_pct: gen.fuel_level_pct,
        is_online: isOnline,
        last_seen: lastSeen,
        latest_temp: latestTemp?.temp_celsius ?? null,
        latest_fuel_pct: latestFuel?.fuel_level_percent ?? null,
        device_count: gen.iot_devices.length,
        online_device_count: gen.iot_devices.filter((d) => d.is_online).length,
      };
    })
  );

  // Stats
  const totalDevices = generators.reduce(
    (acc, g) => acc + g.iot_devices.length,
    0
  );
  const onlineDevices = generators.reduce(
    (acc, g) => acc + g.iot_devices.filter((d) => d.is_online).length,
    0
  );

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const highTempAlerts = await prisma.notification.count({
    where: {
      type: { in: ["temp_warning", "temp_critical"] },
      created_at: { gte: oneHourAgo },
      is_read: false,
    },
  });
  const lowFuelAlerts = await prisma.notification.count({
    where: {
      type: { in: ["fuel_warning", "fuel_critical"] },
      created_at: { gte: oneHourAgo },
      is_read: false,
    },
  });
  const offlineDevices = totalDevices - onlineDevices;

  return NextResponse.json({
    generators: result,
    stats: {
      total_devices: totalDevices,
      online_devices: onlineDevices,
      offline_devices: offlineDevices,
      high_temp_alerts: highTempAlerts,
      low_fuel_alerts: lowFuelAlerts,
    },
  });
}
