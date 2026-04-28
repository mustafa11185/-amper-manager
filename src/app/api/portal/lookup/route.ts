import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code } = body;

    console.log("[lookup] Attempt:", code);
    console.log("[lookup] DB URL:", process.env.DATABASE_URL ? "EXISTS" : "MISSING");

    if (!code) {
      return NextResponse.json({ error: "الكود مطلوب" }, { status: 400 });
    }

    // Normalize: uppercase, strip spaces and non-alphanumeric (except hyphens)
    const normalized = code.trim().toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9-]/g, "");

    // Build hyphenated version if entered without hyphens
    const withHyphens = normalized.includes("-")
      ? normalized
      : normalized.replace(/^([A-Z]{2})(\d{2})(\d{3})(\d{3})$/, "$1-$2-$3-$4");

    console.log("[lookup] Normalized:", withHyphens);

    // Try new format with hyphens (e.g. "BG-05-001-482")
    let subscriber = await prisma.subscriber.findFirst({
      where: { access_code: withHyphens, is_active: true },
      include: { branch: { select: { name: true } } },
    });

    // Fallback: try without hyphens (e.g. "BG05001482")
    if (!subscriber && withHyphens !== normalized) {
      subscriber = await prisma.subscriber.findFirst({
        where: { access_code: normalized, is_active: true },
        include: { branch: { select: { name: true } } },
      });
    }

    // Fallback: try old 6-digit format (e.g. "410353")
    if (!subscriber && /^\d{6}$/.test(normalized)) {
      subscriber = await prisma.subscriber.findFirst({
        where: { access_code: normalized, is_active: true },
        include: { branch: { select: { name: true } } },
      });
    }

    console.log("[lookup] Found:", subscriber?.id ?? "NOT_FOUND");

    if (!subscriber) {
      return NextResponse.json({ error: "الكود غير صحيح" }, { status: 404 });
    }

    // Secure session cookie — 30 days (not 1 year) so shared-device
    // subscribers don't leave long-lived sessions behind. Strict
    // sameSite prevents CSRF. Secure flag ensures HTTPS-only.
    const cookieStore = await cookies();
    cookieStore.set("subscriber_id", subscriber.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days (was 365)
      sameSite: "strict",
    });

    return NextResponse.json({
      ok: true,
      subscriber_id: subscriber.id,
      name: subscriber.name,
      branch_name: subscriber.branch.name,
    });
  } catch (error: any) {
    console.error("[lookup] ERROR:", error?.message || error);
    console.error("[lookup] STACK:", error?.stack);
    console.error("[lookup] DB_URL:", process.env.DATABASE_URL ? "SET" : "NOT_SET");

    return NextResponse.json(
      {
        error: "خطأ في الخادم",
        details: process.env.NODE_ENV === "development" ? String(error) : undefined,
      },
      { status: 500 }
    );
  }
}
