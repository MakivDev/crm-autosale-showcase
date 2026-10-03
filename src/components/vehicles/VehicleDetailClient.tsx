'use client'

import { useState, useTransition, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDirtyState } from '@/contexts/DirtyStateContext'
import { toast } from 'sonner'
import {
  ArrowLeft, Pencil, X, Check, Trash2, Lock, Plus,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ShieldCheck, AlertTriangle, History, RotateCcw,
  ImagePlus, FileUp, FileText, Loader2, ZoomIn, Wrench, DollarSign,
  Clipboard, Download, HelpCircle, Car, MapPin, Calendar, ExternalLink, Package,
} from 'lucide-react'
import DateInput from '@/components/shared/DateInput'
import OverlayBackdrop from '@/components/shared/OverlayBackdrop'
import OverlayPortal from '@/components/shared/OverlayPortal'
import InlineAdd from '@/components/shared/InlineAdd'
import RecordAttribution from '@/components/shared/RecordAttribution'
import { addDictionaryItem } from '@/actions/dictionaries'
import {
  updateVehicle, changeVehicleStatus, deleteVehicle,
  deleteVehiclePhoto, deleteVehicleDocument,
  addVehicleDamage, deleteVehicleDamage, setCoverPhoto,
  createDamageTypeEntry,
  setVehicleCustomsCost, updateVehicleCustomsCost, removeVehicleCustomsCost,
  setVehiclePurchaseCost, updateVehiclePurchaseCost, removeVehiclePurchaseCost,
  saveVehicleDeliveryDetails, removeVehicleDeliveryCost, payVehicleDeliveryCost,
  updateRecommendedSalePrice,
  updateVehicleSaleDate,
  getCashRegistersForVehicleExpense,
} from '@/actions/vehicles'
import { updateTransaction, createTransaction, deleteTransaction } from '@/actions/finance'
import CommentsSection, { type CommentItem } from '@/components/comments/CommentsSection'
import { useHasPermission } from '@/contexts/PermissionsContext'
import StoRecordTable, { type StoRecordItem } from '@/components/sto/StoRecordTable'
import StoRecordModal from '@/components/sto/StoRecordModal'
import QuickExpenseModal from '@/components/vehicles/QuickExpenseModal'
import NegativeBalanceConfirmModal, { usePendingOverdraftConfirm } from '@/components/shared/NegativeBalanceConfirmModal'
import type { MonthRates, CashRegisterOption } from '@/lib/currency'
import {
  defaultRateForRegister,
  rateLabelForRegister,
  formatRateHint,
  amountToUsdAtSnapshot,
  formatUsdEquivalent,
  formatSnapshotRateLine,
  registerAmountToUsd,
  usdToRegisterAmount,
} from '@/lib/currency'
import { vehicleHasPurchase, isSaleTransaction, isPurchaseTransaction } from '@/lib/vehicle-finance'
import { statusRequiresPurchase, statusRequiresTransitData, SYSTEM_STATUS_SLUGS } from '@/lib/system-statuses'
import { dedupeVehiclePhotos } from '@/lib/vehicle-photos'
import { assetUrl } from '@/lib/upload-paths'
import { notifyCrmRefresh } from '@/lib/crm-refresh'
import { formatDate, formatIsoDateInAppTz, localTodayIso } from '@/lib/format-datetime'

// ─── Types ────────────────────────────────────────────────────────────────────

type Make = { id: number; name: string }
type ModelType = { id: number; name: string; makeId: number }
type Status = { id: number; name: string; isFinal: boolean; position: number; systemSlug: string | null; isSystem: boolean }
type FuelType = { id: number; name: string }
type DriveType = { id: number; name: string }
type Transmission = { id: number; name: string }
type PurchaseCountry = { id: number; name: string }

type Vehicle = {
  id: number
  vin: string
  manufactureYear: number | null
  engineVolume: unknown
  mileage: number | null
  customsCost: unknown
  customsPaidFromCash: boolean
  deliveryPaidFromCash: boolean
  containerNumber: string | null
  lotUrl: string | null
  deliveryCost: unknown
  estimatedDeliveryDate: string | Date | null
  notes: string | null
  buyerName: string | null
  buyerPhone: string | null
  recommendedSalePrice: unknown
  totalExpenses: number
  pendingCustoms: number
  pendingDelivery: number
  customsBalance: number
  customsPaymentStatus: 'unpaid' | 'partial' | 'paid' | 'none'
  customsAccruedUsd?: number
  customsPaidUsd?: number
  investedUsd: number
  purchaseCostUsd: number
  customsCostUsd: number
  deliveryCostUsd: number
  repairCostUsd: number
  otherCostUsd: number
  totalCostUsd: number
  salePriceUsd: number
  profitUsd: number | null
  Model: { id: number; name: string; makeId: number; Make: { id: number; name: string } }
  FuelType: FuelType | null
  DriveType: DriveType | null
  Transmission: Transmission | null
  PurchaseCountry: PurchaseCountry | null
  CurrentStatus: Status
  StatusHistory: {
    id: number
    createdAt: unknown
    Status: { name: string }
    User: { fullName: string }
  }[]
  Transactions: {
    id: number
    type: string
    amount: unknown
    createdAt: unknown
    description: string | null
    rateUsdSnapshot: unknown
    rateEurSnapshot: unknown
    transferId?: number | null
    ExpenseCategory: { id: number; name: string } | null
    CashRegister: { id: number; name: string; Currency: { code: string } }
    CreatedByUser?: { fullName: string; username: string } | null
    StoRecord?: {
      id: number
      amountUsd: unknown
      comment: string | null
      repairTypeId: number
      RepairType: { name: string }
    } | null
  }[]
  StoRecords: StoRecordItem[]
  Photos: { id: number; filePath: string; originalName: string; isCover: boolean; fileHash?: string | null; damageId?: number | null }[]
  Documents: { id: number; filePath: string; originalName: string }[]
  Damages: {
    id: number
    comment: string
    createdAt: unknown
    DamageType: { id: number; name: string }
    Photos: { id: number; filePath: string; originalName: string; isCover: boolean }[]
  }[]
  Comments: CommentItem[]
}

type DamageType = { id: number; name: string }

type Props = {
  vehicle: Vehicle
  makes: Make[]
  models: ModelType[]
  statuses: Status[]
  fuelTypes: FuelType[]
  driveTypes: DriveType[]
  transmissions: Transmission[]
  purchaseCountries: PurchaseCountry[]
  damageTypes: DamageType[]
  repairTypes: { id: number; name: string }[]
  expenseCategories: { id: number; name: string }[]
  currentUserId: number
  paymentRegisters: CashRegisterOption[]
  paymentRates: MonthRates
  canViewProfit?: boolean
  userDefaultRegisterId?: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent transition-colors'

const sectionScrollMt = 'scroll-mt-[calc(4rem+env(safe-area-inset-top,0px)+3.75rem)]'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-textSecondary uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-textSecondary">{label}</p>
      <div className="text-sm text-textPrimary mt-0.5">{value ?? '—'}</div>
    </div>
  )
}

function InfoChip({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  href?: string
}) {
  if (!value) return null
  const inner = (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background border border-border text-xs text-textSecondary">
      {Icon && <Icon className="w-3 h-3 shrink-0 text-accent/70" />}
      <span className="text-textSecondary/70">{label}:</span>
      <span className="text-textPrimary font-medium truncate max-w-[min(100%,10rem)] sm:max-w-[160px]">{value}</span>
      {href && <ExternalLink className="w-3 h-3 shrink-0 text-accent/60" />}
    </span>
  )
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="hover:border-accent/30 transition-colors">
        {inner}
      </a>
    )
  }
  return inner
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function fmt(date: unknown) {
  if (!date) return '—'
  return new Date(date as string).toLocaleDateString('uk-UA')
}

function expenseAuthor(t: Vehicle['Transactions'][0]) {
  return t.CreatedByUser
    ? { fullName: t.CreatedByUser.fullName, username: t.CreatedByUser.username }
    : null
}

function expenseStoRecord(t: Vehicle['Transactions'][0]) {
  return t.StoRecord ?? null
}

function expenseDetailLines(t: Vehicle['Transactions'][0]): string[] {
  const lines: string[] = []
  const sr = expenseStoRecord(t)
  if (sr) {
    lines.push(sr.RepairType.name)
    if (sr.comment) lines.push(sr.comment)
  }
  return lines
}

function expenseCategoryLabel(t: Vehicle['Transactions'][0]) {
  if (t.ExpenseCategory?.name) return t.ExpenseCategory.name
  if (t.description?.toLowerCase().includes('купівля')) return 'Купівля авто'
  if (
    t.description?.toLowerCase().includes('розмитнення') ||
    t.description?.toLowerCase().includes('мито')
  ) {
    return 'Митниця'
  }
  return '—'
}

function findCustomsTransaction(transactions: Vehicle['Transactions']) {
  return transactions.find(
    (t) =>
      (t.type === 'EXPENSE' || t.type === 'VEHICLE_INVEST') &&
      (t.description?.toLowerCase().includes('мито') ||
        t.description?.toLowerCase().includes('розмитнення'))
  )
}

function findPurchaseTransaction(transactions: Vehicle['Transactions']) {
  return transactions.find((t) => isPurchaseTransaction(t))
}

function expenseRowNeedsExpand(description: string | null | undefined, details: string[]) {
  const desc = description?.trim() ?? ''
  const detailsText = details.join('\n')
  return desc.length > 48 || detailsText.length > 48 || desc.includes('\n') || detailsText.includes('\n')
}

function ExpenseTableRow({
  t,
  details,
  editable,
  deletable,
  stoRecord,
  isReadOnly,
  confirmDelete,
  isPending,
  onEdit,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  t: Vehicle['Transactions'][0]
  details: string[]
  editable: boolean
  deletable: boolean
  stoRecord: ReturnType<typeof expenseStoRecord>
  isReadOnly: boolean
  confirmDelete: boolean
  isPending: boolean
  onEdit: () => void
  onAskDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const currencyCode = t.CashRegister.Currency.code
  const amount = Number(t.amount)
  const usd = amountToUsdAtSnapshot({
    amount,
    currencyCode,
    rateUsdSnapshot: t.rateUsdSnapshot,
    rateEurSnapshot: t.rateEurSnapshot,
  })
  const rateLine = formatSnapshotRateLine(
    currencyCode,
    t.rateUsdSnapshot,
    t.rateEurSnapshot
  )
  const descText = t.description?.trim() || '—'
  const detailsText = details.length > 0 ? details.join('\n') : '—'
  const needsExpand = expenseRowNeedsExpand(t.description, details)
  const previewClass = needsExpand ? 'line-clamp-1' : 'break-words'

  return (
    <>
      <tr
        className={`group align-top transition-colors ${
          expanded || confirmDelete ? 'bg-accent/[0.04]' : 'hover:bg-surfaceHover'
        }`}
      >
        <td className="px-4 py-3 whitespace-nowrap">
          <RecordAttribution at={t.createdAt} user={expenseAuthor(t)} />
        </td>
        <td className="px-4 py-3">
          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/10 text-accent border border-accent/20 whitespace-nowrap">
            {expenseCategoryLabel(t)}
          </span>
        </td>
        <td className="px-4 py-3 text-textPrimary">
          <p className={`text-sm leading-snug break-words ${previewClass}`}>{descText}</p>
        </td>
        <td className="px-4 py-3 hidden lg:table-cell">
          <p className={`text-xs text-textSecondary leading-snug break-words ${previewClass}`}>{detailsText}</p>
        </td>
        <td className="px-4 py-3 text-xs">
          <span className="text-textPrimary break-words">{t.CashRegister.name}</span>
          <span className="ml-1.5 text-[10px] text-textSecondary/50 font-mono">{currencyCode}</span>
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <div className="font-mono text-sm font-medium text-textPrimary tabular-nums">
            {amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
            <span className="text-[10px] text-textSecondary/60 font-normal">{currencyCode}</span>
          </div>
          {usd != null && currencyCode !== 'USD' && (
            <div className="text-xs text-accent/80 mt-0.5 font-mono tabular-nums">
              {formatUsdEquivalent(usd)}
            </div>
          )}
          {rateLine && (
            <div className="text-[10px] text-textSecondary/45 mt-0.5">{rateLine}</div>
          )}
        </td>
        <td className="px-3 py-3 align-middle">
          <div className="flex items-center justify-end gap-1.5">
            {needsExpand && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium border transition-colors whitespace-nowrap ${
                  expanded
                    ? 'bg-accent/15 border-accent/30 text-accent'
                    : 'bg-surface border-border text-textSecondary hover:text-accent hover:border-accent/30'
                }`}
              >
                {expanded ? (
                  <>Згорнути <ChevronUp className="w-3 h-3" /></>
                ) : (
                  <>Ще <ChevronDown className="w-3 h-3" /></>
                )}
              </button>
            )}
            {!isReadOnly && editable && (
              <button
                type="button"
                onClick={onEdit}
                className="p-1.5 rounded-md text-textSecondary hover:text-accent hover:bg-accent/10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                title={stoRecord ? 'Редагувати у секції СТО' : 'Редагувати'}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {!isReadOnly && deletable && (
              <button
                type="button"
                onClick={onAskDelete}
                disabled={isPending}
                className="p-1.5 rounded-md text-textSecondary hover:text-red-400 hover:bg-red-500/10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all disabled:opacity-50"
                title="Видалити (повернути в касу)"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
      {confirmDelete && (
        <tr className="bg-red-500/[0.04] border-b border-red-500/20">
          <td colSpan={7} className="px-4 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-red-400">
                Видалити витрату та повернути кошти в касу?
                {stoRecord ? ' Запис СТО також буде видалено.' : ''}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onConfirmDelete}
                  disabled={isPending}
                  className="px-3 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-50"
                >
                  {isPending ? 'Видалення...' : 'Так'}
                </button>
                <button
                  type="button"
                  onClick={onCancelDelete}
                  disabled={isPending}
                  className="px-3 py-1 rounded text-xs text-textSecondary hover:text-textPrimary transition-all disabled:opacity-50"
                >
                  Ні
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
      {expanded && needsExpand && (
        <tr className="bg-accent/[0.03] border-b border-border/80">
          <td colSpan={7} className="px-5 py-3.5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-textSecondary/70 mb-1.5">Опис</p>
                <p className="text-sm text-textPrimary whitespace-pre-wrap break-words leading-relaxed">{descText}</p>
              </div>
              {details.length > 0 && (
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-textSecondary/70 mb-1.5">Деталі</p>
                  <p className="text-sm text-textSecondary whitespace-pre-wrap break-words leading-relaxed">{detailsText}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function ExpenseMobileCard({
  t,
  details,
  editable,
  deletable,
  stoRecord,
  isReadOnly,
  confirmDelete,
  isPending,
  onEdit,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  t: Vehicle['Transactions'][0]
  details: string[]
  editable: boolean
  deletable: boolean
  stoRecord: ReturnType<typeof expenseStoRecord>
  isReadOnly: boolean
  confirmDelete: boolean
  isPending: boolean
  onEdit: () => void
  onAskDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}) {
  const currencyCode = t.CashRegister.Currency.code
  const amount = Number(t.amount)
  const usd = amountToUsdAtSnapshot({
    amount,
    currencyCode,
    rateUsdSnapshot: t.rateUsdSnapshot,
    rateEurSnapshot: t.rateEurSnapshot,
  })
  const rateLine = formatSnapshotRateLine(currencyCode, t.rateUsdSnapshot, t.rateEurSnapshot)
  const descText = t.description?.trim() || '—'

  return (
    <div className="p-4 border-b border-border last:border-b-0 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex max-w-[70%] px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/10 text-accent border border-accent/20 leading-tight">
          {expenseCategoryLabel(t)}
        </span>
        <RecordAttribution at={t.createdAt} user={expenseAuthor(t)} className="text-right shrink-0" />
      </div>
      <p className="text-sm text-textPrimary break-words leading-snug">{descText}</p>
      {details.length > 0 && (
        <p className="text-xs text-textSecondary break-words leading-relaxed">{details.join(' · ')}</p>
      )}
      <div className="flex items-end justify-between gap-3 pt-0.5">
        <div className="min-w-0 text-xs text-textSecondary">
          <span className="text-textPrimary break-words">{t.CashRegister.name}</span>
          <span className="ml-1 font-mono text-[10px]">{currencyCode}</span>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-sm font-medium text-textPrimary tabular-nums">
            {amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
            <span className="text-[10px] text-textSecondary/60 font-normal">{currencyCode}</span>
          </div>
          {usd != null && currencyCode !== 'USD' && (
            <div className="text-[11px] text-accent/80 mt-0.5 font-mono tabular-nums">{formatUsdEquivalent(usd)}</div>
          )}
        </div>
      </div>
      {rateLine && <p className="text-[10px] text-textSecondary/50">{rateLine}</p>}
      {!isReadOnly && (editable || deletable) && (
        <div className="flex flex-col sm:flex-row gap-2">
          {editable && (
            <button
              type="button"
              onClick={onEdit}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs text-textSecondary hover:text-accent hover:border-accent/30 transition-all"
            >
              <Pencil className="w-3.5 h-3.5" />
              {stoRecord ? 'Редагувати у СТО' : 'Редагувати'}
            </button>
          )}
          {deletable && (
            <button
              type="button"
              onClick={onAskDelete}
              disabled={isPending}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs text-textSecondary hover:text-red-400 hover:border-red-400/30 transition-all disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Видалити
            </button>
          )}
        </div>
      )}
      {confirmDelete && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-red-500/5 border border-red-500/20 rounded-lg">
          <p className="text-xs text-red-400">
            Видалити витрату та повернути кошти в касу?
            {stoRecord ? ' Запис СТО також буде видалено.' : ''}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={isPending}
              className="px-3 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-50"
            >
              {isPending ? 'Видалення...' : 'Так'}
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              disabled={isPending}
              className="px-3 py-1 rounded text-xs text-textSecondary hover:text-textPrimary transition-all disabled:opacity-50"
            >
              Ні
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function isExpenseEditable(t: Vehicle['Transactions'][0]) {
  return (
    (t.type === 'EXPENSE' || t.type === 'VEHICLE_INVEST') &&
    !t.transferId &&
    !t.StoRecord &&
    !isPurchaseTransaction(t)
  )
}

function isExpenseDeletable(t: Vehicle['Transactions'][0]) {
  return (t.type === 'EXPENSE' || t.type === 'VEHICLE_INVEST') && !t.transferId
}

// ─── Cash Register type ───────────────────────────────────────────────────────
type CashReg = { id: number; name: string; balance: number; currencyCode: string }

// ─── Inline Dict Add ──────────────────────────────────────────────────────────

function InlineDictAdd({
  placeholder,
  onAdd,
}: {
  placeholder: string
  onAdd: (name: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-accent hover:underline mt-1 flex items-center gap-1"
      >
        <Plus className="w-3 h-3" /> Додати в список
      </button>
    )
  }

  const doAdd = async () => {
    if (!val.trim() || saving) return
    setSaving(true)
    await onAdd(val.trim())
    setSaving(false)
    setVal('')
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-1 mt-1">
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === 'Enter') await doAdd()
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={placeholder}
        className="flex-1 bg-background border border-accent/40 rounded px-2 py-1 text-xs text-textPrimary focus:outline-none focus:border-accent"
      />
      <button
        type="button"
        disabled={saving || !val.trim()}
        onClick={doAdd}
        className="px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10 rounded border border-accent/30 disabled:opacity-40 whitespace-nowrap"
      >
        {saving ? '...' : 'Додати'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="p-1 text-textSecondary hover:text-textPrimary rounded">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Status Change Modal ──────────────────────────────────────────────────────

function StatusModal({
  statuses,
  currentId,
  vehicle,
  paymentRates,
  onClose,
  onConfirm,
  isPending,
  statusError,
  initialStatusId,
}: {
  statuses: Status[]
  currentId: number
  vehicle: Vehicle
  paymentRates: MonthRates
  onClose: () => void
  onConfirm: (statusId: number, opts?: {
    purchaseData?: { cashRegisterId: number; amount: number; customRate?: number | null }
    saleData?: {
      cashRegisterId: number
      amount: number
      buyerName: string
      buyerPhone: string
      customRate?: number | null
      saleDate?: string | null
    }
    transitData?: {
      containerNumber?: string | null
      deliveryCost?: number | null
      estimatedDeliveryDate?: string | null
      lotUrl?: string | null
    }
  }) => void
  isPending: boolean
  statusError?: string
  initialStatusId?: number
}) {
  const [selected, setSelected] = useState(initialStatusId ?? currentId)
  const [registers, setRegisters] = useState<CashReg[]>([])
  const prevSaleTx = vehicle.Transactions.find(isSaleTransaction)
  const recommendedPrice = vehicle.recommendedSalePrice != null ? Number(vehicle.recommendedSalePrice) : null

  const [purchaseRegisterId, setPurchaseRegisterId] = useState(0)
  const [purchaseAmount, setPurchaseAmount] = useState('')
  const [purchaseRate, setPurchaseRate] = useState('')
  const [purchaseRateTouched, setPurchaseRateTouched] = useState(false)

  const [saleRegisterId, setSaleRegisterId] = useState(0)
  const [saleAmount, setSaleAmount] = useState(() => {
    if (prevSaleTx) return String(Number(prevSaleTx.amount))
    if (recommendedPrice != null && recommendedPrice > 0) return String(recommendedPrice)
    return ''
  })
  const [saleRate, setSaleRate] = useState('')
  const [saleRateTouched, setSaleRateTouched] = useState(false)
  const [buyerName, setBuyerName] = useState(() => vehicle.buyerName ?? '')
  const [buyerPhone, setBuyerPhone] = useState(() => vehicle.buyerPhone ?? '')
  const [saleDate, setSaleDate] = useState(() => {
    if (prevSaleTx?.createdAt) {
      const iso = formatIsoDateInAppTz(prevSaleTx.createdAt)
      if (iso) return iso
    }
    return localTodayIso()
  })

  const [transitContainer, setTransitContainer] = useState(vehicle.containerNumber ?? '')
  const [transitDeliveryCost, setTransitDeliveryCost] = useState(
    vehicle.deliveryCost != null ? String(vehicle.deliveryCost) : ''
  )
  const [transitDeliveryDate, setTransitDeliveryDate] = useState(() => {
    if (!vehicle.estimatedDeliveryDate) return ''
    const d = new Date(vehicle.estimatedDeliveryDate)
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
  })
  const [transitLotUrl, setTransitLotUrl] = useState(vehicle.lotUrl ?? '')

  const purchaseReg = registers.find((r) => r.id === purchaseRegisterId)
  const saleReg = registers.find((r) => r.id === saleRegisterId)
  const purchaseCurrency = purchaseReg?.currencyCode ?? 'USD'
  const saleCurrency = saleReg?.currencyCode ?? 'USD'
  const purchaseDefaultRate = defaultRateForRegister(purchaseCurrency, paymentRates)
  const saleDefaultRate = defaultRateForRegister(saleCurrency, paymentRates)

  const selectedStatus = statuses.find((s) => s.id === selected)
  const slug = selectedStatus?.systemSlug ?? null
  const isChanged = selected !== currentId

  const hasPurchase = vehicleHasPurchase(vehicle.Transactions)

  const showPurchase =
    isChanged && !hasPurchase && statusRequiresPurchase(slug)
  const showSale = isChanged && slug === 'sold'
  const showTransit = isChanged && statusRequiresTransitData(slug)

  const saleUsdPreview = useMemo(() => {
    const amt = Number(saleAmount)
    if (!amt || !showSale) return null
    return registerAmountToUsd(
      amt,
      saleCurrency,
      paymentRates,
      saleRateTouched ? Number(saleRate) || null : null
    )
  }, [saleAmount, saleCurrency, paymentRates, saleRate, saleRateTouched, showSale])

  const loadedRef = useRef(false)
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    getCashRegistersForVehicleExpense().then(r => {
      setRegisters(r.data)
      if (r.data.length > 0) {
        const saleRegId = prevSaleTx?.CashRegister?.id
        const validSaleRegId = saleRegId && r.data.some((reg) => reg.id === saleRegId)
          ? saleRegId
          : r.data[0].id
        setPurchaseRegisterId(r.data[0].id)
        setSaleRegisterId(validSaleRegId)
      }
    })
  }, [])

  const canConfirm = (() => {
    if (!isChanged) return false
    if (showPurchase && (!purchaseRegisterId || !Number(purchaseAmount))) return false
    if (showSale) {
      if (!saleRegisterId || !Number(saleAmount)) return false
      if (!buyerName.trim() || !buyerPhone.trim()) return false
      if (!saleDate) return false
    }
    return true
  })()

  const handleConfirm = () => {
    const opts: Parameters<typeof onConfirm>[1] = {}
    if (showPurchase && Number(purchaseAmount)) {
      opts.purchaseData = {
        cashRegisterId: purchaseRegisterId,
        amount: Number(purchaseAmount),
        customRate: purchaseRateTouched ? Number(purchaseRate) || null : null,
      }
    }
    if (showSale) {
      opts.saleData = {
        cashRegisterId: saleRegisterId,
        amount: Number(saleAmount),
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim(),
        customRate: saleRateTouched ? Number(saleRate) || null : null,
        saleDate: saleDate || localTodayIso(),
      }
    }
    if (showTransit) {
      opts.transitData = {
        containerNumber: transitContainer.trim() || null,
        deliveryCost: transitDeliveryCost ? Number(transitDeliveryCost) : null,
        estimatedDeliveryDate: transitDeliveryDate || null,
        lotUrl: transitLotUrl.trim() || null,
      }
    }
    onConfirm(selected, showTransit || Object.keys(opts).length ? opts : undefined)
  }

  const inputCls2 = 'w-full bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent'
  const selectCls = 'w-full bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <OverlayBackdrop onDismiss={onClose} className="absolute inset-0 bg-black/70" />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-sm shadow-elevated max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="font-semibold text-textPrimary">Змінити статус</h3>
          <button onClick={onClose} className="text-textSecondary hover:text-textPrimary"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto">
          <div className="p-5 space-y-2">
            {statuses.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left text-sm transition-all border ${
                  selected === s.id
                    ? s.isFinal ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-accent/10 border-accent/40 text-accent'
                    : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-surfaceHover'
                }`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${selected === s.id ? (s.isFinal ? 'bg-emerald-400' : 'bg-accent') : 'bg-border'}`} />
                <span>{s.name}</span>
                {s.isSystem && <ShieldCheck className="w-3 h-3 ml-1 opacity-50" />}
                {s.isFinal && <span className="ml-auto text-[10px] text-textSecondary">Фінальний</span>}
                {s.id === currentId && <span className="ml-auto text-[10px] text-textSecondary">Поточний</span>}
              </button>
            ))}
          </div>

          {showPurchase && (
            <div className="px-5 pb-4 space-y-3 border-t border-border pt-4">
              <p className="text-xs text-accent font-medium">Купівля авто — перший внесок</p>
              <div>
                <label className="block text-xs text-textSecondary mb-1">Каса списання</label>
                <select
                  value={purchaseRegisterId}
                  onChange={(e) => {
                    const id = Number(e.target.value)
                    setPurchaseRegisterId(id)
                    setPurchaseRateTouched(false)
                    const reg = registers.find((r) => r.id === id)
                    const def = defaultRateForRegister(reg?.currencyCode ?? 'USD', paymentRates)
                    setPurchaseRate(def != null ? String(def) : '')
                  }}
                  className={selectCls}
                >
                  {registers.map(r => <option key={r.id} value={r.id}>{r.name} ({r.balance.toLocaleString()} {r.currencyCode})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">Сума *</label>
                <input type="number" value={purchaseAmount} onChange={e => setPurchaseAmount(e.target.value)} placeholder="0" className={inputCls2} />
              </div>
              {purchaseCurrency !== 'USD' && (
                <div>
                  <label className="block text-xs text-textSecondary mb-1">{rateLabelForRegister(purchaseCurrency)}</label>
                  <input
                    type="number"
                    step={0.0001}
                    value={purchaseRateTouched ? purchaseRate : purchaseDefaultRate != null ? String(purchaseDefaultRate) : ''}
                    onChange={(e) => { setPurchaseRateTouched(true); setPurchaseRate(e.target.value) }}
                    className={`${inputCls2} font-mono`}
                  />
                  <p className="text-[10px] text-textSecondary mt-1">{formatRateHint(purchaseCurrency, paymentRates)}</p>
                </div>
              )}
            </div>
          )}

          {showSale && (
            <div className="px-5 pb-4 space-y-3 border-t border-border pt-4">
              <p className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Продаж авто — фінальний статус
              </p>
              <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 shrink-0" /> Авто стане Read-Only після збереження.
              </p>
              <div>
                <label className="block text-xs text-textSecondary mb-1">Каса зарахування</label>
                <select
                  value={saleRegisterId}
                  onChange={(e) => {
                    const id = Number(e.target.value)
                    setSaleRegisterId(id)
                    setSaleRateTouched(false)
                    const reg = registers.find((r) => r.id === id)
                    const def = defaultRateForRegister(reg?.currencyCode ?? 'USD', paymentRates)
                    setSaleRate(def != null ? String(def) : '')
                  }}
                  className={selectCls}
                >
                  {registers.map(r => <option key={r.id} value={r.id}>{r.name} ({r.balance.toLocaleString()} {r.currencyCode})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">Ціна продажу * ({saleCurrency})</label>
                <input type="number" value={saleAmount} onChange={e => setSaleAmount(e.target.value)} placeholder="0" className={inputCls2} />
                {saleUsdPreview != null && saleCurrency !== 'USD' && (
                  <p className="text-[11px] text-accent font-mono mt-1">{formatUsdEquivalent(saleUsdPreview)}</p>
                )}
              </div>
              {saleCurrency !== 'USD' && (
                <div>
                  <label className="block text-xs text-textSecondary mb-1">{rateLabelForRegister(saleCurrency)}</label>
                  <input
                    type="number"
                    step={0.0001}
                    value={saleRateTouched ? saleRate : saleDefaultRate != null ? String(saleDefaultRate) : ''}
                    onChange={(e) => { setSaleRateTouched(true); setSaleRate(e.target.value) }}
                    className={`${inputCls2} font-mono`}
                  />
                  <p className="text-[10px] text-textSecondary mt-1">{formatRateHint(saleCurrency, paymentRates)}</p>
                </div>
              )}
              <div>
                <label className="block text-xs text-textSecondary mb-1">Дата продажу *</label>
                <DateInput
                  value={saleDate}
                  onChange={setSaleDate}
                  max={localTodayIso()}
                  className={inputCls2}
                />
                <p className="text-[10px] text-textSecondary mt-1">Для статистики за місяць продажу</p>
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">ПІБ покупця *</label>
                <input value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="Іваненко Іван Іванович" className={inputCls2} />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">Телефон *</label>
                <input value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} placeholder="+380..." className={inputCls2} />
              </div>
            </div>
          )}

          {showTransit && (
            <div className="px-5 pb-4 space-y-3 border-t border-border pt-4">
              <p className="text-xs text-cyan-400 font-medium">Дані доставки (необовʼязково)</p>
              <div>
                <label className="block text-xs text-textSecondary mb-1">Номер контейнера</label>
                <input value={transitContainer} onChange={(e) => setTransitContainer(e.target.value)} placeholder="MSCU1234567" className={inputCls2} />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">Вартість доставки (USD)</label>
                <input type="number" value={transitDeliveryCost} onChange={(e) => setTransitDeliveryCost(e.target.value)} placeholder="0" className={inputCls2} />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">Орієнтовна дата доставки</label>
                <input type="date" value={transitDeliveryDate} onChange={(e) => setTransitDeliveryDate(e.target.value)} className={inputCls2} />
              </div>
              <div>
                <label className="block text-xs text-textSecondary mb-1">Посилання на лот</label>
                <input type="url" value={transitLotUrl} onChange={(e) => setTransitLotUrl(e.target.value)} placeholder="https://..." className={inputCls2} />
              </div>
            </div>
          )}
        </div>

        {statusError && (
          <p className="px-5 pb-2 text-xs text-red-400">{statusError}</p>
        )}

        <div className="px-5 pb-5 pt-3 border-t border-border shrink-0 flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={isPending || !canConfirm}
            className="flex-1 bg-accent/10 border border-accent text-accent py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accentOn transition-all disabled:opacity-40"
          >
            {isPending ? '...' : 'Підтвердити'}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-border text-textSecondary rounded-md text-sm hover:text-textPrimary">
            Скасувати
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteModal({
  vehicle,
  onClose,
  onConfirm,
  isPending,
}: {
  vehicle: Vehicle
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
}) {
  const [phrase, setPhrase] = useState('')
  const required = vehicle.vin

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <OverlayBackdrop onDismiss={onClose} className="absolute inset-0 bg-black/70" />
      <div className="relative bg-surface border border-red-500/30 rounded-xl w-full max-w-sm shadow-elevated">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-red-400 flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Видалення авто
          </h3>
          <button onClick={onClose} className="text-textSecondary hover:text-textPrimary"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="p-3 rounded-lg bg-red-950/30 border border-red-500/20 text-xs text-textSecondary space-y-1">
            <p>Будуть <strong className="text-red-400">незворотно видалені</strong>:</p>
            <p>• Вся картка авто та її дані</p>
            <p>• Пошкодження, фото, документи</p>
            <p>• Ремонтні роботи та їх витрати</p>
            <p className="text-textSecondary/60 mt-2">Транзакції <strong className="text-textSecondary">залишаться</strong> в касах (зв'язок обнулиться).</p>
          </div>
          <div>
            <label className="block text-xs text-textSecondary mb-1.5">
              Введіть VIN для підтвердження: <span className="font-mono text-textPrimary">{required}</span>
            </label>
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={required}
              className={`${inputCls} font-mono border-red-500/30 focus:border-red-500`}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={onConfirm}
              disabled={isPending || phrase !== required}
              className="flex-1 bg-red-500/10 border border-red-500 text-red-400 py-2 rounded-md text-sm font-medium hover:bg-red-500 hover:text-white transition-all disabled:opacity-40"
            >
              {isPending ? 'Видалення...' : 'Видалити назавжди'}
            </button>
            <button onClick={onClose} className="px-4 py-2 border border-border text-textSecondary rounded-md text-sm hover:text-textPrimary">
              Скасувати
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Expense Edit Modal ───────────────────────────────────────────────────────

function ExpenseEditModal({
  transaction,
  vehicleId,
  registers,
  categories,
  rates,
  onClose,
  onSaved,
}: {
  transaction: Vehicle['Transactions'][0]
  vehicleId: number
  registers: CashRegisterOption[]
  categories: { id: number; name: string }[]
  rates: MonthRates
  onClose: () => void
  onSaved: () => void
}) {
  const [amount, setAmount] = useState(String(Number(transaction.amount)))
  const [description, setDescription] = useState(transaction.description ?? '')
  const [categoryId, setCategoryId] = useState(
    transaction.ExpenseCategory ? String(transaction.ExpenseCategory.id) : ''
  )
  const [registerId, setRegisterId] = useState(String(transaction.CashRegister.id))
  const [rate, setRate] = useState('')
  const [rateTouched, setRateTouched] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const selectedRegister = registers.find((r) => r.id === Number(registerId))
  const currencyCode = selectedRegister?.currencyCode ?? transaction.CashRegister.Currency.code
  const defaultRate = defaultRateForRegister(currencyCode, rates)

  useEffect(() => {
    const code = transaction.CashRegister.Currency.code
    if (code === 'UAH' && transaction.rateUsdSnapshot) {
      setRate(String(transaction.rateUsdSnapshot))
    } else if (code === 'EUR' && transaction.rateEurSnapshot) {
      setRate(String(transaction.rateEurSnapshot))
    } else if (defaultRate != null) {
      setRate(String(defaultRate))
    }
  }, [transaction, defaultRate])

  const handleRegisterChange = (id: string) => {
    setRegisterId(id)
    setRateTouched(false)
    const reg = registers.find((r) => r.id === Number(id))
    const def = defaultRateForRegister(reg?.currencyCode ?? 'USD', rates)
    setRate(def != null ? String(def) : '')
  }

  const usdPreview =
    currencyCode === 'USD'
      ? Number(amount) || 0
      : registerAmountToUsd(
          Number(amount) || 0,
          currencyCode,
          rates,
          rateTouched ? Number(rate) || null : null
        )

  const handleSave = () => {
    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) return setError('Введіть коректну суму')
    startTransition(async () => {
      const res = await updateTransaction({
        transactionId: transaction.id,
        cashRegisterId: Number(registerId),
        amount: numAmount,
        expenseCategoryId: categoryId ? Number(categoryId) : null,
        vehicleId,
        description: description.trim() || undefined,
        customRate: rateTouched ? Number(rate) || null : null,
      })
      if (res.success) {
        onSaved()
        onClose()
      } else {
        setError(res.error ?? 'Помилка')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <OverlayBackdrop onDismiss={onClose} className="absolute inset-0 bg-black/70" />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-md shadow-elevated">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-textPrimary">Редагування витрати</h3>
          <button onClick={onClose} className="text-textSecondary hover:text-textPrimary"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <Field label="Каса *">
            <select value={registerId} onChange={(e) => handleRegisterChange(e.target.value)} className={inputCls}>
              {registers.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({r.currencyCode})</option>
              ))}
            </select>
          </Field>
          {currencyCode !== 'USD' && (
            <Field label={rateLabelForRegister(currencyCode) ?? 'Курс'}>
              <input
                type="number"
                min={0}
                step={0.0001}
                value={rate}
                onChange={(e) => { setRateTouched(true); setRate(e.target.value) }}
                className={`${inputCls} font-mono`}
              />
              <p className="text-[10px] text-textSecondary mt-1">{formatRateHint(currencyCode, rates)}</p>
            </Field>
          )}
          <Field label={`Сума (${currencyCode}) *`}>
            <input
              type="number"
              min={0}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputCls} font-mono`}
            />
            {usdPreview != null && currencyCode !== 'USD' && (
              <p className="text-xs text-textSecondary mt-1 font-mono">{formatUsdEquivalent(usdPreview)}</p>
            )}
          </Field>
          <Field label="Категорія">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
              <option value="">— Не задано —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Опис">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </Field>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-2">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex-1 bg-accent text-background py-2 rounded-md text-sm font-semibold hover:bg-accent/90 disabled:opacity-50"
          >
            {isPending ? 'Збереження...' : 'Зберегти'}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-border text-textSecondary rounded-md text-sm">Скасувати</button>
        </div>
      </div>
    </div>
  )
}

// ─── Vehicle Export Modal ─────────────────────────────────────────────────────

const EXPORT_BASE_FIELDS = [
  { key: 'vin', label: 'VIN' },
  { key: 'makeModel', label: 'Марка / Модель' },
  { key: 'year', label: 'Рік' },
  { key: 'engine', label: 'Двигун' },
  { key: 'fuelType', label: 'Паливо' },
  { key: 'purchaseCountry', label: 'Країна купівлі' },
  { key: 'driveType', label: 'Привід' },
  { key: 'transmission', label: 'КПП' },
  { key: 'mileage', label: 'Пробіг (км)' },
  { key: 'status', label: 'Статус' },
  { key: 'purchaseCost', label: 'Закупівля ($)' },
  { key: 'deliveryCost', label: 'Доставка ($)' },
  { key: 'customsCost', label: 'Митниця ($)' },
  { key: 'repairCost', label: 'Ремонти ($)' },
  { key: 'otherCost', label: 'Інші витрати ($)' },
  { key: 'totalCost', label: 'Собівартість ($)' },
  { key: 'salePrice', label: 'Ціна продажу ($)' },
  { key: 'profit', label: 'Вигода ($)' },
  { key: 'containerNumber', label: 'Контейнер' },
  { key: 'lotUrl', label: 'Посилання на лот' },
  { key: 'notes', label: 'Нотатки' },
  { key: 'buyerName', label: 'Покупець' },
  { key: 'buyerPhone', label: 'Телефон покупця' },
]

function csvEsc(v: string) { return `"${v.replace(/"/g, '""')}"` }
function csvRow(cols: string[]) { return cols.map(csvEsc).join(';') }
function fmtDate(iso: unknown) {
  if (!iso) return ''
  try { return new Date(String(iso)).toLocaleDateString('uk-UA') } catch { return '' }
}
function fmtMoney(n: unknown) {
  const num = Number(n)
  return isNaN(num) ? '' : num.toFixed(2)
}

function VehicleExportModal({
  vehicle,
  onClose,
}: {
  vehicle: Vehicle
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(EXPORT_BASE_FIELDS.map((f) => f.key))
  )
  const [includeRepairs, setIncludeRepairs] = useState(true)
  const [includeDamages, setIncludeDamages] = useState(true)
  const [includeTransactions, setIncludeTransactions] = useState(true)
  const [includeStatusHistory, setIncludeStatusHistory] = useState(false)

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleExport = () => {
    const sep = ';'
    const sections: string[] = []

    const has = (k: string) => selected.has(k)

    const baseHeaders: string[] = []
    const baseValues: string[] = []
    const addBase = (label: string, value: string) => { baseHeaders.push(label); baseValues.push(value) }

    if (has('vin')) addBase('VIN', vehicle.vin)
    if (has('makeModel')) addBase('Марка/Модель', `${vehicle.Model.Make.name} ${vehicle.Model.name}`)
    if (has('year')) addBase('Рік', String(vehicle.manufactureYear))
    if (has('engine')) addBase('Двигун', vehicle.engineVolume ? `${vehicle.engineVolume}L` : '')
    if (has('fuelType')) addBase('Паливо', vehicle.FuelType?.name ?? '')
    if (has('purchaseCountry')) addBase('Країна купівлі', vehicle.PurchaseCountry?.name ?? '')
    if (has('driveType')) addBase('Привід', vehicle.DriveType?.name ?? '')
    if (has('transmission')) addBase('КПП', vehicle.Transmission?.name ?? '')
    if (has('mileage')) addBase('Пробіг (км)', vehicle.mileage != null ? String(vehicle.mileage) : '')
    if (has('status')) addBase('Статус', vehicle.CurrentStatus.name)
    if (has('purchaseCost')) addBase('Закупівля ($)', vehicle.purchaseCostUsd.toFixed(2))
    if (has('deliveryCost')) addBase('Доставка ($)', vehicle.deliveryCostUsd.toFixed(2))
    if (has('customsCost')) addBase('Митниця ($)', vehicle.customsCostUsd.toFixed(2))
    if (has('repairCost')) addBase('Ремонти ($)', vehicle.repairCostUsd.toFixed(2))
    if (has('otherCost')) addBase('Інші витрати ($)', vehicle.otherCostUsd.toFixed(2))
    if (has('totalCost')) addBase('Собівартість ($)', vehicle.totalCostUsd.toFixed(2))
    if (has('salePrice')) addBase('Ціна продажу ($)', vehicle.salePriceUsd.toFixed(2))
    if (has('profit')) addBase('Вигода ($)', vehicle.profitUsd != null ? vehicle.profitUsd.toFixed(2) : '')
    if (has('containerNumber')) addBase('Контейнер', vehicle.containerNumber ?? '')
    if (has('lotUrl')) addBase('Посилання на лот', vehicle.lotUrl ?? '')
    if (has('notes')) addBase('Нотатки', vehicle.notes ?? '')
    if (has('buyerName')) addBase('Покупець', vehicle.buyerName ?? '')
    if (has('buyerPhone')) addBase('Телефон', vehicle.buyerPhone ?? '')

    if (baseHeaders.length > 0) {
      sections.push(
        csvRow(['=== Основна інформація ===']),
        csvRow(baseHeaders),
        csvRow(baseValues)
      )
    }

    if (includeRepairs && vehicle.StoRecords.length > 0) {
      sections.push('')
      sections.push(csvRow(['=== СТО ===']))
      sections.push(csvRow(['Категорія', 'Сума ($)', 'Каса', 'Коментар', 'Дата', 'Виконавець']))
      vehicle.StoRecords.forEach((r) => {
        sections.push(csvRow([
          r.RepairType.name,
          Number(r.amountUsd).toFixed(2),
          r.CashRegister.name,
          r.comment ?? '',
          fmtDate(r.createdAt),
          r.User?.fullName ?? '',
        ]))
      })
    }

    if (includeDamages && vehicle.Damages.length > 0) {
      sections.push('')
      sections.push(csvRow(['=== Пошкодження ===']))
      sections.push(csvRow(['Тип пошкодження', 'Коментар', 'Дата', 'Фото']))
      vehicle.Damages.forEach(d => {
        sections.push(csvRow([
          d.DamageType.name,
          d.comment,
          fmtDate(d.createdAt),
          String(d.Photos.length),
        ]))
      })
    }

    if (includeTransactions && vehicle.Transactions.length > 0) {
      sections.push('')
      sections.push(csvRow(['=== Фінансові операції ===']))
      sections.push(csvRow(['Тип', 'Сума', 'Валюта', 'Сума USD', 'Категорія', 'Опис', 'Каса', 'Дата']))
      vehicle.Transactions.forEach(t => {
        const typeLabel =
          t.type === 'INCOME' ? 'Дохід' :
          t.type === 'DEPOSIT' ? 'Поповнення' :
          t.type === 'WITHDRAW' ? 'Вивід' :
          t.type === 'VEHICLE_INVEST' ? 'Вложення' :
          t.type === 'EXPENSE' ? 'Витрата' :
          t.type === 'TRANSFER_IN' ? 'Переказ (вхід)' :
          t.type === 'TRANSFER_OUT' ? 'Переказ (вихід)' : t.type
        const currency = t.CashRegister?.Currency?.code ?? ''
        const amountUsd =
          currency === 'UAH' && t.rateUsdSnapshot
            ? (Number(t.amount) / Number(t.rateUsdSnapshot)).toFixed(2)
            : currency === 'EUR' && t.rateEurSnapshot
              ? (Number(t.amount) * Number(t.rateEurSnapshot) / Number(t.rateUsdSnapshot || 1)).toFixed(2)
              : fmtMoney(t.amount)
        sections.push(csvRow([
          typeLabel,
          fmtMoney(t.amount),
          currency,
          amountUsd,
          t.ExpenseCategory?.name ?? '',
          t.description ?? '',
          t.CashRegister?.name ?? '',
          fmtDate(t.createdAt),
        ]))
      })
    }

    if (includeStatusHistory && vehicle.StatusHistory.length > 0) {
      sections.push('')
      sections.push(csvRow(['=== Історія статусів ===']))
      sections.push(csvRow(['Статус', 'Змінив', 'Дата']))
      vehicle.StatusHistory.forEach(h => {
        sections.push(csvRow([
          h.Status.name,
          h.User.fullName,
          fmtDate(h.createdAt),
        ]))
      })
    }

    const csv = sections.join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${vehicle.vin}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    onClose()
  }

  const sectionToggle = (label: string, checked: boolean, onChange: (v: boolean) => void, count?: number) => (
    <label className="flex items-center gap-2 cursor-pointer group py-1.5 border-b border-border/50 last:border-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-3.5 h-3.5 accent-cyan-400 shrink-0"
      />
      <span className="text-sm text-textSecondary group-hover:text-textPrimary transition-colors flex-1">{label}</span>
      {count != null && <span className="text-xs text-textSecondary/60 bg-border px-1.5 py-0.5 rounded">{count}</span>}
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <OverlayBackdrop onDismiss={onClose} className="absolute inset-0 bg-black/70" />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-lg shadow-elevated flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="font-semibold text-textPrimary flex items-center gap-2">
            <Download className="w-4 h-4 text-accent" /> Експорт: {vehicle.vin}
          </h3>
          <button onClick={onClose} className="text-textSecondary hover:text-textPrimary"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-textSecondary uppercase tracking-wider">Основна інформація</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setSelected(new Set(EXPORT_BASE_FIELDS.map(f => f.key)))} className="text-[10px] text-accent hover:underline">Вибрати всі</button>
                <button type="button" onClick={() => setSelected(new Set())} className="text-[10px] text-textSecondary hover:underline">Зняти всі</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {EXPORT_BASE_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 cursor-pointer group py-0.5">
                  <input
                    type="checkbox"
                    checked={selected.has(f.key)}
                    onChange={() => toggle(f.key)}
                    className="w-3.5 h-3.5 accent-cyan-400"
                  />
                  <span className="text-xs text-textSecondary group-hover:text-textPrimary transition-colors">{f.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-textSecondary uppercase tracking-wider mb-2">Додаткові розділи</p>
            <div className="bg-background/50 rounded-lg px-3 py-1 border border-border">
              {sectionToggle(
                'Ремонти та записи витрат',
                includeRepairs,
                setIncludeRepairs,
                vehicle.StoRecords.length
              )}
              {sectionToggle(
                'Пошкодження',
                includeDamages,
                setIncludeDamages,
                vehicle.Damages.length
              )}
              {sectionToggle(
                'Фінансові операції',
                includeTransactions,
                setIncludeTransactions,
                vehicle.Transactions.length
              )}
              {sectionToggle(
                'Історія статусів',
                includeStatusHistory,
                setIncludeStatusHistory,
                vehicle.StatusHistory.length
              )}
            </div>
          </div>

          <p className="text-[10px] text-textSecondary/60 leading-relaxed">
            Файл CSV з кількома секціями — кожен розділ починається із заголовка. Відкривається в Excel / LibreOffice.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-border flex gap-2 shrink-0">
          <button
            onClick={handleExport}
            disabled={selected.size === 0 && !includeRepairs && !includeDamages && !includeTransactions && !includeStatusHistory}
            className="flex-1 flex items-center justify-center gap-1.5 bg-accent text-background py-2 rounded-md text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 transition-all"
          >
            <Download className="w-3.5 h-3.5" /> Завантажити CSV
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-border text-textSecondary rounded-md text-sm hover:text-textPrimary transition-colors">Скасувати</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VehicleDetailClient({
  vehicle: initialVehicle,
  makes,
  models,
  statuses,
  fuelTypes,
  driveTypes,
  transmissions,
  purchaseCountries,
  damageTypes: initialDamageTypes,
  repairTypes,
  expenseCategories,
  currentUserId,
  paymentRegisters,
  paymentRates,
  canViewProfit = true,
  userDefaultRegisterId = null,
}: Props) {
  const router = useRouter()
  const dirtyCtx = useDirtyState()
  const canEdit = useHasPermission('vehicles.edit')
  const canDelete = useHasPermission('vehicles.delete')
  const canExport = useHasPermission('reports.export')
  const canEditDict = useHasPermission('dictionaries.edit')
  const canChangeStatus = useHasPermission('vehicles.status')
  const canCreateExpense = useHasPermission('finance.create')
  const canDeleteExpense = useHasPermission('finance.delete')
  const canCreateRepair = useHasPermission('repair.create')
  const canEditRepair = useHasPermission('repair.edit')
  const canDeleteRepair = useHasPermission('repair.delete')
  const canUploadDocs = useHasPermission('documents.upload')
  const canDeleteDocs = useHasPermission('documents.delete')
  const [isPending, startTransition] = useTransition()
  const { pending: overdraftPending, confirmIfNeeded, handleConfirm: handleOverdraftConfirm, handleCancel: handleOverdraftCancel } =
    usePendingOverdraftConfirm()
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [showDiscardEditConfirm, setShowDiscardEditConfirm] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [statusModalInitialId, setStatusModalInitialId] = useState<number | undefined>(undefined)
  const [statusError, setStatusError] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showStoModal, setShowStoModal] = useState(false)
  const [editStoRecord, setEditStoRecord] = useState<StoRecordItem | null>(null)
  const [editingExpense, setEditingExpense] = useState<Vehicle['Transactions'][0] | null>(null)
  const [error, setError] = useState('')
  const [showQuickExpense, setShowQuickExpense] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null)
  const [draftRestoredFields, setDraftRestoredFields] = useState<string[]>([])
  const [editingRecommendedPrice, setEditingRecommendedPrice] = useState(false)
  const [recommendedPriceInput, setRecommendedPriceInput] = useState('')
  const [recommendedPriceError, setRecommendedPriceError] = useState('')
  const [editingSaleDate, setEditingSaleDate] = useState(false)
  const [saleDateInput, setSaleDateInput] = useState('')
  const [saleDateError, setSaleDateError] = useState('')
  const saveEditRef = useRef<() => void>(() => {})

  const photoInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const damagePhotoInputRef = useRef<HTMLInputElement>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [lightboxPhotos, setLightboxPhotos] = useState<{ id: number; filePath: string; originalName: string }[]>([])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const [damageTypes, setDamageTypes] = useState(initialDamageTypes)
  const [showDamageForm, setShowDamageForm] = useState(false)
  const [damageForm, setDamageForm] = useState({ damageTypeId: 0, comment: '' })
  const [uploadingDamagePhoto, setUploadingDamagePhoto] = useState<number | null>(null)
  const [activeDamageId, setActiveDamageId] = useState<number | null>(null)

  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<number | null>(null)
  const [photoActionsId, setPhotoActionsId] = useState<number | null>(null)

  useEffect(() => {
    if (confirmDeletePhotoId == null) return
    const t = window.setTimeout(() => setConfirmDeletePhotoId(null), 4000)
    return () => window.clearTimeout(t)
  }, [confirmDeletePhotoId])

  const [customsMode, setCustomsMode] = useState<'view' | 'set' | 'edit'>('view')
  const [customsInput, setCustomsInput] = useState('')
  const [customsError, setCustomsError] = useState('')
  const [customsPaymentMode, setCustomsPaymentMode] = useState<'debt' | 'cash'>('debt')
  const [customsRegisterId, setCustomsRegisterId] = useState(0)
  const [customsRate, setCustomsRate] = useState('')
  const [customsRateTouched, setCustomsRateTouched] = useState(false)
  const [showCustomsDeleteConfirm, setShowCustomsDeleteConfirm] = useState(false)

  const [deliveryMode, setDeliveryMode] = useState<'view' | 'set' | 'edit' | 'pay'>('view')
  const [deliveryForm, setDeliveryForm] = useState({
    cost: '',
    estimatedDeliveryDate: '',
    containerNumber: '',
    lotUrl: '',
  })
  const [deliveryError, setDeliveryError] = useState('')
  const [deliveryRegisterId, setDeliveryRegisterId] = useState(0)
  const [deliveryRate, setDeliveryRate] = useState('')
  const [deliveryRateTouched, setDeliveryRateTouched] = useState(false)
  const [showDeliveryDeleteConfirm, setShowDeliveryDeleteConfirm] = useState(false)

  const [purchaseMode, setPurchaseMode] = useState<'view' | 'set' | 'edit'>('view')
  const [purchaseInput, setPurchaseInput] = useState('')
  const [purchaseError, setPurchaseError] = useState('')
  const [purchaseRegisterId, setPurchaseRegisterId] = useState(0)
  const [purchaseRate, setPurchaseRate] = useState('')
  const [purchaseRateTouched, setPurchaseRateTouched] = useState(false)
  const [showPurchaseDeleteConfirm, setShowPurchaseDeleteConfirm] = useState(false)
  const [deleteExpenseId, setDeleteExpenseId] = useState<number | null>(null)

  const [expenseCategoriesLocal, setExpenseCategoriesLocal] = useState(expenseCategories)

  const vehicle = initialVehicle
  const isReadOnly = vehicle.CurrentStatus.isFinal
  const saleTx = vehicle.Transactions.find(isSaleTransaction)
  const saleDateIso = saleTx?.createdAt ? formatIsoDateInAppTz(saleTx.createdAt) : ''
  const canEditSaleDate = (canEdit || canChangeStatus) && !!saleTx && vehicle.CurrentStatus.systemSlug === 'sold'

  const defaultPaymentRegisterId =
    userDefaultRegisterId && paymentRegisters.some((r) => r.id === userDefaultRegisterId)
      ? userDefaultRegisterId
      : paymentRegisters[0]?.id ?? 0

  useEffect(() => {
    setExpenseCategoriesLocal(expenseCategories)
  }, [expenseCategories])

  useEffect(() => {
    if (customsRegisterId === 0 && defaultPaymentRegisterId) setCustomsRegisterId(defaultPaymentRegisterId)
    if (deliveryRegisterId === 0 && defaultPaymentRegisterId) setDeliveryRegisterId(defaultPaymentRegisterId)
    if (purchaseRegisterId === 0 && defaultPaymentRegisterId) setPurchaseRegisterId(defaultPaymentRegisterId)
  }, [defaultPaymentRegisterId, customsRegisterId, deliveryRegisterId, purchaseRegisterId])

  const buildEditForm = () => ({
    vin: vehicle.vin,
    makeId: vehicle.Model.makeId,
    modelId: vehicle.Model.id,
    fuelTypeId: vehicle.FuelType?.id ?? 0,
    driveTypeId: vehicle.DriveType?.id ?? 0,
    transmissionId: vehicle.Transmission?.id ?? 0,
    purchaseCountryId: vehicle.PurchaseCountry?.id ?? 0,
    manufactureYear: vehicle.manufactureYear ?? '',
    engineVolume: vehicle.engineVolume ? String(vehicle.engineVolume) : '',
    mileage: vehicle.mileage != null ? String(vehicle.mileage) : '',
    containerNumber: vehicle.containerNumber ?? '',
    lotUrl: vehicle.lotUrl ?? '',
    notes: vehicle.notes ?? '',
    buyerName: vehicle.buyerName ?? '',
    buyerPhone: vehicle.buyerPhone ?? '',
    purchaseCostUsd: vehicle.purchaseCostUsd > 0 ? String(vehicle.purchaseCostUsd) : '',
  })

  const [editForm, setEditForm] = useState(buildEditForm)

  const editFilteredModels = useMemo(
    () => models.filter((m) => m.makeId === editForm.makeId),
    [models, editForm.makeId]
  )

  const isDirty = mode === 'edit' && (
    editForm.vin !== vehicle.vin ||
    editForm.makeId !== vehicle.Model.makeId ||
    editForm.modelId !== vehicle.Model.id ||
    editForm.fuelTypeId !== (vehicle.FuelType?.id ?? 0) ||
    editForm.driveTypeId !== (vehicle.DriveType?.id ?? 0) ||
    editForm.transmissionId !== (vehicle.Transmission?.id ?? 0) ||
    editForm.purchaseCountryId !== (vehicle.PurchaseCountry?.id ?? 0) ||
    String(editForm.manufactureYear) !== String(vehicle.manufactureYear ?? '') ||
    editForm.engineVolume !== (vehicle.engineVolume ? String(vehicle.engineVolume) : '') ||
    editForm.mileage !== (vehicle.mileage != null ? String(vehicle.mileage) : '') ||
    editForm.containerNumber !== (vehicle.containerNumber ?? '') ||
    editForm.lotUrl !== (vehicle.lotUrl ?? '') ||
    editForm.notes !== (vehicle.notes ?? '') ||
    editForm.purchaseCostUsd !== (vehicle.purchaseCostUsd > 0 ? String(vehicle.purchaseCostUsd) : '')
  )

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  useEffect(() => {
    const draftKey = `draft_vehicle_${vehicle.id}`
    const saved = localStorage.getItem(draftKey)
    if (saved) {
      try {
        const { data, savedAt, changedFields } = JSON.parse(saved)
        setEditForm(data)
        setMode('edit')
        setDraftRestoredAt(savedAt)
        setDraftRestoredFields(changedFields ?? [])
      } catch {
        localStorage.removeItem(draftKey)
      }
    }
  }, [vehicle.id])

  const changedFieldsRef = useRef<string[]>([])
  changedFieldsRef.current = (() => {
    if (!isDirty) return []
    const LABELS: [boolean, string][] = [
      [editForm.vin !== vehicle.vin, 'VIN'],
      [editForm.makeId !== vehicle.Model.makeId, 'Марка'],
      [editForm.modelId !== vehicle.Model.id, 'Модель'],
      [editForm.fuelTypeId !== (vehicle.FuelType?.id ?? 0), 'Тип палива'],
      [editForm.driveTypeId !== (vehicle.DriveType?.id ?? 0), 'Привід'],
      [editForm.transmissionId !== (vehicle.Transmission?.id ?? 0), 'Трансмісія'],
      [editForm.purchaseCountryId !== (vehicle.PurchaseCountry?.id ?? 0), 'Країна купівлі'],
      [String(editForm.manufactureYear) !== String(vehicle.manufactureYear ?? ''), 'Рік'],
      [editForm.engineVolume !== (vehicle.engineVolume ? String(vehicle.engineVolume) : ''), 'Двигун'],
      [editForm.mileage !== (vehicle.mileage != null ? String(vehicle.mileage) : ''), 'Пробіг'],
      [editForm.containerNumber !== (vehicle.containerNumber ?? ''), 'Контейнер'],
      [editForm.lotUrl !== (vehicle.lotUrl ?? ''), 'Посилання на лот'],
      [editForm.notes !== (vehicle.notes ?? ''), 'Нотатки'],
      [editForm.purchaseCostUsd !== (vehicle.purchaseCostUsd > 0 ? String(vehicle.purchaseCostUsd) : ''), 'Ціна купівлі'],
    ]
    return LABELS.filter(([changed]) => changed).map(([, label]) => label)
  })()

  useEffect(() => {
    if (!isDirty) {
      dirtyCtx.setDirty(false)
      return
    }
    dirtyCtx.setDirty(true, {
      label: `${vehicle.Model.Make.name} ${vehicle.Model.name} (${vehicle.vin.slice(-6)})`,
      onSave: () => saveEditRef.current(),
      draftKey: `draft_vehicle_${vehicle.id}`,
      getDraftData: () => editForm as Record<string, unknown>,
      getChangedFields: () => changedFieldsRef.current,
    })
  }, [isDirty])

  const setEdit = (key: string, value: unknown) =>
    setEditForm((f) => ({ ...f, [key]: value }))

  const handleMakeChange = (makeId: number) => {
    const firstModel = models.find((m) => m.makeId === makeId)
    setEditForm((f) => ({ ...f, makeId, modelId: firstModel?.id ?? 0 }))
  }

  const openEditModal = () => {
    if (mode !== 'edit') {
      setEditForm(buildEditForm())
      setDraftRestoredAt(null)
      setDraftRestoredFields([])
    }
    setError('')
    setShowDiscardEditConfirm(false)
    setPurchaseRateTouched(false)
    setMode('edit')
  }

  const closeEditModal = (opts?: { clearDraft?: boolean }) => {
    setMode('view')
    setError('')
    setShowDiscardEditConfirm(false)
    setDraftRestoredAt(null)
    setDraftRestoredFields([])
    dirtyCtx.setDirty(false)
    if (opts?.clearDraft !== false) {
      localStorage.removeItem(`draft_vehicle_${vehicle.id}`)
    }
  }

  const requestCloseEditModal = () => {
    if (isDirty) {
      setShowDiscardEditConfirm(true)
      return
    }
    closeEditModal()
  }

  useEffect(() => {
    if (mode !== 'edit') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (showDiscardEditConfirm) setShowDiscardEditConfirm(false)
        else requestCloseEditModal()
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [mode, showDiscardEditConfirm, isDirty])

  const handleSaveEdit = () => {
    const newPurchaseCost = editForm.purchaseCostUsd ? Number(editForm.purchaseCostUsd) : 0
    const oldPurchaseCost = vehicle.purchaseCostUsd
    const purchaseChanged = editForm.purchaseCostUsd !== (vehicle.purchaseCostUsd > 0 ? String(vehicle.purchaseCostUsd) : '')
    if (purchaseChanged) {
      if (!newPurchaseCost || newPurchaseCost <= 0) {
        setError('Вкажіть ціну купівлі більше 0')
        return
      }
      if (!vehicleHasPurchase(vehicle.Transactions) && !purchaseRegisterId) {
        setError('Оберіть касу списання')
        return
      }
    }

    startTransition(async () => {
      const res = await updateVehicle(vehicle.id, {
        vin: editForm.vin.trim().toUpperCase(),
        modelId: editForm.modelId,
        fuelTypeId: editForm.fuelTypeId > 0 ? editForm.fuelTypeId : null,
        driveTypeId: editForm.driveTypeId > 0 ? editForm.driveTypeId : null,
        transmissionId: editForm.transmissionId > 0 ? editForm.transmissionId : null,
        purchaseCountryId: editForm.purchaseCountryId || null,
        manufactureYear: editForm.manufactureYear ? Number(editForm.manufactureYear) : null,
        engineVolume: editForm.engineVolume ? Number(editForm.engineVolume) : null,
        mileage: editForm.mileage ? Number(editForm.mileage) : null,
        containerNumber: editForm.containerNumber || null,
        lotUrl: editForm.lotUrl.trim() || null,
        notes: editForm.notes || null,
        buyerName: editForm.buyerName || null,
        buyerPhone: editForm.buyerPhone || null,
      })
      if (!res.success) {
        setError(res.error ?? 'Помилка')
        return
      }

      if (purchaseChanged && Math.abs(newPurchaseCost - oldPurchaseCost) > 0.001) {
        const hasPurchase = vehicleHasPurchase(vehicle.Transactions)
        const customRate = purchaseRateTouched ? Number(purchaseRate) || null : null
        const purchaseRes = hasPurchase
          ? await updateVehiclePurchaseCost(vehicle.id, {
              purchaseCostUsd: newPurchaseCost,
              cashRegisterId: purchaseRegisterId || undefined,
              customRate,
            })
          : await setVehiclePurchaseCost(vehicle.id, {
              purchaseCostUsd: newPurchaseCost,
              cashRegisterId: purchaseRegisterId,
              customRate,
            })
        if (!purchaseRes.success) {
          setError(purchaseRes.error ?? 'Помилка збереження ціни купівлі')
          return
        }
        if ('warning' in purchaseRes && typeof purchaseRes.warning === 'string') {
          toast.warning(purchaseRes.warning)
        }
      }

      closeEditModal()
      const href = dirtyCtx.pendingHref
      notifyCrmRefresh('topbar')
      router.refresh()
      if (href) router.push(href)
    })
  }

  saveEditRef.current = handleSaveEdit

  const handleStatusChange = (statusId: number, opts?: {
    purchaseData?: { cashRegisterId: number; amount: number; customRate?: number | null }
    saleData?: {
      cashRegisterId: number
      amount: number
      buyerName: string
      buyerPhone: string
      customRate?: number | null
      saleDate?: string | null
    }
    transitData?: {
      containerNumber?: string | null
      deliveryCost?: number | null
      estimatedDeliveryDate?: string | null
      lotUrl?: string | null
    }
  }) => {
    setStatusError('')
    startTransition(async () => {
      const res = await changeVehicleStatus(vehicle.id, statusId, opts)
      if (res.success) {
        setShowStatusModal(false)
        setStatusModalInitialId(undefined)
        setStatusError('')
        notifyCrmRefresh('topbar')
        router.refresh()
      } else {
        setStatusError(res.error ?? 'Помилка')
      }
    })
  }

  const openSaleDateEdit = () => {
    setSaleDateInput(saleDateIso || localTodayIso())
    setSaleDateError('')
    setEditingSaleDate(true)
  }

  const handleSaveSaleDate = () => {
    if (!saleDateInput) {
      setSaleDateError('Вкажіть дату продажу')
      return
    }
    setSaleDateError('')
    startTransition(async () => {
      const res = await updateVehicleSaleDate(vehicle.id, saleDateInput)
      if (res.success) {
        setEditingSaleDate(false)
        setSaleDateError('')
        toast.success('Дату продажу оновлено')
        notifyCrmRefresh('topbar')
        router.refresh()
      } else {
        setSaleDateError(res.error ?? 'Помилка')
      }
    })
  }

  const recommendedSalePriceNum =
    vehicle.recommendedSalePrice != null ? Number(vehicle.recommendedSalePrice) : null

  const soldStatus = useMemo(
    () => statuses.find((s) => s.systemSlug === SYSTEM_STATUS_SLUGS.SOLD),
    [statuses]
  )

  const openSellModal = () => {
    if (!soldStatus || !canChangeStatus) return
    setStatusError('')
    setStatusModalInitialId(soldStatus.id)
    setShowStatusModal(true)
  }

  const openStatusModal = () => {
    setStatusError('')
    setStatusModalInitialId(undefined)
    setShowStatusModal(true)
  }

  const openRecommendedPriceEdit = () => {
    setRecommendedPriceInput(
      recommendedSalePriceNum != null && recommendedSalePriceNum > 0
        ? String(recommendedSalePriceNum)
        : ''
    )
    setRecommendedPriceError('')
    setEditingRecommendedPrice(true)
  }

  const saveRecommendedPrice = () => {
    const raw = recommendedPriceInput.trim()
    const value = raw === '' ? null : Number(raw)
    if (value != null && (Number.isNaN(value) || value < 0)) {
      setRecommendedPriceError('Вкажіть коректну суму')
      return
    }
    setRecommendedPriceError('')
    startTransition(async () => {
      const res = await updateRecommendedSalePrice(vehicle.id, value)
      if (res.success) {
        setEditingRecommendedPrice(false)
        toast.success('Рекомендовану ціну збережено')
        router.refresh()
      } else {
        setRecommendedPriceError(res.error ?? 'Помилка збереження')
      }
    })
  }

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteVehicle(vehicle.id)
      if (res.success) {
        localStorage.removeItem(`draft_vehicle_${vehicle.id}`)
        dirtyCtx.setDirty(false)
        router.push('/vehicles')
      } else {
        setError(res.error ?? 'Помилка')
      }
    })
  }

  const customsAmount = vehicle.customsCost ? Number(vehicle.customsCost) : 0
  const hasCustomsCost = customsAmount > 0
  const customsStatus = vehicle.customsPaymentStatus ?? 'none'
  const CUSTOMS_STATUS_LABEL: Record<string, string> = {
    unpaid: 'В боргу',
    partial: 'Частково',
    paid: 'Проплачено',
    none: '—',
  }
  const CUSTOMS_STATUS_CLASS: Record<string, string> = {
    unpaid: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
    partial: 'border-orange-500/30 text-orange-400 bg-orange-500/10',
    paid: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
    none: 'border-border text-textSecondary bg-background',
  }

  const deliveryAmount = vehicle.deliveryCost ? Number(vehicle.deliveryCost) : 0
  const hasDeliveryCost = deliveryAmount > 0

  const purchaseAmount = vehicle.purchaseCostUsd
  const hasPurchaseCost = purchaseAmount > 0
  const purchasePaid = vehicleHasPurchase(vehicle.Transactions)

  const resetPurchaseForm = () => {
    setPurchaseMode('view')
    setPurchaseInput('')
    setPurchaseError('')
    setPurchaseRateTouched(false)
    setShowPurchaseDeleteConfirm(false)
  }

  const resetCustomsForm = () => {
    setCustomsMode('view')
    setCustomsInput('')
    setCustomsError('')
    setCustomsPaymentMode('debt')
    setCustomsRateTouched(false)
    setShowCustomsDeleteConfirm(false)
  }

  const openCustomsForm = (mode: 'set' | 'edit') => {
    if (mode === 'edit') {
      setCustomsInput(String(customsAmount))
      setCustomsPaymentMode(vehicle.customsPaidFromCash ? 'cash' : 'debt')
      const customsTx = findCustomsTransaction(vehicle.Transactions)
      if (customsTx) setCustomsRegisterId(customsTx.CashRegister.id)
    } else {
      setCustomsInput('')
      setCustomsPaymentMode('debt')
    }
    setCustomsRateTouched(false)
    setCustomsMode(mode)
    setCustomsError('')
  }

  const openAddStoRecord = () => {
    setEditStoRecord(null)
    setShowStoModal(true)
  }

  const openEditStoRecord = (record: StoRecordItem) => {
    setEditStoRecord(record)
    setShowStoModal(true)
  }

  const resetDeliveryForm = () => {
    setDeliveryMode('view')
    setDeliveryForm({ cost: '', estimatedDeliveryDate: '', containerNumber: '', lotUrl: '' })
    setDeliveryError('')
    setDeliveryRateTouched(false)
    setShowDeliveryDeleteConfirm(false)
  }

  const deliveryDateInputValue = (d: string | Date | null | undefined) => {
    if (!d) return ''
    const date = new Date(d)
    if (Number.isNaN(date.getTime())) return ''
    return date.toISOString().slice(0, 10)
  }

  const openDeliveryForm = (mode: 'set' | 'edit') => {
    setDeliveryForm({
      cost: mode === 'edit' && deliveryAmount > 0 ? String(deliveryAmount) : '',
      estimatedDeliveryDate: deliveryDateInputValue(vehicle.estimatedDeliveryDate),
      containerNumber: vehicle.containerNumber ?? '',
      lotUrl: vehicle.lotUrl ?? '',
    })
    setDeliveryMode(mode)
    setDeliveryError('')
  }

  const setDeliveryField = (key: keyof typeof deliveryForm, value: string) => {
    setDeliveryForm((f) => ({ ...f, [key]: value }))
    setDeliveryError('')
  }

  const handleSaveDelivery = () => {
    const amount = Number(deliveryForm.cost)
    if (!amount || amount <= 0) {
      setDeliveryError('Вкажіть суму більше 0')
      return
    }
    startTransition(async () => {
      const res = await saveVehicleDeliveryDetails(vehicle.id, {
        deliveryCost: amount,
        estimatedDeliveryDate: deliveryForm.estimatedDeliveryDate || null,
        containerNumber: deliveryForm.containerNumber || null,
        lotUrl: deliveryForm.lotUrl || null,
      })
      if (res.success) {
        if ('warning' in res && typeof res.warning === 'string') toast.warning(res.warning)
        resetDeliveryForm()
        notifyCrmRefresh('topbar')
        router.refresh()
      } else {
        setDeliveryError(res.error ?? 'Помилка')
      }
    })
  }

  const handlePayDeliveryCost = async () => {
    if (!deliveryRegisterId) {
      setDeliveryError('Оберіть касу')
      return
    }
    const reg = paymentRegisters.find((r) => r.id === deliveryRegisterId)
    const customRate = deliveryRateTouched ? Number(deliveryRate) || null : null
    const chargeAmount = usdToRegisterAmount(
      Number(vehicle.deliveryCost || 0),
      reg?.currencyCode ?? 'USD',
      paymentRates,
      customRate
    )
    const ok = await confirmIfNeeded({
      registerName: reg?.name ?? 'Каса',
      balance: reg?.balance ?? 0,
      amount: chargeAmount,
      currencyCode: reg?.currencyCode ?? 'USD',
    })
    if (!ok) return

    startTransition(async () => {
      const res = await payVehicleDeliveryCost(vehicle.id, {
        cashRegisterId: deliveryRegisterId,
        customRate,
      })
      if (res.success) {
        if ('warning' in res && typeof res.warning === 'string') toast.warning(res.warning)
        resetDeliveryForm()
        notifyCrmRefresh('topbar')
        router.refresh()
      } else {
        setDeliveryError(res.error ?? 'Помилка')
      }
    })
  }

  const handleSaveCustomsCost = async () => {
    const amount = Number(customsInput)
    if (!amount || amount <= 0) {
      setCustomsError('Вкажіть суму більше 0')
      return
    }
    if (customsPaymentMode === 'cash' && !customsRegisterId) {
      setCustomsError('Оберіть касу')
      return
    }

    if (customsPaymentMode === 'cash') {
      const reg = paymentRegisters.find((r) => r.id === customsRegisterId)
      const customRate = customsRateTouched ? Number(customsRate) || null : null
      const paidUsd = vehicle.customsPaidUsd ?? 0
      const unpaidUsd = Math.max(0, amount - paidUsd)
      const chargeAmount = usdToRegisterAmount(
        unpaidUsd,
        reg?.currencyCode ?? 'USD',
        paymentRates,
        customRate
      )
      if (chargeAmount > 0.001) {
        const ok = await confirmIfNeeded({
          registerName: reg?.name ?? 'Каса',
          balance: reg?.balance ?? 0,
          amount: chargeAmount,
          currencyCode: reg?.currencyCode ?? 'USD',
        })
        if (!ok) return
      }
    }

    startTransition(async () => {
      const customRate = customsRateTouched ? Number(customsRate) || null : null
      const res = customsMode === 'edit'
        ? await updateVehicleCustomsCost(vehicle.id, {
            customsCost: amount,
            paymentMode: customsPaymentMode,
            cashRegisterId: customsPaymentMode === 'cash' ? customsRegisterId : undefined,
            customRate,
          })
        : await setVehicleCustomsCost(vehicle.id, {
            customsCost: amount,
            paymentMode: customsPaymentMode,
            cashRegisterId: customsPaymentMode === 'cash' ? customsRegisterId : undefined,
            customRate,
          })
      if (res.success) {
        if ('warning' in res && typeof res.warning === 'string') toast.warning(res.warning)
        resetCustomsForm()
        notifyCrmRefresh('topbar')
        router.refresh()
      } else {
        setCustomsError(res.error ?? 'Помилка')
      }
    })
  }

  const handleRemoveCustomsCost = () => {
    startTransition(async () => {
      const res = await removeVehicleCustomsCost(vehicle.id)
      if (res.success) {
        resetCustomsForm()
        notifyCrmRefresh('topbar')
        router.refresh()
      } else {
        setCustomsError(res.error ?? 'Помилка')
      }
    })
  }

  const handleRemoveDeliveryCost = () => {
    startTransition(async () => {
      const res = await removeVehicleDeliveryCost(vehicle.id)
      if (res.success) {
        resetDeliveryForm()
        notifyCrmRefresh('topbar')
        router.refresh()
      } else {
        setDeliveryError(res.error ?? 'Помилка')
      }
    })
  }

  const handleSavePurchaseCost = async () => {
    const amount = Number(purchaseInput)
    if (!amount || amount <= 0) {
      setPurchaseError('Вкажіть суму більше 0')
      return
    }
    if (!purchaseRegisterId) {
      setPurchaseError('Оберіть касу')
      return
    }
    const reg = paymentRegisters.find((r) => r.id === purchaseRegisterId)
    const customRate = purchaseRateTouched ? Number(purchaseRate) || null : null
    const purchaseTx = findPurchaseTransaction(vehicle.Transactions)
    const registerChanged =
      purchaseMode === 'edit' &&
      purchaseTx &&
      purchaseTx.CashRegister.id !== purchaseRegisterId
    const confirmUsd = registerChanged
      ? amount
      : purchaseMode === 'edit'
        ? Math.max(0, amount - vehicle.purchaseCostUsd)
        : amount
    const chargeAmount = usdToRegisterAmount(
      confirmUsd,
      reg?.currencyCode ?? 'USD',
      paymentRates,
      customRate
    )
    if (chargeAmount > 0.001) {
      const ok = await confirmIfNeeded({
        registerName: reg?.name ?? 'Каса',
        balance: reg?.balance ?? 0,
        amount: chargeAmount,
        currencyCode: reg?.currencyCode ?? 'USD',
      })
      if (!ok) return
    }

    startTransition(async () => {
      const res = purchaseMode === 'edit'
        ? await updateVehiclePurchaseCost(vehicle.id, {
            purchaseCostUsd: amount,
            cashRegisterId: purchaseRegisterId,
            customRate,
          })
        : await setVehiclePurchaseCost(vehicle.id, {
            purchaseCostUsd: amount,
            cashRegisterId: purchaseRegisterId,
            customRate,
          })
      if (res.success) {
        if ('warning' in res && typeof res.warning === 'string') toast.warning(res.warning)
        resetPurchaseForm()
        notifyCrmRefresh('topbar')
        router.refresh()
      } else {
        setPurchaseError(res.error ?? 'Помилка')
      }
    })
  }

  const handleRemovePurchaseCost = () => {
    startTransition(async () => {
      const res = await removeVehiclePurchaseCost(vehicle.id)
      if (res.success) {
        resetPurchaseForm()
        notifyCrmRefresh('topbar')
        router.refresh()
      } else {
        setPurchaseError(res.error ?? 'Помилка')
      }
    })
  }

  const handleAddExpenseCategory = (item: { id: number; name: string }) => {
    setExpenseCategoriesLocal((prev) =>
      prev.some((c) => c.id === item.id) ? prev : [...prev, item]
    )
  }

  const customsReg = paymentRegisters.find((r) => r.id === customsRegisterId)
  const customsCurrency = customsReg?.currencyCode ?? 'USD'
  const customsDefaultRate = defaultRateForRegister(customsCurrency, paymentRates)

  const deliveryReg = paymentRegisters.find((r) => r.id === deliveryRegisterId)
  const deliveryCurrency = deliveryReg?.currencyCode ?? 'USD'
  const deliveryDefaultRate = defaultRateForRegister(deliveryCurrency, paymentRates)

  const purchaseReg = paymentRegisters.find((r) => r.id === purchaseRegisterId)
  const purchaseCurrency = purchaseReg?.currencyCode ?? 'USD'
  const purchaseDefaultRate = defaultRateForRegister(purchaseCurrency, paymentRates)

  const handleAddDamage = () => {
    if (!damageForm.damageTypeId) return
    if (!damageForm.comment.trim()) return
    startTransition(async () => {
      const res = await addVehicleDamage(vehicle.id, damageForm.damageTypeId, damageForm.comment)
      if (res.success) {
        setShowDamageForm(false)
        setDamageForm({ damageTypeId: 0, comment: '' })
        notifyCrmRefresh('topbar')
        router.refresh()
      }
    })
  }

  const handleDeleteDamage = (damageId: number) => {
    startTransition(async () => {
      await deleteVehicleDamage(damageId)
      notifyCrmRefresh('topbar')
    router.refresh()
    })
  }

  const handleSetCover = (photoId: number) => {
    startTransition(async () => {
      await setCoverPhoto(photoId, vehicle.id)
      notifyCrmRefresh('topbar')
    router.refresh()
    })
  }

  const handleDamagePhotoUpload = async (damageId: number, files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadingDamagePhoto(damageId)
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('vehicleId', String(vehicle.id))
      fd.append('file', file)
      fd.append('damageId', String(damageId))
      const res = await fetch('/api/upload/photo', { method: 'POST', body: fd })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setUploadError(data.error ?? 'Помилка завантаження фото')
      }
    }
    setUploadingDamagePhoto(null)
    notifyCrmRefresh('topbar')
    router.refresh()
  }

  const expenses = useMemo(
    () =>
      vehicle.Transactions.filter((t) => t.type === 'EXPENSE' || t.type === 'VEHICLE_INVEST').sort(
        (a, b) => new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime()
      ),
    [vehicle.Transactions]
  )

  const generalPhotos = useMemo(() => {
    const deduped = dedupeVehiclePhotos(vehicle.Photos)
    return deduped.sort((a, b) => (b.isCover ? 1 : 0) - (a.isCover ? 1 : 0))
  }, [vehicle.Photos])

  const coverPhoto = generalPhotos.find((p) => p.isCover) ?? generalPhotos[0] ?? null

  const openLightbox = (
    photos: { id: number; filePath: string; originalName: string }[],
    filePath: string
  ) => {
    const idx = photos.findIndex((p) => p.filePath === filePath)
    setLightboxPhotos(photos)
    setLightboxIndex(idx >= 0 ? idx : 0)
  }

  const closeLightbox = () => {
    setLightboxIndex(null)
    setLightboxPhotos([])
  }

  const lightboxPhoto = lightboxIndex != null ? lightboxPhotos[lightboxIndex] : null

  useEffect(() => {
    if (lightboxIndex == null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox()
      if (e.key === 'ArrowRight' && lightboxPhotos.length > 1) {
        setLightboxIndex((i) => (i != null ? (i + 1) % lightboxPhotos.length : null))
      }
      if (e.key === 'ArrowLeft' && lightboxPhotos.length > 1) {
        setLightboxIndex((i) => (i != null ? (i - 1 + lightboxPhotos.length) % lightboxPhotos.length : null))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxIndex, lightboxPhotos.length])

  const handleEditExpense = (t: Vehicle['Transactions'][0]) => {
    if (isPurchaseTransaction(t)) {
      setPurchaseInput(String(vehicle.purchaseCostUsd))
      setPurchaseRegisterId(t.CashRegister.id)
      setPurchaseRateTouched(false)
      setPurchaseMode('edit')
      setPurchaseError('')
      document.getElementById('vehicle-purchase')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const sr = expenseStoRecord(t)
    if (sr) {
      const record = vehicle.StoRecords.find((r) => r.id === sr.id)
      if (record && canEditRepair) {
        setEditStoRecord(record)
        setShowStoModal(true)
        document.getElementById('vehicle-repairs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    } else {
      setEditingExpense(t)
    }
  }

  const handleDeleteExpense = (t: Vehicle['Transactions'][0]) => {
    startTransition(async () => {
      const res = await deleteTransaction(t.id)
      if (res.success) {
        setDeleteExpenseId(null)
        toast.success('Витрату видалено, кошти повернуто в касу')
        notifyCrmRefresh('topbar')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Помилка видалення')
      }
    })
  }

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadingPhoto(true)
    setUploadError('')
    let skipped = 0
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('vehicleId', String(vehicle.id))
      fd.append('file', file)
      const res = await fetch('/api/upload/photo', { method: 'POST', body: fd })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setUploadError(data.error ?? 'Помилка завантаження фото')
      } else {
        const data = await res.json().catch(() => ({}))
        if (data.duplicate) skipped += 1
      }
    }
    if (skipped > 0) {
      setUploadError(`Пропущено ${skipped} дублікат(ів) — фото вже є в галереї`)
    }
    setUploadingPhoto(false)
    notifyCrmRefresh('topbar')
    router.refresh()
  }

  const handleDocUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadingDoc(true)
    setUploadError('')
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('vehicleId', String(vehicle.id))
      fd.append('file', file)
      const res = await fetch('/api/upload/doc', { method: 'POST', body: fd })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setUploadError(data.error ?? 'Помилка завантаження документа')
      }
    }
    setUploadingDoc(false)
    notifyCrmRefresh('topbar')
    router.refresh()
  }

  const handleDeletePhoto = (photoId: number) => {
    startTransition(async () => {
      await deleteVehiclePhoto(photoId)
      notifyCrmRefresh('topbar')
    router.refresh()
    })
  }

  const handleDeleteDoc = (docId: number) => {
    startTransition(async () => {
      await deleteVehicleDocument(docId)
      notifyCrmRefresh('topbar')
    router.refresh()
    })
  }

  return (
    <>
      <div className="min-w-0 max-w-full space-y-5">
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="p-4 sm:p-5 flex flex-col lg:flex-row gap-4 lg:gap-6">
            <button
              onClick={() => {
                if (isDirty) dirtyCtx.setPendingHref('/vehicles')
                else router.push('/vehicles')
              }}
              className="lg:hidden flex items-center gap-2 text-sm text-textSecondary hover:text-textPrimary self-start -mb-1"
            >
              <ArrowLeft className="w-4 h-4" /> До списку
            </button>

            <button
              type="button"
              onClick={() => coverPhoto && openLightbox(generalPhotos, coverPhoto.filePath)}
              className={`shrink-0 w-full sm:w-40 lg:w-44 aspect-[4/3] rounded-lg overflow-hidden border bg-background ${
                coverPhoto ? 'border-border hover:border-accent/40 cursor-pointer' : 'border-dashed border-border/60'
              } transition-colors`}
            >
              {coverPhoto ? (
                <img src={assetUrl(coverPhoto.filePath)} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-textSecondary/50">
                  <Car className="w-8 h-8" />
                  <span className="text-[11px]">Немає фото</span>
                </div>
              )}
            </button>

            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-textSecondary mb-1">Автомобіль</p>
                  <h1 className="text-xl sm:text-2xl font-bold text-textPrimary leading-tight">
                    {vehicle.Model.Make.name} {vehicle.Model.name}
                    {vehicle.manufactureYear != null && (
                      <span className="text-textSecondary font-medium text-lg sm:text-xl ml-1.5">{vehicle.manufactureYear}</span>
                    )}
                  </h1>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <p className="font-mono text-sm text-textSecondary">{vehicle.vin}</p>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(vehicle.vin); toast.success('VIN скопійовано') }}
                      className="p-0.5 text-textSecondary/40 hover:text-accent transition-colors"
                      title="Копіювати VIN"
                    >
                      <Clipboard className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (isDirty) dirtyCtx.setPendingHref('/vehicles')
                    else router.push('/vehicles')
                  }}
                  className="hidden lg:flex p-2 rounded-lg hover:bg-surfaceHover text-textSecondary hover:text-textPrimary transition-colors shrink-0"
                  title="До списку"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {canChangeStatus ? (
                  <button
                    onClick={openStatusModal}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all"
                    style={
                      isReadOnly
                        ? { borderColor: 'rgb(52 211 153 / 0.4)', color: 'rgb(52 211 153)', background: 'rgb(52 211 153 / 0.1)' }
                        : { borderColor: 'rgb(0 242 254 / 0.3)', color: 'rgb(0 242 254)', background: 'rgb(0 242 254 / 0.05)' }
                    }
                  >
                    {vehicle.CurrentStatus.name}
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <span
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium"
                    style={
                      isReadOnly
                        ? { borderColor: 'rgb(52 211 153 / 0.4)', color: 'rgb(52 211 153)', background: 'rgb(52 211 153 / 0.1)' }
                        : { borderColor: 'rgb(0 242 254 / 0.3)', color: 'rgb(0 242 254)', background: 'rgb(0 242 254 / 0.05)' }
                    }
                  >
                    {vehicle.CurrentStatus.name}
                  </span>
                )}
                <InfoChip icon={MapPin} label="Країна" value={vehicle.PurchaseCountry?.name} />
                <InfoChip
                  icon={Car}
                  label="Пробіг"
                  value={vehicle.mileage != null ? `${vehicle.mileage.toLocaleString('uk-UA')} км` : null}
                />
                <InfoChip icon={Package} label="Контейнер" value={vehicle.containerNumber} />
                <InfoChip
                  icon={Calendar}
                  label="Доставка"
                  value={vehicle.estimatedDeliveryDate ? fmt(vehicle.estimatedDeliveryDate) : null}
                />
                <InfoChip icon={ExternalLink} label="Лот" value={vehicle.lotUrl ? 'Відкрити' : null} href={vehicle.lotUrl ?? undefined} />
              </div>

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 pt-1">
                {!isReadOnly && canEdit && (
                  <button
                    onClick={openEditModal}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-textSecondary hover:text-textPrimary hover:border-accent/40 transition-all"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Редагувати дані
                  </button>
                )}
                {!isReadOnly && canCreateExpense && (
                  <button
                    type="button"
                    onClick={() => setShowQuickExpense(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-accent/30 text-accent text-sm hover:bg-accent/10 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> Витрата
                  </button>
                )}
                {!isReadOnly && canCreateRepair && repairTypes.length > 0 && (
                  <button
                    type="button"
                    onClick={openAddStoRecord}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-textSecondary hover:text-accent hover:border-accent/30 transition-all"
                  >
                    <Wrench className="w-3.5 h-3.5" /> Робота СТО
                  </button>
                )}
                {canDelete && !isReadOnly && (
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 p-2 rounded-lg border border-border text-textSecondary hover:text-red-400 hover:border-red-400/40 transition-all sm:ml-auto"
                    title="Видалити авто"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-xs sm:hidden">Видалити</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Read-Only Banner */}
        {isReadOnly && (
          <div className="flex flex-col gap-3 px-4 py-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-emerald-400">
            <div className="flex items-start gap-3">
              <Lock className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Авто продано — режим читання</p>
                <p className="text-xs text-emerald-400/70">
                  Редагування заблоковано. Натисніть на статус щоб розархівувати.
                  {vehicle.buyerName && <span> Покупець: {vehicle.buyerName}{vehicle.buyerPhone ? ` · ${vehicle.buyerPhone}` : ''}</span>}
                </p>
                {saleDateIso && !editingSaleDate && (
                  <p className="text-xs text-emerald-400/80 mt-1 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Дата продажу: {formatDate(saleTx!.createdAt)}
                    </span>
                    {canEditSaleDate && (
                      <button
                        type="button"
                        onClick={openSaleDateEdit}
                        className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline"
                      >
                        <Pencil className="w-3 h-3" /> Змінити
                      </button>
                    )}
                  </p>
                )}
              </div>
            </div>
            {editingSaleDate && canEditSaleDate && (
              <div className="ml-7 space-y-2 max-w-xs">
                <label className="block text-xs text-emerald-400/80">Дата продажу</label>
                <DateInput
                  value={saleDateInput}
                  onChange={setSaleDateInput}
                  max={localTodayIso()}
                />
                {saleDateError && <p className="text-xs text-red-400">{saleDateError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveSaleDate}
                    disabled={isPending}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    <Check className="w-3 h-3" /> Зберегти
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingSaleDate(false); setSaleDateError('') }}
                    className="px-3 py-1.5 rounded-md text-xs border border-border text-textSecondary hover:text-textPrimary"
                  >
                    Скасувати
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error}
          </div>
        )}

        <nav className="sticky top-[calc(4rem+env(safe-area-inset-top,0px))] z-20 -mx-4 px-4 md:-mx-6 md:px-6 py-2 bg-background/95 backdrop-blur-md border-y border-border shadow-sm">
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'vehicle-finance', label: 'Фінанси' },
              { id: 'vehicle-expenses', label: 'Витрати' },
              { id: 'vehicle-repairs', label: 'СТО' },
              { id: 'vehicle-details', label: 'Деталі' },
              { id: 'vehicle-photos', label: 'Фото' },
              { id: 'vehicle-comments', label: 'Коментарі' },
              { id: 'vehicle-other', label: 'Інше' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
                className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium text-textSecondary hover:text-accent hover:bg-accent/10 border border-transparent hover:border-accent/20 transition-all"
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="overflow-x-hidden min-w-0 space-y-5">
        <section id="vehicle-finance" className={`bg-surface border border-accent/25 rounded-xl p-4 sm:p-5 shadow-neon ${sectionScrollMt}`}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-1 gap-3">
            <div>
              <h2 className="text-sm font-semibold text-textPrimary flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-accent" />
                Фінанси та собівартість
              </h2>
              <p className="text-xs text-textSecondary mt-1">Купівля + доставка + митниця + ремонти + інші витрати = собівартість авто</p>
            </div>
            {canExport && (
              <button
                type="button"
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-1 text-xs text-textSecondary/60 hover:text-accent border border-border/40 hover:border-accent/30 px-2 py-1 rounded transition-colors shrink-0"
              >
                <Download className="w-3 h-3" /> Експорт
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-textSecondary mb-1">Купівля</p>
              <p className="font-mono text-base sm:text-lg text-textPrimary break-all">
                ${vehicle.purchaseCostUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-textSecondary mb-1">Доставка</p>
              <p className="font-mono text-base sm:text-lg text-accent break-all">
                ${vehicle.deliveryCostUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-textSecondary mb-1">Митниця</p>
              <p className="font-mono text-base sm:text-lg text-amber-400 break-all">
                ${vehicle.customsCostUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-textSecondary mb-1">Ремонти</p>
              <p className="font-mono text-base sm:text-lg text-cyan-400 break-all">
                ${vehicle.repairCostUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-textSecondary mb-1">Інші витрати</p>
              <p className="font-mono text-base sm:text-lg text-violet-400 break-all">
                ${vehicle.otherCostUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="flex flex-wrap items-end gap-6 sm:gap-8">
              <div>
                <p className="text-xs text-textSecondary mb-1">Разом (собівартість)</p>
                <p className="text-2xl sm:text-3xl font-mono font-bold text-accent break-all">
                  ${vehicle.totalCostUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-xs text-textSecondary mb-1">Вложено в авто</p>
                <p className="text-2xl sm:text-3xl font-mono font-bold text-textPrimary break-all">
                  ${vehicle.investedUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="min-w-[9rem]">
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-xs text-textSecondary">Рекомендована ціна продажу</p>
                  {canEdit && !editingRecommendedPrice && (
                    <button
                      type="button"
                      onClick={openRecommendedPriceEdit}
                      className="text-textSecondary/50 hover:text-accent transition-colors"
                      title="Редагувати"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {editingRecommendedPrice ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-textSecondary font-mono text-sm">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={recommendedPriceInput}
                        onChange={(e) => setRecommendedPriceInput(e.target.value)}
                        className="w-28 sm:w-32 bg-background border border-border rounded px-2 py-1.5 text-sm font-mono text-textPrimary focus:outline-none focus:border-accent"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRecommendedPrice()
                          if (e.key === 'Escape') setEditingRecommendedPrice(false)
                        }}
                      />
                      <button
                        type="button"
                        onClick={saveRecommendedPrice}
                        disabled={isPending}
                        className="p-1.5 rounded bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-50"
                        title="Зберегти"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingRecommendedPrice(false)}
                        className="p-1.5 rounded text-textSecondary hover:text-textPrimary"
                        title="Скасувати"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {recommendedPriceError && (
                      <p className="text-[11px] text-red-400">{recommendedPriceError}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xl sm:text-2xl font-mono font-semibold text-emerald-400 break-all">
                    {recommendedSalePriceNum != null && recommendedSalePriceNum > 0
                      ? `$${recommendedSalePriceNum.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-stretch sm:items-end gap-2">
              {!isReadOnly && canChangeStatus && soldStatus && (
                <button
                  type="button"
                  onClick={openSellModal}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/25 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  Продати авто
                </button>
              )}
              <p className="text-[11px] text-textSecondary">
                Усі транзакції витрат: ${vehicle.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {(vehicle.pendingCustoms > 0.005 || vehicle.pendingDelivery > 0.005) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {vehicle.pendingCustoms > 0.005 && (
                <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-400">
                  Мито в боргу: ${vehicle.pendingCustoms.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              )}
              {vehicle.pendingDelivery > 0.005 && (
                <span className="inline-flex items-center rounded-md border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[11px] text-orange-400">
                  Доставка не з каси: ${vehicle.pendingDelivery.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
          )}

          {canViewProfit && vehicle.salePriceUsd > 0 && vehicle.profitUsd != null && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-[10px] uppercase tracking-wider text-textSecondary">Вигода від продажу</p>
                <div className="group relative">
                  <HelpCircle className="w-3 h-3 text-textSecondary/40 hover:text-accent cursor-help" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2.5 bg-surface border border-border rounded-lg shadow-xl text-xs text-textSecondary opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    <p className="font-medium text-textPrimary mb-1">Вигода = Ціна продажу − Собівартість</p>
                    <p>Собівартість: купівля + доставка + митниця + ремонти + інші витрати</p>
                  </div>
                </div>
              </div>
              {saleDateIso && (
                <p className="text-xs text-textSecondary mb-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Дата продажу: <span className="text-textPrimary">{formatDate(saleTx!.createdAt)}</span>
                  </span>
                  {canEditSaleDate && !editingSaleDate && (
                    <button
                      type="button"
                      onClick={openSaleDateEdit}
                      className="inline-flex items-center gap-1 text-accent hover:underline"
                    >
                      <Pencil className="w-3 h-3" /> Змінити
                    </button>
                  )}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-baseline font-mono">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-xs sm:text-sm text-textSecondary">Продаж</span>
                    <span className="text-base sm:text-lg text-emerald-400 break-all">
                      ${vehicle.salePriceUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-xs sm:text-sm text-textSecondary">Собівартість</span>
                    <span className="text-base sm:text-lg text-textPrimary break-all">
                      ${vehicle.totalCostUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:col-span-full">
                    <span className="text-xs sm:text-sm text-textSecondary">Вигода</span>
                    <span className={`text-xl sm:text-2xl font-bold break-all ${vehicle.profitUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ${vehicle.profitUsd.toLocaleString('en-US', { minimumFractionDigits: 2, signDisplay: 'exceptZero' })}
                    </span>
                  </div>
                </div>
            </div>
          )}
        </section>

        <div className="space-y-4">
          <p className="text-xs text-textSecondary px-1">Керуйте сумами — натисніть олівець у картці або «Редагувати дані» зверху.</p>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 min-w-0">

            <div id="vehicle-purchase" className="bg-surface border border-border rounded-lg p-4 sm:p-5 scroll-mt-4 min-w-0">
              <h2 className="text-sm font-semibold text-textPrimary mb-1 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-accent" /> Купівля
              </h2>
              <p className="text-[11px] text-textSecondary mb-4">Ціна авто та списання з каси</p>

              {purchaseMode === 'set' || purchaseMode === 'edit' ? (
                <div className="space-y-3">
                  <Field label={purchaseMode === 'edit' ? 'Нова вартість купівлі ($)' : 'Вартість купівлі ($) *'}>
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={purchaseInput}
                      onChange={(e) => { setPurchaseInput(e.target.value); setPurchaseError('') }}
                      placeholder="15000"
                      className={`${inputCls} ${purchaseError ? 'border-red-500' : ''}`}
                      autoFocus
                    />
                  </Field>
                  <Field label="Каса *">
                    <select
                      value={purchaseRegisterId}
                      onChange={(e) => {
                        const id = Number(e.target.value)
                        setPurchaseRegisterId(id)
                        setPurchaseRateTouched(false)
                        const reg = paymentRegisters.find((r) => r.id === id)
                        const def = defaultRateForRegister(reg?.currencyCode ?? 'USD', paymentRates)
                        setPurchaseRate(def != null ? String(def) : '')
                      }}
                      className={inputCls}
                    >
                      {paymentRegisters.map((r) => (
                        <option key={r.id} value={r.id}>{r.name} ({r.balance.toLocaleString()} {r.currencyCode})</option>
                      ))}
                    </select>
                  </Field>
                  {purchaseCurrency !== 'USD' && (
                    <Field label={rateLabelForRegister(purchaseCurrency) ?? 'Курс'}>
                      <input
                        type="number"
                        step={0.0001}
                        value={purchaseRateTouched ? purchaseRate : String(purchaseDefaultRate)}
                        onChange={(e) => { setPurchaseRate(e.target.value); setPurchaseRateTouched(true) }}
                        className={inputCls}
                      />
                      <p className="text-[10px] text-textSecondary mt-1">{formatRateHint(purchaseCurrency, paymentRates)}</p>
                    </Field>
                  )}
                  {purchaseError && <p className="text-xs text-red-400">{purchaseError}</p>}
                  <p className="text-[11px] text-textSecondary">
                    {purchaseMode === 'edit'
                      ? 'При зміні каси стару витрату буде сторновано, нову списано з обраної каси. Для не-USD вкажіть курс.'
                      : 'EXPENSE з обраної каси за купівлю цього авто.'}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSavePurchaseCost}
                      disabled={isPending}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-accent text-background hover:bg-accent/90 transition-all disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {isPending ? 'Збереження...' : 'Зберегти'}
                    </button>
                    <button
                      onClick={resetPurchaseForm}
                      disabled={isPending}
                      className="px-4 py-2 rounded-md text-sm border border-border text-textSecondary hover:text-textPrimary transition-all disabled:opacity-50"
                    >
                      Скасувати
                    </button>
                  </div>
                </div>
              ) : hasPurchaseCost ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div>
                      <p className="text-xs text-textSecondary mb-0.5">Вартість купівлі</p>
                      <p className="text-2xl font-mono text-accent">
                        ${purchaseAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                      <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded border ${purchasePaid ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-amber-500/30 text-amber-400 bg-amber-500/10'}`}>
                        {purchasePaid ? 'Оплачено з каси' : 'Не оплачено'}
                      </span>
                    </div>
                    {!isReadOnly && canEdit && (
                      <div className="flex flex-wrap items-center gap-1.5 justify-start sm:justify-end">
                        <button
                          onClick={() => {
                            const pTx = findPurchaseTransaction(vehicle.Transactions)
                            setPurchaseInput(String(purchaseAmount))
                            if (pTx) setPurchaseRegisterId(pTx.CashRegister.id)
                            setPurchaseRateTouched(false)
                            setPurchaseMode('edit')
                            setPurchaseError('')
                          }}
                          className="p-2 rounded-md border border-border text-textSecondary hover:text-accent hover:border-accent/30 transition-all"
                          title="Редагувати"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setShowPurchaseDeleteConfirm(true)}
                          className="p-2 rounded-md border border-border text-textSecondary hover:text-red-400 hover:border-red-400/30 transition-all"
                          title="Видалити"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  {showPurchaseDeleteConfirm && (
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-red-500/5 border border-red-500/20 rounded-lg">
                      <p className="text-xs text-red-400">Видалити купівлю та повернути кошти в касу?</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={handleRemovePurchaseCost}
                          disabled={isPending}
                          className="px-3 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-50"
                        >
                          Так
                        </button>
                        <button
                          onClick={() => setShowPurchaseDeleteConfirm(false)}
                          className="px-3 py-1 rounded text-xs text-textSecondary hover:text-textPrimary transition-all"
                        >
                          Ні
                        </button>
                      </div>
                    </div>
                  )}
                  {purchaseError && <p className="text-xs text-red-400">{purchaseError}</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-textSecondary">Вартість купівлі ще не вказана.</p>
                  {!isReadOnly && canEdit && (
                    <button
                      onClick={() => {
                        setPurchaseInput('')
                        setPurchaseMode('set')
                        setPurchaseError('')
                        setPurchaseRateTouched(false)
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium border border-accent/30 text-accent hover:bg-accent/10 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      Вказати вартість купівлі
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="bg-surface border border-border rounded-lg p-4 sm:p-5 min-w-0">
              <h2 className="text-sm font-semibold text-textPrimary mb-1 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> Митниця
              </h2>
              <p className="text-[11px] text-textSecondary mb-4">Мито в борг або оплата з каси</p>

              {customsMode === 'set' || customsMode === 'edit' ? (
                <div className="space-y-3">
                  <Field label="Вартість митниці ($)">
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={customsInput}
                      onChange={(e) => { setCustomsInput(e.target.value); setCustomsError('') }}
                      placeholder="5000"
                      className={`${inputCls} ${customsError ? 'border-red-500' : ''}`}
                      autoFocus
                    />
                  </Field>
                  <div className="space-y-2">
                    <p className="text-[11px] text-textSecondary uppercase tracking-wider">Спосіб оплати</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCustomsPaymentMode('debt')}
                        className={`flex-1 px-3 py-2 rounded-md text-xs font-medium border transition-all ${customsPaymentMode === 'debt' ? 'border-amber-500/50 bg-amber-500/10 text-amber-400' : 'border-border text-textSecondary'}`}
                      >
                        {customsMode === 'edit' ? 'В боргу' : 'Додати в борг'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomsPaymentMode('cash')}
                        className={`flex-1 px-3 py-2 rounded-md text-xs font-medium border transition-all ${customsPaymentMode === 'cash' ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border text-textSecondary'}`}
                      >
                        {customsMode === 'edit' ? 'Оплатити з каси' : 'Оплатити зараз'}
                      </button>
                    </div>
                  </div>
                  {customsPaymentMode === 'cash' && (
                    <>
                      <Field label="Каса *">
                        <select
                          value={customsRegisterId}
                          onChange={(e) => setCustomsRegisterId(Number(e.target.value))}
                          className={inputCls}
                        >
                          {paymentRegisters.map((r) => (
                            <option key={r.id} value={r.id}>{r.name} ({r.balance.toLocaleString()} {r.currencyCode})</option>
                          ))}
                        </select>
                      </Field>
                      {customsCurrency !== 'USD' && (
                        <Field label={rateLabelForRegister(customsCurrency) ?? 'Курс'}>
                          <input
                            type="number"
                            step={0.0001}
                            value={customsRateTouched ? customsRate : String(customsDefaultRate)}
                            onChange={(e) => { setCustomsRate(e.target.value); setCustomsRateTouched(true) }}
                            className={inputCls}
                          />
                          <p className="text-[10px] text-textSecondary mt-1">{formatRateHint(customsCurrency, paymentRates)}</p>
                        </Field>
                      )}
                    </>
                  )}
                  {customsError && <p className="text-xs text-red-400">{customsError}</p>}
                  <p className="text-[11px] text-textSecondary">
                    {customsPaymentMode === 'cash'
                      ? customsMode === 'edit'
                        ? (vehicle.customsPaidUsd ?? 0) > 0.005
                          ? 'З каси спишеться лише непогашений залишок (нова сума − уже сплачене). Уже оплачене лишається.'
                          : 'Сума зніметься з боргу та буде списана з обраної каси.'
                        : 'EXPENSE з обраної каси. Борг не змінюється.'
                      : customsMode === 'edit'
                        ? (vehicle.customsPaidUsd ?? 0) > 0.005
                          ? 'Зміниться лише залишок боргу. Уже сплачені суми з кас не повертаються.'
                          : 'Різниця буде відкоригована в митному боргу.'
                        : 'Сума буде додана до митного боргу та собівартості авто.'}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveCustomsCost}
                      disabled={isPending}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-accent text-background hover:bg-accent/90 transition-all disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {isPending ? 'Збереження...' : 'Зберегти'}
                    </button>
                    <button
                      onClick={resetCustomsForm}
                      disabled={isPending}
                      className="px-4 py-2 rounded-md text-sm border border-border text-textSecondary hover:text-textPrimary transition-all disabled:opacity-50"
                    >
                      Скасувати
                    </button>
                  </div>
                </div>
              ) : hasCustomsCost ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div>
                      <p className="text-xs text-textSecondary mb-0.5">Вартість мита</p>
                      <p className="text-2xl font-mono text-amber-400">
                        ${customsAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className={`inline-block text-[10px] px-2 py-0.5 rounded border ${CUSTOMS_STATUS_CLASS[customsStatus]}`}>
                          {CUSTOMS_STATUS_LABEL[customsStatus]}
                        </span>
                        {customsStatus === 'partial' && vehicle.customsBalance > 0.005 && (
                          <span className="text-[10px] text-textSecondary">
                            залишок ${vehicle.customsBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                      {isReadOnly && vehicle.customsBalance > 0.005 && (
                        <p className="text-xs text-amber-400 mt-2 font-medium">
                          Мито ще висить: ${vehicle.customsBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                    {!isReadOnly && canEdit && (
                      <div className="flex flex-wrap items-center gap-1.5 justify-start sm:justify-end">
                        <button
                          onClick={() => openCustomsForm('edit')}
                          className="p-2 rounded-md border border-border text-textSecondary hover:text-accent hover:border-accent/30 transition-all"
                          title="Редагувати"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setShowCustomsDeleteConfirm(true)}
                          className="p-2 rounded-md border border-border text-textSecondary hover:text-red-400 hover:border-red-400/30 transition-all"
                          title="Видалити"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  {showCustomsDeleteConfirm && (
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-red-500/5 border border-red-500/20 rounded-lg">
                      <p className="text-xs text-red-400">
                        {vehicle.customsPaidFromCash || (vehicle.customsPaidUsd ?? 0) > 0.005
                          ? 'Видалити мито та повернути кошти в касу?'
                          : 'Видалити вартість мита? Борг буде зменшено.'}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={handleRemoveCustomsCost}
                          disabled={isPending}
                          className="px-3 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-50"
                        >
                          Так
                        </button>
                        <button
                          onClick={() => setShowCustomsDeleteConfirm(false)}
                          className="px-3 py-1 rounded text-xs text-textSecondary hover:text-textPrimary transition-all"
                        >
                          Ні
                        </button>
                      </div>
                    </div>
                  )}
                  {customsError && <p className="text-xs text-red-400">{customsError}</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-textSecondary">Вартість митниці ще не вказана.</p>
                  {!isReadOnly && canEdit && (
                    <button
                      onClick={() => openCustomsForm('set')}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      Вказати вартість митниці
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="bg-surface border border-border rounded-lg p-4 sm:p-5 min-w-0">
              <h2 className="text-sm font-semibold text-textPrimary mb-1">Доставка</h2>
              <p className="text-[11px] text-textSecondary mb-4">
                Спочатку вкажіть суму, потім окремо оплатіть з каси
              </p>

              {deliveryMode === 'set' || deliveryMode === 'edit' ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-textPrimary">
                    {deliveryMode === 'edit' ? 'Редагувати доставку' : 'Вказати доставку'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Вартість доставки ($) *">
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={deliveryForm.cost}
                        onChange={(e) => setDeliveryField('cost', e.target.value)}
                        placeholder="1500"
                        className={`${inputCls} ${deliveryError ? 'border-red-500' : ''}`}
                        autoFocus
                      />
                    </Field>
                    <Field label="Орієнтовна дата доставки">
                      <input
                        type="date"
                        value={deliveryForm.estimatedDeliveryDate}
                        onChange={(e) => setDeliveryField('estimatedDeliveryDate', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Номер контейнера">
                      <input
                        value={deliveryForm.containerNumber}
                        onChange={(e) => setDeliveryField('containerNumber', e.target.value)}
                        placeholder="MSCU1234567"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Посилання на лот">
                      <input
                        value={deliveryForm.lotUrl}
                        onChange={(e) => setDeliveryField('lotUrl', e.target.value)}
                        placeholder="https://copart.com/lot/..."
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  {deliveryError && <p className="text-xs text-red-400">{deliveryError}</p>}
                  <p className="text-[11px] text-textSecondary">
                    {deliveryMode === 'edit'
                      ? vehicle.deliveryPaidFromCash
                        ? 'При зміні суми вже оплаченої доставки транзакція з каси буде перерахована.'
                        : 'Зберігається лише сума доставки. Гроші з каси не списуються — для цього натисніть «Оплатити».'
                      : 'Зберігається лише сума доставки. Гроші з каси не списуються — для цього натисніть «Оплатити».'}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveDelivery}
                      disabled={isPending}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-accent text-background hover:bg-accent/90 transition-all disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {isPending ? 'Збереження...' : 'Зберегти суму'}
                    </button>
                    <button
                      onClick={resetDeliveryForm}
                      disabled={isPending}
                      className="px-4 py-2 rounded-md text-sm border border-border text-textSecondary hover:text-textPrimary transition-all disabled:opacity-50"
                    >
                      Скасувати
                    </button>
                  </div>
                </div>
              ) : deliveryMode === 'pay' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-accent/5 border border-accent/20 rounded-lg">
                    <span className="text-xs text-textSecondary">До сплати</span>
                    <span className="text-lg font-mono text-accent">
                      ${deliveryAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <Field label="Каса *">
                    <select
                      value={deliveryRegisterId}
                      onChange={(e) => setDeliveryRegisterId(Number(e.target.value))}
                      className={inputCls}
                    >
                      {paymentRegisters.map((r) => (
                        <option key={r.id} value={r.id}>{r.name} ({r.balance.toLocaleString()} {r.currencyCode})</option>
                      ))}
                    </select>
                  </Field>
                  {deliveryCurrency !== 'USD' && (
                    <Field label={rateLabelForRegister(deliveryCurrency) ?? 'Курс'}>
                      <input
                        type="number"
                        step={0.0001}
                        value={deliveryRateTouched ? deliveryRate : String(deliveryDefaultRate)}
                        onChange={(e) => { setDeliveryRate(e.target.value); setDeliveryRateTouched(true) }}
                        className={inputCls}
                      />
                      <p className="text-[10px] text-textSecondary mt-1">{formatRateHint(deliveryCurrency, paymentRates)}</p>
                    </Field>
                  )}
                  {deliveryError && <p className="text-xs text-red-400">{deliveryError}</p>}
                  <p className="text-[11px] text-textSecondary">Списання з обраної каси та додавання до собівартості / вложеного в авто.</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePayDeliveryCost}
                      disabled={isPending}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-accent text-background hover:bg-accent/90 transition-all disabled:opacity-50"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      {isPending ? 'Оплата...' : 'Оплатити'}
                    </button>
                    <button
                      onClick={resetDeliveryForm}
                      disabled={isPending}
                      className="px-4 py-2 rounded-md text-sm border border-border text-textSecondary hover:text-textPrimary transition-all disabled:opacity-50"
                    >
                      Скасувати
                    </button>
                  </div>
                </div>
              ) : hasDeliveryCost ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div>
                      <p className="text-xs text-textSecondary mb-0.5">Вартість доставки</p>
                      <p className="text-2xl font-mono text-accent">
                        ${deliveryAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                      <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded border ${vehicle.deliveryPaidFromCash ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-amber-500/30 text-amber-400 bg-amber-500/10'}`}>
                        {vehicle.deliveryPaidFromCash ? 'Оплачено з каси' : 'Не оплачено'}
                      </span>
                    </div>
                    {!isReadOnly && canEdit && (
                      <div className="flex flex-wrap items-center gap-1.5 justify-start sm:justify-end">
                        {!vehicle.deliveryPaidFromCash && (
                          <button
                            onClick={() => {
                              setDeliveryMode('pay')
                              setDeliveryError('')
                              setDeliveryRateTouched(false)
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition-all"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            Оплатити
                          </button>
                        )}
                        <button
                          onClick={() => openDeliveryForm('edit')}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium border border-border text-textSecondary hover:text-accent hover:border-accent/30 transition-all"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Редагувати доставку
                        </button>
                        <button
                          onClick={() => setShowDeliveryDeleteConfirm(true)}
                          className="p-2 rounded-md border border-border text-textSecondary hover:text-red-400 hover:border-red-400/30 transition-all"
                          title="Видалити"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  {showDeliveryDeleteConfirm && (
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-red-500/5 border border-red-500/20 rounded-lg">
                      <p className="text-xs text-red-400">
                        {vehicle.deliveryPaidFromCash
                          ? 'Видалити доставку та повернути кошти в касу?'
                          : 'Видалити вартість доставки?'}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={handleRemoveDeliveryCost}
                          disabled={isPending}
                          className="px-3 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-50"
                        >
                          Так
                        </button>
                        <button
                          onClick={() => setShowDeliveryDeleteConfirm(false)}
                          className="px-3 py-1 rounded text-xs text-textSecondary hover:text-textPrimary transition-all"
                        >
                          Ні
                        </button>
                      </div>
                    </div>
                  )}
                  {deliveryError && <p className="text-xs text-red-400">{deliveryError}</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border">
                    <DetailRow label="Контейнер" value={vehicle.containerNumber} />
                    <DetailRow
                      label="Орієнтовна дата доставки"
                      value={vehicle.estimatedDeliveryDate ? fmt(vehicle.estimatedDeliveryDate) : null}
                    />
                    <DetailRow
                      label="Лот"
                      value={
                        vehicle.lotUrl ? (
                          <a href={vehicle.lotUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline truncate block max-w-full">
                            {vehicle.lotUrl}
                          </a>
                        ) : null
                      }
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <DetailRow label="Контейнер" value={vehicle.containerNumber} />
                    <DetailRow
                      label="Орієнтовна дата доставки"
                      value={vehicle.estimatedDeliveryDate ? fmt(vehicle.estimatedDeliveryDate) : null}
                    />
                    <DetailRow
                      label="Лот"
                      value={
                        vehicle.lotUrl ? (
                          <a href={vehicle.lotUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline truncate block max-w-full">
                            {vehicle.lotUrl}
                          </a>
                        ) : null
                      }
                    />
                  </div>
                  {!isReadOnly && canEdit && (
                    <button
                      onClick={() => openDeliveryForm('set')}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium border border-accent/30 text-accent hover:bg-accent/10 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      Вказати доставку
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div id="vehicle-expenses" className="bg-surface border border-border rounded-xl overflow-hidden scroll-mt-[calc(4rem+env(safe-area-inset-top,0px)+3.75rem)] min-w-0">
            <div className="px-4 sm:px-5 py-3.5 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-textPrimary">Журнал витрат</h2>
                <p className="text-xs text-textSecondary mt-0.5">Усі списання з кас, привʼязані до цього авто</p>
              </div>
              <span className="font-mono text-sm text-textPrimary self-start sm:self-auto">
                ${vehicle.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {expenses.length === 0 ? (
              <p className="px-4 sm:px-5 py-8 text-sm text-textSecondary text-center">Витрат ще немає — додайте через кнопку зверху</p>
            ) : (
              <>
                <div className="md:hidden divide-y divide-border">
                  {expenses.map((t) => {
                    const details = expenseDetailLines(t)
                    const editable = isExpenseEditable(t)
                    const deletable = canDeleteExpense && isExpenseDeletable(t)
                    const stoRecord = expenseStoRecord(t)
                    return (
                      <ExpenseMobileCard
                        key={t.id}
                        t={t}
                        details={details}
                        editable={editable}
                        deletable={deletable}
                        stoRecord={stoRecord}
                        isReadOnly={isReadOnly}
                        confirmDelete={deleteExpenseId === t.id}
                        isPending={isPending}
                        onEdit={() => handleEditExpense(t)}
                        onAskDelete={() => setDeleteExpenseId(t.id)}
                        onConfirmDelete={() => handleDeleteExpense(t)}
                        onCancelDelete={() => setDeleteExpenseId(null)}
                      />
                    )
                  })}
                </div>
                <div className="hidden md:block">
                <table className="w-full text-sm text-textSecondary">
                  <thead className="border-b border-border bg-surfaceHover">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-textPrimary uppercase text-xs tracking-wider whitespace-nowrap">Коли / Хто</th>
                      <th className="px-4 py-3 text-left font-medium text-textPrimary uppercase text-xs tracking-wider whitespace-nowrap">Категорія</th>
                      <th className="px-4 py-3 text-left font-medium text-textPrimary uppercase text-xs tracking-wider">Опис</th>
                      <th className="px-4 py-3 text-left font-medium text-textPrimary uppercase text-xs tracking-wider hidden lg:table-cell">Деталі</th>
                      <th className="px-4 py-3 text-left font-medium text-textPrimary uppercase text-xs tracking-wider whitespace-nowrap">Каса</th>
                      <th className="px-4 py-3 text-right font-medium text-textPrimary uppercase text-xs tracking-wider whitespace-nowrap">Сума</th>
                      <th className="px-3 py-3 w-[108px]" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {expenses.map((t) => {
                      const details = expenseDetailLines(t)
                      const editable = isExpenseEditable(t)
                      const deletable = canDeleteExpense && isExpenseDeletable(t)
                      const stoRecord = expenseStoRecord(t)
                      return (
                        <ExpenseTableRow
                          key={t.id}
                          t={t}
                          details={details}
                          editable={editable}
                          deletable={deletable}
                          stoRecord={stoRecord}
                          isReadOnly={isReadOnly}
                          confirmDelete={deleteExpenseId === t.id}
                          isPending={isPending}
                          onEdit={() => handleEditExpense(t)}
                          onAskDelete={() => setDeleteExpenseId(t.id)}
                          onConfirmDelete={() => handleDeleteExpense(t)}
                          onCancelDelete={() => setDeleteExpenseId(null)}
                        />
                      )
                    })}
                  </tbody>
                </table>
                </div>
              </>
            )}
          </div>

          <div id="vehicle-repairs" className="bg-surface border border-border rounded-xl overflow-hidden scroll-mt-[calc(4rem+env(safe-area-inset-top,0px)+3.75rem)]">
            <div className="px-5 py-3.5 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-textPrimary flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-accent" /> Ремонти (СТО)
                  <span className="text-textSecondary/50 font-normal">({vehicle.StoRecords.length})</span>
                </h2>
                <p className="text-xs text-textSecondary mt-0.5">Роботи та їх вартість у собівартості</p>
              </div>
              {!isReadOnly && canCreateRepair && repairTypes.length > 0 && (
                <button
                  type="button"
                  onClick={openAddStoRecord}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-accent text-background rounded-lg text-sm font-semibold hover:bg-accent/90 transition-colors shrink-0 self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" /> Додати роботу
                </button>
              )}
            </div>
            <StoRecordTable
              records={vehicle.StoRecords.map((r) => ({
                ...r,
                createdAt: String(r.createdAt),
              }))}
              isReadOnly={isReadOnly}
              canDelete={canDeleteRepair}
              canAdd={!isReadOnly && canCreateRepair && repairTypes.length > 0}
              onAdd={openAddStoRecord}
              onEdit={!isReadOnly && canEditRepair ? openEditStoRecord : undefined}
              onDeleted={() => { notifyCrmRefresh('topbar'); router.refresh() }}
            />
          </div>

            <div id="vehicle-details" className="bg-surface border border-border rounded-xl p-4 sm:p-5 scroll-mt-[calc(4rem+env(safe-area-inset-top,0px)+3.75rem)] min-w-0">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-textPrimary mb-1">Технічні дані</h2>
                  <p className="text-xs text-textSecondary">Марка, модель, характеристики — натисніть «Редагувати дані» зверху</p>
                </div>
                {!isReadOnly && canEdit && (
                  <button
                    type="button"
                    onClick={openEditModal}
                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs text-textSecondary hover:text-textPrimary hover:border-accent/40 transition-all"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Редагувати
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <DetailRow label="Рік" value={vehicle.manufactureYear} />
                <DetailRow label="Двигун" value={vehicle.engineVolume ? `${vehicle.engineVolume}L` : null} />
                <DetailRow
                  label="Пробіг"
                  value={vehicle.mileage != null ? `${vehicle.mileage.toLocaleString('uk-UA')} км` : null}
                />
                <DetailRow label="Паливо" value={vehicle.FuelType?.name} />
                <DetailRow label="Країна купівлі" value={vehicle.PurchaseCountry?.name} />
                <DetailRow label="Привід" value={vehicle.DriveType?.name} />
                <DetailRow label="Трансмісія" value={vehicle.Transmission?.name} />
                {vehicle.lotUrl && (
                  <DetailRow
                    label="Лот"
                    value={
                      <a href={vehicle.lotUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline truncate block">
                        {vehicle.lotUrl}
                      </a>
                    }
                  />
                )}
                {vehicle.notes && (
                  <div className="col-span-2 pt-2 border-t border-border mt-1">
                    <dt className="text-xs text-textSecondary mb-1">Нотатки</dt>
                    <dd className="text-sm text-textPrimary whitespace-pre-wrap">{vehicle.notes}</dd>
                  </div>
                )}
              </div>
            </div>

            {/* Photos */}
            <div id="vehicle-photos" className="bg-surface border border-border rounded-xl overflow-hidden scroll-mt-[calc(4rem+env(safe-area-inset-top,0px)+3.75rem)]">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-textPrimary flex items-center gap-2">
                    <ImagePlus className="w-4 h-4 text-accent" /> Фото
                    <span className="text-textSecondary/50 font-normal">({generalPhotos.length})</span>
                  </h2>
                  <p className="text-xs text-textSecondary mt-0.5">Перше фото можна зробити обкладинкою</p>
                </div>
                {!isReadOnly && canEdit && canUploadDocs && (
                  <>
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="flex items-center gap-1.5 text-xs text-accent border border-accent/30 hover:border-accent/60 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
                    >
                      {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                      {uploadingPhoto ? 'Завантаження...' : 'Додати фото'}
                    </button>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={e => handlePhotoUpload(e.target.files)}
                    />
                  </>
                )}
              </div>
              {generalPhotos.length === 0 ? (
                <div
                  onClick={() => !isReadOnly && photoInputRef.current?.click()}
                  className={`px-5 py-10 text-center text-sm text-textSecondary ${!isReadOnly ? 'cursor-pointer hover:bg-surfaceHover transition-colors' : ''}`}
                >
                  {isReadOnly ? 'Немає фото' : 'Натисніть, щоб додати фото'}
                </div>
              ) : (
                <div className="p-3 sm:p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                  {generalPhotos.filter(p => !p.isCover).concat(generalPhotos.filter(p => p.isCover)).sort((a,b) => (b.isCover ? 1 : 0) - (a.isCover ? 1 : 0)).map(photo => (
                    <div
                      key={photo.id}
                      className={`group relative aspect-square rounded-md overflow-hidden border bg-background ${photo.isCover ? 'border-accent shadow-neon' : 'border-border'}`}
                      onClick={() => {
                        if (isReadOnly) {
                          openLightbox(generalPhotos, photo.filePath)
                          return
                        }
                        if (window.matchMedia('(hover: none)').matches) {
                          setPhotoActionsId(prev => prev === photo.id ? null : photo.id)
                        }
                      }}
                    >
                      <img
                        src={assetUrl(photo.filePath)}
                        alt={photo.originalName}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105 pointer-events-none"
                      />
                      {photo.isCover && (
                        <div className="absolute top-1 left-1 bg-accent text-background text-[9px] font-bold px-1.5 py-0.5 rounded pointer-events-none">
                          COVER
                        </div>
                      )}
                      <div
                        className={`absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 ${
                          photoActionsId === photo.id ? '!opacity-100 !bg-black/60' : ''
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => { setPhotoActionsId(null); openLightbox(generalPhotos, photo.filePath) }}
                          className="w-7 h-7 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                          title="Переглянути"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                        {!isReadOnly && !photo.isCover && (
                          <button
                            type="button"
                            onClick={() => { handleSetCover(photo.id); setPhotoActionsId(null) }}
                            disabled={isPending}
                            className="w-7 h-7 rounded-full bg-accent/80 backdrop-blur flex items-center justify-center text-background hover:bg-accent transition-colors disabled:opacity-50"
                            title="Зробити заставкою"
                          >
                            <ImagePlus className="w-3 h-3" />
                          </button>
                        )}
                        {!isReadOnly && canEdit && canUploadDocs && (
                          confirmDeletePhotoId === photo.id ? (
                            <button
                              type="button"
                              onClick={() => { handleDeletePhoto(photo.id); setConfirmDeletePhotoId(null); setPhotoActionsId(null) }}
                              disabled={isPending}
                              className="h-7 px-2 rounded-full bg-red-500 text-white text-[10px] font-bold hover:bg-red-600 transition-colors disabled:opacity-50"
                              title="Натисни ще раз"
                            >
                              Видалити?
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeletePhotoId(photo.id)}
                              className="w-7 h-7 rounded-full bg-red-500/70 backdrop-blur flex items-center justify-center text-white hover:bg-red-500 transition-colors"
                              title="Видалити"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                  {!isReadOnly && (
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      className="aspect-square rounded-md border border-dashed border-border hover:border-accent/50 bg-background hover:bg-accent/5 flex flex-col items-center justify-center gap-1 text-textSecondary hover:text-accent transition-all"
                    >
                      <ImagePlus className="w-5 h-5" />
                      <span className="text-[10px]">Додати</span>
                    </button>
                  )}
                </div>
                </div>
              )}
            </div>

            <div id="vehicle-comments" className="scroll-mt-[calc(4rem+env(safe-area-inset-top,0px)+3.75rem)]">
            <CommentsSection
              comments={vehicle.Comments}
              entityType="vehicle"
              entityId={vehicle.id}
              currentUserId={currentUserId}
              isReadOnly={isReadOnly}
            />
            </div>

            <div id="vehicle-other" className="bg-surface border border-border rounded-xl overflow-hidden scroll-mt-[calc(4rem+env(safe-area-inset-top,0px)+3.75rem)]">
              <div className="px-4 sm:px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-textPrimary flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" /> Пошкодження
                    <span className="text-textSecondary/50 font-normal">({vehicle.Damages.length})</span>
                  </h2>
                  <p className="text-xs text-textSecondary mt-0.5">Фіксація пошкоджень та фото</p>
                </div>
                {!isReadOnly && (
                  <button
                    onClick={() => setShowDamageForm((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-accent border border-accent/30 hover:border-accent/60 px-3 py-1.5 rounded-md transition-colors shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Додати
                  </button>
                )}
              </div>

              {showDamageForm && !isReadOnly && (
                <div className="px-4 sm:px-5 py-4 border-b border-border space-y-3 bg-background/30">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-textSecondary mb-1">Клас пошкодження</label>
                      <select
                        value={damageForm.damageTypeId}
                        onChange={(e) => setDamageForm((f) => ({ ...f, damageTypeId: Number(e.target.value) }))}
                        className={inputCls}
                      >
                        <option value={0}>Оберіть...</option>
                        {damageTypes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <InlineDictAdd
                        placeholder="Новий клас..."
                        onAdd={async (name) => {
                          const r = await createDamageTypeEntry(name)
                          if (r.success && r.data) {
                            setDamageTypes((prev) => [...prev, r.data!].sort((a, b) => a.name.localeCompare(b.name)))
                            setDamageForm((f) => ({ ...f, damageTypeId: r.data!.id }))
                          }
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-textSecondary mb-1">Коментар *</label>
                      <input
                        value={damageForm.comment}
                        onChange={(e) => setDamageForm((f) => ({ ...f, comment: e.target.value }))}
                        placeholder="Опис пошкодження..."
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleAddDamage}
                      disabled={isPending || !damageForm.damageTypeId || !damageForm.comment.trim()}
                      className="flex items-center gap-1.5 bg-accent/10 border border-accent text-accent px-4 py-1.5 rounded text-sm hover:bg-accent hover:text-accentOn transition-all disabled:opacity-40"
                    >
                      <Check className="w-3.5 h-3.5" /> Зберегти
                    </button>
                    <button onClick={() => setShowDamageForm(false)} className="px-3 py-1.5 border border-border text-textSecondary rounded text-sm hover:text-textPrimary">
                      Скасувати
                    </button>
                  </div>
                </div>
              )}

              {vehicle.Damages.length === 0 && !showDamageForm ? (
                <p className="px-4 sm:px-5 py-8 text-sm text-textSecondary text-center">Пошкоджень не зафіксовано</p>
              ) : (
                <div className="divide-y divide-border">
                  {vehicle.Damages.map((dmg) => (
                    <div key={dmg.id} className="px-4 sm:px-5 py-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              {dmg.DamageType.name}
                            </span>
                            <span className="text-xs text-textSecondary">{fmt(dmg.createdAt)}</span>
                          </div>
                          <p className="text-sm text-textPrimary mt-1 break-words">{dmg.comment}</p>
                          {dmg.Photos.length > 0 && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {dmg.Photos.map((p) => (
                                <img
                                  key={p.id}
                                  src={assetUrl(p.filePath)}
                                  alt="damage"
                                  onClick={() => openLightbox(generalPhotos, p.filePath)}
                                  className="w-16 h-16 object-cover rounded border border-border cursor-pointer hover:border-accent/50 transition-colors"
                                />
                              ))}
                            </div>
                          )}
                          {!isReadOnly && canEdit && canUploadDocs && (
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                id={`dmg-photo-${dmg.id}`}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={(e) => handleDamagePhotoUpload(dmg.id, e.target.files)}
                              />
                              <button
                                onClick={() => document.getElementById(`dmg-photo-${dmg.id}`)?.click()}
                                disabled={uploadingDamagePhoto === dmg.id}
                                className="text-[11px] text-accent hover:underline flex items-center gap-1 disabled:opacity-50"
                              >
                                {uploadingDamagePhoto === dmg.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                                Фото пошкодження
                              </button>
                            </div>
                          )}
                        </div>
                        {!isReadOnly && canEdit && (
                          <button
                            onClick={() => handleDeleteDamage(dmg.id)}
                            disabled={isPending}
                            className="text-textSecondary hover:text-red-400 p-1 transition-colors disabled:opacity-50 shrink-0 mt-0.5"
                            title="Видалити"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div id="vehicle-documents" className="bg-surface border border-border rounded-xl overflow-hidden scroll-mt-[calc(4rem+env(safe-area-inset-top,0px)+3.75rem)]">
              <div className="px-4 sm:px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-textPrimary flex items-center gap-2">
                    <FileText className="w-4 h-4 text-accent" /> Документи (PDF)
                    <span className="text-textSecondary/50 font-normal">({vehicle.Documents.length})</span>
                  </h2>
                  <p className="text-xs text-textSecondary mt-0.5">Договори, інвойси та інші PDF</p>
                </div>
                {!isReadOnly && canEdit && canUploadDocs && (
                  <>
                    <button
                      onClick={() => docInputRef.current?.click()}
                      disabled={uploadingDoc}
                      className="flex items-center gap-1.5 text-xs text-accent border border-accent/30 hover:border-accent/60 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 shrink-0"
                    >
                      {uploadingDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
                      {uploadingDoc ? 'Завантаження...' : 'Додати PDF'}
                    </button>
                    <input
                      ref={docInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      multiple
                      className="hidden"
                      onChange={e => handleDocUpload(e.target.files)}
                    />
                  </>
                )}
              </div>
              {uploadError && (
                <div className="mx-4 sm:mx-5 mt-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
                  {uploadError}
                </div>
              )}
              {vehicle.Documents.length === 0 ? (
                <div
                  onClick={() => !isReadOnly && docInputRef.current?.click()}
                  className={`px-4 sm:px-5 py-8 text-center text-sm text-textSecondary ${!isReadOnly ? 'cursor-pointer hover:bg-surfaceHover transition-colors' : ''}`}
                >
                  {isReadOnly ? 'Немає документів' : 'Натисніть, щоб завантажити PDF'}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {vehicle.Documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-surfaceHover transition-colors group min-w-0">
                      <FileText className="w-4 h-4 text-textSecondary shrink-0" />
                      <a
                        href={assetUrl(doc.filePath)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-0 text-sm text-textPrimary hover:text-accent transition-colors truncate"
                        title={doc.originalName}
                      >
                        {doc.originalName}
                      </a>
                      {!isReadOnly && canDeleteDocs && (
                        <button
                          onClick={() => handleDeleteDoc(doc.id)}
                          disabled={isPending}
                          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-textSecondary hover:text-red-400 p-1 disabled:opacity-50 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div id="vehicle-status-history" className="bg-surface border border-border rounded-xl overflow-hidden scroll-mt-[calc(4rem+env(safe-area-inset-top,0px)+3.75rem)]">
              <div className="px-4 sm:px-5 py-3.5 border-b border-border">
                <h2 className="text-sm font-semibold text-textPrimary flex items-center gap-2">
                  <History className="w-4 h-4 text-textSecondary" /> Історія статусів
                </h2>
                <p className="text-xs text-textSecondary mt-0.5">Хронологія змін статусу авто</p>
              </div>
              <div className="divide-y divide-border">
                {vehicle.StatusHistory.map((h, i) => (
                  <div key={h.id} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 sm:px-5 py-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${i === 0 ? 'bg-accent shadow-neon' : 'bg-border'}`} />
                      <span className="text-sm text-textPrimary">{h.Status.name}</span>
                    </div>
                    <RecordAttribution
                      at={h.createdAt}
                      user={{ fullName: h.User.fullName }}
                      className="pl-4 sm:pl-0 sm:text-right"
                    />
                  </div>
                ))}
              </div>
            </div>
        </div>
        </div>
      </div>

      <OverlayPortal open={mode === 'edit'}>
        <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center p-0 md:p-6">
          <OverlayBackdrop onDismiss={requestCloseEditModal} className="absolute inset-0 bg-black/70" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-vehicle-title"
            className="relative flex flex-col w-full md:max-w-4xl lg:max-w-5xl max-h-[94dvh] md:max-h-[min(90vh,52rem)] bg-surface border border-border shadow-elevated overflow-hidden rounded-t-2xl md:rounded-xl"
          >
            <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 md:py-4 border-b border-border shrink-0">
              <div className="min-w-0">
                <h3 id="edit-vehicle-title" className="font-semibold text-textPrimary truncate text-base md:text-lg">Редагувати дані</h3>
                <p className="text-[11px] md:text-xs text-textSecondary truncate mt-0.5">
                  {vehicle.Model.Make.name} {vehicle.Model.name} · {vehicle.vin}
                </p>
              </div>
              <button
                type="button"
                onClick={requestCloseEditModal}
                className="p-2 rounded-lg text-textSecondary hover:text-textPrimary hover:bg-surfaceHover transition-colors shrink-0"
                aria-label="Закрити"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {draftRestoredAt && (
              <div className="px-4 md:px-6 py-2.5 bg-accent/5 border-b border-accent/20 shrink-0">
                <div className="flex items-start gap-2 text-accent text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p>Відновлено чернетку від {new Date(draftRestoredAt).toLocaleTimeString('uk', { hour: '2-digit', minute: '2-digit' })}</p>
                    {draftRestoredFields.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {draftRestoredFields.map((f) => (
                          <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {isDirty && (
              <div className="px-4 md:px-6 py-2 bg-yellow-500/10 border-b border-yellow-500/20 shrink-0">
                <p className="text-[11px] text-yellow-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  Є незбережені зміни
                </p>
              </div>
            )}

            <div className="themed-scrollbar overflow-y-auto overscroll-contain px-4 md:px-6 py-4 md:py-5 flex-1 min-h-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <div className="md:col-span-2">
                  <Field label="VIN *">
                    <input value={editForm.vin} onChange={(e) => setEdit('vin', e.target.value.toUpperCase())} className={`${inputCls} font-mono`} />
                  </Field>
                </div>
                <Field label="Марка *">
                  <select value={editForm.makeId} onChange={(e) => handleMakeChange(Number(e.target.value))} className={inputCls}>
                    {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </Field>
                <Field label="Модель *">
                  <select value={editForm.modelId} onChange={(e) => setEdit('modelId', Number(e.target.value))} className={inputCls}>
                    {editFilteredModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </Field>
                <Field label="Рік">
                  <input type="number" value={editForm.manufactureYear} onChange={(e) => setEdit('manufactureYear', e.target.value)} placeholder="2020" className={inputCls} />
                </Field>
                <Field label="Двигун (L)">
                  <input type="number" step="0.1" value={editForm.engineVolume} onChange={(e) => setEdit('engineVolume', e.target.value)} placeholder="2.0" className={inputCls} />
                </Field>
                <Field label="Пробіг (км)">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={editForm.mileage}
                    onChange={(e) => setEdit('mileage', e.target.value)}
                    placeholder="150000"
                    className={inputCls}
                  />
                </Field>
                <Field label="Країна купівлі *">
                  <select
                    value={editForm.purchaseCountryId}
                    onChange={(e) => setEdit('purchaseCountryId', Number(e.target.value))}
                    className={inputCls}
                  >
                    <option value={0}>Оберіть...</option>
                    {purchaseCountries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Паливо">
                  <select value={editForm.fuelTypeId} onChange={(e) => setEdit('fuelTypeId', Number(e.target.value))} className={inputCls}>
                    <option value={0}>Не вказано</option>
                    {fuelTypes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </Field>
                <Field label="Привід">
                  <select value={editForm.driveTypeId} onChange={(e) => setEdit('driveTypeId', Number(e.target.value))} className={inputCls}>
                    <option value={0}>Не вказано</option>
                    {driveTypes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label="Трансмісія">
                  <select value={editForm.transmissionId} onChange={(e) => setEdit('transmissionId', Number(e.target.value))} className={inputCls}>
                    <option value={0}>Не вказано</option>
                    {transmissions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
                <Field label="Ціна купівлі ($) *">
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={editForm.purchaseCostUsd}
                    onChange={(e) => setEdit('purchaseCostUsd', e.target.value)}
                    placeholder="15000"
                    className={inputCls}
                  />
                </Field>
                {!vehicleHasPurchase(vehicle.Transactions) && editForm.purchaseCostUsd && Number(editForm.purchaseCostUsd) > 0 ? (
                  <Field label="Каса списання *">
                    <select
                      value={purchaseRegisterId}
                      onChange={(e) => setPurchaseRegisterId(Number(e.target.value))}
                      className={inputCls}
                    >
                      {paymentRegisters.map((r) => (
                        <option key={r.id} value={r.id}>{r.name} ({r.currencyCode})</option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <div className="hidden md:block" />
                )}
                <Field label="Контейнер">
                  <input value={editForm.containerNumber} onChange={(e) => setEdit('containerNumber', e.target.value)} className={inputCls} />
                </Field>
                <Field label="Посилання на лот">
                  <input value={editForm.lotUrl ?? ''} onChange={(e) => setEdit('lotUrl', e.target.value)} className={inputCls} placeholder="https://..." />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Нотатки">
                    <textarea value={editForm.notes} onChange={(e) => setEdit('notes', e.target.value)} rows={3} className={`${inputCls} resize-none`} />
                  </Field>
                </div>
              </div>
              {error && (
                <p className="mt-4 text-sm text-red-400 flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  {error}
                </p>
              )}
            </div>

            <div
              className="shrink-0 border-t border-border px-4 md:px-6 py-3 md:py-4 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end bg-surface"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              <button
                type="button"
                onClick={requestCloseEditModal}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-border text-sm text-textSecondary hover:text-textPrimary transition-colors"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isPending}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg bg-accent text-background text-sm font-semibold hover:bg-accent/90 transition-all disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {isPending ? 'Збереження...' : 'Зберегти'}
              </button>
            </div>
          </div>
        </div>

        {showDiscardEditConfirm && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <OverlayBackdrop onDismiss={() => setShowDiscardEditConfirm(false)} className="absolute inset-0 bg-black/60" />
            <div className="relative bg-surface border border-border rounded-xl w-full max-w-sm shadow-elevated p-5 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-textPrimary">Незбережені зміни</h4>
                  <p className="text-sm text-textSecondary mt-1">
                    Якщо продовжити, зміни буде втрачено. Зберегти перед виходом?
                  </p>
                  {changedFieldsRef.current.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {changedFieldsRef.current.map((f) => (
                        <span key={f} className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDiscardEditConfirm(false)
                    handleSaveEdit()
                  }}
                  disabled={isPending}
                  className="w-full py-2.5 rounded-md text-sm font-semibold bg-accent/10 border border-accent text-accent hover:bg-accent hover:text-accentOn transition-all disabled:opacity-50"
                >
                  Зберегти
                </button>
                <button
                  type="button"
                  onClick={() => closeEditModal()}
                  className="w-full py-2.5 rounded-md text-sm border border-border text-textSecondary hover:text-textPrimary transition-colors"
                >
                  Вийти без збереження
                </button>
                <button
                  type="button"
                  onClick={() => setShowDiscardEditConfirm(false)}
                  className="w-full py-2.5 rounded-md text-sm text-textSecondary hover:text-textPrimary transition-colors"
                >
                  Залишитись
                </button>
              </div>
            </div>
          </div>
        )}
      </OverlayPortal>

      {showStatusModal && (
        <StatusModal
          statuses={statuses}
          currentId={vehicle.CurrentStatus.id}
          vehicle={vehicle}
          paymentRates={paymentRates}
          initialStatusId={statusModalInitialId}
          onClose={() => { setShowStatusModal(false); setStatusModalInitialId(undefined); setStatusError('') }}
          onConfirm={handleStatusChange}
          isPending={isPending}
          statusError={statusError}
        />
      )}

      {showDeleteModal && (
        <DeleteModal
          vehicle={vehicle}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDelete}
          isPending={isPending}
        />
      )}

      {(showStoModal || editStoRecord) && (
        <StoRecordModal
          vehicleId={vehicle.id}
          repairTypes={repairTypes}
          registers={paymentRegisters}
          rates={paymentRates}
          userDefaultRegisterId={userDefaultRegisterId}
          editRecord={editStoRecord}
          onClose={() => { setShowStoModal(false); setEditStoRecord(null) }}
          onSaved={() => { setShowStoModal(false); setEditStoRecord(null); notifyCrmRefresh('topbar'); router.refresh() }}
        />
      )}

      {editingExpense && (
        <ExpenseEditModal
          transaction={editingExpense}
          vehicleId={vehicle.id}
          registers={paymentRegisters}
          categories={expenseCategories}
          rates={paymentRates}
          onClose={() => setEditingExpense(null)}
          onSaved={() => { notifyCrmRefresh('topbar'); router.refresh() }}
        />
      )}

      {showQuickExpense && (
        <QuickExpenseModal
          vehicleId={vehicle.id}
          registers={paymentRegisters}
          categories={expenseCategoriesLocal}
          rates={paymentRates}
          userDefaultRegisterId={userDefaultRegisterId}
          canEditDict={canEditDict}
          onAddCategory={handleAddExpenseCategory}
          onClose={() => setShowQuickExpense(false)}
          onSaved={() => { setShowQuickExpense(false); notifyCrmRefresh('topbar'); router.refresh() }}
        />
      )}

      {showExportModal && (
        <VehicleExportModal
          vehicle={vehicle}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {lightboxPhoto && lightboxIndex != null && (
        <>
          <div
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={closeLightbox}
          >
            <button
              type="button"
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
              onClick={closeLightbox}
            >
              <X className="w-5 h-5" />
            </button>
            {lightboxPhotos.length > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
                  onClick={(e) => {
                    e.stopPropagation()
                    setLightboxIndex((i) => (i != null ? (i - 1 + lightboxPhotos.length) % lightboxPhotos.length : null))
                  }}
                  title="Попереднє"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
                  onClick={(e) => {
                    e.stopPropagation()
                    setLightboxIndex((i) => (i != null ? (i + 1) % lightboxPhotos.length : null))
                  }}
                  title="Наступне"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
            <div className="flex flex-col items-center max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
              <img
                src={assetUrl(lightboxPhoto.filePath)}
                alt={lightboxPhoto.originalName}
                className="max-w-full max-h-[calc(100vh-8rem)] object-contain rounded-lg shadow-2xl"
              />
              {lightboxPhotos.length > 1 && (
                <p className="mt-3 text-xs text-white/60 font-mono">
                  {lightboxIndex + 1} / {lightboxPhotos.length}
                </p>
              )}
            </div>
          </div>
        </>
      )}
      {overdraftPending && (
        <NegativeBalanceConfirmModal
          open
          registerName={overdraftPending.registerName}
          balance={overdraftPending.balance}
          amount={overdraftPending.amount}
          currencyCode={overdraftPending.currencyCode}
          onConfirm={handleOverdraftConfirm}
          onCancel={handleOverdraftCancel}
        />
      )}
    </>
  )
}
