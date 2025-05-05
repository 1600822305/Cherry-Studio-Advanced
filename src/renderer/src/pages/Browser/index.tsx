import './styles/ChatSidebarFix.css' // 导入修复聊天侧边栏按钮点击问题的CSS

import { WebviewTag } from 'electron'
import React, { useEffect, useRef, useState } from 'react'

// import { useLocation } from 'react-router-dom' // 暂时未使用
import AnimatedBrowserTabs from './components/AnimatedBrowserTabs'
import BookmarkBar from './components/BookmarkBar'
import BookmarkManager from './components/BookmarkManager'
import NavBar from './components/NavBar'
import WebviewContainer from './components/WebviewContainer'
import { useAnimatedTabs } from './hooks/useAnimatedTabs'
import { useGoogleLogin } from './hooks/useGoogleLogin'
import { useNavigation } from './hooks/useNavigation'
import { useWebviewEvents } from './hooks/useWebviewEvents'
import { BrowserContainer } from './styles/BrowserStyles'

// 创建全局状态管理对象，用于共享聊天侧边栏状态
export const ChatSidebarState = {
  isOpen: false,
  isExpanded: false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setIsOpen: (_isOpen: boolean) => { },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setIsExpanded: (_isExpanded: boolean) => { }
}

const Browser: React.FC = () => {
  // 使用增强的标签页管理钩子
  const {
    tabs,
    activeTabId,
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
    // 链接打开方式相关
    linkOpenMode,
    toggleLinkOpenMode
  } = useAnimatedTabs()

  // 获取当前活动选项卡
  const activeTab = tabs.find((tab: { id: string }) => tab.id === activeTabId) || tabs[0]

  // 使用对象存储多个webview引用 - 使用useRef确保在组件重新渲染时保持引用
  const webviewRefs = useRef<Record<string, WebviewTag | null>>({})

  // 使用useRef保存webview的会话状态
  const webviewSessionsRef = useRef<Record<string, boolean>>({})

  // 使用useRef保存事件监听器清理函数
  const cleanupFunctionsRef = useRef<Record<string, () => void>>({})

  // 获取当前活动的webview引用
  const webviewRef = {
    current: webviewRefs.current[activeTabId] || null
  } as React.RefObject<WebviewTag>

  // 书签管理器状态
  const [showBookmarkManager, setShowBookmarkManager] = useState(false)

  // 聊天侧边栏状态
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false)
  const [chatSidebarExpanded, setChatSidebarExpanded] = useState(false)

  // 更新全局状态管理对象
  useEffect(() => {
    ChatSidebarState.isOpen = chatSidebarOpen
    ChatSidebarState.isExpanded = chatSidebarExpanded
    ChatSidebarState.setIsOpen = setChatSidebarOpen
    ChatSidebarState.setIsExpanded = setChatSidebarExpanded
  }, [chatSidebarOpen, chatSidebarExpanded])

  // 使用导航钩子
  const {
    currentUrl,
    setCurrentUrl,
    displayUrl,
    setDisplayUrl,
    canGoBack,
    setCanGoBack,
    canGoForward,
    setCanGoForward,
    isLoading,
    setIsLoading,
    navigationError,
    handleUrlChange,
    handleUrlSubmit,
    handleGoBack,
    handleGoForward,
    handleReload,
    handleStopLoading,
    handleHome,
    handleOpenDevTools,
    handleOpenExternal,
    handleClearData
  } = useNavigation(activeTab, webviewRef, updateTabInfo)

  // 使用Webview事件处理钩子
  const { setupWebviewListeners } = useWebviewEvents()

  // 包装setupWebviewListeners以传递所需的参数
  const setupWebviewListenersWrapper = (webview: WebviewTag, tabId: string) => {
    return setupWebviewListeners(
      webview,
      tabId,
      activeTabId,
      updateTabInfo,
      setIsLoading,
      setCurrentUrl,
      setCanGoBack,
      setCanGoForward,
      openUrlInTab,
      setDisplayUrl, // 传递setDisplayUrl函数
      linkOpenMode // 传递链接打开方式
    )
  }

  // 使用Google登录钩子
  const { showGoogleLoginTip, handleCloseGoogleTip, handleGoogleLogin } = useGoogleLogin(
    currentUrl,
    activeTabId,
    webviewRef
  )

  // 处理IPC消息 - 标签页管理
  useEffect(() => {
    const ipcRenderer = window.electron?.ipcRenderer
    if (!ipcRenderer) return

    // 处理切换标签页请求
    const switchTabListener = ipcRenderer.on('browser:switchTabRequested', (tabIndex: number) => {
      console.log('收到切换标签页请求:', tabIndex)
      if (tabIndex >= 0 && tabIndex < tabs.length) {
        const targetTabId = tabs[tabIndex].id
        handleTabChange(targetTabId)
      }
    })

    // 处理列出标签页请求
    const listTabsListener = ipcRenderer.on('browser:listTabsRequested', () => {
      console.log('收到列出标签页请求')
      const tabsInfo = tabs.map((tab, index) => ({
        index,
        id: tab.id,
        title: tab.title,
        url: tab.url,
        isActive: tab.id === activeTabId
      }))

      // 使用invoke而不是sendMessage
      ipcRenderer.invoke('browser:tabsListResponse', {
        success: true,
        tabs: tabsInfo,
        activeTabIndex: tabs.findIndex((tab) => tab.id === activeTabId)
      })
    })

    // 处理关闭标签页请求
    const closeTabListener = ipcRenderer.on('browser:closeTabRequested', (tabIndex: number) => {
      console.log('收到关闭标签页请求:', tabIndex)
      if (tabIndex >= 0 && tabIndex < tabs.length) {
        // 创建一个合成事件以满足handleCloseTab的参数要求
        const syntheticEvent = {
          stopPropagation: () => { }
        } as React.MouseEvent<HTMLElement>

        handleCloseTab(tabs[tabIndex].id, syntheticEvent)
      }
    })

    // 处理创建标签页请求
    const createTabListener = ipcRenderer.on('browser:createTabRequested', (args: { url: string; title?: string }) => {
      console.log('收到创建标签页请求:', args)
      const { url, title } = args
      const newTabId = handleAddTab(url, title || url)

      // 使用invoke而不是sendMessage
      ipcRenderer.invoke('browser:createTabResponse', {
        success: true,
        tabId: newTabId,
        index: tabs.length // 新标签页将被添加到末尾
      })
    })

    // 清理函数
    return () => {
      switchTabListener()
      listTabsListener()
      closeTabListener()
      createTabListener()
    }
  }, [tabs, activeTabId, handleTabChange, handleCloseTab, handleAddTab])

  // 在组件挂载时同步一次cookie，确保会话共享
  useEffect(() => {
    // 同步cookie
    console.log('Syncing cookies on component mount...')
    if (window.electron && window.electron.ipcRenderer) {
      window.electron.ipcRenderer
        .invoke('browser:syncCookies')
        .then((result: any) => {
          console.log('Initial cookie sync result:', result)
        })
        .catch((error: any) => {
          console.error('Initial cookie sync error:', error)
        })
    }
  }, [])

  // 处理打开书签管理器
  const handleOpenBookmarkManager = () => {
    setShowBookmarkManager(true)
  }

  // 处理关闭书签管理器
  const handleCloseBookmarkManager = () => {
    setShowBookmarkManager(false)
  }

  return (
    <BrowserContainer>
      <NavBar
        currentUrl={currentUrl}
        displayUrl={displayUrl}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        isLoading={isLoading}
        navigationError={navigationError}
        linkOpenMode={linkOpenMode}
        title={activeTab?.title || ''}
        favicon={activeTab?.favicon}
        activeWebview={webviewRef}
        onUrlChange={handleUrlChange}
        onUrlSubmit={handleUrlSubmit}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onReload={handleReload}
        onStopLoading={handleStopLoading}
        onHome={handleHome}
        onOpenDevTools={handleOpenDevTools}
        onOpenExternal={handleOpenExternal}
        onClearData={handleClearData}
        onToggleLinkOpenMode={toggleLinkOpenMode}
        onOpenBookmarkManager={handleOpenBookmarkManager}
      />

      <BookmarkBar onOpenUrl={openUrlInTab} />

      <AnimatedBrowserTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onTabChange={handleTabChange}
        onAddTab={() => handleAddTab()}
        onCloseTab={handleCloseTab}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        draggedTabIndex={draggedTabIndex}
        dragOverTabIndex={dragOverTabIndex}
        animationDirection={animationDirection}
      />

      <WebviewContainer
        tabs={tabs}
        activeTabId={activeTabId}
        showGoogleLoginTip={showGoogleLoginTip}
        webviewRefs={webviewRefs}
        webviewSessionsRef={webviewSessionsRef}
        cleanupFunctionsRef={cleanupFunctionsRef}
        setupWebviewListeners={setupWebviewListenersWrapper}
        onCloseGoogleTip={handleCloseGoogleTip}
        onGoogleLogin={handleGoogleLogin}
        onClearData={handleClearData}
        chatSidebarOpen={chatSidebarOpen}
        chatSidebarExpanded={chatSidebarExpanded}
      />

      {/* 书签管理器 */}
      {showBookmarkManager && <BookmarkManager onOpenUrl={openUrlInTab} onClose={handleCloseBookmarkManager} />}
    </BrowserContainer>
  )
}

export default Browser
