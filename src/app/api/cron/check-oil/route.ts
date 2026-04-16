import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  // Find engines where runtime_hours >= oil_change_hours
  const engines = await prisma.engine.findMany({
    include: {
      generator: { include: { branch: true } },
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let notified = 0;

  for (const engine of engines) {
    const runtime = Number(engine.runtime_hours);
    if (runtime < engine.oil_change_hours) continue;

    const branch = engine.generator.branch;

    // Check if already notified today
    const existing = await prisma.notification.findFirst({
      where: {
        branch_id: branch.id,
        type: "oil_change_due",
        created_at: { gte: today },
        payload: {
          path: ["engine_id"],
          equals: engine.id,
        },
      },
    });

    if (!existing) {
      await prisma.notification.create({
        data: {
          branch_id: branch.id,
          tenant_id: branch.tenant_id,
          type: "oil_change_due",
          body: `⚠️ المحرك ${engine.name} يحتاج تغيير زيت — ${runtime}/${engine.oil_change_hours} ساعة`,
          is_read: false,
          payload: {
            engine_id: engine.id,
            runtime_hours: runtime,
            oil_change_hours: engine.oil_change_hours,
          },
        },
      });
      notified++;
    }
  }

  return NextResponse.json({
    ok: true,
    notifications_sent: notified,
  });
}
