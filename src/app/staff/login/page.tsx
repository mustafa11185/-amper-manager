import { Suspense } from 'react'
import LoginContent from './LoginContent'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh bg-bg-base flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-3 border-blue-primary border-t-transparent rounded-full" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
