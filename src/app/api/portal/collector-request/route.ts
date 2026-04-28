import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    console.log("[collector-request] POST called");

    const cookieStore = await cookies();
    const subscriberId = cookieStore.get("subscriber_id")?.value;
    console.log("[collector-request] subscriber_id cookie:", subscriberId ? "SET" : "MISSING");

    if (!subscriberId) {
      return NextResponse.json({ error: "غير مسجل — أعد إدخال الكود" }, { status: 401 });
    }

    const subscriber = await prisma.subscriber.findUnique({
      where: { id: subscriberId },
    });
    console.log("[collector-request] subscriber found:", subscriber?.name ?? "NOT_FOUND");

    if (!subscriber) {
      return NextResponse.json({ error: "مشترك غير موجود" }, { status: 404 });
    }

    // Prevent spam — 1 request per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await prisma.collectorCallRequest.findFirst({
      where: {
        subscriber_id: subscriber.id,
        requested_at: { gte: oneHourAgo },
        status: "pending",
      },
    });

    if (recent) {
      console.log("[collector-request] Duplicate — already pending from:", recent.requested_at);
      return NextResponse.json({ ok: true, message: "تم إرسال طلبك مسبقاً — سيتواصل معك الجابي قريباً" });
    }

    // Create request
    const callRequest = await prisma.collectorCallRequest.create({
      data: {
        subscriber_id: subscriber.id,
        branch_id: subscriber.branch_id,
        status: "pending",
      },
    });
    console.log("[collector-request] Created call request:", callRequest.id);

    const address = subscriber.address || subscriber.alley || "";

    // Notification for collector
    const collectorNotif = await prisma.notification.create({
      data: {
        branch_id: subscriber.branch_id,
        tenant_id: subscriber.tenant_id,
        type: "collector_call",
        title: "طلب زيارة",
        body: `📞 ${subscriber.name} يطلب زيارتك${address ? " — " + address : ""}`,
        is_read: false,
        payload: {
          subscriber_id: subscriber.id,
          subscriber_name: subscriber.name,
          subscriber_address: address,
          request_id: callRequest.id,
          target: "collector",
        },
      },
    });
    console.log("[collector-request] Created collector notification:", collectorNotif.id);

    // Notification for owner/manager
    const ownerNotif = await prisma.notification.create({
      data: {
        branch_id: subscriber.branch_id,
        tenant_id: subscriber.tenant_id,
        type: "collector_call_manager",
        title: "طلب زيارة الجابي",
        body: `📞 ${subscriber.name} طلب زيارة الجابي${address ? " — " + address : ""}`,
        is_read: false,
        payload: {
          subscriber_id: subscriber.id,
          subscriber_name: subscriber.name,
          subscriber_address: address,
          request_id: callRequest.id,
          target: "owner",
        },
      },
    });
    console.log("[collector-request] Created owner notification:", ownerNotif.id);

    return NextResponse.json({ ok: true, message: "تم إرسال طلبك — سيتواصل معك الجابي قريباً" });
  } catch (error: any) {
    console.error("[collector-request] ERROR:", error?.message || error);
    console.error("[collector-request] STACK:", error?.stack);
    return NextResponse.json(
      {
        error: "خطأ في إرسال الطلب — حاول مرة أخرى",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}
