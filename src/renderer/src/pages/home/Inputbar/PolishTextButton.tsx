import { getDefaultPolishAssistant } from '@renderer/config/prompts'
import { useDefaultModel } from '@renderer/hooks/useAssistant'
import { getDefaultTopic } from '@renderer/services/AssistantService'
import { getUserMessage } from '@renderer/services/MessagesService'
import { Button, Tooltip } from 'antd'
import { Sparkles } from 'lucide-react'
import { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

interface Props {
  text: string
  onPolished: (text: string) => void
  disabled?: boolean
  style?: React.CSSProperties
  isLoading?: boolean
}

// 创建一个函数来获取润色助手
export const getDefaultPolishTextAssistant = (text: string) => {
  return getDefaultPolishAssistant(text)
}

// 创建一个函数来处理润色请求
export const fetchPolishText = async ({
  message,
  assistant,
  onResponse
}: {
  message: any
  assistant: any
  onResponse?: (text: string) => void
}) => {
  // 导入 ApiService 中的 fetchTranslate 函数
  const { fetchTranslate } = await import('@renderer/services/ApiService')

  // 使用翻译功能的底层实现来实现润色功能
  return fetchTranslate({ message, assistant, onResponse })
}

const PolishTextButton: FC<Props> = ({ text, onPolished, disabled, style, isLoading }) => {
  const { t } = useTranslation()
  const { translateModel } = useDefaultModel() // 使用翻译模型作为润色模型
  const [isPolishing, setIsPolishing] = useState(false)

  const polishConfirm = () => {
    return window?.modal?.confirm({
      title: t('polish.confirm.title'),
      content: t('polish.confirm.content'),
      centered: true
    })
  }

  const handlePolish = async () => {
    if (!text?.trim()) return

    if (!(await polishConfirm())) {
      return
    }

    if (!translateModel) {
      window.message.error({
        content: t('polish.error.not_configured'),
        key: 'polish-message'
      })
      return
    }

    // 先复制原文到剪贴板
    await navigator.clipboard.writeText(text)

    setIsPolishing(true)
    try {
      const assistant = getDefaultPolishTextAssistant(text)
      const message = getUserMessage({
        assistant,
        topic: getDefaultTopic('default'),
        type: 'text',
        content: ''
      })

      const polishedText = await fetchPolishText({ message, assistant })
      onPolished(polishedText)

      window.message.success({
        content: t('polish.success'),
        key: 'polish-message'
      })
    } catch (error) {
      console.error('Polishing failed:', error)
      window.message.error({
        content: t('polish.error.failed'),
        key: 'polish-message'
      })
    } finally {
      setIsPolishing(false)
    }
  }

  useEffect(() => {
    setIsPolishing(isLoading ?? false)
  }, [isLoading])

  return (
    <Tooltip placement="top" title={t('polish.title')} arrow>
      <ToolbarButton
        type="text"
        onClick={handlePolish}
        disabled={disabled || !text?.trim() || isPolishing}
        style={style}
      >
        <Sparkles size={18} />
      </ToolbarButton>
    </Tooltip>
  )
}

const ToolbarButton = styled(Button)`
  min-width: 30px;
  height: 30px;
  font-size: 16px;
  border-radius: 50%;
  transition: all 0.3s ease;
  color: var(--color-icon);
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  padding: 0;
  &.anticon,
  &.iconfont {
    transition: all 0.3s ease;
    color: var(--color-icon);
  }
  &:hover {
    background-color: var(--color-background-soft);
    .anticon,
    .iconfont {
      color: var(--color-text-1);
    }
  }
  &.active {
    background-color: var(--color-primary) !important;
    .anticon,
    .iconfont {
      color: var(--color-white-soft);
    }
    &:hover {
      background-color: var(--color-primary);
    }
  }
`

export default PolishTextButton
