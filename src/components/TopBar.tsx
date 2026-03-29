'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import AmperLogo from './AmperLogo'

export default function TopBar() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (status !== 'authenticated') return

    const fetchCount = () => {
      fetch('/api/notifications/count')
        .then(r => { if (!r.ok) throw new Error(); return r.json() })
        .then(data => setUnreadCount(data.count || 0))
        .catch(() => {})
    }
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [status])

  // Reset badge immediately when on notifications page
  useEffect(() => {
    if (pathname === '/notifications') {
      setUnreadCount(0)
    }
  }, [pathname])

  if (status !== 'authenticated') return <div className="h-10" />

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <AmperLogo size={28} />
        <p className="text-sm font-bold text-text-primary">
          مرحباً {session?.user?.name?.split(' ')[0] || ''}
        </p>
      </div>
      <Link href="/notifications" className="relative p-2">
        <Bell size={22} className="text-text-secondary" />
        {unreadCount > 0 && (
          <span className="absolute top-1 left-1 min-w-[18px] h-[18px] rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Link>
    </div>
  )
}
