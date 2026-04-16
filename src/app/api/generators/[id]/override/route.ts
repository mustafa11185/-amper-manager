import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { action, duration_hours, reason } = body;

  if (!action || !["on", "off"].includes(action)) {
    return NextResponse.json(
      { error: "action must be 'on' or 'off'" },
      { status: 400 }
    );
  }

  const generator = await prisma.generator.findUnique({
    where: { id },
  });
  if (!generator) {
    return NextResponse.json({ error: "Generator not found" }, { status: 404 });
  }

  // Max duration 4 hours
  const hours = Math.min(duration_hours ?? 4, 4);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  const newRunStatus = action === "on";

  // Deactivate any existing active overrides
  await prisma.manualOverrideLog.updateMany({
    where: {
      generator_id: id,
      deactivated_at: null,
    },
    data: { deactivated_at: new Date() },
  });

  // Create new override
  const override = await prisma.manualOverrideLog.create({
    data: {
      generator_id: id,
      activated_by: "owner", // TODO: extract from auth
      expires_at: expiresAt,
      reason: reason ?? null,
    },
  });

  // Update generator run status
  await prisma.generator.update({
    where: { id },
    data: { run_status: newRunStatus },
  });

  return NextResponse.json({
    ok: true,
    override_id: override.id,
    action,
    expires_at: expiresAt,
  });
}
