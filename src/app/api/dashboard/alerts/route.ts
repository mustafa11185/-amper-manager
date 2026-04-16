import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);

  const alerts = await prisma.notification.findMany({
    where: {
      type: {
        in: [
          "temp_warning",
          "temp_critical",
          "fuel_warning",
          "fuel_critical",
          "oil_change_due",
          "device_offline",
        ],
      },
    },
    include: {
      branch: { select: { name: true, tenant_id: true } },
    },
    orderBy: { created_at: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  const total = await prisma.notification.count({
    where: {
      type: {
        in: [
          "temp_warning",
          "temp_critical",
          "fuel_warning",
          "fuel_critical",
          "oil_change_due",
          "device_offline",
        ],
      },
    },
  });

  return NextResponse.json({ alerts, total, page, limit });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await prisma.notification.update({
    where: { id },
    data: { is_read: true },
  });

  return NextResponse.json({ ok: true });
}
