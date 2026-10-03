'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Search, X, Archive, SortAsc, SortDesc } from 'lucide-react'
import {
  DEFAULT_VEHICLE_SEARCH_FILTERS,
  VEHICLE_SEARCH_SORT_COLUMNS,
  filterAndSortVehicles,
  hasActiveVehicleSearchFilters,
  type VehicleSearchFilterState,
  type VehicleSearchItem,
  type VehicleSearchSortField,
} from '@/lib/vehicle-search'

const inputCls =
  'w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-textPrimary placeholder:text-textSecondary focus:outline-none focus:border-accent transition-colors'

type DictItem = { id: number; name: string }
type StatusItem = DictItem & { isFinal?: boolean }

function StatusChip({
  active,
  isFinal,
  compact,
  onClick,
  children,
}: {
  active: boolean
  isFinal?: boolean
  compact?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md transition-all border whitespace-nowrap ${
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      } ${
        active
          ? isFinal
            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
            : 'bg-accent/10 border-accent/40 text-accent'
          : 'border-border/50 text-textSecondary hover:text-textPrimary hover:bg-surfaceHover'
      }`}
    >
      {children}
    </button>
  )
}

function FilterChip({
  active,
  compact,
  onClick,
  children,
}: {
  active: boolean
  compact?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md transition-all border whitespace-nowrap ${
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      } ${
        active
          ? 'bg-accent/10 border-accent/40 text-accent'
          : 'border-border/50 text-textSecondary hover:text-textPrimary hover:bg-surfaceHover'
      }`}
    >
      {children}
    </button>
  )
}

export default function VehicleSearchPanel({
  vehicles,
  statuses = [],
  driveTypes = [],
  transmissions = [],
  variant = 'default',
  showSort = true,
  showArchive = true,
  showSummary = true,
  showCustomsFilters = false,
  initialFilters,
  defaultFilters,
  onChange,
  onFilteredIdsChange,
  className = '',
}: {
  vehicles: VehicleSearchItem[]
  statuses?: StatusItem[]
  driveTypes?: DictItem[]
  transmissions?: DictItem[]
  variant?: 'default' | 'compact'
  showSort?: boolean
  showArchive?: boolean
  showSummary?: boolean
  showCustomsFilters?: boolean
  initialFilters?: Partial<VehicleSearchFilterState>
  defaultFilters?: Partial<VehicleSearchFilterState>
  onChange?: (filtered: VehicleSearchItem[], filters: VehicleSearchFilterState) => void
  onFilteredIdsChange?: (ids: Set<number> | null, filters: VehicleSearchFilterState) => void
  className?: string
}) {
  const compact = variant === 'compact'
  const baseDefaults = { ...DEFAULT_VEHICLE_SEARCH_FILTERS, ...defaultFilters }

  const [filters, setFilters] = useState<VehicleSearchFilterState>(() => ({
    ...baseDefaults,
    ...initialFilters,
  }))

  const filtered = useMemo(
    () => filterAndSortVehicles(vehicles, filters),
    [vehicles, filters]
  )

  const archivedCount = useMemo(
    () => vehicles.filter((v) => v.isFinal).length,
    [vehicles]
  )
  const activeCount = useMemo(
    () => vehicles.filter((v) => !v.isFinal).length,
    [vehicles]
  )

  const hasFilters = hasActiveVehicleSearchFilters(filters, baseDefaults)
  const hasQuery = !!filters.query.trim()

  const onChangeRef = useRef(onChange)
  const onFilteredIdsChangeRef = useRef(onFilteredIdsChange)
  onChangeRef.current = onChange
  onFilteredIdsChangeRef.current = onFilteredIdsChange

  useEffect(() => {
    onChangeRef.current?.(filtered, filters)
    const ids = hasFilters ? new Set(filtered.map((v) => v.id)) : null
    onFilteredIdsChangeRef.current?.(ids, filters)
  }, [filtered, filters, hasFilters])

  const patch = (next: Partial<VehicleSearchFilterState>) => {
    setFilters((f) => ({ ...f, ...next }))
  }

  const resetAll = () => setFilters({ ...baseDefaults })

  const resetQuery = () => patch({ query: '' })

  const toggleSort = (field: VehicleSearchSortField) => {
    if (filters.sortField === field) {
      patch({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' })
    } else {
      patch({ sortField: field, sortDir: 'asc' })
    }
  }

  const SortIcon = ({ field }: { field: VehicleSearchSortField }) => {
    if (filters.sortField !== field) {
      return <span className="w-3 h-3 inline-block opacity-20 text-[10px]">↕</span>
    }
    return filters.sortDir === 'asc'
      ? <SortAsc className={`inline-block text-accent ml-0.5 ${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
      : <SortDesc className={`inline-block text-accent ml-0.5 ${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
  }

  const showStatusFilters = statuses.length > 0
  const showDriveFilters = driveTypes.length > 0
  const showTransmissionFilters = transmissions.length > 0
  const hasCustomsData = vehicles.some(
    (v) => v.customsBalance != null || v.customsPaymentStatus != null
  )
  const showCustomsRow = showCustomsFilters && hasCustomsData

  return (
    <div className={`space-y-2 ${className}`}>
      <div className={`flex gap-2 ${compact ? 'flex-col sm:flex-row sm:flex-wrap sm:items-end' : 'flex-wrap items-end'}`}>
        <div className={`relative ${compact ? 'w-full sm:flex-1 sm:min-w-[180px]' : 'flex-1 min-w-[200px]'}`}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textSecondary pointer-events-none" />
          <input
            value={filters.query}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder="Пошук: VIN, марка, модель, рік, назва..."
            className={`${inputCls} pl-8 ${hasQuery ? 'pr-7' : ''}`}
          />
          {hasQuery && (
            <button
              type="button"
              onClick={resetQuery}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-textSecondary hover:text-textPrimary transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={resetAll}
          disabled={!hasFilters}
          className={`flex items-center justify-center gap-1.5 border rounded-md transition-colors whitespace-nowrap ${
            compact ? 'w-full sm:w-auto px-3 py-2 text-sm' : 'px-3 py-2 text-sm'
          } ${
            hasFilters
              ? 'border-border text-textSecondary hover:border-accent hover:text-accent cursor-pointer'
              : 'border-border/40 text-textSecondary/30 cursor-default'
          }`}
        >
          <X className="w-3.5 h-3.5" />
          Скинути
        </button>
        {hasFilters && (
          <span className={`text-textSecondary whitespace-nowrap ${compact ? 'text-[11px] py-1' : 'text-xs py-2'}`}>
            {filtered.length} авто
          </span>
        )}
      </div>

      {(showStatusFilters || showDriveFilters || showTransmissionFilters || showCustomsRow) && (
        <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
          {showStatusFilters && (
            <div className={`flex gap-1.5 ${compact ? 'flex-col' : 'flex-wrap items-center'}`}>
              <span className={`text-textSecondary uppercase tracking-wider shrink-0 ${compact ? 'text-[9px]' : 'text-[10px] mr-1'}`}>
                Статус:
              </span>
              <div className={`flex flex-wrap gap-1 ${compact ? 'w-full' : ''}`}>
                <StatusChip
                  active={filters.statusId === 'all'}
                  compact={compact}
                  onClick={() => patch({ statusId: 'all' })}
                >
                  Всі
                </StatusChip>
                {statuses.map((s) => (
                  <StatusChip
                    key={s.id}
                    active={filters.statusId === s.id}
                    isFinal={s.isFinal}
                    compact={compact}
                    onClick={() => {
                      patch({
                        statusId: s.id,
                        ...(s.isFinal ? { showArchived: true } : {}),
                      })
                    }}
                  >
                    {s.name}
                  </StatusChip>
                ))}
                {showArchive && archivedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => patch({ showArchived: !filters.showArchived })}
                    className={`flex items-center gap-1.5 rounded-md transition-all border whitespace-nowrap ${
                      compact ? 'px-2 py-0.5 text-[11px] ml-0' : 'px-2.5 py-1 text-xs ml-1'
                    } ${
                      filters.showArchived
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'text-textSecondary border-border/50 hover:text-textPrimary hover:bg-surfaceHover'
                    }`}
                  >
                    <Archive className="w-3 h-3" />
                    Архів ({archivedCount})
                  </button>
                )}
              </div>
            </div>
          )}

          {showCustomsRow && (
            <div className={`flex gap-1.5 ${compact ? 'flex-col' : 'flex-wrap items-center'}`}>
              <span className={`text-textSecondary uppercase tracking-wider shrink-0 ${compact ? 'text-[9px]' : 'text-[10px] mr-1'}`}>
                Мито:
              </span>
              <div className={`flex flex-wrap gap-1 ${compact ? 'w-full' : ''}`}>
                <FilterChip
                  active={filters.customsDebtFilter === 'all'}
                  compact={compact}
                  onClick={() => patch({ customsDebtFilter: 'all' })}
                >
                  Всі
                </FilterChip>
                <FilterChip
                  active={filters.customsDebtFilter === 'open'}
                  compact={compact}
                  onClick={() => patch({ customsDebtFilter: 'open' })}
                >
                  Мито не закрите
                </FilterChip>
                <FilterChip
                  active={filters.customsDebtFilter === 'underpaid'}
                  compact={compact}
                  onClick={() => patch({ customsDebtFilter: 'underpaid' })}
                >
                  Недопроплата
                </FilterChip>
              </div>
            </div>
          )}

          {showDriveFilters && (
            <div className={`flex gap-1.5 ${compact ? 'flex-col' : 'flex-wrap items-center'}`}>
              <span className={`text-textSecondary uppercase tracking-wider shrink-0 ${compact ? 'text-[9px]' : 'text-[10px] mr-1'}`}>
                Привід:
              </span>
              <div className={`flex flex-wrap gap-1 ${compact ? 'w-full' : ''}`}>
                <FilterChip active={filters.driveTypeId === 'all'} compact={compact} onClick={() => patch({ driveTypeId: 'all' })}>
                  Всі
                </FilterChip>
                {driveTypes.map((d) => (
                  <FilterChip
                    key={d.id}
                    active={filters.driveTypeId === d.id}
                    compact={compact}
                    onClick={() => patch({ driveTypeId: d.id })}
                  >
                    {d.name}
                  </FilterChip>
                ))}
              </div>
            </div>
          )}

          {showTransmissionFilters && (
            <div className={`flex gap-1.5 ${compact ? 'flex-col' : 'flex-wrap items-center'}`}>
              <span className={`text-textSecondary uppercase tracking-wider shrink-0 ${compact ? 'text-[9px]' : 'text-[10px] mr-1'}`}>
                Коробка:
              </span>
              <div className={`flex flex-wrap gap-1 ${compact ? 'w-full' : ''}`}>
                <FilterChip active={filters.transmissionId === 'all'} compact={compact} onClick={() => patch({ transmissionId: 'all' })}>
                  Всі
                </FilterChip>
                {transmissions.map((t) => (
                  <FilterChip
                    key={t.id}
                    active={filters.transmissionId === t.id}
                    compact={compact}
                    onClick={() => patch({ transmissionId: t.id })}
                  >
                    {t.name}
                  </FilterChip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showSummary && (
        <div className={`text-textSecondary ${compact ? 'text-[11px]' : 'text-xs'}`}>
          Показано: <span className="text-textPrimary font-medium">{filtered.length}</span>
          {!filters.showArchived && archivedCount > 0 && (
            <span> · {activeCount} активних · {archivedCount} в архіві (приховано)</span>
          )}
        </div>
      )}

      {showSort && (
        <div className={`flex items-center gap-1 ${compact ? 'overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin' : 'flex-wrap'}`}>
          <span className={`text-textSecondary shrink-0 mr-1 ${compact ? 'text-[11px]' : 'text-xs'}`}>
            Сортування:
          </span>
          {VEHICLE_SEARCH_SORT_COLUMNS.map((col) => (
            <button
              key={col.field}
              type="button"
              onClick={() => toggleSort(col.field)}
              className={`flex items-center gap-0.5 rounded transition-all border shrink-0 ${
                compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs'
              } ${
                filters.sortField === col.field
                  ? 'bg-accent/10 text-accent border-accent/30'
                  : 'text-textSecondary border-transparent hover:text-textPrimary hover:border-border'
              }`}
            >
              {col.label}
              <SortIcon field={col.field} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
