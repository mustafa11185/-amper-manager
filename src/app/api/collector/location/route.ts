import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma";

const STOP_DISTANCE_M = 50;
const STOP_THRESHOLD_MIN = 4;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions); if (!session?.user) throw new Error("Unauthorized"); const user = session.user as any;
    const { lat, lng, accuracy } = await req.json();

    if (lat == null || lng == null) {
      return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
    }

    const staffId = user.id;
    const branchId = user.branchId;
    const tenantId = user.tenantId;

    // Fetch last GPS log for stop detection
    const lastLog = await prisma.staffGpsLog.findFirst({
      where: { staff_id: staffId },
      orderBy: { recorded_at: "desc" },
    });

    let isStop = false;
    let stopDuration: number | null = null;

    if (lastLog) {
      const dist = haversineM(
        Number(lastLog.lat),
        Number(lastLog.lng),
        lat,
        lng
      );

      if (dist < STOP_DISTANCE_M) {
        // Still in same location — calculate duration from the first point at this location
        // Walk back to find when this stop started
        const stopStart = lastLog.is_stop
          ? await prisma.staffGpsLog.findFirst({
              where: {
                staff_id: staffId,
                is_stop: false,
                recorded_at: { lt: lastLog.recorded_at },
              },
              orderBy: { recorded_at: "desc" },
            })
          : lastLog;

        const startTime = stopStart?.recorded_at ?? lastLog.recorded_at;
        const minutesStopped = Math.floor(
          (Date.now() - new Date(startTime).getTime()) / 60000
        );

        if (minutesStopped >= STOP_THRESHOLD_MIN) {
          isStop = true;
          stopDuration = minutesStopped;
        }
      }
    }

    const log = await prisma.staffGpsLog.create({
      data: {
        staff_id: staffId,
        branch_id: branchId,
        tenant_id: tenantId,
        lat,
        lng,
        accuracy_m: accuracy ?? null,
        source: "auto",
        is_stop: isStop,
        stop_duration_min: stopDuration,
      },
    });

    return NextResponse.json({ ok: true, id: log.id, is_stop: isStop });
  } catch (e: any) {
    if (e?.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[collector/location]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
