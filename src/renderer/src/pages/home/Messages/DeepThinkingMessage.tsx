import { CheckOutlined } from '@ant-design/icons'
import { useSettings } from '@renderer/hooks/useSettings'
import { getUserMessage } from '@renderer/services/MessagesService'
import { getDefaultTopic, addAssistantMessagesToTopic } from '@renderer/services/AssistantService'
import { MCPToolResponse, Message } from '@renderer/types'
import { Button, Collapse, message as antdMessage, Tooltip } from 'antd'
import { FC, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import BarLoader from 'react-spinners/BarLoader'
import styled, { keyframes, css } from 'styled-components'
import { Brain, Maximize, Minimize } from 'lucide-react'
import db from '@renderer/databases'

import Markdown from '../Markdown/Markdown'
import { getDefaultDeepThinkingAssistant } from '@renderer/config/prompts'
import { fetchDeepThinking } from '@renderer/pages/home/Inputbar/DeepThinkingButton'
import MessageAttachments from './MessageAttachments'

// 创建默认的空数组，用于 Markdown props
const DEFAULT_TOOL_RESPONSES: MCPToolResponse[] = []

// 定义思考动画
const thinkingAnimation = keyframes`
  0% {
    transform: scale(1);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.1);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 0.8;
  }
`

// 定义渐变动画
const gradientAnimation = keyframes`
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
`

// 定义出场动画
const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`

// 将 MessageContentContainer 移到组件外部定义，避免动态创建 styled-components 的警告
const MessageContentContainer = styled.div<{
  fontFamily: string;
  fontSize: string | number;
  $isExpanded: boolean;
}>`
  font-family: ${(props) => props.fontFamily};
  /* 增加基础字体大小，确保可读性 */
  font-size: ${(props) => {
    // 如果fontSize是数字类型，增加2px；如果是字符串，尝试解析后增加
    if (typeof props.fontSize === 'number') {
      return `${props.fontSize + 2}px`;
    } else {
      // 尝试解析字符串中的数字
      const size = parseInt(props.fontSize.toString());
      if (!isNaN(size)) {
        return `${size + 2}px`;
      }
      // 如果无法解析，返回原始值加上字体大小增强
      return props.fontSize;
    }
  }};
  line-height: 1.6;
  padding: 10px 15px;
  animation: ${fadeIn} 0.3s ease-out forwards;
  position: relative;

  /* 增强内容样式 */
  p, li, ul, ol {
    margin-bottom: 10px;
  }

  /* 增强标题样式 */
  h1, h2, h3, h4, h5, h6 {
    margin-top: 16px;
    margin-bottom: 10px;
    font-weight: 600;
  }

  /* 增强列表项样式 */
  li {
    margin-bottom: 6px;
  }

  ${props => !props.$isExpanded && css`
    max-height: 320px;
    overflow-y: auto;
    overflow-x: hidden;

    /* 自定义滚动条样式 */
    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-track {
      background: var(--color-background-soft);
    }

    &::-webkit-scrollbar-thumb {
      background-color: var(--color-border);
      border-radius: 4px;
    }

    &::-webkit-scrollbar-thumb:hover {
      background-color: var(--color-primary-mute);
    }

    /* 添加渐变遮罩提示可滚动 */
    /* &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 30px;
      background: linear-gradient(to top, var(--color-background), transparent);
      pointer-events: none;
    } */
  `}
`

interface Props {
  message: Message
}

// 获取主题的所有消息
async function getTopicMessages(topicId: string): Promise<Message[]> {
  try {
    const topic = await db.topics.get(topicId);
    if (!topic || !topic.messages) {
      return [];
    }
    return topic.messages;
  } catch (error) {
    console.error('[DeepThinking] 获取主题消息失败:', error);
    return [];
  }
}

// 构建上下文消息
async function buildContextMessages(message: Message): Promise<string> {
  if (!message.topicId) {
    return message.content;
  }

  // 获取主题的所有消息
  const messages = await getTopicMessages(message.topicId);

  // 如果没有消息，直接返回当前消息内容
  if (!messages || messages.length === 0) {
    return message.content;
  }

  // 按时间排序消息
  const sortedMessages = [...messages].sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // 找到当前消息在主题中的索引
  const currentIndex = sortedMessages.findIndex(m => m.id === message.id);

  // 如果找不到当前消息，直接返回当前消息内容
  if (currentIndex === -1) {
    return message.content;
  }

  // 获取原始问题（第一条用户消息）
  const originalQuestion = sortedMessages.find(m => m.role === 'user' && m.type === 'text')?.content || '';

  // 获取当前消息之前的所有思考消息和常规消息
  const previousMessages = sortedMessages.slice(0, currentIndex);

  // 分离常规消息和思考消息
  const regularMessages = previousMessages.filter(m => !m.thinking && m.type === 'text');
  const thinkingMessages = previousMessages.filter(m => m.thinking && m.type === 'text');

  // 构建上下文字符串
  let contextString = '';

  // 首先添加原始问题
  if (originalQuestion) {
    contextString += `原始问题: ${originalQuestion}\n\n`;
  }

  // 添加常规对话消息
  if (regularMessages.length > 0) {
    contextString += `对话历史:\n`;
    for (const m of regularMessages) {
      const role = m.role === 'user' ? '用户' : '助手';
      contextString += `${role}: ${m.content}\n\n`;
    }
  }

  // 添加之前的思考消息
  if (thinkingMessages.length > 0) {
    contextString += `之前的思考过程:\n`;
    for (let i = 0; i < thinkingMessages.length; i++) {
      contextString += `思考 ${i + 1}: ${thinkingMessages[i].content}\n\n`;
    }
  }

  // 添加当前思考消息
  contextString += `当前思考内容: ${message.content}\n\n`;

  console.log('[DeepThinking] 构建了上下文消息，包含常规消息数:', regularMessages.length);
  console.log('[DeepThinking] 构建了上下文消息，包含思考消息数:', thinkingMessages.length + 1);

  return contextString;
}

const DeepThinkingMessage: FC<Props> = ({ message }) => {
  const [activeKey, setActiveKey] = useState<'thought' | ''>('thought')
  const [copied, setCopied] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const { t } = useTranslation()
  const { messageFont, fontSize, thoughtAutoCollapse } = useSettings()
  const contentRef = useRef<HTMLDivElement>(null)
  const fontFamily = useMemo(() => {
    return messageFont === 'serif'
      ? 'serif'
      : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans","Helvetica Neue", sans-serif'
  }, [messageFont])

  // 添加工具相关的状态
  const [activeToolKeys, setActiveToolKeys] = useState<string[]>([])
  const [copiedToolMap, setCopiedToolMap] = useState<Record<string, boolean>>({})
  const [editingToolId, setEditingToolId] = useState<string | null>(null)
  const [editedToolParamsString, setEditedToolParamsString] = useState('')
  const [showExpandButton] = useState(true)

  useEffect(() => {
    if (!isThinking && thoughtAutoCollapse) setActiveKey('')
  }, [isThinking, thoughtAutoCollapse])

  // 使用 useCallback 记忆化 copyThought 函数，避免不必要的重新创建
  const copyThought = useCallback(() => {
    if (message.content) {
      navigator.clipboard.writeText(message.content)
      antdMessage.success({ content: t('message.copied'), key: 'copy-message' })
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [message.content, t])

  // 处理展开/折叠
  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // 处理工具相关的回调函数
  const handleToolCopy = useCallback((_content: string, toolId: string) => {
    setCopiedToolMap((prev) => ({ ...prev, [toolId]: true }))
  }, [])

  const handleToolRerun = useCallback(() => {
    // 实现工具重新运行的逻辑
  }, [])

  const handleToolEdit = useCallback(() => {
    // 实现工具编辑的逻辑
  }, [])

  const handleToolSave = useCallback(() => {
    setEditingToolId(null)
  }, [])

  const handleToolCancel = useCallback(() => {
    setEditingToolId(null)
  }, [])

  const handleToolParamsChange = useCallback((newParams: string) => {
    setEditedToolParamsString(newParams)
  }, [])

  // 创建通用的 Markdown props
  const markdownProps = useMemo(
    () => ({
      toolResponses: DEFAULT_TOOL_RESPONSES,
      activeToolKeys,
      copiedToolMap,
      editingToolId,
      editedToolParamsString,
      onToolToggle: setActiveToolKeys,
      onToolCopy: handleToolCopy,
      onToolRerun: handleToolRerun,
      onToolEdit: handleToolEdit,
      onToolSave: handleToolSave,
      onToolCancel: handleToolCancel,
      onToolParamsChange: handleToolParamsChange
    }),
    [
      activeToolKeys,
      copiedToolMap,
      editingToolId,
      editedToolParamsString,
      handleToolCopy,
      handleToolRerun,
      handleToolEdit,
      handleToolSave,
      handleToolCancel,
      handleToolParamsChange
    ]
  )

  // 继续思考的处理函数
  const handleContinueThinking = useCallback(async () => {
    setIsThinking(true)
    try {
      // 获取完整上下文
      const contextContent = await buildContextMessages(message);
      console.log('[DeepThinking] 构建上下文完成，长度:', contextContent.length);

      // 创建深度思考助手
      const assistant = getDefaultDeepThinkingAssistant(contextContent)

      // 创建用户消息
      const userMessage = getUserMessage({
        assistant,
        topic: getDefaultTopic('default'),
        type: 'text',
        content: contextContent + '\n\n请继续上述思考过程，基于之前的分析进行更深入的思考。请直接延续之前的思考脉络，不要重复已有的分析，而是提供新的见解和更深层次的思考。请务必使用中文回复，不要使用英文或其他语言。'
      })

      // 添加文件附件
      if (message.files && message.files.length > 0) {
        userMessage.files = message.files;
        console.log('[DeepThinking] Continue thinking with files:', message.files);
      }

      // 获取思考结果
      const thinkingResult = await fetchDeepThinking({ message: userMessage, assistant })

      // 创建新的思考消息
      const newThinkingMessage = {
        ...message,
        id: `thinking-${Date.now()}`,
        content: thinkingResult,
        createdAt: new Date().toISOString()
      }

      // 将思考结果添加到当前主题
      if (message.topicId) {
        addAssistantMessagesToTopic(message.topicId, [newThinkingMessage])

        // 打印日志，便于调试
        console.log('[DeepThinking] Added new thinking message to topic:', message.topicId)
        console.log('[DeepThinking] New thinking message:', newThinkingMessage)
      } else {
        console.error('Message is missing topicId')
        antdMessage.error({
          content: t('deep_thinking.error.failed'),
          key: 'deep-thinking-message'
        })
      }

      antdMessage.success({
        content: t('deep_thinking.success'),
        key: 'deep-thinking-message'
      })
    } catch (error) {
      console.error('Continue thinking failed:', error)
      antdMessage.error({
        content: t('deep_thinking.error.failed'),
        key: 'deep-thinking-message'
      })
    } finally {
      setIsThinking(false)
    }
  }, [message, t])

  // 完成思考的处理函数
  const handleCompleteThinking = useCallback(async () => {
    setIsThinking(true)
    try {
      // 获取完整上下文
      const contextContent = await buildContextMessages(message);
      console.log('[DeepThinking] 构建完成思考上下文完成，长度:', contextContent.length);

      // 创建深度思考助手
      const assistant = getDefaultDeepThinkingAssistant(contextContent)

      // 创建用户消息
      const userMessage = getUserMessage({
        assistant,
        topic: getDefaultTopic('default'),
        type: 'text',
        content: contextContent + '\n\n基于以上所有的思考过程和对话历史，现在请给出最终的结论和建议。这是最终答案，应该简洁明了，直接回答用户的原始问题，不要再展示思考过程。请务必使用中文回复，不要使用英文或其他语言。'
      })

      // 添加文件附件
      if (message.files && message.files.length > 0) {
        userMessage.files = message.files;
        console.log('[DeepThinking] Complete thinking with files:', message.files);
      }

      // 获取思考结果
      const thinkingResult = await fetchDeepThinking({ message: userMessage, assistant })

      // 创建新的思考消息
      const newThinkingMessage = {
        ...message,
        id: `thinking-final-${Date.now()}`,
        content: thinkingResult,
        createdAt: new Date().toISOString(),
        thinking: false, // 标记为非思考消息，表示最终结论
        isFinalThinking: true // 标记为最终思考结果
      }

      // 将思考结果添加到当前主题
      if (message.topicId) {
        addAssistantMessagesToTopic(message.topicId, [newThinkingMessage])

        // 打印日志，便于调试
        console.log('[DeepThinking] Added final thinking message to topic:', message.topicId)
        console.log('[DeepThinking] Final thinking message:', newThinkingMessage)
      } else {
        console.error('Message is missing topicId')
        antdMessage.error({
          content: t('deep_thinking.error.failed'),
          key: 'deep-thinking-message'
        })
      }

      antdMessage.success({
        content: t('deep_thinking.success'),
        key: 'deep-thinking-message'
      })
    } catch (error) {
      console.error('Complete thinking failed:', error)
      antdMessage.error({
        content: t('deep_thinking.error.failed'),
        key: 'deep-thinking-message'
      })
    } finally {
      setIsThinking(false)
    }
  }, [message, t])

  // 使用 useMemo 记忆化 Collapse 的 items 数组，避免不必要的重新创建
  const collapseItems = useMemo(
    () => [
      {
        key: 'thought',
        label: (
          <MessageTitleLabel>
            <TinkingText>
              <AnimatedBrain size={16} $isThinking={isThinking} />
              {message.isFinalThinking ? t('deep_thinking.final_answer') : t('deep_thinking.thinking_block')}
            </TinkingText>
            {isThinking && <StyledBarLoader color="#9254de" height={2} width={80} />}
            {!isThinking && (
              <Tooltip title={t('common.copy')} mouseEnterDelay={0.8}>
                <ActionButton
                  className="message-action-button"
                  onClick={(e) => {
                    e.stopPropagation()
                    copyThought()
                  }}
                  aria-label={t('common.copy')}>
                  {!copied && <i className="iconfont icon-copy"></i>}
                  {copied && <CheckOutlined style={{ color: 'var(--color-primary)' }} />}
                </ActionButton>
              </Tooltip>
            )}
          </MessageTitleLabel>
        ),
        children: (
          <ThinkingContainer>
            <MessageContentContainer
              ref={contentRef}
              fontFamily={fontFamily}
              fontSize={fontSize}
              $isExpanded={isExpanded}
            >
              <Markdown message={{ ...message }} {...markdownProps} />
              {message.files && message.files.length > 0 && (
                <MessageAttachments message={message} />
              )}
            </MessageContentContainer>

            {/* 调整ThinkingActions结构 */}
            {(!message.isFinalThinking || showExpandButton) && (
              <ThinkingActions>
                {!message.isFinalThinking && (
                  <ActionButtonGroup>
                    <PrimaryButton
                      type="primary"
                      onClick={handleContinueThinking}
                      disabled={isThinking}
                    >
                      {t('deep_thinking.continue_thinking')}
                    </PrimaryButton>
                    <SecondaryButton
                      onClick={handleCompleteThinking}
                      disabled={isThinking}
                    >
                      {t('deep_thinking.complete_thinking')}
                    </SecondaryButton>
                  </ActionButtonGroup>
                )}

                {showExpandButton && (
                  <ExpandButton
                    type="text"
                    onClick={toggleExpanded}
                    icon={isExpanded ? <Minimize size={14} /> : <Maximize size={14} />}
                  >
                    {isExpanded ? "折叠内容" : "展开全部"}
                  </ExpandButton>
                )}
              </ThinkingActions>
            )}
          </ThinkingContainer>
        )
      }
    ],
    [
      isThinking,
      isExpanded,
      showExpandButton,
      toggleExpanded,
      t,
      copied,
      copyThought,
      fontFamily,
      fontSize,
      markdownProps,
      message,
      handleContinueThinking,
      handleCompleteThinking
    ]
  )

  return (
    <CollapseContainer
      activeKey={activeKey}
      size="small"
      onChange={() => setActiveKey((key) => (key ? '' : 'thought'))}
      className="message-thought-container deep-thinking-container"
      items={collapseItems}
    />
  )
}

const CollapseContainer = styled(Collapse)`
  margin-bottom: 20px;
  border: 1px solid var(--color-primary-mute);
  background-color: var(--color-background-soft);
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  animation: ${fadeIn} 0.4s ease-out forwards;

  .ant-collapse-header {
    padding: 12px 16px !important;
    transition: background-color 0.3s ease;

    &:hover {
      background-color: rgba(146, 84, 222, 0.05);
    }
  }

  .ant-collapse-content {
    border-top: 1px solid var(--color-primary-mute);
    background-color: var(--color-background);
  }

  .ant-collapse-arrow {
    color: var(--color-primary);
  }
`

const MessageTitleLabel = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 22px;
  gap: 15px;
  width: 100%;
`

const StyledBarLoader = styled(BarLoader)`
  margin-left: 12px;
`

const TinkingText = styled.span`
  color: var(--color-text-2);
  display: flex;
  align-items: center;
  font-weight: 500;
`

const AnimatedBrain = styled(Brain) <{ $isThinking: boolean }>`
  margin-right: 8px;
  color: var(--color-primary);
  animation: ${props => props.$isThinking ? thinkingAnimation : 'none'} 1.5s infinite ease-in-out;
`

const ActionButton = styled.button`
  background: none;
  border: none;
  color: var(--color-text-2);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  opacity: 0.6;
  transition: all 0.3s;
  border-radius: 4px;

  &:hover {
    opacity: 1;
    color: var(--color-text);
    background-color: rgba(0, 0, 0, 0.05);
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .iconfont {
    font-size: 14px;
  }
`

const ThinkingContainer = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
`

const ThinkingActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px dashed var(--color-border);
`

const ActionButtonGroup = styled.div`
  display: flex;
  gap: 10px;
`

const ExpandButton = styled(Button)`
  font-size: 13px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--color-primary);
  border: 1px solid var(--color-primary-mute);
  border-radius: 6px;
  padding: 0 12px;
  background-color: var(--color-background);

  &:hover {
    color: var(--color-primary-dark);
    background-color: rgba(146, 84, 222, 0.05);
    border-color: var(--color-primary);
  }

  &:focus {
    background-color: rgba(146, 84, 222, 0.05);
  }
`

const PrimaryButton = styled(Button)`
  background: linear-gradient(45deg, var(--color-primary), #b274dc);
  background-size: 200% 200%;
  animation: ${gradientAnimation} 3s ease infinite;
  border: none;
  font-weight: 500;

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(146, 84, 222, 0.3);
  }

  &:active {
    transform: translateY(1px);
  }
`

const SecondaryButton = styled(Button)`
  border-color: var(--color-primary-mute);
  color: var(--color-primary);

  &:hover {
    color: var(--color-primary);
    border-color: var(--color-primary);
    background-color: rgba(146, 84, 222, 0.05);
  }
`

// 使用 memo 包装组件，避免不必要的重渲染
export default memo(DeepThinkingMessage)
