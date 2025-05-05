import {
  ApiOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  DeleteOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  PictureOutlined,
  ReloadOutlined,
  SaveOutlined,
  SettingOutlined,
  TagsOutlined
} from '@ant-design/icons'
import { useMCPServers } from '@renderer/hooks/useMCPServers'
import MCPDescription from '@renderer/pages/settings/MCPSettings/McpDescription'
import { MCPPrompt, MCPResource, MCPServer, MCPTool } from '@renderer/types'
import {
  Button,
  Card,
  Col,
  Collapse,
  Flex,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Space,
  Switch,
  Tabs,
  Tooltip
} from 'antd'
import TextArea from 'antd/es/input/TextArea'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import styled from 'styled-components'

import { SettingContainer, SettingDivider, SettingGroup, SettingTitle } from '..'
import MCPPromptsSection from './McpPrompt'
import MCPResourcesSection from './McpResource'
import MCPToolsSection from './McpTool'

interface Props {
  server: MCPServer
}

interface MCPFormValues {
  name: string
  description?: string
  serverType: MCPServer['type']
  baseUrl?: string
  command?: string
  registryUrl?: string
  args?: string
  env?: string
  isActive: boolean
  headers?: string
  timeout?: number
  provider?: string
  providerUrl?: string
  logoUrl?: string
  tags?: string
}

interface Registry {
  name: string
  url: string
}

const NpmRegistry: Registry[] = [{ name: '淘宝 NPM Mirror', url: 'https://registry.npmmirror.com' }]
const PipRegistry: Registry[] = [
  { name: '清华大学', url: 'https://pypi.tuna.tsinghua.edu.cn/simple' },
  { name: '阿里云', url: 'http://mirrors.aliyun.com/pypi/simple/' },
  { name: '中国科学技术大学', url: 'https://mirrors.ustc.edu.cn/pypi/simple/' },
  { name: '华为云', url: 'https://repo.huaweicloud.com/repository/pypi/simple/' },
  { name: '腾讯云', url: 'https://mirrors.cloud.tencent.com/pypi/simple/' }
]

type TabKey = 'settings' | 'tools' | 'prompts' | 'resources'

const parseKeyValueString = (str: string): Record<string, string> => {
  const result: Record<string, string> = {}
  str.split('\n').forEach((line) => {
    if (line.trim()) {
      const [key, ...value] = line.split('=')
      const formatValue = value.join('=').trim()
      const formatKey = key.trim()
      if (formatKey && formatValue) {
        result[formatKey] = formatValue
      }
    }
  })
  return result
}

const McpSettings: React.FC<Props> = ({ server }) => {
  const { t } = useTranslation()
  const { deleteMCPServer, updateMCPServer } = useMCPServers()
  const [serverType, setServerType] = useState<MCPServer['type']>('stdio')
  const [form] = Form.useForm<MCPFormValues>()
  const [loading, setLoading] = useState(false)
  const [isFormChanged, setIsFormChanged] = useState(false)
  const [loadingServer, setLoadingServer] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('settings')
  const [expandAdvanced, setExpandAdvanced] = useState<boolean>(false)

  const [tools, setTools] = useState<MCPTool[]>([])
  const [prompts, setPrompts] = useState<MCPPrompt[]>([])
  const [resources, setResources] = useState<MCPResource[]>([])
  const [isShowRegistry, setIsShowRegistry] = useState(false)
  const [registry, setRegistry] = useState<Registry[]>()

  const navigate = useNavigate()

  useEffect(() => {
    const serverType: MCPServer['type'] = server.type || (server.baseUrl ? 'sse' : 'stdio')
    setServerType(serverType)

    // Set registry UI state based on command and registryUrl
    if (server.command) {
      handleCommandChange(server.command)

      // If there's a registryUrl, ensure registry UI is shown
      if (server.registryUrl) {
        setIsShowRegistry(true)

        // Determine registry type based on command
        if (server.command.includes('uv') || server.command.includes('uvx')) {
          setRegistry(PipRegistry)
        } else if (
          server.command.includes('npx') ||
          server.command.includes('bun') ||
          server.command.includes('bunx')
        ) {
          setRegistry(NpmRegistry)
        }
      }
    }

    form.setFieldsValue({
      name: server.name,
      description: server.description,
      serverType: serverType,
      baseUrl: server.baseUrl || '',
      command: server.command || '',
      registryUrl: server.registryUrl || '',
      isActive: server.isActive,
      args: server.args ? server.args.join('\n') : '',
      env: server.env
        ? Object.entries(server.env)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n')
        : '',
      headers: server.headers
        ? Object.entries(server.headers)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n')
        : '',
      timeout: server.timeout,
      provider: server.provider,
      providerUrl: server.providerUrl,
      logoUrl: server.logoUrl,
      tags: server.tags ? server.tags.join('\n') : ''
    })
  }, [server, form])

  useEffect(() => {
    const currentServerType = form.getFieldValue('serverType')
    if (currentServerType) {
      setServerType(currentServerType)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.getFieldValue('serverType')])

  const fetchTools = async () => {
    if (server.isActive) {
      try {
        setLoadingServer(server.id)
        const localTools = await window.api.mcp.listTools(server)
        setTools(localTools)
      } catch (error) {
        window.message.error({
          content: t('settings.mcp.tools.loadError') + ' ' + formatError(error),
          key: 'mcp-tools-error'
        })
      } finally {
        setLoadingServer(null)
      }
    }
  }

  const fetchPrompts = async () => {
    if (server.isActive) {
      try {
        setLoadingServer(server.id)
        const localPrompts = await window.api.mcp.listPrompts(server)
        setPrompts(localPrompts)
      } catch (error) {
        window.message.error({
          content: t('settings.mcp.prompts.loadError') + ' ' + formatError(error),
          key: 'mcp-prompts-error'
        })
        setPrompts([])
      } finally {
        setLoadingServer(null)
      }
    }
  }

  const fetchResources = async () => {
    if (server.isActive) {
      try {
        setLoadingServer(server.id)
        const localResources = await window.api.mcp.listResources(server)
        setResources(localResources)
      } catch (error) {
        window.message.error({
          content: t('settings.mcp.resources.loadError') + ' ' + formatError(error),
          key: 'mcp-resources-error'
        })
        setResources([])
      } finally {
        setLoadingServer(null)
      }
    }
  }

  useEffect(() => {
    if (server.isActive) {
      fetchTools()
      fetchPrompts()
      fetchResources()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id, server.isActive])

  useEffect(() => {
    setIsFormChanged(false)
  }, [server.id])

  // Save the form data
  const onSave = async () => {
    setLoading(true)
    try {
      const values = await form.validateFields()

      // set basic fields
      const mcpServer: MCPServer = {
        id: server.id,
        name: values.name,
        type: values.serverType || server.type,
        description: values.description,
        isActive: values.isActive,
        registryUrl: values.registryUrl
      }

      // set stdio or sse server
      if (values.serverType === 'sse' || server.type === 'streamableHttp') {
        mcpServer.baseUrl = values.baseUrl
      } else {
        mcpServer.command = values.command
        mcpServer.args = values.args ? values.args.split('\n').filter((arg) => arg.trim() !== '') : []
      }

      // set env variables
      if (values.env) {
        mcpServer.env = parseKeyValueString(values.env)
      }

      if (values.headers) {
        mcpServer.headers = parseKeyValueString(values.headers)
      }

      if (values.timeout) {
        mcpServer.timeout = values.timeout
      }

      if (values.provider) {
        mcpServer.provider = values.provider
      }

      if (values.providerUrl) {
        mcpServer.providerUrl = values.providerUrl
      }

      if (values.logoUrl) {
        mcpServer.logoUrl = values.logoUrl
      }

      if (values.tags) {
        mcpServer.tags = values.tags.split('\n').filter((tag) => tag.trim() !== '')
      }

      try {
        await window.api.mcp.restartServer(mcpServer)
        updateMCPServer({ ...mcpServer, isActive: true })
        window.message.success({ content: t('settings.mcp.updateSuccess'), key: 'mcp-update-success' })
        setLoading(false)
        setIsFormChanged(false)
      } catch (error: any) {
        updateMCPServer({ ...mcpServer, isActive: false })
        window.modal.error({
          title: t('settings.mcp.updateError'),
          content: error.message,
          centered: true
        })
        setLoading(false)
      }
    } catch (error: any) {
      setLoading(false)
      console.error('Failed to save MCP server settings:', error)
    }
  }

  // Watch for command field changes
  const handleCommandChange = (command: string) => {
    if (command.includes('uv') || command.includes('uvx')) {
      setIsShowRegistry(true)
      setRegistry(PipRegistry)
    } else if (command.includes('npx') || command.includes('bun') || command.includes('bunx')) {
      setIsShowRegistry(true)
      setRegistry(NpmRegistry)
    } else {
      setIsShowRegistry(false)
      setRegistry(undefined)
    }
  }

  const onSelectRegistry = (url: string) => {
    const command = form.getFieldValue('command') || ''

    // Add new registry env variables
    if (command.includes('uv') || command.includes('uvx')) {
      // envs['PIP_INDEX_URL'] = url
      // envs['UV_DEFAULT_INDEX'] = url
      form.setFieldsValue({ registryUrl: url })
    } else if (command.includes('npx') || command.includes('bun') || command.includes('bunx')) {
      // envs['NPM_CONFIG_REGISTRY'] = url
      form.setFieldsValue({ registryUrl: url })
    }

    // Mark form as changed
    setIsFormChanged(true)
  }

  const onDeleteMcpServer = useCallback(
    async (server: MCPServer) => {
      try {
        window.modal.confirm({
          title: t('settings.mcp.deleteServer'),
          content: t('settings.mcp.deleteServerConfirm'),
          centered: true,
          onOk: async () => {
            await window.api.mcp.removeServer(server)
            deleteMCPServer(server.id)
            window.message.success({ content: t('settings.mcp.deleteSuccess'), key: 'mcp-list' })
            navigate('/settings/mcp')
          }
        })
      } catch (error: any) {
        window.message.error({
          content: `${t('settings.mcp.deleteError')}: ${error.message}`,
          key: 'mcp-list'
        })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [server, t]
  )

  const formatError = (error: any) => {
    if (error.message.includes('32000')) {
      return t('settings.mcp.errors.32000')
    }

    return error.message
  }

  const onToggleActive = async (active: boolean) => {
    await form.validateFields()
    setLoadingServer(server.id)
    const oldActiveState = server.isActive

    try {
      if (active) {
        // 如果是 workspacefile 服务，自动设置 WORKSPACE_PATH 环境变量
        const serverToActivate = { ...server }

        if (server.name === '@cherry/workspacefile') {
          // 获取当前工作区路径
          const currentWorkspace = window.store
            .getState()
            .workspace.workspaces.find((w) => w.id === window.store.getState().workspace.currentWorkspaceId)

          // 获取对AI可见的工作区
          const visibleWorkspaces = window.store.getState().workspace.workspaces.filter((w) => w.visibleToAI !== false)

          // 检查当前工作区是否对AI可见
          if (!currentWorkspace || !visibleWorkspaces.some((w) => w.id === currentWorkspace.id)) {
            throw new Error('当前工作区对AI不可见，请在工作区设置中启用AI可见性')
          }

          if (currentWorkspace && currentWorkspace.path) {
            // 设置 WORKSPACE_PATH 环境变量
            // Remove redundant || {}
            const env = { ...serverToActivate.env }
            env.WORKSPACE_PATH = currentWorkspace.path
            serverToActivate.env = env

            // 更新表单中的环境变量显示
            const envText = Object.entries(env)
              .map(([key, value]) => `${key}=${value}`)
              .join('\n')
            form.setFieldValue('env', envText)

            console.log(`[MCP] Setting WORKSPACE_PATH to ${currentWorkspace.path} for @cherry/workspacefile`)
          } else {
            throw new Error('未找到当前工作区，请先设置工作区')
          }
        }

        const localTools = await window.api.mcp.listTools(serverToActivate)
        setTools(localTools)

        const localPrompts = await window.api.mcp.listPrompts(serverToActivate)
        setPrompts(localPrompts)

        const localResources = await window.api.mcp.listResources(serverToActivate)
        setResources(localResources)

        // 更新服务器配置
        updateMCPServer({ ...serverToActivate, isActive: active })
      } else {
        await window.api.mcp.stopServer(server)
        updateMCPServer({ ...server, isActive: active })
      }
    } catch (error: any) {
      window.modal.error({
        title: t('settings.mcp.startError'),
        content: formatError(error),
        centered: true
      })
      updateMCPServer({ ...server, isActive: oldActiveState })
    } finally {
      setLoadingServer(null)
    }
  }

  // Handle toggling a tool on/off
  const handleToggleTool = useCallback(
    async (tool: MCPTool, enabled: boolean) => {
      // Create a new disabledTools array or use the existing one
      let disabledTools = [...(server.disabledTools || [])]

      if (enabled) {
        // Remove tool from disabledTools if it's being enabled
        disabledTools = disabledTools.filter((name) => name !== tool.name)
      } else {
        // Add tool to disabledTools if it's being disabled
        if (!disabledTools.includes(tool.name)) {
          disabledTools.push(tool.name)
        }
      }

      // Update the server with new disabledTools
      const updatedServer = {
        ...server,
        disabledTools
      }

      // Save the updated server configuration
      // await window.api.mcp.updateServer(updatedServer)
      updateMCPServer(updatedServer)
    },
    [server, updateMCPServer]
  )

  const tabs = [
    {
      key: 'settings',
      label: t('settings.mcp.tabs.general'),
      children: (
        <Form
          form={form}
          layout="vertical"
          onValuesChange={() => setIsFormChanged(true)}
          style={{
            overflowY: 'auto',
            overflowX: 'hidden',
            width: '100%',
            flex: 1
          }}>
          <Card
            title={
              <Flex align="center" gap={8}>
                <InfoCircleOutlined />
                {t('settings.mcp.basicInfo')}
              </Flex>
            }
            bordered={false}
            style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={24}>
                <Form.Item name="name" label={t('settings.mcp.name')} rules={[{ required: true, message: '' }]}>
                  <Input
                    placeholder={t('common.name')}
                    prefix={<CodeOutlined style={{ color: 'var(--color-text-3)' }} />}
                  />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="description" label={t('settings.mcp.description')}>
                  <TextArea rows={2} placeholder={t('common.description')} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card
            title={
              <Flex align="center" gap={8}>
                <ApiOutlined />
                {t('settings.mcp.connectionSettings')}
              </Flex>
            }
            bordered={false}
            style={{ marginBottom: 16 }}>
            <Form.Item
              name="serverType"
              label={t('settings.mcp.type')}
              rules={[{ required: true }]}
              initialValue="stdio">
              <Radio.Group
                onChange={(e) => setServerType(e.target.value)}
                optionType="button"
                buttonStyle="solid"
                style={{ width: '100%' }}
                options={[
                  { label: t('settings.mcp.stdio'), value: 'stdio' },
                  { label: t('settings.mcp.sse'), value: 'sse' },
                  { label: t('settings.mcp.streamableHttp'), value: 'streamableHttp' },
                  { label: t('settings.mcp.inMemory'), value: 'inMemory' }
                ]}
              />
            </Form.Item>

            {serverType === 'sse' && (
              <>
                <Form.Item
                  name="baseUrl"
                  label={t('settings.mcp.url')}
                  rules={[{ required: serverType === 'sse', message: '' }]}
                  tooltip={t('settings.mcp.baseUrlTooltip')}>
                  <Input
                    placeholder="http://localhost:3000/sse"
                    prefix={<LinkOutlined style={{ color: 'var(--color-text-3)' }} />}
                  />
                </Form.Item>
                <Form.Item name="headers" label={t('settings.mcp.headers')} tooltip={t('settings.mcp.headersTooltip')}>
                  <TextArea
                    rows={3}
                    placeholder={`Content-Type=application/json\nAuthorization=Bearer token`}
                    style={{ fontFamily: 'monospace', wordBreak: 'break-word', overflowWrap: 'break-word' }}
                  />
                </Form.Item>
              </>
            )}

            {serverType === 'streamableHttp' && (
              <>
                <Form.Item
                  name="baseUrl"
                  label={t('settings.mcp.url')}
                  rules={[{ required: serverType === 'streamableHttp', message: '' }]}
                  tooltip={t('settings.mcp.baseUrlTooltip')}>
                  <Input
                    placeholder="http://localhost:3000/mcp"
                    prefix={<LinkOutlined style={{ color: 'var(--color-text-3)' }} />}
                  />
                </Form.Item>
                <Form.Item name="headers" label={t('settings.mcp.headers')} tooltip={t('settings.mcp.headersTooltip')}>
                  <TextArea
                    rows={3}
                    placeholder={`Content-Type=application/json\nAuthorization=Bearer token`}
                    style={{ fontFamily: 'monospace', wordBreak: 'break-word', overflowWrap: 'break-word' }}
                  />
                </Form.Item>
              </>
            )}

            {serverType === 'stdio' && (
              <>
                <Form.Item
                  name="command"
                  label={t('settings.mcp.command')}
                  rules={[{ required: serverType === 'stdio', message: '' }]}>
                  <Input
                    placeholder="uvx or npx"
                    onChange={(e) => handleCommandChange(e.target.value)}
                    prefix={<CodeOutlined style={{ color: 'var(--color-text-3)' }} />}
                  />
                </Form.Item>

                {isShowRegistry && registry && (
                  <Form.Item
                    name="registryUrl"
                    label={t('settings.mcp.registry')}
                    tooltip={t('settings.mcp.registryTooltip')}>
                    <Radio.Group>
                      <Space direction="vertical">
                        <Radio
                          key="no-proxy"
                          value=""
                          onChange={(e) => {
                            onSelectRegistry(e.target.value)
                          }}>
                          {t('settings.mcp.registryDefault')}
                        </Radio>
                        {registry.map((reg) => (
                          <Radio
                            key={reg.url}
                            value={reg.url}
                            onChange={(e) => {
                              onSelectRegistry(e.target.value)
                            }}>
                            {reg.name}
                          </Radio>
                        ))}
                      </Space>
                    </Radio.Group>
                  </Form.Item>
                )}

                <Form.Item name="args" label={t('settings.mcp.args')} tooltip={t('settings.mcp.argsTooltip')}>
                  <TextArea rows={2} placeholder={`arg1\narg2`} style={{ fontFamily: 'monospace' }} />
                </Form.Item>

                <Form.Item name="env" label={t('settings.mcp.env')} tooltip={t('settings.mcp.envTooltip')}>
                  <TextArea rows={3} placeholder={`KEY1=value1\nKEY2=value2`} style={{ fontFamily: 'monospace' }} />
                </Form.Item>
              </>
            )}

            {serverType === 'inMemory' && (
              <>
                <Form.Item name="baseUrl" label={t('settings.mcp.url')} tooltip={t('settings.mcp.baseUrlTooltip')}>
                  <Input
                    placeholder="http://localhost:3000/memory"
                    prefix={<LinkOutlined style={{ color: 'var(--color-text-3)' }} />}
                  />
                </Form.Item>
                <Form.Item name="headers" label={t('settings.mcp.headers')} tooltip={t('settings.mcp.headersTooltip')}>
                  <TextArea
                    rows={3}
                    placeholder={`Content-Type=application/json\nAuthorization=Bearer token`}
                    style={{ fontFamily: 'monospace', wordBreak: 'break-word', overflowWrap: 'break-word' }}
                  />
                </Form.Item>
                <Form.Item name="args" label={t('settings.mcp.args')} tooltip={t('settings.mcp.argsTooltip')}>
                  <TextArea rows={2} placeholder={`arg1\narg2`} style={{ fontFamily: 'monospace' }} />
                </Form.Item>

                <Form.Item name="env" label={t('settings.mcp.env')} tooltip={t('settings.mcp.envTooltip')}>
                  <TextArea rows={3} placeholder={`KEY1=value1\nKEY2=value2`} style={{ fontFamily: 'monospace' }} />
                </Form.Item>
              </>
            )}
          </Card>

          {/* 高级设置区域 */}
          <Collapse
            bordered={false}
            style={{ marginBottom: 16 }}
            activeKey={expandAdvanced ? ['advanced'] : []}
            onChange={(key) => setExpandAdvanced(key.includes('advanced'))}>
            <Collapse.Panel
              header={
                <Flex align="center" gap={8}>
                  <SettingOutlined />
                  {t('settings.mcp.advancedSettings')}
                </Flex>
              }
              key="advanced">
              <Card bordered={false} bodyStyle={{ padding: '8px 0' }}>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      name="timeout"
                      label={
                        <Flex align="center" gap={6}>
                          <ClockCircleOutlined />
                          {t('settings.mcp.timeout')}
                          <Tooltip title={t('settings.mcp.timeoutTooltip')}>
                            <InfoCircleOutlined style={{ color: 'var(--color-text-3)' }} />
                          </Tooltip>
                        </Flex>
                      }>
                      <InputNumber min={1} max={300} defaultValue={60} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>

                  <Col span={12}>
                    <Form.Item
                      name="provider"
                      label={
                        <Flex align="center" gap={6}>
                          <ApiOutlined />
                          {t('settings.mcp.provider')}
                        </Flex>
                      }>
                      <Input placeholder={t('settings.mcp.providerPlaceholder')} />
                    </Form.Item>
                  </Col>

                  <Col span={12}>
                    <Form.Item
                      name="providerUrl"
                      label={
                        <Flex align="center" gap={6}>
                          <GlobalOutlined />
                          {t('settings.mcp.providerUrl')}
                        </Flex>
                      }>
                      <Input placeholder="https://example.com" />
                    </Form.Item>
                  </Col>

                  <Col span={12}>
                    <Form.Item
                      name="logoUrl"
                      label={
                        <Flex align="center" gap={6}>
                          <PictureOutlined />
                          {t('settings.mcp.logoUrl')}
                        </Flex>
                      }>
                      <Input placeholder="https://example.com/logo.png" />
                    </Form.Item>
                  </Col>

                  <Col span={24}>
                    <Form.Item
                      name="tags"
                      label={
                        <Flex align="center" gap={6}>
                          <TagsOutlined />
                          {t('settings.mcp.tags')}
                        </Flex>
                      }>
                      <TextArea
                        rows={2}
                        placeholder={t('settings.mcp.tagsPlaceholder')}
                        style={{ fontFamily: 'monospace' }}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>
            </Collapse.Panel>
          </Collapse>
        </Form>
      )
    }
  ]

  if (server.searchKey) {
    tabs.push({
      key: 'description',
      label: t('settings.mcp.tabs.description'),
      children: <MCPDescription searchKey={server.searchKey} />
    })
  }

  if (server.isActive) {
    tabs.push(
      {
        key: 'tools',
        label: t('settings.mcp.tabs.tools'),
        children: <MCPToolsSection tools={tools} server={server} onToggleTool={handleToggleTool} />
      },
      {
        key: 'prompts',
        label: t('settings.mcp.tabs.prompts'),
        children: <MCPPromptsSection prompts={prompts} />
      },
      {
        key: 'resources',
        label: t('settings.mcp.tabs.resources'),
        children: <MCPResourcesSection resources={resources} />
      }
    )
  }

  return (
    <SettingContainer>
      <SettingGroup style={{ marginBottom: 0 }}>
        <SettingTitle>
          <Flex justify="space-between" align="center" gap={5} style={{ marginRight: 10 }}>
            <ServerName className="text-nowrap">
              {server.logoUrl ? (
                <img
                  src={server.logoUrl}
                  alt={server.name}
                  style={{
                    width: 20,
                    height: 20,
                    marginRight: 8,
                    borderRadius: 4,
                    verticalAlign: 'middle'
                  }}
                />
              ) : (
                <CodeOutlined style={{ marginRight: 8 }} />
              )}
              {server?.name}
            </ServerName>
            <Button
              danger
              icon={<DeleteOutlined />}
              type="text"
              onClick={() => onDeleteMcpServer(server)}
              style={{ margin: '0 8px' }}
            />
          </Flex>
          <Flex align="center" gap={8}>
            <Tooltip title={server.isActive ? t('settings.mcp.deactivate') : t('settings.mcp.activate')}>
              <Switch
                checked={server.isActive}
                key={server.id}
                loading={loadingServer === server.id}
                onChange={onToggleActive}
              />
            </Tooltip>
            {server.isActive && (
              <Tooltip title={t('settings.mcp.refresh')}>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={fetchTools}
                  loading={loadingServer === server.id}
                  type="default"
                  size="middle"
                  shape="circle"
                />
              </Tooltip>
            )}
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={onSave}
              loading={loading}
              disabled={!isFormChanged || activeTab !== 'settings'}>
              {t('common.save')}
            </Button>
          </Flex>
        </SettingTitle>
        <SettingDivider />

        <Tabs
          defaultActiveKey="settings"
          items={tabs}
          onChange={(key) => setActiveTab(key as TabKey)}
          style={{ marginTop: 8 }}
        />
      </SettingGroup>
    </SettingContainer>
  )
}

const ServerName = styled.span`
  font-size: 14px;
  font-weight: 500;
`

export default McpSettings
