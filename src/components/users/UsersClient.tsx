'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, X, Check, Zap, Search, Users, Shield, Landmark, KeyRound, Ban, RotateCcw,
  ChevronDown, Car, Wallet, Wrench, BookOpen, Settings, Bell, BarChart3, MessageSquare,
} from 'lucide-react'
import { PERMISSION_GROUPS, PERMISSION_PRESETS, type PermissionPresetId } from '@/lib/permissions-config'
import {
  expandPermissionSet,
  getDescendantCodes,
  codesInvalidWithoutEntityAccess,
  formatRequiresHint,
  getPermissionLabel,
} from '@/lib/permission-deps'
import {
  createUser,
  updateUser,
  setUserPermissions,
  resetUserPassword,
  fireUser,
  reactivateUser,
  initializeDefaultPermissions,
} from '@/actions/users'
import OverlayBackdrop from '@/components/shared/OverlayBackdrop'

type Permission = { id: number; code: string; description: string | null }
type CashRegister = { id: number; name: string; Currency: { code: string } }

type UserRow = {
  id: number
  fullName: string
  username: string
  telegramUsername: string | null
  isActive: boolean
  defaultCashRegisterId: number | null
  DefaultCashRegister: CashRegister | null
  UserPermissions: { permissionId: number; Permission: Permission }[]
}

type Props = {
  users: UserRow[]
  permissions: Permission[]
  registers: CashRegister[]
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  currentUserId: number
}

const inputCls =
  'w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent transition-colors'

const GROUP_ICONS: Record<string, typeof Car> = {
  'Автомобілі': Car,
  'Фінанси': Wallet,
  'Ремонти': Wrench,
  'Довідники': BookOpen,
  'Користувачі': Users,
  'Налаштування': Settings,
  'Сповіщення': Bell,
  'Звіти': BarChart3,
  'Коментарі та файли': MessageSquare,
}

const PRESET_HINTS: Record<PermissionPresetId, string> = {
  administrator: 'Повний доступ до всіх розділів',
  mechanic: 'Ремонти, авто та коментарі',
  accountant: 'Фінанси, звіти та вигода',
}

function PermissionSwitch({
  checked,
  onChange,
  disabled,
  label,
  hint,
  emphasized,
}: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  label: string
  hint?: string | null
  emphasized?: boolean
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors ${
        emphasized ? 'bg-accent/[0.06] border border-accent/15' : 'hover:bg-surfaceHover/40'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug ${emphasized ? 'font-semibold text-textPrimary' : 'text-textPrimary'}`}>
          {label}
        </p>
        {hint && (
          <p className="text-xs text-textSecondary mt-1 leading-relaxed">{hint}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className={`relative mt-0.5 shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
          checked ? 'bg-accent' : 'bg-border'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

function splitGroupPermissions(groupPerms: Permission[]) {
  const viewPerm = groupPerms.find((p) => p.code.endsWith('.view')) ?? null
  const actionPerms = groupPerms.filter((p) => p !== viewPerm)
  return { viewPerm, actionPerms }
}

export default function UsersClient({
  users: initialUsers,
  permissions,
  registers,
  canCreate,
  canEdit,
  canDelete,
  currentUserId,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(initialUsers[0]?.id ?? null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newUser, setNewUser] = useState({ fullName: '', username: '', password: '', telegramUsername: '' })
  const [editFullName, setEditFullName] = useState('')
  const [editTelegram, setEditTelegram] = useState('')
  const [editRegisterId, setEditRegisterId] = useState<number | ''>('')
  const [checkedPerms, setCheckedPerms] = useState<Set<number>>(new Set())
  const [newPassword, setNewPassword] = useState('')
  const [showPasswordReset, setShowPasswordReset] = useState(false)
  const [initMsg, setInitMsg] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(PERMISSION_GROUPS.map((g) => g.label)))

  const selected = initialUsers.find((u) => u.id === selectedId) ?? null
  const isSelf = selected?.id === currentUserId
  const canEditPermissions = canEdit && !isSelf

  useEffect(() => {
    if (!selected) return
    setEditFullName(selected.fullName)
    setEditTelegram(selected.telegramUsername ? `@${selected.telegramUsername}` : '')
    setEditRegisterId(selected.defaultCashRegisterId ?? '')
    setCheckedPerms(new Set(selected.UserPermissions.map((p) => p.permissionId)))
    const selectedIds = new Set(selected.UserPermissions.map((p) => p.permissionId))
    const activeGroups = PERMISSION_GROUPS.filter((group) =>
      group.codes.some((code) => {
        const perm = permissions.find((p) => p.code === code)
        return perm && selectedIds.has(perm.id)
      })
    ).map((g) => g.label)
    setExpandedGroups(new Set(activeGroups.length ? activeGroups : PERMISSION_GROUPS.map((g) => g.label)))
  }, [selectedId, initialUsers, permissions])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return initialUsers
    return initialUsers.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.telegramUsername ?? '').includes(q)
    )
  }, [initialUsers, search])

  const selectUser = (u: UserRow) => {
    setSelectedId(u.id)
    setEditFullName(u.fullName)
    setEditTelegram(u.telegramUsername ? `@${u.telegramUsername}` : '')
    setEditRegisterId(u.defaultCashRegisterId ?? '')
    setCheckedPerms(new Set(u.UserPermissions.map((p) => p.permissionId)))
    setError('')
    setMsg('')
    setShowPasswordReset(false)
    setNewPassword('')
  }

  const permByCode = useMemo(() => {
    const map = new Map<string, Permission>()
    permissions.forEach((p) => map.set(p.code, p))
    return map
  }, [permissions])

  const codesFromPermIds = (ids: Set<number>) =>
    [...ids]
      .map((id) => permissions.find((p) => p.id === id)?.code)
      .filter((c): c is string => !!c)

  const togglePerm = (id: number) => {
    const perm = permissions.find((p) => p.id === id)
    if (!perm) return

    setCheckedPerms((prev) => {
      const next = new Set(prev)

      if (next.has(id)) {
        next.delete(id)
        for (const code of getDescendantCodes(perm.code)) {
          const child = permByCode.get(code)
          if (child) next.delete(child.id)
        }
        for (const code of codesInvalidWithoutEntityAccess(codesFromPermIds(next))) {
          const bound = permByCode.get(code)
          if (bound) next.delete(bound.id)
        }
      } else {
        const expanded = expandPermissionSet([...codesFromPermIds(next), perm.code])
        for (const code of expanded) {
          const row = permByCode.get(code)
          if (row) next.add(row.id)
        }
      }

      return next
    })
  }

  const applyPreset = (presetId: PermissionPresetId) => {
    const preset = PERMISSION_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    const expanded = expandPermissionSet(preset.codes)
    const ids = expanded
      .map((code) => permByCode.get(code)?.id)
      .filter((id): id is number => id != null)
    setCheckedPerms(new Set(ids))
    setExpandedGroups(new Set(PERMISSION_GROUPS.map((g) => g.label)))
  }

  const clearAllPerms = () => {
    setCheckedPerms(new Set())
  }

  const toggleGroupExpand = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const enabledPermCount = checkedPerms.size

  const handleSave = () => {
    if (!selected || !canEdit) return
    setError('')
    startTransition(async () => {
      const resProfile = await updateUser(selected.id, {
        fullName: editFullName,
        telegramUsername: editTelegram,
        defaultCashRegisterId: editRegisterId === '' ? null : Number(editRegisterId),
      })
      if (!resProfile.success) {
        setError(resProfile.error ?? 'Помилка')
        return
      }
      if (!isSelf) {
        const resPerms = await setUserPermissions(selected.id, Array.from(checkedPerms))
        if (!resPerms.success) {
          setError(resPerms.error ?? 'Помилка')
          return
        }
      }
      setMsg('Збережено')
      router.refresh()
      setTimeout(() => setMsg(''), 2000)
    })
  }

  const handleCreate = () => {
    if (!canCreate) return
    if (!newUser.fullName.trim() || !newUser.username.trim() || !newUser.password) {
      setError('Заповніть обовʼязкові поля')
      return
    }
    if (newUser.password.length < 8) {
      setError('Пароль має бути мінімум 8 символів')
      return
    }
    setError('')
    startTransition(async () => {
      const res = await createUser({
        fullName: newUser.fullName,
        username: newUser.username,
        password: newUser.password,
        telegramUsername: newUser.telegramUsername || undefined,
      })
      if (res.success) {
        setShowAdd(false)
        setNewUser({ fullName: '', username: '', password: '', telegramUsername: '' })
        router.refresh()
      } else {
        setError(res.error ?? 'Помилка')
      }
    })
  }

  const handleResetPassword = () => {
    if (!selected || !canEdit || !newPassword) return
    startTransition(async () => {
      const res = await resetUserPassword(selected.id, newPassword)
      if (res.success) {
        setShowPasswordReset(false)
        setNewPassword('')
        setMsg('Пароль змінено')
        setTimeout(() => setMsg(''), 2000)
      } else {
        setError(res.error ?? 'Помилка')
      }
    })
  }

  const handleFire = () => {
    if (!selected || !canDelete) return
    startTransition(async () => {
      const res = await fireUser(selected.id)
      if (res.success) {
        router.refresh()
      } else {
        setError(res.error ?? 'Помилка')
      }
    })
  }

  const handleReactivate = () => {
    if (!selected || !canEdit) return
    startTransition(async () => {
      const res = await reactivateUser(selected.id)
      if (res.success) router.refresh()
      else setError(res.error ?? 'Помилка')
    })
  }

  const handleInitPerms = () => {
    startTransition(async () => {
      const res = await initializeDefaultPermissions()
      if (res.success) {
        const created = (res as { success: true; created: number }).created
        setInitMsg(created > 0 ? `Додано ${created} дозволів` : 'Усі дозволи вже існують')
        router.refresh()
      } else {
        setInitMsg(res.error ?? 'Помилка')
      }
      setTimeout(() => setInitMsg(''), 3000)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-textPrimary">Співробітники</h1>
        <div className="flex items-center gap-2">
          {canEdit && permissions.length === 0 && (
            <button
              type="button"
              onClick={handleInitPerms}
              disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-2 text-xs border border-accent/40 text-accent rounded-md hover:bg-accent/10 transition-all disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" /> Ініціалізувати дозволи
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              onClick={() => { setShowAdd(true); setError('') }}
              className="flex items-center gap-2 bg-accent text-background px-4 py-2.5 rounded-md text-sm font-semibold hover:bg-accent/90 transition-all shadow-neon"
            >
              <Plus className="w-4 h-4" /> Додати
            </button>
          )}
        </div>
      </div>

      {initMsg && <p className="text-xs text-emerald-400">{initMsg}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-0 lg:min-h-[520px]">
        <div className="lg:col-span-2 bg-surface border border-border rounded-lg flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textSecondary" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Пошук..."
                className="w-full bg-background border border-border rounded-md pl-8 pr-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {filtered.length === 0 ? (
              <p className="p-6 text-sm text-textSecondary text-center">Нікого не знайдено</p>
            ) : (
              filtered.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => selectUser(u)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                    selectedId === u.id ? 'bg-accent/10 border-l-2 border-accent' : 'hover:bg-surfaceHover border-l-2 border-transparent'
                  }`}
                >
                  <div className="w-8 h-8 rounded bg-accent/10 border border-accent/20 flex items-center justify-center text-xs font-bold text-accent shrink-0">
                    {u.fullName.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${!u.isActive ? 'text-textSecondary line-through' : 'text-textPrimary'}`}>
                      {u.fullName}
                    </p>
                    <p className="text-[11px] text-textSecondary">
                      @{u.username}
                      {u.UserPermissions.length > 0 && (
                        <> · {u.UserPermissions.length} {u.UserPermissions.length === 1 ? 'можливість' : u.UserPermissions.length < 5 ? 'можливості' : 'можливостей'}</>
                      )}
                    </p>
                  </div>
                  {!u.isActive && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 shrink-0">Блок</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-3 bg-surface border border-border rounded-lg flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-textSecondary gap-2 p-8">
              <Users className="w-10 h-10 opacity-30" />
              <p className="text-sm">Оберіть співробітника</p>
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-textPrimary">{selected.fullName}</h2>
                  <p className="text-xs text-textSecondary">@{selected.username}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selected.isActive ? (
                    canDelete && !isSelf && (
                      <button
                        type="button"
                        onClick={handleFire}
                        disabled={isPending}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-red-500/40 text-red-400 rounded hover:bg-red-500/10 transition-all disabled:opacity-50"
                      >
                        <Ban className="w-3.5 h-3.5" /> Заблокувати
                      </button>
                    )
                  ) : (
                    canEdit && (
                      <button
                        type="button"
                        onClick={handleReactivate}
                        disabled={isPending}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-emerald-500/40 text-emerald-400 rounded hover:bg-emerald-500/10 transition-all disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Активувати
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <div className="rounded-xl border border-border bg-background/30 p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-textPrimary">Профіль</h3>
                    <p className="text-xs text-textSecondary mt-0.5">Основні дані співробітника</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-textSecondary mb-1.5 block">Повне ім&apos;я</label>
                      <input
                        value={editFullName}
                        onChange={(e) => setEditFullName(e.target.value)}
                        disabled={!canEdit || isPending}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-textSecondary mb-1.5 block">Telegram</label>
                      <input
                        value={editTelegram}
                        onChange={(e) => setEditTelegram(e.target.value)}
                        disabled={!canEdit || isPending}
                        placeholder="@username"
                        className={inputCls}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-sm text-textSecondary mb-1.5 flex items-center gap-1.5">
                        <Landmark className="w-3.5 h-3.5" /> Каса за замовчуванням
                      </label>
                      <select
                        value={editRegisterId}
                        onChange={(e) => setEditRegisterId(e.target.value ? Number(e.target.value) : '')}
                        disabled={!canEdit || isPending}
                        className={inputCls}
                      >
                        <option value="">Не задано</option>
                        {registers.map((r) => (
                          <option key={r.id} value={r.id}>{r.name} ({r.Currency.code})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-background/30 overflow-hidden">
                  <div className="px-4 py-4 border-b border-border/70">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-accent" />
                          <h3 className="text-sm font-semibold text-textPrimary">Доступ до системи</h3>
                        </div>
                        <p className="text-xs text-textSecondary mt-1">
                          {isSelf
                            ? 'Власні дозволи змінити не можна — лише перегляд'
                            : enabledPermCount > 0
                              ? `Увімкнено ${enabledPermCount} ${enabledPermCount === 1 ? 'можливість' : enabledPermCount < 5 ? 'можливості' : 'можливостей'}`
                              : 'Права не налаштовані — оберіть роль або розділи нижче'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {permissions.length === 0 ? (
                    <p className="p-6 text-sm text-textSecondary text-center">Дозволи не ініціалізовані в системі</p>
                  ) : (
                    <div className="p-4 space-y-4">
                      {canEditPermissions && (
                        <div>
                          <p className="text-sm font-medium text-textPrimary mb-1">Швидкий вибір ролі</p>
                          <p className="text-xs text-textSecondary mb-3">Типові набори для посади — можна змінити вручну нижче</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                            {PERMISSION_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => applyPreset(preset.id)}
                                disabled={isPending}
                                className="text-left rounded-xl border border-border bg-surface px-3 py-3 hover:border-accent/40 hover:bg-accent/[0.04] transition-colors disabled:opacity-50"
                              >
                                <p className="text-sm font-medium text-textPrimary">{preset.label}</p>
                                <p className="text-xs text-textSecondary mt-1 leading-relaxed">{PRESET_HINTS[preset.id]}</p>
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={clearAllPerms}
                              disabled={isPending}
                              className="text-left rounded-xl border border-dashed border-border px-3 py-3 text-textSecondary hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/[0.04] transition-colors disabled:opacity-50"
                            >
                              <p className="text-sm font-medium">Скинути все</p>
                              <p className="text-xs mt-1 leading-relaxed">Зняти всі можливості</p>
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-3">
                        {PERMISSION_GROUPS.map((group) => {
                          const groupPerms = group.codes
                            .map((code) => permByCode.get(code))
                            .filter(Boolean) as Permission[]
                          if (groupPerms.length === 0) return null

                          const { viewPerm, actionPerms } = splitGroupPermissions(groupPerms)
                          const Icon = GROUP_ICONS[group.label] ?? Shield
                          const expanded = expandedGroups.has(group.label)
                          const groupSelected = groupPerms.filter((p) => checkedPerms.has(p.id)).length

                          return (
                            <div key={group.label} className="rounded-xl border border-border bg-surface overflow-hidden">
                              <button
                                type="button"
                                onClick={() => toggleGroupExpand(group.label)}
                                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surfaceHover/50 transition-colors text-left"
                              >
                                <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/15 flex items-center justify-center shrink-0">
                                  <Icon className="w-4 h-4 text-accent" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-textPrimary">{group.label}</p>
                                  <p className="text-xs text-textSecondary mt-0.5">
                                    {groupSelected > 0
                                      ? `${groupSelected} з ${groupPerms.length} увімкнено`
                                      : 'Доступ не надано'}
                                  </p>
                                </div>
                                <span
                                  className={`shrink-0 w-7 h-7 rounded-lg border border-border flex items-center justify-center ${
                                    groupSelected > 0 ? 'bg-accent/10 text-accent border-accent/20' : 'text-textSecondary'
                                  }`}
                                >
                                  <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                </span>
                              </button>

                              {expanded && (
                                <div className="px-3 pb-3 border-t border-border/60">
                                  {viewPerm && (
                                    <div className="mt-2 mb-1">
                                      <PermissionSwitch
                                        checked={checkedPerms.has(viewPerm.id)}
                                        onChange={() => togglePerm(viewPerm.id)}
                                        disabled={!canEditPermissions || isPending}
                                        label={getPermissionLabel(viewPerm.code)}
                                        hint="Відкриває розділ у меню та дозволяє переглядати дані"
                                        emphasized
                                      />
                                    </div>
                                  )}

                                  {!viewPerm && group.label === 'Коментарі та файли' && (
                                    <p className="text-xs text-textSecondary px-3 py-2 mb-1 rounded-lg bg-background/60 border border-border/60">
                                      Коментарі та файли доступні лише якщо є доступ до автомобілів або ремонтів
                                    </p>
                                  )}

                                  {actionPerms.length > 0 && (
                                    <div className={viewPerm ? 'mt-2 pt-2 border-t border-border/50' : 'mt-2'}>
                                      {viewPerm && (
                                        <p className="text-xs font-medium text-textSecondary px-3 mb-1">Додаткові можливості</p>
                                      )}
                                      <div className="space-y-0.5">
                                        {actionPerms.map((p) => {
                                          const requiresHint = formatRequiresHint(p.code)
                                          const desc = p.description && p.description !== getPermissionLabel(p.code)
                                            ? p.description
                                            : null
                                          return (
                                            <PermissionSwitch
                                              key={p.id}
                                              checked={checkedPerms.has(p.id)}
                                              onChange={() => togglePerm(p.id)}
                                              disabled={!canEditPermissions || isPending}
                                              label={getPermissionLabel(p.code)}
                                              hint={requiresHint ?? desc}
                                            />
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {canEdit && (
                  <div className="rounded-xl border border-border bg-background/30 px-4 py-4">
                    {!showPasswordReset ? (
                      <button
                        type="button"
                        onClick={() => setShowPasswordReset(true)}
                        className="flex items-center gap-2 text-sm text-textSecondary hover:text-accent transition-colors"
                      >
                        <KeyRound className="w-4 h-4" /> Змінити пароль
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-textPrimary">Новий пароль</p>
                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Мінімум 8 символів"
                            className={`${inputCls} flex-1`}
                          />
                          <button
                            type="button"
                            onClick={handleResetPassword}
                            disabled={isPending || newPassword.length < 8}
                            className="px-4 py-2 bg-accent text-background text-sm font-medium rounded-md hover:bg-accent/90 transition-all disabled:opacity-50"
                          >
                            Зберегти
                          </button>
                          <button type="button" onClick={() => { setShowPasswordReset(false); setNewPassword('') }} className="p-2 text-textSecondary hover:text-textPrimary">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-sm text-red-400 whitespace-pre-line">
                    {error}
                  </div>
                )}
                {msg && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-400">
                    {msg}
                  </div>
                )}
              </div>

              {canEdit && (
                <div className="px-5 py-4 border-t border-border">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isPending}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-accent text-background px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-accent/90 transition-all disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" /> Зберегти зміни
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <OverlayBackdrop onDismiss={() => setShowAdd(false)} className="absolute inset-0 bg-black/70" />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-md shadow-elevated">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-textPrimary">Новий співробітник</h3>
              <button type="button" onClick={() => setShowAdd(false)} className="text-textSecondary hover:text-textPrimary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {(['fullName', 'username', 'password'] as const).map((field) => (
                <input
                  key={field}
                  type={field === 'password' ? 'password' : 'text'}
                  value={newUser[field]}
                  onChange={(e) => setNewUser((u) => ({ ...u, [field]: e.target.value }))}
                  placeholder={{ fullName: "Повне ім'я", username: 'Логін', password: 'Пароль' }[field]}
                  className={inputCls}
                />
              ))}
              <input
                type="text"
                value={newUser.telegramUsername}
                onChange={(e) => setNewUser((u) => ({ ...u, telegramUsername: e.target.value }))}
                placeholder="Telegram @username (необовʼязково)"
                className={inputCls}
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
            <div className="px-5 py-4 border-t border-border flex gap-2">
              <button
                type="button"
                onClick={handleCreate}
                disabled={isPending}
                className="flex-1 bg-accent text-background py-2 rounded-md text-sm font-semibold hover:bg-accent/90 disabled:opacity-50"
              >
                {isPending ? '...' : 'Створити'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 border border-border text-textSecondary rounded-md text-sm">
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
