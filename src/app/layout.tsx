import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { cookies } from 'next/headers'
import './globals.css'
import ClientLayoutWrapper from '@/components/layout/ClientLayoutWrapper'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import AppToaster from '@/components/layout/AppToaster'
import { getCurrentUser } from '@/actions/auth'
import { getUserPermissionCodes } from '@/lib/rbac'
import { getTopbarStats, type TopbarStatsData } from '@/actions/dashboard'
import { getSetting } from '@/actions/settings'
import { getUnreadCriticalCount } from '@/actions/notifications'
import { getThemeFromCookie } from '@/lib/theme'

const inter = Inter({ subsets: ['latin', 'cyrillic'] })

export const metadata: Metadata = {
  title: 'CRM AutoSale',
  description: 'CRM для автопродажу',
  manifest: '/manifest.webmanifest',
  applicationName: 'CRM AutoSale',
  appleWebApp: {
    capable: true,
    title: 'CRM',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon-dark-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-dark-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-dark-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icon-dark-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-dark-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon-dark.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f4f6' },
    { media: '(prefers-color-scheme: dark)', color: '#030303' },
  ],
}

export const dynamic = 'force-dynamic'

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null
  let permissions: string[] = []
  let initialTopbarStats: TopbarStatsData | null = null
  let initialBusinessName = 'CRM AUTO'
  let initialCriticalCount = 0

  try {
    user = await getCurrentUser()
    permissions = user ? await getUserPermissionCodes(user.id) : []

    if (user) {
      const [topbarRes, businessName, criticalCount] = await Promise.all([
        getTopbarStats().catch(() => ({ success: false as const, error: 'topbar' })),
        getSetting('business_name', 'CRM AUTO').catch(() => 'CRM AUTO'),
        getUnreadCriticalCount().catch(() => 0),
      ])
      if (topbarRes.success && topbarRes.data) initialTopbarStats = topbarRes.data
      initialBusinessName = businessName
      initialCriticalCount = criticalCount
    }
  } catch (err) {
    console.error('[layout] render data failed:', err)
  }

  const cookieStore = await cookies()
  const initialTheme = getThemeFromCookie(cookieStore.toString())

  return (
    <html lang="uk" className={initialTheme === 'dark' ? 'dark' : undefined} suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider initialTheme={initialTheme}>
          <ClientLayoutWrapper
            user={user}
            permissions={permissions}
            initialTopbarStats={initialTopbarStats}
            initialBusinessName={initialBusinessName}
            initialCriticalCount={initialCriticalCount}
          >
            {children}
          </ClientLayoutWrapper>
          <AppToaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
