'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { canAccessRoute, getFirstAllowedRoute } from '@/lib/permissions-config'
import type { AuthUser } from '@/actions/auth'

export default function AuthGuard({
  user,
  permissions,
  children,
}: {
  user: AuthUser | null
  permissions: string[]
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (pathname === '/login') {
      if (user && permissions.length > 0) {
        const first = getFirstAllowedRoute(permissions)
        if (first) router.replace(first)
      }
      return
    }

    if (!user) {
      router.replace('/login')
      return
    }

    if (permissions.length === 0) {
      router.replace('/login?error=no_permissions')
      return
    }

    if (!canAccessRoute(pathname, permissions)) {
      const first = getFirstAllowedRoute(permissions)
      router.replace(first ?? '/login?error=no_permissions')
    }
  }, [pathname, user, permissions, router])

  return <>{children}</>
}
