'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Search, ChevronDown, X, Car, ArrowUpDown, Clipboard, Check } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'
import { vehicleComboboxHaystack, type VehicleComboboxSearchItem } from '@/lib/vehicle-search'

export type VehicleSearchOption = VehicleComboboxSearchItem & {
  imageUrl?: string | null
}

type SortField = 'label' | 'makeName' | 'modelName' | 'year' | 'mileage' | 'vin' | 'statusName' | 'notes'

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'label', label: 'Марка + модель' },
  { value: 'makeName', label: 'Марка' },
  { value: 'modelName', label: 'Модель' },
  { value: 'year', label: 'Рік' },
  { value: 'mileage', label: 'Пробіг' },
  { value: 'vin', label: 'VIN' },
  { value: 'statusName', label: 'Статус' },
  { value: 'notes', label: 'Примітки' },
]

const inputCls =
  'w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-textPrimary focus:outline-none focus:border-accent transition-colors'

function vehicleHaystack(v: VehicleSearchOption) {
  return vehicleComboboxHaystack(v)
}

function sortVehicles(list: VehicleSearchOption[], field: SortField, desc: boolean) {
  const sorted = [...list].sort((a, b) => {
    let va: string | number = ''
    let vb: string | number = ''
    switch (field) {
      case 'label': va = a.label; vb = b.label; break
      case 'makeName': va = a.makeName; vb = b.makeName; break
      case 'modelName': va = a.modelName; vb = b.modelName; break
      case 'year': va = a.year; vb = b.year; break
      case 'mileage': va = a.mileage ?? -1; vb = b.mileage ?? -1; break
      case 'vin': va = a.vin; vb = b.vin; break
      case 'statusName': va = a.statusName; vb = b.statusName; break
      case 'notes': va = a.notes ?? ''; vb = b.notes ?? ''; break
    }
    if (typeof va === 'number' && typeof vb === 'number') return va - vb
    return String(va).localeCompare(String(vb), 'uk')
  })
  return desc ? sorted.reverse() : sorted
}

function VinCopyButton({ vin }: { vin: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(vin).then(() => {
      setCopied(true)
      toast.success('VIN скопійовано')
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      onMouseDown={(e) => e.stopPropagation()}
      className="inline-flex p-0.5 text-textSecondary/50 hover:text-accent transition-colors shrink-0"
      title="Копіювати VIN"
    >
      {copied ? <Check className="w-3 h-3 text-accent" /> : <Clipboard className="w-3 h-3" />}
    </button>
  )
}

export default function VehicleSearchCombobox({
  vehicles,
  value,
  onChange,
  placeholder = 'Пошук: марка, модель, рік, пробіг, VIN, статус, примітки...',
  allowEmpty = false,
  showThumbnail = false,
}: {
  vehicles: VehicleSearchOption[]
  value: number
  onChange: (id: number) => void
  placeholder?: string
  allowEmpty?: boolean
  showThumbnail?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('label')
  const [sortDesc, setSortDesc] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected = vehicles.find((v) => v.id === value)

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    let list = vehicles
    if (tokens.length > 0) {
      list = vehicles.filter((v) => {
        const hay = vehicleHaystack(v)
        return tokens.every((t) => hay.includes(t))
      })
    }
    return sortVehicles(list, sortField, sortDesc)
  }, [vehicles, query, sortField, sortDesc])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const pick = (id: number) => {
    onChange(id)
    setQuery('')
    setOpen(false)
  }

  const showSelected = selected && !open && value !== 0

  return (
    <div ref={wrapRef} className="relative space-y-2">
      {showSelected ? (
        <div className={`${inputCls} flex items-center gap-2`}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex flex-1 items-center gap-2 text-left min-w-0 bg-transparent border-0 p-0 cursor-pointer"
          >
            {showThumbnail && selected.imageUrl ? (
              <div className="w-8 h-6 rounded overflow-hidden shrink-0 bg-border">
                <Image src={selected.imageUrl} alt="" width={32} height={24} unoptimized className="w-full h-full object-cover" />
              </div>
            ) : (
              <Car className="w-4 h-4 text-accent shrink-0" />
            )}
            <span className="flex-1 min-w-0">
              <span className="block truncate text-textPrimary">{selected.label}</span>
              <span className="block text-[11px] text-textSecondary truncate flex items-center gap-1">
                {selected.year}
                {selected.mileage != null && (
                  <> · {selected.mileage.toLocaleString('uk-UA')} км</>
                )}
                {' · '}{selected.statusName} · <span className="font-mono">{selected.vin}</span>
              </span>
            </span>
            <ChevronDown className="w-4 h-4 text-textSecondary shrink-0" />
          </button>
          <VinCopyButton vin={selected.vin} />
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textSecondary pointer-events-none" />
          <input
            autoFocus={open}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder={value === 0 && allowEmpty ? 'Всі автомобілі...' : placeholder}
            className={`${inputCls} pl-9 pr-8`}
          />
          {(query || (allowEmpty && value === 0 && open)) ? (
            <button
              type="button"
              onClick={() => { setQuery(''); if (allowEmpty) { onChange(0); setOpen(false) } else setOpen(true) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-textSecondary hover:text-textPrimary"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      )}

      {open && (
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-[11px] text-textPrimary focus:outline-none focus:border-accent"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSortDesc((d) => !d)}
              className="flex items-center gap-1 px-2 py-1.5 text-[11px] border border-border rounded text-textSecondary hover:text-accent transition-colors shrink-0"
              title={sortDesc ? 'Спадання' : 'Зростання'}
            >
              <ArrowUpDown className="w-3 h-3" />
              {sortDesc ? '↓' : '↑'}
            </button>
          </div>

          <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto bg-surface border border-border rounded-lg shadow-elevated-lg">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => pick(0)}
                className={`w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-surfaceHover border-b border-border/50 ${
                  value === 0 ? 'bg-accent/10 text-accent' : 'text-textSecondary'
                }`}
              >
                Всі автомобілі
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-xs text-textSecondary text-center">Нічого не знайдено</p>
            ) : (
              <>
                <p className="px-3 py-1.5 text-[10px] text-textSecondary border-b border-border">
                  Знайдено: {filtered.length}
                </p>
                {filtered.map((v) => (
                  <div
                    key={v.id}
                    role="option"
                    aria-selected={v.id === value}
                    tabIndex={0}
                    onClick={() => pick(v.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        pick(v.id)
                      }
                    }}
                    className={`w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-surfaceHover border-b border-border/50 last:border-0 cursor-pointer ${
                      v.id === value ? 'bg-accent/10' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {showThumbnail && v.imageUrl ? (
                        <div className="w-10 h-7 rounded overflow-hidden shrink-0 bg-border mt-0.5">
                          <Image src={v.imageUrl} alt="" width={40} height={28} unoptimized className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <Car className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${v.id === value ? 'text-accent' : 'opacity-50'}`} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium truncate ${v.id === value ? 'text-accent' : 'text-textPrimary'}`}>
                          {v.makeName} {v.modelName}
                        </p>
                        <p className="text-[11px] text-textSecondary mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 items-center">
                          <span>{v.year}</span>
                          {v.mileage != null && (
                            <>
                              <span>·</span>
                              <span className="tabular-nums">{v.mileage.toLocaleString('uk-UA')} км</span>
                            </>
                          )}
                          <span>·</span>
                          <span>{v.statusName}</span>
                          <span>·</span>
                          <span className="font-mono">{v.vin}</span>
                          <VinCopyButton vin={v.vin} />
                        </p>
                        {v.notes?.trim() && (
                          <p className="text-[10px] text-textSecondary/70 mt-0.5 line-clamp-1">{v.notes}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
