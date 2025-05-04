import { CheckOutlined } from '@ant-design/icons'
import { useSettings } from '@renderer/hooks/useSettings'
import { MCPToolResponse, Message } from '@renderer/types'
import { Collapse, message as antdMessage, Tooltip } from 'antd'
import { FC, memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import BarLoader from 'react-spinners/BarLoader'
import styled from 'styled-components'

import Markdown from '../Markdown/Markdown'

// 创建默认的空数组，用于 Markdown props
const DEFAULT_TOOL_RESPONSES: MCPToolResponse[] = []

// 将 MessageContentContainer 移到组件外部定义，避免动态创建 styled-components 的警告
const MessageContentContainer = styled.div<{ fontFamily: string; fontSize: string | number }>`
  font-family: ${(props) => props.fontFamily};
  font-size: ${(props) => props.fontSize};
`

interface Props {
  message: Message
}

const MessageThought: FC<Props> = ({ message }) => {
  // 直接检查是否存在<think>标签
  const thinkPattern = /<think>([\s\S]*?)<\/think>/i
  const origContent = message.content || ''

  // 如果在消息内容中发现思考标签，直接提取
  if (!message.reasoning_content && thinkPattern.test(origContent)) {
    const thinkMatch = origContent.match(thinkPattern)
    if (thinkMatch) {
      message = {
        ...message,
        reasoning_content: thinkMatch[1].trim(),
        content: origContent.replace(thinkPattern, '').trim()
      }
      console.log('[MessageThought] 直接从消息内容中提取思考过程')

      // 存储更新后的消息到全局状态，避免重复显示
      if (message.topicId && message.id) {
        // 使用setTimeout确保UI不阻塞
        setTimeout(() => {
          try {
            window.api.store.dispatch(
              window.api.store.updateMessageThunk(message.topicId, message.id, {
                content: origContent.replace(thinkPattern, '').trim(),
                reasoning_content: thinkMatch[1].trim()
              })
            )
            console.log('[MessageThought] 已更新全局状态，避免内容重复')
          } catch (error) {
            console.error('[MessageThought] 更新全局状态失败:', error)
          }
        }, 0)
      }
    }
  }

  const [activeKey, setActiveKey] = useState<'thought' | ''>('thought')
  const [copied, setCopied] = useState(false)
  const isThinking = !message.content
  const { t } = useTranslation()
  const { messageFont, fontSize, thoughtAutoCollapse } = useSettings()
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

  useEffect(() => {
    if (!isThinking && thoughtAutoCollapse) setActiveKey('')
  }, [isThinking, thoughtAutoCollapse])

  // 使用 useCallback 记忆化 copyThought 函数，避免不必要的重新创建
  const copyThought = useCallback(() => {
    if (message.reasoning_content) {
      navigator.clipboard.writeText(message.reasoning_content)
      antdMessage.success({ content: t('message.copied'), key: 'copy-message' })
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [message.reasoning_content, t])

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

  const thinkingTime = message.metrics?.time_thinking_millsec || 0
  const thinkingTimeSeconds = (thinkingTime / 1000).toFixed(1)
  const isPaused = message.status === 'paused'

  // 使用 useMemo 记忆化 Collapse 的 items 数组，避免不必要的重新创建
  const collapseItems = useMemo(
    () => [
      {
        key: 'thought',
        label: (
          <MessageTitleLabel>
            <TinkingText>
              {isThinking ? t('chat.thinking') : t('chat.deeply_thought', { secounds: thinkingTimeSeconds })}
            </TinkingText>
            {isThinking && !isPaused && <BarLoader color="#9254de" />}
            {(!isThinking || isPaused) && (
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
          <MessageContentContainer fontFamily={fontFamily} fontSize={fontSize}>
            <Markdown message={{ ...message, content: message.reasoning_content || '' }} {...markdownProps} />
          </MessageContentContainer>
        )
      }
    ],
    [
      isThinking,
      isPaused,
      t,
      thinkingTimeSeconds,
      copied,
      copyThought,
      fontFamily,
      fontSize,
      markdownProps,
      message // 包含整个 message 对象，包括 message.reasoning_content
    ]
  )

  // 如果没有思考内容，不渲染任何内容
  if (!message.reasoning_content) {
    return null
  }

  // 简化处理：直接移除所有可能的标签
  // 这样无论标签是否被分开，都能正确处理
  let processedContent = message.reasoning_content

  // 使用一个函数来处理所有可能的标签和标签片段
  const cleanThinkingTags = (content: string): string => {
    // 0. 处理特殊标记 THINKING_TAG_START 和 THINKING_TAG_END
    content = content.replace(/THINKING_TAG_START/g, '')
    content = content.replace(/THINKING_TAG_END/g, '')

    // 0.1 先尝试修复分开的标签
    // 如果发现行尾有单独的 < 符号，且下一行开头有 think>，则删除这两个部分
    const lines = content.split('\n')
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i].trim().endsWith('<') && lines[i + 1].trim().startsWith('think>')) {
        lines[i] = lines[i].replace(/<\s*$/, '')
        lines[i + 1] = lines[i + 1].replace(/^\s*think>\s*/, '')
      }
    }
    content = lines.join('\n')

    // 1. 处理完整的标签
    content = content.replace(
      /<think>|<thinking>|<thoughts>|<thought>|<reasoning>|<reason>|<analysis>|<reflection>/g,
      ''
    )
    content = content.replace(
      /<\/think>|<\/thinking>|<\/thoughts>|<\/thought>|<\/reasoning>|<\/reason>|<\/analysis>|<\/reflection>/g,
      ''
    )

    // 2. 处理分开的标签
    content = content.replace(/\s*<\s*(\r?\n|\s)*\s*think>\s*/g, '')
    content = content.replace(/\s*<\s*$/gm, '') // 处理行尾的单独 < 符号
    content = content.replace(/^\s*think>\s*/gm, '') // 处理行首的单独 think> 标签

    // 2.1 处理所有可能的标签开头
    content = content.replace(
      /\s*<\s*(\r?\n|\s)*\s*(thinking|thoughts|thought|reasoning|reason|analysis|reflection)>\s*/g,
      ''
    )

    // 2.2 处理所有可能的标签结尾
    content = content.replace(/^\s*(thinking|thoughts|thought|reasoning|reason|analysis|reflection)>\s*/gm, '')

    // 3. 处理标签片段
    content = content.replace(/\b(think|thinking|thoughts|thought|reasoning|reason|analysis|reflection)>\s*/g, '')
    content = content.replace(/<\/(think|thinking|thoughts|thought|reasoning|reason|analysis|reflection)\s*/g, '')

    // 4. 处理HTML实体编码
    content = content.replace(/&lt;(think|thinking|thoughts|thought|reasoning|reason|analysis|reflection)&gt;/g, '')
    content = content.replace(/&lt;\/(think|thinking|thoughts|thought|reasoning|reason|analysis|reflection)&gt;/g, '')

    // 5. 处理单独的 < 和 > 符号
    content = content.replace(/^\s*<\s*$/gm, '') // 单独一行的 < 符号
    content = content.replace(/^\s*>\s*$/gm, '') // 单独一行的 > 符号
    content = content.replace(/^\s*\/\s*$/gm, '') // 单独一行的 / 符号

    // 6. 最后的清理：移除所有可能的标签残余
    content = content.replace(/<\/?[a-z]+>/g, '') // 移除所有简单的HTML标签

    return content
  }

  // 应用清理函数
  processedContent = cleanThinkingTags(processedContent)

  // 更新消息对象
  message = {
    ...message,
    reasoning_content: processedContent
  }

  return (
    <CollapseContainer
      activeKey={activeKey}
      size="small"
      onChange={() => setActiveKey((key) => (key ? '' : 'thought'))}
      className="message-thought-container"
      items={collapseItems}
    />
  )
}

const CollapseContainer = styled(Collapse)`
  margin-bottom: 15px;
`

const MessageTitleLabel = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 22px;
  gap: 15px;
`

const TinkingText = styled.span`
  color: var(--color-text-2);
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

  &:hover {
    opacity: 1;
    color: var(--color-text);
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .iconfont {
    font-size: 14px;
  }
`

// 使用 memo 包装组件，避免不必要的重渲染
export default memo(MessageThought)
