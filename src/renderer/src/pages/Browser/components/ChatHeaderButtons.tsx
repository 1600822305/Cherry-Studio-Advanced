import '../styles/ChatModelSelectorFix.css'

import { ClearOutlined, CloseOutlined, ExpandOutlined, SettingOutlined, ShrinkOutlined } from '@ant-design/icons'
import { Model } from '@renderer/types'
import { Button, Popover, Space, Tooltip } from 'antd'
import React from 'react'

import ModelSelector from './ModelSelector'

interface ChatHeaderButtonsProps {
  expanded: boolean
  selectedModel: Model | undefined
  showModelSelector: boolean
  setShowModelSelector: (show: boolean) => void
  setSelectedModel: (model: Model) => void
  handleToggleExpand: () => void
  handleClearChat: () => void
  onClose: () => void
}

const ChatHeaderButtons: React.FC<ChatHeaderButtonsProps> = ({
  expanded,
  selectedModel,
  showModelSelector,
  setShowModelSelector,
  setSelectedModel,
  handleToggleExpand,
  handleClearChat,
  onClose
}) => {
  // 使用捕获阶段处理点击事件，确保事件不会被其他元素拦截
  const handleButtonClick = (callback: () => void) => (e: React.MouseEvent) => {
    // 阻止事件冒泡和默认行为
    e.stopPropagation()
    e.preventDefault()
    // 执行回调
    callback()
  }

  return (
    <div
      className="chat-header-buttons-wrapper"
      style={{
        position: 'relative',
        zIndex: 9999,
        pointerEvents: 'auto'
      }}>
      <Space size="small" className="chat-header-buttons">
        <Tooltip title="选择模型">
          <Popover
            title="选择AI模型"
            trigger="click"
            open={showModelSelector}
            onOpenChange={setShowModelSelector}
            overlayClassName="model-selector-popover browser-chat-model-popover"
            content={
              <div style={{ width: 280 }}>
                <ModelSelector
                  value={selectedModel}
                  onChange={(model) => {
                    setSelectedModel(model)
                    setShowModelSelector(false)
                  }}
                  style={{ zIndex: 50000 }}
                  className="browser-chat-model-selector"
                />
              </div>
            }>
            <Button
              type="text"
              size="small"
              icon={<SettingOutlined />}
              onClick={handleButtonClick(() => setShowModelSelector(true))}
              style={{
                pointerEvents: 'auto',
                position: 'relative',
                zIndex: 9999
              }}
            />
          </Popover>
        </Tooltip>
        <Tooltip title="清除聊天记录">
          <Button
            type="text"
            size="small"
            icon={<ClearOutlined />}
            onClick={handleButtonClick(handleClearChat)}
            style={{
              pointerEvents: 'auto',
              position: 'relative',
              zIndex: 9999
            }}
          />
        </Tooltip>
        <Tooltip title={expanded ? '收缩' : '展开'}>
          <Button
            type="text"
            size="small"
            icon={expanded ? <ShrinkOutlined /> : <ExpandOutlined />}
            onClick={handleButtonClick(handleToggleExpand)}
            style={{
              pointerEvents: 'auto',
              position: 'relative',
              zIndex: 9999
            }}
          />
        </Tooltip>
        <Tooltip title="关闭">
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={handleButtonClick(onClose)}
            style={{
              pointerEvents: 'auto',
              position: 'relative',
              zIndex: 9999
            }}
          />
        </Tooltip>
      </Space>
    </div>
  )
}

export default ChatHeaderButtons
