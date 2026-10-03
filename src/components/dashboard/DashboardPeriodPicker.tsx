'use client'

import { useEffect, useRef } from 'react'
import { CalendarDays, Loader2 } from 'lucide-react'
import DateInput from '@/components/shared/DateInput'
import {
  DASHBOARD_DATE_PRESETS,
  type DashboardDatePresetId,
} from '@/lib/dashboard-period-presets'

type ActivePeriod = DashboardDatePresetId | 'custom'

type Props = {
  activePeriod: ActivePeriod
  periodLoading: boolean
  calendarOpen: boolean
  onToggleCalendar: () => void
  onCloseCalendar: () => void
  onPreset: (id: DashboardDatePresetId) => void
  draftFrom: string
  draftTo: string
  onDraftFrom: (v: string) => void
  onDraftTo: (v: string) => void
  onApplyCustom: () => void
  todayIso: string
  displayedRangeText: string
}

/**
 * Dashboard period control: preset chips + custom from/to popover.
 * Visual language: calm CRM ledger (cyan accent, soft glass panel, mono dates).
 */
export default function DashboardPeriodPicker({
  activePeriod,
  periodLoading,
  calendarOpen,
  onToggleCalendar,
  onCloseCalendar,
  onPreset,
  draftFrom,
  draftTo,
  onDraftFrom,
  onDraftTo,
  onApplyCustom,
  todayIso,
  displayedRangeText,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!calendarOpen) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onCloseCalendar()
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [calendarOpen, onCloseCalendar])

  return (
    <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto" ref={rootRef}>
      <div
        className="relative flex flex-wrap items-center justify-end gap-1 rounded-2xl border border-border/80 bg-surface/90 p-1.5 shadow-elevated-sm dark:shadow-none backdrop-blur-sm max-w-full"
        role="group"
        aria-label="Період статистики"
      >
        {DASHBOARD_DATE_PRESETS.map(p => {
          const active = activePeriod === p.id
          return (
            <button
              key={p.id}
              type="button"
              disabled={periodLoading}
              onClick={() => onPreset(p.id)}
              className={`px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold rounded-xl transition-all duration-200 ease-out active:scale-[0.98] disabled:opacity-50 ${
                active
                  ? 'bg-accent text-accentOn shadow-sm ring-1 ring-accent/30'
                  : 'text-textSecondary hover:text-textPrimary hover:bg-surfaceHover'
              }`}
            >
              {p.label}
            </button>
          )
        })}

        <button
          type="button"
          onClick={onToggleCalendar}
          title="Свій діапазон дат"
          aria-expanded={calendarOpen}
          aria-haspopup="dialog"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold rounded-xl transition-all duration-200 ease-out active:scale-[0.98] ${
            activePeriod === 'custom' || calendarOpen
              ? 'bg-accent text-accentOn shadow-sm ring-1 ring-accent/30'
              : 'text-textSecondary hover:text-textPrimary hover:bg-surfaceHover'
          }`}
        >
          {periodLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <CalendarDays className="w-3.5 h-3.5" aria-hidden />
          )}
          <span className="hidden sm:inline">Свій</span>
        </button>

        {calendarOpen && (
          <div
            role="dialog"
            aria-label="Свій діапазон дат"
            className="absolute right-0 top-full mt-2 z-40 w-[min(100vw-2rem,340px)] overflow-hidden rounded-2xl border border-cyan-200/70 bg-white/95 shadow-[0_18px_50px_-20px_rgba(8,47,73,0.35)] dark:border-accent/25 dark:bg-surface/95 dark:shadow-[0_18px_50px_-18px_rgba(0,0,0,0.55)] backdrop-blur-md motion-safe:animate-[dashPeriodIn_180ms_ease-out]"
          >
            {/* Soft cyan wash - ledger / dealership glass (not AI purple) */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-50/90 via-transparent to-teal-50/50 dark:from-accent/[0.08] dark:via-transparent dark:to-cyan-950/20"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent dark:via-accent/40"
            />

            <div className="relative p-3.5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold tracking-tight text-textPrimary">
                    Свій діапазон
                  </div>
                  <p className="text-[11px] text-textSecondary mt-0.5 leading-snug">
                    Оберіть дати від і до для маржі та оп. витрат
                  </p>
                </div>
                <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-700 dark:bg-accent/15 dark:text-accent">
                  <CalendarDays className="w-4 h-4" aria-hidden />
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-textSecondary">Дата від</span>
                  <DateInput
                    value={draftFrom}
                    onChange={onDraftFrom}
                    max={draftTo || todayIso}
                    inputClassName="!py-2 text-xs rounded-xl bg-background/80 font-mono"
                    className="w-full"
                    disabled={periodLoading}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-textSecondary">Дата до</span>
                  <DateInput
                    value={draftTo}
                    onChange={onDraftTo}
                    min={draftFrom || undefined}
                    max={todayIso}
                    inputClassName="!py-2 text-xs rounded-xl bg-background/80 font-mono"
                    className="w-full"
                    disabled={periodLoading}
                  />
                </label>
              </div>

              <button
                type="button"
                disabled={periodLoading || !draftFrom || !draftTo}
                onClick={onApplyCustom}
                className="w-full px-3 py-2.5 rounded-xl text-xs font-semibold bg-accent text-accentOn shadow-sm hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50 disabled:active:scale-100"
              >
                {periodLoading ? 'Завантаження…' : 'Застосувати'}
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] sm:text-xs text-textSecondary font-mono tracking-tight sm:text-right px-0.5">
        {displayedRangeText}
      </p>
    </div>
  )
}
