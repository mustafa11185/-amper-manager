import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        phone: { label: 'Phone', type: 'text' },
        password: { label: 'Password', type: 'password' },
        role: { label: 'Role', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials) return null

        if (credentials.role === 'owner') {
          // Use explicit select so this query is resilient to schema additions.
          // (Without select, Prisma fetches all columns and crashes if production DB
          // is missing any new column we added to the Tenant model — this broke owner
          // login after the IoT integration added many new optional columns.)
          let tenant: { id: string; name: string; owner_name: string; phone: string; password: string; plan: string; is_active: boolean } | null = null
          try {
            tenant = await prisma.tenant.findUnique({
              where: { phone: credentials.phone },
              select: {
                id: true,
                // tenant.name is the meaningful project label set in the
                // create-client wizard (e.g. "مولدة النور"). It's what the
                // shell header should display, NOT branch.name (which is
                // a boilerplate "الفرع الرئيسي").
                name: true,
                owner_name: true,
                phone: true,
                password: true,
                plan: true,
                is_active: true,
              },
            }) as any
          } catch (err: any) {
            console.error('[auth/owner] tenant lookup failed:', err.message)
            return null
          }
          if (!tenant || !tenant.is_active) return null
          const valid = await bcrypt.compare(credentials.password, tenant.password)
          if (!valid) return null
          return {
            id: tenant.id,
            name: tenant.owner_name,
            phone: tenant.phone,
            role: 'owner',
            tenantId: tenant.id,
            tenantName: tenant.name,
            plan: tenant.plan,
          }
        } else {
          // Use explicit select for the same defensive reason as owner branch.
          let staff: any
          try {
            staff = await prisma.staff.findFirst({
              where: { phone: credentials.phone, is_active: true },
              select: {
                id: true,
                name: true,
                phone: true,
                role: true,
                tenant_id: true,
                branch_id: true,
                pin: true,
                can_collect: true,
                can_operate: true,
                is_owner_acting: true,
                branch: { select: { name: true } },
                // Pull the project name from the parent tenant so the
                // staff dashboard header can show "مولدة النور" instead
                // of the boilerplate "الفرع الرئيسي".
                tenant: { select: { name: true } },
                collector_permission: { select: { can_give_discount: true, discount_max_amount: true } },
                operator_permission: { select: { can_record_oil_change: true } },
              },
            })
          } catch (err: any) {
            console.error('[auth/staff] staff lookup failed:', err.message)
            return null
          }
          if (!staff) return null

          // Check if account is locked (locked_until / login_attempts are raw-SQL columns)
          try {
            const lockRows = await prisma.$queryRawUnsafe<Array<{ locked_until: Date | null }>>(
              `SELECT locked_until FROM staff WHERE id = $1 LIMIT 1`,
              staff.id
            )
            const lockedUntil = lockRows[0]?.locked_until
            if (lockedUntil && new Date(lockedUntil) > new Date()) {
              const remaining = Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000)
              throw new Error(`الحساب مقفل لمدة ${remaining} دقيقة`)
            }
          } catch (err: any) {
            // If the query throws because of "locked"/"دقيقة" message, re-throw
            if (err.message?.includes('مقفل')) throw err
            // Otherwise (e.g. column doesn't exist) — skip the lock check
            console.warn('[auth/staff] lock check skipped:', err.message)
          }

          if (staff.pin !== credentials.password) {
            // Increment login_attempts, lock after 5 failures
            await prisma.$executeRawUnsafe(
              `UPDATE staff SET login_attempts = COALESCE(login_attempts, 0) + 1,
               locked_until = CASE WHEN COALESCE(login_attempts, 0) + 1 >= 5
                 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
               WHERE id = $1`, staff.id)
            return null
          }

          // Success — reset attempts + update last_login
          await prisma.$executeRawUnsafe(
            `UPDATE staff SET login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1`, staff.id)

          // Allow all staff roles (collector, operator, accountant, cashier)
          const cp = staff.collector_permission
          const op = (staff as any).operator_permission
          return {
            id: staff.id,
            name: staff.name,
            phone: staff.phone ?? undefined,
            role: staff.role,
            tenantId: staff.tenant_id,
            tenantName: staff.tenant?.name,
            branchId: staff.branch_id,
            branchName: staff.branch?.name,
            canCollect: staff.can_collect,
            canOperate: staff.can_operate,
            isOwnerActing: staff.is_owner_acting,
            isDualRole: staff.role === 'collector' && staff.can_operate === true,
            canGiveDiscount: cp?.can_give_discount ?? false,
            discountMaxAmount: Number(cp?.discount_max_amount ?? 0),
            canRecordOilChange: op?.can_record_oil_change ?? false,
          }
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.tenantId = (user as any).tenantId
        token.tenantName = (user as any).tenantName
        token.branchId = (user as any).branchId
        token.branchName = (user as any).branchName
        token.plan = (user as any).plan
        token.planRefreshedAt = Date.now()
        token.canCollect = (user as any).canCollect
        token.canOperate = (user as any).canOperate
        token.isOwnerActing = (user as any).isOwnerActing
        token.isDualRole = (user as any).isDualRole
        token.canGiveDiscount = (user as any).canGiveDiscount
        token.discountMaxAmount = (user as any).discountMaxAmount
        token.canRecordOilChange = (user as any).canRecordOilChange
      } else if (token.tenantId) {
        // Refresh plan + tenant name from DB at most once per minute.
        // Without this, the token's `plan` and `tenantName` are frozen at
        // login time — admin upgrades/renames don't propagate until full
        // logout. Single tenant query covers both fields.
        const lastRefresh = (token.planRefreshedAt as number | undefined) ?? 0
        if (Date.now() - lastRefresh > 60_000) {
          try {
            const t = await prisma.tenant.findUnique({
              where: { id: token.tenantId as string },
              select: { plan: true, name: true },
            })
            if (t) {
              token.plan = t.plan
              token.tenantName = t.name
            }
          } catch (err: any) {
            console.warn('[auth/jwt] refresh skipped:', err.message)
          }
          token.planRefreshedAt = Date.now()
        }
      }
      return token
    },
    session({ session, token }) {
      ;(session as any).user.id = token.sub
      ;(session as any).user.role = token.role
      ;(session as any).user.tenantId = token.tenantId
      ;(session as any).user.tenantName = token.tenantName
      ;(session as any).user.branchId = token.branchId
      ;(session as any).user.branchName = token.branchName
      ;(session as any).user.plan = token.plan
      ;(session as any).user.canCollect = token.canCollect
      ;(session as any).user.canOperate = token.canOperate
      ;(session as any).user.isOwnerActing = token.isOwnerActing
      ;(session as any).user.isDualRole = token.isDualRole
      ;(session as any).user.canGiveDiscount = token.canGiveDiscount
      ;(session as any).user.discountMaxAmount = token.discountMaxAmount
      ;(session as any).user.canRecordOilChange = token.canRecordOilChange
      return session
    }
  },
  pages: { signIn: '/login' },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
}
