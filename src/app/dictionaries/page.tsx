'use client'

import { useState, useEffect, useTransition, useCallback, useMemo } from 'react'
import {
  Plus, Pencil, Trash2, Check, X, AlertTriangle, Car, Tags, Wrench,
  CircleDot, ChevronDown, ChevronRight, BookOpen,
} from 'lucide-react'
import {
  getDictionary, addDictionaryItem, updateDictionaryItem,
  deleteDictionaryItem, forceDeleteWithReassignment,
  getAffectedVehiclesForStatus, reassignVehicleStatuses,
  type DictionaryModel,
} from '@/actions/dictionaries'
import Pagination from '@/components/shared/Pagination'
import OverlayBackdrop from '@/components/shared/OverlayBackdrop'

type Item = {
  id: number
  name: string
  position: number
  isFinal?: boolean
  makeId?: number
  Make?: { id: number; name: string }
}

type DepDetail = { model: string; field: string; label: string; count: number }
type AffectedVehicle = { id: number; vin: string; label: string }

const TABS = [
  { id: 'auto', label: 'Автомобілі', icon: Car },
  { id: 'status', label: 'Статуси', icon: CircleDot },
  { id: 'finance', label: 'Витрати', icon: Tags },
  { id: 'service', label: 'СТО', icon: Wrench },
] as const

type TabId = (typeof TABS)[number]['id']

function TabButton({ active, onClick, icon: Icon, label }: {
  active: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${
        active
          ? 'bg-accent/10 text-accent border border-accent/40 shadow-neon'
          : 'text-textSecondary hover:text-textPrimary border border-transparent'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

function RestrictModal({
  item,
  modelName,
  items,
  details,
  total,
  onConfirm,
  onClose,
  isPending,
}: {
  item: Item
  modelName: DictionaryModel
  items: Item[]
  details: DepDetail[]
  total: number
  onConfirm: (replacementId: number) => void
  onClose: () => void
  isPending: boolean
}) {
  const [replacementId, setReplacementId] = useState<number>(0)
  const [vehicles, setVehicles] = useState<AffectedVehicle[]>([])
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<Set<number>>(new Set())
  const [reassignToId, setReassignToId] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isPendingReassign, startReassignTransition] = useTransition()
  const [reassignError, setReassignError] = useState('')
  const others = items.filter((i) => i.id !== item.id)

  useEffect(() => {
    if (modelName !== 'status') return
    setIsLoading(true)
    getAffectedVehiclesForStatus(item.id).then(res => {
      if (res.success) setVehicles(res.vehicles)
      setIsLoading(false)
    })
  }, [item.id, modelName])

  const toggleVehicle = (id: number) => {
    setSelectedVehicleIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleReassignSelected = () => {
    if (!reassignToId || selectedVehicleIds.size === 0) return
    setReassignError('')
    startReassignTransition(async () => {
      const res = await reassignVehicleStatuses(Array.from(selectedVehicleIds), reassignToId)
      if (res.success) {
        setVehicles(prev => prev.filter(v => !selectedVehicleIds.has(v.id)))
        setSelectedVehicleIds(new Set())
      } else {
        setReassignError(res.error ?? 'Помилка')
      }
    })
  }

  if (modelName === 'status') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <OverlayBackdrop onDismiss={onClose} className="absolute inset-0 bg-black/70" />
        <div className="relative bg-surface border border-amber-500/30 rounded-xl w-full max-w-lg shadow-elevated max-h-[90vh] flex flex-col">
          <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <h3 className="font-semibold text-textPrimary">Перенесіть авто перед видаленням</h3>
              <p className="text-xs text-textSecondary">«{item.name}» — {vehicles.length} авто з цим статусом</p>
            </div>
            <button onClick={onClose} className="ml-auto text-textSecondary hover:text-textPrimary">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={reassignToId}
                onChange={e => setReassignToId(Number(e.target.value))}
                className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent"
              >
                <option value={0}>Перенести до статусу...</option>
                {others.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <button
                onClick={handleReassignSelected}
                disabled={isPendingReassign || !reassignToId || selectedVehicleIds.size === 0}
                className="px-3 py-2 bg-accent/10 border border-accent text-accent text-xs rounded hover:bg-accent hover:text-accentOn transition-all disabled:opacity-40"
              >
                {isPendingReassign ? 'Переносимо...' : `Перенести (${selectedVehicleIds.size})`}
              </button>
            </div>

            {reassignError && <p className="text-xs text-red-400">{reassignError}</p>}

            {isLoading ? (
              <p className="text-sm text-textSecondary text-center py-6">Завантаження...</p>
            ) : vehicles.length === 0 ? (
              <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-sm text-emerald-400 text-center">
                Всі авто перенесені. Тепер можна видалити статус.
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="select-all-vehicles"
                    checked={selectedVehicleIds.size === vehicles.length && vehicles.length > 0}
                    onChange={e => {
                      if (e.target.checked) setSelectedVehicleIds(new Set(vehicles.map(v => v.id)))
                      else setSelectedVehicleIds(new Set())
                    }}
                    className="w-3.5 h-3.5 accent-cyan-400"
                  />
                  <label htmlFor="select-all-vehicles" className="text-xs text-textSecondary cursor-pointer">
                    Вибрати всі ({vehicles.length})
                  </label>
                </div>
                {vehicles.map(v => (
                  <label
                    key={v.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-background border border-border hover:border-accent/30 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedVehicleIds.has(v.id)}
                      onChange={() => toggleVehicle(v.id)}
                      className="w-3.5 h-3.5 accent-cyan-400 shrink-0"
                    />
                    <Car className="w-3.5 h-3.5 text-accent/60 shrink-0" />
                    <span className="text-sm text-textPrimary">{v.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-border flex gap-2 shrink-0">
            <button
              onClick={() => onConfirm(0)}
              disabled={isPending || vehicles.length > 0}
              className="flex-1 bg-red-500/10 border border-red-500 text-red-400 py-2 rounded text-sm font-medium hover:bg-red-500 hover:text-white transition-all disabled:opacity-40"
            >
              {isPending ? 'Видалення...' : 'Видалити статус'}
            </button>
            <button onClick={onClose} className="px-4 py-2 border border-border text-textSecondary rounded text-sm hover:text-textPrimary">
              Скасувати
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <OverlayBackdrop onDismiss={onClose} className="absolute inset-0 bg-black/70" />
      <div className="relative bg-surface border border-amber-500/30 rounded-xl w-full max-w-sm shadow-elevated">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <h3 className="font-semibold text-textPrimary">Запис використовується</h3>
            <p className="text-xs text-textSecondary">Спочатку оберіть заміну</p>
          </div>
          <button onClick={onClose} className="ml-auto text-textSecondary hover:text-textPrimary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-1">
            <p className="text-sm text-textPrimary font-medium">
              «{item.name}» — {total} пов&apos;язаних записів:
            </p>
            {details.map((d) => (
              <p key={d.label} className="text-xs text-textSecondary">
                • {d.count} {d.label}
              </p>
            ))}
          </div>

          <div>
            <label className="block text-xs text-textSecondary mb-1.5">Замінити на</label>
            <select
              value={replacementId}
              onChange={(e) => setReplacementId(Number(e.target.value))}
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent"
            >
              <option value={0}>Оберіть замінник...</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          <p className="text-xs text-textSecondary/60">
            Усі записи будуть оновлені, після чого «{item.name}» буде видалено.
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => replacementId && onConfirm(replacementId)}
              disabled={isPending || !replacementId}
              className="flex-1 bg-amber-500/10 border border-amber-500 text-amber-400 py-2 rounded text-sm font-medium hover:bg-amber-500 hover:text-black transition-all disabled:opacity-40"
            >
              {isPending ? 'Замінюємо...' : 'Замінити та видалити'}
            </button>
            <button onClick={onClose} className="px-4 py-2 border border-border text-textSecondary rounded text-sm hover:text-textPrimary">
              Скасувати
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DictRow({
  item,
  modelName,
  onSaved,
  onDeleteRequest,
  indent = false,
}: {
  item: Item
  modelName: DictionaryModel
  onSaved: () => void
  onDeleteRequest: (item: Item) => void
  indent?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const [isFinal, setIsFinal] = useState(item.isFinal ?? false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const handleSave = () => {
    if (!name.trim()) return setError('Введіть назву')
    startTransition(async () => {
      const data: Record<string, unknown> = { name: name.trim() }
      if (modelName === 'status') data.isFinal = isFinal
      const res = await updateDictionaryItem(modelName, item.id, data)
      if (res.success) { setEditing(false); setError(''); onSaved() }
      else setError(res.error ?? 'Помилка')
    })
  }

  if (!editing) {
    return (
      <div className={`flex items-center gap-2 px-4 py-2.5 hover:bg-surfaceHover group ${indent ? 'pl-10' : ''}`}>
        <span className="flex-1 text-sm text-textPrimary">{item.name}</span>
        {modelName === 'status' && item.isFinal && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Архівний
          </span>
        )}
        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => setEditing(true)} className="p-1 text-textSecondary hover:text-accent transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDeleteRequest(item)} className="p-1 text-textSecondary hover:text-red-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`px-4 py-2.5 bg-accent/5 border-y border-accent/20 space-y-2 ${indent ? 'pl-10' : ''}`}>
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
          className="flex-1 bg-background border border-border rounded px-3 py-1.5 text-sm text-textPrimary focus:outline-none focus:border-accent"
        />
        <button onClick={handleSave} disabled={isPending} className="p-1.5 text-accent hover:text-accent/80">
          <Check className="w-4 h-4" />
        </button>
        <button onClick={() => { setEditing(false); setError('') }} className="p-1.5 text-textSecondary hover:text-textPrimary">
          <X className="w-4 h-4" />
        </button>
      </div>
      {modelName === 'status' && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isFinal}
            onChange={(e) => setIsFinal(e.target.checked)}
            className="w-3.5 h-3.5 accent-emerald-400"
          />
          <span className="text-xs text-textSecondary">Архівний статус — авто зникає з активного списку</span>
        </label>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

function AddRow({
  modelName,
  nextPosition,
  makeId,
  placeholder,
  onAdded,
  onCancel,
}: {
  modelName: DictionaryModel
  nextPosition: number
  makeId?: number
  placeholder?: string
  onAdded: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [isFinal, setIsFinal] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const handleAdd = () => {
    if (!name.trim()) return setError('Введіть назву')
    startTransition(async () => {
      const data: Record<string, unknown> = { name: name.trim(), position: nextPosition }
      if (modelName === 'status') data.isFinal = isFinal
      if (modelName === 'model' && makeId) data.makeId = makeId
      const res = await addDictionaryItem(modelName, data)
      if (res.success) { onAdded(); onCancel() }
      else setError(res.error ?? 'Помилка')
    })
  }

  return (
    <div className="px-4 py-2.5 bg-accent/5 border-t border-accent/20 space-y-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder ?? 'Назва...'}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') onCancel() }}
          className="flex-1 bg-background border border-border rounded px-3 py-1.5 text-sm text-textPrimary placeholder:text-textSecondary/40 focus:outline-none focus:border-accent"
        />
        <button onClick={handleAdd} disabled={isPending} className="p-1.5 text-accent hover:text-accent/80">
          <Check className="w-4 h-4" />
        </button>
        <button onClick={onCancel} className="p-1.5 text-textSecondary hover:text-textPrimary">
          <X className="w-4 h-4" />
        </button>
      </div>
      {modelName === 'status' && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} className="w-3.5 h-3.5 accent-emerald-400" />
          <span className="text-xs text-textSecondary">Архівний статус</span>
        </label>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

function useDeleteHandler(modelName: DictionaryModel, items: Item[], onRefresh: () => void) {
  const [restrictModal, setRestrictModal] = useState<{
    item: Item
    total: number
    details: DepDetail[]
  } | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleDeleteRequest = (item: Item) => {
    startTransition(async () => {
      const res = await deleteDictionaryItem(modelName, item.id)
      if (res.success) {
        onRefresh()
      } else if (res.error === 'RESTRICT') {
        setRestrictModal({
          item,
          total: (res as { total?: number }).total ?? 0,
          details: ((res as { details?: DepDetail[] }).details ?? []) as DepDetail[],
        })
      }
    })
  }

  const handleForceDelete = (replacementId: number) => {
    if (!restrictModal) return
    startTransition(async () => {
      let res
      if (modelName === 'status' && replacementId === 0) {
        res = await deleteDictionaryItem(modelName, restrictModal.item.id)
      } else {
        res = await forceDeleteWithReassignment(modelName, restrictModal.item.id, replacementId)
      }
      if (res.success) { setRestrictModal(null); onRefresh() }
    })
  }

  const modal = restrictModal ? (
    <RestrictModal
      item={restrictModal.item}
      modelName={modelName}
      items={items}
      details={restrictModal.details}
      total={restrictModal.total}
      onConfirm={handleForceDelete}
      onClose={() => setRestrictModal(null)}
      isPending={isPending}
    />
  ) : null

  return { handleDeleteRequest, modal }
}

function DictSection({
  title,
  description,
  modelName,
  items,
  onRefresh,
}: {
  title: string
  description: string
  modelName: DictionaryModel
  items: Item[]
  onRefresh: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const { handleDeleteRequest, modal } = useDeleteHandler(modelName, items, onRefresh)

  useEffect(() => {
    setPage(1)
  }, [items.length, modelName])

  const pagedItems = useMemo(() => {
    const start = (page - 1) * perPage
    return items.slice(start, start + perPage)
  }, [items, page, perPage])

  return (
    <>
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-surfaceHover">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-textPrimary">{title}</h2>
              <p className="text-xs text-textSecondary mt-0.5 leading-relaxed">{description}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-textSecondary/50 tabular-nums">{items.length}</span>
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Додати
              </button>
            </div>
          </div>
        </div>

        <div className="divide-y divide-border">
          {items.length === 0 && !adding && (
            <p className="px-4 py-5 text-sm text-textSecondary text-center">Поки порожньо — додайте перший запис</p>
          )}
          {pagedItems.map((item) => (
            <DictRow
              key={item.id}
              item={item}
              modelName={modelName}
              onSaved={onRefresh}
              onDeleteRequest={handleDeleteRequest}
            />
          ))}
        </div>

        {items.length > perPage && (
          <div className="px-4 py-3 border-t border-border">
            <Pagination
              total={items.length}
              page={page}
              perPage={perPage}
              onPageChange={setPage}
              onPerPageChange={(n) => { setPerPage(n); setPage(1) }}
            />
          </div>
        )}

        {adding && (
          <AddRow
            modelName={modelName}
            nextPosition={(items[items.length - 1]?.position ?? 0) + 1}
            onAdded={onRefresh}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
      {modal}
    </>
  )
}

function MakesModelsSection({
  makes,
  models,
  onRefresh,
}: {
  makes: Item[]
  models: Item[]
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(makes.map(m => m.id)))
  const [addingMake, setAddingMake] = useState(false)
  const [addingModelFor, setAddingModelFor] = useState<number | null>(null)
  const [editingMakeId, setEditingMakeId] = useState<number | null>(null)
  const [editingMakeName, setEditingMakeName] = useState('')
  const [isPendingMake, startMakeTransition] = useTransition()
  const { handleDeleteRequest: handleDeleteMake, modal: makeModal } = useDeleteHandler('make', makes, onRefresh)
  const { handleDeleteRequest: handleDeleteModel, modal: modelModal } = useDeleteHandler('model', models, onRefresh)

  const modelsByMake = useMemo(() => {
    const map = new Map<number, Item[]>()
    for (const m of models) {
      const makeId = m.makeId ?? m.Make?.id
      if (!makeId) continue
      const list = map.get(makeId) ?? []
      list.push(m)
      map.set(makeId, list)
    }
    return map
  }, [models])

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const saveMakeName = (makeId: number) => {
    if (!editingMakeName.trim()) return
    startMakeTransition(async () => {
      const res = await updateDictionaryItem('make', makeId, { name: editingMakeName.trim() })
      if (res.success) { setEditingMakeId(null); onRefresh() }
    })
  }

  return (
    <>
      <div className="bg-surface border border-border rounded-lg overflow-hidden lg:col-span-2">
        <div className="px-4 py-3 border-b border-border bg-surfaceHover">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-textPrimary">Марки та моделі</h2>
              <p className="text-xs text-textSecondary mt-0.5 leading-relaxed">
                Спочатку додайте марку (Toyota, BMW…), потім моделі під нею. Використовується при створенні картки авто.
              </p>
            </div>
            <button
              onClick={() => setAddingMake(true)}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> Марка
            </button>
          </div>
        </div>

        {makes.length === 0 && !addingMake ? (
          <p className="px-4 py-8 text-sm text-textSecondary text-center">
            Додайте першу марку — наприклад Toyota або BMW
          </p>
        ) : (
          <div className="divide-y divide-border">
            {makes.map(make => {
              const makeModels = modelsByMake.get(make.id) ?? []
              const isOpen = expanded.has(make.id)
              return (
                <div key={make.id}>
                  {editingMakeId === make.id ? (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-accent/5 border-y border-accent/20">
                      <input
                        autoFocus
                        value={editingMakeName}
                        onChange={e => setEditingMakeName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveMakeName(make.id)
                          if (e.key === 'Escape') setEditingMakeId(null)
                        }}
                        className="flex-1 bg-background border border-border rounded px-3 py-1.5 text-sm text-textPrimary focus:outline-none focus:border-accent"
                      />
                      <button onClick={() => saveMakeName(make.id)} disabled={isPendingMake} className="p-1.5 text-accent">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingMakeId(null)} className="p-1.5 text-textSecondary">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                  <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-surfaceHover group">
                    <button
                      onClick={() => toggle(make.id)}
                      className="p-0.5 text-textSecondary hover:text-accent transition-colors"
                    >
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <span className="flex-1 text-sm font-medium text-textPrimary">{make.name}</span>
                    <span className="text-xs text-textSecondary/50">{makeModels.length} мод.</span>
                    <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditingMakeId(make.id); setEditingMakeName(make.name) }}
                        className="p-1 text-textSecondary hover:text-accent transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setAddingModelFor(make.id); setExpanded(prev => new Set(prev).add(make.id)) }}
                        className="p-1 text-textSecondary hover:text-accent transition-colors"
                        title="Додати модель"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteMake(make)} className="p-1 text-textSecondary hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  )}

                  {isOpen && editingMakeId !== make.id && (
                    <div className="bg-background/40 border-t border-border/50">
                      {makeModels.length === 0 && addingModelFor !== make.id && (
                        <p className="px-10 py-3 text-xs text-textSecondary">Немає моделей — натисніть +</p>
                      )}
                      {makeModels.map(model => (
                        <DictRow
                          key={model.id}
                          item={model}
                          modelName="model"
                          onSaved={onRefresh}
                          onDeleteRequest={handleDeleteModel}
                          indent
                        />
                      ))}
                      {addingModelFor === make.id && (
                        <div className="pl-6">
                          <AddRow
                            modelName="model"
                            makeId={make.id}
                            nextPosition={(makeModels[makeModels.length - 1]?.position ?? 0) + 1}
                            placeholder="Назва моделі..."
                            onAdded={onRefresh}
                            onCancel={() => setAddingModelFor(null)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {addingMake && (
          <AddRow
            modelName="make"
            nextPosition={(makes[makes.length - 1]?.position ?? 0) + 1}
            placeholder="Назва марки..."
            onAdded={onRefresh}
            onCancel={() => setAddingMake(false)}
          />
        )}
      </div>
      {makeModal}
      {modelModal}
    </>
  )
}

type DictState = {
  statuses: Item[]
  expenseCategories: Item[]
  repairTypes: Item[]
  damageTypes: Item[]
  makes: Item[]
  models: Item[]
  fuelTypes: Item[]
  driveTypes: Item[]
  transmissions: Item[]
  purchaseCountries: Item[]
}

export default function DictionariesPage() {
  const [tab, setTab] = useState<TabId>('auto')
  const [data, setData] = useState<DictState>({
    statuses: [], expenseCategories: [], repairTypes: [],
    damageTypes: [], makes: [], models: [],
    fuelTypes: [], driveTypes: [], transmissions: [], purchaseCountries: [],
  })

  const load = useCallback(async () => {
    const [
      statusRes, expRes, repairRes, damageRes,
      makeRes, modelRes, fuelRes, driveRes, transRes, countryRes,
    ] = await Promise.all([
      getDictionary('status'),
      getDictionary('expenseCategory'),
      getDictionary('repairType'),
      getDictionary('damageType'),
      getDictionary('make'),
      getDictionary('model'),
      getDictionary('fuelType'),
      getDictionary('driveType'),
      getDictionary('transmission'),
      getDictionary('purchaseCountry'),
    ])

    setData({
      statuses:          (statusRes.data as Item[]) ?? [],
      expenseCategories: (expRes.data as Item[]) ?? [],
      repairTypes:       (repairRes.data as Item[]) ?? [],
      damageTypes:       (damageRes.data as Item[]) ?? [],
      makes:             (makeRes.data as Item[]) ?? [],
      models:            (modelRes.data as Item[]) ?? [],
      fuelTypes:         (fuelRes.data as Item[]) ?? [],
      driveTypes:        (driveRes.data as Item[]) ?? [],
      transmissions:     (transRes.data as Item[]) ?? [],
      purchaseCountries: (countryRes.data as Item[]) ?? [],
    })
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-bold tracking-tight text-textPrimary">Довідники</h1>
        </div>
        <p className="text-sm text-textSecondary max-w-2xl">
          Списки значень для форм у CRM. Зміни тут одразу з&apos;являються при створенні авто, транзакцій та ремонтів.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(t => (
          <TabButton
            key={t.id}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
            icon={t.icon}
            label={t.label}
          />
        ))}
      </div>

      {tab === 'auto' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <MakesModelsSection makes={data.makes} models={data.models} onRefresh={load} />
          <DictSection
            title="Країни купівлі"
            description="Звідки закуповується авто — США, Європа, Корея тощо. Поле обов'язкове при додаванні авто."
            modelName="purchaseCountry"
            items={data.purchaseCountries}
            onRefresh={load}
          />
          <DictSection
            title="Типи палива"
            description="Бензин, дизель, гібрид, електро — для картки авто."
            modelName="fuelType"
            items={data.fuelTypes}
            onRefresh={load}
          />
          <DictSection
            title="Типи приводу"
            description="Передній, задній, повний — для картки авто."
            modelName="driveType"
            items={data.driveTypes}
            onRefresh={load}
          />
          <DictSection
            title="Трансмісії"
            description="Автомат, механіка, варіатор — для картки авто."
            modelName="transmission"
            items={data.transmissions}
            onRefresh={load}
          />
        </div>
      )}

      {tab === 'status' && (
        <div className="space-y-5 max-w-2xl">
          <div className="p-4 rounded-lg bg-accent/5 border border-accent/20 text-sm text-textSecondary leading-relaxed">
            <strong className="text-textPrimary">Статуси</strong> — етапи життєвого циклу авто: куплено, в дорозі, на митниці, продано.
            Статус з позначкою <span className="text-emerald-400">Архівний</span> прибирає авто з активного списку.
          </div>
          <DictSection
            title="Статуси авто"
            description="Порядок у списку = порядок у воронці. Редагуйте назви під свій бізнес-процес."
            modelName="status"
            items={data.statuses}
            onRefresh={load}
          />
        </div>
      )}

      {tab === 'finance' && (
        <div className="space-y-5 max-w-2xl">
          <div className="p-4 rounded-lg bg-accent/5 border border-accent/20 text-sm text-textSecondary leading-relaxed">
            <strong className="text-textPrimary">Категорії витрат</strong> — для розбивки транзакцій у модулі «Фінанси»
            (купівля авто, розмитнення, ремонт, логістика тощо).
          </div>
          <DictSection
            title="Категорії витрат"
            description="Використовуються при додаванні витрат і доходів. Мапінг за замовчуванням — у Налаштуваннях."
            modelName="expenseCategory"
            items={data.expenseCategories}
            onRefresh={load}
          />
        </div>
      )}

      {tab === 'service' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <DictSection
            title="Типи ремонту"
            description="Види ремонтних робіт — кузов, підвіска, електрика. Використовується в секції ремонтів на картці авто."
            modelName="repairType"
            items={data.repairTypes}
            onRefresh={load}
          />
          <DictSection
            title="Типи пошкоджень"
            description="Класифікація пошкоджень на картці авто — подряпини, вм'ятини, фарба."
            modelName="damageType"
            items={data.damageTypes}
            onRefresh={load}
          />
        </div>
      )}
    </div>
  )
}
