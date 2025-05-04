import { AppstoreOutlined } from '@ant-design/icons'
import { Extension } from '@renderer/types/extension'
import { Button, Tooltip } from 'antd'
import React, { useEffect, useState } from 'react'
import styled from 'styled-components'

// 扩展工具栏组件
const ExtensionToolbar: React.FC<{
  onOpenExtensionManager: () => void
}> = ({ onOpenExtensionManager }) => {
  const [extensions, setExtensions] = useState<Extension[]>([])

  // 加载扩展列表
  const loadExtensions = async () => {
    try {
      const result = await window.api.browser.getExtensions()
      if (result.success) {
        setExtensions(result.extensions)
      }
    } catch (error) {
      console.error('加载扩展失败:', error)
    }
  }

  // 初始加载
  useEffect(() => {
    loadExtensions()

    // 定期刷新扩展列表
    const interval = setInterval(loadExtensions, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <ToolbarContainer>
      {extensions.map((ext) => (
        <Tooltip key={ext.id} title={ext.name}>
          <Button
            className="extension-button"
            icon={
              ext.icons && ext.icons.length > 0 ? (
                <img src={ext.icons[0].url} alt={ext.name} className="extension-icon" />
              ) : (
                <div className="extension-icon-placeholder">{ext.name[0]}</div>
              )
            }
          />
        </Tooltip>
      ))}
      <Tooltip title="管理扩展">
        <Button className="extension-button" icon={<AppstoreOutlined />} onClick={onOpenExtensionManager} />
      </Tooltip>
    </ToolbarContainer>
  )
}

const ToolbarContainer = styled.div`
  display: flex;
  align-items: center;
  padding: 0 8px;

  .extension-button {
    margin: 0 2px;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .extension-icon {
    width: 16px;
    height: 16px;
  }

  .extension-icon-placeholder {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #1890ff;
    color: white;
    border-radius: 2px;
    font-size: 10px;
  }
`

export default ExtensionToolbar
