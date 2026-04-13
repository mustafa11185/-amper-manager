import type { Metadata } from 'next'
import { Tajawal, Rajdhani, JetBrains_Mono } from 'next/font/google'
import SessionProvider from '@/components/SessionProvider'
import UpdateBanner from '@/components/UpdateBanner'
import { Toaster } from 'react-hot-toast'
import './globals.css'

const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '700', '800'],
  variable: '--font-family-tajawal',
})

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-family-rajdhani',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-family-jetbrains',
})

export const metadata: Metadata = {
  title: 'أمبير — إدارة المولدات',
  description: 'تطبيق إدارة مولدات الكهرباء',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${tajawal.variable} ${rajdhani.variable} ${jetbrains.variable}`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1B4FD8" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="أمبير" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-dvh bg-bg-base font-tajawal">
        <SessionProvider>
          <UpdateBanner />
          {children}
        </SessionProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              fontFamily: 'var(--font-family-tajawal)',
              direction: 'rtl',
            },
          }}
        />
      </body>
    </html>
  )
}
