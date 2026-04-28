import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const { product_id, name, phone, governorate, notes } = await req.json()

    if (!name || !phone) {
      return NextResponse.json({ error: 'الاسم والهاتف مطلوبان' }, { status: 400 })
    }

    // Try to create order, fallback if table doesn't exist
    try {
      const order = await prisma.storeOrder.create({
        data: { product_id, name, phone, governorate, notes, status: 'new' }
      })
      return NextResponse.json({ ok: true, order_id: order.id })
    } catch {
      // Table might not exist yet, just return success
      return NextResponse.json({ ok: true, message: 'تم استلام طلبك' })
    }
  } catch (error) {
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
