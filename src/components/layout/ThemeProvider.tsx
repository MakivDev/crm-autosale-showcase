'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  THEME_COOKIE,
  THEME_STORAGE_KEY,
  THEME_COLORS,
  resolveTheme,
  type Theme,
} from '@/lib/theme'

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function persistTheme(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme};path=/;max-age=31536000;SameSite=Lax`
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {}
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')

  const themeColor = THEME_COLORS[theme]
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', themeColor)

  const faviconHref = theme === 'dark' ? '/favicon-dark-32.png' : '/favicon-light-32.png'
  let favicon = document.querySelector<HTMLLinkElement>('link[data-theme-favicon]')
  if (!favicon) {
    favicon = document.createElement('link')
    favicon.rel = 'icon'
    favicon.type = 'image/png'
    favicon.sizes = '32x32'
    favicon.setAttribute('data-theme-favicon', 'true')
    document.head.appendChild(favicon)
  }
  favicon.href = faviconHref

  const appleHref = theme === 'dark' ? '/apple-touch-icon-dark.png' : '/apple-touch-icon-light.png'
  let apple = document.querySelector<HTMLLinkElement>('link[data-theme-apple]')
  if (!apple) {
    apple = document.createElement('link')
    apple.rel = 'apple-touch-icon'
    apple.setAttribute('data-theme-apple', 'true')
    document.head.appendChild(apple)
  }
  apple.href = appleHref
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode
  initialTheme: Theme
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)

  const setTheme = useCallback((next: Theme) => {
    const resolved = resolveTheme(next)
    setThemeState(resolved)
    persistTheme(resolved)
    applyTheme(resolved)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      persistTheme(next)
      applyTheme(next)
      return next
    })
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
