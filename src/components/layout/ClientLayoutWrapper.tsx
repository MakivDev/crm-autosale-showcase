'use client'

import { useState, useEffect, useTransition, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import AuthGuard from './AuthGuard'
import OverlayBackdrop from '@/components/shared/OverlayBackdrop'
import { armOverlayOpen } from '@/lib/overlay-guard'
import { DirtyStateProvider, useDirtyState } from '@/contexts/DirtyStateContext'
import { PermissionsProvider } from '@/contexts/PermissionsContext'
import { createNotification } from '@/actions/notifications'
import { notifyCrmRefresh } from '@/lib/crm-refresh'
import type { AuthUser } from '@/actions/auth'
import type { TopbarStatsData } from '@/actions/dashboard'

function DirtyNavigationModal() {
  const { isDirty, label, pendingHref, setPendingHref, setDirty, getOpts } = useDirtyState()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (!isDirty || !pendingHref) return null

  const handleSave = () => {
    const opts = getOpts()
    opts.onSave?.()
  }

  const handleLater = () => {
    startTransition(async () => {
      const opts = getOpts()
      const changedFields = opts.getChangedFields?.() ?? []
      if (opts.draftKey && opts.getDraftData) {
        try {
          localStorage.setItem(
            opts.draftKey,
            JSON.stringify({
              data: opts.getDraftData(),
              savedAt: new Date().toISOString(),
              changedFields,
            })
          )
        } catch {}
      }
      const entityId = opts.draftKey?.startsWith('draft_vehicle_')
        ? Number(opts.draftKey.replace('draft_vehicle_', ''))
        : undefined
      const fieldsText = changedFields.length > 0 ? ` Змінено: ${changedFields.join(', ')}.` : ''
        await createNotification({
        type: 'WARNING',
        title: 'Незбережена чернетка',
        message: `${label || 'Форма редагування'}.${fieldsText} Натисніть щоб повернутись.`,
        entityType: entityId ? 'vehicle' : undefined,
        entityId: entityId && !isNaN(entityId) ? entityId : undefined,
      })
      notifyCrmRefresh('topbar')
      const href = pendingHref
      setDirty(false)
      router.push(href)
    })
  }

  const handleStay = () => {
    setPendingHref(null)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-sm shadow-elevated">
        <div className="flex items-start gap-3 p-5 border-b border-border">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="font-semibold text-textPrimary">Незбережені зміни</h3>
            {label && <p className="text-sm text-textSecondary mt-0.5">{label}</p>}
            {(() => {
              const fields = getOpts().getChangedFields?.() ?? []
              return fields.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {fields.map(f => (
                    <span key={f} className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {f}
                    </span>
                  ))}
                </div>
              ) : null
            })()}
          </div>
        </div>
        <div className="p-4 space-y-2">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="w-full py-2 rounded-md text-sm font-semibold bg-accent/10 border border-accent text-accent hover:bg-accent hover:text-accentOn transition-all disabled:opacity-50"
          >
            Зберегти та перейти
          </button>
          <button
            onClick={handleLater}
            disabled={isPending}
            className="w-full py-2 rounded-md text-sm border border-border text-textSecondary hover:text-textPrimary hover:border-accent/30 transition-all disabled:opacity-50"
          >
            {isPending ? 'Збереження...' : 'Пізніше (зберегти чернетку)'}
          </button>
          <button
            onClick={handleStay}
            disabled={isPending}
            className="w-full py-2 rounded-md text-sm text-textSecondary/60 hover:text-textSecondary transition-all disabled:opacity-50"
          >
            Залишитись
          </button>
        </div>
      </div>
    </div>
  )
}

function LayoutInner({
  children,
  user,
  permissions,
  initialTopbarStats,
  initialBusinessName,
  initialCriticalCount,
}: {
  children: React.ReactNode
  user: AuthUser | null
  permissions: string[]
  initialTopbarStats: TopbarStatsData | null
  initialBusinessName: string
  initialCriticalCount: number
}) {
  const pathname = usePathname()
  const [isSidebarOpen, setSidebarOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const prevPathnameRef = useRef(pathname)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target) return
      if (target.closest('[data-overlay-backdrop]')) return
      if (
        target.closest(
          'button, [role="button"], a[href], input[type="submit"], input[type="button"], label[for]'
        )
      ) {
        armOverlayOpen()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [])

  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      setSidebarOpen(false)
      prevPathnameRef.current = pathname
    }
  }, [pathname])

  const openSidebar = useCallback(() => {
    armOverlayOpen()
    setSidebarOpen(true)
  }, [])

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false)
  }, [])

  const sidebarProps = {
    user,
    onClose: closeSidebar,
    initialBusinessName,
    initialCriticalCount,
    initialUnreadCount: initialTopbarStats?.unreadCount ?? 0,
  }

  if (pathname === '/login') {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden md:block fixed inset-y-0 left-0 w-64 z-40">
        <Sidebar {...sidebarProps} />
      </div>

      {isMounted &&
        isSidebarOpen &&
        createPortal(
          <>
            <OverlayBackdrop
              onDismiss={closeSidebar}
              className="fixed inset-0 bg-black/50 z-[300] md:hidden"
            />
            <div className="fixed inset-y-0 left-0 w-[min(100vw-3rem,17rem)] max-w-[85vw] z-[310] md:hidden shadow-elevated">
              <Sidebar {...sidebarProps} />
            </div>
          </>,
          document.body
        )}

      <div className="flex-1 flex flex-col min-w-0 md:ml-64">
        <Topbar
          user={user}
          onMenuClick={openSidebar}
          initialStats={initialTopbarStats}
        />
        <main className="flex-1 p-4 md:p-6 min-w-0">{children}</main>
      </div>

      <DirtyNavigationModal />
    </div>
  )
}

export default function ClientLayoutWrapper({
  children,
  user,
  permissions,
  initialTopbarStats,
  initialBusinessName,
  initialCriticalCount,
}: {
  children: React.ReactNode
  user: AuthUser | null
  permissions: string[]
  initialTopbarStats: TopbarStatsData | null
  initialBusinessName: string
  initialCriticalCount: number
}) {
  return (
    <DirtyStateProvider>
      <PermissionsProvider permissions={permissions}>
        <AuthGuard user={user} permissions={permissions}>
          <LayoutInner
            user={user}
            permissions={permissions}
            initialTopbarStats={initialTopbarStats}
            initialBusinessName={initialBusinessName}
            initialCriticalCount={initialCriticalCount}
          >
            {children}
          </LayoutInner>
        </AuthGuard>
      </PermissionsProvider>
    </DirtyStateProvider>
  )
}
