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
            include: { branch: true }
          })
          if (!staff) return null
          if (staff.pin !== credentials.password) return null
          // Block collector/operator — they must use staff-app
          if (staff.role === 'collector' || staff.role === 'operator') return null
          return {
            id: staff.id,
            name: staff.name,
            phone: staff.phone ?? undefined,
            role: staff.role,
            tenantId: staff.tenant_id,
            branchId: staff.branch_id,
            canCollect: staff.can_collect,
            isOwnerActing: staff.is_owner_acting,
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
        token.plan = (user as any).plan
        token.canCollect = (user as any).canCollect
        token.isOwnerActing = (user as any).isOwnerActing
      }
      return token
    },
    session({ session, token }) {
      ;(session as any).user.id = token.sub
      ;(session as any).user.role = token.role
      ;(session as any).user.tenantId = token.tenantId
      ;(session as any).user.branchId = token.branchId
      ;(session as any).user.plan = token.plan
      ;(session as any).user.canCollect = token.canCollect
      ;(session as any).user.isOwnerActing = token.isOwnerActing
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
