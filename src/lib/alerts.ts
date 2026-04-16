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

  // ── Fuel Alerts ──
  if (data.fuel_pct !== undefined) {
    if (data.fuel_pct < 10) {
      alerts.push({
        type: "fuel_critical",
        body: `🚨 الوقود حرج: ${data.fuel_pct.toFixed(0)}% — أضف وقوداً فوراً`,
        severity: "critical",
      });
    } else if (data.fuel_pct < 20) {
      alerts.push({
        type: "fuel_warning",
        body: `⚠️ الوقود منخفض: ${data.fuel_pct.toFixed(0)}%`,
        severity: "warning",
      });
    }
  }

  // Store alerts (deduplicate — don't create same alert type twice within 1 hour)
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
          payload: {
            severity: alert.severity,
            value: data.temperature_c ?? data.fuel_pct,
          },
        },
      });
    }
  }

  return alerts;
}
