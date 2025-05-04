import { InboxOutlined } from '@ant-design/icons'
import { Button, Form, Input, message, Modal, Tabs, Upload } from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import { FC, useState } from 'react'

const { TabPane } = Tabs
const { Dragger } = Upload

interface AddPluginModalProps {
  visible: boolean
  onCancel: () => void
  onOk: (pluginId: string, pluginFile?: File) => void
}

const AddPluginModal: FC<AddPluginModalProps> = ({ visible, onCancel, onOk }) => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('id')
  const [pluginFile, setPluginFile] = useState<File | null>(null)

  const handleOk = async () => {
    try {
      setLoading(true)

      if (activeTab === 'id') {
        const values = await form.validateFields()
        onOk(values.pluginId)
      } else if (activeTab === 'upload' && pluginFile) {
        onOk('', pluginFile)
      } else {
        message.error('请上传插件包或输入插件ID')
        setLoading(false)
        return
      }
    } catch (error) {
      console.error('表单验证失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const uploadProps = {
    name: 'file',
    multiple: false,
    accept: '.zip,.js,.ts,.jsx,.tsx',
    beforeUpload: (file: File) => {
      setPluginFile(file)
      return false // 阻止自动上传
    },
    onRemove: () => {
      setPluginFile(null)
    },
    fileList: pluginFile ? [pluginFile as unknown as UploadFile] : []
  }

  return (
    <Modal
      title="添加插件"
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button key="ok" type="primary" loading={loading} onClick={handleOk}>
          确认
        </Button>
      ]}>
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab="插件ID" key="id">
          <Form form={form} layout="vertical">
            <Form.Item
              label="插件ID"
              name="pluginId"
              rules={[{ required: activeTab === 'id', message: '请输入插件ID' }]}>
              <Input placeholder="例如：my-plugin" />
            </Form.Item>
          </Form>
        </TabPane>
        <TabPane tab="上传插件包" key="upload">
          <Dragger {...uploadProps}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">支持单个.zip插件包或JavaScript/TypeScript文件</p>
          </Dragger>
        </TabPane>
      </Tabs>
    </Modal>
  )
}

export default AddPluginModal
