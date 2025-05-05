import 'katex/dist/katex.min.css'
import '@renderer/assets/styles/markdown.scss'
import '../styles/ChatButtonFix.css' // 导入修复按钮点击问题的CSS
import '../styles/ChatButtonOverride.css' // 导入覆盖样式，修复按钮点击问题
import '../styles/ChatModelSelectorFix.css' // 导入修复模型选择器问题的CSS
import '../styles/ButtonClickFix.css' // 导入专门修复按钮点击问题的CSS

import {
  ClearOutlined,
  CloseOutlined,
  ExpandOutlined,
  ReadOutlined,
  RobotOutlined,
  SettingOutlined,
  ShrinkOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import { useDefaultAssistant } from '@renderer/hooks/useAssistant'
import { getDefaultModel } from '@renderer/services/AssistantService'
import { throttledSyncBrowserChatMessages } from '@renderer/services/BrowserChatSyncService'
import { Model } from '@renderer/types'
import { Button, Input, List, message, Modal, Space, Spin, Tooltip } from 'antd'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import { ChatSidebarState } from '../index'
import {
  ChatSidebarContainer,
  ChatSidebarHeader,
  EmptyMessage,
  InputContainer,
  LoadingContainer,
  MessageContent,
  MessageItem,
  MessagesContainer,
  MessageTimestamp,
  ModelIndicator
} from '../styles/ChatSidebarStyles'
import { AITask, decomposeComplexTask, executeAITask, executeComplexTask } from '../utils/aiAutomation'
import { letAIControlBrowser } from '../utils/aiController'
import { addChatMessage, ChatMessage, generateAIResponse, generateUniqueId, getChatMessages } from '../utils/chatUtils'
import { getWebviewContent } from '../utils/webContentUtils'
import { clickAndGetContent, getClickableElements } from '../utils/webInteractionUtils'
import CreateTaskModal from './CreateTaskModal'
import ModelSelector from './ModelSelector'
import TaskExecutionPanel from './TaskExecutionPanel'

// 聊天侧边栏组件
interface ChatSidebarProps {
  visible: boolean
  onClose: () => void
  activeWebview?: React.RefObject<Electron.WebviewTag> // 当前活动的webview引用
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ visible, onClose, activeWebview }): React.ReactNode => {
  const { t } = useTranslation() // 国际化函数
  const { defaultAssistant } = useDefaultAssistant() // 默认助手

  // 使用这些变量以避免未使用警告
  useEffect(() => {
    if (defaultAssistant) {
      console.debug(`Using translation: ${t('common.ok')} and assistant: ${defaultAssistant.name || 'default'}`)
    }
  }, [t, defaultAssistant])
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState<Model | undefined>(getDefaultModel())
  const [showModelSelector, setShowModelSelector] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // 自动点击相关状态
  const [showElementSelector, setShowElementSelector] = useState(false)
  const [clickableElements, setClickableElements] = useState<Array<{ selector: string; text: string; tag: string }>>([])
  const [isAutoInteracting, setIsAutoInteracting] = useState(false)

  // AI任务相关状态
  const [currentTask, setCurrentTask] = useState<AITask | null>(null)
  const [showTaskProgress, setShowTaskProgress] = useState(false)
  const [isTaskRunning, setIsTaskRunning] = useState(false)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showToolsModal, setShowToolsModal] = useState(false)

  // 使用这些变量以避免未使用警告
  useEffect(() => {
    if (isAutoInteracting || isTaskRunning) {
      // 这里不需要实际做任何事情，只是为了使用变量
      console.debug('Auto interaction or task running state changed')
    }
  }, [isAutoInteracting, isTaskRunning])

  // 同步本地扩展状态与全局状态
  useEffect(() => {
    setExpanded(ChatSidebarState.isExpanded)
  }, [ChatSidebarState.isExpanded])

  // 加载历史消息
  useEffect(() => {
    if (visible) {
      const savedMessages = getChatMessages()
      setMessages(savedMessages)

      // 同步消息到主界面
      throttledSyncBrowserChatMessages()
    }
  }, [visible])

  // 处理展开/收缩
  const handleToggleExpand = () => {
    const newExpandedState = !expanded
    setExpanded(newExpandedState)
    ChatSidebarState.setIsExpanded(newExpandedState)
  }

  // 处理清除聊天历史
  const handleClearChat = () => {
    localStorage.removeItem('browser_chat_messages')
    setMessages([])

    // 同步清除操作到主界面
    throttledSyncBrowserChatMessages()
  }

  // 处理执行AI任务
  const handleExecuteTask = async (task: AITask) => {
    if (!activeWebview || !activeWebview.current) {
      message.error('无法执行任务，请确保网页已加载')
      return
    }

    try {
      console.log('开始执行AI任务:', task.description)
      setIsTaskRunning(true)
      setIsLoading(true)

      // 创建任务开始消息
      const taskStartMessage: ChatMessage = {
        id: generateUniqueId(),
        role: 'assistant',
        content: `开始执行任务: ${task.description}`,
        timestamp: new Date().toISOString()
      }

      // 保存到本地存储
      let updatedMessages = addChatMessage(taskStartMessage)
      setMessages(updatedMessages)

      // 检查任务复杂度并可能分解为子任务
      let decomposedTask = task
      if (task.steps.length > 5) {
        try {
          // 尝试分解复杂任务
          console.log('分解复杂任务...')
          decomposedTask = await decomposeComplexTask(task, selectedModel)
          if (decomposedTask.subtasks && decomposedTask.subtasks.length > 0) {
            console.log(`成功将任务分解为${decomposedTask.subtasks.length}个子任务`)
          }
        } catch (error) {
          console.error('分解任务失败:', error)
          // 继续使用原始任务
        }
      }

      // 显示任务进度
      setCurrentTask({ ...decomposedTask })
      setShowTaskProgress(true)

      // 根据任务是否有子任务选择执行方法
      let updatedTask: AITask
      if (decomposedTask.subtasks && decomposedTask.subtasks.length > 0) {
        // 执行复杂任务（包含子任务）
        console.log('执行复杂任务...')
        updatedTask = await executeComplexTask(decomposedTask, activeWebview.current, selectedModel)
      } else {
        // 执行单一任务
        console.log('执行第一步:', task.steps[task.currentStep])
        updatedTask = await executeAITask(decomposedTask, activeWebview.current, selectedModel)
        console.log('第一步执行结果:', updatedTask)

        // 继续执行后续步骤
        while (!updatedTask.completed && !updatedTask.error && activeWebview.current) {
          // 更新当前任务状态
          setCurrentTask({ ...updatedTask })

          // 如果已完成所有步骤，退出循环
          if (updatedTask.currentStep >= updatedTask.steps.length) {
            console.log('所有步骤已完成')
            break
          }

          // 执行下一步
          console.log('执行下一步:', updatedTask.steps[updatedTask.currentStep])
          updatedTask = await executeAITask({ ...updatedTask }, activeWebview.current, selectedModel)
          console.log('步骤执行结果:', updatedTask)
        }
      }

      // 设置最终任务状态
      setCurrentTask({ ...updatedTask })

      // 任务完成或出错
      if (updatedTask.error) {
        console.error('任务执行出错:', updatedTask.error)
        // 创建错误消息
        const errorMessage: ChatMessage = {
          id: generateUniqueId(),
          role: 'assistant',
          content: `执行任务时出现错误: ${updatedTask.error}`,
          timestamp: new Date().toISOString()
        }

        // 保存到本地存储
        updatedMessages = addChatMessage(errorMessage)
        setMessages(updatedMessages)
      } else {
        console.log('任务执行成功')
        // 创建任务完成消息
        const taskCompleteMessage: ChatMessage = {
          id: generateUniqueId(),
          role: 'assistant',
          content: `任务已完成: ${updatedTask.description}`,
          timestamp: new Date().toISOString()
        }

        // 保存到本地存储
        updatedMessages = addChatMessage(taskCompleteMessage)
        setMessages(updatedMessages)

        // 如果有任务结果，自动添加到对话中
        if (updatedTask.result) {
          addTaskResultToChat(updatedTask.result)
        }
      }

      // 同步消息到主界面
      throttledSyncBrowserChatMessages()
    } catch (error) {
      console.error('Error executing AI task:', error)

      // 创建错误消息
      const errorMessage: ChatMessage = {
        id: generateUniqueId(),
        role: 'assistant',
        content: `执行任务时出现错误: ${error}`,
        timestamp: new Date().toISOString()
      }

      // 保存到本地存储
      const updatedMessages = addChatMessage(errorMessage)
      setMessages(updatedMessages)

      message.error(`执行任务失败: ${error}`)
    } finally {
      console.log('任务执行完成，重置状态')
      setIsTaskRunning(false)
      setIsLoading(false)
    }
  }

  // 处理获取当前网页内容
  const handleGetWebContent = async () => {
    if (!activeWebview || !activeWebview.current) {
      message.error('无法获取网页内容，请确保网页已加载')
      return
    }

    try {
      setIsLoading(true)

      // 获取网页内容
      const content = await getWebviewContent(activeWebview.current)

      // 创建系统消息
      const systemMessage: ChatMessage = {
        id: generateUniqueId(),
        role: 'assistant',
        content: `我已获取当前网页内容，您可以向我提问关于这个网页的问题。`,
        timestamp: new Date().toISOString()
      }

      // 创建包含网页内容的用户消息（但不显示给用户）
      const webContentMessage: ChatMessage = {
        id: generateUniqueId(),
        role: 'user',
        content: `请分析以下网页内容并准备回答我的问题：\n\n${content}`,
        timestamp: new Date().toISOString(),
        hidden: true // 标记为隐藏，不在UI中显示
      }

      // 保存到本地存储
      let updatedMessages = addChatMessage(systemMessage)
      updatedMessages = addChatMessage(webContentMessage, updatedMessages)

      setMessages(updatedMessages)
      message.success('已获取网页内容')
    } catch (error) {
      console.error('Error getting webpage content:', error)
      message.error(`获取网页内容失败: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  // 处理打开元素选择器
  const handleOpenElementSelector = async () => {
    if (!activeWebview || !activeWebview.current) {
      message.error('无法获取网页元素，请确保网页已加载')
      return
    }

    try {
      setIsLoading(true)

      // 获取可点击元素
      const elements = await getClickableElements(activeWebview.current)

      if (elements.length === 0) {
        message.info('未找到可点击的元素')
        return
      }

      setClickableElements(elements)
      setShowElementSelector(true)
    } catch (error) {
      console.error('Error getting clickable elements:', error)
      message.error(`获取可点击元素失败: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  // 处理点击元素
  const handleClickElement = async (selector: string) => {
    if (!activeWebview || !activeWebview.current) {
      message.error('无法点击元素，请确保网页已加载')
      return
    }

    try {
      setIsLoading(true)
      setIsAutoInteracting(true)
      setShowElementSelector(false)

      // 创建用户消息
      const userMessage: ChatMessage = {
        id: generateUniqueId(),
        role: 'user',
        content: `请点击页面上的元素: ${selector}`,
        timestamp: new Date().toISOString()
      }

      // 保存到本地存储
      let updatedMessages = addChatMessage(userMessage)
      setMessages(updatedMessages)

      // 点击元素并获取更新后的内容
      const content = await clickAndGetContent(activeWebview.current, selector)

      // 创建系统消息
      const systemMessage: ChatMessage = {
        id: generateUniqueId(),
        role: 'assistant',
        content: `我已点击了元素并获取了更新后的页面内容，您可以继续提问。`,
        timestamp: new Date().toISOString()
      }

      // 创建包含网页内容的用户消息（但不显示给用户）
      const webContentMessage: ChatMessage = {
        id: generateUniqueId(),
        role: 'user',
        content: `请分析以下更新后的网页内容并准备回答我的问题：\n\n${content}`,
        timestamp: new Date().toISOString(),
        hidden: true // 标记为隐藏，不在UI中显示
      }

      // 保存到本地存储
      updatedMessages = addChatMessage(systemMessage, updatedMessages)
      updatedMessages = addChatMessage(webContentMessage, updatedMessages)

      setMessages(updatedMessages)
      message.success('已点击元素并获取更新后的内容')
    } catch (error) {
      console.error('Error clicking element:', error)

      // 创建错误消息
      const errorMessage: ChatMessage = {
        id: generateUniqueId(),
        role: 'assistant',
        content: `抱歉，点击元素时出现错误: ${error}`,
        timestamp: new Date().toISOString()
      }

      // 保存到本地存储
      const updatedMessages = addChatMessage(errorMessage)
      setMessages(updatedMessages)

      message.error(`点击元素失败: ${error}`)
    } finally {
      setIsLoading(false)
      setIsAutoInteracting(false)
    }
  }

  // 处理发送消息
  const handleSendMessage = async () => {
    if (!inputValue.trim()) return

    // 添加用户消息
    const userMessage: ChatMessage = {
      id: generateUniqueId(),
      role: 'user',
      content: inputValue,
      timestamp: new Date().toISOString()
    }

    // 保存到本地存储
    const updatedMessages = addChatMessage(userMessage)
    setMessages(updatedMessages)
    setInputValue('')
    setIsLoading(true)

    // 同步消息到主界面
    throttledSyncBrowserChatMessages()

    try {
      // 检查是否是浏览器控制指令
      const isBrowserControlInstruction =
        userMessage.content.includes('打开') ||
        userMessage.content.includes('搜索') ||
        userMessage.content.includes('点击') ||
        userMessage.content.includes('访问') ||
        userMessage.content.includes('导航') ||
        userMessage.content.includes('浏览') ||
        userMessage.content.includes('滚动') ||
        userMessage.content.includes('刷新') ||
        userMessage.content.includes('后退') ||
        userMessage.content.includes('前进')

      // 如果是浏览器控制指令且webview可用，让AI控制浏览器
      if (isBrowserControlInstruction && activeWebview && activeWebview.current) {
        setIsAutoInteracting(true)

        // 创建系统消息，告知用户正在执行操作
        const processingMessage: ChatMessage = {
          id: generateUniqueId(),
          role: 'assistant',
          content: `正在分析并执行您的指令: "${userMessage.content}"...`,
          timestamp: new Date().toISOString()
        }

        // 保存到本地存储
        let newMessages = addChatMessage(processingMessage)
        setMessages(newMessages)

        // 让AI控制浏览器
        try {
          const result = await letAIControlBrowser(userMessage.content, activeWebview.current, selectedModel)

          if (result.success) {
            // 创建成功消息
            const successMessage: ChatMessage = {
              id: generateUniqueId(),
              role: 'assistant',
              content: `操作已完成。${result.action ? `\n\n${result.action}` : ''}\n\n我已获取更新后的页面内容，您可以继续提问。`,
              timestamp: new Date().toISOString()
            }

            // 创建包含网页内容的用户消息（但不显示给用户）
            const webContentMessage: ChatMessage = {
              id: generateUniqueId(),
              role: 'user',
              content: `请分析以下网页内容并准备回答我的问题：\n\n${result.content}`,
              timestamp: new Date().toISOString(),
              hidden: true // 标记为隐藏，不在UI中显示
            }

            // 保存到本地存储
            newMessages = addChatMessage(successMessage)
            newMessages = addChatMessage(webContentMessage, newMessages)

            setMessages(newMessages)

            // 同步消息到主界面
            throttledSyncBrowserChatMessages()
          } else {
            // 创建错误消息
            const errorMessage: ChatMessage = {
              id: generateUniqueId(),
              role: 'assistant',
              content: `抱歉，执行操作时出现错误: ${result.error}`,
              timestamp: new Date().toISOString()
            }

            // 保存到本地存储
            const finalMessages = addChatMessage(errorMessage)
            setMessages(finalMessages)
          }
        } catch (error) {
          console.error('Error executing browser action:', error)
          // 创建错误消息
          const errorMessage: ChatMessage = {
            id: generateUniqueId(),
            role: 'assistant',
            content: `抱歉，执行操作时出现错误: ${error}`,
            timestamp: new Date().toISOString()
          }

          // 保存到本地存储
          const finalMessages = addChatMessage(errorMessage)
          setMessages(finalMessages)
        } finally {
          setIsLoading(false)
          setIsAutoInteracting(false)
        }
      } else {
        // 不是浏览器控制指令，调用AI模型生成回复
        // 获取当前所有消息历史作为上下文
        const currentMessages = getChatMessages()

        // 调用真实的AI模型生成回复，使用选定的模型
        const aiResponse = await generateAIResponse(userMessage.content, currentMessages, selectedModel)

        // 创建助手消息
        const assistantMessage: ChatMessage = {
          id: generateUniqueId(),
          role: 'assistant',
          content: aiResponse,
          timestamp: new Date().toISOString()
        }

        // 保存到本地存储
        const finalMessages = addChatMessage(assistantMessage)
        setMessages(finalMessages)

        // 同步消息到主界面
        throttledSyncBrowserChatMessages()
      }
    } catch (error) {
      console.error('Error processing message:', error)
      // 创建错误消息
      const errorMessage: ChatMessage = {
        id: generateUniqueId(),
        role: 'assistant',
        content: `抱歉，处理消息时出现错误: ${error}`,
        timestamp: new Date().toISOString()
      }

      // 保存到本地存储
      const finalMessages = addChatMessage(errorMessage)
      setMessages(finalMessages)
    } finally {
      setIsLoading(false)
      setIsAutoInteracting(false)
    }
  }

  // 注意：清除聊天历史的处理已移至内联函数

  // 滚动到底部
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages])

  // 处理模态框打开/关闭时禁止/恢复滚动
  useEffect(() => {
    if (showElementSelector || showTaskProgress || showTaskModal || showToolsModal) {
      document.body.classList.add('has-chat-sidebar-modal')
    } else {
      document.body.classList.remove('has-chat-sidebar-modal')
    }

    return () => {
      document.body.classList.remove('has-chat-sidebar-modal')
    }
  }, [showElementSelector, showTaskProgress, showTaskModal, showToolsModal])

  // 添加任务结果到对话中
  const addTaskResultToChat = (result: string) => {
    // 创建用户消息
    const userMessage: ChatMessage = {
      id: generateUniqueId(),
      role: 'user',
      content: `请分析并总结这些内容：\n\n${result}`,
      timestamp: new Date().toISOString()
    }

    // 保存到本地存储并更新消息列表
    const updatedMessages = addChatMessage(userMessage)
    setMessages(updatedMessages)
    setInputValue('')
    setIsLoading(true)

    // 同步消息到主界面
    throttledSyncBrowserChatMessages()

    // 生成AI回复
    generateAIResponse(userMessage.content, getChatMessages(), selectedModel)
      .then((response) => {
        // 创建助手消息
        const assistantMessage: ChatMessage = {
          id: generateUniqueId(),
          role: 'assistant',
          content: response,
          timestamp: new Date().toISOString()
        }

        // 保存到本地存储
        const finalMessages = addChatMessage(assistantMessage)
        setMessages(finalMessages)

        // 同步消息到主界面
        throttledSyncBrowserChatMessages()
      })
      .catch((error) => {
        console.error('Error generating task summary:', error)

        // 创建错误消息
        const errorMessage: ChatMessage = {
          id: generateUniqueId(),
          role: 'assistant',
          content: `抱歉，生成摘要时出现错误: ${error}`,
          timestamp: new Date().toISOString()
        }

        // 保存到本地存储
        const finalMessages = addChatMessage(errorMessage)
        setMessages(finalMessages)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }

  // 如果不可见，不渲染内容
  if (!visible) return null

  return (
    <ChatSidebarContainer $expanded={expanded} style={{ display: visible ? 'flex' : 'none' }}>
      <ChatSidebarHeader>
        <div className="header-left-buttons">
          <Space>
            <Tooltip title={expanded ? '收起' : '展开'}>
              <Button
                icon={expanded ? <ShrinkOutlined /> : <ExpandOutlined />}
                onClick={handleToggleExpand}
                type="text"
                size="small"
              />
            </Tooltip>
            <Tooltip title="清除聊天">
              <Button icon={<ClearOutlined />} onClick={handleClearChat} type="text" size="small" />
            </Tooltip>
            <Tooltip title="工具菜单">
              <Button icon={<ThunderboltOutlined />} onClick={() => setShowToolsModal(true)} type="text" size="small" />
            </Tooltip>
            <Tooltip title="设置">
              <Button icon={<SettingOutlined />} onClick={() => setShowModelSelector(true)} type="text" size="small" />
            </Tooltip>
          </Space>
        </div>

        <div style={{ flexGrow: 1, textAlign: 'center' }}>聊天助手</div>

        <div className="header-buttons">
          <Space>
            <Tooltip title="关闭">
              <Button icon={<CloseOutlined />} onClick={onClose} type="text" size="small" />
            </Tooltip>
          </Space>
        </div>
      </ChatSidebarHeader>

      {/* 模型选择器模态框 */}
      <Modal
        title="选择AI模型"
        open={showModelSelector}
        onCancel={() => setShowModelSelector(false)}
        footer={null}
        width={400}>
        <ModelSelector
          value={selectedModel}
          onChange={(model: Model) => {
            setSelectedModel(model)
            setShowModelSelector(false)
          }}
        />
      </Modal>

      {/* 工具菜单模态框 */}
      <Modal
        title="聊天助手工具"
        open={showToolsModal}
        onCancel={() => setShowToolsModal(false)}
        footer={null}
        width={400}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Button
            icon={<ReadOutlined />}
            onClick={() => {
              handleGetWebContent()
              setShowToolsModal(false)
            }}>
            获取网页内容
          </Button>
          <Button
            icon={<RobotOutlined />}
            onClick={() => {
              handleOpenElementSelector()
              setShowToolsModal(false)
            }}>
            自动点击元素
          </Button>
          <Button
            icon={<ThunderboltOutlined />}
            onClick={() => {
              setShowTaskModal(true)
              setShowToolsModal(false)
            }}>
            自动执行任务
          </Button>
        </div>
      </Modal>

      {/* 元素选择器模态框 */}
      <Modal
        title="选择要点击的元素"
        open={showElementSelector}
        onCancel={() => setShowElementSelector(false)}
        footer={null}
        width={600}>
        <List
          dataSource={clickableElements}
          renderItem={(item) => (
            <List.Item
              key={item.selector}
              onClick={() => handleClickElement(item.selector)}
              style={{ cursor: 'pointer' }}>
              <List.Item.Meta title={`${item.tag}: ${item.text || '(无文本)'}`} description={item.selector} />
            </List.Item>
          )}
        />
      </Modal>

      {/* AI任务进度模态框 */}
      <Modal
        title="AI任务执行进度"
        open={showTaskProgress}
        onCancel={() => setShowTaskProgress(false)}
        footer={null}
        width={700}>
        {currentTask && (
          <TaskExecutionPanel
            task={currentTask}
            onClose={() => setShowTaskProgress(false)}
            onShowResult={addTaskResultToChat}
          />
        )}
      </Modal>

      <MessagesContainer ref={messagesContainerRef}>
        {messages.length === 0 ? (
          <EmptyMessage>
            <p>你好！我是你的聊天助手。</p>
            <p>有什么可以帮助你的吗？</p>
          </EmptyMessage>
        ) : (
          messages
            .filter((message) => !message.hidden) // 过滤掉隐藏的消息
            .map((message) => (
              <MessageItem key={message.id} $isUser={message.role === 'user'}>
                <MessageContent>
                  {message.role === 'user' ? (
                    message.content
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      className="markdown">
                      {message.content}
                    </ReactMarkdown>
                  )}
                </MessageContent>
                <MessageTimestamp>
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </MessageTimestamp>
              </MessageItem>
            ))
        )}
        {isLoading && (
          <LoadingContainer>
            <Spin size="small" />
          </LoadingContainer>
        )}
      </MessagesContainer>

      <ModelIndicator>{selectedModel?.name || '默认模型'}</ModelIndicator>

      <InputContainer>
        <div className="input-row">
          <Input.TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={isLoading ? 'AI正在思考中...' : '输入消息...'}
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={isLoading}
            onPressEnter={(e) => {
              if (!e.shiftKey && !isLoading) {
                e.preventDefault()
                handleSendMessage()
              }
            }}
          />
          <Button
            type="primary"
            onClick={handleSendMessage}
            loading={isLoading}
            disabled={isLoading || !inputValue.trim()}>
            发送
          </Button>
        </div>
      </InputContainer>

      {/* 任务创建模态框 */}
      <CreateTaskModal
        visible={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        onCreateTask={handleExecuteTask}
        selectedModel={selectedModel}
      />
    </ChatSidebarContainer>
  )
}

export default ChatSidebar
