'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Car,
  DollarSign,
  BookOpen,
  Users,
  LayoutDashboard,
  Settings,
  Bell,
  X,
  LogOut,
} from 'lucide-react'
import { logout } from '@/actions/auth'
import ThemeToggle from './ThemeToggle'
import { ROUTE_PERMISSIONS } from '@/lib/permissions-config'
import { usePermissions } from '@/contexts/PermissionsContext'
import { useDirtyState } from '@/contexts/DirtyStateContext'
import { useCrmRefresh } from '@/hooks/useCrmRefresh'
import { fetchLayoutStats } from '@/lib/layout-stats-client'
import type { AuthUser } from '@/actions/auth'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, permission: ROUTE_PERMISSIONS['/'] },
  { name: 'Автомобілі', href: '/vehicles', icon: Car, permission: ROUTE_PERMISSIONS['/vehicles'] },
  { name: 'Фінанси', href: '/finance', icon: DollarSign, permission: ROUTE_PERMISSIONS['/finance'] },
  { name: 'Довідники', href: '/dictionaries', icon: BookOpen, permission: ROUTE_PERMISSIONS['/dictionaries'] },
  { name: 'Співробітники', href: '/users', icon: Users, permission: ROUTE_PERMISSIONS['/users'] },
]

function NavLinkGuarded({
  href,
  className,
  onClick,
  children,
}: {
  href: string
  className: string
  onClick?: () => void
  children: React.ReactNode
}) {
  const { isDirty, setPendingHref } = useDirtyState()
  const pathname = usePathname()

  const handleClick = (e: React.MouseEvent) => {
    if (isDirty && pathname !== href) {
      e.preventDefault()
      setPendingHref(href)
    }
    onClick?.()
  }

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  )
}

function getUserInitials(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()
}

function navItemClass(active: boolean, mobile: boolean) {
  return `flex items-center gap-3 px-3 rounded-md transition-all duration-300 border ${
    mobile ? 'py-3 min-h-[48px]' : 'py-2.5'
  } ${
    active
      ? 'bg-accent/10 text-accent border-accent/40 shadow-neon'
      : 'text-textSecondary hover:bg-surfaceHover hover:text-textPrimary border-transparent'
  }`
}

export default function Sidebar({
  onClose,
  user,
  initialBusinessName = 'CRM AUTO',
  initialCriticalCount = 0,
  initialUnreadCount = 0,
}: {
  onClose?: () => void
  user: AuthUser | null
  initialBusinessName?: string
  initialCriticalCount?: number
  initialUnreadCount?: number
}) {
  const pathname = usePathname()
  const permissions = usePermissions()
  const [businessName, setBusinessName] = useState(initialBusinessName)
  const [criticalCount, setCriticalCount] = useState(initialCriticalCount)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const isMobileDrawer = !!onClose

  const refreshMeta = useCallback(() => {
    fetchLayoutStats().then(res => {
      if (!res?.success) return
      if (res.businessName) setBusinessName(res.businessName)
      if (typeof res.criticalCount === 'number') setCriticalCount(res.criticalCount)
      if (res.topbar?.success && res.topbar.data) {
        setUnreadCount(res.topbar.data.unreadCount)
      }
    })
  }, [])

  useCrmRefresh(refreshMeta, { scope: 'topbar', intervalMs: 20000 })

  useEffect(() => {
    setBusinessName(initialBusinessName)
    setCriticalCount(initialCriticalCount)
    setUnreadCount(initialUnreadCount)
  }, [initialBusinessName, initialCriticalCount, initialUnreadCount])

  useEffect(() => {
    refreshMeta()
  }, [pathname, refreshMeta])

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname?.startsWith(href))

  const canSettings = permissions.includes(ROUTE_PERMISSIONS['/settings'])
  const canNotifications = permissions.includes(ROUTE_PERMISSIONS['/notifications'])

  return (
    <aside
      className={`w-64 bg-surface border-r border-border flex flex-col shrink-0 ${
        isMobileDrawer ? 'h-dvh max-h-dvh' : 'h-screen'
      }`}
    >
      <div className="min-h-16 pt-[env(safe-area-inset-top,0px)] flex items-center justify-between px-4 md:px-6 border-b border-border shadow-elevated-sm shrink-0">
        <span className="text-lg md:text-xl font-bold tracking-widest text-textPrimary uppercase dark:drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] truncate">
          {businessName}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити меню"
            className="md:hidden flex items-center justify-center min-w-[44px] min-h-[44px] -mr-2 text-textSecondary hover:text-textPrimary active:text-accent"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      <nav
        className={`flex-1 min-h-0 px-3 md:px-4 py-4 space-y-1 overflow-y-auto overscroll-contain ${
          isMobileDrawer ? 'pb-2' : 'py-6'
        }`}
      >
        {navigation.filter((item) => permissions.includes(item.permission)).map(item => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <NavLinkGuarded
              key={item.name}
              href={item.href}
              onClick={onClose}
              className={navItemClass(active, isMobileDrawer)}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium">{item.name}</span>
            </NavLinkGuarded>
          )
        })}

        {isMobileDrawer && canSettings && (
          <>
            <div className="pt-3 pb-1">
              <p className="px-3 text-[10px] uppercase tracking-widest text-textSecondary/60">Система</p>
            </div>
            <NavLinkGuarded
              href="/settings"
              onClick={onClose}
              className={navItemClass(isActive('/settings'), true)}
            >
              <Settings className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium">Налаштування</span>
            </NavLinkGuarded>
          </>
        )}

        {canNotifications && (
          <NavLinkGuarded
            href="/notifications"
            onClick={onClose}
            className={`${navItemClass(isActive('/notifications'), isMobileDrawer)} ${
              isMobileDrawer ? '' : 'hidden md:flex'
            }`}
          >
            <div className="relative shrink-0">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span
                  className={`absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white leading-none ${
                    criticalCount > 0 ? 'bg-red-500' : 'bg-amber-500'
                  }`}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span className="text-sm font-medium">Сповіщення</span>
            {criticalCount > 0 && (
              <span className="ml-auto text-xs font-semibold bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                {criticalCount}
              </span>
            )}
          </NavLinkGuarded>
        )}
      </nav>

      {isMobileDrawer && user ? (
        <div className="shrink-0 border-t border-border bg-surface px-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-1">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center text-xs font-bold text-accent shrink-0">
              {getUserInitials(user.fullName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-textPrimary truncate">{user.fullName}</p>
              <p className="text-xs text-textSecondary truncate">@{user.username}</p>
            </div>
          </div>
          <ThemeToggle />
          <form action={logout}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-3 py-3 min-h-[48px] rounded-md text-textSecondary hover:bg-red-500/10 hover:text-red-400 border border-transparent transition-all"
            >
              <LogOut className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium">Вийти</span>
            </button>
          </form>
        </div>
      ) : (
        <div className="px-4 pb-2 border-t border-border pt-3 space-y-1.5 shrink-0">
          <ThemeToggle />
          {canSettings && (
            <NavLinkGuarded
              href="/settings"
              onClick={onClose}
              className={navItemClass(isActive('/settings'), false)}
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm font-medium">Налаштування</span>
            </NavLinkGuarded>
          )}

          {user && (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-transparent">
              <div className="w-6 h-6 rounded bg-accent/10 border border-accent/30 flex items-center justify-center text-[10px] font-bold text-accent shrink-0">
                {getUserInitials(user.fullName)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-textPrimary truncate">{user.fullName}</p>
                <p className="text-[10px] text-textSecondary truncate">@{user.username}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
