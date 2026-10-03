'use client'

import { useState, useTransition, useEffect } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import OverlayBackdrop from '@/components/shared/OverlayBackdrop'
import InlineAdd from '@/components/shared/InlineAdd'
import DateInput from '@/components/shared/DateInput'
import { createTransaction } from '@/actions/finance'
import { addDictionaryItem } from '@/actions/dictionaries'
import { localTodayIso } from '@/lib/format-datetime'
import NegativeBalanceConfirmModal, { usePendingOverdraftConfirm } from '@/components/shared/NegativeBalanceConfirmModal'
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-textSecondary mb-1.5">{label}</label>
      {children}
    </div>
  )
}

type Props = {
  vehicleId: number
  registers: CashRegisterOption[]
  categories: { id: number; name: string }[]
  rates: MonthRates
  userDefaultRegisterId?: number | null
  canEditDict?: boolean
  onAddCategory?: (item: { id: number; name: string }) => void
  onClose: () => void
  onSaved: () => void
}

export default function QuickExpenseModal({
  vehicleId,
  registers,
  categories: initialCategories,
  rates,
  userDefaultRegisterId,
  canEditDict,
  onAddCategory,
  onClose,
  onSaved,
}: Props) {
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
  const { pending, confirmIfNeeded, handleConfirm, handleCancel } = usePendingOverdraftConfirm()

  useEffect(() => {
    setCategories(initialCategories)
  }, [initialCategories])

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
      const res = await addDictionaryItem('expenseCategory', {
        name,
        position: categories.length + 1,
      })
      if (res.success && res.data) {
        const item = { id: res.data.id, name: res.data.name }
        setCategories((prev) => [...prev, item])
        setCategoryId(String(item.id))
        onAddCategory?.(item)
        toast.success('Категорію додано')
      } else {
        toast.error(res.error ?? 'Помилка')
      }
    })
  }

  useEffect(() => {
    if (categories.length > 0 && !categoryId) {
      setCategoryId(String(categories[categories.length - 1].id))
    }
  }, [categories, categoryId])

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <OverlayBackdrop onDismiss={onClose} className="absolute inset-0 bg-black/70" />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-sm shadow-elevated">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-textPrimary">Швидка витрата</h3>
          <button type="button" onClick={onClose} className="text-textSecondary hover:text-textPrimary"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Каса *">
            <select value={registerId} onChange={(e) => handleRegisterChange(Number(e.target.value))} className={inputCls}>
              {registers.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({r.balance.toLocaleString()} {r.currencyCode})</option>
              ))}
            </select>
          </Field>
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
          <Field label={`Сума (${currencyCode}) *`}>
            <input
              type="number"
              min={0}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className={`${inputCls} font-mono`}
              autoFocus
            />
            {amountUsd > 0 && currencyCode !== 'USD' && (
              <p className="text-[10px] text-textSecondary font-mono mt-1">≈ ${amountUsd.toFixed(2)}</p>
            )}
          </Field>
          <Field label="Категорія">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
              <option value="">— Не задано —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {canEditDict && onAddCategory && (
              <InlineAdd placeholder="Назва категорії" onDraftChange={() => {}} onCommit={handleAddCategory} />
            )}
          </Field>
          <Field label="Опис">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Назва витрати..."
              className={inputCls}
            />
          </Field>
          <Field label="Дата">
            <DateInput
              value={transactionDate}
              onChange={setTransactionDate}
              max={localTodayIso()}
            />
          </Field>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="flex-1 bg-accent text-background py-2 rounded-md text-sm font-semibold hover:bg-accent/90 disabled:opacity-50"
          >
            {isPending ? 'Збереження...' : 'Зберегти'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 border border-border text-textSecondary rounded-md text-sm">Скасувати</button>
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
