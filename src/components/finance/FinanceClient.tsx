'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  Plus,
  ArrowLeftRight,
  X,
  Trash2,
  Pencil,
  TrendingUp,
  TrendingDown,
  Search,
  Clipboard,
  Wallet,
  Car,
} from 'lucide-react'
import DateInput from '@/components/shared/DateInput'
import OverlayBackdrop from '@/components/shared/OverlayBackdrop'
import { armOverlayOpen } from '@/lib/overlay-guard'
import { toast } from 'sonner'
import InlineAdd from '@/components/shared/InlineAdd'
import { addDictionaryItem } from '@/actions/dictionaries'
import {
  resolveRegisterContainerClass,
  resolveRegisterContainerStyle,
  resolveRegisterDotClass,
  resolveRegisterDotStyle,
} from '@/lib/register-tones'
import {
  createTransaction,
  updateTransaction,
  transferFunds,
  deleteTransaction,
  restoreTransaction,
  payCustomsDebt,
  payDeliveryBatch,
} from '@/actions/finance'
import TransactionAmount from '@/components/shared/TransactionAmount'
import ExpandableText from '@/components/shared/ExpandableText'
import NegativeBalanceConfirmModal, { usePendingOverdraftConfirm } from '@/components/shared/NegativeBalanceConfirmModal'
import RecordAttribution from '@/components/shared/RecordAttribution'
import VehicleSearchPanel from '@/components/shared/VehicleSearchPanel'
import VehicleSearchCombobox from '@/components/shared/VehicleSearchCombobox'
import type { VehicleSearchOption } from '@/components/shared/VehicleSearchCombobox'
import type { VehicleSearchItem } from '@/lib/vehicle-search'
import { notifyCrmRefresh } from '@/lib/crm-refresh'
import Pagination from '@/components/shared/Pagination'
import { useHasPermission } from '@/contexts/PermissionsContext'
import {
  defaultRateForRegister,
  rateLabelForRegister,
  usdToRegisterAmount,
  registerAmountToUsd,
  formatRateHint,
  defaultTransferRate,
  transferRateLabel,
  formatTransferRateHint,
  calcTransferAmountIn,
  calcTransferRateFromAmounts,
  formatSnapshotRateLine,
  type MonthRates,
} from '@/lib/currency'
import { formatIsoDateInAppTz, localTodayIso } from '@/lib/format-datetime'
import { allocatePaymentFifo } from '@/lib/stock-capital'
import { getTxDisplayType, isReversalAuditTx } from '@/lib/transaction-types'

type Register = {
  id: number
  name: string
  balance: number
  color?: string | null
  currency: { code: string; name: string }
}

type TransferTx = {
  id: number
  cashRegisterId: number
  cashRegisterName: string
  currencyCode: string
  type: string
  amount: number
}

type Tx = {
  id: number
  type: string
  amount: number
  description: string | null
  createdAt: string
  deletedAt?: string | null
  rateUsdSnapshot: number | null
  rateEurSnapshot: number | null
  cashRegister: { id: number; name: string; currency: { code: string } }
  expenseCategory: { id: number; name: string } | null
  vehicle: {
    id: number
    vin: string
    year: number | null
    mileage: number | null
    model: { name: string; make: { name: string } }
  } | null
  transferId: number | null
  transfer: {
    id: number
    factualExchangeRate: number | null
    notes: string | null
    transactions: TransferTx[]
  } | null
  createdByUser: { fullName: string; username?: string } | null
  isEditable: boolean
  /** False for «Транзакцію видалено» audit rows — never delete twice. */
  isDeletable?: boolean
  /** Soft-deleted originals only; reversal audit rows are not restorable. */
  isRestorable?: boolean
}

type Category = { id: number; name: string }
type Vehicle = VehicleSearchItem & {
  label: string
  statusName: string
  imageUrl?: string | null
}

type StockCapitalData = {
  stockCapitalUsd: number
  cashTotalUsd: number
  cashPlusStockUsd: number
  stockVehicleCount: number
  stockCapitalSharePct: number | null
  breakdown: { vehicleId: number; label: string; investedUsd: number }[]
}

type CustomsDebtor = {
  vehicleId: number
  label: string
  isFinal: boolean
  customsCostUsd: number
  paidUsd: number
  balanceUsd: number
  imageUrl?: string | null
}

type DeliveryPending = {
  vehicleId: number
  label: string
  isFinal: boolean
  deliveryCostUsd: number
  imageUrl?: string | null
}

type Props = {
  registers: Register[]
  transactions: Tx[]
  deletedTransactions?: Tx[]
  expenseCategories: Category[]
  vehicles: Vehicle[]
  statuses: { id: number; name: string; isFinal?: boolean }[]
  driveTypes: { id: number; name: string }[]
  transmissions: { id: number; name: string }[]
  customsDebt: number
  customsDebtors?: CustomsDebtor[]
  deliveryPending?: DeliveryPending[]
  stockCapitalHistory?: {
    date: string
    stockCapitalUsd: number
    cashTotalUsd: number
    cashPlusStockUsd: number
  }[]
  rates: MonthRates
  stockCapital?: StockCapitalData | null
  periodPnl?: {
    monthlyData: {
      year: number
      month: number
      label: string
      income: number
      expenses: number
      net: number
    }[]
    totalIncome12m: number
    totalExpenses12m: number
  } | null
  initialRegisterId?: number | null
}

type Tab = 'all' | 'income' | 'deposit' | 'withdraw' | 'expense' | 'investment' | 'transfer'

const TYPE_LABEL: Record<string, string> = {
  INCOME: 'Дохід',
  DEPOSIT: 'Поповнення',
  WITHDRAW: 'Вивід',
  EXPENSE: 'Витрата',
  INVESTMENT: 'Вложення',
  STORNO: 'Транзакцію видалено',
  TRANSFER_OUT: 'Переказ ↑',
  TRANSFER_IN: 'Переказ ↓',
}

const TYPE_BADGE: Record<string, string> = {
  INCOME: 'bg-green-500/10 text-green-400',
  DEPOSIT: 'bg-cyan-500/10 text-cyan-400',
  WITHDRAW: 'bg-amber-500/10 text-amber-400',
  EXPENSE: 'bg-red-500/10 text-red-400',
  INVESTMENT: 'bg-violet-500/10 text-violet-400',
  STORNO: 'bg-slate-500/10 text-slate-300',
  TRANSFER_OUT: 'bg-blue-500/10 text-blue-400',
  TRANSFER_IN: 'bg-blue-500/10 text-blue-400',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function transferPartner(tx: Tx): string | null {
  if (!tx.transfer) return null
  const partner = tx.transfer.transactions.find(t => t.id !== tx.id)
  if (!partner) return null
  if (tx.type === 'TRANSFER_OUT') {
    return `→ ${partner.cashRegisterName} (+${partner.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${partner.currencyCode})`
  }
  return `← ${partner.cashRegisterName} (−${partner.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${partner.currencyCode})`
}

function VehiclePickThumb({ imageUrl, alt }: { imageUrl?: string | null; alt: string }) {
  return (
    <div className="w-10 h-8 rounded overflow-hidden bg-background border border-border shrink-0 flex items-center justify-center">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={alt}
          width={40}
          height={32}
          unoptimized
          className="w-full h-full object-cover"
        />
      ) : (
        <Car size={14} className="text-textSecondary/50" />
      )}
    </div>
  )
}

const PICK_LIST_PER_PAGE = [5, 10, 20] as const

function PickListPagination({
  total,
  page,
  perPage,
  onPageChange,
  onPerPageChange,
}: {
  total: number
  page: number
  perPage: number
  onPageChange: (page: number) => void
  onPerPageChange: (n: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
      <div className="flex items-center gap-1 text-[11px] text-textSecondary">
        <span>На стор.:</span>
        {PICK_LIST_PER_PAGE.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              onPerPageChange(n)
              onPageChange(1)
            }}
            className={`px-1.5 py-0.5 rounded border text-[11px] transition-colors ${
              perPage === n
                ? 'border-accent text-accent bg-accent/10'
                : 'border-border hover:border-accent/40'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-textSecondary">
        <span>
          {from}–{to} з {total}
        </span>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="px-1.5 py-0.5 rounded border border-border disabled:opacity-30 hover:border-accent/40"
        >
          ‹
        </button>
        <span className="min-w-[1.5rem] text-center text-textPrimary">{page}</span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="px-1.5 py-0.5 rounded border border-border disabled:opacity-30 hover:border-accent/40"
        >
          ›
        </button>
      </div>
    </div>
  )
}

export default function FinanceClient({
  registers,
  transactions,
  deletedTransactions = [],
  expenseCategories,
  vehicles,
  statuses,
  driveTypes,
  transmissions,
  customsDebt,
  customsDebtors = [],
  deliveryPending = [],
  stockCapitalHistory = [],
  rates,
  stockCapital = null,
  periodPnl = null,
  initialRegisterId = null,
}: Props) {
  const router = useRouter()
  const canCreate = useHasPermission('finance.create')
  const canDelete = useHasPermission('finance.delete')
  const canPayCustoms = useHasPermission('finance.customs_pay')
  const canViewStock = useHasPermission('finance.stock_capital_view')
  const canEditDict = useHasPermission('dictionaries.edit')
  const [isPending, startTransition] = useTransition()
  const { pending: overdraftPending, confirmIfNeeded, handleConfirm: handleOverdraftConfirm, handleCancel: handleOverdraftCancel } =
    usePendingOverdraftConfirm()
  const [categories, setCategories] = useState(expenseCategories)
  const [showStockBreakdown, setShowStockBreakdown] = useState(false)

  useEffect(() => {
    setCategories(expenseCategories)
  }, [expenseCategories])

  const handleAddCategory = (name: string) => {
    if (!canEditDict) return
    startTransition(async () => {
      const res = await addDictionaryItem('expenseCategory', {
        name,
        position: categories.length + 1,
      })
      if (res.success && res.data) {
        const item = { id: res.data.id, name: res.data.name }
        setCategories((prev) => [...prev, item])
        setTxCategoryId(String(item.id))
        toast.success('Категорію додано')
      } else {
        toast.error(res.error ?? 'Помилка')
      }
    })
  }

  const [showDebtModal, setShowDebtModal] = useState(false)
  const [debtRegisterId, setDebtRegisterId] = useState(String(registers[0]?.id ?? ''))
  const [debtRate, setDebtRate] = useState('')
  const [debtRateTouched, setDebtRateTouched] = useState(false)
  const [debtError, setDebtError] = useState('')
  const [debtShowArchived, setDebtShowArchived] = useState(false)
  const [debtSelected, setDebtSelected] = useState<Record<number, number>>({})
  const [debtTotalInput, setDebtTotalInput] = useState('')
  const [debtConfirmNegative, setDebtConfirmNegative] = useState(false)
  const [debtAddVehicleId, setDebtAddVehicleId] = useState(0)
  const [debtSearch, setDebtSearch] = useState('')
  const [debtPage, setDebtPage] = useState(1)
  const [debtPerPage, setDebtPerPage] = useState(10)

  const debtRegister = registers.find((r) => r.id === Number(debtRegisterId))
  const debtCurrencyCode = debtRegister?.currency.code ?? 'USD'
  const debtDefaultRate = defaultRateForRegister(debtCurrencyCode, rates)
  const debtEffectiveRate =
    debtRateTouched && debtRate ? Number(debtRate) : debtDefaultRate

  const visibleDebtors = useMemo(
    () => customsDebtors.filter((d) => debtShowArchived || !d.isFinal),
    [customsDebtors, debtShowArchived]
  )

  const filteredDebtors = useMemo(() => {
    const q = debtSearch.trim().toLowerCase()
    if (!q) return visibleDebtors
    return visibleDebtors.filter((d) => d.label.toLowerCase().includes(q))
  }, [visibleDebtors, debtSearch])

  const pagedDebtors = useMemo(() => {
    const start = (debtPage - 1) * debtPerPage
    return filteredDebtors.slice(start, start + debtPerPage)
  }, [filteredDebtors, debtPage, debtPerPage])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredDebtors.length / debtPerPage))
    if (debtPage > maxPage) setDebtPage(maxPage)
  }, [filteredDebtors.length, debtPerPage, debtPage])

  const debtAllocationItems = useMemo(() => {
    return Object.entries(debtSelected)
      .map(([id, amountUsd]) => ({
        vehicleId: Number(id),
        amountUsd: Number(amountUsd) || 0,
      }))
      .filter((i) => i.amountUsd > 0.005)
  }, [debtSelected])

  const debtUsdNum = debtAllocationItems.reduce((s, i) => s + i.amountUsd, 0)
  const debtRegisterDeduction =
    debtUsdNum > 0 && debtRegister
      ? usdToRegisterAmount(
          debtUsdNum,
          debtCurrencyCode,
          rates,
          debtRateTouched ? debtEffectiveRate : null
        )
      : 0

  const openDebtModal = () => {
    setDebtSelected({})
    setDebtTotalInput('')
    setDebtShowArchived(false)
    setDebtError('')
    setDebtConfirmNegative(false)
    setDebtAddVehicleId(0)
    setDebtSearch('')
    setDebtPage(1)
    setDebtRateTouched(false)
    const reg = registers[0]
    setDebtRegisterId(String(reg?.id ?? ''))
    const code = reg?.currency.code ?? 'USD'
    const def = defaultRateForRegister(code, rates)
    setDebtRate(def != null ? String(def) : '')
    setShowDebtModal(true)
  }

  const applyFifoTotal = (totalUsd: number) => {
    const selectedIds = Object.keys(debtSelected).map(Number)
    const pool = (
      selectedIds.length > 0
        ? visibleDebtors.filter((d) => selectedIds.includes(d.vehicleId))
        : visibleDebtors
    ).map((d) => ({ vehicleId: d.vehicleId, balanceUsd: d.balanceUsd }))
    const alloc = allocatePaymentFifo(pool, Math.max(0, totalUsd))
    const next: Record<number, number> = {}
    for (const a of alloc) next[a.vehicleId] = a.amountUsd
    setDebtSelected(next)
    setDebtConfirmNegative(false)
  }

  const handleDebtRegisterChange = (registerId: string) => {
    setDebtRegisterId(registerId)
    setDebtRateTouched(false)
    setDebtConfirmNegative(false)
    const reg = registers.find((r) => r.id === Number(registerId))
    const code = reg?.currency.code ?? 'USD'
    const def = defaultRateForRegister(code, rates)
    setDebtRate(def != null ? String(def) : '')
  }

  const handlePayDebt = async (e: React.FormEvent) => {
    e.preventDefault()
    setDebtError('')
    if (debtAllocationItems.length === 0) {
      return setDebtError('Оберіть авто та суми погашення')
    }
    for (const item of debtAllocationItems) {
      const debtor = customsDebtors.find((d) => d.vehicleId === item.vehicleId)
      if (!debtor) return setDebtError('Список боржників застарів — оновіть сторінку')
      if (item.amountUsd > debtor.balanceUsd + 0.005) {
        return setDebtError(`Сума по «${debtor.label}» перевищує залишок`)
      }
    }
    startTransition(async () => {
      const res = await payCustomsDebt({
        cashRegisterId: Number(debtRegisterId),
        items: debtAllocationItems,
        customRate: debtRateTouched ? Number(debtRate) || null : null,
        confirmNegative: debtConfirmNegative,
      })
      if (res.success) {
        setShowDebtModal(false)
        setDebtConfirmNegative(false)
        if ('warning' in res && typeof res.warning === 'string') toast.warning(res.warning)
        notifyCrmRefresh('topbar')
        router.refresh()
      } else if (res.error === 'CONFIRM_NEGATIVE') {
        setDebtConfirmNegative(true)
        setDebtError(res.warning ?? 'Баланс каси стане від\'ємним. Підтвердіть ще раз.')
      } else {
        setDebtError(res.error ?? 'Помилка')
      }
    })
  }

  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [deliveryRegisterId, setDeliveryRegisterId] = useState(String(registers[0]?.id ?? ''))
  const [deliveryRate, setDeliveryRate] = useState('')
  const [deliveryRateTouched, setDeliveryRateTouched] = useState(false)
  const [deliveryError, setDeliveryError] = useState('')
  const [deliveryShowArchived, setDeliveryShowArchived] = useState(false)
  const [deliverySelectedIds, setDeliverySelectedIds] = useState<number[]>([])
  const [deliveryConfirmNegative, setDeliveryConfirmNegative] = useState(false)
  const [deliverySearch, setDeliverySearch] = useState('')
  const [deliveryPage, setDeliveryPage] = useState(1)
  const [deliveryPerPage, setDeliveryPerPage] = useState(10)

  const deliveryRegister = registers.find((r) => r.id === Number(deliveryRegisterId))
  const deliveryCurrencyCode = deliveryRegister?.currency.code ?? 'USD'
  const deliveryDefaultRate = defaultRateForRegister(deliveryCurrencyCode, rates)
  const deliveryEffectiveRate =
    deliveryRateTouched && deliveryRate ? Number(deliveryRate) : deliveryDefaultRate

  const visibleDeliveryPending = useMemo(
    () => deliveryPending.filter((d) => deliveryShowArchived || !d.isFinal),
    [deliveryPending, deliveryShowArchived]
  )

  const filteredDeliveryPending = useMemo(() => {
    const q = deliverySearch.trim().toLowerCase()
    if (!q) return visibleDeliveryPending
    return visibleDeliveryPending.filter((d) => d.label.toLowerCase().includes(q))
  }, [visibleDeliveryPending, deliverySearch])

  const pagedDeliveryPending = useMemo(() => {
    const start = (deliveryPage - 1) * deliveryPerPage
    return filteredDeliveryPending.slice(start, start + deliveryPerPage)
  }, [filteredDeliveryPending, deliveryPage, deliveryPerPage])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredDeliveryPending.length / deliveryPerPage))
    if (deliveryPage > maxPage) setDeliveryPage(maxPage)
  }, [filteredDeliveryPending.length, deliveryPerPage, deliveryPage])

  const deliverySelectedItems = useMemo(
    () =>
      visibleDeliveryPending.filter((d) => deliverySelectedIds.includes(d.vehicleId)),
    [visibleDeliveryPending, deliverySelectedIds]
  )

  const deliveryUsdNum = deliverySelectedItems.reduce((s, i) => s + i.deliveryCostUsd, 0)
  const deliveryRegisterDeduction =
    deliveryUsdNum > 0 && deliveryRegister
      ? usdToRegisterAmount(
          deliveryUsdNum,
          deliveryCurrencyCode,
          rates,
          deliveryRateTouched ? deliveryEffectiveRate : null
        )
      : 0

  const deliveryTotalPendingUsd = useMemo(
    () => deliveryPending.filter((d) => !d.isFinal).reduce((s, d) => s + d.deliveryCostUsd, 0),
    [deliveryPending]
  )

  const openDeliveryModal = () => {
    setDeliverySelectedIds([])
    setDeliveryShowArchived(false)
    setDeliveryError('')
    setDeliveryConfirmNegative(false)
    setDeliveryRateTouched(false)
    setDeliverySearch('')
    setDeliveryPage(1)
    const reg = registers[0]
    setDeliveryRegisterId(String(reg?.id ?? ''))
    const code = reg?.currency.code ?? 'USD'
    const def = defaultRateForRegister(code, rates)
    setDeliveryRate(def != null ? String(def) : '')
    setShowDeliveryModal(true)
  }

  const handleDeliveryRegisterChange = (registerId: string) => {
    setDeliveryRegisterId(registerId)
    setDeliveryRateTouched(false)
    setDeliveryConfirmNegative(false)
    const reg = registers.find((r) => r.id === Number(registerId))
    const code = reg?.currency.code ?? 'USD'
    const def = defaultRateForRegister(code, rates)
    setDeliveryRate(def != null ? String(def) : '')
  }

  const handlePayDelivery = async (e: React.FormEvent) => {
    e.preventDefault()
    setDeliveryError('')
    if (deliverySelectedItems.length === 0) {
      return setDeliveryError('Оберіть авто для оплати доставки')
    }
    startTransition(async () => {
      const res = await payDeliveryBatch({
        cashRegisterId: Number(deliveryRegisterId),
        vehicleIds: deliverySelectedItems.map((d) => d.vehicleId),
        customRate: deliveryRateTouched ? Number(deliveryRate) || null : null,
        confirmNegative: deliveryConfirmNegative,
      })
      if (res.success) {
        setShowDeliveryModal(false)
        setDeliveryConfirmNegative(false)
        if ('warning' in res && typeof res.warning === 'string') toast.warning(res.warning)
        notifyCrmRefresh('topbar')
        router.refresh()
      } else if (res.error === 'CONFIRM_NEGATIVE') {
        setDeliveryConfirmNegative(true)
        setDeliveryError(res.warning ?? 'Баланс каси стане від\'ємним. Підтвердіть ще раз.')
      } else {
        setDeliveryError(res.error ?? 'Помилка')
      }
    })
  }

  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [filterRegisterId, setFilterRegisterId] = useState<number | null>(initialRegisterId)
  const [txPage, setTxPage] = useState(1)
  const [txPerPage, setTxPerPage] = useState(50)
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)

  const [drawerMode, setDrawerMode] = useState<null | 'transaction' | 'transfer'>(null)
  const [editingTx, setEditingTx] = useState<Tx | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Tx | null>(null)

  const [txType, setTxType] = useState<'INCOME' | 'EXPENSE' | 'DEPOSIT' | 'WITHDRAW'>('EXPENSE')
  const [txRegisterId, setTxRegisterId] = useState(String(registers[0]?.id ?? ''))
  const [txAmount, setTxAmount] = useState('')
  const [txCategoryId, setTxCategoryId] = useState(
    String(expenseCategories[0]?.id ?? '')
  )
  const [txVehicleId, setTxVehicleId] = useState(0)
  const [txDescription, setTxDescription] = useState('')
  const [txError, setTxError] = useState('')
  const [txRate, setTxRate] = useState('')
  const [txRateTouched, setTxRateTouched] = useState(false)
  const [txDate, setTxDate] = useState(localTodayIso)
  const [tableSearch, setTableSearch] = useState('')
  const [vehicleMatchedIds, setVehicleMatchedIds] = useState<Set<number> | null>(null)
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null)

  const [tfSourceId, setTfSourceId] = useState(String(registers[0]?.id ?? ''))
  const [tfTargetId, setTfTargetId] = useState(String(registers[1]?.id ?? ''))
  const [tfAmountOut, setTfAmountOut] = useState('')
  const [tfAmountIn, setTfAmountIn] = useState('')
  const [tfNotes, setTfNotes] = useState('')
  const [tfError, setTfError] = useState('')
  const [tfRate, setTfRate] = useState('')
  const [tfRateTouched, setTfRateTouched] = useState(false)
  const [tfAmountInTouched, setTfAmountInTouched] = useState(false)

  const txRegister = registers.find((r) => r.id === Number(txRegisterId))
  const txCurrencyCode = txRegister?.currency.code ?? 'USD'
  const txDefaultRate = defaultRateForRegister(txCurrencyCode, rates)
  const txEffectiveRate = txRateTouched && txRate ? Number(txRate) : txDefaultRate
  const txAmountNum = Number(txAmount) || 0
  const txUsdEquivalent =
    txAmountNum > 0 && txCurrencyCode !== 'USD'
      ? registerAmountToUsd(
          txAmountNum,
          txCurrencyCode,
          rates,
          txRateTouched ? txEffectiveRate : null
        )
      : txAmountNum

  const editBalanceHint = useMemo(() => {
    if (!editingTx) return null
    const newAmount = Number(txAmount) || 0
    if (newAmount <= 0) return null
    const oldAmount = editingTx.amount
    const sameRegister = Number(txRegisterId) === editingTx.cashRegister.id
    const isCredit = editingTx.type === 'INCOME' || editingTx.type === 'DEPOSIT'
    const currency =
      registers.find((r) => r.id === Number(txRegisterId))?.currency.code ?? 'USD'

    if (!sameRegister) {
      return 'Баланс старої каси буде відновлено, нова каса — оновлена сума'
    }
    const delta = isCredit ? newAmount - oldAmount : oldAmount - newAmount
    if (Math.abs(delta) < 0.001) return null
    if (delta > 0) {
      return isCredit
        ? `Каса +${delta.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${currency}`
        : `Повернення в касу +${delta.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${currency}`
    }
    const abs = Math.abs(delta)
    return isCredit
      ? `Списання з каси −${abs.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${currency}`
      : `Додаткове списання −${abs.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${currency}`
  }, [editingTx, txAmount, txRegisterId, registers])

  const sourceReg = registers.find(r => r.id === Number(tfSourceId))
  const targetReg = registers.find(r => r.id === Number(tfTargetId))
  const sameCurrency = sourceReg?.currency.code === targetReg?.currency.code
  const tfDefaultRate =
    sourceReg && targetReg && !sameCurrency
      ? defaultTransferRate(sourceReg.currency.code, targetReg.currency.code, rates)
      : null
  const tfEffectiveRate = tfRateTouched && tfRate ? Number(tfRate) : tfDefaultRate

  const recalcTransferAmountIn = (amountOut: string, rateTouched: boolean, rate: string) => {
    if (!sourceReg || !targetReg || sameCurrency) return amountOut
    const out = Number(amountOut)
    if (!out) return ''
    const custom = rateTouched && rate ? Number(rate) : null
    const amountIn = calcTransferAmountIn(
      out,
      sourceReg.currency.code,
      targetReg.currency.code,
      rates,
      custom
    )
    return amountIn > 0 ? amountIn.toFixed(2) : ''
  }

  const syncRateFromAmounts = (amountOut: string, amountIn: string) => {
    if (!sourceReg || !targetReg || sameCurrency) return
    const rate = calcTransferRateFromAmounts(
      Number(amountOut),
      Number(amountIn),
      sourceReg.currency.code,
      targetReg.currency.code
    )
    if (rate == null || !Number.isFinite(rate) || rate <= 0) return
    setTfRateTouched(true)
    setTfRate(String(Number(rate.toFixed(6))))
  }

  const handleTxRegisterChange = (registerId: string) => {
    setTxRegisterId(registerId)
    setTxRateTouched(false)
    const reg = registers.find((r) => r.id === Number(registerId))
    const code = reg?.currency.code ?? 'USD'
    const def = defaultRateForRegister(code, rates)
    setTxRate(def != null ? String(def) : '')
  }

  const handleAmountOutChange = (val: string) => {
    setTfAmountOut(val)
    if (sameCurrency) {
      setTfAmountIn(val)
      return
    }
    if (tfAmountInTouched) {
      syncRateFromAmounts(val, tfAmountIn)
    } else {
      setTfAmountIn(recalcTransferAmountIn(val, tfRateTouched, tfRate))
    }
  }

  const handleAmountInChange = (val: string) => {
    setTfAmountInTouched(true)
    setTfAmountIn(val)
    if (!sameCurrency && tfAmountOut) {
      syncRateFromAmounts(tfAmountOut, val)
    }
  }

  const handleTransferRegisterChange = (type: 'source' | 'target', id: string) => {
    if (type === 'source') {
      setTfSourceId(id)
      if (id === tfTargetId) setTfTargetId('')
    } else {
      setTfTargetId(id)
    }
    setTfRateTouched(false)
    setTfAmountInTouched(false)
  }

  useEffect(() => {
    if (!txRateTouched && txDefaultRate != null) {
      setTxRate(String(txDefaultRate))
    }
  }, [txCurrencyCode, txDefaultRate, txRateTouched])

  useEffect(() => {
    if (!sameCurrency && tfDefaultRate != null && !tfRateTouched) {
      setTfRate(String(tfDefaultRate))
    }
  }, [sourceReg?.id, targetReg?.id, tfDefaultRate, sameCurrency, tfRateTouched])

  useEffect(() => {
    if (!sameCurrency && tfAmountOut && !tfAmountInTouched) {
      setTfAmountIn(recalcTransferAmountIn(tfAmountOut, tfRateTouched, tfRate))
    }
  }, [tfRate, tfRateTouched, sourceReg?.id, targetReg?.id, sameCurrency])

  const calculatedRate =
    !sameCurrency && tfAmountOut && tfAmountIn
      ? (Number(tfAmountOut) / Number(tfAmountIn)).toFixed(4)
      : null

  const allFilteredTxs = useMemo(() => {
    const source = showDeleted ? deletedTransactions : transactions
    const q = tableSearch.toLowerCase().trim()
    const now = new Date()
    const startOf = (d: Date) => { d.setHours(0, 0, 0, 0); return d }
    let fromDate: Date | null = null
    let toDate: Date | null = null
    if (datePreset === 'today') {
      fromDate = startOf(new Date())
      toDate = new Date()
    } else if (datePreset === 'week') {
      fromDate = startOf(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
      toDate = new Date()
    } else if (datePreset === 'month') {
      fromDate = startOf(new Date(now.getFullYear(), now.getMonth(), 1))
      toDate = new Date()
    } else if (datePreset === 'custom') {
      fromDate = dateFrom ? new Date(dateFrom) : null
      toDate = dateTo ? new Date(dateTo + 'T23:59:59') : null
    }

    return source.filter(t => {
      const displayType = getTxDisplayType(t)
      if (activeTab === 'income' && (t.type !== 'INCOME' || displayType === 'STORNO')) return false
      if (activeTab === 'deposit' && t.type !== 'DEPOSIT') return false
      if (activeTab === 'withdraw' && t.type !== 'WITHDRAW') return false
      if (activeTab === 'expense' && (t.type !== 'EXPENSE' || t.vehicle)) return false
      if (
        activeTab === 'investment' &&
        !(t.type === 'VEHICLE_INVEST' || (t.type === 'EXPENSE' && t.vehicle))
      )
        return false
      if (
        activeTab === 'transfer' &&
        t.type !== 'TRANSFER_IN' &&
        t.type !== 'TRANSFER_OUT'
      )
        return false
      if (displayType === 'STORNO' && (activeTab === 'income' || activeTab === 'investment' || activeTab === 'expense')) {
        return false
      }
      if (filterRegisterId && t.cashRegister.id !== filterRegisterId) return false
      if (fromDate || toDate) {
        const txDate = new Date(t.createdAt)
        if (fromDate && txDate < fromDate) return false
        if (toDate && txDate > toDate) return false
      }
      if (vehicleMatchedIds !== null) {
        if (!t.vehicle || !vehicleMatchedIds.has(t.vehicle.id)) return false
      }
      if (filterCategoryId !== null) {
        if (!t.expenseCategory || t.expenseCategory.id !== filterCategoryId) return false
      }
      if (q) {
        const descStr = (t.description ?? '').toLowerCase()
        const amountStr = String(t.amount)
        const catStr = (t.expenseCategory?.name ?? '').toLowerCase()
        if (!descStr.includes(q) && !amountStr.includes(q) && !catStr.includes(q)) return false
      }
      return true
    })
  }, [transactions, deletedTransactions, showDeleted, activeTab, filterRegisterId, tableSearch, vehicleMatchedIds, filterCategoryId, datePreset, dateFrom, dateTo])

  const filteredTxs = useMemo(() => {
    const start = (txPage - 1) * txPerPage
    return allFilteredTxs.slice(start, start + txPerPage)
  }, [allFilteredTxs, txPage, txPerPage])

  const openTransactionDrawer = () => {
    armOverlayOpen()
    setEditingTx(null)
    setTxError('')
    setTxType('EXPENSE')
    setTxAmount('')
    setTxDescription('')
    setTxVehicleId(0)
    setTxCategoryId(String(expenseCategories[0]?.id ?? ''))
    setTxRegisterId(String(registers[0]?.id ?? ''))
    setTxRateTouched(false)
    setTxDate(localTodayIso())
    const def = defaultRateForRegister(
      registers.find((r) => r.id === Number(registers[0]?.id))?.currency.code ?? 'USD',
      rates
    )
    setTxRate(def != null ? String(def) : '')
    setDrawerMode('transaction')
  }

  const openEditDrawer = (tx: Tx) => {
    if (!tx.isEditable) return
    armOverlayOpen()
    setEditingTx(tx)
    setTxError('')
    setTxType(
      tx.type === 'INCOME' ||
      tx.type === 'EXPENSE' ||
      tx.type === 'DEPOSIT' ||
      tx.type === 'WITHDRAW' ||
      tx.type === 'VEHICLE_INVEST'
        ? (tx.type === 'VEHICLE_INVEST' ? 'EXPENSE' : tx.type)
        : 'EXPENSE'
    )
    setTxAmount(String(tx.amount))
    setTxDescription(tx.description ?? '')
    setTxVehicleId(tx.vehicle ? tx.vehicle.id : 0)
    setTxCategoryId(tx.expenseCategory ? String(tx.expenseCategory.id) : '')
    setTxRegisterId(String(tx.cashRegister.id))
    setTxDate(tx.createdAt ? formatIsoDateInAppTz(tx.createdAt) : localTodayIso())
    const code = tx.cashRegister.currency.code
    if (code === 'UAH' && tx.rateUsdSnapshot) {
      setTxRate(String(tx.rateUsdSnapshot))
      setTxRateTouched(true)
    } else if (code === 'EUR' && tx.rateEurSnapshot) {
      setTxRate(String(Number(tx.rateEurSnapshot).toFixed(2)))
      setTxRateTouched(true)
    } else {
      const def = defaultRateForRegister(code, rates)
      setTxRate(def != null ? String(def) : '')
      setTxRateTouched(false)
    }
    setDrawerMode('transaction')
  }

  const closeTransactionDrawer = () => {
    setDrawerMode(null)
    setEditingTx(null)
  }

  const openTransferDrawer = () => {
    armOverlayOpen()
    setTfError('')
    setTfAmountOut('')
    setTfAmountIn('')
    setTfNotes('')
    setTfRateTouched(false)
    setTfAmountInTouched(false)
    setTfRate('')
    setDrawerMode('transfer')
  }

  const handleSubmitTx = async (e: React.FormEvent) => {
    e.preventDefault()
    setTxError('')
    const amount = Number(txAmount)
    if (!amount || amount <= 0) {
      setTxError('Введіть коректну суму')
      return
    }

    if (txType === 'EXPENSE' || txType === 'WITHDRAW') {
      const ok = await confirmIfNeeded({
        registerName: txRegister?.name ?? 'Каса',
        balance: txRegister?.balance ?? 0,
        amount,
        currencyCode: txRegister?.currency.code ?? 'USD',
      })
      if (!ok) return
    }

    startTransition(async () => {
      const payload = {
        cashRegisterId: Number(txRegisterId),
        amount,
        expenseCategoryId:
          txType === 'EXPENSE' && txCategoryId ? Number(txCategoryId) : null,
        vehicleId:
          txType === 'DEPOSIT' || txType === 'WITHDRAW'
            ? null
            : txVehicleId > 0
              ? txVehicleId
              : null,
        description: txDescription || null,
        customRate: txRateTouched ? Number(txRate) || null : null,
      }

      const res = editingTx
        ? await updateTransaction({ transactionId: editingTx.id, ...payload, transactionDate: txDate || null })
        : await createTransaction({
            ...payload,
            type: txType,
            expenseCategoryId: payload.expenseCategoryId ?? undefined,
            vehicleId: payload.vehicleId ?? undefined,
            description: payload.description ?? undefined,
            transactionDate: txDate || null,
          })

      if (!res.success) {
        setTxError(res.error ?? 'Помилка')
      } else {
        if ('warning' in res && typeof res.warning === 'string') toast.warning(res.warning)
        closeTransactionDrawer()
        notifyCrmRefresh('topbar')
        router.refresh()
      }
    })
  }

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    setTfError('')
    if (!tfTargetId) {
      setTfError('Оберіть касу отримувача')
      return
    }
    const amountOut = Number(tfAmountOut)
    const amountIn = Number(tfAmountIn)
    if (!amountOut || amountOut <= 0 || !amountIn || amountIn <= 0) {
      setTfError('Введіть коректні суми')
      return
    }
    const ok = await confirmIfNeeded({
      registerName: sourceReg?.name ?? 'Каса',
      balance: sourceReg?.balance ?? 0,
      amount: amountOut,
      currencyCode: sourceReg?.currency.code ?? 'USD',
    })
    if (!ok) return

    startTransition(async () => {
      const res = await transferFunds({
        sourceRegisterId: Number(tfSourceId),
        targetRegisterId: Number(tfTargetId),
        amountOut,
        amountIn,
        notes: tfNotes || undefined,
        customRate: tfRateTouched ? Number(tfRate) || null : null,
      })
      if (!res.success) {
        setTfError(res.error ?? 'Помилка')
      } else {
        if ('warning' in res && typeof res.warning === 'string') toast.warning(res.warning)
        setDrawerMode(null)
        notifyCrmRefresh('topbar')
        router.refresh()
      }
    })
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    if (deleteTarget.isDeletable === false || isReversalAuditTx(deleteTarget)) {
      toast.error(
        'Запис «Транзакцію видалено» не можна видалити повторно — відновіть оригінальну транзакцію'
      )
      setDeleteTarget(null)
      return
    }
    startTransition(async () => {
      const res = await deleteTransaction(deleteTarget.id)
      if (res.success) {
        setDeleteTarget(null)
        toast.success('Транзакцію видалено')
        notifyCrmRefresh('topbar')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Помилка видалення')
      }
    })
  }

  const handleRestore = (tx: Tx) => {
    if (tx.isRestorable === false || isReversalAuditTx(tx)) {
      toast.error(
        'Запис повернення в касу не відновлюється — відновіть оригінальну видалену транзакцію'
      )
      return
    }
    startTransition(async () => {
      const res = await restoreTransaction(tx.id)
      if (res.success) {
        toast.success('Транзакцію відновлено')
        notifyCrmRefresh('topbar')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Помилка відновлення')
      }
    })
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'Всі' },
    { key: 'income', label: 'Дохід' },
    { key: 'deposit', label: 'Поповнення' },
    { key: 'withdraw', label: 'Вивід' },
    { key: 'expense', label: 'Витрати' },
    { key: 'investment', label: 'Вложення' },
    { key: 'transfer', label: 'Перекази' },
  ]

  const periodNet12m = periodPnl
    ? periodPnl.totalIncome12m - periodPnl.totalExpenses12m
    : null
  const periodNet1m = periodPnl?.monthlyData.length
    ? periodPnl.monthlyData[periodPnl.monthlyData.length - 1]
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-textPrimary">Фінанси</h1>
        <div className="flex flex-wrap items-center gap-2">
          {canCreate && (
            <button
              onClick={openTransferDrawer}
              className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-md text-sm font-medium text-textSecondary hover:text-textPrimary hover:border-accent/40 transition-all"
            >
              <ArrowLeftRight size={15} />
              Переказ між касами
            </button>
          )}
          {canCreate && (
            <button
              onClick={openTransactionDrawer}
              className="flex items-center gap-2 px-4 py-2.5 bg-accent text-background rounded-md text-sm font-semibold hover:bg-accent/90 transition-all shadow-neon"
            >
              <Plus size={16} />
              Нова транзакція
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {registers.map(reg => (
          <div
            key={reg.id}
            className={`rounded-xl p-4 shadow-elevated-sm dark:shadow-none ${resolveRegisterContainerClass(reg.color ?? null, reg.currency.code)}`}
            style={resolveRegisterContainerStyle(reg.color ?? null)}
          >
            <div className="text-[11px] font-semibold text-textSecondary uppercase tracking-wider mb-1 flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${resolveRegisterDotClass(reg.color ?? null, reg.currency.code)}`}
                style={resolveRegisterDotStyle(reg.color ?? null)}
              />
              {reg.name}
            </div>
            <div className={`text-2xl font-bold font-mono ${reg.balance < 0 ? 'text-red-400' : 'text-textPrimary'}`}>
              {reg.balance.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              <span className="text-sm font-normal text-textSecondary ml-1.5">
                {reg.currency.code}
              </span>
            </div>
          </div>
        ))}

        <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-yellow-50/60 p-4 shadow-elevated-sm dark:border-amber-500/30 dark:bg-none dark:bg-amber-500/[0.08] dark:shadow-none flex flex-col justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold text-amber-700/80 dark:text-amber-400 uppercase tracking-wider mb-1">
              Митний борг
            </div>
            <div className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400">
              ${customsDebt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-textSecondary mt-0.5">
              {customsDebt > 0 ? 'до сплати перед митною' : 'боргу немає'}
            </p>
          </div>
          {canPayCustoms && (
            <button
              onClick={openDebtModal}
              className="w-full border border-amber-500/50 text-amber-700 dark:text-amber-400 py-1.5 rounded-lg text-xs font-semibold hover:bg-amber-500/10 transition-colors"
            >
              Погасити борг
            </button>
          )}
        </div>

        <div className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-blue-50/60 p-4 shadow-elevated-sm dark:border-sky-500/30 dark:bg-none dark:bg-sky-500/[0.08] dark:shadow-none flex flex-col justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold text-sky-700/80 dark:text-sky-400 uppercase tracking-wider mb-1">
              Доставка до оплати
            </div>
            <div className="text-2xl font-bold font-mono text-sky-700 dark:text-sky-400">
              ${deliveryTotalPendingUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-textSecondary mt-0.5">
              {deliveryPending.filter((d) => !d.isFinal).length} авто з неоплаченою доставкою
            </p>
          </div>
          {canCreate && deliveryPending.length > 0 && (
            <button
              onClick={openDeliveryModal}
              className="w-full border border-sky-500/50 text-sky-700 dark:text-sky-400 py-1.5 rounded-lg text-xs font-semibold hover:bg-sky-500/10 transition-colors"
            >
              Оплатити доставку
            </button>
          )}
        </div>

        {registers.length === 0 && (
          <div className="col-span-full rounded-xl bg-surface border border-border p-8 text-center text-textSecondary text-sm shadow-elevated-sm dark:shadow-none">
            Немає доступних кас. Додайте каси у{' '}
            <Link href="/settings" className="text-accent hover:underline">
              Налаштуваннях
            </Link>
            .
          </div>
        )}
      </div>

      {canViewStock && stockCapital && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setShowStockBreakdown(true)}
            className="rounded-xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50 via-white to-teal-50/50 p-4 shadow-elevated-sm dark:border-accent/25 dark:bg-none dark:bg-accent/[0.08] dark:shadow-none text-left hover:scale-[1.01] transition-all"
          >
            <div className="text-[11px] font-semibold text-textSecondary uppercase tracking-wider mb-1">
              Вложено в авто
            </div>
            <div className="text-2xl font-bold font-mono text-cyan-700 dark:text-accent">
              ${stockCapital.stockCapitalUsd.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <p className="text-[11px] text-textSecondary mt-0.5">
              {stockCapital.stockVehicleCount} авто · натисніть для розбивки
            </p>
          </button>
          <div className="rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50 via-white to-sky-50/60 p-4 shadow-elevated-sm dark:border-border dark:bg-none dark:bg-surface dark:shadow-none">
            <div className="text-[11px] font-semibold text-textSecondary uppercase tracking-wider mb-1">
              Сума кас
            </div>
            <div className="text-2xl font-bold font-mono text-blue-700 dark:text-blue-400">
              ${stockCapital.cashTotalUsd.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <p className="text-[11px] text-textSecondary mt-0.5">Усі каси в доларах</p>
          </div>
          <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-green-50/60 p-4 shadow-elevated-sm dark:border-border dark:bg-none dark:bg-surface dark:shadow-none">
            <div className="text-[11px] font-semibold text-textSecondary uppercase tracking-wider mb-1">
              Каси + вложено в авто
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
              ${stockCapital.cashPlusStockUsd.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            {stockCapital.stockCapitalSharePct != null && (
              <p className="text-[11px] text-textSecondary mt-0.5">
                Частка вложеного в авто: {stockCapital.stockCapitalSharePct.toFixed(1)}%
              </p>
            )}
          </div>
        </div>
      )}

      {canViewStock && stockCapitalHistory.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
          <div>
            <div className="text-xs font-medium text-textSecondary uppercase tracking-wider">
              Історія вложеного в авто (30 днів)
            </div>
            <p className="text-[11px] text-textSecondary mt-1">
              Щоденні знімки: вложено в авто, каси, разом
            </p>
          </div>
          {(() => {
            const maxVal = Math.max(
              ...stockCapitalHistory.map((h) => h.cashPlusStockUsd),
              1
            )
            return (
              <div className="flex items-end gap-1 h-24">
                {stockCapitalHistory.map((h) => {
                  const hCash = (h.cashTotalUsd / maxVal) * 100
                  const hStock = (h.stockCapitalUsd / maxVal) * 100
                  return (
                    <div
                      key={h.date}
                      className="flex-1 min-w-0 flex flex-col justify-end gap-px group relative"
                      title={`${h.date}: вложено в авто $${h.stockCapitalUsd.toFixed(0)} · каси $${h.cashTotalUsd.toFixed(0)}`}
                    >
                      <div
                        className="w-full bg-accent/70 rounded-t-sm"
                        style={{ height: `${Math.max(hStock, 1)}%` }}
                      />
                      <div
                        className="w-full bg-textSecondary/30 rounded-b-sm"
                        style={{ height: `${Math.max(hCash, 1)}%` }}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })()}
          <div className="overflow-x-auto max-h-40 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-textSecondary text-left border-b border-border">
                  <th className="py-1.5 pr-3 font-medium">Дата</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Вложено в авто $</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Каси $</th>
                  <th className="py-1.5 font-medium text-right">Разом $</th>
                </tr>
              </thead>
              <tbody>
                {[...stockCapitalHistory].reverse().map((h) => (
                  <tr key={h.date} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 text-textSecondary">{h.date}</td>
                    <td className="py-1.5 pr-3 text-right font-mono text-accent">
                      {h.stockCapitalUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-textPrimary">
                      {h.cashTotalUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-1.5 text-right font-mono text-textPrimary">
                      {h.cashPlusStockUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {periodPnl && periodNet1m && (
        <div
          className={`rounded-xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-elevated-sm dark:shadow-none ${
            periodNet1m.net >= 0
              ? 'border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-green-50/70 dark:from-green-500/5 dark:via-surface dark:to-surface dark:border-green-500/20'
              : 'border-red-200/80 bg-gradient-to-r from-red-50 via-white to-rose-50/70 dark:from-red-500/5 dark:via-surface dark:to-surface dark:border-red-500/20'
          }`}
        >
          <div>
            <div className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-1">
              Чистий результат за {periodNet1m.label}
            </div>
            <div
              className={`text-3xl font-bold font-mono ${
                periodNet1m.net >= 0
                  ? 'text-emerald-700 dark:text-green-400'
                  : 'text-red-700 dark:text-red-400'
              }`}
            >
              {periodNet1m.net >= 0 ? '+' : ''}
              {periodNet1m.net.toLocaleString('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </div>
            <p className="text-[11px] text-textSecondary mt-1">
              Маржа продажів − операційні витрати (вложення в авто не входять)
            </p>
          </div>
          <div className="text-xs text-textSecondary space-y-0.5">
            <div>
              Маржа:{' '}
              <span className="text-emerald-700 dark:text-green-400 font-mono font-semibold">
                +{periodNet1m.income.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div>
              Оп. витрати:{' '}
              <span className="text-red-700 dark:text-red-400 font-mono font-semibold">
                −{periodNet1m.expenses.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
          {periodNet12m != null && (
            <div className="text-xs text-textSecondary space-y-0.5">
              <div>
                За 12 міс. маржа:{' '}
                <span className="text-textPrimary font-mono font-semibold">
                  {periodPnl.totalIncome12m.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div>
                За 12 міс. оп. витрати:{' '}
                <span className="text-textPrimary font-mono font-semibold">
                  {periodPnl.totalExpenses12m.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div>
                За 12 міс. результат:{' '}
                <span
                  className={`font-mono font-semibold ${
                    periodNet12m >= 0
                      ? 'text-emerald-700 dark:text-green-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {periodNet12m >= 0 ? '+' : ''}
                  {periodNet12m.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-surface border border-border rounded-lg">
        {vehicles.length > 0 && (
          <div className="p-4 border-b border-border">
            <VehicleSearchPanel
              vehicles={vehicles}
              statuses={statuses}
              driveTypes={driveTypes}
              transmissions={transmissions}
              variant="compact"
              showArchive={false}
              defaultFilters={{ showArchived: false }}
              onFilteredIdsChange={(ids) => { setVehicleMatchedIds(ids); setTxPage(1) }}
            />
          </div>
        )}
        <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-accent text-background'
                    : 'text-textSecondary hover:text-textPrimary hover:bg-surfaceHover'
                }`}
              >
                {tab.label}
              </button>
            ))}
            {canDelete && deletedTransactions.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowDeleted((v) => !v)
                  setTxPage(1)
                }}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
                  showDeleted
                    ? 'bg-red-500/10 border-red-500/40 text-red-400'
                    : 'border-border text-textSecondary hover:text-textPrimary'
                }`}
              >
                Видалені ({deletedTransactions.length})
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              {(['all', 'today', 'week', 'month', 'custom'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setDatePreset(p); setTxPage(1) }}
                  className={`px-2.5 py-1.5 rounded text-xs transition-colors border ${
                    datePreset === p
                      ? 'bg-accent/10 border-accent text-accent'
                      : 'border-border text-textSecondary hover:text-textPrimary hover:border-accent/30'
                  }`}
                >
                  {{ all: 'Всі', today: 'Сьогодні', week: 'Тиждень', month: 'Місяць', custom: 'Діапазон' }[p]}
                </button>
              ))}
            </div>
            {datePreset === 'custom' && (
              <div className="flex flex-wrap items-center gap-1 w-full sm:w-auto">
                <DateInput
                  value={dateFrom}
                  onChange={v => { setDateFrom(v); setTxPage(1) }}
                  inputClassName="!py-1.5 text-xs"
                  className="w-full sm:w-[140px]"
                />
                <span className="text-textSecondary text-xs">—</span>
                <DateInput
                  value={dateTo}
                  onChange={v => { setDateTo(v); setTxPage(1) }}
                  inputClassName="!py-1.5 text-xs"
                  className="w-full sm:w-[140px]"
                />
              </div>
            )}
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textSecondary pointer-events-none" />
              <input
                type="text"
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                placeholder="Пошук..."
                className="bg-background border border-border text-textPrimary text-xs rounded px-3 py-1.5 pl-8 w-full sm:w-[180px] focus:outline-none focus:border-accent"
              />
            </div>
          <select
            value={filterRegisterId ?? ''}
            onChange={e =>
              setFilterRegisterId(e.target.value ? Number(e.target.value) : null)
            }
            className="w-full sm:w-auto bg-background border border-border text-textPrimary text-xs rounded px-3 py-1.5 focus:outline-none focus:border-accent"
          >
            <option value="">Всі каси</option>
            {registers.map(r => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.currency.code})
              </option>
            ))}
          </select>
          <select
            value={filterCategoryId ?? ''}
            onChange={e => { setFilterCategoryId(e.target.value ? Number(e.target.value) : null); setTxPage(1) }}
            className="w-full sm:w-auto bg-background border border-border text-textPrimary text-xs rounded px-3 py-1.5 focus:outline-none focus:border-accent"
          >
            <option value="">Всі категорії</option>
            {expenseCategories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          </div>
        </div>

        {filterCategoryId !== null && (
          <div className="px-4 pb-3 flex items-center gap-2">
            <span className="text-xs text-textSecondary">Категорія:</span>
            <button
              type="button"
              onClick={() => setFilterCategoryId(null)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent/15 text-accent text-xs font-medium hover:bg-accent/25 transition-colors"
            >
              {expenseCategories.find(c => c.id === filterCategoryId)?.name ?? ''}
              <X size={11} />
            </button>
          </div>
        )}

        {filteredTxs.length === 0 ? (
          <div className="px-6 py-16 text-center text-textSecondary text-sm">
            Транзакцій не знайдено
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-border">
              {filteredTxs.map(tx => {
                const partner = transferPartner(tx)
                const displayType = getTxDisplayType(tx)
                return (
                  <div key={tx.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          TYPE_BADGE[displayType] ?? 'bg-border text-textPrimary'
                        }`}
                      >
                        {TYPE_LABEL[displayType] ?? displayType}
                      </span>
                      <TransactionAmount
                        type={tx.type}
                        displayType={displayType}
                        amount={tx.amount}
                        currencyCode={tx.cashRegister.currency.code}
                        rateUsdSnapshot={tx.rateUsdSnapshot}
                        rateEurSnapshot={tx.rateEurSnapshot}
                        description={tx.description}
                        align="right"
                      />
                    </div>
                    <div className="text-xs text-textSecondary space-y-0.5">
                      <RecordAttribution at={tx.createdAt} user={tx.createdByUser} />
                      <div>{tx.cashRegister.name}</div>
                    </div>
                    {(tx.expenseCategory || tx.vehicle || partner || tx.description) && (
                      <div className="text-xs text-textSecondary space-y-0.5">
                        {tx.expenseCategory && (
                          <button
                            type="button"
                            onClick={() => { setFilterCategoryId(tx.expenseCategory!.id); setTxPage(1) }}
                            className="inline-block px-2 py-0.5 rounded bg-accent/10 text-accent text-[11px] font-medium hover:bg-accent/20 transition-colors"
                          >
                            {tx.expenseCategory.name}
                          </button>
                        )}
                        {tx.vehicle && (
                          <Link
                            href={`/vehicles/${tx.vehicle.id}`}
                            className="block hover:text-accent"
                          >
                            {tx.vehicle.model.make.name} {tx.vehicle.model.name}{' '}
                            <span className="font-mono">
                              ({tx.vehicle.vin.slice(-6)})
                            </span>
                          </Link>
                        )}
                        {partner && <div className="text-blue-400">{partner}</div>}
                        {!partner && tx.description && (
                          <ExpandableText text={tx.description} maxChars={90} className="text-textSecondary" />
                        )}
                        {formatSnapshotRateLine(
                          tx.cashRegister.currency.code,
                          tx.rateUsdSnapshot,
                          tx.rateEurSnapshot
                        ) && (
                          <div className="font-mono text-accent/70">
                            {formatSnapshotRateLine(
                              tx.cashRegister.currency.code,
                              tx.rateUsdSnapshot,
                              tx.rateEurSnapshot
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex justify-end pt-1 gap-1">
                      {showDeleted && canDelete ? (
                        tx.isRestorable !== false && !isReversalAuditTx(tx) ? (
                          <button
                            onClick={() => handleRestore(tx)}
                            disabled={isPending}
                            className="text-xs text-emerald-400 hover:underline px-1"
                          >
                            Відновити
                          </button>
                        ) : (
                          <span className="text-[10px] text-textSecondary/50 px-1">Лише аудит</span>
                        )
                      ) : (
                        <>
                          {canCreate && tx.isEditable && (
                            <button
                              onClick={() => openEditDrawer(tx)}
                              className="text-textSecondary hover:text-accent transition-colors p-1"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {canDelete && tx.isDeletable !== false && !isReversalAuditTx(tx) && (
                            <button
                              onClick={() => setDeleteTarget(tx)}
                              className="text-textSecondary hover:text-red-400 transition-colors p-1"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="overflow-x-auto">
            <table className="hidden md:table w-full min-w-[1050px] table-fixed text-left text-sm text-textSecondary">
              <thead className="text-xs text-textPrimary uppercase border-b border-border bg-surfaceHover">
                <tr>
                  <th className="w-[150px] px-6 py-3 font-medium">Коли / Хто</th>
                  <th className="w-[100px] px-6 py-3 font-medium">Тип</th>
                  <th className="w-[130px] px-6 py-3 font-medium">Каса</th>
                  <th className="w-[150px] px-6 py-3 font-medium">Сума</th>
                  <th className="w-[140px] px-6 py-3 font-medium">Категорія</th>
                  <th className="px-6 py-3 font-medium">Опис / Авто</th>
                  <th className="w-10 px-6 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTxs.map(tx => {
                  const partner = transferPartner(tx)
                  const displayType = getTxDisplayType(tx)
                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-surfaceHover transition-colors group"
                    >
                      <td className="px-6 py-3.5">
                        <RecordAttribution at={tx.createdAt} user={tx.createdByUser} />
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            TYPE_BADGE[displayType] ?? 'bg-border text-textPrimary'
                          }`}
                        >
                          {TYPE_LABEL[displayType] ?? displayType}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-xs">
                        <span className="text-textPrimary">{tx.cashRegister.name}</span>
                        <span className="text-textSecondary ml-1">
                          ({tx.cashRegister.currency.code})
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <TransactionAmount
                          type={tx.type}
                          displayType={displayType}
                          amount={tx.amount}
                          currencyCode={tx.cashRegister.currency.code}
                          rateUsdSnapshot={tx.rateUsdSnapshot}
                          rateEurSnapshot={tx.rateEurSnapshot}
                          description={tx.description}
                        />
                      </td>
                      <td className="px-6 py-3.5 text-xs">
                        {tx.expenseCategory ? (
                          <button
                            type="button"
                            onClick={() => { setFilterCategoryId(tx.expenseCategory!.id); setTxPage(1) }}
                            className="inline-block px-2 py-0.5 rounded bg-accent/10 text-accent text-[11px] font-medium hover:bg-accent/20 transition-colors cursor-pointer max-w-full truncate"
                            title={`Фільтрувати: ${tx.expenseCategory.name}`}
                          >
                            {tx.expenseCategory.name}
                          </button>
                        ) : (
                          <span className="text-textSecondary/30">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-xs overflow-hidden">
                        <div className="space-y-0.5">
                          {tx.vehicle && (
                            <div className="flex items-center gap-1.5">
                              <Link
                                href={`/vehicles/${tx.vehicle.id}`}
                                className="text-textSecondary hover:text-accent transition-colors"
                              >
                                {tx.vehicle.model.make.name} {tx.vehicle.model.name}{' '}
                                <span className="font-mono">
                                  ({tx.vehicle.vin.slice(-6)})
                                </span>
                              </Link>
                              <button
                                type="button"
                                title="Скопіювати VIN"
                                onClick={() => {
                                  navigator.clipboard.writeText(tx.vehicle!.vin)
                                  toast.success('VIN скопійовано')
                                }}
                                className="text-textSecondary hover:text-accent transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Clipboard size={11} />
                              </button>
                            </div>
                          )}
                          {partner && (
                            <div className="text-blue-400">{partner}</div>
                          )}
                          {!partner && tx.description && (
                            <ExpandableText
                              text={tx.description}
                              maxChars={100}
                              className="text-textSecondary"
                            />
                          )}
                          {tx.transfer?.factualExchangeRate && (
                            <div className="text-textSecondary">
                              курс:{' '}
                              <span className="font-mono text-accent/80">
                                {tx.transfer.factualExchangeRate.toFixed(4)}
                              </span>
                            </div>
                          )}
                          {formatSnapshotRateLine(
                            tx.cashRegister.currency.code,
                            tx.rateUsdSnapshot,
                            tx.rateEurSnapshot
                          ) && (
                            <div className="text-textSecondary">
                              {formatSnapshotRateLine(
                                tx.cashRegister.currency.code,
                                tx.rateUsdSnapshot,
                                tx.rateEurSnapshot
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {showDeleted && canDelete ? (
                            tx.isRestorable !== false && !isReversalAuditTx(tx) ? (
                              <button
                                onClick={() => handleRestore(tx)}
                                disabled={isPending}
                                className="text-xs text-emerald-400 hover:underline px-1"
                              >
                                Відновити
                              </button>
                            ) : (
                              <span className="text-[10px] text-textSecondary/50 px-1">Лише аудит</span>
                            )
                          ) : (
                            <>
                              {canCreate && tx.isEditable && (
                                <button
                                  onClick={() => openEditDrawer(tx)}
                                  className="text-textSecondary hover:text-accent p-1"
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              {canDelete && tx.isDeletable !== false && !isReversalAuditTx(tx) && (
                                <button
                                  onClick={() => setDeleteTarget(tx)}
                                  className="text-textSecondary hover:text-red-400 p-1"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
            <div className="px-4 pb-4">
              <Pagination
                total={allFilteredTxs.length}
                page={txPage}
                perPage={txPerPage}
                onPageChange={setTxPage}
                onPerPageChange={(n) => { setTxPerPage(n); setTxPage(1) }}
              />
            </div>
          </>
        )}
      </div>

      {drawerMode === 'transaction' && (
        <>
          <OverlayBackdrop
            onDismiss={closeTransactionDrawer}
            className="fixed inset-0 bg-black/60 z-[300]"
          />
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-surface border-l border-border z-[310] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold text-textPrimary">
                {editingTx ? 'Редагування транзакції' : 'Нова транзакція'}
              </h2>
              <button
                onClick={closeTransactionDrawer}
                className="text-textSecondary hover:text-textPrimary transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form
              onSubmit={handleSubmitTx}
              className="flex-1 overflow-y-auto p-5 space-y-4"
            >
              {!editingTx && (
              <div>
                <label className="text-xs text-textSecondary uppercase tracking-wider mb-2 block">
                  Тип операції
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTxType('DEPOSIT')}
                    className={`py-3 rounded-md text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                      txType === 'DEPOSIT'
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                        : 'bg-background border border-border text-textSecondary hover:border-border/60'
                    }`}
                  >
                    <Wallet size={16} /> Поповнення
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType('WITHDRAW')}
                    className={`py-3 rounded-md text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                      txType === 'WITHDRAW'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : 'bg-background border border-border text-textSecondary hover:border-border/60'
                    }`}
                  >
                    <Wallet size={16} /> Вивід
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType('INCOME')}
                    className={`py-3 rounded-md text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                      txType === 'INCOME'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                        : 'bg-background border border-border text-textSecondary hover:border-border/60'
                    }`}
                  >
                    <TrendingUp size={16} /> Дохід
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType('EXPENSE')}
                    className={`py-3 rounded-md text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                      txType === 'EXPENSE'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                        : 'bg-background border border-border text-textSecondary hover:border-border/60'
                    }`}
                  >
                    <TrendingDown size={16} /> Витрата
                  </button>
                </div>
                {txType === 'DEPOSIT' && (
                  <p className="text-[11px] text-cyan-400/80 mt-2">
                    Поповнення збільшує баланс каси, але не рахується як прибуток.
                  </p>
                )}
                {txType === 'WITHDRAW' && (
                  <p className="text-[11px] text-amber-400/80 mt-2">
                    Вивід зменшує баланс каси, але не рахується як витрата і не впливає на прибуток.
                  </p>
                )}
                {txType === 'INCOME' && (
                  <p className="text-[11px] text-textSecondary mt-2">
                    У чистий результат входить лише маржа продажу авто (ціна − собівартість), не вся сума продажу.
                  </p>
                )}
                {txType === 'EXPENSE' && (
                  <p className="text-[11px] text-textSecondary mt-2">
                    Витрата з привʼязкою до авто рахується як вложення (не операційна витрата).
                  </p>
                )}
              </div>
              )}
              {editingTx && (
                <div className="px-3 py-2 rounded-md bg-background border border-border text-sm">
                  <span className="text-textSecondary">Тип: </span>
                  <span className={
                    getTxDisplayType(editingTx) === 'INVESTMENT' ? 'text-violet-400' :
                    txType === 'INCOME' ? 'text-green-400' :
                    txType === 'DEPOSIT' ? 'text-cyan-400' :
                    txType === 'WITHDRAW' ? 'text-amber-400' : 'text-red-400'
                  }>
                    {TYPE_LABEL[getTxDisplayType(editingTx)] ?? txType}
                  </span>
                </div>
              )}

              <div>
                <label className="text-xs text-textSecondary uppercase tracking-wider mb-1.5 block">
                  Каса
                </label>
                <select
                  value={txRegisterId}
                  onChange={e => handleTxRegisterChange(e.target.value)}
                  className="w-full bg-background border border-border text-textPrimary rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-accent"
                >
                  {registers.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.currency.code}) —{' '}
                      {r.balance.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-textSecondary uppercase tracking-wider mb-1.5 block">
                  Сума
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={txAmount}
                    onChange={e => setTxAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-background border border-border text-textPrimary rounded-md px-3 py-2.5 pr-14 text-sm font-mono focus:outline-none focus:border-accent"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-textSecondary">
                    {registers.find(r => r.id === Number(txRegisterId))?.currency.code}
                  </span>
                </div>
              </div>

              {txCurrencyCode !== 'USD' && (
                <div>
                  <label className="text-xs text-textSecondary uppercase tracking-wider mb-1.5 block">
                    {rateLabelForRegister(txCurrencyCode)}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.0001}
                    value={txRateTouched ? txRate : txDefaultRate != null ? String(txDefaultRate) : ''}
                    onChange={(e) => {
                      setTxRateTouched(true)
                      setTxRate(e.target.value)
                    }}
                    className="w-full bg-background border border-border text-textPrimary rounded-md px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-accent"
                  />
                  <p className="text-[10px] text-textSecondary mt-1">
                    {formatRateHint(txCurrencyCode, rates)}
                  </p>
                </div>
              )}

              {txAmountNum > 0 && txCurrencyCode !== 'USD' && (
                <div className="px-3 py-2 rounded-lg bg-background border border-border text-xs text-textSecondary">
                  Еквівалент:{' '}
                  <span className="font-mono text-accent">
                    ${txUsdEquivalent.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}

              {txType === 'EXPENSE' && (
                <div>
                  <label className="text-xs text-textSecondary uppercase tracking-wider mb-1.5 block">
                    Категорія
                  </label>
                  <select
                    value={txCategoryId}
                    onChange={e => setTxCategoryId(e.target.value)}
                    className="w-full bg-background border border-border text-textPrimary rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">— без категорії —</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {canEditDict && (
                    <InlineAdd
                      placeholder="Назва категорії"
                      onDraftChange={() => {}}
                      onCommit={handleAddCategory}
                    />
                  )}
                </div>
              )}

              {txType !== 'DEPOSIT' && txType !== 'WITHDRAW' && (
                <div>
                  <label className="text-xs text-textSecondary uppercase tracking-wider mb-1.5 block">
                    Авто (необов&apos;язково)
                  </label>
                  <VehicleSearchCombobox
                    vehicles={vehicles.map((v): VehicleSearchOption => ({
                      id: v.id,
                      label: v.label,
                      vin: v.vin,
                      makeName: v.makeName,
                      modelName: v.modelName,
                      year: v.year ?? 0,
                      mileage: v.mileage ?? null,
                      statusName: v.statusName,
                      notes: v.notes ?? null,
                      imageUrl: v.imageUrl ?? undefined,
                    }))}
                    value={txVehicleId}
                    onChange={(v) => setTxVehicleId(v)}
                    allowEmpty
                    showThumbnail
                    placeholder="— не прив'язано —"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-textSecondary uppercase tracking-wider mb-1.5 block">
                  Коментар
                </label>
                <input
                  type="text"
                  value={txDescription}
                  onChange={e => setTxDescription(e.target.value)}
                  placeholder={
                    txType === 'DEPOSIT'
                      ? 'Поповнення каси'
                      : txType === 'WITHDRAW'
                        ? 'Вивід з каси'
                        : "Необов'язково..."
                  }
                  className="w-full bg-background border border-border text-textPrimary rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-accent"
                />
              </div>

              {!editingTx && (
                <div>
                  <label className="text-xs text-textSecondary uppercase tracking-wider mb-1.5 block">
                    Дата
                  </label>
                  <DateInput
                    value={txDate}
                    onChange={setTxDate}
                    max={localTodayIso()}
                  />
                </div>
              )}

              {editBalanceHint && (
                <div className="px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400/90">
                  {editBalanceHint}
                </div>
              )}

              {txError && <p className="text-red-400 text-sm">{txError}</p>}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isPending}
                  className={`w-full py-3 rounded-md text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
                    txType === 'INCOME'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/40 hover:bg-green-500/30'
                      : txType === 'DEPOSIT'
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-500/30'
                      : txType === 'WITHDRAW'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                  }`}
                >
                  {isPending
                    ? 'Збереження...'
                    : editingTx
                    ? 'Зберегти зміни'
                    : txType === 'INCOME'
                    ? '+ Додати дохід'
                    : txType === 'DEPOSIT'
                    ? '+ Поповнити касу'
                    : txType === 'WITHDRAW'
                    ? '− Вивести з каси'
                    : '− Додати витрату'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {drawerMode === 'transfer' && (
        <>
          <OverlayBackdrop
            onDismiss={() => setDrawerMode(null)}
            className="fixed inset-0 bg-black/60 z-[300]"
          />
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-surface border-l border-border z-[310] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold text-textPrimary">
                Переказ між касами
              </h2>
              <button
                onClick={() => setDrawerMode(null)}
                className="text-textSecondary hover:text-textPrimary transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form
              onSubmit={handleSubmitTransfer}
              className="flex-1 overflow-y-auto p-5 space-y-4"
            >
              <div>
                <label className="text-xs text-textSecondary uppercase tracking-wider mb-1.5 block">
                  Списати з каси
                </label>
                <select
                  value={tfSourceId}
                  onChange={e => handleTransferRegisterChange('source', e.target.value)}
                  className="w-full bg-background border border-border text-textPrimary rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-accent"
                >
                  {registers.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.currency.code}) —{' '}
                      {r.balance.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-textSecondary uppercase tracking-wider mb-1.5 block">
                  Зарахувати на касу
                </label>
                <select
                  value={tfTargetId}
                  onChange={e => handleTransferRegisterChange('target', e.target.value)}
                  className="w-full bg-background border border-border text-textPrimary rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-accent"
                >
                  <option value="">— оберіть касу —</option>
                  {registers
                    .filter(r => r.id !== Number(tfSourceId))
                    .map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.currency.code})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-textSecondary uppercase tracking-wider mb-1.5 block">
                    Списати ({sourceReg?.currency.code})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={tfAmountOut}
                    onChange={e => handleAmountOutChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-background border border-border text-textPrimary rounded-md px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-accent"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-textSecondary uppercase tracking-wider mb-1.5 block">
                    Зарахувати ({targetReg?.currency.code ?? '—'})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={tfAmountIn}
                    onChange={e => handleAmountInChange(e.target.value)}
                    placeholder="0.00"
                    readOnly={sameCurrency}
                    className={`w-full bg-background border border-border text-textPrimary rounded-md px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-accent ${
                      sameCurrency ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    required
                  />
                </div>
              </div>

              {!sameCurrency && sourceReg && targetReg && (
                <div>
                  <label className="text-xs text-textSecondary uppercase tracking-wider mb-1.5 block">
                    {transferRateLabel(sourceReg.currency.code, targetReg.currency.code)}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.0001}
                    value={tfRateTouched ? tfRate : tfDefaultRate != null ? String(tfDefaultRate) : ''}
                    onChange={(e) => {
                      setTfRateTouched(true)
                      setTfRate(e.target.value)
                      setTfAmountInTouched(false)
                      if (tfAmountOut) {
                        setTfAmountIn(
                          recalcTransferAmountIn(tfAmountOut, true, e.target.value)
                        )
                      }
                    }}
                    className="w-full bg-background border border-border text-textPrimary rounded-md px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-accent"
                  />
                  <p className="text-[10px] text-textSecondary mt-1">
                    {formatTransferRateHint(sourceReg.currency.code, targetReg.currency.code, rates)}
                  </p>
                </div>
              )}

              {!sameCurrency && calculatedRate && (
                <div className="bg-accent/5 border border-accent/20 rounded-md px-4 py-3">
                  <div className="text-xs text-textSecondary mb-0.5">
                    Фактичний курс операції
                  </div>
                  <div className="text-sm font-mono text-accent">
                    1 {targetReg?.currency.code} = {calculatedRate}{' '}
                    {sourceReg?.currency.code}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-textSecondary uppercase tracking-wider mb-1.5 block">
                  Примітка
                </label>
                <input
                  type="text"
                  value={tfNotes}
                  onChange={e => setTfNotes(e.target.value)}
                  placeholder="Необов'язково..."
                  className="w-full bg-background border border-border text-textPrimary rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-accent"
                />
              </div>

              {tfError && <p className="text-red-400 text-sm">{tfError}</p>}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isPending || !tfTargetId}
                  className="w-full py-3 rounded-md text-sm font-semibold bg-accent text-background hover:bg-accent/90 transition-all shadow-neon disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <ArrowLeftRight size={15} />
                  {isPending ? 'Обробка...' : 'Виконати переказ'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {deleteTarget && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-border rounded-lg p-6 w-full max-w-md space-y-4">
              <div className="flex items-start justify-between">
                <h3 className="text-lg font-semibold text-textPrimary">
                  Видалити транзакцію?
                </h3>
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="text-textSecondary hover:text-textPrimary"
                >
                  <X size={18} />
                </button>
              </div>

              {deleteTarget.transferId && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md p-3 text-xs text-yellow-400">
                  Ця транзакція є частиною переказу. Буде видалено обидві сторони
                  переказу, баланси кас буде скориговано.
                </div>
              )}

              <div className="bg-background border border-border rounded-md p-3 text-sm space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-textSecondary">Тип:</span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded ${
                      TYPE_BADGE[getTxDisplayType(deleteTarget)] ?? 'bg-border text-textPrimary'
                    }`}
                  >
                    {TYPE_LABEL[getTxDisplayType(deleteTarget)] ?? deleteTarget.type}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-textSecondary">Сума:</span>
                  <TransactionAmount
                    type={deleteTarget.type}
                    displayType={getTxDisplayType(deleteTarget)}
                    amount={deleteTarget.amount}
                    currencyCode={deleteTarget.cashRegister.currency.code}
                    rateUsdSnapshot={deleteTarget.rateUsdSnapshot}
                    rateEurSnapshot={deleteTarget.rateEurSnapshot}
                    description={deleteTarget.description}
                    align="right"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-textSecondary">Каса:</span>
                  <span className="text-textPrimary">{deleteTarget.cashRegister.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-textSecondary">Дата:</span>
                  <span className="text-textPrimary text-xs">
                    {formatDate(deleteTarget.createdAt)}
                  </span>
                </div>
                {deleteTarget.description && (
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-textSecondary shrink-0">Опис:</span>
                    <span className="text-textPrimary text-xs text-right">
                      {deleteTarget.description}
                    </span>
                  </div>
                )}
              </div>

              <p className="text-xs text-textSecondary">
                Баланс каси буде скориговано. Цю дію неможливо скасувати.
              </p>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 border border-border rounded-md text-sm text-textSecondary hover:text-textPrimary hover:border-border/60 transition-colors"
                >
                  Скасувати
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="px-4 py-2 bg-red-500/20 border border-red-500/40 text-red-400 rounded-md text-sm font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50"
                >
                  {isPending ? 'Видалення...' : 'Видалити'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showDebtModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <OverlayBackdrop
            onDismiss={() => setShowDebtModal(false)}
            className="absolute inset-0 bg-black/70"
          />
          <div className="relative bg-surface border border-amber-500/30 rounded-xl w-full max-w-lg shadow-elevated max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h3 className="font-semibold text-amber-400">Погашення митного боргу</h3>
              <button onClick={() => setShowDebtModal(false)} className="text-textSecondary hover:text-textPrimary">✕</button>
            </div>
            <form onSubmit={handlePayDebt} className="p-5 space-y-4 overflow-y-auto">
              <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-textSecondary">
                <p>Поточний борг: <strong className="text-amber-400">${customsDebt.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong></p>
                <p className="mt-1">Окремий витрата по кожному авто з категорією мита.</p>
              </div>

              <div>
                <label className="block text-xs text-textSecondary mb-1.5">Каса списання</label>
                <select
                  value={debtRegisterId}
                  onChange={(e) => handleDebtRegisterChange(e.target.value)}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent"
                >
                  {registers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} — {r.balance.toLocaleString()} {r.currency.code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-textSecondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={debtShowArchived}
                    onChange={(e) => {
                      setDebtShowArchived(e.target.checked)
                      setDebtPage(1)
                    }}
                    className="rounded border-border"
                  />
                  Показати продані (архів)
                </label>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const next: Record<number, number> = {}
                      for (const d of filteredDebtors) next[d.vehicleId] = d.balanceUsd
                      setDebtSelected(next)
                      setDebtConfirmNegative(false)
                      setDebtTotalInput(
                        Object.values(next).reduce((s, n) => s + n, 0).toFixed(2)
                      )
                    }}
                    className="text-[11px] text-accent hover:underline"
                  >
                    Вибрати всі
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDebtSelected({})
                      setDebtConfirmNegative(false)
                      setDebtTotalInput('')
                    }}
                    className="text-[11px] text-textSecondary hover:text-textPrimary hover:underline"
                  >
                    Скасувати всі
                  </button>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textSecondary pointer-events-none" />
                <input
                  type="text"
                  value={debtSearch}
                  onChange={(e) => {
                    setDebtSearch(e.target.value)
                    setDebtPage(1)
                  }}
                  placeholder="Пошук авто..."
                  className="w-full bg-background border border-border text-textPrimary text-xs rounded px-3 py-2 pl-8 focus:outline-none focus:border-accent"
                />
              </div>

              <div className="space-y-2 border border-border rounded-lg p-2">
                {filteredDebtors.length === 0 ? (
                  <p className="text-xs text-textSecondary p-2">Немає авто з митним боргом</p>
                ) : (
                  pagedDebtors.map((d) => {
                    const checked = debtSelected[d.vehicleId] != null
                    const isPartial = d.paidUsd > 0.005
                    return (
                      <div
                        key={d.vehicleId}
                        className={`flex items-center gap-2 px-2 py-2 rounded-md ${checked ? 'bg-amber-500/5' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setDebtSelected((prev) => {
                              const next = { ...prev }
                              if (e.target.checked) next[d.vehicleId] = d.balanceUsd
                              else delete next[d.vehicleId]
                              setDebtConfirmNegative(false)
                              setDebtTotalInput(
                                Object.values(next).reduce((s, n) => s + n, 0).toFixed(2)
                              )
                              return next
                            })
                          }}
                          className="rounded border-border shrink-0"
                        />
                        <VehiclePickThumb imageUrl={d.imageUrl} alt={d.label} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/vehicles/${d.vehicleId}`}
                              className="text-sm text-textPrimary truncate hover:text-accent"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {d.label}
                            </Link>
                            {isPartial && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded border border-orange-500/30 text-orange-400 shrink-0">
                                Частково
                              </span>
                            )}
                            {d.isFinal && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                                Продано
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-textSecondary">
                            залишок ${d.balanceUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                            {isPartial && (
                              <> · сплачено ${d.paidUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</>
                            )}
                          </p>
                        </div>
                        {checked && (
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            max={d.balanceUsd}
                            value={debtSelected[d.vehicleId] ?? ''}
                            onChange={(e) => {
                              const val = Math.min(d.balanceUsd, Math.max(0, Number(e.target.value) || 0))
                              setDebtSelected((prev) => {
                                const next = { ...prev, [d.vehicleId]: val }
                                setDebtTotalInput(
                                  Object.values(next).reduce((s, n) => s + n, 0).toFixed(2)
                                )
                                return next
                              })
                            }}
                            className="w-24 bg-background border border-border rounded px-2 py-1 text-xs font-mono text-textPrimary focus:outline-none focus:border-accent shrink-0"
                          />
                        )}
                      </div>
                    )
                  })
                )}
                {filteredDebtors.length > 0 && (
                  <PickListPagination
                    total={filteredDebtors.length}
                    page={debtPage}
                    perPage={debtPerPage}
                    onPageChange={setDebtPage}
                    onPerPageChange={setDebtPerPage}
                  />
                )}
              </div>

              {visibleDebtors.length > 0 && (
                <div>
                  <label className="block text-xs text-textSecondary mb-1.5">Додати авто зі списку боржників</label>
                  <VehicleSearchCombobox
                    vehicles={visibleDebtors.map((d) => ({
                      id: d.vehicleId,
                      vin: `ID-${d.vehicleId}`,
                      label: d.label,
                      makeName: d.label.split(' ')[0] ?? '',
                      modelName: d.label.split(' ').slice(1).join(' ') || d.label,
                      year: 0,
                      mileage: null,
                      statusName: d.isFinal ? 'Продано' : 'В боргу',
                      notes: `залишок $${d.balanceUsd.toFixed(2)}`,
                      imageUrl: d.imageUrl ?? undefined,
                    }))}
                    value={debtAddVehicleId}
                    onChange={(id) => {
                      setDebtAddVehicleId(id)
                      if (!id) return
                      const d = customsDebtors.find((x) => x.vehicleId === id)
                      if (!d) return
                      setDebtSelected((prev) => {
                        const next = { ...prev, [d.vehicleId]: d.balanceUsd }
                        setDebtTotalInput(
                          Object.values(next).reduce((s, n) => s + n, 0).toFixed(2)
                        )
                        return next
                      })
                      setDebtAddVehicleId(0)
                    }}
                    allowEmpty
                    placeholder="Пошук боржника..."
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-textSecondary mb-1.5">Загальна сума (USD)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={debtTotalInput}
                  onChange={(e) => {
                    setDebtTotalInput(e.target.value)
                    applyFifoTotal(Number(e.target.value) || 0)
                  }}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent font-mono"
                />
                <p className="text-[10px] text-textSecondary mt-1">
                  Зменшення суми перерозподіляє FIFO по обраних авто
                </p>
              </div>

              {debtCurrencyCode !== 'USD' && (
                <div>
                  <label className="block text-xs text-textSecondary mb-1.5">
                    {rateLabelForRegister(debtCurrencyCode)}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.0001}
                    value={debtRateTouched ? debtRate : debtDefaultRate != null ? String(debtDefaultRate) : ''}
                    onChange={(e) => {
                      setDebtRateTouched(true)
                      setDebtRate(e.target.value)
                    }}
                    className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent font-mono"
                  />
                  <p className="text-[10px] text-textSecondary mt-1">
                    {formatRateHint(debtCurrencyCode, rates)}
                  </p>
                </div>
              )}

              {debtUsdNum > 0 && debtRegister && (
                <div className="p-3 rounded-lg bg-background border border-border text-xs space-y-1.5">
                  <p className="text-textSecondary font-medium">Превʼю</p>
                  {debtAllocationItems.map((item) => {
                    const d = customsDebtors.find((x) => x.vehicleId === item.vehicleId)
                    return (
                      <div key={item.vehicleId} className="flex justify-between gap-2 text-textSecondary">
                        <span className="truncate">{d?.label ?? `#${item.vehicleId}`}</span>
                        <span className="font-mono text-amber-400 shrink-0">
                          ${item.amountUsd.toFixed(2)}
                        </span>
                      </div>
                    )
                  })}
                  <div className="pt-1.5 border-t border-border flex justify-between">
                    <span className="text-textSecondary">З каси спишеться</span>
                    <strong className="text-textPrimary font-mono">
                      {debtRegisterDeduction.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      {debtCurrencyCode}
                    </strong>
                  </div>
                </div>
              )}

              {debtError && <p className="text-xs text-red-400">{debtError}</p>}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isPending || debtAllocationItems.length === 0}
                  className="flex-1 bg-amber-500/10 border border-amber-500 text-amber-400 py-2 rounded-md text-sm font-medium hover:bg-amber-500 hover:text-white transition-all disabled:opacity-40"
                >
                  {isPending
                    ? '...'
                    : debtConfirmNegative
                      ? 'Підтвердити відʼємний баланс'
                      : 'Погасити'}
                </button>
                <button type="button" onClick={() => setShowDebtModal(false)} className="px-4 py-2 border border-border text-textSecondary rounded-md text-sm hover:text-textPrimary">
                  Скасувати
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeliveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <OverlayBackdrop
            onDismiss={() => setShowDeliveryModal(false)}
            className="absolute inset-0 bg-black/70"
          />
          <div className="relative bg-surface border border-sky-500/30 rounded-xl w-full max-w-lg shadow-elevated max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h3 className="font-semibold text-sky-400">Оплата доставки</h3>
              <button onClick={() => setShowDeliveryModal(false)} className="text-textSecondary hover:text-textPrimary">✕</button>
            </div>
            <form onSubmit={handlePayDelivery} className="p-5 space-y-4 overflow-y-auto">
              <div className="p-3 rounded-lg bg-sky-500/5 border border-sky-500/20 text-xs text-textSecondary">
                <p>
                  До оплати:{' '}
                  <strong className="text-sky-400">
                    ${deliveryTotalPendingUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </strong>
                </p>
                <p className="mt-1">Повна сума доставки по кожному авто (без часткової оплати).</p>
              </div>

              <div>
                <label className="block text-xs text-textSecondary mb-1.5">Каса списання</label>
                <select
                  value={deliveryRegisterId}
                  onChange={(e) => handleDeliveryRegisterChange(e.target.value)}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent"
                >
                  {registers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} — {r.balance.toLocaleString()} {r.currency.code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-textSecondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deliveryShowArchived}
                    onChange={(e) => {
                      setDeliveryShowArchived(e.target.checked)
                      setDeliveryPage(1)
                    }}
                    className="rounded border-border"
                  />
                  Показати продані (архів)
                </label>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setDeliverySelectedIds(filteredDeliveryPending.map((d) => d.vehicleId))
                      setDeliveryConfirmNegative(false)
                    }}
                    className="text-[11px] text-accent hover:underline"
                  >
                    Вибрати всі
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeliverySelectedIds([])
                      setDeliveryConfirmNegative(false)
                    }}
                    className="text-[11px] text-textSecondary hover:text-textPrimary hover:underline"
                  >
                    Скасувати всі
                  </button>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textSecondary pointer-events-none" />
                <input
                  type="text"
                  value={deliverySearch}
                  onChange={(e) => {
                    setDeliverySearch(e.target.value)
                    setDeliveryPage(1)
                  }}
                  placeholder="Пошук авто..."
                  className="w-full bg-background border border-border text-textPrimary text-xs rounded px-3 py-2 pl-8 focus:outline-none focus:border-accent"
                />
              </div>

              <div className="space-y-2 border border-border rounded-lg p-2">
                {filteredDeliveryPending.length === 0 ? (
                  <p className="text-xs text-textSecondary p-2">Немає авто з неоплаченою доставкою</p>
                ) : (
                  pagedDeliveryPending.map((d) => {
                    const checked = deliverySelectedIds.includes(d.vehicleId)
                    return (
                      <div
                        key={d.vehicleId}
                        className={`flex items-center gap-2 px-2 py-2 rounded-md ${checked ? 'bg-sky-500/5' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setDeliveryConfirmNegative(false)
                            setDeliverySelectedIds((prev) =>
                              e.target.checked
                                ? [...prev, d.vehicleId]
                                : prev.filter((id) => id !== d.vehicleId)
                            )
                          }}
                          className="rounded border-border shrink-0"
                        />
                        <VehiclePickThumb imageUrl={d.imageUrl} alt={d.label} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/vehicles/${d.vehicleId}`}
                              className="text-sm text-textPrimary truncate hover:text-accent"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {d.label}
                            </Link>
                            {d.isFinal && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                                Продано
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-textSecondary">
                            доставка ${d.deliveryCostUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        {checked && (
                          <span className="w-24 text-right text-xs font-mono text-sky-400 shrink-0">
                            ${d.deliveryCostUsd.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )
                  })
                )}
                {filteredDeliveryPending.length > 0 && (
                  <PickListPagination
                    total={filteredDeliveryPending.length}
                    page={deliveryPage}
                    perPage={deliveryPerPage}
                    onPageChange={setDeliveryPage}
                    onPerPageChange={setDeliveryPerPage}
                  />
                )}
              </div>

              {deliveryCurrencyCode !== 'USD' && (
                <div>
                  <label className="block text-xs text-textSecondary mb-1.5">
                    {rateLabelForRegister(deliveryCurrencyCode)}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.0001}
                    value={
                      deliveryRateTouched
                        ? deliveryRate
                        : deliveryDefaultRate != null
                          ? String(deliveryDefaultRate)
                          : ''
                    }
                    onChange={(e) => {
                      setDeliveryRateTouched(true)
                      setDeliveryRate(e.target.value)
                    }}
                    className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent font-mono"
                  />
                  <p className="text-[10px] text-textSecondary mt-1">
                    {formatRateHint(deliveryCurrencyCode, rates)}
                  </p>
                </div>
              )}

              {deliveryUsdNum > 0 && deliveryRegister && (
                <div className="p-3 rounded-lg bg-background border border-border text-xs space-y-1.5">
                  <p className="text-textSecondary font-medium">Превʼю</p>
                  {deliverySelectedItems.map((item) => (
                    <div key={item.vehicleId} className="flex justify-between gap-2 text-textSecondary">
                      <span className="truncate">{item.label}</span>
                      <span className="font-mono text-sky-400 shrink-0">
                        ${item.deliveryCostUsd.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  <div className="pt-1.5 border-t border-border flex justify-between">
                    <span className="text-textSecondary">З каси спишеться</span>
                    <strong className="text-textPrimary font-mono">
                      {deliveryRegisterDeduction.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      {deliveryCurrencyCode}
                    </strong>
                  </div>
                </div>
              )}

              {deliveryError && <p className="text-xs text-red-400">{deliveryError}</p>}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isPending || deliverySelectedItems.length === 0}
                  className="flex-1 bg-sky-500/10 border border-sky-500 text-sky-400 py-2 rounded-md text-sm font-medium hover:bg-sky-500 hover:text-white transition-all disabled:opacity-40"
                >
                  {isPending
                    ? '...'
                    : deliveryConfirmNegative
                      ? 'Підтвердити відʼємний баланс'
                      : 'Оплатити доставку'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeliveryModal(false)}
                  className="px-4 py-2 border border-border text-textSecondary rounded-md text-sm hover:text-textPrimary"
                >
                  Скасувати
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showStockBreakdown && stockCapital && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <OverlayBackdrop
            onDismiss={() => setShowStockBreakdown(false)}
            className="absolute inset-0 bg-black/70"
          />
          <div className="relative bg-surface border border-accent/30 rounded-xl w-full max-w-md shadow-elevated max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <h3 className="font-semibold text-accent">Вложено в авто</h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  {stockCapital.stockVehicleCount} авто · $
                  {stockCapital.stockCapitalUsd.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStockBreakdown(false)}
                className="text-textSecondary hover:text-textPrimary"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-3 space-y-1">
              {stockCapital.breakdown.length === 0 ? (
                <p className="text-sm text-textSecondary p-3">Немає вложеного в авто</p>
              ) : (
                stockCapital.breakdown.map((item) => (
                  <Link
                    key={item.vehicleId}
                    href={`/vehicles/${item.vehicleId}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-surfaceHover transition-colors"
                    onClick={() => setShowStockBreakdown(false)}
                  >
                    <span className="text-sm text-textPrimary truncate">{item.label}</span>
                    <span className="font-mono text-sm text-accent shrink-0">
                      ${item.investedUsd.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
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
    </div>
  )
}
