'use client'

import { useState, useTransition, useCallback } from 'react'
import Link from 'next/link'
import { AlertTriangle, Info, X, RotateCcw, Trash2, BellOff, CheckCheck } from 'lucide-react'
import {
  dismissNotification,
  restoreNotification,
  deleteNotification,
  dismissAllNotifications,
  getNotifications,
  clearNewVehicleDraftNotifications,
} from '@/actions/notifications'
import { useCrmRefresh } from '@/hooks/useCrmRefresh'
import { notifyCrmRefresh } from '@/lib/crm-refresh'

type Notification = {
  id: number
  type: string
  title: string
  message: string
  entityType: string | null
  entityId: number | null
  createdAt: string
}

type Props = {
  active: Notification[]
  dismissed: Notification[]
}

function entityHref(type: string | null, id: number | null): string | null {
  if (!type) return null
  if (type.toLowerCase() === 'vehicle_draft') return '/vehicles?restoreDraft=1'
  if (!id) return null
  switch (type.toLowerCase()) {
    case 'vehicle':
      return `/vehicles/${id}`
    case 'cashregister':
      return '/settings'
    case 'transaction':
      return '/finance'
    default:
      return null
  }
}

function entityLabel(type: string | null): string {
  if (!type) return ''
  switch (type.toLowerCase()) {
    case 'vehicle_draft':
      return 'Продовжити додавання'
    case 'vehicle':
      return 'Переглянути авто'
    case 'cashregister':
      return 'Перейти до кас'
    case 'transaction':
      return 'Переглянути транзакцію'
    default:
      return 'Деталі'
  }
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'щойно'
  if (diff < 3600) return `${Math.floor(diff / 60)} хв тому`
  if (diff < 86400) return `${Math.floor(diff / 3600)} год тому`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} д тому`
  return new Date(iso).toLocaleDateString('uk-UA')
}

function NotificationCard({
  n,
  isDismissed,
  onDismiss,
  onRestore,
  onDelete,
  onCancelVehicleDraft,
  isPending,
}: {
  n: Notification
  isDismissed: boolean
  onDismiss: (id: number) => void
  onRestore: (id: number) => void
  onDelete: (id: number) => void
  onCancelVehicleDraft?: (id: number) => void
  isPending: boolean
}) {
  const isCritical = n.type === 'CRITICAL'
  const href = entityHref(n.entityType, n.entityId)
  const isVehicleDraft =
    n.entityType?.toLowerCase() === 'vehicle_draft' ||
    n.title === 'Незбережена чернетка нового авто'

  return (
    <div
      className={`relative rounded-lg border p-4 flex gap-3 transition-opacity ${
        isPending ? 'opacity-50 pointer-events-none' : ''
      } ${
        isCritical
          ? 'bg-red-500/5 border-red-500/30 border-l-4 border-l-red-500'
          : 'bg-yellow-500/5 border-yellow-500/20 border-l-4 border-l-yellow-500'
      }`}
    >
      <div className="shrink-0 mt-0.5">
        {isCritical ? (
          <AlertTriangle size={18} className="text-red-400" />
        ) : (
          <Info size={18} className="text-yellow-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                isCritical
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}
            >
              {isCritical ? 'Критична' : 'Попередження'}
            </span>
            <span className="text-xs text-textSecondary">{timeAgo(n.createdAt)}</span>
          </div>
        </div>

        <p
          className={`text-sm font-semibold mb-1 ${
            isCritical ? 'text-red-300' : 'text-yellow-300'
          }`}
        >
          {n.title}
        </p>
        <p className="text-sm text-textSecondary">{n.message}</p>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {isVehicleDraft && !isDismissed && (
            <>
              <Link
                href="/vehicles?restoreDraft=1"
                className="flex items-center gap-1.5 text-xs text-accent border border-accent/30 hover:border-accent/60 rounded px-2.5 py-1 transition-colors"
              >
                {entityLabel(n.entityType)}
              </Link>
              <button
                type="button"
                onClick={() => onCancelVehicleDraft?.(n.id)}
                className="flex items-center gap-1.5 text-xs text-red-400/80 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 rounded px-2.5 py-1 transition-colors"
              >
                <Trash2 size={12} />
                Скасувати чернетку
              </button>
            </>
          )}
          {!isVehicleDraft && href && (
            <Link
              href={href}
              className={`inline-block text-xs underline underline-offset-2 hover:no-underline transition-colors ${
                isCritical ? 'text-red-400/70 hover:text-red-400' : 'text-yellow-400/70 hover:text-yellow-400'
              }`}
            >
              {entityLabel(n.entityType)}
            </Link>
          )}
          {!isDismissed && (
            <button
              onClick={() => onDismiss(n.id)}
              className="flex items-center gap-1.5 text-xs text-textSecondary hover:text-textPrimary border border-border hover:border-border/60 rounded px-2.5 py-1 transition-colors"
            >
              <BellOff size={12} />
              Відхилити
            </button>
          )}
          {isDismissed && (
            <>
              <button
                onClick={() => onRestore(n.id)}
                className="flex items-center gap-1.5 text-xs text-textSecondary hover:text-textPrimary border border-border hover:border-border/60 rounded px-2.5 py-1 transition-colors"
              >
                <RotateCcw size={12} />
                Відновити
              </button>
              <button
                onClick={() => onDelete(n.id)}
                className="flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 rounded px-2.5 py-1 transition-colors"
              >
                <Trash2 size={12} />
                Видалити
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function NotificationsClient({ active: initialActive, dismissed: initialDismissed }: Props) {
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'active' | 'dismissed'>('active')
  const [active, setActive] = useState(initialActive)
  const [dismissed, setDismissed] = useState(initialDismissed)

  const refetch = useCallback(() => {
    getNotifications().then((data) => {
      setActive(data.active)
      setDismissed(data.dismissed)
    })
  }, [])

  useCrmRefresh(refetch, { scope: 'notifications', intervalMs: 20000 })

  const criticalCount = active.filter(n => n.type === 'CRITICAL').length
  const warningCount = active.filter(n => n.type === 'WARNING').length

  const handleDismiss = (id: number) => {
    setPendingId(id)
    startTransition(async () => {
      await dismissNotification(id)
      setPendingId(null)
      refetch()
      notifyCrmRefresh('topbar')
    })
  }

  const handleRestore = (id: number) => {
    setPendingId(id)
    startTransition(async () => {
      await restoreNotification(id)
      setPendingId(null)
      refetch()
      notifyCrmRefresh('topbar')
    })
  }

  const handleDelete = (id: number) => {
    setPendingId(id)
    startTransition(async () => {
      await deleteNotification(id)
      setPendingId(null)
      refetch()
      notifyCrmRefresh('topbar')
    })
  }

  const handleCancelVehicleDraft = (_id: number) => {
    localStorage.removeItem('draft_new_vehicle')
    setPendingId(_id)
    startTransition(async () => {
      await clearNewVehicleDraftNotifications()
      setPendingId(null)
      refetch()
      notifyCrmRefresh('notifications')
      notifyCrmRefresh('topbar')
    })
  }

  const handleDismissAll = () => {
    startTransition(async () => {
      await dismissAllNotifications()
      refetch()
      notifyCrmRefresh('topbar')
    })
  }

  const current = activeTab === 'active' ? active : dismissed

  const criticalNotifications = current.filter(n => n.type === 'CRITICAL')
  const warningNotifications = current.filter(n => n.type === 'WARNING')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-textPrimary">
            Сповіщення
          </h1>
          {criticalCount > 0 && (
            <p className="text-sm text-red-400 mt-0.5">
              {criticalCount} критичн{criticalCount === 1 ? 'е' : 'их'} потребує уваги
            </p>
          )}
        </div>
        {activeTab === 'active' && active.length > 0 && (
          <button
            onClick={handleDismissAll}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-md text-sm text-textSecondary hover:text-textPrimary hover:border-border/60 transition-colors disabled:opacity-50"
          >
            <CheckCheck size={15} />
            Відхилити всі
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 -mb-px ${
            activeTab === 'active'
              ? 'border-accent text-accent'
              : 'border-transparent text-textSecondary hover:text-textPrimary'
          }`}
        >
          Активні
          {active.length > 0 && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                criticalCount > 0
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}
            >
              {active.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('dismissed')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 -mb-px ${
            activeTab === 'dismissed'
              ? 'border-accent text-accent'
              : 'border-transparent text-textSecondary hover:text-textPrimary'
          }`}
        >
          Відхилені
          {dismissed.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold bg-border text-textSecondary">
              {dismissed.length}
            </span>
          )}
        </button>
      </div>

      {current.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-textSecondary">
          <X size={40} className="mb-3 opacity-20" />
          <p className="text-sm">
            {activeTab === 'active'
              ? 'Активних сповіщень немає'
              : 'Відхилених сповіщень немає'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {criticalNotifications.length > 0 && (
            <div className="space-y-3">
              {activeTab === 'active' && (
                <h2 className="text-xs font-semibold uppercase tracking-wider text-red-400 flex items-center gap-2">
                  <AlertTriangle size={13} />
                  Критичні ({criticalCount})
                </h2>
              )}
              {criticalNotifications.map(n => (
                <NotificationCard
                  key={n.id}
                  n={n}
                  isDismissed={activeTab === 'dismissed'}
                  onDismiss={handleDismiss}
                  onRestore={handleRestore}
                  onDelete={handleDelete}
                  onCancelVehicleDraft={handleCancelVehicleDraft}
                  isPending={isPending && pendingId === n.id}
                />
              ))}
            </div>
          )}

          {warningNotifications.length > 0 && (
            <div className="space-y-3">
              {activeTab === 'active' && (
                <h2 className="text-xs font-semibold uppercase tracking-wider text-yellow-400 flex items-center gap-2">
                  <Info size={13} />
                  Попередження ({warningCount})
                </h2>
              )}
              {warningNotifications.map(n => (
                <NotificationCard
                  key={n.id}
                  n={n}
                  isDismissed={activeTab === 'dismissed'}
                  onDismiss={handleDismiss}
                  onRestore={handleRestore}
                  onDelete={handleDelete}
                  onCancelVehicleDraft={handleCancelVehicleDraft}
                  isPending={isPending && pendingId === n.id}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
