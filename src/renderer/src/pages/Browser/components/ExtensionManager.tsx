import { DeleteOutlined, PlusOutlined, SettingOutlined, UploadOutlined } from '@ant-design/icons'
import { Extension } from '@renderer/types/extension'
import { Button, Card, Empty, Input, message, Modal, Space, Spin, Upload } from 'antd'
import React, { useEffect, useState } from 'react'
import styled from 'styled-components'

// 扩展管理器组件
const ExtensionManager: React.FC<{
  visible: boolean
  onClose: () => void
}> = ({ visible, onClose }) => {
  const [extensions, setExtensions] = useState<Extension[]>([])
  const [loading, setLoading] = useState(true)
  const [chromeExtId, setChromeExtId] = useState('')

  // 加载扩展列表
  const loadExtensions = async () => {
    setLoading(true)
    try {
      const result = await window.api.browser.getExtensions()
      if (result.success) {
        setExtensions(result.extensions)
      } else {
        message.error(`加载扩展失败: ${result.error}`)
      }
    } catch (error) {
      console.error('加载扩展失败:', error)
      message.error('加载扩展失败')
    } finally {
      setLoading(false)
    }
  }

  // 安装扩展
  const handleInstallExtension = async (path: string) => {
    try {
      const result = await window.api.browser.installExtension(path)
      if (result.success) {
        message.success('安装扩展成功')
        loadExtensions()
      } else {
        message.error(`安装扩展失败: ${result.error}`)
      }
    } catch (error) {
      console.error('安装扩展失败:', error)
      message.error('安装扩展失败')
    }
  }

  // 卸载扩展
  const handleUninstallExtension = async (extId: string) => {
    try {
      const result = await window.api.browser.uninstallExtension(extId)
      if (result.success) {
        message.success('卸载扩展成功')
        loadExtensions()
      } else {
        message.error(`卸载扩展失败: ${result.error}`)
      }
    } catch (error) {
      console.error('卸载扩展失败:', error)
      message.error('卸载扩展失败')
    }
  }

  // 从Chrome安装扩展
  const handleInstallChromeExtension = async () => {
    if (!chromeExtId) {
      message.error('请输入Chrome扩展ID')
      return
    }

    try {
      const result = await window.api.browser.installChromeExtension(chromeExtId)
      if (result.success) {
        message.success('安装扩展成功')
        setChromeExtId('')
        loadExtensions()
      } else {
        message.error(`安装扩展失败: ${result.error}`)
      }
    } catch (error) {
      console.error('安装扩展失败:', error)
      message.error('安装扩展失败')
    }
  }

  // 设置认证处理程序
  const setupAuthenticationHandler = () => {
    // 调用主进程中的认证处理程序设置方法
    window.electron.ipcRenderer
      .invoke('browser:setupAuthHandler')
      .then((result) => {
        console.log('Authentication handler setup result:', result)
      })
      .catch((error) => {
        console.error('Failed to setup authentication handler:', error)
      })
  }

  // 初始加载
  useEffect(() => {
    if (visible) {
      loadExtensions()
      setupAuthenticationHandler()
      window.electron.ipcRenderer.on('extension-installed', loadExtensions)
      window.electron.ipcRenderer.on('extension-removed', loadExtensions)
    }
    return () => {
      window.electron.ipcRenderer.removeListener('extension-installed', loadExtensions)
      window.electron.ipcRenderer.removeListener('extension-removed', loadExtensions)
    }
  }, [visible])

  return (
    <Modal title="扩展管理" open={visible} onCancel={onClose} footer={null} width={800}>
      <ExtensionManagerContainer>
        <div className="actions">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space>
              <Upload
                showUploadList={false}
                directory
                beforeUpload={(file) => {
                  // 直接检查file.path是否可用
                  const filePath = file.path || ((file as any).originFileObj && (file as any).originFileObj.path)
                  if (filePath) {
                    handleInstallExtension(filePath)
                  } else {
                    message.error('无法获取文件路径')
                  }
                  return false
                }}>
                <Button icon={<PlusOutlined />} type="primary">
                  安装扩展目录
                </Button>
              </Upload>

              <Upload
                showUploadList={false}
                accept=".crx"
                beforeUpload={(file) => {
                  // 使用File API和现有的file API处理文件
                  message.loading({ content: '正在处理CRX文件...', key: 'crxLoading' })

                  // 读取文件内容
                  const reader = new FileReader()
                  reader.onload = async (event) => {
                    try {
                      if (event.target?.result) {
                        // 尝试不同的方法安装CRX文件
                        try {
                          // 方法1: 使用create和write相结合
                          // 创建一个临时文件名，使用特定的后缀以便系统识别
                          const tempFileName = `temp_crx_${Date.now()}.crx`

                          // 首先创建临时文件
                          const tempFilePath = await window.api.file.create(tempFileName)
                          console.log('临时文件创建路径:', tempFilePath)

                          if (tempFilePath) {
                            // 将数据写入临时文件
                            const arrayBuffer = event.target.result as ArrayBuffer
                            await window.api.file.write(tempFilePath, new Uint8Array(arrayBuffer))

                            console.log('尝试安装扩展:', tempFilePath)

                            // 使用已有的安装扩展函数
                            try {
                              // 先尝试使用installExtension (可能对所有类型的扩展都有效)
                              const result = await window.api.browser.installExtension(tempFilePath)
                              message.destroy('crxLoading')

                              if (result.success) {
                                message.success('安装CRX扩展成功')
                                loadExtensions()
                              } else {
                                // 如果第一种方法失败，尝试特定的CRX安装方法
                                try {
                                  const crxResult = await window.api.browser.installCrxExtension(tempFilePath)
                                  if (crxResult.success) {
                                    message.success('安装CRX扩展成功')
                                    loadExtensions()
                                  } else {
                                    message.error(`安装CRX扩展失败: ${crxResult.error}`)
                                    console.error('安装失败细节:', crxResult)
                                  }
                                } catch (crxError: any) {
                                  message.error(`CRX安装失败: ${crxError.message || '未知错误'}`)
                                  console.error('CRX安装错误:', crxError)
                                }
                              }
                            } catch (installError: any) {
                              message.error(`安装失败: ${installError.message || '未知错误'}`)
                              console.error('安装错误:', installError)
                            }
                          } else {
                            message.destroy('crxLoading')
                            message.error('创建临时文件失败')
                          }
                        } catch (fileError: any) {
                          console.error('文件操作失败:', fileError)
                          message.error(`文件操作失败: ${fileError.message || '未知错误'}`)
                        }
                      }
                    } catch (error: any) {
                      message.destroy('crxLoading')
                      console.error('处理文件失败:', error)
                      message.error(`处理文件失败: ${error.message || '未知错误'}`)
                    }
                  }

                  reader.onerror = (error) => {
                    message.destroy('crxLoading')
                    console.error('读取文件错误:', error)
                    message.error('读取文件失败')
                  }

                  // 读取文件为ArrayBuffer
                  reader.readAsArrayBuffer(file)
                  return false
                }}>
                <Button icon={<UploadOutlined />}>安装CRX文件</Button>
              </Upload>
            </Space>

            <Space>
              <Input
                placeholder="输入Chrome扩展ID"
                value={chromeExtId}
                onChange={(e) => setChromeExtId(e.target.value)}
                style={{ width: 300 }}
              />
              <Button icon={<PlusOutlined />} onClick={handleInstallChromeExtension}>
                从Chrome安装
              </Button>
            </Space>
          </Space>
        </div>

        {loading ? (
          <div className="loading">
            <Spin />
          </div>
        ) : (
          <div className="extensions-list">
            {extensions.length === 0 ? (
              <Empty description="暂无已安装的扩展" />
            ) : (
              <div className="extensions-grid">
                {extensions.map((ext) => (
                  <Card
                    key={ext.id}
                    className="extension-card"
                    cover={ext.icons && ext.icons.length > 0 && <img src={ext.icons[0].url} alt={ext.name} />}
                    actions={[
                      <SettingOutlined key="setting" />,
                      <DeleteOutlined key="delete" onClick={() => handleUninstallExtension(ext.id)} />
                    ]}>
                    <Card.Meta
                      title={ext.name}
                      description={
                        <div>
                          <p>{ext.description}</p>
                          <p>版本: {ext.version}</p>
                        </div>
                      }
                    />
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </ExtensionManagerContainer>
    </Modal>
  )
}

const ExtensionManagerContainer = styled.div`
  .actions {
    margin-bottom: 16px;
  }

  .loading {
    display: flex;
    justify-content: center;
    padding: 40px 0;
  }

  .extensions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
  }

  .extension-card {
    height: 100%;
  }
`

export default ExtensionManager
