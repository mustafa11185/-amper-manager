// Initiate an online payment for the authenticated subscriber.
//
// Only the typed adapter layer is supported: 'zaincash' | 'qi' | 'asiapay'.
// Per-tenant credentials are loaded + decrypted server-side; the request
// body never carries plaintext credentials.
//
// Validation that runs before any gateway is contacted:
//   1. branch.is_online_payment_enabled must be true (per-branch kill switch)
//   2. amount must be ≤ what the subscriber actually owes (no overpay,
//      no arbitrary amounts)
//   3. invoice_id, if supplied, must belong to the authenticated subscriber
//      (defeats the "pay someone else's invoice" trick)

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGateway, type GatewayName } from "@/lib/payments";
import { cookies } from "next/headers";

const SUPPORTED_GATEWAYS: GatewayName[] = ['zaincash', 'qi', 'asiapay'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { invoice_id, amount, payment_method, subscriber_id: bodySubscriberId } = body;
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    if (!SUPPORTED_GATEWAYS.includes(payment_method as GatewayName)) {
      return NextResponse.json(
        { error: "بوابة دفع غير صالحة" },
        { status: 400 }
      );
    }

    // Two auth modes accepted on this endpoint:
    //   (a) Subscriber portal: subscriber_id from httpOnly cookie. The body
    //       must NOT carry a subscriber_id — we ignore it if present.
    //   (b) Staff Flutter app: next-auth session + subscriber_id in body.
    //       The staff member must belong to the same tenant as the target.
    let subscriberId: string;
    const cookieStore = await cookies();
    const cookieSubId = cookieStore.get("subscriber_id")?.value;
    if (cookieSubId) {
      subscriberId = cookieSubId;
    } else {
      const session = await getServerSession(authOptions);
      const user = session?.user as { tenantId?: string } | undefined;
      if (!user?.tenantId) {
        return NextResponse.json({ error: "غير مسجل" }, { status: 401 });
      }
      if (!bodySubscriberId) {
        return NextResponse.json({ error: "subscriber_id مطلوب" }, { status: 400 });
      }
      const targetTenant = await prisma.subscriber.findUnique({
        where: { id: bodySubscriberId },
        select: { tenant_id: true },
      });
      if (!targetTenant || targetTenant.tenant_id !== user.tenantId) {
        return NextResponse.json({ error: "مشترك غير مرخّص لك" }, { status: 403 });
      }
      subscriberId = bodySubscriberId;
    }

    const subscriber = await prisma.subscriber.findUnique({
      where: { id: subscriberId },
      include: { branch: true },
    });
    if (!subscriber) return NextResponse.json({ error: "مشترك غير موجود" }, { status: 404 });

    const branch = subscriber.branch;
    if (!branch.is_online_payment_enabled) {
      return NextResponse.json({ error: "الدفع الإلكتروني غير مفعّل لهذا الفرع" }, { status: 400 });
    }

    // ---- Amount + invoice ownership validation ---------------------------
    let invoice: { id: string; subscriber_id: string; total_amount_due: number; amount_paid: number } | null = null;
    if (invoice_id) {
      const inv = await prisma.invoice.findUnique({
        where: { id: invoice_id },
        select: { id: true, subscriber_id: true, total_amount_due: true, amount_paid: true },
      });
      if (!inv) return NextResponse.json({ error: "فاتورة غير موجودة" }, { status: 404 });
      if (inv.subscriber_id !== subscriber.id) {
        console.warn(`[payment/init] cross-subscriber invoice attempt: sub=${subscriber.id} inv=${inv.id} owner=${inv.subscriber_id}`);
        return NextResponse.json({ error: "فاتورة غير مرتبطة بحسابك" }, { status: 403 });
      }
      invoice = {
        id: inv.id,
        subscriber_id: inv.subscriber_id,
        total_amount_due: Number(inv.total_amount_due),
        amount_paid: Number(inv.amount_paid),
      };
    }

    const invoiceUnpaid = invoice ? Math.max(0, invoice.total_amount_due - invoice.amount_paid) : 0;
    const debt = Number(subscriber.total_debt) || 0;
    const ceiling = invoiceUnpaid + debt;
    if (amount > ceiling + 1) {
      return NextResponse.json(
        { error: `المبلغ يتجاوز المستحق (الحد الأقصى ${ceiling.toLocaleString('en')} د.ع)` },
        { status: 400 }
      );
    }
    // ---------------------------------------------------------------------

    const gw = payment_method as GatewayName;
    const gateway = await getGateway(subscriber.tenant_id, gw);
    if (!gateway) {
      return NextResponse.json(
        { error: `بوابة ${gw} غير مفعّلة لهذا التاجر` },
        { status: 400 }
      );
    }

    const externalRef = crypto.randomUUID();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";

    let initResult;
    try {
      initResult = await gateway.initiate({
        externalRef,
        orderId: invoice_id ? `INV-${invoice_id}` : `SUB-${subscriber.id}-${Date.now()}`,
        amountIqd: amount,
        customerPhone: subscriber.phone || undefined,
        successUrl: `${baseUrl}/api/payment/callback/${gw}?t=${subscriber.tenant_id}`,
        failureUrl: `${baseUrl}/api/payment/callback/${gw}?t=${subscriber.tenant_id}`,
        language: 'ar',
      });
    } catch (e: any) {
      console.error(`[payment/init] ${gw} initiate failed:`, e.message);
      return NextResponse.json(
        { error: `فشل إنشاء الدفع عبر ${gw}: ${e.message}` },
        { status: 502 }
      );
    }

    await prisma.onlinePayment.create({
      data: {
        subscriber_id: subscriber.id,
        tenant_id: subscriber.tenant_id,
        invoice_id: invoice_id || null,
        amount,
        gateway: gw,
        gateway_ref: `${externalRef}|${initResult.gatewayTxId}`,
        status: 'pending',
      },
    });

    return NextResponse.json({
      payment_url: initResult.redirectUrl,
      order_id: initResult.gatewayTxId,
      gateway: gw,
    });
  } catch (err: any) {
    console.error("[subscriber payment/init] Error:", err);
    return NextResponse.json({ error: err.message || "خطأ" }, { status: 500 });
  }
}
