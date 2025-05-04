import { Tab } from '../types'

const TABS_STORAGE_KEY = 'browser_tabs'
const ACTIVE_TAB_STORAGE_KEY = 'browser_active_tab'

/**
 * 保存标签页到本地存储
 * @param tabs 标签页数组
 * @param activeTabId 活动标签页ID
 */
export function saveTabs(tabs: Tab[], activeTabId: string): void {
  try {
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs))
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabId)
    console.log(`Saved tabs to storage: ${tabs.length} tabs, active tab: ${activeTabId}`)
  } catch (error) {
    console.error('Failed to save tabs to storage:', error)
  }
}

/**
 * 从本地存储加载标签页
 * @returns 标签页数组和活动标签页ID
 */
export function loadTabs(): { tabs: Tab[]; activeTabId: string } {
  try {
    const tabsJson = localStorage.getItem(TABS_STORAGE_KEY)
    const activeTabId = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)

    if (tabsJson && activeTabId) {
      const tabs = JSON.parse(tabsJson) as Tab[]
      console.log(`Loaded tabs from storage: ${tabs.length} tabs, active tab: ${activeTabId}`)
      return { tabs, activeTabId }
    }
  } catch (error) {
    console.error('Failed to load tabs from storage:', error)
  }

  // 默认值
  const defaultTab: Tab = {
    id: `tab-${Date.now()}`,
    url: 'https://www.google.com',
    title: 'New Tab',
    favicon: '',
    isLoading: true,
    canGoBack: false,
    canGoForward: false
  }

  return {
    tabs: [defaultTab],
    activeTabId: defaultTab.id
  }
}

/**
 * 清除本地存储中的标签页
 */
export function clearTabs(): void {
  try {
    localStorage.removeItem(TABS_STORAGE_KEY)
    localStorage.removeItem(ACTIVE_TAB_STORAGE_KEY)
    console.log('Cleared tabs from storage')
  } catch (error) {
    console.error('Failed to clear tabs from storage:', error)
  }
}
