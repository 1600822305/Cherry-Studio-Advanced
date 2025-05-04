/**
 * 文档阅读器设置组件
 */
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { Button, Checkbox, Form, Input, message, Switch } from 'antd'
import { useEffect, useState } from 'react'

// 默认设置
const DEFAULT_SETTINGS = {
  defaultZoom: 100,
  rememberLastOpenedFiles: true,
  maxRecentFiles: 10,
  autoSaveInterval: 5,
  darkMode: false,
  fileAssociations: {
    pdf: true,
    docx: true,
    xlsx: true,
    pptx: true,
    txt: true,
    md: true,
    html: true,
    image: true
  }
}

// 文档阅读器设置组件
const DocumentReaderSettings = ({ api }: { api: any }) => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  // 加载设置
  useEffect(() => {
    if (api) {
      const savedSettings = api.getSettings('document-reader')
      if (savedSettings && Object.keys(savedSettings).length > 0) {
        setSettings({ ...DEFAULT_SETTINGS, ...savedSettings })
      }
    }
  }, [api])

  // 表单值变更时更新
  useEffect(() => {
    form.setFieldsValue(settings)
  }, [settings, form])

  // 保存设置
  const saveSettings = async (values: any) => {
    setLoading(true)
    try {
      if (api) {
        api.saveSettings('document-reader', values)
        setSettings(values)
        message.success('设置已保存')
      } else {
        message.error('无法保存设置：API未初始化')
      }
    } catch (error) {
      console.error('保存设置失败:', error)
      message.error('保存设置失败')
    } finally {
      setLoading(false)
    }
  }

  // 重置设置
  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS)
    form.setFieldsValue(DEFAULT_SETTINGS)
    message.info('设置已重置为默认值')
  }

  return (
    <div className="document-reader-settings">
      <h2>文档阅读器设置</h2>

      <Form form={form} layout="vertical" initialValues={settings} onFinish={saveSettings}>
        <Form.Item
          label="默认缩放比例 (%)"
          name="defaultZoom"
          rules={[{ required: true, message: '请输入默认缩放比例' }]}>
          <Input type="number" min={50} max={200} />
        </Form.Item>

        <Form.Item label="记住最近打开的文件" name="rememberLastOpenedFiles" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Form.Item
          label="最近文件数量上限"
          name="maxRecentFiles"
          rules={[{ required: true, message: '请输入最近文件数量上限' }]}>
          <Input type="number" min={1} max={50} />
        </Form.Item>

        <Form.Item
          label="自动保存间隔（分钟）"
          name="autoSaveInterval"
          rules={[{ required: true, message: '请输入自动保存间隔' }]}>
          <Input type="number" min={1} max={60} />
        </Form.Item>

        <Form.Item label="深色模式" name="darkMode" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Form.Item label="文件关联">
          <Form.Item name={['fileAssociations', 'pdf']} valuePropName="checked" noStyle>
            <Checkbox>PDF文件</Checkbox>
          </Form.Item>
          <br />
          <Form.Item name={['fileAssociations', 'docx']} valuePropName="checked" noStyle>
            <Checkbox>Word文档</Checkbox>
          </Form.Item>
          <br />
          <Form.Item name={['fileAssociations', 'xlsx']} valuePropName="checked" noStyle>
            <Checkbox>Excel表格</Checkbox>
          </Form.Item>
          <br />
          <Form.Item name={['fileAssociations', 'pptx']} valuePropName="checked" noStyle>
            <Checkbox>PowerPoint演示文稿</Checkbox>
          </Form.Item>
          <br />
          <Form.Item name={['fileAssociations', 'txt']} valuePropName="checked" noStyle>
            <Checkbox>文本文件</Checkbox>
          </Form.Item>
          <br />
          <Form.Item name={['fileAssociations', 'md']} valuePropName="checked" noStyle>
            <Checkbox>Markdown文件</Checkbox>
          </Form.Item>
          <br />
          <Form.Item name={['fileAssociations', 'html']} valuePropName="checked" noStyle>
            <Checkbox>HTML文件</Checkbox>
          </Form.Item>
          <br />
          <Form.Item name={['fileAssociations', 'image']} valuePropName="checked" noStyle>
            <Checkbox>图片文件</Checkbox>
          </Form.Item>
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />} style={{ marginRight: 8 }}>
            保存设置
          </Button>
          <Button onClick={resetSettings} icon={<ReloadOutlined />}>
            重置为默认值
          </Button>
        </Form.Item>
      </Form>
    </div>
  )
}

export default DocumentReaderSettings
