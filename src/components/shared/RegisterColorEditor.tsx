'use client'

import { Check, Palette, X } from 'lucide-react'

export const REGISTER_COLOR_PRESETS = [
  { hex: '#3B82F6', label: 'Синій' },
  { hex: '#10B981', label: 'Зелений' },
  { hex: '#06B6D4', label: 'Бірюзовий' },
  { hex: '#F59E0B', label: 'Жовтий' },
  { hex: '#F97316', label: 'Помаранчевий' },
  { hex: '#EF4444', label: 'Червоний' },
  { hex: '#8B5CF6', label: 'Фіолетовий' },
  { hex: '#6B7280', label: 'Сірий' },
] as const

export function RegisterColorEditor({
  value,
  onChange,
  onSave,
  onCancel,
  title,
  showActions = true,
  compact = false,
}: {
  value: string
  onChange: (hex: string) => void
  onSave?: () => void
  onCancel?: () => void
  title?: string
  showActions?: boolean
  compact?: boolean
}) {
  const swatchClass = compact ? 'w-6 h-6' : 'w-8 h-8'

  return (
    <div className={`w-full space-y-3 ${compact ? '' : 'rounded-lg border border-border bg-background/50 p-3'}`}>
      {!compact && (
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-accent shrink-0" />
          <span className="text-sm font-medium text-textPrimary">{title ?? 'Колір каси'}</span>
        </div>
      )}

      <div>
        {!compact && (
          <p className="text-[11px] text-textSecondary uppercase tracking-wider mb-2">Швидкий вибір</p>
        )}
        <div className="flex flex-wrap gap-2">
          {REGISTER_COLOR_PRESETS.map((preset) => {
            const selected = value.toLowerCase() === preset.hex.toLowerCase()
            return (
              <button
                key={preset.hex}
                type="button"
                onClick={() => onChange(preset.hex)}
                title={preset.label}
                className={`${swatchClass} rounded-md border-2 transition-all ${
                  selected ? 'border-accent scale-110 shadow-neon' : 'border-border hover:border-accent/50'
                }`}
                style={{ backgroundColor: preset.hex }}
              />
            )
          })}
        </div>
      </div>

      <div>
        {!compact && (
          <p className="text-[11px] text-textSecondary uppercase tracking-wider mb-2">Свій колір</p>
        )}
        <div className="flex items-center gap-2">
          <label className="relative shrink-0 cursor-pointer group" title="Відкрити палітру">
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
            <span
              className={`flex items-center gap-2 rounded-md border border-border bg-background group-hover:border-accent/50 transition-colors ${
                compact ? 'px-2 py-1' : 'px-2.5 py-1.5'
              }`}
            >
              <span
                className={`rounded border border-border shrink-0 ${compact ? 'w-4 h-4' : 'w-5 h-5'}`}
                style={{ backgroundColor: value }}
              />
              <span className="text-xs text-textSecondary">Обрати</span>
            </span>
          </label>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#3B82F6"
            className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-xs font-mono text-textPrimary focus:outline-none focus:border-accent"
          />
          {showActions && onSave && onCancel && (
            <>
              <button type="button" onClick={onSave} className="text-accent hover:text-accent/80 p-1" title="Зберегти">
                <Check className="w-4 h-4" />
              </button>
              <button type="button" onClick={onCancel} className="text-textSecondary hover:text-textPrimary p-1" title="Скасувати">
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
