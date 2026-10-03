'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Settings, DollarSign, Landmark, Trash2, Tags,
  Plus, Pencil, Check, X, ChevronDown, Zap, SlidersHorizontal, AlertTriangle, ShieldCheck, KeyRound, History, Palette, HardDrive,
} from 'lucide-react'
import AuditTab from '@/components/settings/AuditTab'
import BackupsTab from '@/components/settings/BackupsTab'
import {
  getSetting, updateSetting,
  getCashRegisters, createCashRegister, updateCashRegister, deleteCashRegister, setRegisterBalance,
  getExchangeRates, createExchangeRate, getCurrencies,
  getRatePolicySettings, updateRatePolicySettings,
  clearAllData,
  getDefaultCategoryMappings, setDefaultCategoryMapping,
  getSystemStatusMappings, mapSystemStatus, initializeSystemStatuses,
} from '@/actions/settings'
import { getDictionary, addDictionaryItem } from '@/actions/dictionaries'
import { useHasPermission } from '@/contexts/PermissionsContext'
import type { DefaultCategoryKey } from '@/lib/default-categories'
import type { SystemStatusSlug } from '@/lib/system-statuses'
import { useCrmRefresh } from '@/hooks/useCrmRefresh'
import { notifyCrmRefresh } from '@/lib/crm-refresh'
import OverlayBackdrop from '@/components/shared/OverlayBackdrop'
import ChangePasswordModal from '@/components/layout/ChangePasswordModal'
import { RegisterColorEditor } from '@/components/shared/RegisterColorEditor'
import RecordAttribution from '@/components/shared/RecordAttribution'

// ─── Types ────────────────────────────────────────────────────────────────────

type Currency = { id: number; code: string; name: string }
type CashRegister = { id: number; name: string; balance: number | string; color: string | null; Currency: Currency }
type ExchangeRate = {
  id: number; rateToUah: number | string; effectiveMonth: string
  Currency: Currency; createdAt: string
  CreatedByUser: { fullName: string; username: string }
}
type ExpenseCategory = { id: number; name: string; position: number }
type DefaultCategoryMapping = {
  key: DefaultCategoryKey
  label: string
  description: string
  categoryId: number | null
  categoryName: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'general', label: 'Загальне', icon: Settings },
  { id: 'statuses', label: 'Системні статуси', icon: ShieldCheck },
  { id: 'finance', label: 'Каси', icon: Landmark },
  { id: 'categories', label: 'Категорії витрат за замовчуванням', icon: Tags },
  { id: 'rates', label: 'Курси валют', icon: DollarSign },
  { id: 'backups', label: 'Бекапи', icon: HardDrive },
  { id: 'audit', label: 'Аудит', icon: History },
]

function TabButton({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: React.ElementType; label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-all duration-200 whitespace-nowrap ${
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

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-textSecondary uppercase tracking-wider">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function InlineInput({ value, onSave, onCancel }: {
  value: string; onSave: (v: string) => void; onCancel: () => void
}) {
  const [val, setVal] = useState(value)
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onCancel() }}
        className="flex-1 bg-background border border-accent/40 rounded px-3 py-1.5 text-sm text-textPrimary focus:outline-none focus:border-accent"
      />
      <button onClick={() => onSave(val)} className="text-accent hover:text-accent/80"><Check className="w-4 h-4" /></button>
      <button onClick={onCancel} className="text-textSecondary hover:text-textPrimary"><X className="w-4 h-4" /></button>
    </div>
  )
}

// ─── Tab: General ─────────────────────────────────────────────────────────────

function GeneralTab() {
  const [businessName, setBusinessName] = useState('')
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState('')

  useEffect(() => { getSetting('business_name', 'CRM AUTO').then(setBusinessName) }, [])

  const save = () => {
    startTransition(async () => {
      const res = await updateSetting('business_name', businessName)
      setMsg(res.success ? 'Збережено' : (res.error ?? 'Помилка'))
      setTimeout(() => setMsg(''), 2000)
    })
  }

  return (
    <div className="space-y-4 max-w-lg">
      <SectionCard title="Компанія">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-textSecondary uppercase tracking-wider mb-1.5">Назва бізнесу</label>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-4 py-2.5 text-sm text-textPrimary focus:outline-none focus:border-accent focus:shadow-neon transition-all"
              placeholder="CRM AUTO"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={isPending}
              className="bg-accent/10 border border-accent text-accent px-5 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accentOn transition-all disabled:opacity-50"
            >
              {isPending ? 'Збереження...' : 'Зберегти'}
            </button>
            {msg && <span className="text-xs text-emerald-400">{msg}</span>}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Безпека">
        <p className="text-xs text-textSecondary mb-4">Змініть пароль для входу в систему.</p>
        <button
          type="button"
          onClick={() => setShowPasswordModal(true)}
          className="flex items-center gap-2 text-sm text-textSecondary hover:text-accent border border-border hover:border-accent/40 px-4 py-2 rounded-md transition-all"
        >
          <KeyRound className="w-4 h-4" /> Змінити пароль
        </button>
      </SectionCard>

      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}

      <DangerZone />
    </div>
  )
}

function DangerZone() {
  const canDanger = useHasPermission('settings.danger')
  const [open, setOpen] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const handleClear = () => {
    startTransition(async () => {
      const res = await clearAllData(phrase)
      if (res.success) {
        window.location.href = '/'
      } else {
        setError(res.error ?? 'Помилка')
      }
    })
  }

  if (!canDanger) return null

  return (
    <div className="bg-red-950/20 border border-red-500/20 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-sm font-semibold text-red-400 uppercase tracking-wider flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> Небезпечна зона
        </span>
        <ChevronDown className={`w-4 h-4 text-red-400/60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-red-500/10">
          <p className="text-xs text-textSecondary mt-3">
            Видалення всіх <strong className="text-textPrimary">авто, транзакцій, ремонтів, курсів</strong>. Каси, довідники та користувачі залишаться.
            Операція незворотня. Введіть <strong className="text-red-400 font-mono">ВИДАЛИТИ ВСЕ</strong> для підтвердження.
          </p>
          <input
            value={phrase}
            onChange={(e) => { setPhrase(e.target.value); setError('') }}
            placeholder="ВИДАЛИТИ ВСЕ"
            className="w-full bg-background border border-red-500/30 rounded px-3 py-2 text-sm text-textPrimary font-mono focus:outline-none focus:border-red-500"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={handleClear}
            disabled={isPending || phrase !== 'ВИДАЛИТИ ВСЕ'}
            className="bg-red-500/10 border border-red-500 text-red-400 px-5 py-2 rounded text-sm font-medium hover:bg-red-500 hover:text-white transition-all disabled:opacity-40"
          >
            {isPending ? 'Видалення...' : 'Видалити всі дані'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Default expense categories ───────────────────────────────────────────────

function DefaultCategoryRow({
  mapping,
  categories,
  onCategoriesChange,
}: {
  mapping: DefaultCategoryMapping
  categories: ExpenseCategory[]
  onCategoriesChange: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')

  const handleSelect = (value: string) => {
    const categoryId = value ? Number(value) : null
    startTransition(async () => {
      const res = await setDefaultCategoryMapping(mapping.key, categoryId)
      if (res.success) onCategoriesChange()
      else setError(res.error ?? 'Помилка')
    })
  }

  const handleCreate = () => {
    if (!newName.trim()) return setError('Введіть назву')
    startTransition(async () => {
      const nextPosition =
        categories.length > 0
          ? Math.max(...categories.map((c) => c.position)) + 1
          : 1
      const res = await addDictionaryItem('expenseCategory', {
        name: newName.trim(),
        position: nextPosition,
      })
      if (!res.success) {
        setError(res.error ?? 'Помилка')
        return
      }
      const created = res.data as ExpenseCategory
      const linkRes = await setDefaultCategoryMapping(mapping.key, created.id)
      if (linkRes.success) {
        setShowAdd(false)
        setNewName('')
        setError('')
        onCategoriesChange()
      } else {
        setError(linkRes.error ?? 'Помилка прив\'язки')
      }
    })
  }

  return (
    <div className="py-3 border-b border-border last:border-0 space-y-2">
      <div>
        <p className="text-sm font-medium text-textPrimary">{mapping.label}</p>
        <p className="text-[11px] text-textSecondary mt-0.5">{mapping.description}</p>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <select
          value={mapping.categoryId ?? ''}
          onChange={(e) => handleSelect(e.target.value)}
          disabled={isPending}
          className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent disabled:opacity-50"
        >
          <option value="">— Не задано —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {!showAdd ? (
          <button
            type="button"
            onClick={() => { setShowAdd(true); setError('') }}
            className="shrink-0 flex items-center gap-1 px-3 py-2 text-xs text-accent border border-accent/30 rounded hover:bg-accent/10 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Нова
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { setShowAdd(false); setNewName(''); setError('') }}
            className="shrink-0 p-2 text-textSecondary hover:text-textPrimary"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {showAdd && (
        <div className="flex items-center gap-2 pl-0">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Назва категорії..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setShowAdd(false); setNewName(''); setError('') }
            }}
            className="flex-1 bg-background border border-accent/40 rounded px-3 py-1.5 text-sm text-textPrimary placeholder:text-textSecondary/40 focus:outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={isPending}
            className="p-1.5 text-accent hover:text-accent/80 disabled:opacity-40"
          >
            <Check className="w-4 h-4" />
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

function DefaultCategoriesSection() {
  const [mappings, setMappings] = useState<DefaultCategoryMapping[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])

  const load = () => {
    getDefaultCategoryMappings().then((r) => {
      if (r.success) setMappings(r.data as DefaultCategoryMapping[])
    })
    getDictionary('expenseCategory').then((r) => {
      if (r.success) setCategories(r.data as ExpenseCategory[])
    })
  }

  useEffect(() => { load() }, [])

  return (
    <SectionCard title="Категорії витрат за замовчуванням">
      <p className="text-[11px] text-textSecondary mb-3">
        Прив&apos;яжіть категорії до автоматичних транзакцій. Оберіть існуючу з довідника або створіть нову.
      </p>
      <div>
        {mappings.map((m) => (
          <DefaultCategoryRow
            key={m.key}
            mapping={m}
            categories={categories}
            onCategoriesChange={load}
          />
        ))}
      </div>
    </SectionCard>
  )
}

function DefaultCategoriesTab() {
  return (
    <div className="max-w-xl space-y-4">
      <DefaultCategoriesSection />
    </div>
  )
}

type StatusOption = { id: number; name: string; isFinal: boolean; systemSlug: string | null; isSystem: boolean }
type SystemStatusMapping = {
  slug: SystemStatusSlug
  label: string
  description: string
  isFinal: boolean
  statusId: number | null
  statusName: string | null
}

function SystemStatusRow({
  mapping,
  statuses,
  onSaved,
}: {
  mapping: SystemStatusMapping
  statuses: StatusOption[]
  onSaved: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const handleSelect = (value: string) => {
    if (!value) return
    startTransition(async () => {
      const res = await mapSystemStatus(mapping.slug, Number(value))
      if (res.success) {
        setError('')
        onSaved()
      } else {
        setError(res.error ?? 'Помилка')
      }
    })
  }

  return (
    <div className="py-3 border-b border-border last:border-0 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-textPrimary flex items-center gap-2">
            {mapping.label}
            {mapping.isFinal && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Фінальний
              </span>
            )}
          </p>
          <p className="text-[11px] text-textSecondary mt-0.5">{mapping.description}</p>
          <p className="text-[10px] font-mono text-textSecondary/60 mt-1">{mapping.slug}</p>
        </div>
        {mapping.statusId ? (
          <span className="text-[10px] text-emerald-400 shrink-0">Прив&apos;язано</span>
        ) : (
          <span className="text-[10px] text-amber-400 shrink-0">Не налаштовано</span>
        )}
      </div>
      <select
        value={mapping.statusId ?? ''}
        onChange={(e) => handleSelect(e.target.value)}
        disabled={isPending}
        className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent disabled:opacity-50"
      >
        <option value="">— Оберіть статус з довідника —</option>
        {statuses.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}{s.systemSlug && s.systemSlug !== mapping.slug ? ` (${s.systemSlug})` : ''}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

function SystemStatusesTab() {
  const router = useRouter()
  const [mappings, setMappings] = useState<SystemStatusMapping[]>([])
  const [statuses, setStatuses] = useState<StatusOption[]>([])
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState('')

  const load = () => {
    getSystemStatusMappings().then((r) => {
      if (r.success && r.data) {
        setMappings(r.data.mappings as SystemStatusMapping[])
        setStatuses(r.data.allStatuses as StatusOption[])
      }
    })
  }

  useEffect(() => { load() }, [])

  const handleInitialize = () => {
    startTransition(async () => {
      const res = await initializeSystemStatuses()
      if (res.success) {
        const created = (res as { success: true; created: number; mapped: number }).created
        const mapped = (res as { success: true; created: number; mapped: number }).mapped
        setMsg(
          created + mapped > 0
            ? `Створено: ${created}, прив'язано: ${mapped}`
            : 'Усі системні статуси вже налаштовані'
        )
        load()
        router.refresh()
      } else {
        setMsg(res.error ?? 'Помилка')
      }
      setTimeout(() => setMsg(''), 4000)
    })
  }

  const allConfigured = mappings.length > 0 && mappings.every((m) => m.statusId)

  return (
    <div className="max-w-xl space-y-4">
      <SectionCard title="Системні статуси авто">
        <p className="text-[11px] text-textSecondary mb-4">
          Два системні статуси керують обов&apos;язковими даними купівлі та продажу; «В дорозі» — дані доставки (необов&apos;язково). Прив&apos;яжіть їх до записів з довідника або натисніть «Створити відсутні».
        </p>

        {!allConfigured && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-amber-400 font-medium">Потрібне первинне налаштування</p>
              <p className="text-[11px] text-textSecondary mt-0.5">
                Оберіть статус з довідника для «Куплено» та «Продано» або створіть їх автоматично.
              </p>
            </div>
            <button
              type="button"
              onClick={handleInitialize}
              disabled={isPending}
              className="shrink-0 flex items-center gap-1.5 text-xs text-accent border border-accent/40 px-3 py-1.5 rounded hover:bg-accent/10 transition-colors disabled:opacity-50"
            >
              <Zap className="w-3 h-3" /> Створити відсутні
            </button>
          </div>
        )}

        {allConfigured && (
          <p className="text-xs text-emerald-400 mb-4">Усі системні статуси налаштовані</p>
        )}

        <div>
          {mappings.map((m) => (
            <SystemStatusRow
              key={m.slug}
              mapping={m}
              statuses={statuses}
              onSaved={() => { load(); router.refresh() }}
            />
          ))}
        </div>

        {msg && <p className="text-xs text-emerald-400 mt-3">{msg}</p>}
      </SectionCard>
    </div>
  )
}

// ─── Tab: Cash Registers ──────────────────────────────────────────────────────

function FinanceTab() {
  const router = useRouter()
  const [registers, setRegisters] = useState<CashRegister[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCurrencyId, setNewCurrencyId] = useState<number>(0)
  const [newColor, setNewColor] = useState('#3B82F6')
  const [colorEditId, setColorEditId] = useState<number | null>(null)
  const [colorInput, setColorInput] = useState('#3B82F6')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const [balanceEditId, setBalanceEditId] = useState<number | null>(null)
  const [balanceInput, setBalanceInput] = useState('')
  const [balanceConfirm, setBalanceConfirm] = useState(false)

  const load = () => {
    getCashRegisters().then((r) => {
      if (r.success && r.data) {
        setRegisters(r.data.map((reg) => ({
          ...reg,
          balance: Number(reg.balance),
        })))
      }
    })
    getCurrencies().then((r) => {
      if (r.success && r.data) {
        setCurrencies(r.data)
        if (r.data.length > 0 && !newCurrencyId) setNewCurrencyId(r.data[0].id)
      }
    })
  }

  useEffect(() => { load() }, [])

  const handleAdd = () => {
    if (!newName.trim()) return
    startTransition(async () => {
      const res = await createCashRegister({ name: newName.trim(), currencyId: newCurrencyId, color: newColor })
      if (res.success) { load(); setShowAdd(false); setNewName(''); setNewColor('#3B82F6'); notifyCrmRefresh('all'); router.refresh() }
      else setError(res.error ?? 'Помилка')
    })
  }

  const handleRename = (id: number, name: string) => {
    startTransition(async () => {
      await updateCashRegister(id, { name }); load(); setEditingId(null); router.refresh()
    })
  }

  const handleColorSave = (id: number) => {
    startTransition(async () => {
      await updateCashRegister(id, { color: colorInput || null })
      load()
      setColorEditId(null)
      notifyCrmRefresh('all')
      router.refresh()
    })
  }

  const handleDelete = (id: number) => {
    startTransition(async () => {
      const res = await deleteCashRegister(id)
      if (res.success) { load(); setDeleteConfirm(null); notifyCrmRefresh('all'); router.refresh() }
      else setError(res.error ?? 'Помилка')
    })
  }

  const openBalanceEdit = (reg: CashRegister) => {
    setBalanceEditId(reg.id)
    setBalanceInput(String(Number(reg.balance)))
    setBalanceConfirm(false)
    setError('')
  }

  const closeBalanceEdit = () => {
    setBalanceEditId(null)
    setBalanceInput('')
    setBalanceConfirm(false)
  }

  const handleSetBalance = (id: number) => {
    startTransition(async () => {
      const res = await setRegisterBalance(id, Number(balanceInput))
      if (res.success) { load(); closeBalanceEdit(); notifyCrmRefresh('topbar'); router.refresh() }
      else setError(res.error ?? 'Помилка')
    })
  }

  const balanceEditReg = registers.find(r => r.id === balanceEditId)

  return (
    <div className="max-w-xl space-y-4">

      {/* Balance correction modal */}
      {balanceEditId && balanceEditReg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <OverlayBackdrop onDismiss={closeBalanceEdit} className="absolute inset-0 bg-black/70" />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-sm shadow-elevated">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-textPrimary flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-accent" />
                Встановити баланс каси
              </h3>
              <button onClick={closeBalanceEdit} className="text-textSecondary hover:text-textPrimary"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">{balanceEditReg.Currency.code}</span>
                <span className="text-sm font-medium text-textPrimary">{balanceEditReg.name}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-textSecondary">Поточний баланс:</span>
                <span className="font-mono text-textPrimary">{Number(balanceEditReg.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })} {balanceEditReg.Currency.code}</span>
              </div>
              <div>
                <label className="block text-xs text-textSecondary uppercase tracking-wider mb-1.5">Новий баланс *</label>
                <input
                  type="number"
                  step="0.01"
                  value={balanceInput}
                  onChange={e => { setBalanceInput(e.target.value); setBalanceConfirm(false) }}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent font-mono"
                />
              </div>

              {!balanceConfirm ? (
                <button
                  onClick={() => setBalanceConfirm(true)}
                  disabled={balanceInput === '' || Number(balanceInput) === Number(balanceEditReg.balance)}
                  className="w-full bg-accent/10 border border-accent text-accent py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accentOn transition-all disabled:opacity-40"
                >
                  Встановити баланс
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-textSecondary space-y-1">
                    <p className="flex items-center gap-1.5 text-amber-400 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Підтвердіть зміну
                    </p>
                    <p>Баланс зміниться з <strong className="text-textPrimary">{Number(balanceEditReg.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong> на <strong className="text-accent">{Number(balanceInput).toLocaleString('en-US', { minimumFractionDigits: 2 })} {balanceEditReg.Currency.code}</strong></p>
                    <p>Транзакція <strong className="text-textPrimary">не створюється</strong>. Зміна буде записана в аудит лог.</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSetBalance(balanceEditId)}
                      disabled={isPending}
                      className="flex-1 bg-amber-500/10 border border-amber-500 text-amber-400 py-2 rounded-md text-sm font-medium hover:bg-amber-500 hover:text-white transition-all disabled:opacity-40"
                    >
                      {isPending ? '...' : 'Так, змінити'}
                    </button>
                    <button onClick={() => setBalanceConfirm(false)} className="px-4 py-2 border border-border text-textSecondary rounded-md text-sm hover:text-textPrimary">
                      Назад
                    </button>
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
          </div>
        </div>
      )}

      <SectionCard title="Каси">
        <div className="space-y-2">
          {registers.map((reg) => (
            <div key={reg.id} className="py-2 border-b border-border last:border-0">
              {colorEditId === reg.id ? (
                <RegisterColorEditor
                  title={`Колір: ${reg.name}`}
                  value={colorInput}
                  onChange={setColorInput}
                  onSave={() => handleColorSave(reg.id)}
                  onCancel={() => setColorEditId(null)}
                />
              ) : editingId === reg.id ? (
                <InlineInput value={reg.name} onSave={(v) => handleRename(reg.id, v)} onCancel={() => setEditingId(null)} />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span
                      className="w-4 h-4 rounded-md shrink-0 border border-border"
                      style={{ backgroundColor: reg.color ?? undefined }}
                      title={reg.color ? `Колір: ${reg.color}` : 'Колір за замовчуванням'}
                    />
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                      {reg.Currency.code}
                    </span>
                    <span className="text-sm text-textPrimary truncate">{reg.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-mono text-textSecondary">
                      {Number(reg.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                    {deleteConfirm === reg.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-400">Видалити?</span>
                        <button onClick={() => handleDelete(reg.id)} className="text-red-400 hover:text-red-300"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-textSecondary hover:text-textPrimary"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setColorEditId(reg.id); setColorInput(reg.color ?? '#3B82F6') }}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-textSecondary hover:text-accent hover:bg-accent/10 transition-colors"
                          title="Колір каси"
                        >
                          <Palette className="w-3.5 h-3.5" />
                          <span className="text-[10px] hidden sm:inline">Колір</span>
                        </button>
                        <button onClick={() => openBalanceEdit(reg)} className="text-textSecondary hover:text-accent transition-colors" title="Встановити баланс"><SlidersHorizontal className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingId(reg.id)} className="text-textSecondary hover:text-accent transition-colors" title="Перейменувати"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { setDeleteConfirm(reg.id); setError('') }} className="text-textSecondary hover:text-red-400 transition-colors" title="Видалити"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {showAdd ? (
            <div className="pt-3 space-y-3 border-t border-border">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowAdd(false) }}
                  placeholder="Назва каси"
                  className="flex-1 min-w-[140px] bg-background border border-border rounded px-3 py-1.5 text-sm text-textPrimary focus:outline-none focus:border-accent"
                />
                <select
                  value={newCurrencyId}
                  onChange={(e) => setNewCurrencyId(Number(e.target.value))}
                  className="bg-background border border-border rounded px-2 py-1.5 text-sm text-textPrimary focus:outline-none focus:border-accent"
                >
                  {currencies.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
                <button onClick={handleAdd} disabled={isPending} className="text-accent hover:text-accent/80"><Check className="w-4 h-4" /></button>
                <button onClick={() => setShowAdd(false)} className="text-textSecondary hover:text-textPrimary"><X className="w-4 h-4" /></button>
              </div>
              <RegisterColorEditor
                value={newColor}
                onChange={setNewColor}
                showActions={false}
                title="Колір нової каси"
              />
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="mt-2 flex items-center gap-2 text-sm text-textSecondary hover:text-accent transition-colors"
            >
              <Plus className="w-4 h-4" /> Додати касу
            </button>
          )}

          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>
      </SectionCard>
    </div>
  )
}

// ─── Tab: Exchange Rates ──────────────────────────────────────────────────────

function RatesTab() {
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [form, setForm] = useState({ currencyId: 0, rateToUah: '' })
  const [policyForm, setPolicyForm] = useState({ updateDay: '1', graceDays: '2' })
  const [complianceStatus, setComplianceStatus] = useState<'ok' | 'warning' | 'blocked'>('ok')
  const [complianceMessage, setComplianceMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [policyPending, startPolicyTransition] = useTransition()
  const [msg, setMsg] = useState('')
  const [policyMsg, setPolicyMsg] = useState('')

  const load = useCallback(() => {
    getExchangeRates().then((r) => {
      if (r.success && r.data) {
        setRates(r.data.map((rate) => ({
          ...rate,
          rateToUah: Number(rate.rateToUah),
          effectiveMonth: rate.effectiveMonth instanceof Date
            ? rate.effectiveMonth.toISOString()
            : String(rate.effectiveMonth),
          createdAt: rate.createdAt instanceof Date
            ? rate.createdAt.toISOString()
            : String(rate.createdAt),
          CreatedByUser: rate.CreatedByUser,
        })))
      }
    })
    getCurrencies().then((r) => {
      if (r.success && r.data) {
        const filtered = r.data.filter((c) => c.code !== 'UAH')
        setCurrencies(filtered)
        if (filtered.length > 0)
          setForm((f) => ({ ...f, currencyId: filtered[0].id }))
      }
    })
    getRatePolicySettings().then((r) => {
      if (r.success && r.data) {
        setPolicyForm({
          updateDay: String(r.data.updateDay),
          graceDays: String(r.data.graceDays),
        })
        setComplianceStatus(r.data.compliance.status)
        setComplianceMessage(r.data.compliance.message)
      }
    })
  }, [])

  useCrmRefresh(load, { scope: 'rates', intervalMs: 20000 })

  const handleSave = () => {
    if (!form.rateToUah) return
    startTransition(async () => {
      const res = await createExchangeRate({
        currencyId: form.currencyId,
        rateToUah: parseFloat(form.rateToUah),
      })
      if (res.success) {
        load()
        setForm((f) => ({ ...f, rateToUah: '' }))
        setMsg('Курс збережено')
        notifyCrmRefresh('all')
        setTimeout(() => setMsg(''), 2000)
      }
    })
  }

  const handleSavePolicy = () => {
    const updateDay = parseInt(policyForm.updateDay, 10)
    const graceDays = parseInt(policyForm.graceDays, 10)
    if (!updateDay || updateDay < 1 || updateDay > 28) return
    if (isNaN(graceDays) || graceDays < 0) return
    startPolicyTransition(async () => {
      const res = await updateRatePolicySettings({ updateDay, graceDays })
      if (res.success) {
        load()
        setPolicyMsg('Політику збережено')
        notifyCrmRefresh('all')
        setTimeout(() => setPolicyMsg(''), 2000)
      }
    })
  }

  const latestByCurrency = rates.reduce<Record<string, ExchangeRate>>((acc, rate) => {
    const code = rate.Currency.code
    if (!acc[code]) acc[code] = rate
    return acc
  }, {})

  return (
    <div className="max-w-xl space-y-4">
      {complianceStatus !== 'ok' && complianceMessage && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-2 ${
            complianceStatus === 'blocked'
              ? 'border-red-500/40 bg-red-950/40 text-red-200'
              : 'border-amber-500/30 bg-amber-950/30 text-amber-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{complianceMessage}</span>
        </div>
      )}

      <SectionCard title="Політика оновлення курсів">
        <div className="space-y-4">
          <p className="text-xs text-textSecondary">
            З вказаного дня місяця система перевіряє наявність курсів за поточний місяць. Якщо курси відсутні — показується попередження. Після grace period фінансові операції блокуються.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-textSecondary uppercase tracking-wider mb-1.5">День оновлення (1–28)</label>
              <input
                type="number"
                min={1}
                max={28}
                value={policyForm.updateDay}
                onChange={(e) => setPolicyForm((f) => ({ ...f, updateDay: e.target.value }))}
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-textSecondary uppercase tracking-wider mb-1.5">Grace period (днів)</label>
              <input
                type="number"
                min={0}
                max={14}
                value={policyForm.graceDays}
                onChange={(e) => setPolicyForm((f) => ({ ...f, graceDays: e.target.value }))}
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSavePolicy}
              disabled={policyPending}
              className="bg-accent/10 border border-accent text-accent px-5 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accentOn transition-all disabled:opacity-50"
            >
              {policyPending ? 'Збереження...' : 'Зберегти політику'}
            </button>
            {policyMsg && <span className="text-xs text-emerald-400">{policyMsg}</span>}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Встановити курс">
        <div className="space-y-4">
          <p className="text-xs text-textSecondary">
            Кожна зміна курсу зберігається окремим записом. Для транзакцій використовується останній встановлений курс; старі транзакції не перераховуються.
          </p>
          {Object.keys(latestByCurrency).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.values(latestByCurrency).map((rate) => (
                <span
                  key={rate.id}
                  className="inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-md border border-border bg-background/60"
                >
                  <span className="font-mono text-accent">{rate.Currency.code}</span>
                  <span className="font-mono text-textPrimary">
                    {Number(rate.rateToUah).toFixed(2)} UAH
                  </span>
                  <span className="text-textSecondary">поточний</span>
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-textSecondary uppercase tracking-wider mb-1.5">Валюта</label>
              <select
                value={form.currencyId}
                onChange={(e) => setForm((f) => ({ ...f, currencyId: Number(e.target.value) }))}
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent"
              >
                {currencies.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-textSecondary uppercase tracking-wider mb-1.5">Курс до UAH</label>
              <input
                type="number"
                step="0.01"
                value={form.rateToUah}
                onChange={(e) => setForm((f) => ({ ...f, rateToUah: e.target.value }))}
                placeholder="42.50"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={isPending || !form.rateToUah}
              className="bg-accent/10 border border-accent text-accent px-5 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accentOn transition-all disabled:opacity-50"
            >
              {isPending ? 'Збереження...' : 'Зберегти курс'}
            </button>
            {msg && <span className="text-xs text-emerald-400">{msg}</span>}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Історія курсів">
        {rates.length === 0 ? (
          <p className="text-sm text-textSecondary">Курси ще не встановлені</p>
        ) : (
          <div className="space-y-1">
            {rates.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 shrink-0">
                    {r.Currency.code}
                  </span>
                  <span className="text-sm font-mono text-textPrimary">
                    1 {r.Currency.code} = {Number(r.rateToUah).toFixed(2)} UAH
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                  <RecordAttribution at={r.createdAt} user={r.CreatedByUser} inline />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general')
  const canDanger = useHasPermission('settings.danger')
  const tabs = TABS.filter((t) => t.id !== 'backups' || canDanger)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-textPrimary">Налаштування</h1>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {tabs.map((t) => (
          <TabButton
            key={t.id}
            active={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            icon={t.icon}
            label={t.label}
          />
        ))}
      </div>

      <div>
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'statuses' && <SystemStatusesTab />}
        {activeTab === 'finance' && <FinanceTab />}
        {activeTab === 'categories' && <DefaultCategoriesTab />}
        {activeTab === 'rates' && <RatesTab />}
        {activeTab === 'backups' && canDanger && <BackupsTab />}
        {activeTab === 'audit' && <AuditTab />}
      </div>
    </div>
  )
}
