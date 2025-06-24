import { useTranslation } from 'react-i18next'
import { shallowEqual } from 'react-redux'
import styled from 'styled-components' // Ensure styled-components is imported

import TTSProgressBar from '@renderer/components/TTSProgressBar'
import { FONT_FAMILY } from '@renderer/config/constant'
import { TranslateLanguageOptions } from '@renderer/config/translate'
import { useAssistant } from '@renderer/hooks/useAssistant'
import { useMessageOperations } from '@renderer/hooks/useMessageOperations'
import { useModel } from '@renderer/hooks/useModel'
import { useRuntime } from '@renderer/hooks/useRuntime'
import { useMessageStyle, useSettings } from '@renderer/hooks/useSettings'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import { getMessageModelId } from '@renderer/services/MessagesService'
import { getModelUniqId } from '@renderer/services/ModelService'
import TTSService from '@renderer/services/TTSService'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import store from '@renderer/store'
import { setLastPlayedMessageId, setSkipNextAutoTTS } from '@renderer/store/settings'
import { Assistant, Message, Topic } from '@renderer/types'
import { classNames } from '@renderer/utils'
import { Divider, Dropdown } from 'antd'
import { ItemType } from 'antd/es/menu/interface'
import { Dispatch, FC, memo, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react'

// 扩展Window接口
declare global {
  interface Window {
    toggleTranslation: (event: MouseEvent) => void
  }
}

import MessageContent from './MessageContent'
import MessageErrorBoundary from './MessageErrorBoundary'
import MessageHeader from './MessageHeader'
import MessageMenubar from './MessageMenubar'
import MessageTokens from './MessageTokens'

interface Props {
  message: Message
  topic: Topic
  assistant?: Assistant
  index?: number
  total?: number
  hidePresetMessages?: boolean
  style?: React.CSSProperties
  isGrouped?: boolean
  isStreaming?: boolean
  onSetMessages?: Dispatch<SetStateAction<Message[]>>
}

// Function definition moved before its first use, fixing potential TS issue & improving readability
// FIX 1: Added explicit else to satisfy TS7030
const getMessageBackground = (isBubbleStyle: boolean, isAssistantMessage: boolean): string | undefined => {
  if (!isBubbleStyle) {
    return undefined
  } else {
    // Explicit else block
    return isAssistantMessage ? 'var(--chat-background-assistant)' : 'var(--chat-background-user)'
  }
}

// FIX 2: Define styled component for the context menu trigger div
const ContextMenuTriggerDiv = styled.div<{ x: number; y: number }>`
  position: fixed;
  left: ${({ x }) => x}px;
  top: ${({ y }) => y}px;
  width: 1px;
  height: 1px;
  /* Optional: Ensure it doesn't interfere with other elements */
  z-index: -1;
  pointer-events: none;
`

const MessageItem: FC<Props> = ({
  message,
  topic,
  // assistant: propAssistant,
  index,
  hidePresetMessages,
  isGrouped,
  isStreaming = false,
  style
}) => {
  const { t } = useTranslation()
  const { assistant, setModel } = useAssistant(message.assistantId)
  const model = useModel(getMessageModelId(message), message.model?.provider) || message.model
  const { isBubbleStyle } = useMessageStyle()
  const { showMessageDivider, messageFont, fontSize } = useSettings()
  const { generating } = useRuntime()
  const messageContainerRef = useRef<HTMLDivElement>(null)
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [selectedQuoteText, setSelectedQuoteText] = useState<string>('')
  const [selectedText, setSelectedText] = useState<string>('')

  // 使用记忆化的上下文菜单项生成函数
  const getContextMenuItems = useContextMenuItems(t, message)
  const dispatch = useAppDispatch()
  const playTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // --- Consolidated State Selection with shallowEqual for performance ---
  const { ttsEnabled, isVoiceCallActive, lastPlayedMessageId, skipNextAutoTTS } = useAppSelector(
    (state) => ({
      ttsEnabled: state.settings.ttsEnabled,
      voiceCallEnabled: state.settings.voiceCallEnabled,
      isVoiceCallActive: state.settings.isVoiceCallActive,
      lastPlayedMessageId: state.settings.lastPlayedMessageId,
      skipNextAutoTTS: state.settings.skipNextAutoTTS
    }),
    shallowEqual
  ) // 使用 shallowEqual 比较函数避免不必要的重渲染
  // ---------------------------------

  const isLastMessage = index === 0
  const isAssistantMessage = message.role === 'assistant'
  const showMenubar = !isStreaming && !message.status.includes('ing')

  const fontFamily = useMemo(() => {
    // 优化：简化字符串操作，减少每次渲染时的计算开销
    return messageFont === 'serif' ? FONT_FAMILY.replace('sans-serif', 'serif').replace('Ubuntu, ', '') : FONT_FAMILY
  }, [messageFont])

  const messageBorder = showMessageDivider ? '1px dotted var(--color-border)' : 'none' // Applied directly in MessageFooter style
  const messageBackground = getMessageBackground(isBubbleStyle, isAssistantMessage) // Call the fixed function

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const _selectedText = window.getSelection()?.toString() || ''
    setContextMenuPosition({ x: e.clientX, y: e.clientY })

    if (_selectedText) {
      const quotedText =
        _selectedText
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n') + '\n-------------'
      setSelectedQuoteText(quotedText)
      setSelectedText(_selectedText)
    } else {
      setSelectedQuoteText('')
      setSelectedText('')
    }
  }, [])

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => {
      setContextMenuPosition(null)
    }
    document.addEventListener('click', handleClick)
    return () => {
      document.removeEventListener('click', handleClick)
    }
  }, [])

  // --- Reset skipNextAutoTTS on New Message Completion ---
  const prevGeneratingRef = useRef(generating)
  useEffect(() => {
    prevGeneratingRef.current = generating
  }, [generating])

  useEffect(() => {
    if (
      prevGeneratingRef.current &&
      !generating &&
      isLastMessage &&
      isAssistantMessage &&
      message.status === 'success'
    ) {
      // 简化日志输出
      console.log('消息生成完成，重置skipNextAutoTTS为false, 消息ID:', message.id)
      dispatch(setSkipNextAutoTTS(false))
    }
  }, [generating, isLastMessage, isAssistantMessage, message.status, message.id, dispatch])

  // --- 使用 useMemo 计算是否应该自动播放 TTS ---
  const shouldAutoPlayTTS = useMemo(() => {
    // 基本条件检查
    if (!isLastMessage) return false // 必须是最后一条消息
    if (!isAssistantMessage) return false // 必须是助手消息
    if (message.status !== 'success') return false // 消息状态必须是成功
    if (generating) return false // 正在生成中时不播放
    if (!ttsEnabled) return false // TTS功能必须启用

    // 检查是否是通过语音通话按钮发送的消息
    const isThroughVoiceCall = message.metadata?.isVoiceCallMessage === true;

    // 检查是否需要跳过自动TTS
    if (skipNextAutoTTS === true) {
      console.log('跳过自动TTS: skipNextAutoTTS = true, 消息ID:', message.id);
      return false;
    }

    // 检查消息是否有内容，且消息是新的（不是上次播放过的消息）
    if (!message.content || !message.content.trim() || message.id === lastPlayedMessageId) {
      return false;
    }

    // 语音通话相关条件检查
    if (isThroughVoiceCall || isVoiceCallActive) {
      // 如果是语音通话消息或语音通话窗口激活，则应播放
      console.log('语音通话消息或窗口激活，应自动播放TTS, 消息ID:', message.id);
      return true;
    } else {
      // 非语音通话模式下，根据设置决定是否自动播放
      const autoPlayOutsideVoiceCall = store.getState().settings.autoPlayTTSOutsideVoiceCall;

      if (autoPlayOutsideVoiceCall) {
        console.log('非语音通话模式，但允许自动播放TTS, 消息ID:', message.id);
        return true;
      } else {
        console.log('非语音通话模式，不允许自动播放TTS, 消息ID:', message.id);
        return false;
      }
    }
  }, [
    isLastMessage,
    isAssistantMessage,
    message.status,
    message.content,
    message.id,
    message.metadata,
    generating,
    ttsEnabled,
    isVoiceCallActive,
    skipNextAutoTTS,
    lastPlayedMessageId
  ]);

  // --- 简化后的 TTS 自动播放逻辑 ---
  useEffect(() => {
    // 如果不应该自动播放，直接返回
    if (!shouldAutoPlayTTS) return

    console.log('准备自动播放TTS, 消息ID:', message.id)

    // 只有当没有设置过定时器时才设置
    if (!playTimeoutRef.current) {
      const currentMessageId = message.id // 捕获当前消息ID

      playTimeoutRef.current = setTimeout(() => {
        console.log('自动播放TTS: 消息ID:', currentMessageId)
        // 在播放前再次检查是否还是当前消息
        if (currentMessageId === message.id) {
          TTSService.speakFromMessage(message)
          dispatch(setLastPlayedMessageId(currentMessageId))
        } else {
          console.log('跳过播放TTS: 消息ID不匹配, 计划播放:', currentMessageId, '当前消息:', message.id)
        }

        // 播放完成后清除定时器引用
        playTimeoutRef.current = null
      }, 500)
    }

    // 清理函数
    return () => {
      if (playTimeoutRef.current) {
        console.log('清理TTS自动播放定时器, 消息ID:', message.id)
        clearTimeout(playTimeoutRef.current)
        playTimeoutRef.current = null
      }
    }
  }, [shouldAutoPlayTTS, message, dispatch])

  // --- Highlight message on event ---
  // 使用 useMemo 记忆化消息高亮处理函数，减少重新创建
  const messageHighlightHandler = useMemo(() => {
    return (highlight: boolean = true) => {
      if (messageContainerRef.current) {
        messageContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        if (highlight) {
          const element = messageContainerRef.current
          element.classList.add('message-highlight')
          setTimeout(() => {
            element?.classList.remove('message-highlight')
          }, 2500)
        }
      }
    }
  }, []) // 空依赖数组，因为函数内部使用的是 ref 的 .current 属性

  useEffect(() => {
    const eventName = `${EVENT_NAMES.LOCATE_MESSAGE}:${message.id}`
    const unsubscribe = EventEmitter.on(eventName, messageHighlightHandler)
    return () => unsubscribe()
  }, [message.id, messageHighlightHandler])

  // --- Component Rendering ---

  if (hidePresetMessages && message.isPreset) {
    return null
  }

  if (message.type === 'clear') {
    return (
      <NewContextMessage onClick={() => EventEmitter.emit(EVENT_NAMES.NEW_CONTEXT)}>
        <Divider dashed style={{ padding: '0 20px' }} plain>
          {t('chat.message.new.context')}
        </Divider>
      </NewContextMessage>
    )
  }

  return (
    <MessageContainer
      key={message.id}
      className={classNames({
        message: true,
        'message-assistant': isAssistantMessage,
        'message-user': !isAssistantMessage
      })}
      ref={messageContainerRef}
      onContextMenu={handleContextMenu}
      style={{ ...style, alignItems: isBubbleStyle ? (isAssistantMessage ? 'start' : 'end') : undefined }}>
      {contextMenuPosition && (
        <Dropdown
          overlayStyle={{ position: 'fixed', left: contextMenuPosition.x, top: contextMenuPosition.y, zIndex: 1000 }}
          menu={{ items: getContextMenuItems(selectedQuoteText, selectedText) }}
          open={true}
          trigger={['contextMenu']}>
          {/* FIX 2: Use the styled component instead of inline style */}
          <ContextMenuTriggerDiv x={contextMenuPosition.x} y={contextMenuPosition.y} />
        </Dropdown>
      )}
      <MessageHeader message={message} assistant={assistant} model={model} key={getModelUniqId(model)} />
      <MessageContentContainer
        className="message-content-container"
        style={{ fontFamily, fontSize, background: messageBackground }}>
        <MessageErrorBoundary>
          <MessageContent message={message} model={model} />
        </MessageErrorBoundary>
        {isAssistantMessage && (
          <ProgressBarWrapper>
            <TTSProgressBar messageId={message.id} />
          </ProgressBarWrapper>
        )}
        {showMenubar && (
          <MessageFooter
            style={{
              borderTop: messageBorder, // Apply border style here
              flexDirection: isBubbleStyle ? 'row-reverse' : undefined
            }}>
            <MessageTokens message={message} isLastMessage={isLastMessage} />
            <MessageMenubar
              message={message}
              assistant={assistant}
              model={model}
              index={index}
              topic={topic}
              isLastMessage={isLastMessage}
              isAssistantMessage={isAssistantMessage}
              isGrouped={isGrouped}
              messageContainerRef={messageContainerRef}
              setModel={setModel}
            />
          </MessageFooter>
        )}
      </MessageContentContainer>
    </MessageContainer>
  )
}

// 使用 hook 封装上下文菜单项生成逻辑，便于在组件内使用
const useContextMenuItems = (t: (key: string) => string, message: Message) => {
  // 使用useAppSelector获取话题对象
  const topicObj = useAppSelector((state) => {
    const assistants = state.assistants.assistants
    for (const assistant of assistants) {
      const topic = assistant.topics.find((t) => t.id === message.topicId)
      if (topic) return topic
    }
    return null
  })

  // 如果找不到话题对象，创建一个简单的话题对象
  const fallbackTopic = useMemo(
    () => ({
      id: message.topicId,
      assistantId: message.assistantId,
      name: '',
      createdAt: '',
      updatedAt: '',
      messages: []
    }),
    [message.topicId, message.assistantId]
  )

  // 导入翻译相关的依赖
  const { editMessage } = useMessageOperations(topicObj || fallbackTopic)
  const [isTranslating, setIsTranslating] = useState(false)

  // 不再需要存储翻译映射关系

  // 处理翻译功能
  const handleTranslate = useCallback(
    async (language: string, text: string, selection?: { start: number; end: number }) => {
      if (isTranslating) return

      // 显示翻译中的提示
      window.message.loading({ content: t('translate.processing'), key: 'translate-message' })

      setIsTranslating(true)

      try {
        // 导入翻译服务
        const { translateText } = await import('@renderer/services/TranslateService')

        // 检查文本是否包含翻译标签
        const translatedTagRegex = /<translated[^>]*>([\s\S]*?)<\/translated>/g

        // 如果文本包含翻译标签，则提取原始文本
        let originalText = text
        const translatedMatch = text.match(translatedTagRegex)
        if (translatedMatch) {
          // 提取原始文本属性
          const originalAttrRegex = /original="([^"]*)"/
          const originalAttrMatch = translatedMatch[0].match(originalAttrRegex)
          if (originalAttrMatch && originalAttrMatch[1]) {
            originalText = originalAttrMatch[1].replace(/&quot;/g, '"')
          }
        }

        // 执行翻译
        const translatedText = await translateText(originalText, language)

        // 如果是选中的文本，直接替换原文中的选中部分
        if (selection) {
          // 不再需要存储翻译映射关系

          // 替换消息内容中的选中部分
          const newContent =
            message.content.substring(0, selection.start) +
            `<translated original="${originalText.replace(/"/g, '&quot;')}" language="${language}">${translatedText}</translated>` +
            message.content.substring(selection.end)

          // 更新消息内容
          editMessage(message.id, { content: newContent })

          // 关闭加载提示
          window.message.destroy('translate-message')

          // 显示成功提示
          window.message.success({
            content: t('translate.success'),
            key: 'translate-message'
          })
        }
        // 如果是整个消息的翻译，则更新消息的翻译内容
        else if (text === message.content) {
          // 更新消息的翻译内容
          editMessage(message.id, { translatedContent: translatedText })

          // 关闭加载提示
          window.message.destroy('translate-message')

          // 显示成功提示
          window.message.success({
            content: t('translate.success'),
            key: 'translate-message'
          })
        }
      } catch (error) {
        console.error('Translation failed:', error)
        window.message.error({ content: t('translate.error.failed'), key: 'translate-message' })
      } finally {
        setIsTranslating(false)
      }
    },
    [isTranslating, message, editMessage, t]
  )

  // 添加全局翻译切换函数
  useEffect(() => {
    // 定义切换翻译的函数
    window.toggleTranslation = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.classList.contains('translated-text')) {
        const original = target.getAttribute('data-original')
        const currentText = target.textContent

        // 切换显示内容
        if (target.getAttribute('data-showing-original') === 'true') {
          // 当前显示原文，切换回翻译文本
          target.textContent = target.getAttribute('data-translated') || ''
          target.setAttribute('data-showing-original', 'false')
        } else {
          // 当前显示翻译文本，切换回原文
          // 始终保存当前翻译文本，不论翻译多少次
          if (!target.hasAttribute('data-translated')) {
            target.setAttribute('data-translated', currentText || '')
          }
          target.textContent = original || ''
          target.setAttribute('data-showing-original', 'true')
        }
      }
    }

    // 清理函数
    return () => {
      // 使用类型断言来避免 TypeScript 错误
      ; (window as any).toggleTranslation = undefined
    }
  }, [])

  // 获取选中文本的位置信息
  const getSelectionInfo = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null

    // 获取消息内容
    const content = message.content

    // 获取选中文本
    const selectedText = selection.toString()

    // 如果没有选中文本，返回null
    if (!selectedText) return null

    // 尝试获取选中文本在消息内容中的位置
    const startIndex = content.indexOf(selectedText)
    if (startIndex === -1) return null

    return {
      text: selectedText,
      start: startIndex,
      end: startIndex + selectedText.length
    }
  }, [message.content])

  return useMemo(() => {
    return (selectedQuoteText: string, selectedText: string): ItemType[] => {
      const items: ItemType[] = []

      if (selectedText) {
        items.push({
          key: 'copy',
          label: t('common.copy'),
          onClick: () => {
            navigator.clipboard
              .writeText(selectedText)
              .then(() => window.message.success({ content: t('message.copied'), key: 'copy-message' }))
              .catch((err) => console.error('Failed to copy text: ', err))
          }
        })
        items.push({
          key: 'quote',
          label: t('chat.message.quote'),
          onClick: () => {
            EventEmitter.emit(EVENT_NAMES.QUOTE_TEXT, selectedQuoteText)
          }
        })

        // 添加翻译子菜单
        items.push({
          key: 'translate',
          label: t('chat.translate') || '翻译',
          children: [
            ...TranslateLanguageOptions.map((item) => ({
              label: item.emoji + ' ' + item.label,
              key: `translate-${item.value}`,
              onClick: () => {
                const selectionInfo = getSelectionInfo()
                if (selectionInfo) {
                  handleTranslate(item.value, selectedText, selectionInfo)
                } else {
                  handleTranslate(item.value, selectedText)
                }
              }
            }))
          ]
        })

        items.push({
          key: 'speak_selected',
          label: t('chat.message.speak_selection') || '朗读选中部分',
          onClick: () => {
            // 首先手动关闭菜单
            document.dispatchEvent(new MouseEvent('click'))

            // 使用setTimeout确保菜单关闭后再执行TTS功能
            setTimeout(() => {
              import('@renderer/services/TTSService')
                .then(({ default: TTSServiceInstance }) => {
                  let textToSpeak = selectedText
                  if (message.content) {
                    const startIndex = message.content.indexOf(selectedText)
                    if (startIndex !== -1) {
                      textToSpeak = selectedText // Just speak selection
                    }
                  }
                  // 传递消息ID，确保进度条和停止按钮正常工作
                  TTSServiceInstance.speak(textToSpeak, false, message.id) // 使用普通播放模式而非分段播放
                })
                .catch((err) => console.error('Failed to load or use TTSService:', err))
            }, 100)
          }
        })
        items.push({ type: 'divider' })
      }

      items.push({
        key: 'copy_id',
        label: t('message.copy_id') || '复制消息ID',
        onClick: () => {
          navigator.clipboard
            .writeText(message.id)
            .then(() =>
              window.message.success({ content: t('message.id_copied') || '消息ID已复制', key: 'copy-message-id' })
            )
            .catch((err) => console.error('Failed to copy message ID: ', err))
        }
      })

      return items
    }
  }, [t, message.id, message.content, handleTranslate, getSelectionInfo]) // 添加getSelectionInfo到依赖项
}

// Styled components definitions
const MessageContainer = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
  transition: background-color 0.3s ease;
  padding: 0 20px;
  transform: translateZ(0);
  will-change: transform, background-color;

  &.message-highlight {
    background-color: var(--color-primary-mute);
  }

  .menubar {
    opacity: 0;
    transition: opacity 0.2s ease;
    transform: translateZ(0);
    will-change: opacity;
    pointer-events: none;
  }

  &:hover .menubar {
    opacity: 1;
    pointer-events: auto;
  }
`

const MessageContentContainer = styled.div`
  max-width: 100%;
  display: flex;
  flex: 1;
  flex-direction: column;
  margin-left: 46px;
  margin-top: 5px;
`

// 样式已移至Markdown组件中处理

const MessageFooter = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
  margin-top: 8px;
  /* borderTop applied via style prop based on showMessageDivider */
  gap: 16px;
`

const NewContextMessage = styled.div`
  cursor: pointer;
`

const ProgressBarWrapper = styled.div`
  width: calc(100% - 20px);
  padding: 5px 10px;
  margin-left: -10px;
`

export default memo(MessageItem)
