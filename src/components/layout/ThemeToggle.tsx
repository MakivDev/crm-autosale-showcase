'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from './ThemeProvider'

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Увімкнути світлу тему' : 'Увімкнути темну тему'}
      className={`flex items-center gap-3 rounded-md border border-transparent text-textSecondary transition-all duration-300 hover:bg-surfaceHover hover:text-textPrimary ${
        compact
          ? 'min-w-[44px] min-h-[44px] justify-center px-2'
          : 'w-full px-3 py-2.5 min-h-[44px]'
      }`}
    >
      {isDark ? <Sun className="w-5 h-5 shrink-0" /> : <Moon className="w-5 h-5 shrink-0" />}
      {!compact && (
        <span className="text-sm font-medium">{isDark ? 'Світла тема' : 'Темна тема'}</span>
      )}
    </button>
  )
}
