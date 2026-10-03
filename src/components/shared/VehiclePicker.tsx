'use client'

import { useState, useEffect, useMemo } from 'react'
import { Car, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import VehicleSearchPanel from '@/components/shared/VehicleSearchPanel'
import type { VehicleSearchItem } from '@/lib/vehicle-search'

type DictItem = { id: number; name: string }
type StatusItem = DictItem & { isFinal?: boolean }

const PAGE_SIZES = [5, 10, 20] as const

function VehicleThumb({ coverPhoto }: { coverPhoto?: string | null }) {
  if (coverPhoto) {
    return (
      <img
        src={coverPhoto}
        alt=""
        className="w-[4.5rem] h-[3.25rem] rounded-md object-cover shrink-0 bg-border border border-border/60"
      />
    )
  }
  return (
    <div className="w-[4.5rem] h-[3.25rem] rounded-md bg-border/40 border border-border/60 flex items-center justify-center shrink-0">
      <Car className="w-5 h-5 text-textSecondary/60" />
    </div>
  )
}

export default function VehiclePicker({
  vehicles,
  statuses = [],
  driveTypes = [],
  transmissions = [],
  value,
  onChange,
}: {
  vehicles: VehicleSearchItem[]
  statuses?: StatusItem[]
  driveTypes?: DictItem[]
  transmissions?: DictItem[]
  value: number
  onChange: (id: number) => void
}) {
  const [filtered, setFiltered] = useState(vehicles)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number>(PAGE_SIZES[0])

  useEffect(() => {
    setFiltered(vehicles)
    setPage(1)
  }, [vehicles])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const handleFilterChange = (list: VehicleSearchItem[]) => {
    setFiltered(list)
    setPage(1)
  }

  const handlePerPageChange = (size: number) => {
    setPerPage(size)
    setPage(1)
  }

  const pageList = useMemo(() => {
    const start = (page - 1) * perPage
    return filtered.slice(start, start + perPage)
  }, [filtered, page, perPage])

  const from = filtered.length === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, filtered.length)

  return (
    <div className="space-y-3">
      <VehicleSearchPanel
        vehicles={vehicles}
        statuses={statuses}
        driveTypes={driveTypes}
        transmissions={transmissions}
        variant="compact"
        showArchive={false}
        showSummary={false}
        showSort={false}
        defaultFilters={{ showArchived: false }}
        onChange={handleFilterChange}
      />
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="px-3 py-2 bg-background/50 border-b border-border flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[11px] text-textSecondary">
            {filtered.length} авто · оберіть зі списку
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-textSecondary uppercase tracking-wider">На сторінці:</span>
            {PAGE_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handlePerPageChange(n)}
                className={`min-w-[2rem] px-2 py-0.5 rounded border text-xs transition-colors ${
                  perPage === n
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-border text-textSecondary hover:border-accent/40 hover:text-textPrimary'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-border/60">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-sm text-textSecondary text-center">Нічого не знайдено</p>
          ) : (
            pageList.map((v) => {
              const selected = value === v.id
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onChange(v.id)}
                  className={`w-full px-3 py-2.5 text-left transition-colors flex items-center gap-3 ${
                    selected ? 'bg-accent/10 hover:bg-accent/15' : 'hover:bg-surfaceHover'
                  }`}
                >
                  <VehicleThumb coverPhoto={v.coverPhoto} />
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${selected ? 'text-accent' : 'text-textPrimary'}`}>
                      {v.makeAndModel}
                    </p>
                    <p className="text-xs text-textSecondary mt-0.5 flex flex-wrap gap-x-2">
                      {v.year != null && <span>{v.year}</span>}
                      {v.mileage != null && (
                        <>
                          <span>·</span>
                          <span>{v.mileage.toLocaleString('uk-UA')} км</span>
                        </>
                      )}
                      {v.status && (
                        <>
                          <span>·</span>
                          <span>{v.status}</span>
                        </>
                      )}
                      <span>·</span>
                      <span className="font-mono">{v.vin}</span>
                    </p>
                  </div>
                  {selected && <Check className="w-4 h-4 text-accent shrink-0" />}
                </button>
              )
            })
          )}
        </div>
        {filtered.length > 0 && (
          <div className="px-3 py-2.5 border-t border-border flex flex-wrap items-center justify-between gap-2 bg-background/30">
            <span className="text-xs text-textSecondary">
              {from}–{to} з {filtered.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded border border-border text-textSecondary hover:text-textPrimary hover:border-accent/40 disabled:opacity-30 transition-colors"
                aria-label="Попередня сторінка"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-textPrimary min-w-[4.5rem] text-center">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded border border-border text-textSecondary hover:text-textPrimary hover:border-accent/40 disabled:opacity-30 transition-colors"
                aria-label="Наступна сторінка"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
