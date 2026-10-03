'use client'

import { useState, useTransition } from 'react'
import { Wallet } from 'lucide-react'
import InlineAdd from '@/components/shared/InlineAdd'
import {
  defaultRateForRegister,
  rateLabelForRegister,
  registerAmountToUsd,
  formatRateHint,
  type MonthRates,
  type CashRegisterOption,
} from '@/lib/currency'
import { createRepairTypeEntry } from '@/actions/sto'

const inputCls =
  'w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-textPrimary focus:outline-none focus:border-accent transition-colors'

function currencySymbol(code: string) {
  if (code === 'UAH') return '₴'
  if (code === 'EUR') return '€'
  return '$'
}

function findDefaultRegisterId(registers: CashRegisterOption[], userDefaultRegisterId?: number | null) {
  if (userDefaultRegisterId && registers.some((r) => r.id === userDefaultRegisterId)) {
    return String(userDefaultRegisterId)
  }
  const uah = registers.find((r) => r.currencyCode === 'UAH')
  return uah ? String(uah.id) : String(registers[0]?.id ?? '')
}

export type StoRecordFormData = {
  repairTypeId: number
  cashRegisterId: number
  amount: number
  customRate: number | null
  comment: string
}

type Props = {
  repairTypes: { id: number; name: string }[]
  registers: CashRegisterOption[]
  rates: MonthRates
  userDefaultRegisterId?: number | null
  initial?: {
    repairTypeId: number
    cashRegisterId: number
    amount: number
    customRate: number | null
    comment: string
  }
  onSave: (data: StoRecordFormData) => void
  onCancel?: () => void
  isPending?: boolean
  compact?: boolean
}

export default function StoRecordForm({
  repairTypes,
  registers,
  rates,
  userDefaultRegisterId,
  initial,
  onSave,
  onCancel,
  isPending,
  compact,
}: Props) {
  const [types, setTypes] = useState(repairTypes)
  const [repairTypeId, setRepairTypeId] = useState(String(initial?.repairTypeId ?? repairTypes[0]?.id ?? ''))
  const [registerId, setRegisterId] = useState(
    initial ? String(initial.cashRegisterId) : findDefaultRegisterId(registers, userDefaultRegisterId)
  )
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [comment, setComment] = useState(initial?.comment ?? '')
  const [rate, setRate] = useState(initial?.customRate != null ? String(initial.customRate) : '')
  const [rateTouched, setRateTouched] = useState(initial?.customRate != null)
  const [, startTransition] = useTransition()

  const selectedRegister = registers.find((r) => r.id === Number(registerId))
  const currencyCode = selectedRegister?.currencyCode ?? 'UAH'
  const defaultRate = defaultRateForRegister(currencyCode, rates)
  const numAmount = Number(amount) || 0
  const amountUsd = registerAmountToUsd(
    numAmount,
    currencyCode,
    rates,
    rateTouched ? Number(rate) || null : null
  )
  const overBudget = numAmount > 0 && numAmount > (selectedRegister?.balance ?? Infinity) + 0.001

  const handleRegisterChange = (id: string) => {
    setRegisterId(id)
    setRateTouched(false)
    const reg = registers.find((r) => r.id === Number(id))
    const def = defaultRateForRegister(reg?.currencyCode ?? 'UAH', rates)
    setRate(def != null ? String(def) : '')
  }

  const handleAddType = (name: string) => {
    startTransition(async () => {
      const res = await createRepairTypeEntry(name)
      if (res.success && res.data) {
        setTypes((prev) => [...prev, res.data!])
        setRepairTypeId(String(res.data.id))
      }
    })
  }

  const handleSubmit = () => {
    if (!repairTypeId || numAmount <= 0) return
    onSave({
      repairTypeId: Number(repairTypeId),
      cashRegisterId: Number(registerId),
      amount: numAmount,
      customRate: rateTouched ? Number(rate) || null : null,
      comment: comment.trim(),
    })
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-textSecondary mb-1.5">Категорія робіт *</label>
        <select value={repairTypeId} onChange={(e) => setRepairTypeId(e.target.value)} className={inputCls}>
          <option value="">— Оберіть —</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <InlineAdd placeholder="Новий тип робіт" onDraftChange={() => {}} onCommit={handleAddType} />
      </div>

      <div>
        <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-textSecondary mb-1.5">
          <Wallet className="w-3 h-3 text-accent" /> Каса *
        </label>
        <select value={registerId} onChange={(e) => handleRegisterChange(e.target.value)} className={inputCls}>
          {registers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.balance.toLocaleString()} {r.currencyCode})
            </option>
          ))}
        </select>
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
        <label className="block text-[11px] uppercase tracking-wider text-textSecondary mb-1.5">
          Сума ({currencySymbol(currencyCode)}) *
        </label>
        <input
          type="number"
          min={0}
          step={0.01}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className={`${inputCls} font-mono ${overBudget ? 'border-red-500' : ''}`}
        />
        {overBudget && (
          <p className="text-[10px] text-amber-400 mt-1">Перевищує баланс каси — потрібне підтвердження</p>
        )}
        {amountUsd > 0 && currencyCode !== 'USD' && (
          <p className="text-[10px] text-textSecondary font-mono mt-1">≈ ${amountUsd.toFixed(2)}</p>
        )}
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-wider text-textSecondary mb-1.5">Коментар</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="Опис робіт..."
          className={`${inputCls} resize-none text-xs`}
        />
      </div>

      <div className={`flex gap-2 ${compact ? '' : 'pt-2'}`}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || !repairTypeId || numAmount <= 0}
          className="flex-1 bg-accent text-background py-2 rounded-md text-sm font-semibold hover:bg-accent/90 disabled:opacity-50"
        >
          {isPending ? 'Збереження...' : 'Зберегти'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-border text-textSecondary rounded-md text-sm">
            Скасувати
          </button>
        )}
      </div>
    </div>
  )
}
