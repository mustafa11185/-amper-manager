'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'

type NotificationItem = {
  id: string
  type: string
  title: string | null
  body: string
  is_read: boolean
  created_at: string
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `منذ ${days} ${days === 1 ? 'يوم' : 'أيام'}`
  if (hours > 0) return `منذ ${hours} ${hours === 1 ? 'ساعة' : 'ساعات'}`
  if (minutes > 0) return `منذ ${minutes} ${minutes === 1 ? 'دقيقة' : 'دقائق'}`
  return 'الآن'
}

function typeIcon(type: string) {
  if (type === 'payment') return '💰'
  if (type === 'delivery') return '📦'
  if (type === 'discount_approved') return '✅'
  if (type === 'discount_rejected') return '❌'
  if (type === 'collector_call') return '📞'
  if (type === 'alert') return '⚠️'
  return '🔔'
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch notifications
    fetch('/api/notifications')
      .then(r => r.json())
      .then(data => {
        if (data.notifications) {
          setNotifications(data.notifications)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))

    // Mark all as read immediately when page opens
    fetch('/api/notifications/read-all', { method: 'PUT' }).catch(() => {})
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Bell size={20} className="text-blue-primary" />
        <h1 className="text-lg font-bold text-text-primary">الإشعارات</h1>
      </div>

      {/* Notifications list */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <BellOff size={40} className="mb-3 opacity-40" />
          <p className="text-sm">لا توجد إشعارات</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(notification => (
            <div
              key={notification.id}
              className="bg-bg-surface rounded-2xl p-4 transition-all"
              style={{ boxShadow: 'var(--shadow-sm)' }}
            >
              <div className="flex items-start gap-2.5">
                <span className="text-base mt-0.5">{typeIcon(notification.type)}</span>
                <div className="flex-1 min-w-0">
                  {notification.title && (
                    <p className="text-sm font-bold text-text-primary mb-1">
                      {notification.title}
                    </p>
                  )}
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {notification.body}
                  </p>
                  <p className="text-[10px] text-text-muted mt-1.5 font-num">
                    {timeAgo(notification.created_at)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
