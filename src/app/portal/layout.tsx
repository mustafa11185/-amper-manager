// Portal layout — isolates the customer portal from the staff app:
//   - Loads portal-specific CSS tokens (matches former subscriber-app theme)
//   - Wraps content in a phone-width column (max-w 390px) so the portal
//     looks the same on tablet/desktop as it did on mobile.
//
// The root layout still wraps this (SessionProvider, fonts, manifest) — those
// are harmless for portal pages since the SessionProvider just provides empty
// context when no staff session exists.

import './portal.css'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-base)',
        minHeight: '100dvh',
        color: 'var(--text-primary)',
      }}
    >
      <div className="max-w-[390px] w-full mx-auto min-h-screen flex flex-col">
        {children}
      </div>
    </div>
  )
}
