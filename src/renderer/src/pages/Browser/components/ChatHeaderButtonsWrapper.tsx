import { ClearOutlined, CloseOutlined, ExpandOutlined, SettingOutlined, ShrinkOutlined } from '@ant-design/icons'
import { Model } from '@renderer/types'
import { Button, Popover, Space, Tooltip } from 'antd'
import React from 'react'

import ModelSelector from './ModelSelector'

interface ChatHeaderButtonsWrapperProps {
  expanded: boolean
  selectedModel: Model | undefined
  showModelSelector: boolean
  setShowModelSelector: (show: boolean) => void
  setSelectedModel: (model: Model) => void
  handleToggleExpand: () => void
  handleClearChat: () => void
  onClose: () => void
}

/**
 * 聊天侧边栏顶部按钮包装器组件
 * 这个组件使用绝对定位，确保按钮可以正常点击
 */
const ChatHeaderButtonsWrapper: React.FC<ChatHeaderButtonsWrapperProps> = ({
  expanded,
  selectedModel,
  showModelSelector,
  setShowModelSelector,
  setSelectedModel,
  handleToggleExpand,
  handleClearChat,
  onClose
}) => {
  return (
    <div
      className="chat-header-buttons-wrapper"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        height: '36px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        zIndex: 20000,
        pointerEvents: 'auto'
      }}>
      <Space size="small">
        <Tooltip title="选择模型">
          <Popover
            title="选择AI模型"
            trigger="click"
            open={showModelSelector}
            onOpenChange={setShowModelSelector}
            content={
              <div style={{ width: 280 }}>
                <ModelSelector
                  value={selectedModel}
                  onChange={(model: Model) => {
                    setSelectedModel(model)
                    setShowModelSelector(false)
                  }}
                />
              </div>
            }>
            <Button type="text" size="small" icon={<SettingOutlined />} onClick={() => setShowModelSelector(true)} />
          </Popover>
        </Tooltip>
        <Tooltip title="清除聊天记录">
          <Button type="text" size="small" icon={<ClearOutlined />} onClick={handleClearChat} />
        </Tooltip>
        <Tooltip title={expanded ? '收缩' : '展开'}>
          <Button
            type="text"
            size="small"
            icon={expanded ? <ShrinkOutlined /> : <ExpandOutlined />}
            onClick={handleToggleExpand}
          />
        </Tooltip>
        <Tooltip title="关闭">
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
        </Tooltip>
      </Space>
    </div>
  )
}

export default ChatHeaderButtonsWrapper
