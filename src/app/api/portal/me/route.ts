import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
  const cookieStore = await cookies();
  const subscriberId = cookieStore.get("subscriber_id")?.value;

  if (!subscriberId) {
    return NextResponse.json({ error: "غير مسجل" }, { status: 401 });
  }

  const subscriber = await prisma.subscriber.findUnique({
    where: { id: subscriberId },
    include: { branch: true },
  });

  if (!subscriber || !subscriber.is_active) {
    return NextResponse.json({ error: "المشترك غير موجود" }, { status: 404 });
  }

  const generator = await prisma.generator.findFirst({
    where: { branch_id: subscriber.branch_id, is_active: true },
    include: {
      subscriber_app_settings: true,
      iot_devices: { select: { last_seen: true, is_online: true }, take: 1 },
    },
  });

  const invoices = await prisma.invoice.findMany({
    where: { subscriber_id: subscriber.id },
    orderBy: [{ billing_year: "desc" }, { billing_month: "desc" }],
    take: 12,
  });

  const currentInvoice = invoices[0] ?? null;
  const settings = generator?.subscriber_app_settings ?? null;
  const lastDevice = (generator as any)?.iot_devices?.[0] ?? null;
  const branch = subscriber.branch;

  // Today's hours calculation
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let goldHoursToday = 0;
  let normalHoursToday = 0;

  if (generator) {
    const normalCuts = await prisma.normalCutLog.findMany({
      where: {
        branch_id: subscriber.branch_id,
        cut_start: { gte: todayStart },
      },
    });
    const totalNormalMin = normalCuts.reduce((sum, c) => sum + (c.duration_min ?? 0), 0);
    normalHoursToday = Math.round((totalNormalMin / 60) * 10) / 10;

    // Gold hours = total run hours minus normal cut hours (assume 24h cycle)
    // If generator is running, estimate hours since midnight
    const hoursSinceMidnight = (now.getTime() - todayStart.getTime()) / (1000 * 60 * 60);
    goldHoursToday = Math.round((hoursSinceMidnight - normalHoursToday) * 10) / 10;
    if (goldHoursToday < 0) goldHoursToday = 0;
  }

  // Pricing
  const pricing = await prisma.monthlyPricing.findFirst({
    where: { branch_id: subscriber.branch_id },
    orderBy: { effective_from: "desc" },
  });
  const pricePerAmp = subscriber.subscription_type === "gold"
    ? pricing ? Number(pricing.price_per_amp_gold) : null
    : pricing ? Number(pricing.price_per_amp_normal) : null;

  return NextResponse.json({
    id: subscriber.id,
    name: subscriber.name,
    serial_number: subscriber.serial_number,
    subscription_type: subscriber.subscription_type,
    amperage: Number(subscriber.amperage),
    phone: subscriber.phone,
    total_debt: Number(subscriber.total_debt),
    branch_name: branch.name,
    price_per_amp: pricePerAmp,
    current_invoice: currentInvoice ? {
      id: currentInvoice.id,
      billing_month: currentInvoice.billing_month,
      billing_year: currentInvoice.billing_year,
      total_amount_due: Number(currentInvoice.total_amount_due),
      amount_paid: Number(currentInvoice.amount_paid),
      is_fully_paid: currentInvoice.is_fully_paid,
    } : null,
    invoices_history: invoices.map(inv => ({
      id: inv.id,
      billing_month: inv.billing_month,
      billing_year: inv.billing_year,
      total_amount_due: Number(inv.total_amount_due),
      amount_paid: Number(inv.amount_paid),
      is_fully_paid: inv.is_fully_paid,
      created_at: inv.created_at.toISOString(),
    })),
    generator_status: generator ? {
      name: generator.name,
      run_status: generator.run_status,
      last_seen: lastDevice?.last_seen?.toISOString() ?? null,
      is_online: lastDevice?.is_online ?? false,
      gold_hours_today: goldHoursToday,
      normal_hours_today: normalHoursToday,
    } : null,
    settings: settings ? {
      is_active: (settings as any).is_active,
      primary_color: (settings as any).primary_color || "#1B4FD8",
      welcome_message: (settings as any).welcome_message,
      collector_call_enabled: (settings as any).collector_call_enabled,
      show_debt: (settings as any).show_debt ?? true,
      show_generator: (settings as any).show_generator ?? true,
      show_invoices: (settings as any).show_invoices ?? true,
      show_price: (settings as any).show_price ?? false,
      show_collector: (settings as any).show_collector ?? false,
      online_payment: (settings as any).online_payment ?? true,
      partial_payment: (settings as any).partial_payment ?? false,
      direct_contact: (settings as any).direct_contact ?? false,
      notifications_enabled: (settings as any).notifications_enabled ?? true,
      upsell_enabled: (settings as any).upsell_enabled ?? true,
    } : {
      is_active: true,
      primary_color: "#1B4FD8",
      welcome_message: null,
      collector_call_enabled: true,
      show_debt: true, show_generator: true, show_invoices: true,
      show_price: false, show_collector: false, online_payment: true,
      partial_payment: false, direct_contact: false,
      notifications_enabled: true, upsell_enabled: true,
    },
  });
  } catch (error: any) {
    console.error('[subscriber/me] Error:', error?.message || error);
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
