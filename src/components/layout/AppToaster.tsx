'use client'

import { Toaster } from 'sonner'
import { useTheme } from './ThemeProvider'

export default function AppToaster() {
  const { theme } = useTheme()

  return (
    <Toaster
      position="bottom-right"
      theme={theme}
      toastOptions={{
        style: {
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
        },
      }}
    />
  )
}
