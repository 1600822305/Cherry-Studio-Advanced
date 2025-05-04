import {
  DeleteOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  MessageOutlined,
  PlusOutlined,
  StopOutlined
} from '@ant-design/icons'
import WorkspaceService from '@renderer/services/WorkspaceService'
import { RootState } from '@renderer/store'
import { selectEnableWorkspacePrompt, setEnableWorkspacePrompt } from '@renderer/store/workspace'
import type { MenuProps } from 'antd'
import { Button, Dropdown, Empty, Input, message, Modal, Space, Tooltip } from 'antd'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDispatch, useSelector } from 'react-redux'
import styled from 'styled-components'

const WorkspaceSelectorContainer = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 16px;
`

const WorkspaceLabel = styled.span`
  margin-right: 8px;
  font-weight: 500;
`

const WorkspacePath = styled.span`
  color: #999;
  font-size: 12px;
`

const WorkspaceSelector: React.FC = () => {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('')
  const [editingWorkspace, setEditingWorkspace] = useState<string | null>(null)

  // 从Redux获取工作区状态
  const workspaces = useSelector((state: RootState) => state.workspace.workspaces)
  const currentWorkspaceId = useSelector((state: RootState) => state.workspace.currentWorkspaceId)
  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) || null
  const enableWorkspacePrompt = useSelector(selectEnableWorkspacePrompt)

  // 初始化工作区
  useEffect(() => {
    WorkspaceService.initWorkspaces()
  }, [])

  // 选择工作区文件夹
  const handleSelectFolder = async () => {
    try {
      console.log('开始选择工作区文件夹...')
      const folderPath = await WorkspaceService.selectWorkspaceFolder()
      console.log('选择的工作区文件夹路径:', folderPath)

      if (folderPath) {
        // 如果是编辑模式，更新现有工作区
        if (isEditMode && editingWorkspace) {
          console.log('更新工作区:', editingWorkspace, folderPath)
          WorkspaceService.updateWorkspace(editingWorkspace, {
            name: workspaceName,
            path: folderPath,
            updatedAt: Date.now()
          })
          message.success(t('workspace.updated'))
        } else {
          // 否则创建新工作区
          console.log('创建新工作区:', workspaceName, folderPath)
          const workspaceName2 = workspaceName || folderPath.split(/[\\/]/).pop() || 'Workspace'
          console.log('工作区名称:', workspaceName2)
          const newWorkspace = await WorkspaceService.createWorkspace(workspaceName2, folderPath)
          // 将新创建的工作区设置为当前工作区
          console.log('设置新工作区为当前工作区:', newWorkspace.id)
          WorkspaceService.setCurrentWorkspace(newWorkspace.id)
          message.success(t('workspace.created'))
        }
        setIsModalVisible(false)
        setWorkspaceName('')
        setIsEditMode(false)
        setEditingWorkspace(null)
      } else {
        console.log('没有选择文件夹或选择被取消')
      }
    } catch (error) {
      console.error('Failed to select workspace folder:', error)
      message.error(t('workspace.selectFolderError'))
    }
  }

  // 切换工作区
  const handleSwitchWorkspace = (workspaceId: string) => {
    WorkspaceService.setCurrentWorkspace(workspaceId)
  }

  // 编辑工作区
  const handleEditWorkspace = (workspace: any) => {
    setIsEditMode(true)
    setEditingWorkspace(workspace.id)
    setWorkspaceName(workspace.name)
    setIsModalVisible(true)
  }

  // 删除工作区
  const handleDeleteWorkspace = (workspaceId: string) => {
    Modal.confirm({
      title: t('workspace.confirmDelete'),
      content: t('workspace.deleteWarning'),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => {
        WorkspaceService.deleteWorkspace(workspaceId)
        message.success(t('workspace.deleted'))
      }
    })
  }

  // 切换工作区对AI的可见性
  const handleToggleVisibility = (workspaceId: string, currentVisibility?: boolean) => {
    // 切换可见性状态
    const newVisibility = !(currentVisibility !== false) // 如果当前是undefined或true，则设置为false，否则设置为true

    WorkspaceService.updateWorkspace(workspaceId, {
      visibleToAI: newVisibility,
      updatedAt: Date.now()
    })

    message.success(newVisibility ? t('workspace.visibilityEnabled') : t('workspace.visibilityDisabled'))
  }

  // 切换工作区提示词状态
  const handleToggleWorkspacePrompt = () => {
    const newState = !enableWorkspacePrompt
    dispatch(setEnableWorkspacePrompt(newState))
    message.success(
      newState ? '已启用工作区提示词，AI将能看到工作区文件结构' : '已禁用工作区提示词，AI将不会看到工作区文件结构'
    )
  }

  // 工作区下拉菜单项
  const items: MenuProps['items'] = [
    ...(workspaces.length > 0
      ? workspaces.map((workspace) => ({
          key: workspace.id,
          onClick: () => handleSwitchWorkspace(workspace.id),
          label: (
            <Space>
              <span>{workspace.name}</span>
              <WorkspacePath>{workspace.path}</WorkspacePath>
              <Tooltip title={workspace.visibleToAI !== false ? t('workspace.hideFromAI') : t('workspace.showToAI')}>
                <Button
                  type="text"
                  size="small"
                  icon={workspace.visibleToAI !== false ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggleVisibility(workspace.id, workspace.visibleToAI)
                  }}
                />
              </Tooltip>
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={(e) => {
                  e.stopPropagation()
                  handleEditWorkspace(workspace)
                }}
              />
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteWorkspace(workspace.id)
                }}
              />
            </Space>
          )
        }))
      : [
          {
            key: 'empty',
            disabled: true,
            label: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('workspace.noWorkspaces')} />
          }
        ]),
    {
      type: 'divider'
    },
    {
      key: 'add',
      icon: <PlusOutlined />,
      label: t('workspace.addNew'),
      onClick: () => {
        setIsEditMode(false)
        setWorkspaceName('')
        setEditingWorkspace(null)
        setIsModalVisible(true)
      }
    }
  ]

  return (
    <>
      <WorkspaceSelectorContainer>
        <WorkspaceLabel>{t('workspace.current')}:</WorkspaceLabel>
        <Dropdown menu={{ items }} trigger={['click']}>
          <Button>
            {currentWorkspace ? currentWorkspace.name : t('workspace.select')} <FolderOpenOutlined />
          </Button>
        </Dropdown>

        <Tooltip title={t('workspace.addNew')}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ marginLeft: 8 }}
            onClick={() => {
              setIsEditMode(false)
              setWorkspaceName('')
              setEditingWorkspace(null)
              setIsModalVisible(true)
            }}
          />
        </Tooltip>

        <Tooltip title={enableWorkspacePrompt ? '点击禁用工作区提示词' : '点击启用工作区提示词'}>
          <Button
            type={enableWorkspacePrompt ? 'default' : 'dashed'}
            icon={enableWorkspacePrompt ? <MessageOutlined /> : <StopOutlined />}
            style={{ marginLeft: 8 }}
            onClick={handleToggleWorkspacePrompt}>
            {enableWorkspacePrompt ? '已启用提示词' : '已禁用提示词'}
          </Button>
        </Tooltip>
      </WorkspaceSelectorContainer>

      <Modal
        title={isEditMode ? t('workspace.edit') : t('workspace.add')}
        open={isModalVisible}
        onOk={handleSelectFolder}
        onCancel={() => {
          setIsModalVisible(false)
          setWorkspaceName('')
          setIsEditMode(false)
          setEditingWorkspace(null)
        }}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input
            placeholder={t('workspace.nameHint')}
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
          />
          <Button icon={<FolderOpenOutlined />} onClick={handleSelectFolder}>
            {t('workspace.selectFolder')}
          </Button>
        </Space>
      </Modal>
    </>
  )
}

export default WorkspaceSelector
