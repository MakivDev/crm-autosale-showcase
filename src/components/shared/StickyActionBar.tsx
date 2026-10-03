'use client'

import { Check, X } from 'lucide-react'

export default function StickyActionBar({
  onSave,
  onCancel,
  isPending,
  saveLabel = 'Зберегти',
  cancelLabel,
  dirty = true,
}: {
  onSave: () => void
  onCancel?: () => void
  isPending?: boolean
  saveLabel?: string
  cancelLabel?: string
  dirty?: boolean
}) {
  if (!dirty) return null

  return (
    <div className="sticky bottom-4 z-40 flex items-center justify-end gap-2 px-4 py-3 mx-auto max-w-fit bg-surface/90 border border-accent/30 rounded-xl shadow-elevated-lg backdrop-blur-sm">
      <button
        type="button"
        onClick={onSave}
        disabled={isPending}
        className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-accent/10 border border-accent text-accent text-sm font-semibold hover:bg-accent hover:text-accentOn transition-all disabled:opacity-50"
      >
        <Check className="w-3.5 h-3.5" />
        {isPending ? 'Збереження...' : saveLabel}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="flex items-center gap-1 px-3 py-2 rounded-lg border border-border text-textSecondary text-sm hover:text-textPrimary transition-all disabled:opacity-50"
        >
          <X className="w-3.5 h-3.5" />
          {cancelLabel}
        </button>
      )}
    </div>
  )
}
