import Scrollbar from '@renderer/components/Scrollbar'
import { useMessageOperations } from '@renderer/hooks/useMessageOperations'
import { useSettings } from '@renderer/hooks/useSettings'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import { MultiModelMessageStyle } from '@renderer/store/settings'
import type { Message, Topic } from '@renderer/types'
import { classNames } from '@renderer/utils'
import { Popover } from 'antd'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styled, { css } from 'styled-components'

import MessageGroupMenuBar from './MessageGroupMenuBar'
import MessageStream from './MessageStream'

interface Props {
  messages: (Message & { index: number })[]
  topic: Topic
  hidePresetMessages?: boolean
}

const MessageGroup = ({ messages, topic, hidePresetMessages }: Props) => {
  const { editMessage } = useMessageOperations(topic)
  const { multiModelMessageStyle: multiModelMessageStyleSetting, gridColumns, gridPopoverTrigger } = useSettings()

  const [multiModelMessageStyle, setMultiModelMessageStyle] = useState<MultiModelMessageStyle>(
    messages[0].multiModelMessageStyle || multiModelMessageStyleSetting
  )

  const messageLength = messages.length
  const prevMessageLengthRef = useRef(messageLength)
  const [selectedIndex, setSelectedIndex] = useState(messageLength - 1)

  const getSelectedMessageId = useCallback(() => {
    const selectedMessage = messages.find((message) => message.foldSelected)
    if (selectedMessage) {
      return selectedMessage.id
    }
    return messages[0]?.id
  }, [messages])

  // 记录当前选中的消息 ID
  const selectedMessageIdRef = useRef<string | null>(null)

  const setSelectedMessage = useCallback(
    (message: Message) => {
      // 优化：只更新当前选中的消息和之前选中的消息，而不是所有消息
      const previousSelectedId = selectedMessageIdRef.current
      const newSelectedId = message.id

      // 更新引用以跟踪当前选中的消息 ID
      selectedMessageIdRef.current = newSelectedId

      // 如果有之前选中的消息，将其设置为非选中状态
      if (previousSelectedId && previousSelectedId !== newSelectedId) {
        editMessage(previousSelectedId, { foldSelected: false })
      }

      // 将新选中的消息设置为选中状态
      editMessage(newSelectedId, { foldSelected: true })

      // 滚动到选中的消息
      setTimeout(() => {
        const messageElement = document.getElementById(`message-${message.id}`)
        if (messageElement) {
          messageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 200)
    },
    [editMessage]
  )

  const isGrouped = messageLength > 1 && messages.every((m) => m.role === 'assistant')
  const isHorizontal = multiModelMessageStyle === 'horizontal'
  const isGrid = multiModelMessageStyle === 'grid'

  useEffect(() => {
    if (messageLength > prevMessageLengthRef.current) {
      setSelectedIndex(messageLength - 1)
      const lastMessage = messages[messageLength - 1]
      if (lastMessage) {
        setSelectedMessage(lastMessage)
      }
    } else {
      const selectedId = getSelectedMessageId()
      const newIndex = messages.findIndex((msg) => msg.id === selectedId)
      if (newIndex !== -1) {
        setSelectedIndex(newIndex)
      }
    }
    prevMessageLengthRef.current = messageLength
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageLength])

  // 使用 useMemo 记忆化流程图导航处理函数，减少重新创建
  const handleFlowNavigate = useMemo(() => {
    return (event: CustomEvent) => {
      const { messageId } = event.detail

      // 查找对应的消息在当前消息组中的索引
      const targetIndex = messages.findIndex((msg) => msg.id === messageId)

      // 如果找到消息且不是当前选中的索引，则切换标签
      if (targetIndex !== -1 && targetIndex !== selectedIndex) {
        setSelectedIndex(targetIndex)

        // 使用setSelectedMessage函数来切换标签，这是处理foldSelected的关键
        const targetMessage = messages[targetIndex]
        if (targetMessage) {
          setSelectedMessage(targetMessage)
        }
      }
    }
  }, [messages, selectedIndex, setSelectedIndex, setSelectedMessage])

  // 添加对流程图节点点击事件的监听
  useEffect(() => {
    // 只在组件挂载和消息数组变化时添加监听器
    if (!isGrouped || messageLength <= 1) return

    // 添加事件监听器
    document.addEventListener('flow-navigate-to-message', handleFlowNavigate as EventListener)

    // 清理函数
    return () => {
      document.removeEventListener('flow-navigate-to-message', handleFlowNavigate as EventListener)
    }
  }, [isGrouped, messageLength, handleFlowNavigate])

  // 使用 useMemo 创建消息定位处理函数映射，减少重新创建
  const messageLocateHandlers = useMemo(() => {
    const handlers: { [key: string]: () => void } = {}

    messages.forEach((message) => {
      handlers[message.id] = () => {
        // 检查消息是否处于可见状态
        const element = document.getElementById(`message-${message.id}`)
        if (element) {
          const display = window.getComputedStyle(element).display

          if (display === 'none') {
            // 如果消息隐藏，先切换标签
            setSelectedMessage(message)
          } else {
            // 直接滚动
            element.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }
      }
    })

    return handlers
  }, [messages, setSelectedMessage])

  // 添加对LOCATE_MESSAGE事件的监听
  useEffect(() => {
    // 为每个消息注册一个定位事件监听器
    const eventHandlers: { [key: string]: () => void } = {}

    // 注册所有消息的事件监听器
    Object.entries(messageLocateHandlers).forEach(([messageId, handler]) => {
      const eventName = `${EVENT_NAMES.LOCATE_MESSAGE}:${messageId}`
      eventHandlers[eventName] = handler
      EventEmitter.on(eventName, handler)
    })

    // 清理函数
    return () => {
      // 移除所有事件监听器
      Object.entries(eventHandlers).forEach(([eventName, handler]) => {
        EventEmitter.off(eventName, handler)
      })
    }
  }, [messageLocateHandlers])

  // 使用useMemo缓存消息渲染结果，减少重复计算
  const renderedMessages = useMemo(() => {
    return messages.map((message, index) => {
      const isGridGroupMessage = isGrid && message.role === 'assistant' && isGrouped
      const messageProps = {
        isGrouped,
        message,
        topic,
        index: message.index,
        hidePresetMessages,
        style: {
          paddingTop: isGrouped && ['horizontal', 'grid'].includes(multiModelMessageStyle) ? 0 : 15
        }
      }

      const messageWrapper = (
        <MessageWrapper
          id={`message-${message.id}`}
          $layout={multiModelMessageStyle}
          $selected={index === selectedIndex}
          $isGrouped={isGrouped}
          key={message.id}
          className={classNames({
            'group-message-wrapper': message.role === 'assistant' && isHorizontal && isGrouped,
            [multiModelMessageStyle]: isGrouped,
            selected: message.id === getSelectedMessageId()
          })}>
          <MessageStream {...messageProps} />
        </MessageWrapper>
      )

      if (isGridGroupMessage) {
        return (
          <Popover
            key={message.id}
            content={
              <MessageWrapper
                $layout={multiModelMessageStyle}
                $selected={index === selectedIndex}
                $isGrouped={isGrouped}
                $isInPopover={true}>
                <MessageStream {...messageProps} />
              </MessageWrapper>
            }
            trigger={gridPopoverTrigger}
            styles={{ root: { maxWidth: '60vw', minWidth: '550px', overflowY: 'auto', zIndex: 1000 } }}
            getPopupContainer={(triggerNode) => triggerNode.parentNode as HTMLElement}>
            {messageWrapper}
          </Popover>
        )
      }

      return messageWrapper
    })
  }, [
    messages,
    isGrid,
    isGrouped,
    isHorizontal,
    multiModelMessageStyle,
    selectedIndex,
    topic,
    hidePresetMessages,
    gridPopoverTrigger,
    getSelectedMessageId
  ])

  return (
    <GroupContainer
      id={`message-group-${messages[0].askId}`}
      $isGrouped={isGrouped}
      $layout={multiModelMessageStyle}
      className={classNames([isGrouped && 'group-container', isHorizontal && 'horizontal', isGrid && 'grid'])}>
      <GridContainer
        $count={messageLength}
        $layout={multiModelMessageStyle}
        $gridColumns={gridColumns}
        className={classNames([isGrouped && 'group-grid-container', isHorizontal && 'horizontal', isGrid && 'grid'])}>
        {renderedMessages}
      </GridContainer>
      {isGrouped && (
        <MessageGroupMenuBar
          multiModelMessageStyle={multiModelMessageStyle}
          setMultiModelMessageStyle={(style) => {
            // 优化：使用批量更新消息样式，避免多次调用 editMessage
            setMultiModelMessageStyle(style)

            // 如果有批量更新消息的API，可以使用批量 API
            // 如： editMessagesBatch(messages.map(m => m.id), { multiModelMessageStyle: style })

            // 如果没有批量 API，使用 Promise.all 并行处理所有更新
            Promise.all(messages.map((message) => editMessage(message.id, { multiModelMessageStyle: style }))).catch(
              (err) => console.error('Failed to update message styles:', err)
            )
          }}
          messages={messages}
          selectMessageId={getSelectedMessageId()}
          setSelectedMessage={setSelectedMessage}
          topic={topic}
        />
      )}
    </GroupContainer>
  )
}

const GroupContainer = styled.div<{ $isGrouped: boolean; $layout: MultiModelMessageStyle }>`
  padding-top: ${({ $isGrouped, $layout }) => ($isGrouped && 'horizontal' === $layout ? '15px' : '0')};
  &.group-container.horizontal,
  &.group-container.grid {
    padding: 0 20px;
    .message {
      padding: 0;
    }
    .group-menu-bar {
      margin-left: 0;
      margin-right: 0;
    }
  }
`

const GridContainer = styled.div<{ $count: number; $layout: MultiModelMessageStyle; $gridColumns: number }>`
  width: 100%;
  display: grid;
  gap: ${({ $layout }) => ($layout === 'horizontal' ? '16px' : '0')};
  grid-template-columns: repeat(
    ${({ $layout, $count }) => (['fold', 'vertical'].includes($layout) ? 1 : $count)},
    minmax(550px, 1fr)
  );
  @media (max-width: 800px) {
    grid-template-columns: repeat(
      ${({ $layout, $count }) => (['fold', 'vertical'].includes($layout) ? 1 : $count)},
      minmax(400px, 1fr)
    );
  }
  ${({ $layout }) =>
    $layout === 'horizontal' &&
    css`
      margin-top: 15px;
    `}
  ${({ $gridColumns, $layout, $count }) =>
    $layout === 'grid' &&
    css`
      margin-top: 15px;
      grid-template-columns: repeat(${$count > 1 ? $gridColumns || 2 : 1}, minmax(0, 1fr));
      grid-template-rows: auto;
      gap: 16px;
    `}
  ${({ $layout }) => {
    return $layout === 'horizontal'
      ? css`
          overflow-y: auto;
        `
      : 'overflow-y: visible;'
  }}
`

interface MessageWrapperProps {
  $layout: 'fold' | 'horizontal' | 'vertical' | 'grid'
  $selected: boolean
  $isGrouped: boolean
  $isInPopover?: boolean
}

const MessageWrapper = styled(Scrollbar)<MessageWrapperProps>`
  width: 100%;
  &.horizontal {
    display: inline-block;
  }
  &.grid {
    display: inline-block;
  }
  &.fold {
    display: none;
    &.selected {
      display: inline-block;
    }
  }

  ${({ $layout, $isGrouped }) => {
    if ($layout === 'horizontal' && $isGrouped) {
      return css`
        border: 0.5px solid var(--color-border);
        padding: 10px;
        border-radius: 6px;
        max-height: 600px;
        margin-bottom: 10px;
      `
    }
    return ''
  }}

  ${({ $layout, $isInPopover, $isGrouped }) => {
    // 如果布局是grid，并且是组消息，则设置最大高度和溢出行为（卡片不可滚动，点击展开后可滚动）
    // 如果布局是horizontal，则设置溢出行为（卡片可滚动）
    // 如果布局是fold、vertical，高度不限制，与正常消息流布局一致，则设置卡片不可滚动（visible）
    return $layout === 'grid' && $isGrouped
      ? css`
          max-height: ${$isInPopover ? '50vh' : '300px'};
          overflow-y: ${$isInPopover ? 'auto' : 'hidden'};
          border: 0.5px solid ${$isInPopover ? 'transparent' : 'var(--color-border)'};
          padding: 10px;
          border-radius: 6px;
          background-color: var(--color-background);
        `
      : css`
          overflow-y: ${$layout === 'horizontal' ? 'auto' : 'visible'};
          border-radius: 6px;
        `
  }}
`

// 使用自定义比较函数的memo包装组件，只在关键属性变化时重新渲染
export default memo(MessageGroup, (prevProps, nextProps) => {
  // 如果消息数组长度不同，需要重新渲染
  if (prevProps.messages.length !== nextProps.messages.length) {
    return false
  }

  // 检查消息内容是否变化
  const messagesChanged = prevProps.messages.some((prevMsg, index) => {
    const nextMsg = nextProps.messages[index]
    return (
      prevMsg.id !== nextMsg.id ||
      prevMsg.content !== nextMsg.content ||
      prevMsg.status !== nextMsg.status ||
      prevMsg.foldSelected !== nextMsg.foldSelected ||
      prevMsg.multiModelMessageStyle !== nextMsg.multiModelMessageStyle
    )
  })

  if (messagesChanged) {
    return false
  }

  // 检查其他关键属性
  return prevProps.topic.id === nextProps.topic.id && prevProps.hidePresetMessages === nextProps.hidePresetMessages
})
