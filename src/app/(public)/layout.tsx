// Public marketing layout — wraps the landing site (/, /blog, /store).
//
// Two responsibilities:
//   1. Loads landing.css which defines the dark theme + utility classes
//      scoped under .landing-root so they never leak to the staff app or
//      the customer portal.
//   2. Wraps children in <div className="landing-root"> so tokens like
//      var(--bg-dark) resolve and gradient/animation utilities work.
//
// SEO metadata lives in the per-page metadata exports — the root layout
// already provides the html/body shell and font setup.

import type { Metadata } from 'next'
import './landing.css'

export const metadata: Metadata = {
  title: 'أمبير — نظام إدارة مولدات الكهرباء في العراق',
  description:
    'نظام SaaS متكامل لإدارة مولدات الكهرباء في العراق. تحصيل ذكي، مراقبة IoT، تطبيق جابي أوف لاين، تقارير آنية.',
  keywords: 'مولدات كهرباء عراق، نظام إدارة مولدات، تحصيل فواتير، amper iraq',
  openGraph: {
    title: 'أمبير — نظام إدارة مولدات الكهرباء',
    description: 'أذكى نظام لإدارة مولدات الكهرباء في العراق',
    locale: 'ar_IQ',
  },
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="landing-root">{children}</div>
}
