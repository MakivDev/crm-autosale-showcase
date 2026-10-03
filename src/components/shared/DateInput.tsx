'use client'

import { useRef } from 'react'
import { CalendarDays } from 'lucide-react'
import { useTheme } from '@/components/layout/ThemeProvider'

export default function DateInput({
  value,
  onChange,
  max,
  min,
  placeholder,
  className = '',
  inputClassName = '',
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  max?: string
  min?: string
  placeholder?: string
  className?: string
  inputClassName?: string
  disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const { theme } = useTheme()

  const openPicker = () => {
    try { ref.current?.showPicker?.() } catch { ref.current?.focus() }
  }

  return (
    <div className={`relative ${className}`}>
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        max={max}
        min={min}
        placeholder={placeholder}
        disabled={disabled}
        style={{ colorScheme: theme }}
        className={`w-full bg-background border border-border rounded-md px-3 py-2.5 pr-10 text-sm text-textPrimary focus:outline-none focus:border-accent transition-colors cursor-pointer disabled:opacity-50 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer ${inputClassName}`}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        tabIndex={-1}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textSecondary hover:text-accent transition-colors pointer-events-none"
      >
        <CalendarDays className="w-4 h-4" />
      </button>
    </div>
  )
}
