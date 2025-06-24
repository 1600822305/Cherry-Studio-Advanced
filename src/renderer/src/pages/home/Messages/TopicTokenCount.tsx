import { InfoCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { Tooltip } from 'antd'
import { FC, useEffect, useState } from 'react'
import { Message, Topic } from '@renderer/types'

interface Props {
  topic: Topic
  messages: Message[]
}

/**
 * 显示话题总token计数的组件
 */
const TopicTokenCount: FC<Props> = ({ messages }) => {
  const { t } = useTranslation()
  const [totalTokens, setTotalTokens] = useState(0)

  // 计算话题总token数
  useEffect(() => {
    // 计算所有消息的token总和
    const total = messages.reduce((sum, message) => {
      // 如果消息有usage信息，加上total_tokens
      if (message.usage?.total_tokens) {
        return sum + message.usage.total_tokens
      }
      return sum
    }, 0)

    setTotalTokens(total)
  }, [messages])

  return (
    <Container>
      <Tooltip title={t('chat.topic.total_tokens.tip') || '该话题历史对话累计使用的token总数'}>
        <span>
          {t('chat.topic.total_tokens') || '总计 Tokens'}: {totalTokens.toLocaleString()}
          <InfoCircleOutlined style={{ marginLeft: '5px', fontSize: '12px' }} />
        </span>
      </Tooltip>
    </Container>
  )
}

const Container = styled.div`
  font-size: 12px;
  color: var(--color-text-2);
  padding: 5px 10px;
  background-color: var(--color-background-soft);
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  margin: 0 10px;
  user-select: none;
  border: 0.5px solid var(--color-border);
`

export default TopicTokenCount
