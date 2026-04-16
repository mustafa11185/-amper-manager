import { NextRequest, NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/device-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await authenticateDevice(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const generator = auth.device.generator;
  const branch = generator.branch;

  // Get first engine for pin config
  const engine = await prisma.engine.findFirst({
    where: { generator_id: generator.id },
  });

  // Check for active manual override
  const activeOverride = await prisma.manualOverrideLog.findFirst({
    where: {
      generator_id: generator.id,
      deactivated_at: null,
      expires_at: { gt: new Date() },
    },
  });

  return NextResponse.json({
    generator_id: generator.id,
    branch_id: branch.id,
    tenant_id: branch.tenant_id,
    gold_ct_pin: engine?.gold_ct_pin ?? null,
    normal_ct_pin: engine?.normal_ct_pin ?? null,
    ds18b20_address: engine?.ds18b20_address ?? null,
    tank_full_dist_cm: generator.tank_full_dist_cm ?? 5,
    tank_empty_dist_cm: generator.tank_empty_dist_cm ?? 100,
    run_status: generator.run_status,
    manual_override_active: !!activeOverride,
  });
}
