import { initBrowserChatAssistant } from '@renderer/services/BrowserChatSyncService'
import { useEffect } from 'react'

/**
 * 浏览器聊天同步初始化组件
 * 用于在应用启动时初始化浏览器聊天助手
 */
const BrowserChatSyncInitializer = () => {
  useEffect(() => {
    // 应用启动时初始化浏览器聊天助手
    const initBrowserChat = async () => {
      try {
        await initBrowserChatAssistant()
        console.log('浏览器聊天助手初始化成功')
      } catch (error) {
        console.error('浏览器聊天助手初始化失败:', error)
      }
    }

    initBrowserChat()
  }, [])

  return null
}

export default BrowserChatSyncInitializer
