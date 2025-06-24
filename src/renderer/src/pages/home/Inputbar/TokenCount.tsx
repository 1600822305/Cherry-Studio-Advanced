import { ArrowUpOutlined, MenuOutlined, NumberOutlined } from '@ant-design/icons'
import { HStack, VStack } from '@renderer/components/Layout'
import { useSettings } from '@renderer/hooks/useSettings'
import { useTopicMessages } from '@renderer/hooks/useMessageOperations'
import { Divider, Popover } from 'antd'
import { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { Topic } from '@renderer/types'

type Props = {
  estimateTokenCount: number
  inputTokenCount: number
  contextCount: { current: number; max: number }
  topic?: Topic
  ToolbarButton: any
} & React.HTMLAttributes<HTMLDivElement>

const TokenCount: FC<Props> = ({ estimateTokenCount, inputTokenCount, contextCount, topic }) => {
  const { t } = useTranslation()
  const { showInputEstimatedTokens } = useSettings()
  const [totalTokens, setTotalTokens] = useState(0)
  const messages = topic ? useTopicMessages(topic) : []

  // 计算话题总token数
  useEffect(() => {
    if (!topic || !messages.length) return;

    // 计算所有消息的token总和
    const total = messages.reduce((sum, message) => {
      // 如果消息有usage信息，加上total_tokens
      if (message.usage?.total_tokens) {
        return sum + message.usage.total_tokens
      }
      return sum
    }, 0)

    setTotalTokens(total)
  }, [messages, topic])

  if (!showInputEstimatedTokens) {
    return null
  }

  const formatMaxCount = (max: number) => {
    if (max == 20) {
      return (
        <span
          style={{
            fontSize: '16px',
            position: 'relative',
            top: '1px'
          }}>
          ∞
        </span>
      )
    }
    return max.toString()
  }

  const PopoverContent = () => {
    return (
      <VStack w="185px" background="100%">
        <HStack justifyContent="space-between" w="100%">
          <Text>{t('chat.input.context_count.tip')}</Text>
          <Text>
            {contextCount.current} / {contextCount.max == 20 ? '∞' : contextCount.max}
          </Text>
        </HStack>
        <Divider style={{ margin: '5px 0' }} />
        <HStack justifyContent="space-between" w="100%">
          <Text>{t('chat.input.estimated_tokens.tip')}</Text>
          <Text>{estimateTokenCount}</Text>
        </HStack>
        {topic && (
          <>
            <Divider style={{ margin: '5px 0' }} />
            <HStack justifyContent="space-between" w="100%">
              <Text>{t('chat.topic.total_tokens') || '总计 Tokens'}</Text>
              <Text>{totalTokens.toLocaleString()}</Text>
            </HStack>
          </>
        )}
      </VStack>
    )
  }

  return (
    <Container>
      <Popover content={PopoverContent} placement="top">
        <MenuOutlined /> {contextCount.current} / {formatMaxCount(contextCount.max)}
        <Divider type="vertical" style={{ marginTop: 0, marginLeft: 5, marginRight: 5 }} />
        <ArrowUpOutlined />
        {inputTokenCount} / {estimateTokenCount}
        {topic && (
          <>
            <Divider type="vertical" style={{ marginTop: 0, marginLeft: 5, marginRight: 5 }} />
            <NumberOutlined />
            {totalTokens.toLocaleString()}
          </>
        )}
      </Popover>
    </Container>
  )
}

const Container = styled.div`
  font-size: 11px;
  line-height: 16px;
  color: var(--color-text-2);
  z-index: 10;
  padding: 3px 10px;
  user-select: none;
  font-family: Ubuntu;
  border: 0.5px solid var(--color-text-3);
  border-radius: 20px;
  display: flex;
  align-items: center;
  cursor: pointer;
  .anticon {
    font-size: 10px;
    margin-right: 3px;
  }
  @media (max-width: 800px) {
    display: none;
  }
`

const Text = styled.div`
  font-size: 12px;
  color: var(--color-text-1);
`

export default TokenCount
