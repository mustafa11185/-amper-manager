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
          const tenant = await prisma.tenant.findUnique({
            where: { phone: credentials.phone }
          })
          if (!tenant || !tenant.is_active) return null
          const valid = await bcrypt.compare(credentials.password, tenant.password)
          if (!valid) return null
          return {
            id: tenant.id,
            name: tenant.owner_name,
            phone: tenant.phone,
            role: 'owner',
            tenantId: tenant.id,
            plan: tenant.plan,
          }
        } else {
          const staff = await prisma.staff.findFirst({
            where: { phone: credentials.phone, is_active: true },
            include: { branch: true, collector_permission: true }
          })
          if (!staff) return null
          if (staff.pin !== credentials.password) return null
          // Allow all staff roles (collector, operator, accountant, cashier)
          const cp = (staff as any).collector_permission
          return {
            id: staff.id,
            name: staff.name,
            phone: staff.phone ?? undefined,
            role: staff.role,
            tenantId: staff.tenant_id,
            branchId: staff.branch_id,
            branchName: staff.branch?.name,
            canCollect: staff.can_collect,
            canOperate: staff.can_operate,
            isOwnerActing: staff.is_owner_acting,
            isDualRole: staff.role === 'collector' && staff.can_operate === true,
            canGiveDiscount: cp?.can_give_discount ?? false,
            discountMaxAmount: Number(cp?.discount_max_amount ?? 0),
          }
        }
      }
    })
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.tenantId = (user as any).tenantId
        token.branchId = (user as any).branchId
        token.branchName = (user as any).branchName
        token.plan = (user as any).plan
        token.canCollect = (user as any).canCollect
        token.canOperate = (user as any).canOperate
        token.isOwnerActing = (user as any).isOwnerActing
        token.isDualRole = (user as any).isDualRole
        token.canGiveDiscount = (user as any).canGiveDiscount
        token.discountMaxAmount = (user as any).discountMaxAmount
      }
      return token
    },
    session({ session, token }) {
      ;(session as any).user.id = token.sub
      ;(session as any).user.role = token.role
      ;(session as any).user.tenantId = token.tenantId
      ;(session as any).user.branchId = token.branchId
      ;(session as any).user.branchName = token.branchName
      ;(session as any).user.plan = token.plan
      ;(session as any).user.canCollect = token.canCollect
      ;(session as any).user.canOperate = token.canOperate
      ;(session as any).user.isOwnerActing = token.isOwnerActing
      ;(session as any).user.isDualRole = token.isDualRole
      ;(session as any).user.canGiveDiscount = token.canGiveDiscount
      ;(session as any).user.discountMaxAmount = token.discountMaxAmount
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
