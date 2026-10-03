'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Menu, LogOut, Bell, AlertTriangle, Car, CalendarDays } from 'lucide-react'
import { logout } from '@/actions/auth'
import type { AuthUser } from '@/actions/auth'
import type { TopbarStatsData } from '@/actions/dashboard'
import { useCrmRefresh } from '@/hooks/useCrmRefresh'
import { useOverlayTap } from '@/hooks/useOverlayTap'
import {
  resolveRegisterContainerClass,
  resolveRegisterContainerStyle,
  resolveRegisterDotClass,
  resolveRegisterDotStyle,
} from '@/lib/register-tones'
import { armOverlayOpen } from '@/lib/overlay-guard'
import { fetchLayoutStats } from '@/lib/layout-stats-client'
import { useHasAnyPermission, useHasPermission } from '@/contexts/PermissionsContext'

function getUserInitials(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()
}

function formatTopbarDate(date: Date) {
  return date.toLocaleDateString('uk-UA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function Topbar({
  onMenuClick,
  user,
  initialStats,
}: {
  onMenuClick?: () => void
  user: AuthUser | null
  initialStats: TopbarStatsData | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const canViewFinance = useHasPermission('finance.view')
  const canViewStock = useHasPermission('finance.stock_capital_view')
  const canViewRateBanner = useHasAnyPermission(['finance.view', 'settings.view'])
  const [todayLabel, setTodayLabel] = useState(() => formatTopbarDate(new Date()))
  const [stats, setStats] = useState(() => ({
    registers: initialStats?.registers ?? [],
    customsDebt: initialStats?.customsDebt ?? 0,
    stockCapitalUsd: initialStats?.stockCapitalUsd ?? null,
    activeVehiclesCount: initialStats?.activeVehiclesCount ?? 0,
  }))
  const [criticalCount, setCriticalCount] = useState(initialStats?.criticalCount ?? 0)
  const [unreadCount, setUnreadCount] = useState(initialStats?.unreadCount ?? 0)
  const [rateCompliance, setRateCompliance] = useState(
    initialStats?.rateCompliance ?? { status: 'ok' as const, message: null }
  )

  const applyTopbarData = useCallback((data: TopbarStatsData) => {
    setStats({
      registers: data.registers,
      customsDebt: data.customsDebt,
      stockCapitalUsd: data.stockCapitalUsd ?? null,
      activeVehiclesCount: data.activeVehiclesCount,
    })
    setCriticalCount(data.criticalCount)
    setUnreadCount(data.unreadCount)
    setRateCompliance(data.rateCompliance)
  }, [])

  const fetchStats = useCallback(() => {
    fetchLayoutStats().then(res => {
      if (res?.success && res.topbar?.success && res.topbar.data) {
        applyTopbarData(res.topbar.data)
      }
    })
  }, [applyTopbarData])

  useCrmRefresh(fetchStats, { scope: 'topbar', intervalMs: 20000 })

  useEffect(() => {
    if (initialStats) applyTopbarData(initialStats)
  }, [initialStats, applyTopbarData])

  useEffect(() => {
    fetchStats()
  }, [pathname, fetchStats])

  useEffect(() => {
    setTodayLabel(formatTopbarDate(new Date()))
    const id = setInterval(() => setTodayLabel(formatTopbarDate(new Date())), 60_000)
    return () => clearInterval(id)
  }, [])

  const initials = user ? getUserInitials(user.fullName) : 'U'
  const handleMenuTap = useOverlayTap(() => onMenuClick?.())

  const financeStatsStrip = (
    <>
      {stats.registers.map(reg => (
        <button
          key={reg.id}
          type="button"
          onClick={() => router.push(`/finance?register=${reg.id}`)}
          title={`${reg.name} — перейти до фінансів`}
          className={`flex flex-col shrink-0 rounded-md px-2.5 py-1 text-left cursor-pointer transition-opacity hover:opacity-90 ${resolveRegisterContainerClass(reg.color ?? null, reg.currencyCode)}`}
          style={resolveRegisterContainerStyle(reg.color ?? null)}
        >
          <span className="text-[9px] md:text-[10px] text-textSecondary uppercase tracking-widest whitespace-nowrap flex items-center gap-1">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${resolveRegisterDotClass(reg.color ?? null, reg.currencyCode)}`}
              style={resolveRegisterDotStyle(reg.color ?? null)}
            />
            {reg.name}
          </span>
          <span className={`text-xs md:text-sm font-mono whitespace-nowrap dark:drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] ${reg.balance < 0 ? 'text-red-400' : 'text-textPrimary'}`}>
            {reg.balance.toLocaleString('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: reg.balance % 1 === 0 ? 0 : 2,
            })}{' '}
            <span className="text-[9px] md:text-[10px] text-textSecondary">{reg.currencyCode}</span>
          </span>
        </button>
      ))}
      {stats.registers.length > 0 && <div className="w-px h-4 md:h-6 bg-border shrink-0" />}
      {canViewStock && stats.stockCapitalUsd != null && (
        <button
          type="button"
          onClick={() => router.push('/finance')}
          title="Вложено в авто — перейти до фінансів"
          className="flex flex-col shrink-0 rounded-md px-2.5 py-1 text-left cursor-pointer transition-opacity hover:opacity-90 border border-cyan-300/70 bg-gradient-to-br from-cyan-50 via-white to-teal-50 dark:border-accent/35 dark:bg-none dark:bg-accent/10"
        >
          <span className="text-[9px] md:text-[10px] uppercase tracking-widest whitespace-nowrap text-cyan-700/80 dark:text-accent/80">
            Вложено в авто
          </span>
          <span className="text-xs md:text-sm font-mono whitespace-nowrap text-cyan-700 dark:text-accent">
            ${Math.round(stats.stockCapitalUsd).toLocaleString()}
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={() => router.push('/finance')}
        title="Борг перед митною компанією"
        className={`flex flex-col shrink-0 rounded-md px-2.5 py-1 text-left cursor-pointer transition-opacity hover:opacity-90 border ${
          stats.customsDebt > 0
            ? 'border-amber-400/70 bg-gradient-to-br from-amber-50 via-amber-50/80 to-yellow-50 dark:border-amber-500/50 dark:bg-none dark:bg-amber-500/15'
            : 'border-border bg-surfaceHover/40 dark:bg-surfaceHover/20'
        }`}
      >
        <span className={`text-[9px] md:text-[10px] uppercase tracking-widest whitespace-nowrap ${
          stats.customsDebt > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-textSecondary'
        }`}>
          Мит. борг
        </span>
        <span className={`text-xs md:text-sm font-mono font-semibold whitespace-nowrap ${
          stats.customsDebt > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-textSecondary'
        }`}>
          ${Math.round(stats.customsDebt).toLocaleString()}
        </span>
      </button>
    </>
  )

  const generalStatsStrip = (
    <>
      <div className="flex items-center gap-2 shrink-0 min-w-0">
        <CalendarDays className="w-4 h-4 text-accent shrink-0" />
        <span className="text-xs md:text-sm text-textPrimary capitalize truncate">{todayLabel}</span>
      </div>
      <div className="w-px h-4 md:h-6 bg-border shrink-0" />
      <div
        className="flex items-center gap-2 shrink-0 cursor-pointer"
        onClick={() => router.push('/vehicles')}
        title="Автомобілі в роботі"
      >
        <Car className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" />
        <div className="flex flex-col">
          <span className="text-[9px] md:text-[10px] text-textSecondary uppercase tracking-widest whitespace-nowrap">
            Авто в роботі
          </span>
          <span className="text-xs md:text-sm font-mono font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
            {stats.activeVehiclesCount}
          </span>
        </div>
      </div>
    </>
  )

  const centerStrip = canViewFinance ? financeStatsStrip : generalStatsStrip

  return (
    <>
    <header className="sticky top-0 z-10 shrink-0 bg-surface border-b border-border shadow-elevated-sm">
      <div className="pt-[env(safe-area-inset-top,0px)]">
        <div className="h-16 flex items-center gap-2 px-3 md:px-6 relative">
      {onMenuClick && (
        <button
          type="button"
          onPointerUp={handleMenuTap}
          onClick={(e) => {
            e.stopPropagation()
            armOverlayOpen()
            onMenuClick()
          }}
          aria-label="Відкрити меню"
          aria-expanded={false}
          className="md:hidden shrink-0 relative z-10 flex items-center justify-center min-w-[44px] min-h-[44px] -ml-1 text-textSecondary hover:text-textPrimary active:text-accent"
        >
          <Menu className="w-6 h-6 pointer-events-none" />
        </button>
      )}

      <div className="md:hidden flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-3 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {centerStrip}
        </div>
      </div>

      <div className="hidden md:flex items-center gap-4 xl:gap-8 min-w-0 flex-1">
        {centerStrip}
      </div>

      <div className="hidden md:flex items-center gap-2 ml-4 shrink-0">
        <button
          onClick={() => router.push('/notifications')}
          title="Сповіщення"
          className="relative w-8 h-8 rounded border border-border flex items-center justify-center text-textSecondary hover:text-textPrimary hover:border-border/60 transition-all duration-200"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white leading-none ${criticalCount > 0 ? 'bg-red-500' : 'bg-amber-500'}`}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <div
          className="w-8 h-8 rounded border border-accent/40 bg-accent/10 shadow-neon flex items-center justify-center text-xs font-bold text-accent select-none"
          title={user?.fullName ?? 'Профіль'}
        >
          {initials}
        </div>

        <form action={logout}>
          <button
            type="submit"
            title="Вийти"
            className="w-8 h-8 rounded border border-border flex items-center justify-center text-textSecondary hover:text-red-400 hover:border-red-400/40 transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </form>
      </div>

        </div>
      </div>
    </header>

    {canViewRateBanner && rateCompliance.status !== 'ok' && rateCompliance.message && (
      <div
        className={`sticky top-[calc(4rem+env(safe-area-inset-top,0px))] z-30 px-4 py-2 text-sm flex flex-wrap items-center gap-2 border-b ${
          rateCompliance.status === 'blocked'
            ? 'bg-red-950/80 border-red-500/40 text-red-200'
            : 'bg-amber-950/60 border-amber-500/30 text-amber-200'
        }`}
      >
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="flex-1">{rateCompliance.message}</span>
        <button
          type="button"
          onClick={() => router.push('/settings')}
          className="text-xs uppercase tracking-wider underline underline-offset-2 hover:opacity-80 shrink-0"
        >
          Налаштування
        </button>
      </div>
    )}
    </>
  )
}
