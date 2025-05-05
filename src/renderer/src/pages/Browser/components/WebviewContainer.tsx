import { WebviewTag } from 'electron'
import React, { useCallback } from 'react'

import { WebviewContainer as StyledWebviewContainer } from '../styles/BrowserStyles'
import { Tab } from '../types'
import GoogleLoginTip from './GoogleLoginTip'
import WebviewItem from './WebviewItem'

interface WebviewContainerProps {
  tabs: Tab[]
  activeTabId: string
  showGoogleLoginTip: boolean
  webviewRefs: React.MutableRefObject<Record<string, WebviewTag | null>>
  webviewSessionsRef: React.MutableRefObject<Record<string, boolean>>
  cleanupFunctionsRef: React.MutableRefObject<Record<string, () => void>>
  setupWebviewListeners: (webview: WebviewTag, tabId: string) => () => void
  onCloseGoogleTip: () => void
  onGoogleLogin: () => void
  onClearData: () => void
  chatSidebarOpen?: boolean
  chatSidebarExpanded?: boolean
}

const WebviewContainer: React.FC<WebviewContainerProps> = ({
  tabs,
  activeTabId,
  showGoogleLoginTip,
  webviewRefs,
  webviewSessionsRef,
  cleanupFunctionsRef,
  setupWebviewListeners,
  onCloseGoogleTip,
  onGoogleLogin,
  onClearData,
  chatSidebarOpen = false,
  chatSidebarExpanded = false
}) => {
  // 处理webview初始化/销毁
  const handleWebviewInit = useCallback(
    (tabId: string, initialized: boolean) => {
      webviewSessionsRef.current[tabId] = initialized

      // 如果webview被销毁，清理相关资源
      if (!initialized) {
        if (cleanupFunctionsRef.current[tabId]) {
          delete cleanupFunctionsRef.current[tabId]
        }
      }
    },
    [webviewSessionsRef, cleanupFunctionsRef]
  )

  return (
    <StyledWebviewContainer $chatSidebarOpen={chatSidebarOpen} $chatSidebarExpanded={chatSidebarExpanded}>
      {showGoogleLoginTip && (
        <GoogleLoginTip onClose={onCloseGoogleTip} onUseGoogleMobile={onGoogleLogin} onClearData={onClearData} />
      )}

      {/* 为每个选项卡创建一个webview */}
      {tabs.map((tab) => (
        <WebviewItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          // 直接传递 webviewRefs 对象
          webviewRefs={webviewRefs}
          cleanupFunctionsRef={cleanupFunctionsRef}
          setupWebviewListeners={setupWebviewListeners}
          onWebviewInit={handleWebviewInit}
          updateTabInfo={(tabId, updates) => console.log('Update tab info:', tabId, updates)}
          reloadTab={(tabId) => console.log('Reload tab:', tabId)}
          goBack={(tabId) => console.log('Go back:', tabId)}
        />
      ))}
    </StyledWebviewContainer>
  )
}

export default WebviewContainer
