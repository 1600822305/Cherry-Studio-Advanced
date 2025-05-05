import { PlusOutlined } from '@ant-design/icons'
import { usePluginSystem } from '@renderer/services/PluginSystem'
import { Button, message } from 'antd'
import { FC, useState } from 'react'
import styled from 'styled-components'

import AddPluginModal from './components/AddPluginModal' // 新增导入

// 添加ActionBar组件
const ActionBar = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
`

const ModuleSettings: FC = () => {
  const [isModalVisible, setIsModalVisible] = useState(false) // 新增状态
  const [activeTab] = useState('plugins') // 添加activeTab状态
  const [, setDownloading] = useState<Record<string, boolean>>({}) // 添加downloading状态
  const [messageApi, contextHolder] = message.useMessage() // 添加messageApi

  // 使用插件系统
  const { installPlugin } = usePluginSystem()

  // 处理添加插件
  const handleAddPlugin = async (pluginId: string) => {
    try {
      setDownloading((prev) => ({ ...prev, [pluginId]: true }))
      const success = await installPlugin(pluginId)
      if (success) {
        messageApi.success(`插件 ${pluginId} 安装成功`)
      } else {
        messageApi.error(`插件 ${pluginId} 安装失败`)
      }
    } catch (error) {
      console.error(`Failed to install plugin ${pluginId}:`, error)
      messageApi.error(`插件 ${pluginId} 安装失败`)
    } finally {
      setDownloading((prev) => ({ ...prev, [pluginId]: false }))
      setIsModalVisible(false) // 安装完成后关闭弹窗
    }
  }

  return (
    <>
      {contextHolder}
      {activeTab === 'plugins' && (
        <>
          <ActionBar>
            <Button
              icon={<PlusOutlined />}
              type="primary"
              onClick={() => setIsModalVisible(true)} // 绑定点击事件
            >
              添加插件
            </Button>
          </ActionBar>

          {/* 新增模态框组件 */}
          <AddPluginModal visible={isModalVisible} onCancel={() => setIsModalVisible(false)} onOk={handleAddPlugin} />
        </>
      )}
    </>
  )
}

export default ModuleSettings
