import { prisma } from "./prisma";

interface TelemetryData {
  generator_id: string;
  branch_id: string;
  tenant_id: string;
  temperature_c?: number;
  fuel_pct?: number;
  run_status?: boolean;
}

export async function checkAlerts(data: TelemetryData) {
  const alerts: Array<{ type: string; body: string; severity: string }> = [];

  // ── Temperature Alerts ──
  if (data.temperature_c !== undefined) {
    if (data.temperature_c > 95) {
      alerts.push({
        type: "temp_critical",
        body: `🚨 درجة حرارة حرجة: ${data.temperature_c}°C — أوقف المحرك فوراً`,
        severity: "critical",
      });
    } else if (data.temperature_c > 85) {
      alerts.push({
        type: "temp_warning",
        body: `⚠️ درجة الحرارة مرتفعة: ${data.temperature_c}°C`,
        severity: "warning",
      });
    }
  }

  // ── Per-Tank Fuel Alerts ──────────────────────────────────
  // Check each FuelTank individually so the notification names
  // the specific tank ("الخزان الداخلي 15%" vs generic "الوقود 15%").
  try {
    const tanks = await prisma.fuelTank.findMany({
      where: { generator_id: data.generator_id, is_active: true },
      select: { id: true, name: true, tank_type: true, current_pct: true },
    });

    for (const tank of tanks) {
      const pct = tank.current_pct ?? 100;
      const emoji = tank.tank_type === 'external' ? '🛢️' : '⛽';

      if (pct < 10) {
        alerts.push({
          type: `fuel_critical_${tank.id}`,
          body: `🚨 ${emoji} ${tank.name} حرج: ${pct.toFixed(0)}% — أضف وقوداً فوراً`,
          severity: "critical",
        });
      } else if (pct < 20) {
        alerts.push({
          type: `fuel_warning_${tank.id}`,
          body: `⚠️ ${emoji} ${tank.name} منخفض: ${pct.toFixed(0)}%`,
          severity: "warning",
        });
      }
    }

    // ── Theft Detection ──────────────────────────────────────
    // If external tank dropped significantly in last reading but
    // internal tank didn't rise → possible theft.
    const external = tanks.find(t => t.tank_type === 'external');
    const internal = tanks.find(t => t.tank_type === 'internal');
    if (external && internal) {
      // Get last 2 readings for external tank
      const recentExt = await prisma.fuelLog.findMany({
        where: { tank_id: external.id },
        orderBy: { logged_at: 'desc' },
        take: 2,
        select: { fuel_level_percent: true },
      });
      if (recentExt.length === 2) {
        const drop = recentExt[1].fuel_level_percent - recentExt[0].fuel_level_percent;
        // External dropped >10% but internal didn't rise → suspicious
        if (drop > 10 && (internal.current_pct ?? 0) < 80) {
          alerts.push({
            type: `fuel_theft_${external.id}`,
            body: `🚨 سرقة وقود محتملة — 🛢️ ${external.name} انخفض ${drop.toFixed(0)}% بدون تعبئة للداخلي`,
            severity: "critical",
          });
        }
      }
    }
  } catch (_) {
    // Fallback to legacy single-fuel check
    if (data.fuel_pct !== undefined) {
      if (data.fuel_pct < 10) {
        alerts.push({ type: "fuel_critical", body: `🚨 الوقود حرج: ${data.fuel_pct.toFixed(0)}%`, severity: "critical" });
      } else if (data.fuel_pct < 20) {
        alerts.push({ type: "fuel_warning", body: `⚠️ الوقود منخفض: ${data.fuel_pct.toFixed(0)}%`, severity: "warning" });
      }
    }
  }

  // ── Store alerts (deduplicate — 1 hour window) ──
  for (const alert of alerts) {
    const recentAlert = await prisma.notification.findFirst({
      where: {
        branch_id: data.branch_id,
        type: alert.type,
        created_at: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });

    if (!recentAlert) {
      await prisma.notification.create({
        data: {
          branch_id: data.branch_id,
          tenant_id: data.tenant_id,
          type: alert.type,
          body: alert.body,
          is_read: false,
          payload: { severity: alert.severity },
        },
      });
    }
  }

  return alerts;
}
