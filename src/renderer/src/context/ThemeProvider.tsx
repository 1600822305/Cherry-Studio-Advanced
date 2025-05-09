import { isMac } from '@renderer/config/constant'
import { useSettings } from '@renderer/hooks/useSettings'
import { ThemeMode } from '@renderer/types'
import { IpcChannel } from '@shared/IpcChannel'
import React, { createContext, PropsWithChildren, use, useEffect, useState } from 'react'

interface ThemeContextType {
  theme: ThemeMode
  settingTheme: ThemeMode
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: ThemeMode.light,
  settingTheme: ThemeMode.light,
  toggleTheme: () => {}
})

interface ThemeProviderProps extends PropsWithChildren {
  defaultTheme?: ThemeMode
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children, defaultTheme }) => {
  const { theme, setTheme } = useSettings()
  const [_theme, _setTheme] = useState(theme)

  const toggleTheme = () => {
    if (theme === ThemeMode.light) {
      setTheme(ThemeMode.dark)
    } else if (theme === ThemeMode.dark) {
      setTheme(ThemeMode.auto)
    } else {
      setTheme(ThemeMode.light)
    }
  }

  useEffect((): any => {
    if (theme === ThemeMode.auto || defaultTheme === ThemeMode.auto) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      _setTheme(mediaQuery.matches ? ThemeMode.dark : ThemeMode.light)
      const handleChange = (e: MediaQueryListEvent) => _setTheme(e.matches ? ThemeMode.dark : ThemeMode.light)
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    } else {
      _setTheme(theme)
    }
  }, [defaultTheme, theme])

  useEffect(() => {
    document.body.setAttribute('theme-mode', _theme)
    // 移除迷你窗口的条件判断，让所有窗口都能设置主题
    window.api?.setTheme(theme)
  }, [_theme])

  useEffect(() => {
    document.body.setAttribute('os', isMac ? 'mac' : 'windows')

    // listen theme change from main process from other windows
    const themeChangeListenerRemover = window.electron.ipcRenderer.on(IpcChannel.ThemeChange, (_, newTheme) => {
      setTheme(newTheme)
    })
    return () => {
      themeChangeListenerRemover()
    }
  })

  return <ThemeContext value={{ theme: _theme, settingTheme: theme, toggleTheme }}>{children}</ThemeContext>
}

export const useTheme = () => use(ThemeContext)
