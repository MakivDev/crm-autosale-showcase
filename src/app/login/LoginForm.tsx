'use client'

import { useActionState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { login } from '@/actions/auth'
import { Suspense } from 'react'
import ThemeToggle from '@/components/layout/ThemeToggle'

function LoginFormInner() {
  const [state, formAction, isPending] = useActionState(login, null)
  const searchParams = useSearchParams()
  const passwordChanged = searchParams.get('changed') === '1'

  useEffect(() => {
    if (state?.success) {
      window.location.assign('/')
    }
  }, [state?.success])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle compact />
      </div>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-accent/10 border border-accent/30 shadow-neon mb-4">
            <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-widest text-textPrimary uppercase">
            CRM AutoSale
          </h1>
          <p className="text-sm text-textSecondary mt-1 tracking-wider">Система управління авто</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-6 shadow-elevated">
          {passwordChanged && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm text-center">
              Пароль змінено. Увійдіть знову.
            </div>
          )}

          {state?.error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center">
              {state.error}
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-textSecondary uppercase tracking-wider mb-1.5">
                Логін
              </label>
              <input
                type="text"
                name="username"
                required
                autoComplete="username"
                className="w-full bg-background border border-border rounded-lg px-4 py-3 text-textPrimary text-sm placeholder:text-textSecondary/40 focus:outline-none focus:border-accent focus:shadow-neon transition-all"
                placeholder="admin"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-textSecondary uppercase tracking-wider mb-1.5">
                Пароль
              </label>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full bg-background border border-border rounded-lg px-4 py-3 text-textPrimary text-sm placeholder:text-textSecondary/40 focus:outline-none focus:border-accent focus:shadow-neon transition-all"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full mt-2 bg-accent/10 border border-accent text-accent py-3 rounded-lg font-semibold tracking-wider uppercase text-sm hover:bg-accent hover:text-accentOn hover:shadow-neon transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Вхід...' : 'Увійти'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function LoginForm() {
  return (
    <Suspense fallback={null}>
      <LoginFormInner />
    </Suspense>
  )
}
