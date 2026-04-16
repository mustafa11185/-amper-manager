import { NextRequest, NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/device-auth";

export async function POST(req: NextRequest) {
  const auth = await authenticateDevice(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    server_time: new Date().toISOString(),
  });
}
