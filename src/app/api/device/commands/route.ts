import { NextRequest, NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/device-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await authenticateDevice(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const generator = auth.device.generator;

  // Check for active manual overrides (pending commands)
  const activeOverrides = await prisma.manualOverrideLog.findMany({
    where: {
      generator_id: generator.id,
      deactivated_at: null,
      expires_at: { gt: new Date() },
    },
    orderBy: { activated_at: "desc" },
  });

  const commands = activeOverrides.map((o) => ({
    type: "set_run_status" as const,
    value: true,
  }));

  // If no active override but generator has override that expired, deactivate it
  const expiredOverrides = await prisma.manualOverrideLog.findMany({
    where: {
      generator_id: generator.id,
      deactivated_at: null,
      expires_at: { lt: new Date() },
    },
  });

  for (const expired of expiredOverrides) {
    await prisma.manualOverrideLog.update({
      where: { id: expired.id },
      data: { deactivated_at: new Date() },
    });
  }

  return NextResponse.json({ commands });
}
