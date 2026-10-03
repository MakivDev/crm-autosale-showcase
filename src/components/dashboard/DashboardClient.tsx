'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Car, Wallet, TrendingUp, TrendingDown, ArrowLeftRight,
  AlertTriangle, Activity, Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import type { DashboardData } from '@/actions/dashboard'
import { getDashboardPeriodPnl } from '@/actions/dashboard'
import DashboardPeriodPicker from '@/components/dashboard/DashboardPeriodPicker'
import RecordAttribution from '@/components/shared/RecordAttribution'
import { useHasPermission } from '@/contexts/PermissionsContext'
import {
  canUseLocalMonthlySlice,
  formatDashboardDisplayedRange,
  formatDashboardRangeLabel,
  resolveDashboardDatePreset,
  type DashboardDatePresetId,
} from '@/lib/dashboard-period-presets'
import { localTodayIso } from '@/lib/format-datetime'
import {
  resolveRegisterContainerClass,
  resolveRegisterContainerStyle,
  resolveRegisterTone,
  REGISTER_TONE_BY_CURRENCY,
} from '@/lib/register-tones'

type ActivePeriod = DashboardDatePresetId | 'custom'
type StatTone = 'blue' | 'green' | 'orange' | 'amber' | 'red' | 'cyan' | 'neutral'

const TX_LABEL: Record<string, string> = {
  INCOME: 'Дохід',
  DEPOSIT: 'Поповнення',
  WITHDRAW: 'Вивід',
  EXPENSE: 'Витрата',
  INVESTMENT: 'Вложення',
  STORNO: 'Транзакцію видалено',
  TRANSFER_OUT: 'Переказ ↑',
  TRANSFER_IN: 'Переказ ↓',
}
const TX_COLOR: Record<string, string> = {
  INCOME: 'text-green-600 dark:text-green-400',
  DEPOSIT: 'text-cyan-700 dark:text-cyan-400',
  WITHDRAW: 'text-amber-700 dark:text-amber-400',
  EXPENSE: 'text-red-600 dark:text-red-400',
  INVESTMENT: 'text-violet-700 dark:text-violet-400',
  STORNO: 'text-slate-600 dark:text-slate-300',
  TRANSFER_OUT: 'text-blue-600 dark:text-blue-400',
  TRANSFER_IN: 'text-blue-600 dark:text-blue-400',
}
const TX_BADGE: Record<string, string> = {
  INCOME: 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400',
  DEPOSIT: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400',
  WITHDRAW: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  EXPENSE: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  INVESTMENT: 'bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400',
  STORNO: 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300',
  TRANSFER_OUT: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  TRANSFER_IN: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
}

const STAT_TONE: Record<StatTone, { card: string; value: string; icon: string }> = {
  blue: {
    card: 'border-blue-200/80 bg-gradient-to-br from-blue-50 via-white to-sky-50/60 dark:from-surface dark:via-surface dark:to-surface dark:border-border',
    value: 'text-blue-700 dark:text-blue-400',
    icon: 'text-blue-500 dark:text-blue-400',
  },
  green: {
    card: 'border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-green-50/60 dark:from-surface dark:via-surface dark:to-surface dark:border-border',
    value: 'text-emerald-700 dark:text-emerald-400',
    icon: 'text-emerald-500 dark:text-emerald-400',
  },
  orange: {
    card: 'border-orange-200/80 bg-gradient-to-br from-orange-50 via-white to-amber-50/50 dark:from-surface dark:via-surface dark:to-surface dark:border-border',
    value: 'text-orange-700 dark:text-orange-400',
    icon: 'text-orange-500 dark:text-orange-400',
  },
  amber: {
    card: 'border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-yellow-50/50 dark:from-surface dark:via-surface dark:to-surface dark:border-border',
    value: 'text-amber-700 dark:text-amber-400',
    icon: 'text-amber-500 dark:text-amber-400',
  },
  red: {
    card: 'border-red-200/80 bg-gradient-to-br from-red-50 via-white to-rose-50/50 dark:from-surface dark:via-surface dark:to-surface dark:border-border',
    value: 'text-red-700 dark:text-red-400',
    icon: 'text-red-500 dark:text-red-400',
  },
  cyan: {
    card: 'border-cyan-200/80 bg-gradient-to-br from-cyan-50 via-white to-teal-50/50 dark:from-surface dark:via-surface dark:to-surface dark:border-border',
    value: 'text-cyan-700 dark:text-accent',
    icon: 'text-cyan-600 dark:text-accent',
  },
  neutral: {
    card: 'border-border bg-surface',
    value: 'text-textPrimary',
    icon: 'text-textSecondary',
  },
}

const REGISTER_TONE: Record<string, StatTone> = REGISTER_TONE_BY_CURRENCY

function fmt(n: number, decimals = 0) {
  if (!Number.isFinite(n)) return decimals > 0 ? '0.00' : '0'
  const factor = Math.pow(10, decimals)
  const rounded = Math.round((n + Number.EPSILON) * factor) / factor
  const fixed = rounded.toFixed(decimals)
  const [intPart, decPart] = fixed.split('.')
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return decimals > 0 ? `${intFormatted}.${decPart}` : intFormatted
}

function fmtChart(n: number) {
  return fmt(Math.round(Number(n) || 0), 0)
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'щойно'
  if (diff < 3600) return `${Math.floor(diff / 60)} хв тому`
  if (diff < 86400) return `${Math.floor(diff / 3600)} год тому`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} д тому`
  return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' })
}

function Panel({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-border bg-surface shadow-elevated-sm dark:shadow-none ${className}`}>
      {children}
    </div>
  )
}

function StatCard({
  label, value, sub, icon: Icon, tone = 'neutral', href,
}: {
  label: string; value: string; sub?: string
  icon?: React.ElementType; tone?: StatTone; href?: string
}) {
  const t = STAT_TONE[tone]
  const inner = (
    <div className={`rounded-xl border p-4 h-full shadow-elevated-sm dark:shadow-none transition-colors ${t.card}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-textSecondary uppercase tracking-wider">{label}</span>
        {Icon && <Icon className={`w-4 h-4 ${t.icon}`} />}
      </div>
      <div className={`text-xl font-bold font-mono ${t.value}`}>{value}</div>
      {sub && <div className="text-[11px] text-textSecondary mt-1">{sub}</div>}
    </div>
  )
  return href ? <Link href={href} className="block hover:scale-[1.01] transition-transform">{inner}</Link> : inner
}

function ChartScroll({ children, minWidth }: { children: React.ReactNode; minWidth: number }) {
  return (
    <div className="-mx-1 overflow-x-auto no-scrollbar touch-pan-x">
      <div style={{ minWidth }}>{children}</div>
    </div>
  )
}

function BarChart({ data }: { data: DashboardData['monthlyData'] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const maxVal = Math.max(...data.flatMap(d => [d.income, d.expenses]), 1)
  const slotMin = data.length > 6 ? 52 : 44
  const W = Math.max(320, data.length * slotMin + 56)
  const H = 180
  const PAD_L = 46
  const PAD_B = 28
  const PAD_T = 10
  const chartW = W - PAD_L - 12
  const chartH = H - PAD_B - PAD_T
  const slotW = chartW / Math.max(data.length, 1)
  const barW = Math.max(Math.min(slotW * 0.32, 18), 5)
  const gridLines = [0.25, 0.5, 0.75, 1]
  const labelStep = data.length > 8 ? 2 : 1

  if (!mounted) {
    return <div className="w-full rounded-lg bg-background/40" style={{ height: H }} aria-hidden />
  }

  return (
    <ChartScroll minWidth={W}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {gridLines.map(pct => {
          const y = PAD_T + chartH * (1 - pct)
          const val = maxVal * pct
          return (
            <g key={pct}>
              <line x1={PAD_L} y1={y} x2={W - 12} y2={y} stroke="var(--chart-grid)" strokeDasharray="4 4" />
              <text x={PAD_L - 6} y={y + 4} textAnchor="end" fill="var(--chart-label)" fontSize={10} fontWeight={500}>
                {val >= 1000 ? `${Math.round(val / 1000)}k` : Math.round(val)}
              </text>
            </g>
          )
        })}

        {data.map((d, i) => {
          const cx = PAD_L + i * slotW + slotW / 2
          const incH = (d.income / maxVal) * chartH
          const expH = (d.expenses / maxVal) * chartH
          const baseY = PAD_T + chartH

          return (
            <g key={i}>
              {d.income > 0 && (
                <rect
                  x={cx - barW - 2} y={baseY - incH} width={barW} height={Math.max(incH, 2)}
                  fill="var(--chart-income)" rx={3}
                >
                  <title>{`${d.label} · Дохід: ${fmtChart(d.income)}`}</title>
                </rect>
              )}
              {d.expenses > 0 && (
                <rect
                  x={cx + 2} y={baseY - expH} width={barW} height={Math.max(expH, 2)}
                  fill="var(--chart-expense)" rx={3}
                >
                  <title>{`${d.label} · Витрати: ${fmtChart(d.expenses)}`}</title>
                </rect>
              )}
              {(i % labelStep === 0 || i === data.length - 1) && (
                <text x={cx} y={H - 8} textAnchor="middle" fill="var(--chart-label)" fontSize={10} fontWeight={500}>
                  {d.label}
                </text>
              )}
            </g>
          )
        })}

        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + chartH} stroke="var(--chart-axis)" />
        <line x1={PAD_L} y1={PAD_T + chartH} x2={W - 12} y2={PAD_T + chartH} stroke="var(--chart-axis)" />
      </svg>
    </ChartScroll>
  )
}

function NetLine({ data }: { data: DashboardData['monthlyData'] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const nets = data.map(d => d.net)
  const minVal = Math.min(...nets, 0)
  const maxVal = Math.max(...nets, 0)
  const range = Math.max(maxVal - minVal, 1)
  const slotMin = data.length > 6 ? 52 : 44
  const W = Math.max(320, data.length * slotMin + 56)
  const H = 140
  const PAD_L = 46
  const PAD_B = 28
  const PAD_T = 10
  const chartW = W - PAD_L - 12
  const chartH = H - PAD_B - PAD_T
  const zeroY = PAD_T + chartH * (maxVal / range)
  const labelStep = data.length > 8 ? 2 : 1

  const points = data.map((d, i) => {
    const x = data.length === 1 ? PAD_L + chartW / 2 : PAD_L + (i / (data.length - 1)) * chartW
    const y = PAD_T + chartH * (1 - (d.net - minVal) / range)
    return { x, y, net: d.net, label: d.label }
  })
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  if (!mounted) {
    return <div className="w-full rounded-lg bg-background/40" style={{ height: H }} aria-hidden />
  }

  return (
    <div className="space-y-3">
      <ChartScroll minWidth={W}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
          {minVal < 0 && maxVal > 0 && (
            <line x1={PAD_L} y1={zeroY} x2={W - 12} y2={zeroY} stroke="var(--chart-zero)" strokeDasharray="5 3" />
          )}
          <path d={pathD} fill="none" stroke="var(--chart-line)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={4}
                fill={p.net >= 0 ? 'var(--chart-positive)' : 'var(--chart-negative)'}
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
              <title>{`${p.label}: ${p.net >= 0 ? '+' : ''}${fmtChart(p.net)}`}</title>
            </g>
          ))}
          <line x1={PAD_L} y1={PAD_T + chartH} x2={W - 12} y2={PAD_T + chartH} stroke="var(--chart-axis)" />
          {data.map((d, i) => {
            const x = data.length === 1 ? PAD_L + chartW / 2 : PAD_L + (i / (data.length - 1)) * chartW
            if (i % labelStep !== 0 && i !== data.length - 1) return null
            return (
              <text key={i} x={x} y={H - 8} textAnchor="middle" fill="var(--chart-label)" fontSize={10} fontWeight={500}>
                {d.label}
              </text>
            )
          })}
        </svg>
      </ChartScroll>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {data.slice(-Math.min(data.length, 6)).map((m) => (
          <div
            key={m.label}
            className={`rounded-lg border px-3 py-2 text-center ${
              m.net >= 0
                ? 'border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-500/20 dark:bg-emerald-500/5'
                : 'border-red-200/80 bg-red-50/80 dark:border-red-500/20 dark:bg-red-500/5'
            }`}
          >
            <div className="text-[10px] font-medium text-textSecondary uppercase tracking-wide">{m.label}</div>
            <div className={`font-mono text-sm font-bold mt-0.5 ${m.net >= 0 ? 'text-emerald-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
              {m.net >= 0 ? '+' : ''}{fmt(m.net)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HorizBars({
  items, maxCount,
}: {
  items: { name: string; count: number; isFinal?: boolean }[]
  maxCount: number
}) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="text-textSecondary w-20 sm:w-24 truncate shrink-0 font-medium" title={item.name}>{item.name}</span>
          <div className="flex-1 bg-background/80 dark:bg-background rounded-full h-2.5 overflow-hidden border border-border/60">
            <div
              className={`h-full rounded-full transition-all ${
                item.isFinal
                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-600 dark:from-emerald-500/70 dark:to-emerald-500/40'
                  : 'bg-gradient-to-r from-cyan-400 to-cyan-600 dark:from-accent/70 dark:to-accent/40'
              }`}
              style={{ width: `${Math.max((item.count / maxCount) * 100, item.count > 0 ? 8 : 0)}%` }}
            />
          </div>
          <span className="text-textPrimary font-mono font-semibold w-7 text-right shrink-0">{item.count}</span>
        </div>
      ))}
    </div>
  )
}

export default function DashboardClient({ data }: { data: DashboardData }) {
  const canViewFinance = useHasPermission('finance.view')
  const canViewStock = useHasPermission('finance.stock_capital_view')
  const initialRange = useMemo(() => resolveDashboardDatePreset('this_month'), [])
  const [activePeriod, setActivePeriod] = useState<ActivePeriod>('this_month')
  const [rangeFrom, setRangeFrom] = useState(initialRange.fromIso)
  const [rangeTo, setRangeTo] = useState(initialRange.toIso)
  const [periodLabel, setPeriodLabel] = useState(initialRange.label)
  const [monthsOverride, setMonthsOverride] = useState<DashboardData['monthlyData'] | null>(null)
  const [draftFrom, setDraftFrom] = useState(initialRange.fromIso)
  const [draftTo, setDraftTo] = useState(initialRange.toIso)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [periodLoading, setPeriodLoading] = useState(false)

  const slicedMonths = useMemo(() => {
    if (monthsOverride) return monthsOverride
    if (activePeriod === 'last_12m') return data.monthlyData
    return data.monthlyData.slice(-1)
  }, [data.monthlyData, activePeriod, monthsOverride])

  const periodIncome = useMemo(() => slicedMonths.reduce((s, m) => s + m.income, 0), [slicedMonths])
  const periodExpenses = useMemo(() => slicedMonths.reduce((s, m) => s + m.expenses, 0), [slicedMonths])
  const periodNet = periodIncome - periodExpenses

  const periodShortLabel = periodLabel.length > 16 ? 'діапазон' : periodLabel
  const displayedRangeText = formatDashboardDisplayedRange(rangeFrom, rangeTo)

  const showStockCards =
    canViewStock &&
    data.stockCapitalUsd != null &&
    data.cashTotalUsd != null &&
    data.cashPlusStockUsd != null

  const todayIso = localTodayIso()

  const openCalendar = () => {
    setDraftFrom(rangeFrom)
    setDraftTo(rangeTo)
    setCalendarOpen(v => !v)
  }

  const closeCalendar = useCallback(() => setCalendarOpen(false), [])

  const applyRange = async (
    fromIso: string,
    toIso: string,
    label: string,
    periodKey: ActivePeriod,
    localMonths?: DashboardData['monthlyData'] | null
  ) => {
    if (!fromIso || !toIso) {
      toast.error('Оберіть дати від і до')
      return
    }
    if (fromIso > toIso) {
      toast.error('Дата «від» не може бути пізніше за «до»')
      return
    }

    const clampedTo = toIso > todayIso ? todayIso : toIso

    if (localMonths) {
      setMonthsOverride(localMonths)
      setRangeFrom(fromIso)
      setRangeTo(clampedTo)
      setPeriodLabel(label)
      setActivePeriod(periodKey)
      setCalendarOpen(false)
      return
    }

    setPeriodLoading(true)
    try {
      const res = await getDashboardPeriodPnl(fromIso, clampedTo)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      setMonthsOverride(res.data.monthlyData)
      setRangeFrom(fromIso)
      setRangeTo(clampedTo)
      setPeriodLabel(label)
      setActivePeriod(periodKey)
      setCalendarOpen(false)
    } catch {
      toast.error('Помилка завантаження періоду')
    } finally {
      setPeriodLoading(false)
    }
  }

  const applyPreset = (id: DashboardDatePresetId) => {
    const resolved = resolveDashboardDatePreset(id)
    if (canUseLocalMonthlySlice(id)) {
      const localMonths = id === 'last_12m' ? data.monthlyData : data.monthlyData.slice(-1)
      void applyRange(resolved.fromIso, resolved.toIso, resolved.label, id, localMonths)
      return
    }
    void applyRange(resolved.fromIso, resolved.toIso, resolved.label, id)
  }

  const applyCustomDraft = () => {
    void applyRange(draftFrom, draftTo, formatDashboardRangeLabel(draftFrom, draftTo), 'custom')
  }

  const maxStatusCount = Math.max(...data.vehiclesByStatus.map(s => s.count), 1)
  const maxMakeCount = Math.max(...data.vehiclesByMake.map(m => m.count), 1)

  const totalTxCount =
    data.transactionCountByType.INCOME +
    (data.transactionCountByType.DEPOSIT ?? 0) +
    (data.transactionCountByType.WITHDRAW ?? 0) +
    data.transactionCountByType.EXPENSE +
    data.transactionCountByType.TRANSFER_IN +
    data.transactionCountByType.TRANSFER_OUT

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-textPrimary">Dashboard</h1>
          <p className="text-xs text-textSecondary mt-0.5">
            {canViewFinance ? 'Огляд бізнесу за обраний період' : 'Огляд автопарку'}
          </p>
        </div>
        {canViewFinance && (
          <DashboardPeriodPicker
            activePeriod={activePeriod}
            periodLoading={periodLoading}
            calendarOpen={calendarOpen}
            onToggleCalendar={openCalendar}
            onCloseCalendar={closeCalendar}
            onPreset={applyPreset}
            draftFrom={draftFrom}
            draftTo={draftTo}
            onDraftFrom={setDraftFrom}
            onDraftTo={setDraftTo}
            onApplyCustom={applyCustomDraft}
            todayIso={todayIso}
            displayedRangeText={displayedRangeText}
          />
        )}
      </div>

      {canViewFinance && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.registers.map(reg => {
          const tone = resolveRegisterTone(reg.color, reg.currencyCode)
          const t = STAT_TONE[tone]
          return (
            <Link
              key={reg.id}
              href="/finance"
              className={`rounded-xl p-4 shadow-elevated-sm dark:shadow-none hover:scale-[1.01] transition-all ${resolveRegisterContainerClass(reg.color, reg.currencyCode)}`}
              style={resolveRegisterContainerStyle(reg.color)}
            >
              <div className="text-[11px] font-semibold text-textSecondary uppercase tracking-wider mb-1">{reg.name}</div>
              <div className={`text-2xl font-bold font-mono ${reg.balance < 0 ? 'text-red-400' : t.value}`}>
                {fmt(reg.balance, 2)}
                <span className="text-sm font-normal text-textSecondary ml-1.5">{reg.currencyCode}</span>
              </div>
            </Link>
          )
        })}
        <div className="rounded-xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50 via-white to-teal-50 p-4 shadow-elevated-sm dark:border-accent/25 dark:bg-none dark:bg-accent/[0.08] dark:shadow-none">
          <div className="text-[11px] font-semibold text-textSecondary uppercase tracking-wider mb-1">Загальний ≈ USD</div>
          <div className="text-2xl font-bold font-mono text-cyan-700 dark:text-accent">
            ${fmt(data.totalBalanceUsd)}
          </div>
          <div className="text-[11px] text-textSecondary mt-0.5">Сума всіх кас у доларах</div>
        </div>
      </div>
      )}

      {showStockCards && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard
            label="Вложено в авто"
            value={`$${fmt(data.stockCapitalUsd!, 2)}`}
            icon={Wallet}
            tone="cyan"
            href="/finance"
            sub={data.stockVehicleCount != null ? `${data.stockVehicleCount} авто` : undefined}
          />
          <StatCard
            label="Сума кас"
            value={`$${fmt(data.cashTotalUsd!, 2)}`}
            icon={Wallet}
            tone="blue"
            href="/finance"
            sub="усі каси в USD"
          />
          <StatCard
            label="Каси + вложено в авто"
            value={`$${fmt(data.cashPlusStockUsd!, 2)}`}
            icon={Wallet}
            tone="green"
            href="/finance"
            sub={
              data.stockCapitalSharePct != null
                ? `частка вложеного ${fmt(data.stockCapitalSharePct, 1)}%`
                : undefined
            }
          />
        </div>
      )}

      <div className={`grid gap-3 ${canViewFinance ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-1 sm:grid-cols-2'}`}>
        <StatCard label="Авто в роботі" value={String(data.activeVehiclesCount)} icon={Car} tone="blue" href="/vehicles" sub={`Всього: ${data.totalVehiclesCount}`} />
        <StatCard label="Продано" value={String(data.soldVehiclesCount)} icon={Car} tone="green" href="/vehicles" sub="фінальний статус" />
        {canViewFinance && (
          <>
            <StatCard label="Митний борг" value={`$${fmt(data.customsDebt)}`} icon={AlertTriangle} tone="amber" href="/finance" sub={data.customsDebt > 0 ? 'до сплати' : 'боргу немає'} />
            <StatCard label={`Маржа (${periodShortLabel})`} value={`+${fmt(periodIncome)}`} icon={TrendingUp} tone="green" href="/finance" />
            <StatCard label={`Оп. витрати (${periodShortLabel})`} value={`-${fmt(periodExpenses)}`} icon={TrendingDown} tone="red" href="/finance" />
          </>
        )}
      </div>

      {canViewFinance && (
      <div className={`space-y-4 transition-opacity ${periodLoading ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className={`rounded-xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-elevated-sm dark:shadow-none ${
        periodNet >= 0
          ? 'border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-green-50/70 dark:from-green-500/5 dark:via-surface dark:to-surface dark:border-green-500/20'
          : 'border-red-200/80 bg-gradient-to-r from-red-50 via-white to-rose-50/70 dark:from-red-500/5 dark:via-surface dark:to-surface dark:border-red-500/20'
      }`}>
        <div>
          <div className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">
            Чистий результат: {periodLabel}
          </div>
          <div className={`text-3xl font-bold font-mono ${periodNet >= 0 ? 'text-emerald-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {periodNet >= 0 ? '+' : ''}{fmt(periodNet)}
          </div>
        </div>
          <div className="text-xs text-textSecondary space-y-0.5">
          <div>Маржа продажів: <span className="text-emerald-700 dark:text-green-400 font-mono font-semibold">+{fmt(periodIncome)}</span></div>
          <div>Операційні витрати: <span className="text-red-700 dark:text-red-400 font-mono font-semibold">-{fmt(periodExpenses)}</span></div>
        </div>
        <div className="text-xs text-textSecondary space-y-0.5">
          <div>За 12 міс. маржа: <span className="text-textPrimary font-mono font-semibold">{fmt(data.totalIncome12m)}</span></div>
          <div>За 12 міс. оп. витрати: <span className="text-textPrimary font-mono font-semibold">{fmt(data.totalExpenses12m)}</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel className="p-4 sm:p-5 bg-gradient-to-br from-white via-white to-emerald-50/40 dark:from-surface dark:via-surface dark:to-surface">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-textPrimary uppercase tracking-wider">
              Маржа vs Оп. витрати
            </h2>
            <div className="flex items-center gap-3 text-[11px] font-medium">
              <span className="flex items-center gap-1.5 text-emerald-700 dark:text-green-400">
                <span className="w-3 h-3 rounded-sm bg-emerald-500/80 inline-block" />Маржа
              </span>
              <span className="flex items-center gap-1.5 text-red-700 dark:text-red-400">
                <span className="w-3 h-3 rounded-sm bg-red-500/75 inline-block" />Оп. витрати
              </span>
            </div>
          </div>
          <p className="text-[11px] text-textSecondary mb-2 sm:hidden">Гортайте графік пальцем →</p>
          <BarChart data={slicedMonths} />
        </Panel>

        <Panel className="p-4 sm:p-5 bg-gradient-to-br from-white via-white to-cyan-50/40 dark:from-surface dark:via-surface dark:to-surface">
          <h2 className="text-sm font-semibold text-textPrimary uppercase tracking-wider mb-3">
            Чистий результат по місяцях
          </h2>
          <NetLine data={slicedMonths} />
        </Panel>
      </div>
      </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-textPrimary uppercase tracking-wider mb-4 flex items-center gap-2">
            <Car className="w-4 h-4 text-cyan-600 dark:text-accent" /> Авто за статусом
          </h2>
          {data.vehiclesByStatus.length === 0 ? (
            <p className="text-sm text-textSecondary text-center py-4">Немає авто</p>
          ) : (
            <HorizBars items={data.vehiclesByStatus} maxCount={maxStatusCount} />
          )}
        </Panel>

        <Panel className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-textPrimary uppercase tracking-wider mb-4 flex items-center gap-2">
            <Car className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Авто за маркою
          </h2>
          {data.vehiclesByMake.length === 0 ? (
            <p className="text-sm text-textSecondary text-center py-4">Немає авто</p>
          ) : (
            <HorizBars items={data.vehiclesByMake} maxCount={maxMakeCount} />
          )}
        </Panel>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${canViewFinance ? 'lg:grid-cols-2' : ''}`}>
        {canViewFinance && (
        <Panel className="overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-border flex items-center justify-between bg-gradient-to-r from-violet-50/80 to-white dark:from-surface dark:to-surface">
            <h2 className="text-sm font-semibold text-textPrimary uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-violet-600 dark:text-accent" /> Останні транзакції
            </h2>
            <Link href="/finance" className="text-[11px] font-semibold text-accent hover:underline">
              Всі →
            </Link>
          </div>
          {data.recentTransactions.length === 0 ? (
            <p className="px-5 py-8 text-sm text-textSecondary text-center">Немає транзакцій</p>
          ) : (
            <div className="divide-y divide-border">
              {data.recentTransactions.map(tx => {
                const displayType = tx.displayType ?? tx.type
                return (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surfaceHover">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md shrink-0 ${TX_BADGE[displayType] ?? 'bg-border text-textPrimary'}`}>
                    {TX_LABEL[displayType] ?? displayType}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-textPrimary truncate font-medium">
                      {tx.categoryName ?? tx.vehicleLabel ?? tx.description ?? tx.registerName}
                    </div>
                    <div className="text-[10px] text-textSecondary space-y-0.5">
                      <div>{tx.registerName}</div>
                      <RecordAttribution at={tx.createdAt} user={tx.createdByUser} inline />
                    </div>
                  </div>
                  <span className={`font-mono text-sm font-semibold shrink-0 text-right ${TX_COLOR[displayType] ?? 'text-textPrimary'}`}>
                    <span className="block">
                      {tx.type === 'INCOME' || tx.type === 'DEPOSIT' || tx.type === 'TRANSFER_IN' ? '+' : '−'}
                      {fmt(tx.amount, 0)} {tx.currencyCode}
                    </span>
                    {tx.amountUsd != null && tx.currencyCode !== 'USD' && (
                      <span className="block text-[10px] text-textSecondary font-normal mt-0.5">
                        ≈ ${fmt(tx.amountUsd, 2)}
                      </span>
                    )}
                  </span>
                </div>
                )
              })}
            </div>
          )}
        </Panel>
        )}

        <Panel className="overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-border bg-gradient-to-r from-sky-50/80 to-white dark:from-surface dark:to-surface">
            <h2 className="text-sm font-semibold text-textPrimary uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-600 dark:text-accent" /> Остання активність
            </h2>
          </div>
          {data.recentStatusChanges.length === 0 ? (
            <p className="px-5 py-8 text-sm text-textSecondary text-center">Немає активності</p>
          ) : (
            <div className="divide-y divide-border">
              {data.recentStatusChanges.map((h, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surfaceHover">
                  <div className="w-2 h-2 rounded-full bg-cyan-500 dark:bg-accent shrink-0 shadow-[0_0_6px_rgba(8,145,178,0.5)]" />
                  <div className="flex-1 min-w-0">
                    <Link href={`/vehicles/${h.vehicleId}`} className="text-xs text-textPrimary hover:text-accent transition-colors truncate block font-medium">
                      {h.vehicleLabel}
                    </Link>
                    <div className="text-[10px] text-textSecondary">
                      {h.statusName} · {h.userName}
                    </div>
                  </div>
                  <span className="text-[10px] text-textSecondary shrink-0">{timeAgo(h.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {canViewFinance && (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`rounded-xl border p-4 shadow-elevated-sm dark:shadow-none ${STAT_TONE.green.card}`}>
          <div className="text-[11px] font-semibold text-textSecondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingUp className={`w-3 h-3 ${STAT_TONE.green.icon}`} /> Доходів
          </div>
          <div className={`text-xl font-bold font-mono ${STAT_TONE.green.value}`}>{fmt(data.transactionCountByType.INCOME)}</div>
          <div className="text-[11px] text-textSecondary mt-0.5">транзакцій всього</div>
        </div>
        <div className={`rounded-xl border p-4 shadow-elevated-sm dark:shadow-none ${STAT_TONE.cyan.card}`}>
          <div className="text-[11px] font-semibold text-textSecondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Wallet className={`w-3 h-3 ${STAT_TONE.cyan.icon}`} /> Поповнень
          </div>
          <div className={`text-xl font-bold font-mono ${STAT_TONE.cyan.value}`}>{fmt(data.transactionCountByType.DEPOSIT ?? 0)}</div>
          <div className="text-[11px] text-textSecondary mt-0.5">не в прибутку</div>
        </div>
        <div className={`rounded-xl border p-4 shadow-elevated-sm dark:shadow-none ${STAT_TONE.amber.card}`}>
          <div className="text-[11px] font-semibold text-textSecondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Wallet className={`w-3 h-3 ${STAT_TONE.amber.icon}`} /> Виводів
          </div>
          <div className={`text-xl font-bold font-mono ${STAT_TONE.amber.value}`}>{fmt(data.transactionCountByType.WITHDRAW ?? 0)}</div>
          <div className="text-[11px] text-textSecondary mt-0.5">не в витратах</div>
        </div>
        <div className={`rounded-xl border p-4 shadow-elevated-sm dark:shadow-none ${STAT_TONE.red.card}`}>
          <div className="text-[11px] font-semibold text-textSecondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingDown className={`w-3 h-3 ${STAT_TONE.red.icon}`} /> Витрат
          </div>
          <div className={`text-xl font-bold font-mono ${STAT_TONE.red.value}`}>{fmt(data.transactionCountByType.EXPENSE)}</div>
          <div className="text-[11px] text-textSecondary mt-0.5">транзакцій всього</div>
        </div>
        <div className={`rounded-xl border p-4 shadow-elevated-sm dark:shadow-none ${STAT_TONE.blue.card}`}>
          <div className="text-[11px] font-semibold text-textSecondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <ArrowLeftRight className={`w-3 h-3 ${STAT_TONE.blue.icon}`} /> Перекази
          </div>
          <div className={`text-xl font-bold font-mono ${STAT_TONE.blue.value}`}>
            {fmt(data.transactionCountByType.TRANSFER_IN + data.transactionCountByType.TRANSFER_OUT)}
          </div>
          <div className="text-[11px] text-textSecondary mt-0.5">записів всього</div>
        </div>
        <div className={`rounded-xl border p-4 shadow-elevated-sm dark:shadow-none ${STAT_TONE.cyan.card}`}>
          <div className="text-[11px] font-semibold text-textSecondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Wallet className={`w-3 h-3 ${STAT_TONE.cyan.icon}`} /> Всього операцій
          </div>
          <div className={`text-xl font-bold font-mono ${STAT_TONE.cyan.value}`}>{fmt(totalTxCount)}</div>
          <div className="text-[11px] text-textSecondary mt-0.5">у системі</div>
        </div>
      </div>
      </>
      )}

      {canViewFinance && data.customsDebt > 0 && (
        <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-yellow-50/60 dark:from-amber-500/5 dark:via-surface dark:to-surface dark:border-amber-500/20 p-4 flex items-center gap-4 flex-wrap shadow-elevated-sm dark:shadow-none">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-amber-800 dark:text-amber-400">
              Митний борг: ${fmt(data.customsDebt)}
            </div>
            <div className="text-xs text-textSecondary mt-0.5">
              Накопичено перед митною компанією. Погасити у розділі Фінанси.
            </div>
          </div>
          <Link href="/finance" className="text-xs font-semibold text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30 px-3 py-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-500/10 transition-colors">
            Фінанси →
          </Link>
        </div>
      )}
    </div>
  )
}
