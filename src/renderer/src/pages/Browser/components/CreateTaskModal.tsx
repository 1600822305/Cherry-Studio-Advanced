import { Model } from '@renderer/types'
import {
  Button,
  Card,
  Checkbox,
  Divider,
  Form,
  Input,
  List,
  message,
  Modal,
  Radio,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Typography
} from 'antd'
import React, { useEffect, useState } from 'react'

import { AITask, generateTaskStepsWithAI } from '../utils/aiAutomation'

const { TextArea } = Input
const { TabPane } = Tabs
const { Title, Paragraph, Text } = Typography
const { Option } = Select

// 预定义任务模板
const TASK_TEMPLATES = [
  {
    title: '搜索并总结',
    description: '搜索特定主题并总结查找到的信息',
    instruction: '搜索人工智能最新进展并总结前三个结果',
    tags: ['搜索', '总结']
  },
  {
    title: '比较两个主题',
    description: '搜索并比较两个不同主题的信息',
    instruction: '比较ChatGPT和Claude之间的区别',
    tags: ['搜索', '比较']
  },
  {
    title: '查找特定信息',
    description: '在网页上查找特定的信息或数据',
    instruction: '查找2023年世界AI大会的举办时间和地点',
    tags: ['搜索', '查找']
  },
  {
    title: '分析网站内容',
    description: '访问特定网站并分析其内容',
    instruction: '访问OpenAI网站并总结最新产品功能',
    tags: ['浏览', '分析']
  },
  {
    title: '收集学习资源',
    description: '收集特定主题的学习资源和教程',
    instruction: '收集5个学习TypeScript的最佳教程和资源',
    tags: ['搜索', '收集']
  },
  {
    title: '多步骤复杂任务',
    description: '执行需要多个步骤和决策的复杂任务',
    instruction: '搜索三种流行的JavaScript框架，比较它们的性能和特性，然后找出最适合初学者的框架',
    tags: ['复杂', '多步骤', '比较']
  }
]

interface CreateTaskModalProps {
  visible: boolean
  onClose: () => void
  onCreateTask: (task: AITask) => void
  selectedModel?: Model
}

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ visible, onClose, onCreateTask, selectedModel }) => {
  const [form] = Form.useForm()
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('instruction')
  const [previewSteps, setPreviewSteps] = useState<string[]>([])
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false)
  const [advancedOptions, setAdvancedOptions] = useState(false)
  // const [autoExecute, setAutoExecute] = useState(true) // 暂时未使用

  // 新增高级选项状态
  const [taskComplexity, setTaskComplexity] = useState<'simple' | 'medium' | 'complex'>('medium')
  const [enableRetry, setEnableRetry] = useState(true)
  const [enableErrorRecovery, setEnableErrorRecovery] = useState(true)
  const [searchEngine, setSearchEngine] = useState<'baidu' | 'google' | 'bing'>('baidu')

  // 当模态框显示状态改变时重置状态
  useEffect(() => {
    if (!visible) {
      setPreviewSteps([])
      setActiveTab('instruction')
      setAdvancedOptions(false)
      // setAutoExecute(true) // 暂时未使用
      setTaskComplexity('medium')
      setEnableRetry(true)
      setEnableErrorRecovery(true)
      setSearchEngine('baidu')
    }
  }, [visible])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setIsLoading(true)

      // 使用AI生成任务步骤
      const task = await generateTaskStepsWithAI(values.instruction, selectedModel)

      // 如果有高级选项且有自定义步骤
      if (advancedOptions && values.customSteps) {
        const steps = values.customSteps
          .split('\n')
          .map((step: string) => step.trim())
          .filter((step: string) => step.length > 0)

        if (steps.length > 0) {
          task.steps = steps
        }
      }

      // 添加高级配置到任务
      if (advancedOptions) {
        if (!task.executionState) {
          task.executionState = {}
        }

        // 设置任务复杂度
        task.executionState.complexity = taskComplexity

        // 设置错误处理策略
        task.executionState.retryEnabled = enableRetry
        task.executionState.errorRecoveryEnabled = enableErrorRecovery

        // 设置首选搜索引擎
        task.executionState.preferredSearchEngine = searchEngine

        // 如果有自定义初始状态
        if (values.initialState) {
          try {
            const initialState = JSON.parse(values.initialState)
            task.executionState = {
              ...task.executionState,
              ...initialState
            }
          } catch (error) {
            console.error('解析自定义初始状态失败:', error)
          }
        }
      }

      // 执行任务
      onCreateTask(task)

      // 重置表单并关闭模态框
      resetForm()
    } catch (error) {
      console.error('Error generating task steps:', error)
      message.error('生成任务步骤失败，请重试')
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    form.resetFields()
    setIsLoading(false)
    setPreviewSteps([])
    onClose()
  }

  // 填充模板指令
  const applyTemplate = (template: (typeof TASK_TEMPLATES)[0]) => {
    form.setFieldsValue({
      instruction: template.instruction
    })

    // 根据模板类型设置适当的复杂度
    if (template.tags.includes('复杂') || template.tags.includes('多步骤') || template.tags.includes('比较')) {
      setTaskComplexity('complex')
    } else if (template.tags.includes('分析') || template.tags.includes('收集')) {
      setTaskComplexity('medium')
    } else {
      setTaskComplexity('simple')
    }

    handleGeneratePreview()
  }

  // 生成预览步骤
  const handleGeneratePreview = async () => {
    try {
      const values = await form.validateFields(['instruction'])
      if (!values.instruction) return

      setIsGeneratingPreview(true)

      // 使用AI生成任务步骤预览
      const task = await generateTaskStepsWithAI(values.instruction, selectedModel)
      setPreviewSteps(task.steps)

      // 如果在高级模式，设置自定义步骤
      if (advancedOptions) {
        form.setFieldsValue({
          customSteps: task.steps.join('\n')
        })
      }
    } catch (error) {
      console.error('Error generating preview:', error)
      message.error('生成预览失败，请重试')
    } finally {
      setIsGeneratingPreview(false)
    }
  }

  return (
    <Modal title="创建AI自动化任务" open={visible} onCancel={resetForm} footer={null} width={700}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ marginBottom: 16 }}>
        <TabPane tab="任务指令" key="instruction">
          <Form form={form} layout="vertical">
            <Form.Item
              name="instruction"
              label="任务指令"
              rules={[{ required: true, message: '请输入任务指令' }]}
              help="描述你希望AI助手执行的任务，具体越好效果越好">
              <TextArea
                placeholder="例如：搜索人工智能最新进展并总结前三个结果"
                rows={3}
                disabled={isLoading}
                autoSize={{ minRows: 3, maxRows: 6 }}
              />
            </Form.Item>

            <div style={{ marginBottom: 16 }}>
              <Title level={5}>任务模板</Title>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TASK_TEMPLATES.map((template, index) => (
                  <Card
                    key={index}
                    size="small"
                    title={template.title}
                    style={{ width: 200, marginBottom: 8, cursor: 'pointer' }}
                    onClick={() => applyTemplate(template)}
                    hoverable>
                    <div style={{ fontSize: 12, marginBottom: 8 }}>{template.description}</div>
                    <div>
                      {template.tags.map((tag) => (
                        <Tag key={tag} color="blue">
                          {tag}
                        </Tag>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <Divider />

            <div style={{ marginBottom: 16 }}>
              <Space style={{ marginBottom: 16 }}>
                <Title level={5} style={{ margin: 0 }}>
                  任务步骤预览
                </Title>
                <Button type="default" size="small" onClick={handleGeneratePreview} disabled={isGeneratingPreview}>
                  生成预览
                </Button>
              </Space>

              {isGeneratingPreview ? (
                <div style={{ textAlign: 'center', padding: 16 }}>
                  <Spin /> <span style={{ marginLeft: 8 }}>正在生成预览...</span>
                </div>
              ) : previewSteps.length > 0 ? (
                <List
                  size="small"
                  bordered
                  dataSource={previewSteps}
                  renderItem={(step, index) => (
                    <List.Item>
                      <Text mark>{index + 1}.</Text> {step}
                    </List.Item>
                  )}
                />
              ) : (
                <Paragraph type="secondary" style={{ textAlign: 'center' }}>
                  点击"生成预览"查看AI将执行的具体步骤
                </Paragraph>
              )}
            </div>

            <Divider />

            <div style={{ marginBottom: 16 }}>
              <Space align="center">
                <Switch checked={advancedOptions} onChange={setAdvancedOptions} />
                <Text strong>高级选项</Text>
              </Space>
            </div>

            {advancedOptions && (
              <>
                <Form.Item
                  name="customSteps"
                  label="自定义步骤（每行一个步骤）"
                  help="可以根据预览修改或自定义任务步骤">
                  <TextArea
                    rows={5}
                    placeholder={
                      '例如：\n搜索"人工智能最新进展"\n分析搜索结果页面\n点击最相关的搜索结果\n分析页面内容并提取相关信息'
                    }
                    disabled={isLoading}
                  />
                </Form.Item>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: 16 }}>
                  <div style={{ minWidth: '200px' }}>
                    <Title level={5}>任务复杂度</Title>
                    <Radio.Group
                      value={taskComplexity}
                      onChange={(e) => setTaskComplexity(e.target.value)}
                      style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <Radio value="simple">简单 (单一查询)</Radio>
                      <Radio value="medium">中等 (多步骤)</Radio>
                      <Radio value="complex">复杂 (多任务/比较/分析)</Radio>
                    </Radio.Group>
                  </div>

                  <div style={{ minWidth: '200px' }}>
                    <Title level={5}>错误处理</Title>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <Checkbox checked={enableRetry} onChange={(e) => setEnableRetry(e.target.checked)}>
                        启用步骤重试
                      </Checkbox>
                      <Checkbox
                        checked={enableErrorRecovery}
                        onChange={(e) => setEnableErrorRecovery(e.target.checked)}>
                        启用智能错误恢复
                      </Checkbox>
                    </div>
                  </div>

                  <div style={{ minWidth: '200px' }}>
                    <Title level={5}>搜索引擎偏好</Title>
                    <Select style={{ width: '100%' }} value={searchEngine} onChange={(value) => setSearchEngine(value)}>
                      <Option value="baidu">百度</Option>
                      <Option value="google">谷歌</Option>
                      <Option value="bing">必应</Option>
                    </Select>
                  </div>
                </div>

                <Form.Item
                  name="initialState"
                  label="自定义初始状态（JSON格式）"
                  help="高级用户可以设置任务的初始状态数据">
                  <TextArea rows={3} placeholder={'{"key1": "value1", "key2": "value2"}'} disabled={isLoading} />
                </Form.Item>
              </>
            )}

            <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
              <Space>
                <Button onClick={resetForm}>取消</Button>
                <Button type="primary" onClick={handleSubmit} loading={isLoading}>
                  创建并执行
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </TabPane>

        <TabPane tab="使用帮助" key="help">
          <Title level={4}>自动化任务使用说明</Title>

          <Title level={5}>什么是自动化任务？</Title>
          <Paragraph>
            自动化任务允许您用自然语言指令让AI助手自动执行一系列浏览器操作，比如搜索信息、点击链接、分析网页内容等。
          </Paragraph>

          <Title level={5}>如何创建有效的任务？</Title>
          <Paragraph>
            <ul>
              <li>使用清晰、具体的指令描述你想要完成的任务</li>
              <li>可以使用预设模板快速开始</li>
              <li>使用"生成预览"查看AI将执行的步骤</li>
              <li>高级选项中可以自定义每个执行步骤</li>
            </ul>
          </Paragraph>

          <Title level={5}>支持的任务类型</Title>
          <Paragraph>
            <ul>
              <li>
                <Text strong>搜索和提取信息</Text>：搜索特定主题并提取相关信息
              </li>
              <li>
                <Text strong>比较分析</Text>：搜索并比较不同主题的信息
              </li>
              <li>
                <Text strong>网站浏览</Text>：访问特定网站并分析内容
              </li>
              <li>
                <Text strong>点击交互</Text>：点击链接、按钮等网页元素
              </li>
              <li>
                <Text strong>资源收集</Text>：收集特定主题的资源和信息
              </li>
              <li>
                <Text strong>复杂多步骤任务</Text>：执行需要多次决策的复杂操作
              </li>
            </ul>
          </Paragraph>

          <Title level={5}>高级选项说明</Title>
          <Paragraph>
            <ul>
              <li>
                <Text strong>自定义步骤</Text>：手动编辑或调整AI生成的执行步骤
              </li>
              <li>
                <Text strong>任务复杂度</Text>：设置任务的复杂程度，影响执行策略
              </li>
              <li>
                <Text strong>错误处理</Text>：配置任务遇到问题时的重试和恢复策略
              </li>
              <li>
                <Text strong>搜索引擎偏好</Text>：选择执行搜索操作时使用的默认引擎
              </li>
              <li>
                <Text strong>自定义初始状态</Text>：为高级用户提供的任务状态初始化选项
              </li>
            </ul>
          </Paragraph>
        </TabPane>
      </Tabs>
    </Modal>
  )
}

export default CreateTaskModal
