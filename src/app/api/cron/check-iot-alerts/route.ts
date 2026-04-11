import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTenantAlert } from '@/lib/whatsapp-send'

// Thresholds (can be moved to per-tenant settings later)
const TEMP_WARNING_C = 85
const TEMP_CRITICAL_C = 95
const FUEL_WARNING_PCT = 25
const FUEL_CRITICAL_PCT = 10
const OFFLINE_MINUTES = 5

// Fuel theft detection
const THEFT_DROP_PCT = 5             // 5% drop in 10 min while engine off = suspect
const THEFT_WINDOW_MINUTES = 10
const NIGHT_HOUR_START = 0           // Midnight Iraq time
const NIGHT_HOUR_END = 6             // 6 AM
const DIESEL_PRICE_IQD_PER_LITER = 750  // Default — could move to tenant settings

// Engine hours tracking
const RUNNING_CURRENT_THRESHOLD_A = 1.0  // > 1A = engine is running
const MINUTES_PER_TICK = 1                // Cron runs every minute

// Overload detection (subscriber theft / illegal connections)
const OVERLOAD_TOLERANCE_PCT = 5         // Allow 5% above subscribed before alerting
const OVERLOAD_MIN_EXCESS_A = 3          // Don't alert for tiny excesses

// Fuel consumption tracking
const CONSUMPTION_WINDOW_MINUTES = 60    // Save a consumption record every hour

// Voltage thresholds (Iraqi grid: nominal 220V single-phase)
const VOLT_LOW_WARNING   = 200
const VOLT_LOW_CRITICAL  = 190
const VOLT_HIGH_WARNING  = 240
const VOLT_HIGH_CRITICAL = 250

// Vercel cron jobs invoke endpoints via GET, so expose the same
// handler for both verbs. The function body is identical — GET just
// delegates to POST so manual triggers (curl, monitoring tools)
// continue to work either way.
export async function GET() {
  return POST()
}

// In-memory snapshot of the last cron execution. Persists across
// invocations on the same warm instance and is exposed via the
// /status sibling endpoint for monitoring.
type CronRunStatus = {
  started_at: string
  finished_at: string
  duration_ms: number
  devices_checked: number
  alerts_created: number
  oil_alerts: number
  fuel_alerts: number
  ok: boolean
  error?: string
}
let lastRun: CronRunStatus | null = null
export function getLastCronRun(): CronRunStatus | null {
  return lastRun
}

export async function POST() {
  const startedAt = new Date()
  const startMs = startedAt.getTime()
  let oilAlerts = 0
  let fuelAlerts = 0
  console.log(`[cron/check-iot-alerts] start ${startedAt.toISOString()}`)
  try {
    const now = new Date()
    const offlineThreshold = new Date(now.getTime() - OFFLINE_MINUTES * 60 * 1000)

    let createdAlerts = 0

    // Fetch all active devices with their tenant + branch
    const devices = await prisma.iotDevice.findMany({
      where: { is_active: true, paired_at: { not: null } },
    })

    for (const d of devices) {
      if (!d.tenant_id || !d.branch_id) continue

      // ── 1. OFFLINE check ──
      if (d.last_seen && d.last_seen < offlineThreshold && d.is_online) {
        await prisma.iotDevice.update({
          where: { id: d.id },
          data: { is_online: false },
        })

        // Create offline notification (rate-limited: 1 per hour)
        const recent = await prisma.notification.findFirst({
          where: {
            branch_id: d.branch_id,
            type: 'device_offline',
            created_at: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
            payload: { path: ['device_id'], equals: d.id },
          },
        })
        if (!recent) {
          await prisma.notification.create({
            data: {
              tenant_id: d.tenant_id,
              branch_id: d.branch_id,
              type: 'device_offline',
              title: 'جهاز IoT غير متصل',
              body: `${d.name ?? 'جهاز'} لم يرسل بيانات منذ ${OFFLINE_MINUTES}+ دقائق`,
              payload: { device_id: d.id },
            },
          })
          await sendTenantAlert(d.tenant_id, `🔌 جهاز IoT غير متصل\n${d.name ?? 'جهاز'} لم يرسل بيانات منذ ${OFFLINE_MINUTES}+ دقائق`)
          createdAlerts++
        }
        continue
      }

      // ── 2. Latest telemetry check ──
      const tele = await prisma.iotTelemetry.findFirst({
        where: { device_id: d.id },
        orderBy: { recorded_at: 'desc' },
      })
      if (!tele) continue

      // ══════════════════════════════════════════
      //  ENGINE HOURS TRACKING
      // ══════════════════════════════════════════
      // 1. Increment hours ONLY when engine is currently running.
      // 2. Maintenance threshold check runs regardless of current running state
      //    so an idle but overdue engine still triggers daily reminders.
      const engineLinks = await prisma.iotDeviceEngine.findMany({
        where: { device_id: d.id },
        select: { engine_id: true },
      })

      // Increment runtime if engine is running RIGHT NOW
      if (tele.current_a != null && tele.current_a >= RUNNING_CURRENT_THRESHOLD_A) {
        for (const link of engineLinks) {
          await prisma.engine.update({
            where: { id: link.engine_id },
            data: { runtime_hours: { increment: MINUTES_PER_TICK / 60 } },
          })
        }
      }

      // Maintenance threshold check — runs regardless of current running state
      // (notifications self-rate-limit to 1 per 24h via the recent check below)
      {
        for (const link of engineLinks) {
          const eng = await prisma.engine.findUnique({ where: { id: link.engine_id } })
          if (!eng) continue

          const totalH = Number(eng.runtime_hours)
          const sinceOil = totalH - Number(eng.hours_at_last_oil)
          const sinceFilter = totalH - Number(eng.hours_at_last_filter)
          const sinceService = totalH - Number(eng.hours_at_last_service)

          // Oil change due
          if (sinceOil >= eng.oil_change_hours) {
            const recent = await prisma.notification.findFirst({
              where: {
                branch_id: d.branch_id,
                type: 'maintenance_oil',
                created_at: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
                payload: { path: ['engine_id'], equals: link.engine_id },
              },
            })
            if (!recent) {
              await prisma.notification.create({
                data: {
                  tenant_id: d.tenant_id,
                  branch_id: d.branch_id,
                  type: 'maintenance_oil',
                  title: '🛢️ موعد تغيير الزيت',
                  body: `محرك ${eng.name}: ${Math.round(sinceOil)}س منذ آخر تغيير (الحد ${eng.oil_change_hours}س)`,
                  payload: { engine_id: link.engine_id, hours: Math.round(sinceOil) },
                },
              })
              createdAlerts++
            }
          }

          // Air filter due
          if (sinceFilter >= eng.air_filter_hours) {
            const recent = await prisma.notification.findFirst({
              where: {
                branch_id: d.branch_id,
                type: 'maintenance_filter',
                created_at: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
                payload: { path: ['engine_id'], equals: link.engine_id },
              },
            })
            if (!recent) {
              await prisma.notification.create({
                data: {
                  tenant_id: d.tenant_id,
                  branch_id: d.branch_id,
                  type: 'maintenance_filter',
                  title: '🌬️ موعد تغيير فلتر الهواء',
                  body: `محرك ${eng.name}: ${Math.round(sinceFilter)}س منذ آخر تغيير`,
                  payload: { engine_id: link.engine_id, hours: Math.round(sinceFilter) },
                },
              })
              createdAlerts++
            }
          }

          // Full service due
          if (sinceService >= eng.full_service_hours) {
            const recent = await prisma.notification.findFirst({
              where: {
                branch_id: d.branch_id,
                type: 'maintenance_service',
                created_at: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
                payload: { path: ['engine_id'], equals: link.engine_id },
              },
            })
            if (!recent) {
              await prisma.notification.create({
                data: {
                  tenant_id: d.tenant_id,
                  branch_id: d.branch_id,
                  type: 'maintenance_service',
                  title: '🔧 موعد الصيانة الشاملة',
                  body: `محرك ${eng.name}: ${Math.round(sinceService)}س منذ آخر صيانة شاملة`,
                  payload: { engine_id: link.engine_id, hours: Math.round(sinceService) },
                },
              })
              createdAlerts++
            }
          }
        }
      }

      // ══════════════════════════════════════════
      //  VOLTAGE MONITORING (equipment protection)
      // ══════════════════════════════════════════
      if (tele.voltage_v != null && tele.voltage_v > 50) {  // ignore zero/idle readings
        const v = tele.voltage_v
        let evType: string | null = null
        let isCritical = false
        let threshold = 0
        let title = ''
        let body = ''

        if (v <= VOLT_LOW_CRITICAL) {
          evType = 'low_critical'; isCritical = true; threshold = VOLT_LOW_CRITICAL
          title = '⚡ فولتية منخفضة جداً'
          body = `${d.name ?? 'مولدة'}: ${v.toFixed(0)}V — قد يضر بالأجهزة، أوقف الحمل!`
        } else if (v <= VOLT_LOW_WARNING) {
          evType = 'low_warning'; threshold = VOLT_LOW_WARNING
          title = '⚠️ فولتية منخفضة'
          body = `${d.name ?? 'مولدة'}: ${v.toFixed(0)}V`
        } else if (v >= VOLT_HIGH_CRITICAL) {
          evType = 'high_critical'; isCritical = true; threshold = VOLT_HIGH_CRITICAL
          title = '⚡ فولتية مرتفعة جداً'
          body = `${d.name ?? 'مولدة'}: ${v.toFixed(0)}V — يحرق الأجهزة، أوقف الحمل فوراً!`
        } else if (v >= VOLT_HIGH_WARNING) {
          evType = 'high_warning'; threshold = VOLT_HIGH_WARNING
          title = '⚠️ فولتية مرتفعة'
          body = `${d.name ?? 'مولدة'}: ${v.toFixed(0)}V`
        }

        if (evType) {
          // Rate limit by event type (critical: 30 min, warning: 2 hours)
          const cooldown = isCritical ? 30 * 60 * 1000 : 2 * 60 * 60 * 1000
          const recent = await prisma.voltageEvent.findFirst({
            where: {
              generator_id: d.generator_id,
              type: evType,
              detected_at: { gte: new Date(now.getTime() - cooldown) },
            },
          })
          if (!recent) {
            await prisma.voltageEvent.create({
              data: {
                tenant_id: d.tenant_id,
                branch_id: d.branch_id,
                generator_id: d.generator_id,
                device_id: d.id,
                type: evType,
                voltage: v,
                threshold,
              },
            })
            await prisma.notification.create({
              data: {
                tenant_id: d.tenant_id,
                branch_id: d.branch_id,
                type: `voltage_${evType}`,
                title,
                body,
                payload: { device_id: d.id, voltage: v, threshold },
              },
            })
            // Send WhatsApp only on critical events
            if (isCritical) {
              await sendTenantAlert(d.tenant_id, `${title}\n${body}`)
            }
            createdAlerts++
          }
        }
      }

      // ══════════════════════════════════════════
      //  OVERLOAD DETECTION (illegal subscriber connections)
      // ══════════════════════════════════════════
      if (tele.current_a != null && tele.current_a >= RUNNING_CURRENT_THRESHOLD_A) {
        const subAgg = await prisma.subscriber.aggregate({
          _sum: { amperage: true },
          _count: true,
          where: { generator_id: d.generator_id, is_active: true },
        })
        const subscribedAmps = Number(subAgg._sum.amperage ?? 0)
        const subCount = subAgg._count

        if (subscribedAmps > 0) {
          const excessAmps = tele.current_a - subscribedAmps
          const excessPct = (excessAmps / subscribedAmps) * 100

          if (excessAmps >= OVERLOAD_MIN_EXCESS_A && excessPct >= OVERLOAD_TOLERANCE_PCT) {
            const recentEvent = await prisma.overloadEvent.findFirst({
              where: {
                generator_id: d.generator_id,
                detected_at: { gte: new Date(now.getTime() - 30 * 60 * 1000) },
              },
            })
            if (!recentEvent) {
              await prisma.overloadEvent.create({
                data: {
                  tenant_id: d.tenant_id,
                  branch_id: d.branch_id,
                  generator_id: d.generator_id,
                  device_id: d.id,
                  measured_amps: tele.current_a,
                  subscribed_amps: subscribedAmps,
                  excess_amps: excessAmps,
                  excess_pct: excessPct,
                  active_subs_count: subCount,
                },
              })

              const overloadMsg = `⚡ استهلاك زائد عن المشترك\n${d.name ?? 'مولدة'}: السحب ${tele.current_a.toFixed(1)}A بينما المشتركون ${subscribedAmps.toFixed(0)}A — زيادة ${excessAmps.toFixed(1)}A (${excessPct.toFixed(0)}%)`
              await prisma.notification.create({
                data: {
                  tenant_id: d.tenant_id,
                  branch_id: d.branch_id,
                  type: 'overload_detected',
                  title: '⚡ استهلاك زائد عن المشترك',
                  body: overloadMsg.split('\n')[1],
                  payload: {
                    generator_id: d.generator_id,
                    measured: tele.current_a,
                    subscribed: subscribedAmps,
                    excess: excessAmps,
                  },
                },
              })
              await sendTenantAlert(d.tenant_id, overloadMsg)
              createdAlerts++
            }
          }
        }
      }

      // ══════════════════════════════════════════
      //  HOURLY FUEL CONSUMPTION SNAPSHOT (for L/h + profitability)
      // ══════════════════════════════════════════
      const lastSnapshot = await prisma.fuelConsumption.findFirst({
        where: { generator_id: d.generator_id },
        orderBy: { window_end: 'desc' },
      })
      const shouldSnapshot = !lastSnapshot ||
        (now.getTime() - lastSnapshot.window_end.getTime()) >= CONSUMPTION_WINDOW_MINUTES * 60 * 1000

      if (shouldSnapshot && tele.fuel_pct != null) {
        const windowStart = lastSnapshot?.window_end ?? new Date(now.getTime() - CONSUMPTION_WINDOW_MINUTES * 60 * 1000)
        const startReading = await prisma.iotTelemetry.findFirst({
          where: { device_id: d.id, recorded_at: { gte: windowStart, lte: now }, fuel_pct: { not: null } },
          orderBy: { recorded_at: 'asc' },
        })
        if (startReading?.fuel_pct != null) {
          const fuelDrop = startReading.fuel_pct - tele.fuel_pct
          if (fuelDrop > 0 && fuelDrop < 50) {
            const gen = await prisma.generator.findUnique({ where: { id: d.generator_id } })
            const liters = gen?.tank_capacity_liters
              ? (fuelDrop / 100) * gen.tank_capacity_liters
              : 0

            const runningSamples = await prisma.iotTelemetry.count({
              where: {
                device_id: d.id,
                recorded_at: { gte: windowStart, lte: now },
                current_a: { gte: RUNNING_CURRENT_THRESHOLD_A },
              },
            })

            const currentAgg = await prisma.iotTelemetry.aggregate({
              _avg: { current_a: true },
              where: {
                device_id: d.id,
                recorded_at: { gte: windowStart, lte: now },
                current_a: { gte: RUNNING_CURRENT_THRESHOLD_A },
              },
            })

            const lph = runningSamples > 0 && liters > 0
              ? (liters / (runningSamples / 60))
              : 0

            await prisma.fuelConsumption.create({
              data: {
                tenant_id: d.tenant_id,
                branch_id: d.branch_id,
                generator_id: d.generator_id,
                device_id: d.id,
                window_start: windowStart,
                window_end: now,
                fuel_pct_start: startReading.fuel_pct,
                fuel_pct_end: tele.fuel_pct,
                liters_consumed: liters,
                cost_iqd: liters > 0 ? liters * DIESEL_PRICE_IQD_PER_LITER : null,
                avg_current_a: Number(currentAgg._avg.current_a ?? 0),
                runtime_minutes: runningSamples,
                liters_per_hour: lph,
              },
            })
          }
        }
      }

      // ══════════════════════════════════════════
      //  FUEL THEFT DETECTION
      // ══════════════════════════════════════════
      // Compare current fuel with reading from ~10 minutes ago.
      // Suspect if drop > 5% AND engine was off (current < 1A) for the period.
      if (tele.fuel_pct != null) {
        const windowAgo = new Date(now.getTime() - THEFT_WINDOW_MINUTES * 60 * 1000)
        const oldReading = await prisma.iotTelemetry.findFirst({
          where: {
            device_id: d.id,
            recorded_at: { lt: windowAgo },
            fuel_pct: { not: null },
          },
          orderBy: { recorded_at: 'desc' },
        })

        if (oldReading?.fuel_pct != null) {
          const drop = oldReading.fuel_pct - tele.fuel_pct
          if (drop >= THEFT_DROP_PCT) {
            // Was the engine running during this window?
            const runningSamples = await prisma.iotTelemetry.count({
              where: {
                device_id: d.id,
                recorded_at: { gte: windowAgo, lte: now },
                current_a: { gte: RUNNING_CURRENT_THRESHOLD_A },
              },
            })

            const isNight = (() => {
              const iraqHour = (now.getUTCHours() + 3) % 24
              return iraqHour >= NIGHT_HOUR_START && iraqHour < NIGHT_HOUR_END
            })()

            if (runningSamples === 0) {
              // Not running → drop is unexplained → suspected theft/leak
              // Avoid duplicates: check if we already logged a theft event in the last 30 min
              const recentEvent = await prisma.fuelEvent.findFirst({
                where: {
                  device_id: d.id,
                  type: 'theft_suspected',
                  occurred_at: { gte: new Date(now.getTime() - 30 * 60 * 1000) },
                },
              })
              if (!recentEvent) {
                // Estimate liters using tank capacity if known
                const gen = await prisma.generator.findUnique({ where: { id: d.generator_id } })
                const liters = gen?.tank_capacity_liters
                  ? (drop / 100) * gen.tank_capacity_liters
                  : null
                const costIqd = liters ? liters * DIESEL_PRICE_IQD_PER_LITER : null

                await prisma.fuelEvent.create({
                  data: {
                    tenant_id: d.tenant_id,
                    branch_id: d.branch_id,
                    device_id: d.id,
                    generator_id: d.generator_id,
                    type: 'theft_suspected',
                    fuel_before: oldReading.fuel_pct,
                    fuel_after: tele.fuel_pct,
                    delta_pct: -drop,
                    liters_est: liters,
                    cost_est_iqd: costIqd,
                  },
                })

                // Create a critical notification
                const litersText = liters ? ` (~${liters.toFixed(1)} لتر)` : ''
                const timeText = isNight ? ' أثناء ساعات الليل' : ''
                const theftMsg = `🚨 يُشتبه بسرقة وقود\n${d.name ?? 'جهاز'}: الوقود نزل ${drop.toFixed(1)}%${litersText}${timeText} والمحرك مطفي`
                await prisma.notification.create({
                  data: {
                    tenant_id: d.tenant_id,
                    branch_id: d.branch_id,
                    type: 'fuel_theft_suspected',
                    title: '🚨 يُشتبه بسرقة وقود',
                    body: theftMsg.split('\n')[1],
                    payload: { device_id: d.id, drop_pct: drop, liters_est: liters },
                  },
                })
                await sendTenantAlert(d.tenant_id, theftMsg)
                createdAlerts++
              }
            }
          } else if (drop <= -10) {
            // Fuel went UP by 10%+ → it's a refill — log it for the records
            const recentRefill = await prisma.fuelEvent.findFirst({
              where: {
                device_id: d.id,
                type: 'refill',
                occurred_at: { gte: new Date(now.getTime() - 30 * 60 * 1000) },
              },
            })
            if (!recentRefill) {
              const gen = await prisma.generator.findUnique({ where: { id: d.generator_id } })
              const liters = gen?.tank_capacity_liters
                ? (Math.abs(drop) / 100) * gen.tank_capacity_liters
                : null
              await prisma.fuelEvent.create({
                data: {
                  tenant_id: d.tenant_id,
                  branch_id: d.branch_id,
                  device_id: d.id,
                  generator_id: d.generator_id,
                  type: 'refill',
                  fuel_before: oldReading.fuel_pct,
                  fuel_after: tele.fuel_pct,
                  delta_pct: -drop,
                  liters_est: liters,
                  cost_est_iqd: liters ? liters * DIESEL_PRICE_IQD_PER_LITER : null,
                },
              })
            }
          }
        }
      }

      // Temp critical
      if (tele.temperature_c != null && tele.temperature_c >= TEMP_CRITICAL_C) {
        const recent = await prisma.notification.findFirst({
          where: {
            branch_id: d.branch_id,
            type: 'temp_critical',
            created_at: { gte: new Date(now.getTime() - 30 * 60 * 1000) },
            payload: { path: ['device_id'], equals: d.id },
          },
        })
        if (!recent) {
          await prisma.notification.create({
            data: {
              tenant_id: d.tenant_id,
              branch_id: d.branch_id,
              type: 'temp_critical',
              title: '🔥 حرارة حرجة جداً',
              body: `${d.name ?? 'جهاز'}: ${tele.temperature_c}°م — أوقف المحرك فوراً!`,
              payload: { device_id: d.id, value: tele.temperature_c },
            },
          })
          await sendTenantAlert(d.tenant_id, `🔥 حرارة حرجة جداً\n${d.name ?? 'جهاز'}: ${tele.temperature_c}°م — أوقف المحرك فوراً!`)
          createdAlerts++
        }
      } else if (tele.temperature_c != null && tele.temperature_c >= TEMP_WARNING_C) {
        const recent = await prisma.notification.findFirst({
          where: {
            branch_id: d.branch_id,
            type: 'temp_warning',
            created_at: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
            payload: { path: ['device_id'], equals: d.id },
          },
        })
        if (!recent) {
          await prisma.notification.create({
            data: {
              tenant_id: d.tenant_id,
              branch_id: d.branch_id,
              type: 'temp_warning',
              title: '⚠️ حرارة مرتفعة',
              body: `${d.name ?? 'جهاز'}: ${tele.temperature_c}°م`,
              payload: { device_id: d.id, value: tele.temperature_c },
            },
          })
          createdAlerts++
        }
      }

      // Fuel critical
      if (tele.fuel_pct != null && tele.fuel_pct <= FUEL_CRITICAL_PCT) {
        const recent = await prisma.notification.findFirst({
          where: {
            branch_id: d.branch_id,
            type: 'fuel_critical',
            created_at: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
            payload: { path: ['device_id'], equals: d.id },
          },
        })
        if (!recent) {
          await prisma.notification.create({
            data: {
              tenant_id: d.tenant_id,
              branch_id: d.branch_id,
              type: 'fuel_critical',
              title: '⛽ وقود منخفض جداً',
              body: `${d.name ?? 'جهاز'}: ${Math.round(tele.fuel_pct)}% — يحتاج تعبئة عاجلة`,
              payload: { device_id: d.id, value: tele.fuel_pct },
            },
          })
          await sendTenantAlert(d.tenant_id, `⛽ وقود منخفض جداً\n${d.name ?? 'جهاز'}: ${Math.round(tele.fuel_pct)}% — يحتاج تعبئة عاجلة`)
          createdAlerts++
        }
      } else if (tele.fuel_pct != null && tele.fuel_pct <= FUEL_WARNING_PCT) {
        const recent = await prisma.notification.findFirst({
          where: {
            branch_id: d.branch_id,
            type: 'fuel_warning',
            created_at: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
            payload: { path: ['device_id'], equals: d.id },
          },
        })
        if (!recent) {
          await prisma.notification.create({
            data: {
              tenant_id: d.tenant_id,
              branch_id: d.branch_id,
              type: 'fuel_warning',
              title: '⛽ وقود منخفض',
              body: `${d.name ?? 'جهاز'}: ${Math.round(tele.fuel_pct)}%`,
              payload: { device_id: d.id, value: tele.fuel_pct },
            },
          })
          createdAlerts++
        }
      }
    }

    // ════════════════════════════════════════════════════════
    //  Oil-change due check (days-based, no IoT required)
    // ════════════════════════════════════════════════════════
    //
    // Walks every engine and computes its days-until-next-oil based
    // on the seasonal interval (per-engine override or default 15/
    // 20/25). Emits up to 4 levels of notification per engine, each
    // self-rate-limited to once per 24h via the recent-notification
    // check.
    try {
      const allEngines = await prisma.engine.findMany({
        include: {
          generator: { select: { id: true, name: true, branch_id: true, branch: { select: { tenant_id: true } } } },
        },
      })
      const month = new Date().getMonth() + 1
      const isSummer = month >= 6 && month <= 9
      const isWinter = month === 12 || month <= 2
      for (const eng of allEngines) {
        const e: any = eng
        if (!e.last_oil_change_at) continue
        const interval = isSummer
          ? (e.oil_summer_days ?? 15)
          : isWinter
            ? (e.oil_winter_days ?? 25)
            : (e.oil_normal_days ?? 20)
        const ms = Date.now() - new Date(e.last_oil_change_at).getTime()
        const daysSince = Math.floor(ms / (1000 * 60 * 60 * 24))
        const daysRemaining = interval - daysSince

        // Pick the most severe applicable level
        let level: 'soon' | 'today' | 'overdue' | 'critical' | null = null
        if (daysRemaining <= -5) level = 'critical'
        else if (daysRemaining < 0) level = 'overdue'
        else if (daysRemaining === 0) level = 'today'
        else if (daysRemaining <= 3) level = 'soon'
        if (!level) continue

        // Rate-limit: one oil notification per engine per 24h
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const recent = await prisma.notification.findFirst({
          where: {
            tenant_id: e.generator.branch.tenant_id,
            type: `oil_${level}`,
            payload: { path: ['engine_id'], equals: e.id },
            created_at: { gte: since },
          },
        }).catch(() => null)
        if (recent) continue

        const titleMap = {
          soon: '🛢️ تغيير دهن قريب',
          today: '⚠️ تغيير دهن مستحق',
          overdue: '🚨 تغيير دهن متأخر',
          critical: '⛔ المحرك في خطر',
        }
        const bodyMap = {
          soon: `المحرك ${e.name} يحتاج تغيير دهن خلال ${daysRemaining} ${daysRemaining === 1 ? 'يوم' : 'أيام'}`,
          today: `المحرك ${e.name} يحتاج تغيير دهن اليوم`,
          overdue: `المحرك ${e.name} متأخر ${-daysRemaining} ${-daysRemaining === 1 ? 'يوم' : 'أيام'} عن تغيير الدهن`,
          critical: `المحرك ${e.name} متأخر ${-daysRemaining} يوم — قد يضرّ بالمحرك بشكل دائم`,
        }
        await prisma.notification.create({
          data: {
            tenant_id: e.generator.branch.tenant_id,
            branch_id: e.generator.branch_id,
            type: `oil_${level}`,
            title: titleMap[level],
            body: bodyMap[level],
            payload: {
              engine_id: e.id,
              engine_name: e.name,
              days_remaining: daysRemaining,
              level,
            },
          },
        })
        createdAlerts++
        oilAlerts++
      }
    } catch (oilErr: any) {
      console.warn('[cron/check-iot-alerts oil]', oilErr.message)
    }

    const finishedAt = new Date()
    const durationMs = finishedAt.getTime() - startMs
    lastRun = {
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      devices_checked: devices.length,
      alerts_created: createdAlerts,
      oil_alerts: oilAlerts,
      fuel_alerts: fuelAlerts,
      ok: true,
    }
    console.log(
      `[cron/check-iot-alerts] done ${finishedAt.toISOString()} ` +
      `duration=${durationMs}ms devices=${devices.length} alerts=${createdAlerts} ` +
      `(oil=${oilAlerts} fuel=${fuelAlerts})`
    )

    return NextResponse.json({ ok: true, devices_checked: devices.length, alerts_created: createdAlerts })
  } catch (err: any) {
    const finishedAt = new Date()
    lastRun = {
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startMs,
      devices_checked: 0,
      alerts_created: 0,
      oil_alerts: oilAlerts,
      fuel_alerts: fuelAlerts,
      ok: false,
      error: err.message,
    }
    console.error('[cron/check-iot-alerts] FAILED', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
