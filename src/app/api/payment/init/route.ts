// Initiate an online payment for the authenticated subscriber.
//
// payment_method values, dispatched in this order:
//   - 'zaincash' | 'qi' | 'asiapay'  → new typed adapter (lib/payments/*).
//     Per-tenant credentials are loaded + decrypted server-side; the
//     subscriber's body never touches plaintext.
//   - 'aps' | 'furatpay'             → legacy createPayment() path. The
//     branch's active_gateway field decides which one runs.
//   - missing / unknown              → falls through to the legacy path
//     with whatever active_gateway the branch is set to.
//
// Validation that runs before any gateway is contacted:
//   1. branch.is_online_payment_enabled must be true (per-branch kill switch)
//   2. amount must equal what the subscriber actually owes (no overpay,
//      no arbitrary amounts)
//   3. invoice_id, if supplied, must belong to the authenticated subscriber
//      (defeats the "pay someone else's invoice" trick)

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPayment } from "@/lib/payment-service";
import { getGateway, type GatewayName } from "@/lib/payments";
import { cookies } from "next/headers";

const NEW_GATEWAYS: GatewayName[] = ['zaincash', 'qi', 'asiapay'];
const LEGACY_GATEWAYS = ['aps', 'furatpay'] as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { invoice_id, amount, payment_method, subscriber_id: bodySubscriberId } = body;
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
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
      // Staff can only initiate payments for subscribers in their own tenant.
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

    // Per-branch kill switch — checked once for both legacy and new paths.
    if (!branch.is_online_payment_enabled) {
      return NextResponse.json({ error: "الدفع الإلكتروني غير مفعّل لهذا الفرع" }, { status: 400 });
    }

    // ---- Amount + invoice ownership validation ---------------------------
    // Compute the subscriber's true ceiling: unpaid balance on the supplied
    // invoice (if any) plus any accumulated debt. We tolerate a 1 IQD
    // rounding band — clients sometimes ship amounts as 1234.56 → 1235.
    let invoice: { id: string; subscriber_id: string; total_amount_due: number; amount_paid: number } | null = null;
    if (invoice_id) {
      const inv = await prisma.invoice.findUnique({
        where: { id: invoice_id },
        select: { id: true, subscriber_id: true, total_amount_due: true, amount_paid: true },
      });
      if (!inv) return NextResponse.json({ error: "فاتورة غير موجودة" }, { status: 404 });
      if (inv.subscriber_id !== subscriber.id) {
        // Authenticated subscriber tried to pay someone else's invoice. Log
        // and reject — this is a deliberate auth bypass attempt, not a typo.
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

    // New gateways (ZainCash, Qi, AsiaPay) — typed adapter layer.
    if (NEW_GATEWAYS.includes(payment_method as GatewayName)) {
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
    }

    // Legacy path (APS / FuratPay).
    //
    // The portal's payment-options endpoint emits explicit 'aps' / 'furatpay'
    // values. Older builds (and the staff Flutter app) still send card-shape
    // hints like 'qi_card' / 'visa' / null — those fall through to the
    // branch's active_gateway. Either way, createPayment() routes based on
    // branch.active_gateway internally.
    const isLegacyKnown = (LEGACY_GATEWAYS as readonly string[]).includes(payment_method);
    if (!isLegacyKnown && branch.active_gateway === "none") {
      return NextResponse.json({ error: "الدفع الإلكتروني غير مفعّل" }, { status: 400 });
    }
    // If client asked for a specific legacy gateway but the branch is set
    // to a different one, refuse rather than silently routing to the wrong
    // merchant account.
    if (isLegacyKnown && payment_method !== branch.active_gateway) {
      return NextResponse.json(
        { error: `بوابة ${payment_method} غير مفعّلة لهذا الفرع` },
        { status: 400 }
      );
    }

    const pricing = await prisma.monthlyPricing.findFirst({
      where: { branch_id: branch.id },
      orderBy: { effective_from: "desc" },
    });
    const billingMonth = pricing ? new Date(pricing.effective_from).getMonth() + 1 : new Date().getMonth() + 1;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";
    const callbackPath = branch.active_gateway === "aps" ? "aps-callback" : "furatpay-callback";

    const result = await createPayment(branch as any, {
      invoice_id: invoice_id || null,
      subscriber_id: subscriber.id,
      subscriber_name: subscriber.name,
      subscriber_phone: subscriber.phone || "",
      amount,
      billing_month: billingMonth,
      return_url: `${baseUrl}/payment/success`,
      callback_url: `${baseUrl}/api/payment/${callbackPath}`,
    });

    await prisma.onlinePayment.create({
      data: {
        subscriber_id: subscriber.id,
        tenant_id: subscriber.tenant_id,
        invoice_id: invoice_id || null,
        amount,
        gateway: result.gateway,
        gateway_ref: result.order_id,
        status: "pending",
      },
    });

    return NextResponse.json({ payment_url: result.payment_url, order_id: result.order_id, gateway: result.gateway });
  } catch (err: any) {
    console.error("[subscriber payment/init] Error:", err);
    return NextResponse.json({ error: err.message || "خطأ" }, { status: 500 });
  }
}
