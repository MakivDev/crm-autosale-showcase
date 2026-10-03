'use client'

import { useState, useTransition, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Check, Loader2, Rocket, Building2, Wallet } from 'lucide-react'
import {
  saveSetupAccount,
  saveSetupFinance,
  completeSetup,
  getSetupSummary,
} from '@/actions/setup'
import {
  SETUP_STEPS,
  SETUP_DEFAULT_REGISTERS,
  SETUP_DEFAULT_USD_RATE,
  SETUP_DEFAULT_EUR_RATE,
  SETUP_DEFAULT_EUR_REGISTER,
  SETUP_DEFAULT_MAKES,
  SETUP_DEFAULT_CUSTOM_STATUSES,
  PRESET_EXPENSE_CATEGORIES,
  getDefaultRegisterColor,
  type SetupStepId,
} from '@/lib/setup'
import { RegisterColorEditor } from '@/components/shared/RegisterColorEditor'

type Props = {
  initialStep: SetupStepId
  completedSteps: SetupStepId[]
}

type RegisterRow = { name: string; currencyCode: string; balance: string; color: string }

const inputClass =
  'w-full bg-background border border-border rounded-lg px-3 py-2.5 text-textPrimary text-sm placeholder:text-textSecondary/40 focus:outline-none focus:border-accent focus:shadow-neon transition-all'

const labelClass = 'block text-xs font-medium text-textSecondary uppercase tracking-wider mb-1.5'

const STEP_ICONS = [Building2, Wallet, Rocket] as const

export default function SetupWizard({ initialStep, completedSteps }: Props) {
  const [step, setStep] = useState<SetupStepId>(initialStep)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const [businessName, setBusinessName] = useState('')
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [registers, setRegisters] = useState<RegisterRow[]>(
    SETUP_DEFAULT_REGISTERS.map((r) => ({
      name: r.name,
      currencyCode: r.currencyCode,
      balance: String(r.balance),
      color: r.color,
    }))
  )
  const [usdRate, setUsdRate] = useState(String(SETUP_DEFAULT_USD_RATE))
  const [useEur, setUseEur] = useState(false)
  const [eurRate, setEurRate] = useState(String(SETUP_DEFAULT_EUR_RATE))

  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getSetupSummary>>['data'] | null>(null)

  const setEurEnabled = (enabled: boolean) => {
    setUseEur(enabled)
    setRegisters((prev) => {
      if (enabled) {
        if (prev.some((r) => r.currencyCode === 'EUR')) return prev
        return [
          ...prev,
          {
            name: SETUP_DEFAULT_EUR_REGISTER.name,
            currencyCode: SETUP_DEFAULT_EUR_REGISTER.currencyCode,
            balance: '0',
            color: SETUP_DEFAULT_EUR_REGISTER.color,
          },
        ]
      }
      return prev.filter((r) => r.currencyCode !== 'EUR')
    })
  }

  useEffect(() => {
    if (initialStep > 1) {
      getSetupSummary().then((r) => {
        if (!r.success) return
        if (r.data.businessName) setBusinessName(r.data.businessName)
        if (r.data.user) {
          setUsername(r.data.user.username)
          setFullName(r.data.user.fullName)
        }
        if (r.data.registers.length > 0) {
          const mapped = r.data.registers.map((reg) => ({
            name: reg.name,
            currencyCode: reg.Currency.code,
            balance: String(Number(reg.balance)),
            color: reg.color ?? getDefaultRegisterColor(reg.Currency.code),
          }))
          setRegisters(mapped)
          setUseEur(mapped.some((reg) => reg.currencyCode === 'EUR'))
        }
        const usd = r.data.rates.find((rate) => rate.Currency.code === 'USD')
        if (usd) setUsdRate(String(Number(usd.rateToUah)))
        const eur = r.data.rates.find((rate) => rate.Currency.code === 'EUR')
        if (eur) setEurRate(String(Number(eur.rateToUah)))
      })
    }
  }, [initialStep])

  useEffect(() => {
    if (step === 3) {
      getSetupSummary().then((r) => {
        if (r.success) setSummary(r.data)
      })
    }
  }, [step])

  const handleNext = () => {
    setError('')
    startTransition(async () => {
      if (step === 1) {
        if (password || confirmPassword) {
          if (password !== confirmPassword) {
            setError('Паролі не збігаються')
            return
          }
          if (password.length < 8) {
            setError('Пароль має бути мінімум 8 символів')
            return
          }
        } else if (initialStep === 1 && completedSteps.length === 0) {
          setError('Вкажіть пароль для входу')
          return
        }
        const res = await saveSetupAccount({
          businessName,
          username,
          fullName,
          password,
        })
        if (!res.success) {
          setError(res.error)
          return
        }
        setStep(2)
        return
      }

      if (step === 2) {
        const usd = parseFloat(usdRate)
        if (!usd || usd <= 0) {
          setError('Вкажіть курс долара до гривні')
          return
        }
        if (useEur) {
          const eur = parseFloat(eurRate)
          if (!eur || eur <= 0) {
            setError('Вкажіть курс євро до гривні')
            return
          }
        }
        for (const reg of registers) {
          if (!reg.name.trim()) {
            setError('Вкажіть назву для кожної каси')
            return
          }
        }

        const res = await saveSetupFinance({
          currencyCodes: useEur ? ['USD', 'UAH', 'EUR'] : ['USD', 'UAH'],
          registers: registers.map((r) => ({
            name: r.name.trim(),
            currencyCode: r.currencyCode,
            balance: parseFloat(r.balance) || 0,
            color: r.color,
          })),
          usdRate: usd,
          eurRate: useEur ? parseFloat(eurRate) : undefined,
        })
        if (!res.success) {
          setError(res.error)
          return
        }
        setStep(3)
      }
    })
  }

  const handleFinish = () => {
    setError('')
    startTransition(async () => {
      const res = await completeSetup()
      if (res && !res.success) {
        setError(res.error)
        return
      }
      if (res?.success) {
        window.location.assign('/')
      }
    })
  }

  const progress = Math.round((step / SETUP_STEPS.length) * 100)
  const StepIcon = STEP_ICONS[step - 1]

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-surface border border-border rounded-xl shadow-elevated overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center shrink-0">
              <StepIcon className="w-5 h-5 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-textPrimary tracking-wide">
                {step === 1 ? 'Ласкаво просимо' : SETUP_STEPS[step - 1].label}
              </h1>
              <p className="text-sm text-textSecondary truncate">
                Крок {step} з {SETUP_STEPS.length} · {SETUP_STEPS[step - 1].description}
              </p>
            </div>
            <span className="text-xs text-accent font-mono shrink-0">{progress}%</span>
          </div>
          <div className="h-1.5 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-500 shadow-neon"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex gap-2 mt-3">
            {SETUP_STEPS.map((s) => {
              const done = completedSteps.includes(s.id) || s.id < step
              const active = s.id === step
              return (
                <div
                  key={s.id}
                  className={`flex-1 text-center py-1.5 rounded text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-accent/10 text-accent border border-accent/40'
                      : done
                        ? 'text-emerald-400/90 bg-emerald-500/5 border border-emerald-500/20'
                        : 'text-textSecondary/40 border border-transparent'
                  }`}
                >
                  {done && !active ? '✓ ' : ''}{s.label}
                </div>
              )
            })}
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="p-4 rounded-lg bg-accent/5 border border-accent/20 text-sm text-textSecondary leading-relaxed">
                Це первинне налаштування CRM після покупки. Займе 2–3 хвилини.
                Решту (статуси, довідники, категорії) система створить автоматично на останньому кроці.
              </div>

              <div>
                <label className={labelClass}>Назва компанії</label>
                <input
                  className={inputClass}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Auto Trade UA"
                  autoFocus
                />
                <p className="text-[11px] text-textSecondary/60 mt-1">Буде в меню та звітах</p>
              </div>

              <div className="pt-2 border-t border-border/60 space-y-4">
                <p className="text-xs font-medium text-textPrimary">Обліковий запис адміністратора</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Логін для входу</label>
                    <input
                      className={inputClass}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin"
                      autoComplete="username"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Ваше імʼя</label>
                    <input
                      className={inputClass}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Олексій"
                      autoComplete="name"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Пароль</label>
                    <input
                      className={inputClass}
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="мінімум 8 символів"
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Повторіть пароль</label>
                    <input
                      className={inputClass}
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="p-4 rounded-lg bg-accent/5 border border-accent/20 text-sm text-textSecondary leading-relaxed">
                Вкажіть курс долара та дві основні каси. За потреби увімкніть EUR — з&apos;явиться третя каса та поле курсу євро. Для кожної каси можна обрати колір.
              </div>

              <div>
                <label className={labelClass}>Курс USD на сьогодні</label>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-textSecondary whitespace-nowrap">1 USD =</span>
                  <input
                    className={`${inputClass} max-w-[120px] text-center font-mono`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={usdRate}
                    onChange={(e) => setUsdRate(e.target.value)}
                  />
                  <span className="text-sm text-textSecondary">UAH</span>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useEur}
                  onChange={(e) => setEurEnabled(e.target.checked)}
                  className="w-4 h-4 accent-cyan-400"
                />
                <span className="text-sm text-textSecondary">Використовувати EUR (єврова каса)</span>
              </label>

              {useEur && (
                <div>
                  <label className={labelClass}>Курс EUR на сьогодні</label>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-textSecondary whitespace-nowrap">1 EUR =</span>
                    <input
                      className={`${inputClass} max-w-[120px] text-center font-mono`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={eurRate}
                      onChange={(e) => setEurRate(e.target.value)}
                    />
                    <span className="text-sm text-textSecondary">UAH</span>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <label className={labelClass}>Ваші каси</label>
                {registers.map((reg, i) => (
                  <div key={i} className="p-3 rounded-lg border border-border bg-background/50 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-textSecondary/70">
                        {reg.currencyCode === 'USD'
                          ? 'Доларова'
                          : reg.currencyCode === 'EUR'
                            ? 'Єврова'
                            : 'Гривнева'} каса
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded border border-border shrink-0"
                          style={{ backgroundColor: reg.color }}
                        />
                        <span className="text-xs font-mono text-accent">{reg.currencyCode}</span>
                      </div>
                    </div>
                    <input
                      className={inputClass}
                      value={reg.name}
                      onChange={(e) => {
                        const next = [...registers]
                        next[i] = { ...reg, name: e.target.value }
                        setRegisters(next)
                      }}
                      placeholder={
                        reg.currencyCode === 'USD'
                          ? 'Доларова каса'
                          : reg.currencyCode === 'EUR'
                            ? 'Єврова каса'
                            : 'Гривнева каса'
                      }
                    />
                    <div>
                      <label className="text-[11px] text-textSecondary mb-1 block">Поточний баланс</label>
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="0.01"
                        value={reg.balance}
                        onChange={(e) => {
                          const next = [...registers]
                          next[i] = { ...reg, balance: e.target.value }
                          setRegisters(next)
                        }}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-textSecondary mb-1.5 block">Колір каси</label>
                      <RegisterColorEditor
                        compact
                        showActions={false}
                        value={reg.color}
                        onChange={(color) => {
                          const next = [...registers]
                          next[i] = { ...reg, color }
                          setRegisters(next)
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

             
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-sm text-textSecondary leading-relaxed">
                Натисніть «Запустити CRM» — система автоматично створить статуси авто, категорії витрат і базові довідники. Усе можна змінити пізніше в «Довідники» та «Налаштування».
              </div>

              {summary ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                    <SummaryRow label="Компанія" value={summary.businessName || '—'} />
                    <SummaryRow
                      label="Адміністратор"
                      value={summary.user ? `${summary.user.fullName} (@${summary.user.username})` : '—'}
                    />
                    <SummaryRow label="Каси" value={summary.registers.map((r) => r.name).join(', ') || '—'} />
                    {summary.registers.some((r) => r.color) && (
                      <div className="flex justify-between gap-4 px-4 py-2.5 text-sm border-t border-border">
                        <span className="text-textSecondary">Кольори кас</span>
                        <div className="flex flex-wrap justify-end gap-2">
                          {summary.registers.map((r) => (
                            <span key={r.id} className="inline-flex items-center gap-1.5 text-textPrimary text-xs">
                              <span
                                className="w-3 h-3 rounded border border-border shrink-0"
                                style={{ backgroundColor: r.color ?? undefined }}
                              />
                              {r.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <SummaryRow
                      label="Курс USD"
                      value={String(
                        summary.rates.find((r) => r.Currency.code === 'USD')?.rateToUah ?? usdRate
                      )}
                    />
                    {summary.rates.some((r) => r.Currency.code === 'EUR') && (
                      <SummaryRow
                        label="Курс EUR"
                        value={String(
                          summary.rates.find((r) => r.Currency.code === 'EUR')?.rateToUah ?? eurRate
                        )}
                      />
                    )}
                  </div>

                  <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                    <p className="text-xs font-medium text-textSecondary uppercase tracking-wider mb-3">
                      Буде створено автоматично
                    </p>
                    <ul className="space-y-2 text-sm text-textSecondary">
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{3 + SETUP_DEFAULT_CUSTOM_STATUSES.length} статусів авто (Куплено → Продано)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{PRESET_EXPENSE_CATEGORIES.length} категорій витрат</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>
                          {SETUP_DEFAULT_MAKES.length} марки,{' '}
                          {SETUP_DEFAULT_MAKES.reduce((n, m) => n + m.models.length, 0)} моделі та інші довідники
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>Повні права доступу для адміністратора</span>
                      </li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 text-accent animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => { setError(''); setStep((s) => Math.max(1, s - 1) as SetupStepId) }}
            disabled={step === 1 || isPending}
            className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm text-textSecondary hover:text-textPrimary border border-border disabled:opacity-30 transition-all"
          >
            <ChevronLeft className="w-4 h-4" /> Назад
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={isPending}
              className="flex items-center gap-1 px-5 py-2 rounded-lg text-sm font-semibold bg-accent/10 border border-accent text-accent hover:bg-accent hover:text-accentOn transition-all disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Далі <ChevronRight className="w-4 h-4" /></>}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={isPending || !summary}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-accent text-background hover:bg-accent/90 transition-all disabled:opacity-50 shadow-neon"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Запустити CRM <Rocket className="w-4 h-4" /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-2.5 text-sm">
      <span className="text-textSecondary">{label}</span>
      <span className="text-textPrimary font-medium text-right">{value}</span>
    </div>
  )
}
