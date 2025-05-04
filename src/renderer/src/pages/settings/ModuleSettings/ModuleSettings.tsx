import {
  DeleteOutlined,
  DownloadOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  SyncOutlined
} from '@ant-design/icons'
import { useTheme } from '@renderer/context/ThemeProvider'
import { NpmModule, useModuleRegistry } from '@renderer/services/ModuleRegistryManager'
import { parsePluginFile } from '@renderer/services/PluginFileService'
import { removePlugin, usePluginSystem } from '@renderer/services/PluginSystem'
import { useAppDispatch } from '@renderer/store'
import { Plugin } from '@renderer/types/plugin'
import { Button, Card, Empty, Input, List, message, Spin, Switch, Tabs, Tag, Tooltip } from 'antd'
import { FC, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import { SettingContainer, SettingDivider, SettingGroup, SettingHelpText, SettingTitle } from '..'
import AddPluginModal from './components/AddPluginModal'

const ModuleSettings: FC = () => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [messageApi, contextHolder] = message.useMessage()
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NpmModule[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [downloading, setDownloading] = useState<Record<string, boolean>>({})
  const [isAddPluginModalVisible, setIsAddPluginModalVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()

  // 使用插件系统
  const {
    plugins,
    isInitialized,
    isLoading,
    error,
    installPlugin,
    activatePlugin,
    deactivatePlugin,
    uninstallPlugin,
    initializePluginSystem,
    registerPlugin,
    resetPluginSystem,
    refreshPlugin
  } = usePluginSystem()

  // 使用模块注册表服务（用于搜索NPM模块）
  const { modules, searchNpmPackages } = useModuleRegistry()

  // 初始化插件系统
  useEffect(() => {
    if (!isInitialized) {
      initializePluginSystem()
    }
  }, [isInitialized, initializePluginSystem])

  // 根据URL查询参数设置初始活动标签
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const tabParam = searchParams.get('tab')
    if (tabParam && ['all', 'installed', 'active', 'search', 'plugins'].includes(tabParam)) {
      setActiveTab(tabParam)
    }

    // 处理插件参数，如果存在插件参数则自动切换到插件标签
    const pluginParam = searchParams.get('plugin')
    if (pluginParam) {
      console.log(`检测到插件参数: ${pluginParam}，自动切换到插件标签`)
      setActiveTab('plugins')

      // 如果指定的插件存在，自动聚焦到该插件
      const scrollToPlugin = () => {
        const pluginElement = document.getElementById(`plugin-${pluginParam}`)
        if (pluginElement) {
          console.log(`找到插件元素，滚动到视图`)
          pluginElement.scrollIntoView({ behavior: 'smooth', block: 'center' })

          // 添加强烈的高亮效果
          pluginElement.classList.add('highlight-plugin')

          // 持续高亮效果时间更长，更容易被注意到
          setTimeout(() => {
            pluginElement.classList.remove('highlight-plugin')
            // 高亮消失后添加一个持续的边框效果
            pluginElement.classList.add('plugin-border-highlight')

            // 10秒后移除持久边框
            setTimeout(() => {
              pluginElement.classList.remove('plugin-border-highlight')
            }, 10000)
          }, 5000)
        } else {
          console.log(`未找到插件元素: plugin-${pluginParam}，尝试延迟查找`)
          // 如果没找到，可能是因为插件列表还未完全加载，延迟再试
          setTimeout(scrollToPlugin, 500)
        }
      }

      // 延迟执行，确保DOM已更新
      setTimeout(scrollToPlugin, 500)
    }
  }, [location.search])

  // 当标签改变时更新URL
  const handleTabChange = (key: string) => {
    setActiveTab(key)
    navigate(`/settings/modules?tab=${key}`, { replace: true })
  }

  // 处理搜索
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    try {
      setIsSearching(true)
      const results = await searchNpmPackages(searchQuery)
      setSearchResults(results)
    } catch (error) {
      console.error('Search failed:', error)
      messageApi.error(t('settings.modules.search_failed'))
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery, searchNpmPackages, messageApi, t])

  // 过滤插件
  const filteredPlugins = useCallback((): Plugin[] => {
    if (activeTab === 'search') {
      return [] // 在搜索标签页不显示插件
    }

    const filtered = plugins.filter((plugin) => {
      if (activeTab === 'installed' && !plugin.state.isInstalled) return false
      if (activeTab === 'active' && (!plugin.state.isInstalled || !plugin.state.isActive)) return false
      return true
    })

    return filtered
  }, [activeTab, plugins])

  // 处理添加插件
  const handleAddPlugin = async (pluginId: string, pluginFile?: File) => {
    try {
      setIsAddPluginModalVisible(false)

      if (pluginFile) {
        // 处理插件文件上传
        setLoading(true)
        message.loading('正在解析插件文件...')

        const pluginMeta = await parsePluginFile(pluginFile)
        if (!pluginMeta) {
          message.error('插件文件解析失败')
          return
        }

        // 注册插件
        const registered = await registerPlugin(pluginMeta)
        if (!registered) {
          message.error('插件注册失败')
          return
        }

        // 安装插件
        const installed = await installPlugin(pluginMeta.id)
        if (installed) {
          message.success(`插件 ${pluginMeta.name} 安装成功`)
        } else {
          message.error(`插件 ${pluginMeta.name} 安装失败`)
        }
      } else if (pluginId) {
        // 通过ID安装插件
        setDownloading((prev) => ({ ...prev, [pluginId]: true }))
        const success = await installPlugin(pluginId)
        if (success) {
          message.success(`插件 ${pluginId} 安装成功`)
        } else {
          message.error(`插件 ${pluginId} 安装失败`)
        }
      } else {
        message.error('请提供插件ID或上传插件文件')
      }
    } catch (error) {
      console.error(`Failed to install plugin:`, error)
      message.error(`插件安装失败`)
    } finally {
      setDownloading((prev) => ({ ...prev, [pluginId]: false }))
      setLoading(false)
    }
  }

  // 处理卸载插件
  const handleUninstallPlugin = async (pluginId: string) => {
    try {
      setLoading(true)
      const success = await uninstallPlugin(pluginId)
      if (success) {
        messageApi.success(`插件 ${pluginId} 卸载成功`)
      } else {
        messageApi.error(`插件 ${pluginId} 卸载失败`)
      }
    } catch (error) {
      console.error(`Failed to uninstall plugin ${pluginId}:`, error)
      messageApi.error(`插件 ${pluginId} 卸载失败`)
    } finally {
      setLoading(false)
    }
  }

  // 处理移除未安装的插件
  const handleRemovePlugin = async (pluginId: string) => {
    try {
      setLoading(true)

      // 直接从Redux状态中移除插件
      dispatch(removePlugin(pluginId))

      // 从localStorage中移除插件相关的所有数据
      // 1. 从plugins列表中移除
      const storedPluginsJson = localStorage.getItem('plugins') || '[]'
      const storedPlugins = JSON.parse(storedPluginsJson)
      const filteredPlugins = storedPlugins.filter((plugin: any) => plugin.id !== pluginId)
      localStorage.setItem('plugins', JSON.stringify(filteredPlugins))

      // 2. 从activatedPlugins中移除
      const activatedPluginsJson = localStorage.getItem('activatedPlugins') || '[]'
      let activatedPlugins = JSON.parse(activatedPluginsJson)
      if (Array.isArray(activatedPlugins) && activatedPlugins.includes(pluginId)) {
        activatedPlugins = activatedPlugins.filter((id: string) => id !== pluginId)
        localStorage.setItem('activatedPlugins', JSON.stringify(activatedPlugins))
      }

      // 3. 移除插件设置
      localStorage.removeItem(`plugin_settings_${pluginId}`)

      // 4. 移除任何包含该插件ID的localStorage项
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (
          key &&
          (key.includes(pluginId) ||
            key.includes(`plugin_${pluginId}`) ||
            key.includes(`${pluginId}_`) ||
            key.includes(`_${pluginId}`))
        ) {
          keysToRemove.push(key)
        }
      }

      // 删除收集到的键
      keysToRemove.forEach((key) => localStorage.removeItem(key))

      // 5. 特殊处理：添加到黑名单，防止内置插件自动加载
      // 获取或创建插件黑名单
      const blacklistJson = localStorage.getItem('plugin_blacklist') || '[]'
      let blacklist = JSON.parse(blacklistJson)
      if (!Array.isArray(blacklist)) {
        blacklist = []
      }

      // 添加到黑名单
      if (!blacklist.includes(pluginId)) {
        blacklist.push(pluginId)
        localStorage.setItem('plugin_blacklist', JSON.stringify(blacklist))
      }

      messageApi.success(`插件 ${pluginId} 已从列表中移除并加入黑名单`)

      // 重置插件系统以应用更改
      await resetPluginSystem()
    } catch (error) {
      console.error(`Failed to remove plugin ${pluginId}:`, error)
      messageApi.error(`移除插件 ${pluginId} 失败`)
    } finally {
      setLoading(false)
    }
  }

  // 处理重置插件系统
  const handleResetPluginSystem = async () => {
    try {
      setLoading(true)
      const success = await resetPluginSystem()
      if (success) {
        messageApi.success('插件系统已重置')
      } else {
        messageApi.error('插件系统重置失败')
      }
    } catch (error) {
      console.error('重置插件系统失败:', error)
      messageApi.error('重置插件系统失败')
    } finally {
      setLoading(false)
    }
  }

  // 处理刷新插件
  const handleRefreshPlugin = async (pluginId: string) => {
    try {
      setLoading(true)
      const success = await refreshPlugin(pluginId)
      if (success) {
        messageApi.success(`插件 ${pluginId} 刷新成功`)
      } else {
        messageApi.error(`插件 ${pluginId} 刷新失败`)
      }
    } catch (error) {
      console.error(`刷新插件失败: ${pluginId}`, error)
      messageApi.error(`刷新插件失败: ${pluginId}`)
    } finally {
      setLoading(false)
    }
  }

  // 处理激活/停用
  const handleTogglePluginActive = async (pluginId: string, active: boolean) => {
    try {
      let success: boolean
      if (active) {
        success = await activatePlugin(pluginId)
      } else {
        success = await deactivatePlugin(pluginId)
      }

      if (success) {
        messageApi.success(active ? `插件 ${pluginId} 已激活` : `插件 ${pluginId} 已停用`)
      } else {
        messageApi.error(active ? `插件 ${pluginId} 激活失败` : `插件 ${pluginId} 停用失败`)
      }
    } catch (error) {
      console.error(`Failed to ${active ? 'activate' : 'deactivate'} plugin ${pluginId}:`, error)
      messageApi.error(active ? `插件 ${pluginId} 激活失败` : `插件 ${pluginId} 停用失败`)
    }
  }

  // 处理按回车键搜索
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  // 构建Tabs的items数据
  const tabItems = [
    {
      key: 'all',
      label: t('settings.modules.all')
    },
    {
      key: 'installed',
      label: t('settings.modules.installed')
    },
    {
      key: 'active',
      label: t('settings.modules.active')
    },
    {
      key: 'search',
      label: t('settings.modules.search')
    },
    {
      key: 'plugins',
      label: '插件'
    }
  ]

  // 获取模块状态标签
  const getModuleStatusTag = (moduleId: string) => {
    const module = modules.find((m) => m.id === moduleId)

    if (!module) {
      return <Tag color="error">未找到</Tag>
    }

    if (!module.isInstalled) {
      return <Tag color="warning">未安装</Tag>
    }

    if (!module.isActive) {
      return <Tag color="warning">未激活</Tag>
    }

    return <Tag color="success">已就绪</Tag>
  }

  return (
    <SettingContainer theme={theme}>
      {contextHolder}
      <SettingGroup theme={theme}>
        <SettingTitle>{activeTab === 'plugins' ? '插件管理' : t('settings.modules.title')}</SettingTitle>
        <SettingDivider />
        <SettingHelpText>
          {activeTab === 'plugins'
            ? '在这里管理应用的插件，您可以启用或停用插件，并查看每个插件所依赖的模块。'
            : t('settings.modules.description')}
        </SettingHelpText>

        <Tabs activeKey={activeTab} onChange={handleTabChange} items={tabItems} />

        {activeTab === 'search' && (
          <SearchContainer>
            <Input
              placeholder={t('settings.modules.search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              suffix={<Button type="text" icon={<SearchOutlined />} onClick={handleSearch} loading={isSearching} />}
            />
          </SearchContainer>
        )}

        {activeTab === 'plugins' ? (
          <>
            <ActionBar>
              <Button
                icon={<PlusOutlined />}
                type="primary"
                onClick={() => setIsAddPluginModalVisible(true)}
                loading={loading}
                style={{ marginRight: 8 }}>
                添加插件
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleResetPluginSystem} loading={loading} danger>
                重置插件系统
              </Button>
            </ActionBar>

            <List<Plugin>
              loading={loading}
              grid={{ gutter: 16, column: 1 }}
              dataSource={plugins}
              locale={{
                emptyText: <Empty description="暂无可用插件" />
              }}
              renderItem={(plugin) => (
                <List.Item>
                  <FunctionCard id={`plugin-${plugin.id}`}>
                    <FunctionHeader>
                      <IconContainer>{typeof plugin.icon === 'string' ? plugin.icon : plugin.icon}</IconContainer>
                      <div>
                        <FunctionName>
                          {plugin.name} <VersionTag>{plugin.version}</VersionTag>
                        </FunctionName>
                        <FunctionDescription>{plugin.description}</FunctionDescription>
                        {plugin.author && <FunctionAuthor>作者: {plugin.author}</FunctionAuthor>}
                      </div>
                      <ActionButtons>
                        <Tooltip title="插件设置">
                          <Button type="text" icon={<SettingOutlined />} disabled={!plugin.state.isActive} />
                        </Tooltip>
                        <Switch
                          checked={plugin.state.isActive}
                          onChange={(checked) => handleTogglePluginActive(plugin.id, checked)}
                          disabled={!plugin.state.isInstalled}
                        />
                      </ActionButtons>
                    </FunctionHeader>

                    <ModulesList>
                      <ModulesTitle>所需模块:</ModulesTitle>
                      <ModuleTags>
                        {plugin.requiredModules?.map((moduleId) => (
                          <FunctionModuleItem key={moduleId}>
                            <span>{moduleId}</span>
                            {getModuleStatusTag(moduleId)}
                          </FunctionModuleItem>
                        )) || <span>无依赖模块</span>}
                      </ModuleTags>
                      {/* 错误信息显示 */}
                      {plugin.state.hasError && (
                        <ErrorMessage>{plugin.state.errorMessage || '插件出现错误'}</ErrorMessage>
                      )}
                      {/* 插件操作按钮 */}
                      <PluginActions>
                        {!plugin.state.isInstalled ? (
                          <>
                            <Button
                              type="primary"
                              icon={<DownloadOutlined />}
                              loading={downloading[plugin.id]}
                              onClick={() => handleAddPlugin(plugin.id)}
                              style={{ marginRight: 8 }}>
                              安装插件
                            </Button>
                            <Button icon={<DeleteOutlined />} onClick={() => handleRemovePlugin(plugin.id)} danger>
                              移除插件
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              icon={<SyncOutlined />}
                              onClick={() => handleRefreshPlugin(plugin.id)}
                              style={{ marginRight: 8 }}>
                              刷新插件
                            </Button>
                            <Button
                              icon={<DeleteOutlined />}
                              onClick={() => handleUninstallPlugin(plugin.id)}
                              disabled={plugin.state.isActive}
                              danger>
                              卸载插件
                            </Button>
                          </>
                        )}
                      </PluginActions>
                    </ModulesList>
                  </FunctionCard>
                </List.Item>
              )}
            />
          </>
        ) : (
          <>
            {isLoading && <Spin size="large" style={{ display: 'block', margin: '20px auto' }} />}

            {error && <ErrorMessage>{error}</ErrorMessage>}

            {!isLoading && activeTab === 'search' && (
              <List<NpmModule>
                dataSource={searchResults}
                locale={{
                  emptyText: <Empty description={t('settings.modules.no_modules')} />
                }}
                renderItem={(module) => (
                  <ModuleListItem>
                    <ModuleInfo>
                      <ModuleName>
                        {module.name}
                        <ModuleVersion>{module.version}</ModuleVersion>
                      </ModuleName>
                      <ModuleDescription>{module.description}</ModuleDescription>
                      <ModuleMeta>
                        <Tag color="blue">{module.category}</Tag>
                        {module.size && <ModuleSize>{module.size}</ModuleSize>}
                      </ModuleMeta>
                    </ModuleInfo>
                    <ModuleActions>
                      {module.isInstalled ? (
                        <>
                          <Switch
                            checked={module.isActive}
                            onChange={() => {
                              /* 此处必须提供一个回调函数，即使不做任何事情 */
                            }}
                            disabled={!module.isInstalled}
                          />
                          <Button icon={<DeleteOutlined />} onClick={() => {}} disabled={module.isActive} danger>
                            {t('settings.modules.uninstall')}
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="primary"
                          icon={<DownloadOutlined />}
                          loading={downloading[module.id]}
                          onClick={() => {}}>
                          {t('settings.modules.install')}
                        </Button>
                      )}
                    </ModuleActions>
                  </ModuleListItem>
                )}
              />
            )}

            {!isLoading && activeTab !== 'search' && (
              <List<Plugin>
                dataSource={filteredPlugins()}
                locale={{
                  emptyText: <Empty description="暂无可用插件" />
                }}
                renderItem={(plugin) => (
                  <ModuleListItem>
                    <ModuleInfo>
                      <ModuleName>
                        {plugin.name}
                        <ModuleVersion>{plugin.version}</ModuleVersion>
                      </ModuleName>
                      <ModuleDescription>{plugin.description}</ModuleDescription>
                      <ModuleMeta>
                        {plugin.author && <Tag color="blue">作者: {plugin.author}</Tag>}
                        <Tag color={plugin.state.hasError ? 'error' : 'default'}>
                          {plugin.state.hasError ? '错误' : '正常'}
                        </Tag>
                      </ModuleMeta>
                    </ModuleInfo>
                    <ModuleActions>
                      {plugin.state.isInstalled ? (
                        <>
                          <Switch
                            checked={plugin.state.isActive}
                            onChange={(checked) => handleTogglePluginActive(plugin.id, checked)}
                            disabled={!plugin.state.isInstalled}
                          />
                          <Button
                            icon={<DeleteOutlined />}
                            onClick={() => handleUninstallPlugin(plugin.id)}
                            disabled={plugin.state.isActive}
                            danger>
                            卸载
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="primary"
                            icon={<DownloadOutlined />}
                            loading={downloading[plugin.id]}
                            onClick={() => handleAddPlugin(plugin.id)}
                            style={{ marginRight: 8 }}>
                            安装
                          </Button>
                          <Button icon={<DeleteOutlined />} onClick={() => handleRemovePlugin(plugin.id)} danger>
                            移除
                          </Button>
                        </>
                      )}
                    </ModuleActions>
                  </ModuleListItem>
                )}
              />
            )}
          </>
        )}
      </SettingGroup>

      {/* 添加插件弹窗 */}
      <AddPluginModal
        visible={isAddPluginModalVisible}
        onCancel={() => setIsAddPluginModalVisible(false)}
        onOk={handleAddPlugin}
      />
    </SettingContainer>
  )
}

// 样式组件
const SearchContainer = styled.div`
  margin-bottom: 16px;
`

const ErrorMessage = styled.div`
  color: #ff4d4f;
  margin-bottom: 16px;
`

const ModuleListItem = styled.div`
  display: flex;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  justify-content: space-between;
  align-items: center;
`

const ModuleInfo = styled.div`
  flex: 1;
`

const ModuleName = styled.div`
  font-weight: 600;
  font-size: 16px;
  display: flex;
  align-items: center;
`

const ModuleVersion = styled.span`
  font-size: 12px;
  color: var(--color-text-2);
  margin-left: 8px;
`

const ModuleDescription = styled.div`
  margin: 8px 0;
  color: var(--color-text-2);
`

const ModuleMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const ModuleSize = styled.span`
  font-size: 12px;
  color: var(--color-text-3);
`

const ModuleActions = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
`

// 插件设置相关的样式组件
const ActionBar = styled.div`
  margin: 16px 0;
  display: flex;
  justify-content: flex-end;
`

const FunctionCard = styled(Card)`
  width: 100%;
  margin-bottom: 16px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);

  .ant-card-body {
    padding: 16px;
  }
`

const FunctionHeader = styled.div`
  display: flex;
  align-items: center;
`

const IconContainer = styled.div`
  font-size: 24px;
  margin-right: 16px;
  min-width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-background-soft);
  border-radius: 8px;
`

const FunctionName = styled.div`
  font-weight: 600;
  font-size: 16px;
  display: flex;
  align-items: center;
`

const VersionTag = styled.span`
  font-size: 12px;
  color: var(--color-text-2);
  font-weight: normal;
  margin-left: 8px;
`

const FunctionDescription = styled.div`
  font-size: 14px;
  color: var(--color-text-2);
  margin-top: 4px;
`

const FunctionAuthor = styled.div`
  font-size: 12px;
  color: var(--color-text-3);
  margin-top: 4px;
`

const ActionButtons = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
`

const ModulesList = styled.div`
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
`

const ModulesTitle = styled.div`
  font-weight: 500;
  margin-bottom: 8px;
`

const ModuleTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
`

const FunctionModuleItem = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  background-color: var(--color-background-soft);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
`

const PluginActions = styled.div`
  margin-top: 12px;
  display: flex;
  gap: 8px;
`

// 添加高亮效果的CSS
const style = document.createElement('style')
style.textContent = `
  @keyframes highlight-pulse {
    0% { box-shadow: 0 0 0 0 rgba(24, 144, 255, 0.7); }
    70% { box-shadow: 0 0 0 10px rgba(24, 144, 255, 0); }
    100% { box-shadow: 0 0 0 0 rgba(24, 144, 255, 0); }
  }

  .highlight-plugin {
    animation: highlight-pulse 1.5s infinite;
    border: 2px solid #1890ff !important;
  }
`
document.head.appendChild(style)

export default ModuleSettings
