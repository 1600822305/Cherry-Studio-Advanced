import { WebviewTag } from 'electron'
import React, { useEffect, useRef } from 'react'

import { WebviewErrorType } from '../components/WebviewError'
import { userAgent } from '../hooks/useWebviewEvents'
import { Tab } from '../types'
import { setupWebviewBooleanAttributes } from '../utils/webviewUtils'
import WebviewErrorContainer from './WebviewErrorContainer'

interface WebviewItemProps {
  tab: Tab
  isActive: boolean
  webviewRefs: React.MutableRefObject<Record<string, WebviewTag | null>> // 修改 prop 名称
  cleanupFunctionsRef: React.MutableRefObject<Record<string, () => void>>
  setupWebviewListeners: (webview: WebviewTag, tabId: string) => () => void
  onWebviewInit: (tabId: string, initialized: boolean) => void
  updateTabInfo: (tabId: string, updates: Partial<Tab>) => void
  reloadTab: (tabId: string) => void
  goBack: (tabId: string) => void
}

const WebviewItem: React.FC<WebviewItemProps> = ({
  tab,
  isActive,
  webviewRefs, // 修改 prop 名称
  cleanupFunctionsRef,
  setupWebviewListeners,
  onWebviewInit,
  updateTabInfo,
  reloadTab,
  goBack
}) => {
  // 使用ref跟踪监听器清理函数
  const cleanupRef = useRef<(() => void) | null>(null)

  // 使用ref跟踪是否已经设置了监听器
  const hasSetupListenersRef = useRef(false)

  // 当组件卸载时清理监听器
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
    }
  }, [])

  return (
    <div className={`webview-wrapper ${isActive ? 'active' : ''}`}>
      {/* Webview元素 */}
      <webview
        src={tab.url}
        ref={(el: any) => {
          if (el) {
            // 保存webview引用到对应的tabId下
            webviewRefs.current[tab.id] = el as WebviewTag

            // 只有在尚未设置监听器时才设置
            if (!hasSetupListenersRef.current) {
              // console.log(`[WebviewItem] Setting up listeners for tab: ${tab.id}`) // 注释掉日志

              // 设置事件监听器
              const cleanup = setupWebviewListeners(el as WebviewTag, tab.id)

              // 保存清理函数到组件内部ref
              if (cleanupRef.current) {
                cleanupRef.current()
              }
              cleanupRef.current = cleanup

              // 同时保存到全局清理函数ref
              cleanupFunctionsRef.current[tab.id] = cleanup

              // 标记为已设置监听器
              hasSetupListenersRef.current = true

              // 通知父组件webview已初始化
              onWebviewInit(tab.id, true)
            }

            // 手动设置布尔属性
            setupWebviewBooleanAttributes(el as WebviewTag)
          } else {
            // DOM元素被移除，清理事件监听器
            if (cleanupRef.current) {
              cleanupRef.current()
              cleanupRef.current = null
            }

            // 重置监听器状态
            hasSetupListenersRef.current = false

            // 通知父组件webview已销毁
            onWebviewInit(tab.id, false)

            // 清除webview引用
            webviewRefs.current[tab.id] = null
          }
        }}
        // 使用字符串属性来避免React警告
        partition="persist:browser"
        useragent={userAgent}
        webpreferences="contextIsolation=no, javascript=yes, webgl=yes, webaudio=yes, allowRunningInsecureContent=yes, nodeIntegration=yes, enableRemoteModule=yes"
        // 使用data-*属性来标记需要设置的布尔属性
        data-allowpopups="true"
        data-disablewebsecurity="true"
        data-plugins="true"
        data-enableblinkfeatures="CSSVariables,KeyboardEventKey"
      />

      {/* 错误显示容器 - 类型断言处理可选属性 */}
      {(tab as any).hasError && (tab as any).errorType && (
        <WebviewErrorContainer
          tabId={tab.id}
          hasError={!!(tab as any).hasError}
          errorType={(tab as any).errorType as WebviewErrorType}
          errorData={(tab as any).errorData || {}}
          updateTabInfo={updateTabInfo}
          onReload={reloadTab}
          onGoBack={goBack}
        />
      )}
    </div>
  )
}

export default WebviewItem
