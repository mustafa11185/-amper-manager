import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendPushToBranch, pushTemplates } from '@/lib/push'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (user.role !== 'owner' && user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { branch_id } = body
    const tenantId = user.tenantId as string

    if (!branch_id) {
      return NextResponse.json({ error: 'branch_id مطلوب' }, { status: 400 })
    }

    // Verify branch belongs to tenant
    const branch = await prisma.branch.findFirst({
      where: { id: branch_id, tenant_id: tenantId },
    })
    if (!branch) {
      return NextResponse.json({ error: 'الفرع غير موجود' }, { status: 404 })
    }

    // Get latest pricing
    const pricing = await prisma.monthlyPricing.findFirst({
      where: { branch_id },
      orderBy: { effective_from: 'desc' },
    })

    if (!pricing) {
      return NextResponse.json({ error: 'يجب تحديد سعر الأمبير أولاً' }, { status: 400 })
    }

    const priceNormal = Number(pricing.price_per_amp_normal)
    const priceGold = Number(pricing.price_per_amp_gold)

    if (priceNormal <= 0 && priceGold <= 0) {
      return NextResponse.json({ error: 'يجب تحديد سعر الأمبير أولاً' }, { status: 400 })
    }

    const now = new Date()
    const billingMonth = body.billing_month || (now.getMonth() + 1)
    const billingYear = body.billing_year || now.getFullYear()

    // CHECK 3: Was invoice generation already done today for this branch?
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const lastGenToday = await prisma.invoiceGenerationLog.findFirst({
        where: {
          branch_id,
          is_reversed: false,
          generated_at: { gte: todayStart, lte: todayEnd },
        },
        orderBy: { generated_at: 'desc' },
      })

      if (lastGenToday) {
        const time = new Date(lastGenToday.generated_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })
        return NextResponse.json({
          error: `تم الإصدار اليوم الساعة ${time} — يمكن الإصدار غداً`,
          already_generated_today: true,
        }, { status: 409 })
      }
    } catch (e: any) {
      console.log('InvoiceGenerationLog check failed (table may not exist):', e.message)
    }

    // Create generation log FIRST to act as a lock against concurrent generation.
    // If another request already created a log for this branch+month+year today, this will
    // be caught by the daily check above. By creating early, we narrow the race window.
    let generationLog: any
    try {
      generationLog = await prisma.invoiceGenerationLog.create({
        data: {
          branch_id,
          tenant_id: tenantId,
          invoice_count: 0,
          debt_count: 0,
          billing_month: billingMonth,
          billing_year: billingYear,
          generated_by: user.staffId || user.id || 'owner',
        },
      })
    } catch (logErr: any) {
      // If this fails due to a constraint violation, another generation is in progress
      if (logErr.code === 'P2002') {
        return NextResponse.json({ error: 'جاري إصدار الفواتير بالفعل' }, { status: 409 })
      }
      console.log('InvoiceGenerationLog early creation failed:', logErr.message)
      // Non-critical: continue without the log
    }

    // Get all active subscribers
    const subscribers = await prisma.subscriber.findMany({
      where: { branch_id, is_active: true },
      select: { id: true, amperage: true, subscription_type: true, tenant_id: true, total_debt: true },
    })

    // Count unpaid invoices that will become debt.
    //
    // CRITICAL: only roll invoices from PAST months. Previously this
    // query matched every unpaid invoice in the branch, which meant
    // re-generating the current month silently rolled all of the
    // just-created month-M invoices to debt and then Step 2 saw them
    // as "existing + fully_paid" and skipped creating replacements.
    // Result: after generation, nobody had a fresh invoice for the
    // new month — every subscriber had extra debt instead.
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        branch_id,
        is_fully_paid: false,
        OR: [
          { billing_year: { lt: billingYear } },
          {
            AND: [
              { billing_year: billingYear },
              { billing_month: { lt: billingMonth } },
            ],
          },
        ],
      },
      select: { id: true, subscriber_id: true, total_amount_due: true, amount_paid: true },
    })

    let totalCreated = 0
    let totalUpdated = 0
    let totalSkipped = 0
    let totalDebtAdded = 0

    // Step 1: Roll unpaid invoices into subscriber debt (separate transaction)
    await prisma.$transaction(async (tx) => {
      const debtBySubscriber = new Map<string, number>()
      for (const inv of unpaidInvoices) {
        const remaining = Number(inv.total_amount_due) - Number(inv.amount_paid)
        if (remaining > 0) {
          debtBySubscriber.set(inv.subscriber_id, (debtBySubscriber.get(inv.subscriber_id) || 0) + remaining)
        }
      }

      for (const [subId, debtAmount] of debtBySubscriber) {
        await tx.subscriber.update({
          where: { id: subId },
          data: { total_debt: { increment: debtAmount } },
        })
        totalDebtAdded++
      }

      if (unpaidInvoices.length > 0) {
        await tx.invoice.updateMany({
          where: { id: { in: unpaidInvoices.map(i => i.id) } },
          data: { is_fully_paid: true, payment_method: 'rolled_to_debt' },
        })
      }
    }, { maxWait: 10000, timeout: 30000 })

    // Step 2: Create or update invoices (separate transaction, longer timeout)
    await prisma.$transaction(async (tx) => {
      for (const sub of subscribers) {
        const pricePerAmp = sub.subscription_type === 'gold' ? priceGold : priceNormal
        const totalDue = Math.round(Number(sub.amperage) * pricePerAmp)

        const existing = await tx.invoice.findUnique({
          where: {
            subscriber_id_billing_month_billing_year: {
              subscriber_id: sub.id,
              billing_month: billingMonth,
              billing_year: billingYear,
            },
          },
        })

        if (existing) {
          if (Number(existing.amount_paid) > 0 || existing.is_fully_paid) {
            totalSkipped++
            continue
          }
          await tx.invoice.update({
            where: { id: existing.id },
            data: { base_amount: totalDue, total_amount_due: totalDue },
          })
          totalUpdated++
        } else {
          const numResult = await tx.$queryRaw<Array<{ num: string }>>`
            SELECT generate_invoice_number(${tenantId}, ${billingYear}::int) as num
          `
          const invoiceNumber = numResult[0]?.num ?? null

          await tx.invoice.create({
            data: {
              subscriber_id: sub.id,
              branch_id,
              tenant_id: tenantId,
              billing_month: billingMonth,
              billing_year: billingYear,
              base_amount: totalDue,
              total_amount_due: totalDue,
              amount_paid: 0,
              is_fully_paid: false,
              invoice_number: invoiceNumber,
            },
          })
          totalCreated++
        }
      }
    }, { maxWait: 10000, timeout: 60000 })

    // Update generation log with final counts (non-critical)
    try {
      if (generationLog) {
        await prisma.invoiceGenerationLog.update({
          where: { id: generationLog.id },
          data: {
            invoice_count: totalCreated,
            debt_count: totalDebtAdded,
          },
        })
      }
    } catch (logErr: any) {
      console.log('InvoiceGenerationLog update failed:', logErr.message)
    }

    // Notify all collectors in branch
    try {
      const push = pushTemplates.invoiceGenerated(totalCreated, billingMonth)
      sendPushToBranch({ branch_id, ...push, roles: ['collector'] }).catch(() => {})
    } catch (_) {}

    // Create notification record
    try {
      await prisma.notification.create({
        data: {
          branch_id, tenant_id: tenantId,
          type: 'invoice_generated',
          title: 'تم إصدار الفواتير 📋',
          body: `تم إصدار ${totalCreated} فاتورة لشهر ${billingMonth}/${billingYear}`,
          payload: { generated: totalCreated, billing_month: billingMonth, billing_year: billingYear },
        },
      })
    } catch (_) {}

    // ═══ إشعار تلقائي للمشتركين عند الإصدار ═══
    try {
      const monthNames = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو',
        'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
      const label = `${monthNames[billingMonth]} ${billingYear}`
      const msg = `صدرت فاتورة شهر ${label} — يرجى السداد في أقرب وقت`
      await prisma.$executeRaw`
        INSERT INTO announcements (tenant_id, type, message, target, auto_generated)
        VALUES (${tenantId}, 'invoice', ${msg}, 'all', true)
      `
    } catch (e: any) {
      console.error('[generate] auto-notify failed:', e.message)
    }

    // ═══ تصفير دورة جديدة ═══
    // Non-critical cleanup — failures here don't break the generation

    // 1. إغلاق الخصومات العامة المنتهية
    try {
      await prisma.$executeRaw`
        UPDATE subscriber_discounts SET
          is_active = false,
          updated_at = NOW()
        WHERE tenant_id = ${tenantId}::uuid
          AND is_active = true
          AND valid_until IS NOT NULL
          AND valid_until < NOW()
      `
    } catch (e: any) {
      console.log('Cycle reset (discounts) failed:', e.message)
    }

    // 2. إنهاء طلبات خصم الجابي المعلقة (expired)
    try {
      await prisma.$executeRaw`
        UPDATE collector_discount_requests SET
          status = 'expired',
          decided_at = NOW(),
          decision_note = 'انتهت تلقائياً عند إصدار دورة جديدة'
        WHERE tenant_id = ${tenantId}::uuid
          AND status = 'pending'
      `
    } catch (e: any) {
      console.log('Cycle reset (discount requests) failed:', e.message)
    }

    // 3. ═══ تكامل مع نظام الشركاء ═══
    // اقتراح توزيع أرباح الشهر السابق إذا لم يتم بعد
    try {
      const prevMonth = billingMonth === 1 ? 12 : billingMonth - 1
      const prevYear = billingMonth === 1 ? billingYear - 1 : billingYear

      const partnersCount = await prisma.partner.count({
        where: { tenant_id: tenantId, is_active: true },
      })

      if (partnersCount > 0) {
        const existingDistribution = await prisma.profitDistribution.findFirst({
          where: {
            tenant_id: tenantId,
            period_month: prevMonth,
            period_year: prevYear,
            scope_type: 'tenant',
          },
        })

        if (!existingDistribution) {
          await prisma.notification.create({
            data: {
              branch_id, tenant_id: tenantId,
              type: 'partner_distribution_suggested',
              title: '💰 توزيع أرباح الشهر السابق',
              body: `لم تقم بتوزيع أرباح ${prevMonth}/${prevYear} على الشركاء بعد — راجع الآن`,
              payload: { period_month: prevMonth, period_year: prevYear, partners_count: partnersCount },
            },
          })
        }
      }
    } catch (e: any) {
      console.log('Partner distribution check failed:', e.message)
    }

    return NextResponse.json({
      ok: true,
      generated: totalCreated,
      updated: totalUpdated,
      skipped: totalSkipped,
      debts_added: totalDebtAdded,
      billing_month: billingMonth,
      billing_year: billingYear,
    })
  } catch (err: any) {
    console.error('Invoice generate error:', err)
    return NextResponse.json({ error: err.message || 'خطأ في إصدار الفواتير' }, { status: 500 })
  }
}
