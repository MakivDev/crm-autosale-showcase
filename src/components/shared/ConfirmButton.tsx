'use client'

import { useState } from 'react'
import { Trash2, Check, X } from 'lucide-react'

export default function ConfirmButton({
  onConfirm,
  disabled,
  label = 'Видалити',
  confirmLabel = 'Підтвердити?',
  variant = 'danger',
  size = 'sm',
  icon,
  className = '',
}: {
  onConfirm: () => void
  disabled?: boolean
  label?: string
  confirmLabel?: string
  variant?: 'danger' | 'warning' | 'default'
  size?: 'xs' | 'sm' | 'md'
  icon?: React.ReactNode
  className?: string
}) {
  const [confirming, setConfirming] = useState(false)

  const variantCls = {
    danger: 'text-red-400 border-red-500/30 hover:text-red-400 hover:border-red-500/60',
    warning: 'text-amber-400 border-amber-500/30 hover:text-amber-400 hover:border-amber-500/60',
    default: 'text-textSecondary border-border hover:text-textPrimary',
  }[variant]

  const confirmCls = {
    danger: 'bg-red-500/10 border-red-500 text-red-400 hover:bg-red-500 hover:text-white',
    warning: 'bg-amber-500/10 border-amber-500 text-amber-400 hover:bg-amber-500 hover:text-black',
    default: 'bg-accent/10 border-accent text-accent hover:bg-accent hover:text-accentOn',
  }[variant]

  const sizeCls = {
    xs: 'px-2 py-0.5 text-[11px] gap-1',
    sm: 'px-3 py-1 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
  }[size]

  if (confirming) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <span className={`text-xs ${size === 'xs' ? 'text-[11px]' : ''} text-textSecondary whitespace-nowrap`}>{confirmLabel}</span>
        <button
          type="button"
          onClick={() => { onConfirm(); setConfirming(false) }}
          disabled={disabled}
          className={`flex items-center gap-1 border rounded transition-all disabled:opacity-40 ${confirmCls} ${sizeCls}`}
        >
          <Check className={size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="p-1 text-textSecondary hover:text-textPrimary"
        >
          <X className={size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      disabled={disabled}
      className={`flex items-center border rounded transition-all disabled:opacity-40 ${variantCls} ${sizeCls} ${className}`}
    >
      {icon ?? <Trash2 className={size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />}
      {label && <span>{label}</span>}
    </button>
  )
}
