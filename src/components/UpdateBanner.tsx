'use client'

// Polls /api/app-version?app=partner and shows a banner when a new
// build is available. Same-origin fetch — no MANAGER_BASE needed.

import { useEffect, useState, useCallback } from 'react'

const APP_KEY = 'partner'
const POLL_MS = 5 * 60 * 1000
const CURRENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'
const DISMISS_KEY = `update-dismissed-${APP_KEY}`

type VersionPayload = {
  min_version: string
  latest_version: string
  changelog_ar?: string | null
  force?: boolean
}

function parseVer(v: string): number[] {
  return v.split('.').map((p) => parseInt(p, 10) || 0)
}

function isLower(a: number[], b: number[]): boolean {
  for (let i = 0; i < 3; i++) {
    const av = a[i] || 0
    const bv = b[i] || 0
    if (av < bv) return true
    if (av > bv) return false
  }
  return false
}

export default function UpdateBanner() {
  const [state, setState] = useState<{
    mode: 'none' | 'soft' | 'force'
    latest: string
    changelog: string
  }>({ mode: 'none', latest: '', changelog: '' })

  const check = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/app-version?app=${APP_KEY}&current=${encodeURIComponent(CURRENT_VERSION)}`,
        { cache: 'no-store' },
      )
      if (!res.ok) return
      const data = (await res.json()) as VersionPayload
      const cur = parseVer(CURRENT_VERSION)
      const min = parseVer(data.min_version)
      const latest = parseVer(data.latest_version)
      const changelog = data.changelog_ar || ''

      if (isLower(cur, min) || data.force) {
        setState({ mode: 'force', latest: data.latest_version, changelog })
      } else if (isLower(cur, latest)) {
        const dismissed = typeof window !== 'undefined' ? localStorage.getItem(DISMISS_KEY) : null
        if (dismissed !== data.latest_version) {
          setState({ mode: 'soft', latest: data.latest_version, changelog })
        }
      } else {
        setState({ mode: 'none', latest: '', changelog: '' })
      }
    } catch {
      // skip silently
    }
  }, [])

  useEffect(() => {
    check()
    const id = setInterval(check, POLL_MS)
    return () => clearInterval(id)
  }, [check])

  const reload = () => {
    window.location.href = window.location.pathname + '?v=' + Date.now()
  }

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, state.latest)
    } catch {}
    setState({ mode: 'none', latest: '', changelog: '' })
  }

  if (state.mode === 'none') return null

  if (state.mode === 'force') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(6,13,26,0.92)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          direction: 'rtl',
        }}
      >
        <div
          style={{
            background: '#0D1B2A',
            border: '1px solid rgba(45,140,255,0.35)',
            borderRadius: 20,
            padding: 32,
            maxWidth: 440,
            width: '90%',
            textAlign: 'center',
            boxShadow: '0 0 60px rgba(45,140,255,0.3)',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
          <h2 style={{ color: '#E2E8F0', fontWeight: 900, fontSize: 22, marginBottom: 10 }}>
            تحديث إجباري مطلوب
          </h2>
          <p style={{ color: '#94A3B8', fontSize: 14, marginBottom: 6 }}>
            يوجد إصدار جديد ({state.latest}) يجب تثبيته قبل المتابعة.
          </p>
          {state.changelog && (
            <p style={{ color: '#64748B', fontSize: 12, marginBottom: 20 }}>{state.changelog}</p>
          )}
          <button
            onClick={reload}
            style={{
              background: 'linear-gradient(135deg, #1B4FD8 0%, #7C3AED 100%)',
              color: 'white',
              border: 'none',
              padding: '14px 32px',
              borderRadius: 12,
              fontWeight: 900,
              fontSize: 15,
              cursor: 'pointer',
              width: '100%',
              marginTop: 12,
            }}
          >
            🔄 تحديث الآن
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#0D1B2A',
        border: '1px solid rgba(45,140,255,0.35)',
        borderRadius: 12,
        padding: '12px 18px',
        boxShadow: '0 8px 32px rgba(45,140,255,0.25)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        direction: 'rtl',
        maxWidth: '90vw',
      }}
    >
      <span style={{ fontSize: 20 }}>🔔</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#E2E8F0', fontWeight: 800, fontSize: 13 }}>
          تحديث {state.latest} متاح
        </div>
        {state.changelog && (
          <div
            style={{
              color: '#94A3B8',
              fontSize: 11,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 240,
            }}
          >
            {state.changelog}
          </div>
        )}
      </div>
      <button
        onClick={reload}
        style={{
          background: 'linear-gradient(135deg, #1B4FD8, #7C3AED)',
          color: 'white',
          border: 'none',
          padding: '8px 14px',
          borderRadius: 8,
          fontWeight: 800,
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        تحديث
      </button>
      <button
        onClick={dismiss}
        style={{
          background: 'transparent',
          color: '#64748B',
          border: 'none',
          fontSize: 20,
          cursor: 'pointer',
          padding: '0 4px',
          lineHeight: 1,
        }}
        aria-label="إخفاء"
      >
        ×
      </button>
    </div>
  )
}
