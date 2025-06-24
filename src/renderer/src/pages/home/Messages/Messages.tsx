import Scrollbar from '@renderer/components/Scrollbar'
import { LOAD_MORE_COUNT } from '@renderer/config/constant'
import db from '@renderer/databases'
import { useAssistant } from '@renderer/hooks/useAssistant'
import { useMessageOperations, useTopicMessages } from '@renderer/hooks/useMessageOperations'
import { useSettings } from '@renderer/hooks/useSettings'
import { useShortcut } from '@renderer/hooks/useShortcuts'
import { autoRenameTopic, getTopic } from '@renderer/hooks/useTopic'
import { getDefaultTopic } from '@renderer/services/AssistantService'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import { getContextCount, getGroupedMessages, getUserMessage } from '@renderer/services/MessagesService'
import { estimateHistoryTokens } from '@renderer/services/TokenService'
import { useAppDispatch } from '@renderer/store'
import type { Assistant, Message, Topic } from '@renderer/types'
import {
  captureScrollableDivAsBlob,
  captureScrollableDivAsDataURL,
  removeSpecialCharactersForFileName,
  runAsyncFunction
} from '@renderer/utils'
import { flatten, last, take } from 'lodash'
import React, { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import InfiniteScroll from 'react-infinite-scroll-component'
import BeatLoader from 'react-spinners/BeatLoader'
import styled from 'styled-components'

import ChatNavigation from './ChatNavigation'
import MessageAnchorLine from './MessageAnchorLine'
import MessageGroup from './MessageGroup'
import NarrowLayout from './NarrowLayout'
import Prompt from './Prompt'
import TTSStopButton from './TTSStopButton'

// 定义暴露给父组件的 ref 类型
export interface MessagesRef {
  scrollToMessage: (messageId: string) => void
}

interface MessagesProps {
  assistant: Assistant
  topic: Topic
  setActiveTopic: (topic: Topic) => void
}

// 使用 React.forwardRef 转发 ref
const Messages = ({
  ref,
  assistant,
  topic,
  setActiveTopic
}: MessagesProps & { ref?: React.RefObject<MessagesRef | null> }) => {
  const { t } = useTranslation()
  const { showTopics, topicPosition, showAssistants, messageNavigation } = useSettings()
  const { updateTopic, addTopic } = useAssistant(assistant.id)
  const dispatch = useAppDispatch()
  const containerRef = useRef<HTMLDivElement>(null)
  const [displayMessages, setDisplayMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isProcessingContext, setIsProcessingContext] = useState(false)
  const messages = useTopicMessages(topic)
  const { displayCount, updateMessages, clearTopicMessages, deleteMessage } = useMessageOperations(topic)
  const messagesRef = useRef<Message[]>(messages)

  // 确保DOM级别的事件传播不会被阻断
  useEffect(() => {
    // 创建DOM事件拦截器，防止任何元素阻止事件传播
    const preventEventSuppression = (e: Event) => {
      if (e.target && e.target instanceof Element) {
        // 检查事件目标是否在消息容器内
        if (containerRef.current?.contains(e.target)) {
          // 确保stopPropagation和stopImmediatePropagation方法被禁用
          const originalStopPropagation = e.stopPropagation
          const originalStopImmediatePropagation = e.stopImmediatePropagation

          e.stopPropagation = function () {
            console.log('防止了事件传播被阻止', e.type)
            // 不执行原始的stopPropagation
          }

          e.stopImmediatePropagation = function () {
            console.log('防止了事件immediate传播被阻止', e.type)
            // 不执行原始的stopImmediatePropagation
          }

          // 处理完事件后恢复原始方法
          setTimeout(() => {
            e.stopPropagation = originalStopPropagation
            e.stopImmediatePropagation = originalStopImmediatePropagation
          }, 0)
        }
      }
    }

    // 监听所有文本选择相关事件
    document.addEventListener('mousedown', preventEventSuppression, true)
    document.addEventListener('mouseup', preventEventSuppression, true)
    document.addEventListener('click', preventEventSuppression, true)
    document.addEventListener('selectstart', preventEventSuppression, true)
    document.addEventListener('selectionchange', preventEventSuppression, true)

    return () => {
      document.removeEventListener('mousedown', preventEventSuppression, true)
      document.removeEventListener('mouseup', preventEventSuppression, true)
      document.removeEventListener('click', preventEventSuppression, true)
      document.removeEventListener('selectstart', preventEventSuppression, true)
      document.removeEventListener('selectionchange', preventEventSuppression, true)
    }
  }, [])

  // 添加全局mouseup事件处理，确保外部划词工具栏能正常触发
  useEffect(() => {
    // 文档级别的事件处理函数，确保不会被组件层级阻隔
    const handleDocumentMouseUp = (e: MouseEvent) => {
      // 同步获取选中文本
      const selection = window.getSelection()
      if (selection && selection.toString().trim().length > 0) {
        console.log('全局文本选中处理:', selection.toString().trim().length)

        // 手动触发一个完全无阻拦的mouseup事件
        try {
          setTimeout(() => {
            // 使用setTimeout确保在DOM事件循环结束后触发
            // 创建一个完全独立的MouseEvent
            const syntheticEvent = new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: false, // 不可取消
              view: window,
              detail: 0,
              clientX: e.clientX,
              clientY: e.clientY,
              ctrlKey: e.ctrlKey,
              altKey: e.altKey,
              shiftKey: e.shiftKey,
              metaKey: e.metaKey,
              button: e.button,
              buttons: e.buttons,
              relatedTarget: null
            })

            // 将事件分发到window级别，而不是document
            // 这可以绕过可能存在的document级事件拦截
            window.dispatchEvent(syntheticEvent)
          }, 10)
        } catch (error) {
          console.error('创建合成事件失败:', error)
        }
      }
    }

    // 添加到document而不是container
    document.addEventListener('mouseup', handleDocumentMouseUp, true)

    return () => {
      document.removeEventListener('mouseup', handleDocumentMouseUp, true)
    }
  }, [])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    // 优化：使用 requestAnimationFrame 来延迟计算，避免阻塞主线程
    const rafId = requestAnimationFrame(() => {
      const newDisplayMessages = computeDisplayMessages(messages, 0, displayCount)
      setDisplayMessages(newDisplayMessages)
      setHasMore(messages.length > displayCount)
    })

    // 清理函数，取消未执行的 requestAnimationFrame
    return () => cancelAnimationFrame(rafId)
  }, [messages, displayCount])

  const maxWidth = useMemo(() => {
    // 优化：缓存计算结果，减少字符串拼接
    const showRightTopics = showTopics && topicPosition === 'right'
    const minusAssistantsWidth = showAssistants ? '- var(--assistants-width)' : ''
    const minusRightTopicsWidth = showRightTopics ? '- var(--assistants-width)' : ''

    // 使用模板字符串代替多次字符串拼接，提高可读性
    return `calc(100vw - var(--sidebar-width) ${minusAssistantsWidth} ${minusRightTopicsWidth} - 5px)`
  }, [showAssistants, showTopics, topicPosition])

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTo({
            top: containerRef.current.scrollHeight
          })
        }
      })
    }
  }, [])

  const clearTopic = useCallback(
    async (data: Topic) => {
      const defaultTopic = getDefaultTopic(assistant.id)

      if (data && data.id !== topic.id) {
        await clearTopicMessages(data.id)
        updateTopic({ ...data, name: defaultTopic.name } as Topic)
        return
      }

      await clearTopicMessages()

      setDisplayMessages([])

      const _topic = getTopic(assistant, topic.id)
      _topic && updateTopic({ ..._topic, name: defaultTopic.name } as Topic)
    },
    [assistant, clearTopicMessages, topic.id, updateTopic]
  )

  useEffect(() => {
    const unsubscribes = [
      EventEmitter.on(EVENT_NAMES.SEND_MESSAGE, scrollToBottom),
      EventEmitter.on(EVENT_NAMES.CLEAR_MESSAGES, async (data: Topic) => {
        window.modal.confirm({
          title: t('chat.input.clear.title'),
          content: t('chat.input.clear.content'),
          centered: true,
          onOk: () => clearTopic(data)
        })
      }),
      EventEmitter.on(EVENT_NAMES.COPY_TOPIC_IMAGE, async () => {
        await captureScrollableDivAsBlob(containerRef, async (blob) => {
          if (blob) {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          }
        })
      }),
      EventEmitter.on(EVENT_NAMES.EXPORT_TOPIC_IMAGE, async () => {
        const imageData = await captureScrollableDivAsDataURL(containerRef)
        if (imageData) {
          window.api.file.saveImage(removeSpecialCharactersForFileName(topic.name), imageData)
        }
      }),
      EventEmitter.on(EVENT_NAMES.NEW_CONTEXT, async () => {
        if (isProcessingContext) return
        setIsProcessingContext(true)

        try {
          const messages = messagesRef.current

          if (messages.length === 0) {
            return
          }

          const lastMessage = last(messages)

          if (lastMessage?.type === 'clear') {
            await deleteMessage(lastMessage.id)
            scrollToBottom()
            return
          }

          const clearMessage = getUserMessage({ assistant, topic, type: 'clear' })
          const newMessages = [...messages, clearMessage]
          await updateMessages(newMessages)

          scrollToBottom()
        } finally {
          setIsProcessingContext(false)
        }
      }),
      EventEmitter.on(EVENT_NAMES.NEW_BRANCH, async (index: number) => {
        const newTopic = getDefaultTopic(assistant.id)
        newTopic.name = topic.name
        const currentMessages = messagesRef.current

        // 复制消息并且更新 topicId
        const branchMessages = take(currentMessages, currentMessages.length - index).map((msg) => ({
          ...msg,
          topicId: newTopic.id
        }))

        // 将分支的消息放入数据库
        await db.topics.add({ id: newTopic.id, messages: branchMessages })
        addTopic(newTopic)
        setActiveTopic(newTopic)
        autoRenameTopic(assistant, newTopic.id)

        // 由于复制了消息，消息中附带的文件的总数变了，需要更新
        const filesArr = branchMessages.map((m) => m.files)
        const files = flatten(filesArr).filter(Boolean)

        files.map(async (f) => {
          const file = await db.files.get({ id: f?.id })
          file && db.files.update(file.id, { count: file.count + 1 })
        })
      })
    ]

    return () => unsubscribes.forEach((unsub) => unsub())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistant, dispatch, scrollToBottom, topic, isProcessingContext])

  // 添加滚动到指定消息的函数
  const scrollToMessage = useCallback((messageId: string) => {
    const messageElement = document.getElementById(`message-${messageId}`)
    if (containerRef.current && messageElement) {
      // 使用 scrollIntoView 使元素可见
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  // 暴露 scrollToMessage 函数给父组件
  useImperativeHandle(ref, () => ({
    scrollToMessage
  }))

  useEffect(() => {
    runAsyncFunction(async () => {
      EventEmitter.emit(EVENT_NAMES.ESTIMATED_TOKEN_COUNT, {
        tokensCount: await estimateHistoryTokens(assistant, messages),
        contextCount: getContextCount(assistant, messages)
      })
    })
  }, [assistant, messages])

  const loadMoreMessages = useCallback(() => {
    if (!hasMore || isLoadingMore) return

    setIsLoadingMore(true)
    // 使用requestAnimationFrame代替setTimeout，更好地与浏览器渲染周期同步
    requestAnimationFrame(() => {
      const currentLength = displayMessages.length

      // 优化：只计算新的消息批次，而不是重新计算整个列表
      // 获取已经反转的消息数组
      const reversedMessages = [...messages].reverse()

      // 从当前显示的消息数量开始，获取下一批消息
      const nextBatchMessages = reversedMessages.slice(currentLength, currentLength + LOAD_MORE_COUNT)

      // 对这批新消息应用相同的处理逻辑，确保一致性
      const processedBatch = processMessageBatch(nextBatchMessages)

      // 批量更新状态，减少渲染次数
      setDisplayMessages((prev) => [...prev, ...processedBatch])
      setHasMore(currentLength + LOAD_MORE_COUNT < messages.length)
      setIsLoadingMore(false)
    })
  }, [displayMessages.length, hasMore, isLoadingMore, messages])

  // 辅助函数：处理一批消息，应用与computeDisplayMessages相同的逻辑
  // 但只处理传入的批次，不处理整个消息列表
  const processMessageBatch = (messageBatch: Message[]) => {
    const userIdSet = new Set() // 用户消息 id 集合
    const assistantIdSet = new Set() // 助手消息 askId 集合
    const processedIds = new Set<string>() // 用于跟踪已处理的消息ID
    const batchDisplayMessages: Message[] = []
    const messageIdMap = new Map<string, boolean>() // 用于快速查找消息ID是否存在

    // 处理单条消息的函数
    const processMessage = (message: Message) => {
      if (!message) return

      // 跳过隐藏的消息（系统消息）
      if (message.isHidden) {
        return
      }

      // 跳过已处理的消息ID
      if (processedIds.has(message.id)) {
        return
      }

      processedIds.add(message.id) // 标记此消息ID为已处理

      // 如果是工具调用相关消息，直接添加到显示列表中
      if (message.metadata?.isToolResultQuery || message.metadata?.isToolResultResponse) {
        batchDisplayMessages.push(message)
        messageIdMap.set(message.id, true)
        return
      }

      const idSet = message.role === 'user' ? userIdSet : assistantIdSet
      const messageId = message.role === 'user' ? message.id : message.askId

      if (!idSet.has(messageId)) {
        idSet.add(messageId)
        batchDisplayMessages.push(message)
        messageIdMap.set(message.id, true)
        return
      }

      // 使用Map进行O(1)复杂度的查找，替代O(n)复杂度的数组some方法
      if (message.role === 'assistant' && !messageIdMap.has(message.id)) {
        batchDisplayMessages.push(message)
        messageIdMap.set(message.id, true)
      }
    }

    // 处理批次中的每条消息
    messageBatch.forEach(processMessage)

    return batchDisplayMessages
  }

  useShortcut('copy_last_message', () => {
    const lastMessage = last(messages)
    if (lastMessage) {
      navigator.clipboard.writeText(lastMessage.content)
      window.message.success(t('message.copy.success'))
    }
  })

  // 使用记忆化渲染消息组，避免不必要的重渲染
  const renderMessageGroups = useMemo(() => {
    const groupedMessages = getGroupedMessages(displayMessages)
    return Object.entries(groupedMessages).map(([key, groupMessages]) => (
      <MessageGroup
        key={key}
        messages={groupMessages}
        topic={topic}
        hidePresetMessages={assistant.settings?.hideMessages}
      />
    ))
  }, [displayMessages, topic, assistant.settings?.hideMessages])

  // 优化的消息计算函数，使用Map代替多次数组查找，提高性能
  const computeDisplayMessages = (messages: Message[], startIndex: number, displayCount: number) => {
    // 使用缓存避免不必要的重复计算
    const reversedMessages = [...messages].reverse()

    // 如果剩余消息数量小于 displayCount，直接返回所有剩余消息
    if (reversedMessages.length - startIndex <= displayCount) {
      return reversedMessages.slice(startIndex)
    }

    const userIdSet = new Set() // 用户消息 id 集合
    const assistantIdSet = new Set() // 助手消息 askId 集合
    const processedIds = new Set<string>() // 用于跟踪已处理的消息ID
    const displayMessages: Message[] = []
    const messageIdMap = new Map<string, boolean>() // 用于快速查找消息ID是否存在

    // 处理单条消息的函数
    const processMessage = (message: Message) => {
      if (!message) return

      // 跳过隐藏的消息（系统消息）
      if (message.isHidden) {
        return
      }

      // 跳过已处理的消息ID
      if (processedIds.has(message.id)) {
        return
      }

      processedIds.add(message.id) // 标记此消息ID为已处理

      // 如果是工具调用相关消息，直接添加到显示列表中
      if (message.metadata?.isToolResultQuery || message.metadata?.isToolResultResponse) {
        displayMessages.push(message)
        messageIdMap.set(message.id, true)
        return
      }

      const idSet = message.role === 'user' ? userIdSet : assistantIdSet
      const messageId = message.role === 'user' ? message.id : message.askId

      if (!idSet.has(messageId)) {
        idSet.add(messageId)
        displayMessages.push(message)
        messageIdMap.set(message.id, true)
        return
      }

      // 使用Map进行O(1)复杂度的查找，替代O(n)复杂度的数组some方法
      if (message.role === 'assistant' && !messageIdMap.has(message.id)) {
        displayMessages.push(message)
        messageIdMap.set(message.id, true)
      }
    }

    // 使用批处理方式处理消息，每次处理一批，减少循环次数
    const batchSize = Math.min(50, displayCount) // 每批处理的消息数量
    let processedCount = 0

    for (let i = startIndex; i < reversedMessages.length && userIdSet.size + assistantIdSet.size < displayCount; i++) {
      processMessage(reversedMessages[i])
      processedCount++

      // 每处理一批消息，检查是否已满足显示数量要求
      if (processedCount % batchSize === 0 && userIdSet.size + assistantIdSet.size >= displayCount) {
        break
      }
    }

    return displayMessages
  }

  return (
    <Container
      id="messages"
      style={{ maxWidth }}
      key={assistant.id}
      ref={containerRef}
      $right={topicPosition === 'left'}>
      {/* 添加全局样式标签，确保消息内容可以被外部工具栏正常选择 */}
      <style>
        {`
          /* 确保所有消息内容可以被正确选择 */
          #messages .markdown-body,
          #messages .message-content-container,
          #messages .message,
          #messages .infinite-scroll-component,
          #messages *,
          .infinite-scroll-component div,
          .infinite-scroll-component *,
          .messages-infinite-scroll * {
            pointer-events: auto !important;
            user-select: text !important;
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
            cursor: text;
          }

          /* 固定第三方工具栏问题 - 从通用选择器中移除position设置 */
          .enable-text-selection {
            position: relative !important;
            z-index: 10 !important;
          }

          /* 确保滚动容器不会阻止事件冒泡 */
          #messages {
            pointer-events: auto !important;
            overflow-x: hidden !important;
          }

          /* 防止长按选择被阻止 */
          #messages, #messages * {
            touch-action: auto !important;
            -webkit-touch-callout: default !important;
          }
        `}
      </style>

      <NarrowLayout style={{ display: 'flex', flexDirection: 'column-reverse' }}>
        <InfiniteScroll
          dataLength={displayMessages.length}
          next={loadMoreMessages}
          hasMore={hasMore}
          loader={null}
          scrollableTarget="messages"
          inverse
          style={{
            overflow: 'hidden', // 改为hidden，防止内容溢出
            pointerEvents: 'auto',
            transform: 'translate3d(0,0,0)', // 强制硬件加速
            position: 'static', // 改为static，不改变定位上下文
            zIndex: 1 // 提高z-index确保工具栏能显示在上层
          }}
          scrollThreshold={0.8} // 提前触发加载更多
          initialScrollY={0}
          className="messages-infinite-scroll enable-text-selection">
          <ScrollContainer>
            <LoaderContainer $loading={isLoadingMore}>
              <BeatLoader size={8} color="var(--color-text-2)" />
            </LoaderContainer>
            {renderMessageGroups}
          </ScrollContainer>
        </InfiniteScroll>
        <Prompt assistant={assistant} key={assistant.prompt} topic={topic} />
      </NarrowLayout>
      {useMemo(() => {
        if (messageNavigation === 'anchor') {
          return <MessageAnchorLine messages={displayMessages} />
        }
        if (messageNavigation === 'buttons') {
          return <ChatNavigation containerId="messages" />
        }
        return null
      }, [messageNavigation, displayMessages])}
      <TTSStopButton />
    </Container>
  )
}

const LoaderContainer = styled.div<{ $loading: boolean }>`
  display: flex;
  justify-content: center;
  padding: 10px;
  width: 100%;
  background: var(--color-background);
  opacity: ${(props) => (props.$loading ? 1 : 0)};
  transition: opacity 0.3s ease;
  pointer-events: none;
`

const ScrollContainer = styled.div`
  display: flex;
  flex-direction: column-reverse;
  margin-bottom: -20px; // 添加负的底部外边距来减少空间
`

interface ContainerProps {
  $right?: boolean
}



const Container = styled(Scrollbar) <ContainerProps>`
  display: flex;
  flex-direction: column-reverse;
  padding: 10px 0 10px;
  overflow-x: hidden;
  background-color: var(--color-background);
  z-index: 1;

  /* 确保所有消息内容可以被正确选择 */
  * {
    user-select: text !important;
    -webkit-user-select: text !important;
  }

  /* 确保划词工具栏能正常显示 */
  .markdown-body,
  .message-content-container,
  .message {
    pointer-events: auto !important;
  }
`

export default memo(Messages, (prevProps, nextProps) => {
  // 只在关键属性变化时重新渲染
  return prevProps.assistant.id === nextProps.assistant.id && prevProps.topic.id === nextProps.topic.id
})
