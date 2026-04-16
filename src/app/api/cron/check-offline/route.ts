import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

export async function POST() {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

  // Find IoT devices that are online but haven't been seen in 10+ minutes
  const staleDevices = await prisma.iotDevice.findMany({
    where: {
      is_online: true,
      last_seen: { lt: tenMinAgo },
    },
    include: {
      generator: { include: { branch: true } },
    },
  });

  let notified = 0;
  // Bucket dedupe by hour — one notification per device per hour of outage.
  const hourBucket = new Date().toISOString().slice(0, 13); // e.g. "2026-04-13T09"

  for (const device of staleDevices) {
    // Mark offline
    await prisma.iotDevice.update({
      where: { id: device.id },
      data: { is_online: false },
    });

    const branch = device.generator.branch;
    const res = await createNotification({
      tenant_id: branch.tenant_id,
      branch_id: branch.id,
      type: "iot_disconnect",
      title: "جهاز IoT غير متصل",
      body: `الجهاز على المولدة "${device.generator.name}" غير متصل منذ أكثر من 10 دقائق.`,
      payload: {
        device_id: device.id,
        generator_id: device.generator_id,
        generator_name: device.generator.name,
        last_seen: device.last_seen,
      },
      dedupe_key: `iot_offline_${device.id}_${hourBucket}`,
    });
    if (res.created) notified++;
  }

  // Also check Raspberry devices
  const staleRaspberry = await prisma.raspberryDevice.findMany({
    where: {
      is_online: true,
      last_seen: { lt: tenMinAgo },
    },
  });

  for (const device of staleRaspberry) {
    await prisma.raspberryDevice.update({
      where: { id: device.id },
      data: { is_online: false },
    });
  }

  return NextResponse.json({
    ok: true,
    devices_marked_offline: staleDevices.length + staleRaspberry.length,
    notifications_sent: notified,
  });
}
