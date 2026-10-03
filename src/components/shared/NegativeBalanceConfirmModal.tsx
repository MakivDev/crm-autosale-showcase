'use client'

import { useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import OverlayBackdrop from '@/components/shared/OverlayBackdrop'
import OverlayPortal from '@/components/shared/OverlayPortal'

export type OverdraftConfirmPayload = {
  registerName: string
  balance: number
  amount: number
  currencyCode: string
}

function formatMoney(value: number, currencyCode: string) {
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyCode}`
}

export function usePendingOverdraftConfirm() {
  const [pending, setPending] = useState<OverdraftConfirmPayload | null>(null)
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null)

  const confirmIfNeeded = useCallback(
    (payload: OverdraftConfirmPayload): Promise<boolean> => {
      if (payload.amount <= payload.balance + 0.001) return Promise.resolve(true)
      return new Promise((resolve) => {
        resolveRef.current = resolve
        // flushSync: if called inside startTransition, a deferred setPending would
        // deadlock (transition awaits confirm, confirm awaits pending UI).
        flushSync(() => {
          setPending(payload)
        })
      })
    },
    []
  )

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true)
    resolveRef.current = null
    setPending(null)
  }, [])

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false)
    resolveRef.current = null
    setPending(null)
  }, [])

  return { pending, confirmIfNeeded, handleConfirm, handleCancel }
}

export default function NegativeBalanceConfirmModal({
  open,
  registerName,
  balance,
  amount,
  currencyCode,
  onConfirm,
  onCancel,
}: OverdraftConfirmPayload & {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null

  const balanceAfter = balance - amount

  return (
    <OverlayPortal open>
      <OverlayBackdrop onDismiss={onCancel} className="fixed inset-0 bg-black/70 z-[400]" />
      <div className="fixed inset-0 z-[410] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md bg-surface border border-red-500/30 rounded-xl shadow-elevated overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <h3 className="font-semibold text-textPrimary">Підтвердження списання</h3>
          </div>
          <div className="p-5 space-y-3 text-sm">
            <p className="text-textSecondary">
              Сума операції перевищує баланс каси <strong className="text-textPrimary">{registerName}</strong>.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-background border border-border rounded-lg p-3">
                <p className="text-textSecondary mb-1">Поточний баланс</p>
                <p className="font-mono text-textPrimary">{formatMoney(balance, currencyCode)}</p>
              </div>
              <div className="bg-background border border-border rounded-lg p-3">
                <p className="text-textSecondary mb-1">Сума операції</p>
                <p className="font-mono text-textPrimary">{formatMoney(amount, currencyCode)}</p>
              </div>
            </div>
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
              <p className="text-textSecondary text-xs mb-1">Баланс після операції</p>
              <p className={`font-mono text-base ${balanceAfter < -0.001 ? 'text-red-400' : 'text-textPrimary'}`}>
                {formatMoney(balanceAfter, currencyCode)}
              </p>
            </div>
          </div>
          <div className="px-5 py-4 border-t border-border flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 rounded-md text-sm border border-border text-textSecondary hover:text-textPrimary transition-colors"
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 px-4 py-2 rounded-md text-sm font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
            >
              Підтвердити списання
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  )
}
