import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { device_type, generator_id, firmware } = body;

  if (!device_type || !generator_id) {
    return NextResponse.json(
      { error: "device_type and generator_id are required" },
      { status: 400 }
    );
  }

  // Verify generator exists
  const generator = await prisma.generator.findUnique({
    where: { id: generator_id },
  });
  if (!generator) {
    return NextResponse.json(
      { error: "Generator not found" },
      { status: 404 }
    );
  }

  const deviceToken = randomUUID();

  if (device_type === "esp32") {
    await prisma.iotDevice.create({
      data: {
        generator_id,
        device_token: deviceToken,
        device_type: "esp32",
        firmware: firmware ?? null,
        is_online: true,
        last_seen: new Date(),
      },
    });
  } else if (device_type === "raspberry") {
    await prisma.raspberryDevice.create({
      data: {
        generator_id,
        device_token: deviceToken,
        is_online: true,
        last_seen: new Date(),
      },
    });
  } else {
    return NextResponse.json(
      { error: "device_type must be esp32 or raspberry" },
      { status: 400 }
    );
  }

  return NextResponse.json({ device_token: deviceToken });
}
