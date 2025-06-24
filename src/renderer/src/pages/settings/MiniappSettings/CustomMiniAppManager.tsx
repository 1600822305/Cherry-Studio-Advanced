import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import MinAppIcon from '@renderer/components/Icons/MinAppIcon'
import { useMinapps } from '@renderer/hooks/useMinapps'
import { MinAppType } from '@renderer/types'
import { Button, Empty, Popconfirm, Tooltip } from 'antd'
import { FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import CustomMiniAppForm from './CustomMiniAppForm'

interface CustomMiniAppManagerProps { }

const CustomMiniAppManager: FC<CustomMiniAppManagerProps> = () => {
    const { t } = useTranslation()
    const { minapps, updateMinapps } = useMinapps()

    const [formVisible, setFormVisible] = useState(false)
    const [editingApp, setEditingApp] = useState<MinAppType | undefined>()

    // 获取用户自定义的小程序（ID以custom-开头）
    const customApps = minapps.filter(app => app.id.startsWith('custom-'))

    // 添加自定义小程序
    const handleAddApp = (app: MinAppType) => {
        const updatedApps = [...minapps, app]
        updateMinapps(updatedApps)
    }

    // 编辑自定义小程序
    const handleEditApp = (app: MinAppType) => {
        const updatedApps = minapps.map(item => item.id === app.id ? app : item)
        updateMinapps(updatedApps)
    }

    // 删除自定义小程序
    const handleDeleteApp = (appId: string) => {
        const updatedApps = minapps.filter(app => app.id !== appId)
        updateMinapps(updatedApps)
    }

    // 打开编辑表单
    const openEditForm = (app: MinAppType) => {
        setEditingApp(app)
        setFormVisible(true)
    }

    // 提交表单（添加或编辑）
    const handleFormSubmit = (app: MinAppType) => {
        if (editingApp) {
            handleEditApp(app)
        } else {
            handleAddApp(app)
        }
    }

    return (
        <Container>
            <HeaderContainer>
                <Title>{t('settings.miniapps.custom.title')}</Title>
                <AddButton
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                        setEditingApp(undefined)
                        setFormVisible(true)
                    }}
                >
                    {t('settings.miniapps.custom.add_button')}
                </AddButton>
            </HeaderContainer>

            <AppsContainer>
                {customApps.length === 0 ? (
                    <Empty
                        description={t('settings.miniapps.custom.empty')}
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                ) : (
                    customApps.map(app => (
                        <AppItem key={app.id}>
                            <AppInfo>
                                <MinAppIcon size={24} app={app} />
                                <AppDetails>
                                    <AppName>{app.name}</AppName>
                                    <AppUrl>{app.url}</AppUrl>
                                </AppDetails>
                            </AppInfo>
                            <ActionButtons>
                                <Tooltip title={t('common.edit')}>
                                    <Button
                                        type="text"
                                        icon={<EditOutlined />}
                                        onClick={() => openEditForm(app)}
                                    />
                                </Tooltip>
                                <Popconfirm
                                    title={t('settings.miniapps.custom.delete_confirm')}
                                    onConfirm={() => handleDeleteApp(app.id)}
                                    okText={t('common.yes')}
                                    cancelText={t('common.no')}
                                >
                                    <Tooltip title={t('common.delete')}>
                                        <Button
                                            type="text"
                                            danger
                                            icon={<DeleteOutlined />}
                                        />
                                    </Tooltip>
                                </Popconfirm>
                            </ActionButtons>
                        </AppItem>
                    ))
                )}
            </AppsContainer>

            <CustomMiniAppForm
                visible={formVisible}
                onClose={() => setFormVisible(false)}
                onSubmit={handleFormSubmit}
                editingApp={editingApp}
            />
        </Container>
    )
}

const Container = styled.div`
  margin-top: 16px;
`

const HeaderContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
`

const Title = styled.h3`
  margin: 0;
  font-weight: 500;
  color: var(--color-text);
`

const AddButton = styled(Button)`
  font-size: 13px;
`

const AppsContainer = styled.div`
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  background-color: var(--color-bg-1);
  max-height: 240px;
  overflow-y: auto;
  
  &:empty {
    padding: 40px 0;
    display: flex;
    justify-content: center;
    align-items: center;
  }
`

const AppItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid var(--color-border);
  
  &:last-child {
    border-bottom: none;
  }
`

const AppInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const AppDetails = styled.div`
  display: flex;
  flex-direction: column;
`

const AppName = styled.div`
  font-weight: 500;
  color: var(--color-text);
`

const AppUrl = styled.div`
  font-size: 12px;
  color: var(--color-text-soft);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
`

export default CustomMiniAppManager 