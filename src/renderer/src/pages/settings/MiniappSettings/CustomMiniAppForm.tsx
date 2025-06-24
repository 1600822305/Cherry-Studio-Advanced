import { CloudUploadOutlined, LinkOutlined } from '@ant-design/icons'
import { MinAppType } from '@renderer/types'
import { Button, Form, Input, Modal, Upload } from 'antd'
import { RcFile } from 'antd/es/upload'
import { FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

interface CustomMiniAppFormProps {
    visible: boolean
    onClose: () => void
    onSubmit: (app: MinAppType) => void
    editingApp?: MinAppType
}

const CustomMiniAppForm: FC<CustomMiniAppFormProps> = ({ visible, onClose, onSubmit, editingApp }) => {
    const { t } = useTranslation()
    const [form] = Form.useForm()
    const [iconPreview, setIconPreview] = useState<string | undefined>(editingApp?.logo)
    const isEditing = !!editingApp

    // 处理图标上传并转换为base64
    const handleIconUpload = (file: RcFile) => {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.readAsDataURL(file)
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = (error) => reject(error)
        })
    }

    // 处理表单提交
    const handleSubmit = async () => {
        try {
            const values = await form.validateFields()

            // 创建或更新小程序对象
            const miniApp: MinAppType = {
                id: editingApp?.id || `custom-${Date.now()}`,
                name: values.name,
                url: values.url,
                logo: iconPreview,
                bodered: true
            }

            onSubmit(miniApp)
            form.resetFields()
            setIconPreview(undefined)
            onClose()
        } catch (error) {
            console.error('表单验证失败:', error)
        }
    }

    // 表单初始化
    const resetForm = () => {
        if (isEditing && editingApp) {
            form.setFieldsValue({
                name: editingApp.name,
                url: editingApp.url
            })
            setIconPreview(editingApp.logo)
        } else {
            form.resetFields()
            setIconPreview(undefined)
        }
    }

    // 上传按钮组件
    const uploadButton = (
        <div>
            <CloudUploadOutlined />
            <div style={{ marginTop: 8 }}>{t('settings.miniapps.custom.upload_icon')}</div>
        </div>
    )

    return (
        <Modal
            title={isEditing ? t('settings.miniapps.custom.edit_title') : t('settings.miniapps.custom.add_title')}
            open={visible}
            onCancel={() => {
                form.resetFields()
                setIconPreview(undefined)
                onClose()
            }}
            afterOpenChange={(open) => {
                if (open) resetForm()
            }}
            footer={[
                <Button key="cancel" onClick={onClose}>
                    {t('common.cancel')}
                </Button>,
                <Button key="submit" type="primary" onClick={handleSubmit}>
                    {isEditing ? t('common.save') : t('common.add')}
                </Button>
            ]}
        >
            <Form form={form} layout="vertical">
                <Form.Item
                    name="name"
                    label={t('settings.miniapps.custom.name')}
                    rules={[{ required: true, message: t('settings.miniapps.custom.name_required') }]}
                >
                    <Input placeholder={t('settings.miniapps.custom.name_placeholder')} />
                </Form.Item>

                <Form.Item
                    name="url"
                    label={t('settings.miniapps.custom.url')}
                    rules={[
                        { required: true, message: t('settings.miniapps.custom.url_required') },
                        { type: 'url', message: t('settings.miniapps.custom.url_invalid') }
                    ]}
                >
                    <Input
                        placeholder={t('settings.miniapps.custom.url_placeholder')}
                        prefix={<LinkOutlined />}
                    />
                </Form.Item>

                <Form.Item label={t('settings.miniapps.custom.icon')}>
                    <UploadContainer>
                        <Upload
                            name="icon"
                            listType="picture-card"
                            showUploadList={false}
                            beforeUpload={async (file) => {
                                try {
                                    const base64 = await handleIconUpload(file)
                                    setIconPreview(base64)
                                } catch (error) {
                                    console.error('图标上传失败:', error)
                                }
                                return false
                            }}
                            accept="image/*"
                        >
                            {iconPreview ? (
                                <AppIconPreview src={iconPreview} alt="app icon" />
                            ) : (
                                uploadButton
                            )}
                        </Upload>
                        <div>
                            <UploadHint>{t('settings.miniapps.custom.icon_hint')}</UploadHint>
                            {iconPreview && (
                                <Button
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setIconPreview(undefined)
                                    }}
                                >
                                    {t('settings.miniapps.custom.remove_icon')}
                                </Button>
                            )}
                        </div>
                    </UploadContainer>
                </Form.Item>
            </Form>
        </Modal>
    )
}

const UploadContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`

const UploadHint = styled.div`
  color: var(--color-text-soft);
  font-size: 12px;
  margin-bottom: 8px;
`

const AppIconPreview = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
`

export default CustomMiniAppForm 