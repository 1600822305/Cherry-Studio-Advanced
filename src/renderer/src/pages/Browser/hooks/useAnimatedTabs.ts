import { useCallback, useEffect, useState } from 'react'

import { Tab } from '../types'
import { loadTabsFromStorage, saveTabsToStorage } from '../utils/storage'

export const useAnimatedTabs = () => {
  // 基础标签页状态管理
  const initialTabState = loadTabsFromStorage() // 注释掉日志
  const [tabs, setTabs] = useState<Tab[]>(initialTabState.tabs)
  const [activeTabId, setActiveTabId] = useState(initialTabState.activeTabId)

  // 拖拽相关状态
  const [draggedTabIndex, setDraggedTabIndex] = useState<number | null>(null)
  const [dragOverTabIndex, setDragOverTabIndex] = useState<number | null>(null)

  // 动画相关状态
  const [animationDirection, setAnimationDirection] = useState(0) // 1: 向右, -1: 向左, 0: 无动画

  // 链接打开方式状态 - 从localStorage加载或使用默认值
  const [linkOpenMode, setLinkOpenMode] = useState<'newTab' | 'newWindow'>(() => {
    try {
      const savedMode = localStorage.getItem('browser_link_open_mode')
      return savedMode === 'newTab' || savedMode === 'newWindow' ? savedMode : 'newTab'
    } catch (error) {
      console.error('Failed to load link open mode from storage:', error)
      return 'newTab'
    }
  })

  // 更新选项卡信息
  const updateTabInfo = useCallback(
    (tabId: string, updates: Partial<Tab>) => {
      setTabs((prevTabs) => {
        const newTabs = prevTabs.map((tab) => (tab.id === tabId ? { ...tab, ...updates } : tab))
        saveTabsToStorage(newTabs, activeTabId)
        return newTabs
      })
    },
    [activeTabId]
  )

  // 通用的打开URL函数
  const openUrlInTab = useCallback(
    (url: string, inNewTab: boolean = false, title: string = '加载中...') => {
      console.log(`[openUrlInTab] Called with url: ${url}, inNewTab: ${inNewTab}, title: ${title}`)

      // 只有当url存在时才执行后续逻辑
      if (!url) {
        console.warn('[openUrlInTab] Called with undefined or empty URL, ignoring.')
        return
      }

      if (inNewTab) {
        // 在新标签页中打开链接
        const newTabId = `tab-${Date.now()}`
        console.log(`[openUrlInTab] Creating new tab with id: ${newTabId} for url: ${url}`)
        const newTab: Tab = {
          id: newTabId,
          title: title,
          url: url,
          isLoading: true,
          canGoBack: false,
          canGoForward: false
        }

        // 创建新的选项卡数组，确保不修改原数组
        const newTabs = [...tabs, newTab]

        // 更新状态
        setTabs(newTabs)
        setActiveTabId(newTabId)
        setAnimationDirection(1) // 向右动画

        // 保存到本地存储
        saveTabsToStorage(newTabs, newTabId)
      } else {
        // 在当前标签页中打开链接
        updateTabInfo(activeTabId, { url: url })
      }
    },
    [tabs, activeTabId, updateTabInfo]
  )

  // 添加新标签页
  const handleAddTab = useCallback(
    (url: string = 'https://www.google.com', title: string = '加载中...') => {
      const newTabId = `tab-${Date.now()}`
      const newTab: Tab = {
        id: newTabId,
        title: title,
        url: url,
        isLoading: true,
        canGoBack: false,
        canGoForward: false
      }

      const newTabs = [...tabs, newTab]
      setTabs(newTabs)
      setActiveTabId(newTabId)
      setAnimationDirection(1) // 向右动画

      // 保存到本地存储
      saveTabsToStorage(newTabs, newTabId)

      return newTabId
    },
    [tabs]
  )

  // 关闭标签页
  const handleCloseTab = useCallback(
    (tabId: string, e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation() // 防止触发选项卡切换

      if (tabs.length === 1) {
        // 如果只有一个选项卡，创建一个新的空白选项卡
        handleAddTab()
        return // 已经在handleAddTab中保存了状态，这里直接返回
      }

      // 计算新的活动选项卡ID
      let newActiveTabId = activeTabId
      const currentIndex = tabs.findIndex((tab) => tab.id === tabId)

      if (tabId === activeTabId) {
        const newActiveIndex = currentIndex === 0 ? 1 : currentIndex - 1
        newActiveTabId = tabs[newActiveIndex].id
        setActiveTabId(newActiveTabId)
        setAnimationDirection(-1) // 向左动画
      }

      // 从选项卡列表中移除
      const newTabs = tabs.filter((tab) => tab.id !== tabId)
      setTabs(newTabs)

      // 保存到本地存储 - 确保不包含已关闭的选项卡
      saveTabsToStorage(newTabs, newActiveTabId)
    },
    [tabs, activeTabId, handleAddTab]
  )

  // 切换标签页
  const handleTabChange = useCallback(
    (newActiveTabId: string) => {
      const oldIndex = tabs.findIndex((tab) => tab.id === activeTabId)
      const newIndex = tabs.findIndex((tab) => tab.id === newActiveTabId)

      // 设置动画方向
      setAnimationDirection(newIndex > oldIndex ? 1 : -1)

      // 更新活动标签页ID
      setActiveTabId(newActiveTabId)

      // 保存到本地存储
      saveTabsToStorage(tabs, newActiveTabId)
    },
    [tabs, activeTabId]
  )

  // 拖拽开始
  const handleDragStart = useCallback((index: number) => {
    setDraggedTabIndex(index)
  }, [])

  // 拖拽结束
  const handleDragEnd = useCallback(() => {
    if (draggedTabIndex !== null && dragOverTabIndex !== null && draggedTabIndex !== dragOverTabIndex) {
      // 重新排序标签页
      const newTabs = [...tabs]
      const [draggedTab] = newTabs.splice(draggedTabIndex, 1)
      newTabs.splice(dragOverTabIndex, 0, draggedTab)

      setTabs(newTabs)
      saveTabsToStorage(newTabs, activeTabId)
    }

    setDraggedTabIndex(null)
    setDragOverTabIndex(null)
  }, [tabs, activeTabId, draggedTabIndex, dragOverTabIndex])

  // 拖拽经过
  const handleDragOver = useCallback(
    (index: number) => {
      if (draggedTabIndex !== null && index !== dragOverTabIndex) {
        setDragOverTabIndex(index)
      }
    },
    [draggedTabIndex, dragOverTabIndex]
  )

  // 切换链接打开方式
  const toggleLinkOpenMode = useCallback(() => {
    setLinkOpenMode((prevMode) => {
      const newMode = prevMode === 'newTab' ? 'newWindow' : 'newTab'
      try {
        // 保存新的设置到localStorage
        localStorage.setItem('browser_link_open_mode', newMode)
        console.log(`[Browser] 链接打开方式已切换为: ${newMode}`)
      } catch (error) {
        console.error('Failed to save link open mode to storage:', error)
      }
      return newMode
    })
  }, [])

  // 在组件挂载和卸载时处理webview会话
  useEffect(() => {
    // 组件卸载时保存状态
    return () => {
      saveTabsToStorage(tabs, activeTabId)
      // 确保保存链接打开方式设置
      try {
        localStorage.setItem('browser_link_open_mode', linkOpenMode)
      } catch (error) {
        console.error('Failed to save link open mode on unmount:', error)
      }
    }
  }, [tabs, activeTabId, linkOpenMode])

  return {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    updateTabInfo,
    openUrlInTab,
    handleAddTab,
    handleCloseTab,
    handleTabChange,
    // 拖拽相关
    draggedTabIndex,
    dragOverTabIndex,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    // 动画相关
    animationDirection,
    setAnimationDirection,
    // 链接打开方式相关
    linkOpenMode,
    toggleLinkOpenMode
  }
}
