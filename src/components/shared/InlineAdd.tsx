'use client'

import { useState } from 'react'
import { Plus, X, Check } from 'lucide-react'

export default function InlineAdd({
  placeholder,
  draftValue,
  onDraftChange,
  onCommit,
}: {
  placeholder: string
  draftValue?: string
  onDraftChange: (name: string) => void
  onCommit?: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState('')

  const openField = () => {
    setVal(draftValue ?? '')
    setOpen(true)
    if (draftValue?.trim()) onDraftChange(draftValue.trim())
  }

  const cancel = () => {
    setVal('')
    onDraftChange('')
    setOpen(false)
  }

  const commit = () => {
    const trimmed = val.trim()
    if (!trimmed) {
      cancel()
      return
    }
    if (onCommit) {
      onCommit(trimmed)
    } else {
      onDraftChange(trimmed)
    }
    setOpen(false)
  }

  return (
    <div className="mt-1">
      {!open ? (
        <button
          type="button"
          onClick={openField}
          className="inline-flex items-center gap-1 text-[11px] text-textSecondary/60 hover:text-accent transition-colors"
        >
          <Plus className="w-2.5 h-2.5" /> Немає в списку? Додати
        </button>
      ) : (
        <div className="flex items-center gap-1 p-1.5 bg-background border border-accent/30 rounded">
          <input
            autoFocus
            value={val}
            onChange={(e) => {
              const text = e.target.value
              setVal(text)
              onDraftChange(text.trim())
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancel()
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
              }
            }}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-xs text-textPrimary focus:outline-none placeholder-textSecondary/30"
          />
          <button
            type="button"
            onClick={commit}
            title="Підтвердити"
            className="flex items-center justify-center w-6 h-6 rounded bg-accent/15 text-accent hover:bg-accent/30 transition-colors shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={cancel}
            title="Скасувати"
            className="flex items-center justify-center w-6 h-6 rounded text-textSecondary/50 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
