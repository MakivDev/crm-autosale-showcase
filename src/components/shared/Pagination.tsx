'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

const PER_PAGE_OPTIONS = [25, 50, 150, 300]

export default function Pagination({
  total,
  page,
  perPage,
  onPageChange,
  onPerPageChange,
  perPageOptions = PER_PAGE_OPTIONS,
}: {
  total: number
  page: number
  perPage: number
  onPageChange: (page: number) => void
  onPerPageChange: (perPage: number) => void
  perPageOptions?: number[]
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-3 border-t border-border">
      <div className="flex flex-wrap items-center gap-2 text-xs text-textSecondary">
        <span>Рядків:</span>
        <div className="flex gap-1">
          {perPageOptions.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => { onPerPageChange(n); onPageChange(1) }}
              className={`px-2 py-1 rounded border text-xs transition-colors ${
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

      <div className="flex items-center gap-3 text-xs text-textSecondary">
        <span>
          {from}–{to} з {total}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-1 rounded border border-border text-textSecondary hover:text-textPrimary hover:border-accent/40 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 py-1 rounded border border-border text-textPrimary min-w-[2rem] text-center">
            {page}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1 rounded border border-border text-textSecondary hover:text-textPrimary hover:border-accent/40 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
