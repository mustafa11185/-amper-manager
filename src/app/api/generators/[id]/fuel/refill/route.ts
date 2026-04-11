// POST /api/generators/[id]/fuel/refill
//
// Adds fuel to a generator's tank. Updates Generator.fuel_level_pct
// and writes a FuelLog row of type 'refill'.
//
// Permission rules:
//   • Owner / accountant → always allowed
//   • Operator           → requires can_add_fuel=true (existing field)
//   • Other              → denied
//
// Body:
//   {
//     liters:          number,        // amount added
//     unit_price_iqd?: number,        // optional cost per liter
//     notes?:          string
//   }
//
// Response: { ok, generator, log, new_level_pct }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  const { id } = await params

  try {
    const generator = await prisma.generator.findUnique({
      where: { id },
      include: { branch: { select: { tenant_id: true } } },
    })
    if (!generator) return NextResponse.json({ error: 'generator_not_found' }, { status: 404 })
    if (generator.branch.tenant_id !== user.tenantId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    // Permission
    const isOwner = user.role === 'owner' || user.role === 'accountant'
    if (!isOwner) {
      if (user.role === 'collector') {
        return NextResponse.json({ error: 'لا تملك صلاحية إضافة وقود' }, { status: 403 })
      }
      const perm = await prisma.operatorPermission.findUnique({ where: { staff_id: user.id } })
      if (!perm || !perm.can_add_fuel) {
        return NextResponse.json({ error: 'لا تملك صلاحية إضافة وقود' }, { status: 403 })
      }
    }

    const body = await req.json().catch(() => ({}))
    const liters = Number(body.liters)
    if (!liters || liters <= 0) {
      return NextResponse.json({ error: 'كمية الوقود غير صالحة' }, { status: 400 })
    }
    const unitPrice = body.unit_price_iqd != null ? Number(body.unit_price_iqd) : null
    const notes = body.notes ? String(body.notes).trim() : null

    // Tank capacity is REQUIRED — without it the percentage math is
    // meaningless. Reject loudly so the user fixes the generator config
    // instead of silently storing data that never updates the level.
    const tankCap = generator.tank_capacity_liters ?? 0
    if (tankCap <= 0) {
      return NextResponse.json({
        error: 'يجب تحديد سعة خزان الوقود في إعدادات المولدة قبل إضافة وقود',
        code: 'tank_capacity_missing',
      }, { status: 400 })
    }

    // Compute new level
    const currentPct = generator.fuel_level_pct ?? 0
    const currentLiters = (currentPct * tankCap) / 100
    const newLiters = Math.min(tankCap, currentLiters + liters)
    const newPct = (newLiters / tankCap) * 100
    const totalCost = unitPrice != null ? unitPrice * liters : null

    // Optional credit: if the user marks the refill as credit + picks
    // a supplier, we ALSO create an Expense row tied to that supplier
    // so the debt shows up in the supplier-debts report and the
    // partner portal. Validation: credit/partial requires supplier_id.
    const isCredit = body.is_credit === true || body.payment_type === 'credit'
    const isPartial = body.payment_type === 'partial'
    const supplierId = body.supplier_id ? String(body.supplier_id) : null
    let amountPaid = totalCost ?? 0
    let amountOwed = 0
    let paymentType: 'cash' | 'credit' | 'partial' = 'cash'

    if (totalCost && (isCredit || isPartial)) {
      if (!supplierId) {
        return NextResponse.json({
          error: 'يجب اختيار المورّد عند الشراء بالدين',
          code: 'supplier_required',
        }, { status: 400 })
      }
      // Verify supplier ownership
      const sup = await prisma.supplier.findUnique({ where: { id: supplierId } })
      if (!sup || sup.tenant_id !== user.tenantId) {
        return NextResponse.json({ error: 'المورّد غير صالح' }, { status: 400 })
      }
      if (isCredit) {
        paymentType = 'credit'
        amountPaid = 0
        amountOwed = totalCost
      } else {
        paymentType = 'partial'
        amountPaid = Math.max(0, Math.min(totalCost, Number(body.amount_paid ?? 0)))
        amountOwed = totalCost - amountPaid
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.generator.update({
        where: { id },
        data: {
          fuel_level_pct: newPct,
          last_fuel_update: new Date(),
        },
      })
      const log = await tx.fuelLog.create({
        data: {
          generator_id: id,
          event_type: 'refill',
          source: isOwner ? 'manual_owner' : 'manual_staff',
          staff_id: user.id,
          fuel_level_percent: newPct,
          fuel_added_liters: liters,
          liters_after: newLiters,
          cost_iqd: totalCost,
          unit_price_iqd: unitPrice,
          notes,
        },
      })

      // Create the expense / debt row when there's a cost.
      let expense: any = null
      if (totalCost && totalCost > 0) {
        expense = await tx.expense.create({
          data: {
            branch_id: generator.branch_id,
            staff_id: user.id,
            category: 'وقود',
            amount: totalCost,
            amount_paid: amountPaid,
            amount_owed: amountOwed,
            payment_type: paymentType,
            supplier_id: supplierId,
            description: `${liters.toFixed(0)} لتر${notes ? ' — ' + notes : ''}`,
            related_to: `fuel_log:${log.id}`,
          },
        })
      }

      return { updated, log, expense }
    })

    return NextResponse.json({
      ok: true,
      generator: result.updated,
      log: result.log,
      new_level_pct: newPct,
      new_liters: newLiters,
    })
  } catch (err: any) {
    console.error('[fuel/refill]', err)
    return NextResponse.json({ error: err.message || 'خطأ' }, { status: 500 })
  }
}
