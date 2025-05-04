import { WebviewTag } from 'electron'
import { useCallback } from 'react'

/**
 * 自定义Hook，用于处理单个webview的事件
 * 将事件处理逻辑与组件渲染逻辑分离
 */
export function useWebviewEventHandler(
  setupWebviewListeners: (webview: WebviewTag, tabId: string) => () => void,
  cleanupFunctionsRef: React.MutableRefObject<Record<string, () => void>>
) {
  /**
   * 设置webview事件监听器
   * @param webview webview元素
   * @param tabId 标签页ID
   * @returns 清理函数
   */
  const setupListeners = useCallback(
    (webview: WebviewTag, tabId: string) => {
      console.log(`[useWebviewEventHandler] Setting up listeners for tab: ${tabId}`)

      // 如果已经有监听器，先清理
      if (cleanupFunctionsRef.current[tabId]) {
        cleanupFunctionsRef.current[tabId]()
        delete cleanupFunctionsRef.current[tabId]
      }

      // 设置新的事件监听器
      const cleanup = setupWebviewListeners(webview, tabId)
      cleanupFunctionsRef.current[tabId] = cleanup

      return cleanup
    },
    [setupWebviewListeners, cleanupFunctionsRef]
  )

  /**
   * 清理webview事件监听器
   * @param tabId 标签页ID
   */
  const cleanupListeners = useCallback(
    (tabId: string) => {
      if (cleanupFunctionsRef.current[tabId]) {
        console.log(`[useWebviewEventHandler] Cleaning up listeners for tab: ${tabId}`)
        cleanupFunctionsRef.current[tabId]()
        delete cleanupFunctionsRef.current[tabId]
      }
    },
    [cleanupFunctionsRef]
  )

  return {
    setupListeners,
    cleanupListeners
  }
}
