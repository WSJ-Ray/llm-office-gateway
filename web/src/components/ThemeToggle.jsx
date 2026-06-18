import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

const KEY = 'theme'

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(KEY)
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(KEY, theme)
  }, [theme])

  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  return (
    <button
      onClick={toggle}
      aria-label="切换主题"
      title={`切换到${theme === 'dark' ? '浅色' : '深色'}主题`}
      className="w-9 h-9 flex items-center justify-center rounded-lg bg-bg-elevated border border-border text-text-secondary hover:text-text-primary"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
