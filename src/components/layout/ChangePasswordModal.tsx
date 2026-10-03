'use client'

import { useActionState } from 'react'
import { X, KeyRound } from 'lucide-react'
import { changePassword } from '@/actions/auth'
import OverlayBackdrop from '@/components/shared/OverlayBackdrop'
import OverlayPortal from '@/components/shared/OverlayPortal'

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(changePassword, null)

  return (
    <OverlayPortal open>
      <OverlayBackdrop onDismiss={onClose} className="fixed inset-0 bg-black/70 z-[300]" />
      <div className="fixed inset-0 z-[310] flex items-center justify-center p-4 pointer-events-none">
        <div className="relative pointer-events-auto bg-surface border border-border rounded-xl w-full max-w-sm shadow-elevated">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-textPrimary flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-accent" /> Зміна пароля
            </h3>
            <button type="button" onPointerUp={onClose} className="text-textSecondary hover:text-textPrimary">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form action={formAction} className="p-5 space-y-3">
            {state?.error && <p className="text-xs text-red-400">{state.error}</p>}
            <input
              type="password"
              name="currentPassword"
              required
              placeholder="Поточний пароль"
              className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-textPrimary focus:outline-none focus:border-accent"
            />
            <input
              type="password"
              name="newPassword"
              required
              minLength={8}
              placeholder="Новий пароль (мін. 8)"
              className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-textPrimary focus:outline-none focus:border-accent"
            />
            <input
              type="password"
              name="confirmPassword"
              required
              minLength={8}
              placeholder="Підтвердження пароля"
              className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-textPrimary focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-accent text-background py-2.5 rounded-md text-sm font-semibold hover:bg-accent/90 disabled:opacity-50"
            >
              {isPending ? 'Збереження...' : 'Змінити пароль'}
            </button>
          </form>
        </div>
      </div>
    </OverlayPortal>
  )
}
