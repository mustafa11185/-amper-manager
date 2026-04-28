import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const products = await prisma.storeProduct.findMany({
    where: { is_active: true },
    orderBy: { sort_order: "asc" },
  });

  return NextResponse.json({
    products: products.map((p: any) => ({
      id: p.id,
      name_ar: p.name_ar,
      name_en: p.name_en ?? null,
      description_ar: p.description ?? null,
      price_usd: Number(p.price_usd),
      price_iqd: Math.round(Number(p.price_usd) * 1300),
      category: p.category,
    })),
  });
}
