import { NextRequest } from "next/server";
import { prisma } from "./prisma";

export async function authenticateDevice(req: NextRequest) {
  const token = req.headers.get("x-device-token");
  if (!token) return null;

  // Check IotDevice first
  const iotDevice = await prisma.iotDevice.findUnique({
    where: { device_token: token },
    include: { generator: { include: { branch: true } } },
  });
  if (iotDevice) {
    await prisma.iotDevice.update({
      where: { id: iotDevice.id },
      data: { is_online: true, last_seen: new Date() },
    });
    return { type: "iot" as const, device: iotDevice };
  }

  // Check RaspberryDevice
  const raspDevice = await prisma.raspberryDevice.findUnique({
    where: { device_token: token },
    include: { generator: { include: { branch: true } } },
  });
  if (raspDevice) {
    await prisma.raspberryDevice.update({
      where: { id: raspDevice.id },
      data: { is_online: true, last_seen: new Date() },
    });
    return { type: "raspberry" as const, device: raspDevice };
  }

  return null;
}
