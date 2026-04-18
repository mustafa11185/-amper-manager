import { NextRequest, NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/device-auth";
import { prisma } from "@/lib/prisma";
import { checkAlerts } from "@/lib/alerts";

export async function POST(req: NextRequest) {
  const auth = await authenticateDevice(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // Auto-detect source from payload shape
  const isModbus = body.frequency_hz !== undefined || body.rpm !== undefined || body.voltage_l1 !== undefined;
  const source = body.source ?? (isModbus ? 'modbus_dse5110' : 'esp32_sensors');

  const {
    engine_id,
    temperature_c,
    gold_current_a,
    normal_current_a,
    fuel_distance_cm,
    run_status,
    // Modbus-enriched fields
    voltage_l1, voltage_l2, voltage_l3,
    current_l1, current_l2, current_l3,
    frequency_hz, rpm, battery_v, run_hours,
    oil_pressure_bar, fuel_pct: directFuelPct,
  } = body;

  const generator = auth.device.generator;
  const branch = generator.branch;

  // Update generator run_status
  if (run_status !== undefined) {
    await prisma.generator.update({
      where: { id: generator.id },
      data: { run_status },
    });
  }

  // Find the engine (use first engine if engine_id not provided)
  let engine = null;
  if (engine_id) {
    engine = await prisma.engine.findUnique({ where: { id: engine_id } });
  } else {
    engine = await prisma.engine.findFirst({
      where: { generator_id: generator.id },
    });
  }

  // Store temperature log
  if (temperature_c !== undefined && engine) {
    await prisma.temperatureLog.create({
      data: { engine_id: engine.id, temp_celsius: temperature_c },
    });
  }

  // Store oil pressure log (from Modbus)
  if (oil_pressure_bar !== undefined && engine) {
    try {
      await prisma.oilPressureLog.create({
        data: { engine_id: engine.id, branch_id: branch.id, pressure_bar: oil_pressure_bar, source: isModbus ? 'modbus' : 'iot' },
      });
    } catch (_) {}
  }

  // Store load log (from Modbus 3-phase or legacy CT sensors)
  const totalCurrent = current_l1 !== undefined
    ? (current_l1 + (current_l2 ?? 0) + (current_l3 ?? 0))
    : (gold_current_a ?? 0) + (normal_current_a ?? 0);
  if (totalCurrent > 0 && engine) {
    try {
      await prisma.loadLog.create({
        data: {
          engine_id: engine.id,
          branch_id: branch.id,
          load_ampere: totalCurrent,
          gold_current_a: isModbus ? current_l1 : gold_current_a,
          normal_current_a: isModbus ? current_l2 : normal_current_a,
        },
      });
    } catch (_) {}
  }

  // ── Multi-tank fuel readings ──────────────────────────────
  // The gateway sends fuel_tanks: [{index, name, type, fuel_pct, distance_cm}]
  // Each tank maps to a FuelTank record (auto-created if missing).
  const fuelTanks = body.fuel_tanks as Array<{
    index: number; name?: string; type?: string;
    fuel_pct: number; distance_cm?: number;
  }> | undefined;

  let fuel_pct: number | undefined;

  if (fuelTanks && fuelTanks.length > 0) {
    for (const ft of fuelTanks) {
      if (ft.fuel_pct < 0) continue; // skip failed readings

      // Upsert FuelTank record (auto-create on first reading)
      try {
        const tank = await prisma.fuelTank.upsert({
          where: { generator_id_sensor_index: { generator_id: generator.id, sensor_index: ft.index } },
          create: {
            generator_id: generator.id,
            name: ft.name || (ft.index === 0 ? 'داخلي' : 'خارجي'),
            tank_type: ft.type || (ft.index === 0 ? 'internal' : 'external'),
            sensor_index: ft.index,
            current_pct: ft.fuel_pct,
            last_updated: new Date(),
          },
          update: {
            current_pct: ft.fuel_pct,
            last_updated: new Date(),
            ...(ft.name ? { name: ft.name } : {}),
          },
        });

        // Log the reading
        await prisma.fuelLog.create({
          data: {
            generator_id: generator.id,
            engine_id: engine?.id,
            tank_id: tank.id,
            fuel_level_percent: ft.fuel_pct,
            distance_cm: ft.distance_cm,
            source: isModbus ? 'modbus' : 'iot',
          },
        });
      } catch (e) {
        console.warn('[telemetry] tank log failed:', e);
      }
    }
    // Primary fuel = first tank (backwards compat for dashboard gauge)
    fuel_pct = fuelTanks[0]?.fuel_pct;
  }

  // Legacy single-sensor fuel (no fuel_tanks array)
  if (fuel_pct === undefined) {
    if (directFuelPct !== undefined) {
      fuel_pct = directFuelPct;
    } else if (fuel_distance_cm !== undefined) {
      const emptyDist = generator.tank_empty_dist_cm ?? 100;
      const fullDist = generator.tank_full_dist_cm ?? 5;
      fuel_pct = Math.max(0, Math.min(100,
        ((emptyDist - fuel_distance_cm) / (emptyDist - fullDist)) * 100));
    }
    if (fuel_pct !== undefined && engine) {
      await prisma.fuelLog.create({
        data: {
          engine_id: engine.id,
          fuel_level_percent: fuel_pct,
          distance_cm: fuel_distance_cm,
          source: isModbus ? 'modbus' : 'iot',
        },
      });
    }
  }

  // Update generator-level fuel snapshot
  if (fuel_pct !== undefined) {
    await prisma.generator.update({
      where: { id: generator.id },
      data: { fuel_level_pct: fuel_pct, last_fuel_update: new Date() },
    });
  }

  // Update engine runtime hours from Modbus (authoritative, factory-metered)
  if (run_hours !== undefined && engine) {
    try {
      await prisma.engine.update({
        where: { id: engine.id },
        data: { runtime_hours: run_hours },
      });
    } catch (_) {}
  }

  // Store full telemetry snapshot (includes Modbus-enriched fields)
  try {
    await prisma.iotTelemetry.create({
      data: {
        device_id: auth.device.id,
        engine_id: engine?.id,
        temperature_c,
        fuel_pct,
        current_a: totalCurrent > 0 ? totalCurrent : undefined,
        voltage_v: voltage_l1 ?? undefined,
        oil_pressure_bar,
        run_status,
        voltage_l1, voltage_l2, voltage_l3,
        current_l1, current_l2, current_l3,
        frequency_hz, rpm, battery_v, run_hours,
        power_kw: (voltage_l1 && totalCurrent)
          ? Number(((voltage_l1 * totalCurrent * 1.732) / 1000).toFixed(2))
          : undefined,
        source,
      },
    });
  } catch (_) {}

  // Check smart alert rules
  await checkAlerts({
    generator_id: generator.id,
    branch_id: branch.id,
    tenant_id: branch.tenant_id,
    temperature_c,
    fuel_pct,
    run_status,
  });

  // Check for pending commands
  const pendingOverrides = await prisma.manualOverrideLog.findMany({
    where: {
      generator_id: generator.id,
      deactivated_at: null,
      expires_at: { gt: new Date() },
    },
    orderBy: { activated_at: "desc" },
    take: 1,
  });

  const commands = pendingOverrides.map((o) => ({
    type: "set_run_status",
    value: true,
  }));

  return NextResponse.json({ ok: true, source, commands });
}
