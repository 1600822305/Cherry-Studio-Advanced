import '../styles/ChatSidebarFix.css' // 导入修复聊天侧边栏按钮点击问题的CSS
import '../styles/ChatButtonOverride.css' // 导入覆盖样式，修复按钮点击问题

import { CommentOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { WebviewTag } from 'electron'
import React, { useEffect, useState } from 'react'

import { ChatSidebarState } from '../index'
import ChatSidebar from './ChatSidebar'

// 聊天按钮组件接口
interface ChatButtonProps {
  activeWebview?: React.RefObject<WebviewTag>
}

// 聊天按钮组件
const ChatButton: React.FC<ChatButtonProps> = ({ activeWebview }) => {
  const [showChatSidebar, setShowChatSidebar] = useState(false)

  // 同步本地状态与全局状态
  useEffect(() => {
    setShowChatSidebar(ChatSidebarState.isOpen)
  }, [ChatSidebarState.isOpen])

  // 处理按钮点击
  const handleToggleChatSidebar = () => {
    const newState = !showChatSidebar
    setShowChatSidebar(newState)
    ChatSidebarState.setIsOpen(newState)
  }

  return (
    <>
      <Tooltip title="聊天助手">
        <Button
          className="chat-button"
          icon={<CommentOutlined />}
          onClick={handleToggleChatSidebar}
          type={showChatSidebar ? 'primary' : 'default'}
        />
      </Tooltip>

      {/* 聊天侧边栏 */}
      <ChatSidebar
        visible={showChatSidebar}
        onClose={() => {
          setShowChatSidebar(false)
          ChatSidebarState.setIsOpen(false)
        }}
        activeWebview={activeWebview}
      />
    </>
  )
}

export default ChatButton
