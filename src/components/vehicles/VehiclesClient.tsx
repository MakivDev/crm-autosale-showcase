'use client'

import { useState, useTransition, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Plus, X, ChevronDown, ShieldCheck, Check,
  Image as ImageIcon, Car, DollarSign,
  LayoutGrid, List, AlertTriangle, History, Download, Wrench,
} from 'lucide-react'
import VehicleWorkModal from '@/components/vehicles/VehicleWorkModal'
import { notifyCrmRefresh } from '@/lib/crm-refresh'
import { useCrmRefresh } from '@/hooks/useCrmRefresh'
import type { CashRegisterOption } from '@/lib/currency'
import VehicleSearchPanel from '@/components/shared/VehicleSearchPanel'
import type { VehicleSearchItem } from '@/lib/vehicle-search'
import {
  DEFAULT_VEHICLE_SEARCH_FILTERS,
  filterAndSortVehicles,
  hasActiveVehicleSearchFilters,
} from '@/lib/vehicle-search'
import InlineAdd from '@/components/shared/InlineAdd'
import { toast } from 'sonner'
import OverlayBackdrop from '@/components/shared/OverlayBackdrop'
import OverlayPortal from '@/components/shared/OverlayPortal'
import {
  createVehicle,
  createMakeEntry, createModelEntry, createStatusEntry,
  createFuelTypeEntry, createDriveTypeEntry, createTransmissionEntry,
  createPurchaseCountryEntry,
  getCashRegistersForVehicleExpense,
  bulkChangeVehicleStatus,
} from '@/actions/vehicles'
import { createNotification, clearNewVehicleDraftNotifications } from '@/actions/notifications'
import { SYSTEM_STATUS_SLUGS, statusRequiresTransitData, canBulkChangeToStatus } from '@/lib/system-statuses'
import Pagination from '@/components/shared/Pagination'
import { useHasPermission } from '@/contexts/PermissionsContext'
import {
  defaultRateForRegister,
  rateLabelForRegister,
  formatRateHint,
  registerAmountToUsd,
  formatUsdEquivalent,
  type MonthRates,
} from '@/lib/currency'
import DateInput from '@/components/shared/DateInput'
import { localTodayIso } from '@/lib/format-datetime'

type Make = { id: number; name: string }
type Model = { id: number; name: string; makeId: number }
type Status = { id: number; name: string; isFinal: boolean; systemSlug?: string | null }
type CashRegister = { id: number; name: string; balance: number; currencyCode: string }
type FuelType = { id: number; name: string }
type DriveType = { id: number; name: string }
type Transmission = { id: number; name: string }
type PurchaseCountry = { id: number; name: string }

type Props = {
  vehicles: VehicleSearchItem[]
  makes: Make[]
  models: Model[]
  statuses: Status[]
  fuelTypes: FuelType[]
  driveTypes: DriveType[]
  transmissions: Transmission[]
  purchaseCountries: PurchaseCountry[]
  paymentRates: MonthRates
  repairTypes: { id: number; name: string }[]
  expenseCategories: { id: number; name: string }[]
  paymentRegisters: CashRegisterOption[]
  userDefaultRegisterId?: number | null
}

const BULK_EXPORT_COLUMNS = [
  { key: 'vin', label: 'VIN' },
  { key: 'makeName', label: 'Марка' },
  { key: 'modelName', label: 'Модель' },
  { key: 'year', label: 'Рік' },
  { key: 'mileage', label: 'Пробіг (км)' },
  { key: 'status', label: 'Статус' },
  { key: 'purchaseCountry', label: 'Країна купівлі' },
  { key: 'price', label: 'Собівартість ($)' },
  { key: 'notes', label: 'Нотатки' },
  { key: 'createdAt', label: 'Дата додавання' },
]

function BulkExportModal({ vehicles, onClose }: { vehicles: VehicleSearchItem[]; onClose: () => void }) {
  const [selected, setSelected] = useState(new Set(BULK_EXPORT_COLUMNS.map(c => c.key)))

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleExport = () => {
    const cols = BULK_EXPORT_COLUMNS.filter(c => selected.has(c.key))
    const headers = cols.map(c => c.label)
    const rows = vehicles.map(v =>
      cols.map(c => {
        if (c.key === 'vin') return v.vin
        if (c.key === 'makeName') return v.makeName
        if (c.key === 'modelName') return v.modelName
        if (c.key === 'year') return v.year != null ? String(v.year) : ''
        if (c.key === 'mileage') return v.mileage != null ? String(v.mileage) : ''
        if (c.key === 'status') return v.status ?? ''
        if (c.key === 'purchaseCountry') return v.purchaseCountry ?? ''
        if (c.key === 'price') return (v.price ?? 0).toFixed(2)
        if (c.key === 'notes') return v.notes ?? ''
        if (c.key === 'createdAt') return v.createdAt ? new Date(v.createdAt).toLocaleDateString('uk-UA') : ''
        return ''
      })
    )
    const sep = ';'
    const csv = [headers, ...rows].map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(sep)).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vehicles_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <OverlayBackdrop onDismiss={onClose} className="absolute inset-0 bg-black/70" />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-sm shadow-elevated">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-textPrimary flex items-center gap-2">
            <Download className="w-4 h-4 text-accent" /> Експорт ({vehicles.length} авто)
          </h3>
          <button onClick={onClose} className="text-textSecondary hover:text-textPrimary"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-textSecondary">Оберіть колонки для включення в CSV:</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSelected(new Set(BULK_EXPORT_COLUMNS.map(c => c.key)))} className="text-[10px] text-accent hover:underline">Вибрати всі</button>
              <button type="button" onClick={() => setSelected(new Set())} className="text-[10px] text-textSecondary hover:underline">Зняти всі</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {BULK_EXPORT_COLUMNS.map(c => (
              <label key={c.key} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={selected.has(c.key)}
                  onChange={() => toggle(c.key)}
                  className="w-3.5 h-3.5 accent-cyan-400"
                />
                <span className="text-xs text-textSecondary group-hover:text-textPrimary transition-colors">{c.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-2">
          <button
            onClick={handleExport}
            disabled={selected.size === 0}
            className="flex-1 flex items-center justify-center gap-1.5 bg-accent text-background py-2 rounded-md text-sm font-semibold hover:bg-accent/90 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" /> Завантажити CSV
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-border text-textSecondary rounded-md text-sm hover:text-textPrimary transition-colors">Скасувати</button>
        </div>
      </div>
    </div>
  )
}

const EMPTY_FORM = {
  vin: '',
  makeId: 0,
  modelId: 0,
  fuelTypeId: 0,
  driveTypeId: 0,
  transmissionId: 0,
  manufactureYear: 0,
  engineVolume: '',
  mileage: '',
  currentStatusId: 0,
  purchaseCountryId: 0,
  containerNumber: '',
  lotUrl: '',
  deliveryCost: '',
  estimatedDeliveryDate: '',
  notes: '',
  purchaseAmount: '',
  purchaseRegisterId: 0,
  saleAmount: '',
  saleRegisterId: 0,
  saleDate: localTodayIso(),
  buyerName: '',
  buyerPhone: '',
}

type UploadItem = { file: File; isCover: boolean; kind: 'photo' | 'doc' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-textSecondary uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent transition-colors'

function dictNamesEqual(a: string, b: string) {
  return a.trim().localeCompare(b.trim(), 'uk', { sensitivity: 'accent' }) === 0
}

export default function VehiclesClient({
  vehicles: initialVehicles,
  makes: initialMakes,
  models: initialModels,
  statuses: initialStatuses,
  fuelTypes: initialFuelTypes,
  driveTypes: initialDriveTypes,
  transmissions: initialTransmissions,
  purchaseCountries: initialPurchaseCountries,
  paymentRates,
  repairTypes,
  expenseCategories,
  paymentRegisters,
  userDefaultRegisterId,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const canCreate = useHasPermission('vehicles.create')
  const canChangeStatus = useHasPermission('vehicles.status')
  const canExport = useHasPermission('reports.export')
  const canCreateRepair = useHasPermission('repair.create')
  const canCreateExpense = useHasPermission('finance.create')
  const canBulkSelect = canChangeStatus || canExport
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [isPending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showCloseGuard, setShowCloseGuard] = useState(false)
  const [draftBanner, setDraftBanner] = useState<{ label: string; savedAt: string } | null>(null)

  const [makes, setMakes] = useState(initialMakes)
  const [models, setModels] = useState(initialModels)
  const [statuses, setStatuses] = useState(initialStatuses)
  const [fuelTypes, setFuelTypes] = useState(initialFuelTypes)
  const [driveTypes, setDriveTypes] = useState(initialDriveTypes)
  const [transmissions, setTransmissions] = useState(initialTransmissions)
  const [purchaseCountries, setPurchaseCountries] = useState(initialPurchaseCountries)

  type PendingItem = { tempId: number; name: string }
  type PendingModel = { tempId: number; name: string; makeId: number }
  const [pendingMakes, setPendingMakes] = useState<PendingItem[]>([])
  const [pendingModels, setPendingModels] = useState<PendingModel[]>([])
  const [pendingFuelTypes, setPendingFuelTypes] = useState<PendingItem[]>([])
  const [pendingDriveTypes, setPendingDriveTypes] = useState<PendingItem[]>([])
  const [pendingTransmissions, setPendingTransmissions] = useState<PendingItem[]>([])
  const [pendingStatuses, setPendingStatuses] = useState<PendingItem[]>([])
  const [pendingPurchaseCountries, setPendingPurchaseCountries] = useState<PendingItem[]>([])
  const tempIdRef = useRef(-1)
  const nextTempId = () => { tempIdRef.current -= 1; return tempIdRef.current }
  const makeTempRef = useRef<number | null>(null)
  const modelTempRef = useRef<number | null>(null)
  const fuelTempRef = useRef<number | null>(null)
  const driveTempRef = useRef<number | null>(null)
  const transmissionTempRef = useRef<number | null>(null)
  const statusTempRef = useRef<number | null>(null)
  const countryTempRef = useRef<number | null>(null)
  const restoredFromDraftRef = useRef(false)

  const [displayed, setDisplayed] = useState<VehicleSearchItem[]>(() =>
    filterAndSortVehicles(initialVehicles, DEFAULT_VEHICLE_SEARCH_FILTERS)
  )
  const [searchActive, setSearchActive] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [vPage, setVPage] = useState(1)
  const [vPerPage, setVPerPage] = useState(50)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkStatusId, setBulkStatusId] = useState(0)
  const [bulkError, setBulkError] = useState('')
  const [showBulkExportModal, setShowBulkExportModal] = useState(false)
  const [workModalVehicleId, setWorkModalVehicleId] = useState<number | null>(null)

  const coverInputRef = useRef<HTMLInputElement>(null)
  const photosInputRef = useRef<HTMLInputElement>(null)
  const docsInputRef = useRef<HTMLInputElement>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [docFiles, setDocFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [postCreateUpload, setPostCreateUpload] = useState<{
    vehicleId: number
    failed: (UploadItem & { error: string })[]
  } | null>(null)
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([])
  const [purchaseRate, setPurchaseRate] = useState('')
  const [purchaseRateTouched, setPurchaseRateTouched] = useState(false)
  const [saleRate, setSaleRate] = useState('')
  const [saleRateTouched, setSaleRateTouched] = useState(false)

  const filteredModels = useMemo(
    () => models.filter((m) => m.makeId === form.makeId),
    [models, form.makeId]
  )

  const createStatuses = useMemo(
    () => statuses.filter((s) => !s.isFinal && s.systemSlug !== SYSTEM_STATUS_SLUGS.SOLD),
    [statuses]
  )
  const bulkableStatuses = useMemo(
    () => statuses.filter((s) => !s.isFinal && canBulkChangeToStatus(s.systemSlug)),
    [statuses]
  )

  const pagedVehicles = useMemo(() => {
    const start = (vPage - 1) * vPerPage
    return displayed.slice(start, start + vPerPage)
  }, [displayed, vPage, vPerPage])

  useEffect(() => {
    const saved = localStorage.getItem('draft_new_vehicle')
    if (saved) {
      try {
        const { label, savedAt } = JSON.parse(saved)
        setDraftBanner({ label, savedAt })
      } catch {
        localStorage.removeItem('draft_new_vehicle')
      }
    }
  }, [])

  useEffect(() => {
    if (searchParams.get('restoreDraft') !== '1') return
    const saved = localStorage.getItem('draft_new_vehicle')
    if (!saved) {
      router.replace('/vehicles')
      return
    }
    try {
      const { form: savedForm } = JSON.parse(saved)
      setForm(savedForm)
      setDraftBanner(null)
      restoredFromDraftRef.current = true
      setDrawerOpen(true)
    } catch {
      localStorage.removeItem('draft_new_vehicle')
    }
    router.replace('/vehicles')
  }, [searchParams, router])

  const clearVehicleDraft = async () => {
    localStorage.removeItem('draft_new_vehicle')
    restoredFromDraftRef.current = false
    await clearNewVehicleDraftNotifications()
    notifyCrmRefresh('notifications')
    notifyCrmRefresh('topbar')
  }

  const syncDraftBannerFromStorage = () => {
    const saved = localStorage.getItem('draft_new_vehicle')
    if (!saved) {
      setDraftBanner(null)
      return
    }
    try {
      const { label, savedAt } = JSON.parse(saved)
      setDraftBanner({ label, savedAt })
    } catch {
      localStorage.removeItem('draft_new_vehicle')
      setDraftBanner(null)
    }
  }

  useCrmRefresh(syncDraftBannerFromStorage, { scope: 'notifications', intervalMs: 0 })

  useEffect(() => {
    if (drawerOpen && cashRegisters.length === 0) {
      getCashRegistersForVehicleExpense().then((r) => {
        if (r.success && r.data) setCashRegisters(r.data)
      })
    }
  }, [drawerOpen, cashRegisters.length])

  useEffect(() => {
    if (!drawerOpen || form.purchaseRegisterId > 0 || cashRegisters.length === 0) return
    const regId =
      userDefaultRegisterId && cashRegisters.some((r) => r.id === userDefaultRegisterId)
        ? userDefaultRegisterId
        : cashRegisters[0]?.id ?? 0
    if (regId > 0) set('purchaseRegisterId', regId)
  }, [drawerOpen, cashRegisters, userDefaultRegisterId, form.purchaseRegisterId])

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allDisplayedSelected = displayed.length > 0 && selectedIds.size === displayed.length

  const toggleSelectAll = () => {
    if (allDisplayedSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(displayed.map(v => v.id)))
    }
  }

  const selectAllDisplayed = () => setSelectedIds(new Set(displayed.map(v => v.id)))

  const handleBulkStatus = () => {
    if (!bulkStatusId || selectedIds.size === 0) return
    setBulkError('')
    startTransition(async () => {
      const res = await bulkChangeVehicleStatus(Array.from(selectedIds), bulkStatusId)
      if (res.success) {
        setSelectedIds(new Set())
        setBulkStatusId(0)
        router.refresh()
      } else {
        setBulkError(res.error ?? 'Помилка')
      }
    })
  }

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }))

  const handleMakeChange = (makeId: number) => {
    const firstModel = models.find((m) => m.makeId === makeId)
    setForm((f) => ({ ...f, makeId, modelId: firstModel?.id ?? 0 }))
  }

  const clearErr = (key: string) => setErrors((p) => { const n = { ...p }; delete n[key]; return n })

  const upsertPendingMake = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      if (makeTempRef.current !== null) {
        makeTempRef.current = null
        modelTempRef.current = null
        setPendingMakes([])
        setPendingModels([])
        setMakes(initialMakes)
        setModels(initialModels)
        setForm((f) => ({ ...f, makeId: 0, modelId: 0 }))
      }
      return
    }

    const existingMake = initialMakes.find((m) => dictNamesEqual(m.name, trimmed))
    if (existingMake) {
      makeTempRef.current = null
      modelTempRef.current = null
      setPendingMakes([])
      setPendingModels([])
      setMakes(initialMakes)
      setModels(initialModels)
      setForm((f) => ({ ...f, makeId: existingMake.id, modelId: 0 }))
      clearErr('makeId')
      return
    }

    const wasExisting = form.makeId >= 0 && makeTempRef.current === null
    let tempId = makeTempRef.current
    if (tempId === null) tempId = form.makeId < 0 ? form.makeId : nextTempId()
    makeTempRef.current = tempId
    if (wasExisting) modelTempRef.current = null
    setPendingMakes((p) => [...p.filter((x) => x.tempId !== tempId), { tempId, name: trimmed }])
    setMakes((prev) => {
      const fromDb = initialMakes
      const pending = prev.filter((x) => x.id < 0 && x.id !== tempId)
      return [...fromDb, ...pending, { id: tempId, name: trimmed }].sort((a, b) => a.name.localeCompare(b.name))
    })
    setForm((f) => ({ ...f, makeId: tempId, modelId: wasExisting ? 0 : f.modelId }))
    clearErr('makeId')
  }

  const upsertPendingModel = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      if (modelTempRef.current !== null) {
        modelTempRef.current = null
        setPendingModels([])
        setModels(form.makeId > 0 ? initialModels.filter((m) => m.makeId === form.makeId) : initialModels)
        set('modelId', 0)
      }
      return
    }

    if (form.makeId > 0) {
      const existingModel = initialModels.find(
        (m) => m.makeId === form.makeId && dictNamesEqual(m.name, trimmed)
      )
      if (existingModel) {
        modelTempRef.current = null
        setPendingModels([])
        setModels((prev) => {
          const forMake = initialModels.filter((m) => m.makeId === form.makeId)
          const pendingOther = prev.filter((m) => m.id < 0 && m.makeId === form.makeId)
          return [...forMake, ...pendingOther].sort((a, b) => a.name.localeCompare(b.name))
        })
        set('modelId', existingModel.id)
        clearErr('modelId')
        return
      }
    }

    let tempId = modelTempRef.current
    if (tempId === null) tempId = form.modelId < 0 ? form.modelId : nextTempId()
    modelTempRef.current = tempId
    setPendingModels((p) => [...p.filter((x) => x.tempId !== tempId), { tempId, name: trimmed, makeId: form.makeId }])
    setModels((prev) => {
      const forMake = initialModels.filter((m) => m.makeId === form.makeId)
      const pending = prev.filter((m) => m.id < 0 && m.id !== tempId && m.makeId === form.makeId)
      return [...forMake, ...pending, { id: tempId, name: trimmed, makeId: form.makeId }].sort((a, b) => a.name.localeCompare(b.name))
    })
    set('modelId', tempId)
    clearErr('modelId')
  }

  const upsertPendingFuelType = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      if (fuelTempRef.current !== null) {
        fuelTempRef.current = null
        setPendingFuelTypes([])
        setFuelTypes(initialFuelTypes)
        set('fuelTypeId', 0)
      }
      return
    }
    const existing = initialFuelTypes.find((f) => dictNamesEqual(f.name, trimmed))
    if (existing) {
      fuelTempRef.current = null
      setPendingFuelTypes([])
      setFuelTypes(initialFuelTypes)
      set('fuelTypeId', existing.id)
      clearErr('fuelTypeId')
      return
    }
    let tempId = fuelTempRef.current
    if (tempId === null) tempId = form.fuelTypeId < 0 ? form.fuelTypeId : nextTempId()
    fuelTempRef.current = tempId
    setPendingFuelTypes((p) => [...p.filter((x) => x.tempId !== tempId), { tempId, name: trimmed }])
    setFuelTypes((prev) => {
      const pending = prev.filter((x) => x.id < 0 && x.id !== tempId)
      return [...initialFuelTypes, ...pending, { id: tempId, name: trimmed }].sort((a, b) => a.name.localeCompare(b.name))
    })
    set('fuelTypeId', tempId)
    clearErr('fuelTypeId')
  }

  const upsertPendingDriveType = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      if (driveTempRef.current !== null) {
        driveTempRef.current = null
        setPendingDriveTypes([])
        setDriveTypes(initialDriveTypes)
        set('driveTypeId', 0)
      }
      return
    }
    const existing = initialDriveTypes.find((d) => dictNamesEqual(d.name, trimmed))
    if (existing) {
      driveTempRef.current = null
      setPendingDriveTypes([])
      setDriveTypes(initialDriveTypes)
      set('driveTypeId', existing.id)
      clearErr('driveTypeId')
      return
    }
    let tempId = driveTempRef.current
    if (tempId === null) tempId = form.driveTypeId < 0 ? form.driveTypeId : nextTempId()
    driveTempRef.current = tempId
    setPendingDriveTypes((p) => [...p.filter((x) => x.tempId !== tempId), { tempId, name: trimmed }])
    setDriveTypes((prev) => {
      const pending = prev.filter((x) => x.id < 0 && x.id !== tempId)
      return [...initialDriveTypes, ...pending, { id: tempId, name: trimmed }].sort((a, b) => a.name.localeCompare(b.name))
    })
    set('driveTypeId', tempId)
    clearErr('driveTypeId')
  }

  const upsertPendingTransmission = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      if (transmissionTempRef.current !== null) {
        transmissionTempRef.current = null
        setPendingTransmissions([])
        setTransmissions(initialTransmissions)
        set('transmissionId', 0)
      }
      return
    }
    const existing = initialTransmissions.find((t) => dictNamesEqual(t.name, trimmed))
    if (existing) {
      transmissionTempRef.current = null
      setPendingTransmissions([])
      setTransmissions(initialTransmissions)
      set('transmissionId', existing.id)
      clearErr('transmissionId')
      return
    }
    let tempId = transmissionTempRef.current
    if (tempId === null) tempId = form.transmissionId < 0 ? form.transmissionId : nextTempId()
    transmissionTempRef.current = tempId
    setPendingTransmissions((p) => [...p.filter((x) => x.tempId !== tempId), { tempId, name: trimmed }])
    setTransmissions((prev) => {
      const pending = prev.filter((x) => x.id < 0 && x.id !== tempId)
      return [...initialTransmissions, ...pending, { id: tempId, name: trimmed }].sort((a, b) => a.name.localeCompare(b.name))
    })
    set('transmissionId', tempId)
    clearErr('transmissionId')
  }

  const upsertPendingStatus = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      if (statusTempRef.current !== null) {
        statusTempRef.current = null
        setPendingStatuses([])
        setStatuses(initialStatuses)
        set('currentStatusId', 0)
      }
      return
    }
    const existing = initialStatuses.find((s) => dictNamesEqual(s.name, trimmed))
    if (existing) {
      statusTempRef.current = null
      setPendingStatuses([])
      setStatuses(initialStatuses)
      set('currentStatusId', existing.id)
      clearErr('currentStatusId')
      return
    }
    let tempId = statusTempRef.current
    if (tempId === null) tempId = form.currentStatusId < 0 ? form.currentStatusId : nextTempId()
    statusTempRef.current = tempId
    setPendingStatuses((p) => [...p.filter((x) => x.tempId !== tempId), { tempId, name: trimmed }])
    setStatuses((prev) => {
      const pending = prev.filter((x) => x.id < 0 && x.id !== tempId)
      return [...initialStatuses, ...pending, { id: tempId, name: trimmed, isFinal: false }].sort((a, b) => a.name.localeCompare(b.name))
    })
    set('currentStatusId', tempId)
    clearErr('currentStatusId')
  }

  const upsertPendingPurchaseCountry = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      if (countryTempRef.current !== null) {
        countryTempRef.current = null
        setPendingPurchaseCountries([])
        setPurchaseCountries(initialPurchaseCountries)
        set('purchaseCountryId', 0)
      }
      return
    }
    const existing = initialPurchaseCountries.find((c) => dictNamesEqual(c.name, trimmed))
    if (existing) {
      countryTempRef.current = null
      setPendingPurchaseCountries([])
      setPurchaseCountries(initialPurchaseCountries)
      set('purchaseCountryId', existing.id)
      clearErr('purchaseCountryId')
      return
    }
    let tempId = countryTempRef.current
    if (tempId === null) tempId = form.purchaseCountryId < 0 ? form.purchaseCountryId : nextTempId()
    countryTempRef.current = tempId
    setPendingPurchaseCountries((p) => [...p.filter((x) => x.tempId !== tempId), { tempId, name: trimmed }])
    setPurchaseCountries((prev) => {
      const pending = prev.filter((x) => x.id < 0 && x.id !== tempId)
      return [...initialPurchaseCountries, ...pending, { id: tempId, name: trimmed }].sort((a, b) => a.name.localeCompare(b.name))
    })
    set('purchaseCountryId', tempId)
    clearErr('purchaseCountryId')
  }

  const pendingName = (id: number, list: PendingItem[]) =>
    id < 0 ? list.find((x) => x.tempId === id)?.name : undefined

  const selectedStatusSlug = useMemo(() => {
    const s = statuses.find((x) => x.id === form.currentStatusId)
    return s?.systemSlug ?? null
  }, [statuses, form.currentStatusId])

  const isSoldStatus = selectedStatusSlug === SYSTEM_STATUS_SLUGS.SOLD

  const needsSaleData = isSoldStatus
  const needsTransitData = statusRequiresTransitData(selectedStatusSlug)

  const purchaseReg = cashRegisters.find((r) => r.id === form.purchaseRegisterId)
  const saleReg = cashRegisters.find((r) => r.id === form.saleRegisterId)
  const purchaseCurrency = purchaseReg?.currencyCode ?? 'USD'
  const saleCurrency = saleReg?.currencyCode ?? 'USD'
  const purchaseDefaultRate = defaultRateForRegister(purchaseCurrency, paymentRates)
  const saleDefaultRate = defaultRateForRegister(saleCurrency, paymentRates)

  const saleUsdPreview = useMemo(() => {
    const amt = Number(form.saleAmount)
    if (!amt || !needsSaleData) return null
    return registerAmountToUsd(
      amt,
      saleCurrency,
      paymentRates,
      saleRateTouched ? Number(saleRate) || null : null
    )
  }, [form.saleAmount, saleCurrency, paymentRates, saleRate, saleRateTouched, needsSaleData])

  const isFormDirty = !!(
    form.vin.trim() ||
    form.makeId ||
    form.modelId ||
    form.fuelTypeId ||
    form.driveTypeId ||
    form.transmissionId ||
    form.manufactureYear > 0 ||
    form.engineVolume ||
    form.mileage ||
    form.currentStatusId ||
    form.purchaseCountryId ||
    form.containerNumber.trim() ||
    form.lotUrl.trim() ||
    form.deliveryCost ||
    form.estimatedDeliveryDate ||
    form.notes.trim() ||
    form.purchaseAmount ||
    form.purchaseRegisterId ||
    form.saleAmount ||
    form.saleRegisterId ||
    form.buyerName.trim() ||
    form.buyerPhone.trim() ||
    coverFile ||
    photoFiles.length > 0 ||
    docFiles.length > 0
  )

  const resetDrawer = () => {
    setDrawerOpen(false)
    setShowCloseGuard(false)
    setForm(EMPTY_FORM)
    setCoverFile(null)
    setPhotoFiles([])
    setDocFiles([])
    setUploadProgress(null)
    setPostCreateUpload(null)
    setErrors({})
    setPendingMakes([])
    setPendingModels([])
    setPendingFuelTypes([])
    setPendingDriveTypes([])
    setPendingTransmissions([])
    setPendingStatuses([])
    setPendingPurchaseCountries([])
    setMakes(initialMakes)
    setModels(initialModels)
    setStatuses(initialStatuses)
    setFuelTypes(initialFuelTypes)
    setDriveTypes(initialDriveTypes)
    setTransmissions(initialTransmissions)
    setPurchaseCountries(initialPurchaseCountries)
    makeTempRef.current = null
    modelTempRef.current = null
    fuelTempRef.current = null
    driveTempRef.current = null
    transmissionTempRef.current = null
    statusTempRef.current = null
    countryTempRef.current = null
    setPurchaseRate('')
    setPurchaseRateTouched(false)
    setSaleRate('')
    setSaleRateTouched(false)
  }

  const handleDrawerClose = () => {
    if (isFormDirty) {
      setShowCloseGuard(true)
    } else {
      resetDrawer()
    }
  }

  const handleSaveDraftAndClose = () => {
    startTransition(async () => {
      const make = makes.find(m => m.id === form.makeId)
      const model = models.find(m => m.id === form.modelId) ??
        pendingModels.find(m => m.tempId === form.modelId)
      const label = [make?.name, model?.name, form.vin.trim()].filter(Boolean).join(' ')
      await clearNewVehicleDraftNotifications()
      const notifRes = await createNotification({
        type: 'WARNING',
        title: 'Незбережена чернетка нового авто',
        message: `${label || 'Нове авто'}. Перейдіть до розділу «Автомобілі» щоб продовжити.`,
        entityType: 'vehicle_draft',
      })
      localStorage.setItem('draft_new_vehicle', JSON.stringify({
        form,
        label: label || 'Новий автомобіль',
        savedAt: new Date().toISOString(),
        notificationId: notifRes.success && notifRes.data ? notifRes.data.id : null,
      }))
      setDraftBanner({
        label: label || 'Новий автомобіль',
        savedAt: new Date().toISOString(),
      })
      restoredFromDraftRef.current = false
      notifyCrmRefresh('notifications')
      notifyCrmRefresh('topbar')
      resetDrawer()
    })
  }

  const handleRestoreDraft = () => {
    const saved = localStorage.getItem('draft_new_vehicle')
    if (!saved) return
    try {
      const { form: savedForm } = JSON.parse(saved)
      setForm(savedForm)
      setDraftBanner(null)
      restoredFromDraftRef.current = true
      setDrawerOpen(true)
    } catch {
      void clearVehicleDraft()
      setDraftBanner(null)
    }
  }

  const handleDiscardDraft = () => {
    startTransition(async () => {
      await clearVehicleDraft()
      setDraftBanner(null)
      if (drawerOpen) resetDrawer()
    })
  }

  const handleCancelDrawerWithoutSave = () => {
    if (restoredFromDraftRef.current) {
      startTransition(async () => {
        await clearVehicleDraft()
        setDraftBanner(null)
        resetDrawer()
      })
      return
    }
    resetDrawer()
  }

  const uploadSingleFile = async (vehicleId: number, item: UploadItem) => {
    const fd = new FormData()
    fd.append('vehicleId', String(vehicleId))
    fd.append('file', item.file)
    if (item.kind === 'photo' && item.isCover) fd.append('isCover', 'true')
    const url = item.kind === 'photo' ? '/api/upload/photo' : '/api/upload/doc'
    try {
      const res = await fetch(url, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { ok: false as const, error: (data as { error?: string }).error || 'Помилка завантаження' }
      }
      return { ok: true as const }
    } catch {
      return { ok: false as const, error: 'Мережева помилка' }
    }
  }

  const runUploads = async (vehicleId: number, items: UploadItem[]) => {
    if (items.length === 0) return [] as (UploadItem & { error: string })[]
    setUploading(true)
    setUploadProgress({ current: 0, total: items.length })
    const failed: (UploadItem & { error: string })[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const result = await uploadSingleFile(vehicleId, item)
      if (!result.ok) {
        failed.push({ ...item, error: result.error })
        toast.error(`${item.file.name}: ${result.error}`)
      }
      setUploadProgress({ current: i + 1, total: items.length })
    }
    setUploading(false)
    setUploadProgress(null)
    return failed
  }

  const handleRetryUploads = () => {
    if (!postCreateUpload) return
    startTransition(async () => {
      const failed = await runUploads(postCreateUpload.vehicleId, postCreateUpload.failed)
      if (failed.length === 0) {
        toast.success('Усі файли завантажено')
        await clearVehicleDraft()
        setDraftBanner(null)
        resetDrawer()
        router.refresh()
      } else {
        setPostCreateUpload({ vehicleId: postCreateUpload.vehicleId, failed })
        toast.warning(`Не вдалося завантажити ${failed.length} файл(ів)`)
      }
    })
  }

  const handleDismissPostCreate = () => {
    startTransition(async () => {
      await clearVehicleDraft()
      setDraftBanner(null)
      resetDrawer()
      router.refresh()
    })
  }

  const handleSubmit = () => {
    const e: Record<string, string> = {}
    if (!form.vin.trim()) e.vin = 'Обов\'язкове поле'
    if (!form.makeId) e.makeId = 'Оберіть марку'
    if (!form.modelId) e.modelId = 'Оберіть модель'
    if (!form.currentStatusId) e.currentStatusId = 'Оберіть статус'
    if (!form.purchaseCountryId) e.purchaseCountryId = 'Оберіть країну купівлі'
    if (!form.purchaseAmount || Number(form.purchaseAmount) <= 0) e.purchaseAmount = 'Вкажіть ціну купівлі'
    if (!form.purchaseRegisterId) e.purchaseRegisterId = 'Оберіть касу'
    if (needsSaleData) {
      if (!form.saleAmount || Number(form.saleAmount) <= 0) e.saleAmount = 'Вкажіть ціну продажу'
      if (!form.saleRegisterId) e.saleRegisterId = 'Оберіть касу'
      if (!form.saleDate) e.saleDate = 'Вкажіть дату продажу'
      if (!form.buyerName.trim()) e.buyerName = 'Вкажіть ПІБ покупця'
      if (!form.buyerPhone.trim()) e.buyerPhone = 'Вкажіть телефон покупця'
    }
    if (Object.keys(e).length > 0) { setErrors(e); return }

    startTransition(async () => {
      let realMakeId = form.makeId
      let realModelId = form.modelId
      let realFuelTypeId: number | null = form.fuelTypeId > 0 ? form.fuelTypeId : null
      let realDriveTypeId: number | null = form.driveTypeId > 0 ? form.driveTypeId : null
      let realTransmissionId: number | null = form.transmissionId > 0 ? form.transmissionId : null
      let realStatusId = form.currentStatusId
      let realPurchaseCountryId = form.purchaseCountryId

      if (form.makeId < 0) {
        const p = pendingMakes.find((x) => x.tempId === form.makeId)
        if (p) {
          const r = await createMakeEntry(p.name)
          if (!r.success || !r.data) { setErrors({ _submit: r.error ?? 'Помилка' }); return }
          realMakeId = r.data.id
        }
      }
      if (form.modelId < 0) {
        const p = pendingModels.find((x) => x.tempId === form.modelId)
        if (p) {
          const mId = p.makeId < 0 ? realMakeId : p.makeId
          const r = await createModelEntry(p.name, mId)
          if (!r.success || !r.data) { setErrors({ _submit: r.error ?? 'Помилка' }); return }
          realModelId = r.data.id
        }
      }
      if (form.fuelTypeId < 0) {
        const p = pendingFuelTypes.find((x) => x.tempId === form.fuelTypeId)
        if (p) {
          const r = await createFuelTypeEntry(p.name)
          if (!r.success || !r.data) { setErrors({ _submit: r.error ?? 'Помилка' }); return }
          realFuelTypeId = r.data.id
        }
      }
      if (form.driveTypeId < 0) {
        const p = pendingDriveTypes.find((x) => x.tempId === form.driveTypeId)
        if (p) {
          const r = await createDriveTypeEntry(p.name)
          if (!r.success || !r.data) { setErrors({ _submit: r.error ?? 'Помилка' }); return }
          realDriveTypeId = r.data.id
        }
      }
      if (form.transmissionId < 0) {
        const p = pendingTransmissions.find((x) => x.tempId === form.transmissionId)
        if (p) {
          const r = await createTransmissionEntry(p.name)
          if (!r.success || !r.data) { setErrors({ _submit: r.error ?? 'Помилка' }); return }
          realTransmissionId = r.data.id
        }
      }
      if (form.currentStatusId < 0) {
        const p = pendingStatuses.find((x) => x.tempId === form.currentStatusId)
        if (p) {
          const r = await createStatusEntry(p.name)
          if (!r.success || !r.data) { setErrors({ _submit: r.error ?? 'Помилка' }); return }
          realStatusId = r.data.id
        }
      }
      if (form.purchaseCountryId < 0) {
        const p = pendingPurchaseCountries.find((x) => x.tempId === form.purchaseCountryId)
        if (p) {
          const r = await createPurchaseCountryEntry(p.name)
          if (!r.success || !r.data) { setErrors({ _submit: r.error ?? 'Помилка' }); return }
          realPurchaseCountryId = r.data.id
        }
      }

      const res = await createVehicle({
        vin: form.vin.trim().toUpperCase(),
        modelId: realModelId,
        fuelTypeId: realFuelTypeId,
        driveTypeId: realDriveTypeId,
        transmissionId: realTransmissionId,
        manufactureYear: form.manufactureYear > 0 ? Number(form.manufactureYear) : null,
        engineVolume: form.engineVolume ? Number(form.engineVolume) : null,
        mileage: form.mileage ? Number(form.mileage) : null,
        currentStatusId: realStatusId,
        purchaseCountryId: realPurchaseCountryId,
        containerNumber: form.containerNumber || null,
        lotUrl: form.lotUrl.trim() || null,
        deliveryCost: form.deliveryCost ? Number(form.deliveryCost) : null,
        estimatedDeliveryDate: form.estimatedDeliveryDate || null,
        notes: form.notes || null,
        transitData: needsTransitData
          ? {
              containerNumber: form.containerNumber || null,
              deliveryCost: form.deliveryCost ? Number(form.deliveryCost) : null,
              estimatedDeliveryDate: form.estimatedDeliveryDate || null,
              lotUrl: form.lotUrl.trim() || null,
            }
          : undefined,
        purchaseData: {
          cashRegisterId: form.purchaseRegisterId,
          amount: 0,
          amountUsd: Number(form.purchaseAmount),
          customRate: purchaseRateTouched ? Number(purchaseRate) || null : null,
        },
        saleData: needsSaleData
          ? {
              cashRegisterId: form.saleRegisterId,
              amount: Number(form.saleAmount),
              buyerName: form.buyerName.trim(),
              buyerPhone: form.buyerPhone.trim(),
              customRate: saleRateTouched ? Number(saleRate) || null : null,
              saleDate: form.saleDate || localTodayIso(),
            }
          : undefined,
      })

      if (!res.success) {
        setErrors({ _submit: res.error ?? 'Помилка' })
        return
      }

      const vehicleId = res.data!.id

      const allFiles: UploadItem[] = [
        ...(coverFile ? [{ file: coverFile, isCover: true, kind: 'photo' as const }] : []),
        ...photoFiles.map((f) => ({ file: f, isCover: false, kind: 'photo' as const })),
        ...docFiles.map((f) => ({ file: f, isCover: false, kind: 'doc' as const })),
      ]

      if (allFiles.length > 0) {
        const failed = await runUploads(vehicleId, allFiles)
        if (failed.length > 0) {
          toast.warning(`Авто створено, але ${failed.length} файл(ів) не завантажено`)
          setPostCreateUpload({ vehicleId, failed })
          return
        }
      }

      await clearVehicleDraft()
      setDraftBanner(null)
      resetDrawer()
      router.refresh()
    })
  }

  return (
    <>
        {draftBanner && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 bg-accent/5 border border-accent/20 rounded-lg">
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-4 h-4 text-accent shrink-0" />
            <div className="min-w-0">
              <p className="text-sm text-textPrimary font-medium truncate">{draftBanner.label}</p>
              <p className="text-xs text-textSecondary">
                Збережено о {new Date(draftBanner.savedAt).toLocaleTimeString('uk', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleRestoreDraft}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-accent/10 border border-accent text-accent hover:bg-accent hover:text-accentOn transition-all"
            >
              Відновити
            </button>
            <button
              onClick={handleDiscardDraft}
              className="px-3 py-1.5 rounded text-xs border border-border text-textSecondary hover:text-red-400 hover:border-red-400/30 transition-all"
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight text-textPrimary">Автомобілі</h1>
          {canCreate && (
            <button
              onClick={() => {
                restoredFromDraftRef.current = false
                const defaultCountry = purchaseCountries.find((c) => /сша|usa/i.test(c.name))
                setForm({
                  ...EMPTY_FORM,
                  purchaseCountryId: defaultCountry?.id ?? 0,
                  purchaseRegisterId: userDefaultRegisterId ?? 0,
                })
                setDrawerOpen(true)
              }}
              className="flex items-center gap-2 bg-accent text-background px-5 py-2.5 rounded-md text-sm font-semibold hover:bg-accent/90 transition-all shadow-neon"
            >
              <Plus className="w-4 h-4" />
              Додати авто
            </button>
          )}
        </div>

        <VehicleSearchPanel
          vehicles={initialVehicles}
          statuses={statuses}
          driveTypes={driveTypes}
          transmissions={transmissions}
          showCustomsFilters
          onChange={(filtered, state) => {
            setDisplayed(filtered)
            setSearchActive(hasActiveVehicleSearchFilters(state))
            setVPage(1)
          }}
        />

        <div className="flex items-center gap-1 flex-wrap justify-end">
          <div className="flex items-center gap-1 bg-surface border border-border rounded p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-accent/10 text-accent' : 'text-textSecondary hover:text-textPrimary'}`}
              title="Сітка"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-accent/10 text-accent' : 'text-textSecondary hover:text-textPrimary'}`}
              title="Список"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {displayed.length === 0 && (
          <div className="bg-surface border border-border rounded-lg px-5 py-12 text-center text-textSecondary text-sm">
            {searchActive ? 'Нічого не знайдено' : 'Список порожній'}
          </div>
        )}

        {/* Grid view */}
        {viewMode === 'grid' && displayed.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {pagedVehicles.map((v) => (
              <div
                key={v.id}
                className={`relative bg-surface border rounded-lg overflow-hidden transition-all hover:shadow-neon ${v.isFinal ? 'opacity-60' : ''} ${selectedIds.has(v.id) ? 'border-accent/60' : 'border-border hover:border-accent/40'}`}
              >
                {canBulkSelect && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleSelect(v.id) }}
                    className={`absolute top-2 left-2 z-10 w-5 h-5 rounded flex items-center justify-center border transition-colors ${selectedIds.has(v.id) ? 'bg-accent border-accent text-background' : 'bg-surface/80 border-border hover:border-accent/60'}`}
                  >
                    {selectedIds.has(v.id) && <Check className="w-3 h-3" />}
                  </button>
                )}
                <div onClick={() => router.push(`/vehicles/${v.id}`)} className="cursor-pointer">
                {v.coverPhoto ? (
                  <img src={v.coverPhoto} alt="" className="w-full aspect-[4/3] object-cover" />
                ) : (
                  <div className="w-full aspect-[4/3] bg-background flex items-center justify-center">
                    <Car className="w-10 h-10 text-textSecondary opacity-20" />
                  </div>
                )}
                <div className="p-3 space-y-1.5">
                  <div className="font-semibold text-sm text-textPrimary leading-tight">{v.makeAndModel}</div>
                  <div className="text-xs text-textSecondary flex flex-wrap items-center gap-x-1.5">
                  <span>{v.year ?? '—'}</span>
                  {v.mileage != null && (
                    <>
                      <span>·</span>
                      <span className="tabular-nums">{v.mileage.toLocaleString('uk-UA')} км</span>
                    </>
                  )}
                </div>
                <div className="text-xs text-textSecondary font-mono mt-0.5 break-all">
                  {v.vin}
                </div>
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      v.isFinal ? 'bg-emerald-500/10 text-emerald-400' : 'bg-accent/10 text-accent'
                    }`}>
                      {v.status}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-textSecondary">
                    ${(v.price ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </div>
                  {!v.isFinal && (canCreateRepair || canCreateExpense) && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setWorkModalVehicleId(v.id) }}
                      className="mt-2 w-full flex items-center justify-center gap-1 text-[10px] text-accent border border-accent/30 hover:border-accent/60 px-2 py-1 rounded transition-colors"
                    >
                      <Wrench className="w-3 h-3" /> + Робота
                    </button>
                  )}
                </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* List view */}
        {viewMode === 'list' && displayed.length > 0 && (
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm text-textSecondary">
              <thead className="text-textPrimary uppercase border-b border-border bg-surfaceHover text-[11px]">
                <tr>
                  {canBulkSelect && (
                    <th className="px-3 py-3 w-8">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${allDisplayedSelected ? 'bg-accent border-accent text-background' : 'border-border hover:border-accent/60'}`}
                      >
                        {allDisplayedSelected && <Check className="w-2.5 h-2.5" />}
                      </button>
                    </th>
                  )}
                  <th className="px-3 py-3 w-16" />
                  <th className="px-3 py-3">Авто</th>
                  <th className="px-3 py-3 hidden md:table-cell w-40">VIN</th>
                  <th className="px-3 py-3 hidden sm:table-cell w-14">Рік</th>
                  <th className="px-3 py-3 hidden lg:table-cell w-28">Країна</th>
                  <th className="px-3 py-3">Статус</th>
                  <th className="px-3 py-3 text-right w-28 hidden sm:table-cell">Собівартість ($)</th>
                  {(canCreateRepair || canCreateExpense) && (
                    <th className="px-3 py-3 w-24" />
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagedVehicles.map((v) => (
                  <tr
                    key={v.id}
                    className={`hover:bg-surfaceHover transition-colors cursor-pointer ${v.isFinal ? 'opacity-60' : ''} ${selectedIds.has(v.id) ? 'bg-accent/5' : ''}`}
                  >
                    {canBulkSelect && (
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleSelect(v.id)}
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedIds.has(v.id) ? 'bg-accent border-accent text-background' : 'border-border hover:border-accent/60'}`}
                        >
                          {selectedIds.has(v.id) && <Check className="w-2.5 h-2.5" />}
                        </button>
                      </td>
                    )}
                    <td className="px-3 py-2" onClick={() => router.push(`/vehicles/${v.id}`)}>
                      {v.coverPhoto ? (
                        <img src={v.coverPhoto} alt="" className="w-14 h-10 rounded object-cover border border-border" />
                      ) : (
                        <div className="w-14 h-10 rounded border border-border bg-background flex items-center justify-center">
                          <Car className="w-5 h-5 text-textSecondary opacity-30" />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2" onClick={() => router.push(`/vehicles/${v.id}`)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-textPrimary">{v.makeAndModel}</span>
                        {v.isFinal && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">АРХІВ</span>}
                      </div>
                      <div className="text-[11px] text-textSecondary mt-0.5 flex flex-wrap gap-x-2">
                        {v.mileage != null && (
                          <span className="tabular-nums">{v.mileage.toLocaleString('uk-UA')} км</span>
                        )}
                        {v.purchaseCountry && (
                          <span>{v.purchaseCountry}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs hidden md:table-cell" onClick={() => router.push(`/vehicles/${v.id}`)}>{v.vin}</td>
                    <td className="px-3 py-2 hidden sm:table-cell" onClick={() => router.push(`/vehicles/${v.id}`)}>{v.year ?? '—'}</td>
                    <td className="px-3 py-2 hidden lg:table-cell text-xs" onClick={() => router.push(`/vehicles/${v.id}`)}>
                      {v.purchaseCountry ?? '—'}
                    </td>
                    <td className="px-3 py-2" onClick={() => router.push(`/vehicles/${v.id}`)}>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${v.isFinal ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-accent/10 text-accent border border-accent/20'}`}>
                          {v.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-right text-textPrimary text-xs hidden sm:table-cell" onClick={() => router.push(`/vehicles/${v.id}`)}>
                      ${(v.price ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </td>
                    {!v.isFinal && (canCreateRepair || canCreateExpense) && (
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setWorkModalVehicleId(v.id) }}
                          className="flex items-center gap-1 text-[10px] text-accent border border-accent/30 hover:border-accent/60 px-2 py-1 rounded transition-colors whitespace-nowrap"
                        >
                          <Wrench className="w-3 h-3" /> + Робота
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
        {displayed.length > 0 && (
          <div className="px-1">
            <Pagination
              total={displayed.length}
              page={vPage}
              perPage={vPerPage}
              onPageChange={setVPage}
              onPerPageChange={(n) => { setVPerPage(n); setVPage(1) }}
            />
          </div>
        )}
      </div>

      {canBulkSelect && selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-40 flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 max-w-[calc(100vw-2rem)] sm:max-w-none bg-surface border border-accent/40 rounded-xl shadow-elevated-lg backdrop-blur-sm">
          <span className="text-sm text-textSecondary">Вибрано: <span className="text-accent font-semibold">{selectedIds.size}</span></span>
          {!allDisplayedSelected && displayed.length > selectedIds.size && (
            <button
              type="button"
              onClick={selectAllDisplayed}
              className="text-xs text-accent hover:text-accent/80 underline underline-offset-2 transition-colors whitespace-nowrap"
            >
              Вибрати всі {displayed.length}
            </button>
          )}
          {canChangeStatus && (
            <>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <select
                  value={bulkStatusId}
                  onChange={e => setBulkStatusId(Number(e.target.value))}
                  className="bg-background border border-border text-textPrimary text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-accent"
                >
                  <option value={0}>Змінити статус...</option>
                  {statuses.filter(s => !s.isFinal).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleBulkStatus}
                  disabled={isPending || !bulkStatusId}
                  className="px-3 py-1.5 bg-accent/10 border border-accent text-accent text-xs rounded hover:bg-accent hover:text-accentOn transition-all disabled:opacity-40"
                >
                  {isPending ? '...' : 'Застосувати'}
                </button>
              </div>
            </>
          )}
          {canExport && (
            <>
              <div className="h-4 w-px bg-border" />
              <button
                type="button"
                onClick={() => setShowBulkExportModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border text-textSecondary rounded hover:text-textPrimary hover:border-accent/40 transition-all"
              >
                <Download className="w-3 h-3" /> CSV
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => { setSelectedIds(new Set()); setBulkError('') }}
            className="p-1.5 text-textSecondary hover:text-textPrimary"
          >
            <X className="w-4 h-4" />
          </button>
          {bulkError && <span className="text-xs text-red-400">{bulkError}</span>}
        </div>
      )}

      {drawerOpen && (
        <OverlayPortal open={drawerOpen}>
          <OverlayBackdrop onDismiss={handleDrawerClose} className="fixed inset-0 bg-black/60 z-[300]" />
          <div className="fixed inset-0 z-[310] flex items-start justify-stretch p-0 pointer-events-none md:items-start md:justify-end md:p-6">
            <div
              className="pointer-events-auto relative flex flex-col w-full max-h-[92dvh] bg-surface border border-border shadow-elevated overflow-hidden rounded-b-xl
                md:max-w-lg md:max-h-[calc(100vh-3rem)] md:rounded-xl md:w-[32rem]"
            >
            {showCloseGuard && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                <div className="bg-surface border border-border rounded-xl w-full max-w-sm shadow-elevated">
                  <div className="flex items-start gap-3 p-5 border-b border-border">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-textPrimary">Є незаповнені дані</h3>
                      <p className="text-sm text-textSecondary mt-0.5">Форму не відправлено. Що зробити з введеними даними?</p>
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    <button
                      onClick={() => setShowCloseGuard(false)}
                      className="w-full py-2 rounded-md text-sm font-semibold bg-accent/10 border border-accent text-accent hover:bg-accent hover:text-accentOn transition-all"
                    >
                      Продовжити заповнення
                    </button>
                    <button
                      onClick={handleSaveDraftAndClose}
                      disabled={isPending}
                      className="w-full py-2 rounded-md text-sm border border-border text-textSecondary hover:text-textPrimary hover:border-accent/30 transition-all disabled:opacity-50"
                    >
                      {isPending ? 'Збереження...' : 'Пізніше (зберегти чернетку)'}
                    </button>
                    <button
                      onClick={handleCancelDrawerWithoutSave}
                      className="w-full py-2 rounded-md text-sm text-textSecondary/60 hover:text-red-400 transition-all"
                    >
                      Скасувати без збереження
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <h2 className="text-lg font-semibold text-textPrimary">Додати автомобіль</h2>
              <button onClick={handleDrawerClose} className="text-textSecondary hover:text-textPrimary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <Field label="VIN *">
                <input
                  value={form.vin}
                  onChange={(e) => { set('vin', e.target.value.toUpperCase()); setErrors((p) => { const n = { ...p }; delete n.vin; return n }) }}
                  placeholder="1HGCM82633A004101"
                  className={`${inputCls} font-mono ${errors.vin ? 'border-red-500' : ''}`}
                  maxLength={17}
                />
                {errors.vin && <p className="text-[11px] text-red-400 mt-0.5">{errors.vin}</p>}
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Марка *">
                  <select
                    value={form.makeId}
                    onChange={(e) => {
                      const id = Number(e.target.value)
                      if (id > 0) {
                        setPendingMakes([])
                        setMakes(initialMakes)
                        setPendingModels([])
                        setModels(initialModels)
                        makeTempRef.current = null
                        modelTempRef.current = null
                      } else if (id < 0) {
                        makeTempRef.current = id
                      }
                      handleMakeChange(id)
                      setErrors((p) => { const n = { ...p }; delete n.makeId; delete n.modelId; return n })
                    }}
                    className={`${inputCls} ${errors.makeId ? 'border-red-500' : ''}`}
                  >
                    <option value={0}>Оберіть...</option>
                    {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  {errors.makeId && <p className="text-[11px] text-red-400 mt-0.5">{errors.makeId}</p>}
                  <InlineAdd
                    placeholder="Нова марка..."
                    draftValue={pendingName(form.makeId, pendingMakes)}
                    onDraftChange={upsertPendingMake}
                  />
                </Field>
                <Field label="Модель *">
                  <select
                    value={form.modelId}
                    onChange={(e) => {
                      const id = Number(e.target.value)
                      if (id > 0) {
                        setPendingModels([])
                        setModels((prev) => prev.filter((m) => m.id > 0))
                        modelTempRef.current = null
                      } else if (id < 0) {
                        modelTempRef.current = id
                      }
                      set('modelId', id)
                      setErrors((p) => { const n = { ...p }; delete n.modelId; return n })
                    }}
                    disabled={!form.makeId}
                    className={`${inputCls} ${errors.modelId ? 'border-red-500' : ''}`}
                  >
                    <option value={0}>Оберіть...</option>
                    {filteredModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  {errors.modelId && <p className="text-[11px] text-red-400 mt-0.5">{errors.modelId}</p>}
                  {form.makeId !== 0 && (
                    <InlineAdd
                      placeholder="Нова модель..."
                      draftValue={pendingName(form.modelId, pendingModels)}
                      onDraftChange={upsertPendingModel}
                    />
                  )}
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Рік">
                  <input
                    type="number"
                    value={form.manufactureYear || ''}
                    onChange={(e) => {
                      const v = e.target.value
                      set('manufactureYear', v ? Number(v) : 0)
                      setErrors((p) => { const n = { ...p }; delete n.manufactureYear; return n })
                    }}
                    min={1990}
                    max={new Date().getFullYear() + 1}
                    placeholder="2020"
                    className={`${inputCls} ${errors.manufactureYear ? 'border-red-500' : ''}`}
                  />
                  {errors.manufactureYear && <p className="text-[11px] text-red-400 mt-0.5">{errors.manufactureYear}</p>}
                </Field>
                <Field label="Об'єм двигуна (L)">
                  <input
                    type="number"
                    step="0.1"
                    value={form.engineVolume}
                    onChange={(e) => set('engineVolume', e.target.value)}
                    placeholder="2.0"
                    className={inputCls}
                  />
                </Field>
              </div>

              <Field label="Пробіг (км)">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.mileage}
                  onChange={(e) => set('mileage', e.target.value)}
                  placeholder="150000"
                  className={inputCls}
                />
              </Field>

              <Field label="Тип палива">
                <select
                  value={form.fuelTypeId}
                  onChange={(e) => {
                    const id = Number(e.target.value)
                    if (id > 0) {
                      setPendingFuelTypes([])
                      setFuelTypes(initialFuelTypes)
                      fuelTempRef.current = null
                    } else if (id < 0) {
                      fuelTempRef.current = id
                    } else {
                      fuelTempRef.current = null
                      setPendingFuelTypes([])
                      setFuelTypes(initialFuelTypes)
                    }
                    set('fuelTypeId', id)
                    setErrors((p) => { const n = { ...p }; delete n.fuelTypeId; return n })
                  }}
                  className={`${inputCls} ${errors.fuelTypeId ? 'border-red-500' : ''}`}
                >
                  <option value={0}>Не вказано</option>
                  {fuelTypes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                {errors.fuelTypeId && <p className="text-[11px] text-red-400 mt-0.5">{errors.fuelTypeId}</p>}
                <InlineAdd
                  placeholder="Новий тип палива..."
                  draftValue={pendingName(form.fuelTypeId, pendingFuelTypes)}
                  onDraftChange={upsertPendingFuelType}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Привід">
                  <select
                    value={form.driveTypeId}
                    onChange={(e) => {
                      const id = Number(e.target.value)
                      if (id > 0) {
                        setPendingDriveTypes([])
                        setDriveTypes(initialDriveTypes)
                        driveTempRef.current = null
                      } else if (id < 0) {
                        driveTempRef.current = id
                      } else {
                        driveTempRef.current = null
                        setPendingDriveTypes([])
                        setDriveTypes(initialDriveTypes)
                      }
                      set('driveTypeId', id)
                      setErrors((p) => { const n = { ...p }; delete n.driveTypeId; return n })
                    }}
                    className={`${inputCls} ${errors.driveTypeId ? 'border-red-500' : ''}`}
                  >
                    <option value={0}>Не вказано</option>
                    {driveTypes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  {errors.driveTypeId && <p className="text-[11px] text-red-400 mt-0.5">{errors.driveTypeId}</p>}
                  <InlineAdd
                    placeholder="Новий привід..."
                    draftValue={pendingName(form.driveTypeId, pendingDriveTypes)}
                    onDraftChange={upsertPendingDriveType}
                  />
                </Field>
                <Field label="Трансмісія">
                  <select
                    value={form.transmissionId}
                    onChange={(e) => {
                      const id = Number(e.target.value)
                      if (id > 0) {
                        setPendingTransmissions([])
                        setTransmissions(initialTransmissions)
                        transmissionTempRef.current = null
                      } else if (id < 0) {
                        transmissionTempRef.current = id
                      } else {
                        transmissionTempRef.current = null
                        setPendingTransmissions([])
                        setTransmissions(initialTransmissions)
                      }
                      set('transmissionId', id)
                      setErrors((p) => { const n = { ...p }; delete n.transmissionId; return n })
                    }}
                    className={`${inputCls} ${errors.transmissionId ? 'border-red-500' : ''}`}
                  >
                    <option value={0}>Не вказано</option>
                    {transmissions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {errors.transmissionId && <p className="text-[11px] text-red-400 mt-0.5">{errors.transmissionId}</p>}
                  <InlineAdd
                    placeholder="Нова трансмісія..."
                    draftValue={pendingName(form.transmissionId, pendingTransmissions)}
                    onDraftChange={upsertPendingTransmission}
                  />
                </Field>
              </div>

              <Field label="Країна купівлі *">
                <select
                  value={form.purchaseCountryId}
                  onChange={(e) => {
                    const id = Number(e.target.value)
                    if (id > 0) {
                      setPendingPurchaseCountries([])
                      setPurchaseCountries(initialPurchaseCountries)
                      countryTempRef.current = null
                    } else if (id < 0) {
                      countryTempRef.current = id
                    }
                    set('purchaseCountryId', id)
                    setErrors((p) => { const n = { ...p }; delete n.purchaseCountryId; return n })
                  }}
                  className={`${inputCls} ${errors.purchaseCountryId ? 'border-red-500' : ''}`}
                >
                  <option value={0}>Оберіть...</option>
                  {purchaseCountries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {errors.purchaseCountryId && <p className="text-[11px] text-red-400 mt-0.5">{errors.purchaseCountryId}</p>}
                <InlineAdd
                  placeholder="Нова країна..."
                  draftValue={pendingName(form.purchaseCountryId, pendingPurchaseCountries)}
                  onDraftChange={upsertPendingPurchaseCountry}
                />
              </Field>

              <Field label="Початковий статус *">
                <select
                  value={form.currentStatusId}
                  onChange={(e) => {
                    const id = Number(e.target.value)
                    if (id > 0) {
                      setPendingStatuses([])
                      setStatuses(initialStatuses)
                      statusTempRef.current = null
                    } else if (id < 0) {
                      statusTempRef.current = id
                    }
                    set('currentStatusId', id)
                    setErrors((p) => { const n = { ...p }; delete n.currentStatusId; return n })
                  }}
                  className={`${inputCls} ${errors.currentStatusId ? 'border-red-500' : ''}`}
                >
                  <option value={0}>Оберіть...</option>
                  {createStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {errors.currentStatusId && <p className="text-[11px] text-red-400 mt-0.5">{errors.currentStatusId}</p>}
                <InlineAdd
                  placeholder="Новий статус..."
                  draftValue={pendingName(form.currentStatusId, pendingStatuses)}
                  onDraftChange={upsertPendingStatus}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-accent/5 border border-accent/20 rounded-lg p-3">
                <div className="col-span-2 text-xs text-accent font-medium flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" /> Деталі купівлі
                </div>
                <Field label="Ціна купівлі ($) *">
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={form.purchaseAmount}
                    onChange={(e) => { set('purchaseAmount', e.target.value); setErrors((p) => { const n = { ...p }; delete n.purchaseAmount; return n }) }}
                    placeholder="15000"
                    className={`${inputCls} ${errors.purchaseAmount ? 'border-red-500' : ''}`}
                  />
                  {errors.purchaseAmount && <p className="text-[11px] text-red-400 mt-0.5">{errors.purchaseAmount}</p>}
                </Field>
                <Field label="Каса списання *">
                  <select
                    value={form.purchaseRegisterId}
                    onChange={(e) => {
                      const id = Number(e.target.value)
                      set('purchaseRegisterId', id)
                      setPurchaseRateTouched(false)
                      const reg = cashRegisters.find((r) => r.id === id)
                      const def = defaultRateForRegister(reg?.currencyCode ?? 'USD', paymentRates)
                      setPurchaseRate(def != null ? String(def) : '')
                      setErrors((p) => { const n = { ...p }; delete n.purchaseRegisterId; return n })
                    }}
                    className={`${inputCls} ${errors.purchaseRegisterId ? 'border-red-500' : ''}`}
                  >
                    <option value={0}>Оберіть...</option>
                    {cashRegisters.map((r) => (
                      <option key={r.id} value={r.id}>{r.name} ({r.currencyCode})</option>
                    ))}
                  </select>
                  {errors.purchaseRegisterId && <p className="text-[11px] text-red-400 mt-0.5">{errors.purchaseRegisterId}</p>}
                </Field>
                {purchaseCurrency !== 'USD' && (
                  <div className="col-span-2">
                    <Field label={rateLabelForRegister(purchaseCurrency) ?? 'Курс'}>
                      <input
                        type="number"
                        step={0.0001}
                        value={purchaseRateTouched ? purchaseRate : purchaseDefaultRate != null ? String(purchaseDefaultRate) : ''}
                        onChange={(e) => { setPurchaseRateTouched(true); setPurchaseRate(e.target.value) }}
                        className={`${inputCls} font-mono`}
                      />
                      <p className="text-[10px] text-textSecondary mt-1">{formatRateHint(purchaseCurrency, paymentRates)}</p>
                    </Field>
                  </div>
                )}
              </div>

              {needsSaleData && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                  <div className="col-span-2 text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> Деталі продажу
                  </div>
                  <Field label={`Ціна продажу * (${saleCurrency})`}>
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={form.saleAmount}
                      onChange={(e) => { set('saleAmount', e.target.value); setErrors((p) => { const n = { ...p }; delete n.saleAmount; return n }) }}
                      placeholder="20000"
                      className={`${inputCls} ${errors.saleAmount ? 'border-red-500' : ''}`}
                    />
                    {errors.saleAmount && <p className="text-[11px] text-red-400 mt-0.5">{errors.saleAmount}</p>}
                    {saleUsdPreview != null && saleCurrency !== 'USD' && (
                      <p className="text-[11px] text-accent font-mono mt-1">{formatUsdEquivalent(saleUsdPreview)}</p>
                    )}
                  </Field>
                  <Field label="Каса зарахування *">
                    <select
                      value={form.saleRegisterId}
                      onChange={(e) => {
                        const id = Number(e.target.value)
                        set('saleRegisterId', id)
                        setSaleRateTouched(false)
                        const reg = cashRegisters.find((r) => r.id === id)
                        const def = defaultRateForRegister(reg?.currencyCode ?? 'USD', paymentRates)
                        setSaleRate(def != null ? String(def) : '')
                        setErrors((p) => { const n = { ...p }; delete n.saleRegisterId; return n })
                      }}
                      className={`${inputCls} ${errors.saleRegisterId ? 'border-red-500' : ''}`}
                    >
                      <option value={0}>Оберіть...</option>
                      {cashRegisters.map((r) => (
                        <option key={r.id} value={r.id}>{r.name} ({r.currencyCode})</option>
                      ))}
                    </select>
                    {errors.saleRegisterId && <p className="text-[11px] text-red-400 mt-0.5">{errors.saleRegisterId}</p>}
                  </Field>
                  {saleCurrency !== 'USD' && (
                    <div className="col-span-2">
                      <Field label={rateLabelForRegister(saleCurrency) ?? 'Курс'}>
                        <input
                          type="number"
                          step={0.0001}
                          value={saleRateTouched ? saleRate : saleDefaultRate != null ? String(saleDefaultRate) : ''}
                          onChange={(e) => { setSaleRateTouched(true); setSaleRate(e.target.value) }}
                          className={`${inputCls} font-mono`}
                        />
                        <p className="text-[10px] text-textSecondary mt-1">{formatRateHint(saleCurrency, paymentRates)}</p>
                      </Field>
                    </div>
                  )}
                  <Field label="Дата продажу *">
                    <DateInput
                      value={form.saleDate || localTodayIso()}
                      onChange={(v) => { set('saleDate', v); setErrors((p) => { const n = { ...p }; delete n.saleDate; return n }) }}
                      max={localTodayIso()}
                      className={errors.saleDate ? 'border-red-500' : ''}
                    />
                    {errors.saleDate && <p className="text-[11px] text-red-400 mt-0.5">{errors.saleDate}</p>}
                    <p className="text-[10px] text-textSecondary mt-1">Використовується для статистики місяця продажу</p>
                  </Field>
                  <Field label="ПІБ покупця *">
                    <input
                      value={form.buyerName}
                      onChange={(e) => { set('buyerName', e.target.value); setErrors((p) => { const n = { ...p }; delete n.buyerName; return n }) }}
                      placeholder="Іваненко Іван Іванович"
                      className={`${inputCls} ${errors.buyerName ? 'border-red-500' : ''}`}
                    />
                    {errors.buyerName && <p className="text-[11px] text-red-400 mt-0.5">{errors.buyerName}</p>}
                  </Field>
                  <Field label="Телефон *">
                    <input
                      value={form.buyerPhone}
                      onChange={(e) => { set('buyerPhone', e.target.value); setErrors((p) => { const n = { ...p }; delete n.buyerPhone; return n }) }}
                      placeholder="+380..."
                      className={`${inputCls} ${errors.buyerPhone ? 'border-red-500' : ''}`}
                    />
                    {errors.buyerPhone && <p className="text-[11px] text-red-400 mt-0.5">{errors.buyerPhone}</p>}
                  </Field>
                </div>
              )}

              {needsTransitData && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3">
                  <div className="col-span-2 text-xs text-cyan-400 font-medium">
                    Дані доставки (необовʼязково)
                  </div>
                  <Field label="Номер контейнера">
                    <input value={form.containerNumber} onChange={(e) => set('containerNumber', e.target.value)} placeholder="MSCU1234567" className={inputCls} />
                  </Field>
                  <Field label="Вартість доставки (USD)">
                    <input type="number" value={form.deliveryCost} onChange={(e) => set('deliveryCost', e.target.value)} placeholder="0" className={inputCls} />
                  </Field>
                  <Field label="Орієнтовна дата доставки">
                    <input type="date" value={form.estimatedDeliveryDate} onChange={(e) => set('estimatedDeliveryDate', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Посилання на лот">
                    <input type="url" value={form.lotUrl} onChange={(e) => set('lotUrl', e.target.value)} placeholder="https://..." className={inputCls} />
                  </Field>
                </div>
              )}

              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-xs text-textSecondary uppercase tracking-wider">Фото (необов'язково)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-textSecondary mb-1.5 block">Фото-заставка</label>
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      className={`w-full border-2 border-dashed rounded-md p-3 text-xs transition-colors ${
                        coverFile
                          ? 'border-accent/40 text-accent'
                          : 'border-border text-textSecondary hover:border-accent/30 hover:text-textPrimary'
                      }`}
                    >
                      {coverFile ? (
                        <span className="flex items-center gap-1 justify-center truncate">
                          <ImageIcon className="w-3 h-3 shrink-0" /> {coverFile.name}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 justify-center">
                          <ImageIcon className="w-3 h-3" /> Вибрати...
                        </span>
                      )}
                    </button>
                    {coverFile && (
                      <button type="button" onClick={() => setCoverFile(null)} className="text-[11px] text-red-400 hover:underline mt-0.5">
                        Прибрати
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-textSecondary mb-1.5 block">Додаткові фото</label>
                    <input
                      ref={photosInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []))}
                    />
                    <button
                      type="button"
                      onClick={() => photosInputRef.current?.click()}
                      className={`w-full border-2 border-dashed rounded-md p-3 text-xs transition-colors ${
                        photoFiles.length > 0
                          ? 'border-accent/40 text-accent'
                          : 'border-border text-textSecondary hover:border-accent/30 hover:text-textPrimary'
                      }`}
                    >
                      <span className="flex items-center gap-1 justify-center">
                        <ImageIcon className="w-3 h-3" />
                        {photoFiles.length > 0 ? `${photoFiles.length} файл(ів)` : 'Вибрати...'}
                      </span>
                    </button>
                    {photoFiles.length > 0 && (
                      <button type="button" onClick={() => setPhotoFiles([])} className="text-[11px] text-red-400 hover:underline mt-0.5">
                        Прибрати
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-xs text-textSecondary uppercase tracking-wider">Додаткова інформація</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Номер контейнера">
                    <input value={form.containerNumber} onChange={(e) => set('containerNumber', e.target.value)} placeholder="MSCU1234567" className={inputCls} />
                  </Field>
                  <Field label="Посилання на лот">
                    <input value={form.lotUrl} onChange={(e) => set('lotUrl', e.target.value)} placeholder="https://copart.com/lot/..." className={inputCls} />
                  </Field>
                  <Field label="Вартість доставки (USD)">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.deliveryCost}
                      onChange={(e) => set('deliveryCost', e.target.value)}
                      placeholder="0"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Орієнтовна дата доставки">
                    <input
                      type="date"
                      value={form.estimatedDeliveryDate}
                      onChange={(e) => set('estimatedDeliveryDate', e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
                <Field label="Нотатки">
                  <textarea
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                    rows={2}
                    className={`${inputCls} resize-none`}
                    placeholder="Короткі нотатки..."
                  />
                </Field>
              </div>

              {!postCreateUpload && (
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-xs text-textSecondary uppercase tracking-wider">Документи (PDF)</p>
                <input
                  ref={docsInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? [])
                    if (files.length) setDocFiles((prev) => [...prev, ...files])
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => docsInputRef.current?.click()}
                  className={`w-full py-2 text-xs border rounded-md transition-colors ${
                    docFiles.length > 0
                      ? 'border-accent/40 text-accent'
                      : 'border-border text-textSecondary hover:border-accent/30 hover:text-textPrimary'
                  }`}
                >
                  {docFiles.length > 0 ? `${docFiles.length} PDF файл(ів)` : 'Вибрати PDF...'}
                </button>
                {docFiles.length > 0 && (
                  <button type="button" onClick={() => setDocFiles([])} className="text-[11px] text-red-400 hover:underline">
                    Прибрати документи
                  </button>
                )}
              </div>
              )}

              {uploadProgress && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-textSecondary">
                    <span>Завантаження файлів...</span>
                    <span>{uploadProgress.current}/{uploadProgress.total}</span>
                  </div>
                  <div className="h-1.5 bg-background rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {postCreateUpload && (
                <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4 space-y-3">
                  <p className="text-sm text-amber-400 font-medium">Авто створено</p>
                  <p className="text-xs text-textSecondary">
                    Не вдалося завантажити {postCreateUpload.failed.length} файл(ів):
                  </p>
                  <ul className="text-xs text-textSecondary space-y-1">
                    {postCreateUpload.failed.map((f, i) => (
                      <li key={i} className="truncate">{f.file.name}: {f.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border shrink-0 space-y-2">
              {errors._submit && <p className="text-xs text-red-400">{errors._submit}</p>}
              {Object.keys(errors).filter((k) => k !== '_submit').length > 0 && (
                <p className="text-xs text-red-400">
                  Заповніть обов'язкові поля ({Object.keys(errors).filter((k) => k !== '_submit').length}) ↑
                </p>
              )}
              {postCreateUpload ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleRetryUploads}
                    disabled={isPending || uploading}
                    className="flex-1 bg-accent text-background py-2.5 rounded-md text-sm font-semibold hover:bg-accent/90 transition-all disabled:opacity-50"
                  >
                    {uploading ? 'Завантаження...' : 'Повторити'}
                  </button>
                  <button
                    onClick={handleDismissPostCreate}
                    className="px-4 py-2.5 border border-border text-textSecondary rounded-md text-sm hover:text-textPrimary transition-all"
                  >
                    Закрити
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={isPending || uploading}
                  className="w-full bg-accent text-background py-2.5 rounded-md text-sm font-semibold hover:bg-accent/90 transition-all disabled:opacity-50"
                >
                  {isPending || uploading ? 'Збереження...' : 'Додати автомобіль'}
                </button>
              )}
            </div>
            </div>
          </div>
        </OverlayPortal>
      )}

      {showBulkExportModal && (
        <BulkExportModal
          vehicles={displayed.filter(v => selectedIds.has(v.id))}
          onClose={() => setShowBulkExportModal(false)}
        />
      )}

      {workModalVehicleId != null && (
        <VehicleWorkModal
          vehicleId={workModalVehicleId}
          repairTypes={repairTypes}
          registers={paymentRegisters}
          categories={expenseCategories}
          rates={paymentRates}
          userDefaultRegisterId={userDefaultRegisterId}
          canEditDict={canCreate}
          onClose={() => setWorkModalVehicleId(null)}
          onSaved={() => { notifyCrmRefresh(); router.refresh() }}
        />
      )}
    </>
  )
}
