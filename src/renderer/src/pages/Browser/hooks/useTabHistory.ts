import { useCallback, useEffect, useState } from 'react'

import { Tab } from '../types'

/**
 * 历史记录项
 */
interface HistoryItem {
  url: string
  title: string
  timestamp: number
}

/**
 * 管理标签页历史的自定义Hook
 * 负责处理标签页的历史记录（前进、后退等）
 */
export function useTabHistory(tabId: string) {
  // 历史记录
  const [history, setHistory] = useState<HistoryItem[]>([])

  // 当前位置
  const [currentIndex, setCurrentIndex] = useState(-1)

  // 从本地存储加载历史记录
  useEffect(() => {
    try {
      const historyJson = localStorage.getItem(`tab_history_${tabId}`)
      const indexJson = localStorage.getItem(`tab_history_index_${tabId}`)

      if (historyJson && indexJson) {
        const loadedHistory = JSON.parse(historyJson) as HistoryItem[]
        const loadedIndex = JSON.parse(indexJson) as number

        setHistory(loadedHistory)
        setCurrentIndex(loadedIndex)
      }
    } catch (error) {
      console.error('Failed to load tab history:', error)
    }
  }, [tabId])

  // 保存历史记录到本地存储
  useEffect(() => {
    try {
      localStorage.setItem(`tab_history_${tabId}`, JSON.stringify(history))
      localStorage.setItem(`tab_history_index_${tabId}`, JSON.stringify(currentIndex))
    } catch (error) {
      console.error('Failed to save tab history:', error)
    }
  }, [tabId, history, currentIndex])

  /**
   * 添加历史记录
   * @param tab 标签页对象
   */
  const addHistory = useCallback(
    (tab: Tab) => {
      setHistory((prevHistory) => {
        // 如果当前位置不是最后一个，移除后面的历史记录
        const newHistory = prevHistory.slice(0, currentIndex + 1)

        // 添加新的历史记录
        newHistory.push({
          url: tab.url,
          title: tab.title || tab.url,
          timestamp: Date.now()
        })

        return newHistory
      })

      setCurrentIndex((prevIndex) => prevIndex + 1)
    },
    [currentIndex]
  )

  /**
   * 获取上一个历史记录
   * @returns 上一个历史记录项
   */
  const getPrevious = useCallback((): HistoryItem | null => {
    if (currentIndex <= 0) {
      return null
    }

    return history[currentIndex - 1]
  }, [history, currentIndex])

  /**
   * 获取下一个历史记录
   * @returns 下一个历史记录项
   */
  const getNext = useCallback((): HistoryItem | null => {
    if (currentIndex >= history.length - 1) {
      return null
    }

    return history[currentIndex + 1]
  }, [history, currentIndex])

  /**
   * 后退
   * @returns 上一个URL
   */
  const goBack = useCallback((): string | null => {
    const prevItem = getPrevious()

    if (prevItem) {
      setCurrentIndex((prevIndex) => prevIndex - 1)
      return prevItem.url
    }

    return null
  }, [getPrevious])

  /**
   * 前进
   * @returns 下一个URL
   */
  const goForward = useCallback((): string | null => {
    const nextItem = getNext()

    if (nextItem) {
      setCurrentIndex((prevIndex) => prevIndex + 1)
      return nextItem.url
    }

    return null
  }, [getNext])

  /**
   * 清除历史记录
   */
  const clearHistory = useCallback(() => {
    setHistory([])
    setCurrentIndex(-1)

    // 清除本地存储
    localStorage.removeItem(`tab_history_${tabId}`)
    localStorage.removeItem(`tab_history_index_${tabId}`)
  }, [tabId])

  return {
    history,
    currentIndex,
    canGoBack: currentIndex > 0,
    canGoForward: currentIndex < history.length - 1,
    addHistory,
    goBack,
    goForward,
    clearHistory
  }
}
