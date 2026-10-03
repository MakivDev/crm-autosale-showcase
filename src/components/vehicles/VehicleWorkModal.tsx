'use client'

import { useState, useTransition, useEffect } from 'react'
import { X, Wrench, DollarSign } from 'lucide-react'
import OverlayBackdrop from '@/components/shared/OverlayBackdrop'
import InlineAdd from '@/components/shared/InlineAdd'
import DateInput from '@/components/shared/DateInput'
import StoRecordForm, { type StoRecordFormData } from '@/components/sto/StoRecordForm'
import NegativeBalanceConfirmModal, { usePendingOverdraftConfirm } from '@/components/shared/NegativeBalanceConfirmModal'
import { createStoRecord } from '@/actions/sto'
import { createTransaction } from '@/actions/finance'
import { addDictionaryItem } from '@/actions/dictionaries'
import { toast } from 'sonner'
import { notifyCrmRefresh } from '@/lib/crm-refresh'
import { localTodayIso } from '@/lib/format-datetime'
import {
  defaultRateForRegister,
  rateLabelForRegister,
  registerAmountToUsd,
  formatRateHint,
  type MonthRates,
  type CashRegisterOption,
} from '@/lib/currency'

const inputCls =
  'w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-textPrimary focus:outline-none focus:border-accent transition-colors'

type Tab = 'expense' | 'sto'

type Props = {
  vehicleId: number
  repairTypes: { id: number; name: string }[]
  registers: CashRegisterOption[]
  categories: { id: number; name: string }[]
  rates: MonthRates
  userDefaultRegisterId?: number | null
  canEditDict?: boolean
  onClose: () => void
  onSaved: () => void
}

export default function VehicleWorkModal({
  vehicleId,
  repairTypes,
  registers,
  categories: initialCategories,
  rates,
  userDefaultRegisterId,
  canEditDict,
  onClose,
  onSaved,
}: Props) {
  const [tab, setTab] = useState<Tab>('sto')
  const [isPending, startTransition] = useTransition()
  const { pending, confirmIfNeeded, handleConfirm, handleCancel } = usePendingOverdraftConfirm()

  const handleStoSave = async (data: StoRecordFormData) => {
    const reg = registers.find((r) => r.id === data.cashRegisterId)
    const ok = await confirmIfNeeded({
      registerName: reg?.name ?? 'Каса',
      balance: reg?.balance ?? 0,
      amount: data.amount,
      currencyCode: reg?.currencyCode ?? 'UAH',
    })
    if (!ok) return

    startTransition(async () => {
      const res = await createStoRecord({
        vehicleId,
        repairTypeId: data.repairTypeId,
        cashRegisterId: data.cashRegisterId,
        amount: data.amount,
        customRate: data.customRate,
        comment: data.comment || null,
      })
      if (res.success) {
        toast.success('Роботу додано')
        notifyCrmRefresh()
        onSaved()
        onClose()
      } else {
        toast.error(res.error ?? 'Помилка')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <OverlayBackdrop onDismiss={onClose} className="absolute inset-0 bg-black/70" />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-md shadow-elevated max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface z-10">
          <h3 className="font-semibold text-textPrimary">+ Робота</h3>
          <button type="button" onClick={onClose} className="text-textSecondary hover:text-textPrimary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-border">
          <button
            type="button"
            onClick={() => setTab('sto')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              tab === 'sto' ? 'text-accent border-b-2 border-accent' : 'text-textSecondary hover:text-textPrimary'
            }`}
          >
            <Wrench className="w-4 h-4" /> СТО
          </button>
          <button
            type="button"
            onClick={() => setTab('expense')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              tab === 'expense' ? 'text-accent border-b-2 border-accent' : 'text-textSecondary hover:text-textPrimary'
            }`}
          >
            <DollarSign className="w-4 h-4" /> Швидка витрата
          </button>
        </div>

        <div className="p-5">
          {tab === 'sto' ? (
            <StoRecordForm
              repairTypes={repairTypes}
              registers={registers}
              rates={rates}
              userDefaultRegisterId={userDefaultRegisterId}
              onSave={handleStoSave}
              isPending={isPending}
              compact
            />
          ) : (
            <QuickExpenseTab
              vehicleId={vehicleId}
              registers={registers}
              categories={initialCategories}
              rates={rates}
              userDefaultRegisterId={userDefaultRegisterId}
              canEditDict={canEditDict}
              confirmIfNeeded={confirmIfNeeded}
              onSaved={() => { notifyCrmRefresh(); onSaved(); onClose() }}
            />
          )}
        </div>
      </div>
      {pending && (
        <NegativeBalanceConfirmModal
          open
          registerName={pending.registerName}
          balance={pending.balance}
          amount={pending.amount}
          currencyCode={pending.currencyCode}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}

function QuickExpenseTab({
  vehicleId,
  registers,
  categories: initialCategories,
  rates,
  userDefaultRegisterId,
  canEditDict,
  confirmIfNeeded,
  onSaved,
}: {
  vehicleId: number
  registers: CashRegisterOption[]
  categories: { id: number; name: string }[]
  rates: MonthRates
  userDefaultRegisterId?: number | null
  canEditDict?: boolean
  confirmIfNeeded: ReturnType<typeof usePendingOverdraftConfirm>['confirmIfNeeded']
  onSaved: () => void
}) {
  const defaultReg =
    userDefaultRegisterId && registers.some((r) => r.id === userDefaultRegisterId)
      ? userDefaultRegisterId
      : registers.find((r) => r.currencyCode === 'UAH')?.id ?? registers[0]?.id ?? 0
  const [categories, setCategories] = useState(initialCategories)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState(initialCategories[0] ? String(initialCategories[0].id) : '')
  const [registerId, setRegisterId] = useState(defaultReg)
  const [transactionDate, setTransactionDate] = useState(localTodayIso)
  const [rate, setRate] = useState('')
  const [rateTouched, setRateTouched] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => { setCategories(initialCategories) }, [initialCategories])

  const selectedRegister = registers.find((r) => r.id === registerId)
  const currencyCode = selectedRegister?.currencyCode ?? 'USD'
  const defaultRate = defaultRateForRegister(currencyCode, rates)
  const numAmount = Number(amount) || 0
  const amountUsd = registerAmountToUsd(
    numAmount,
    currencyCode,
    rates,
    rateTouched ? Number(rate) || null : null
  )

  useEffect(() => {
    if (!rateTouched && defaultRate != null) {
      setRate(String(defaultRate))
    }
  }, [currencyCode, defaultRate, rateTouched])

  const handleRegisterChange = (id: number) => {
    setRegisterId(id)
    setRateTouched(false)
    const reg = registers.find((r) => r.id === id)
    const def = defaultRateForRegister(reg?.currencyCode ?? 'USD', rates)
    setRate(def != null ? String(def) : '')
  }

  const handleAddCategory = (name: string) => {
    if (!canEditDict) return
    startTransition(async () => {
      const res = await addDictionaryItem('expenseCategory', { name, position: categories.length + 1 })
      if (res.success && res.data) {
        setCategories((prev) => [...prev, { id: res.data!.id, name: res.data!.name }])
        setCategoryId(String(res.data!.id))
        toast.success('Категорію додано')
      }
    })
  }

  const handleSave = async () => {
    if (!numAmount || numAmount <= 0) return setError('Введіть коректну суму')
    const ok = await confirmIfNeeded({
      registerName: selectedRegister?.name ?? 'Каса',
      balance: selectedRegister?.balance ?? 0,
      amount: numAmount,
      currencyCode,
    })
    if (!ok) return

    startTransition(async () => {
      const res = await createTransaction({
        cashRegisterId: registerId,
        amount: numAmount,
        type: 'EXPENSE',
        vehicleId,
        expenseCategoryId: categoryId ? Number(categoryId) : undefined,
        description: description.trim() || undefined,
        customRate: rateTouched ? Number(rate) || null : null,
        transactionDate,
      })
      if (res.success) {
        if ('warning' in res && typeof res.warning === 'string') toast.warning(res.warning)
        onSaved()
      } else {
        setError(res.error ?? 'Помилка')
      }
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-textSecondary mb-1.5">Каса *</label>
        <select value={registerId} onChange={(e) => handleRegisterChange(Number(e.target.value))} className={inputCls}>
          {registers.map((r) => (
            <option key={r.id} value={r.id}>{r.name} ({r.balance.toLocaleString()} {r.currencyCode})</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-textSecondary mb-1.5">Категорія</label>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {canEditDict && <InlineAdd placeholder="Нова категорія" onDraftChange={() => {}} onCommit={handleAddCategory} />}
      </div>
      {currencyCode !== 'USD' && (
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-textSecondary mb-1">
            {rateLabelForRegister(currencyCode)}
          </label>
          <input
            type="number"
            min={0}
            step={0.0001}
            value={rateTouched ? rate : defaultRate != null ? String(defaultRate) : ''}
            onChange={(e) => { setRate(e.target.value); setRateTouched(true) }}
            className={`${inputCls} font-mono text-xs`}
          />
          <p className="text-[10px] text-textSecondary mt-1">{formatRateHint(currencyCode, rates)}</p>
        </div>
      )}
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-textSecondary mb-1.5">Сума *</label>
        <input
          type="number"
          min={0}
          step={0.01}
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setError('') }}
          className={inputCls}
        />
        {amountUsd > 0 && currencyCode !== 'USD' && (
          <p className="text-[10px] text-textSecondary font-mono mt-1">≈ ${amountUsd.toFixed(2)}</p>
        )}
      </div>
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-textSecondary mb-1.5">Дата</label>
        <DateInput value={transactionDate} onChange={setTransactionDate} className={inputCls} />
      </div>
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-textSecondary mb-1.5">Опис</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending || numAmount <= 0}
        className="w-full bg-accent text-background py-2 rounded-md text-sm font-semibold hover:bg-accent/90 disabled:opacity-50"
      >
        {isPending ? 'Збереження...' : 'Зберегти'}
      </button>
    </div>
  )
}
