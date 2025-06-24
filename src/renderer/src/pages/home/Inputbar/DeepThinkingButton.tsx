import { getDefaultDeepThinkingAssistant } from '@renderer/config/prompts'
import { useDefaultModel } from '@renderer/hooks/useAssistant'
import { getDefaultTopic } from '@renderer/services/AssistantService'
import { getUserMessage } from '@renderer/services/MessagesService'
import { Button, Tooltip } from 'antd'
import { Brain } from 'lucide-react'
import { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled, { keyframes } from 'styled-components'
import { FileType, Topic, Message } from '@renderer/types'
import db from '@renderer/databases'

interface Props {
  text: string
  files?: FileType[] // 添加files参数支持文件附件
  topic?: Topic // 添加topic参数以访问对话上下文
  onDeepThinking: (text: string) => void
  disabled?: boolean
  style?: React.CSSProperties
  isLoading?: boolean
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
async function buildContextMessages(topicId?: string, currentText?: string): Promise<string> {
  if (!topicId) {
    return currentText || '';
  }

  // 获取主题的所有消息
  const messages = await getTopicMessages(topicId);

  // 如果没有消息，直接返回当前输入文本
  if (!messages || messages.length === 0) {
    return currentText || '';
  }

  // 按时间排序消息
  const sortedMessages = [...messages].sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // 只包含常规消息（排除思考消息）
  const contextMessages = sortedMessages
    .filter(m => !m.thinking && m.type === 'text' && m.status === 'success');

  // 构建上下文字符串
  let contextString = '';
  for (const m of contextMessages) {
    const role = m.role === 'user' ? '用户' : '助手';
    contextString += `${role}: ${m.content}\n\n`;
  }

  // 添加当前输入文本
  if (currentText && currentText.trim()) {
    contextString += `用户当前输入: ${currentText}\n\n`;
  }

  console.log('[DeepThinking] 构建了上下文消息，包含消息数:', contextMessages.length);

  return contextString;
}

// 创建一个函数来获取深度思考助手
export const getDefaultDeepThinkingTextAssistant = (text: string) => {
  return getDefaultDeepThinkingAssistant(text)
}

// 创建一个函数来处理深度思考请求
export const fetchDeepThinking = async ({
  message,
  assistant,
  onResponse
}: {
  message: any
  assistant: any
  onResponse?: (text: string) => void
}) => {
  try {
    // 检查message中是否有文件附件，特别是图片
    const hasImages = message.files && message.files.some((file: any) => file.type === 'image');

    // 详细记录消息和附件信息
    console.log('[DeepThinking] 消息内容:', message.content);
    console.log('[DeepThinking] 附件数量:', message.files?.length || 0);
    if (message.files && message.files.length > 0) {
      message.files.forEach((file: any, index: number) => {
        console.log(`[DeepThinking] 附件[${index}]: 类型=${file.type}, 路径=${file.path}`);
      });
    }

    if (hasImages) {
      console.log('[DeepThinking] 检测到图片附件，使用completions API');

      // 创建一个新的消息对象供AI处理
      const newMessage = { ...message };

      // 创建结果文本收集器
      let resultText = '';

      // 封装onChunk回调函数处理completions的流式响应
      const handleChunk = (chunk: any) => {
        if (chunk.text) {
          // 累积文本结果
          resultText += chunk.text;

          // 如果提供了onResponse回调，则调用它
          if (onResponse) {
            onResponse(resultText);
          }
        }
      };

      // 导入AiProvider为多模态请求
      const { getProviderByModel } = await import('@renderer/services/AssistantService');
      const AiProvider = (await import('@renderer/providers/AiProvider')).default;

      // 获取模型对应的提供商
      const provider = getProviderByModel(assistant.model);
      console.log('[DeepThinking] 使用提供商:', provider.id, provider.name);
      console.log('[DeepThinking] 使用模型:', assistant.model?.id, assistant.model?.name);

      const AI = new AiProvider(provider);

      console.log('[DeepThinking] 发起多模态请求');
      // 调用AI的completions方法处理多模态输入
      await AI.completions({
        messages: [newMessage],
        assistant,
        onChunk: handleChunk,
        onFilterMessages: () => { }
      });

      console.log('[DeepThinking] 多模态请求完成，结果长度:', resultText.length);
      return resultText;
    } else {
      // 对于纯文本，继续使用原有的翻译功能
      console.log('[DeepThinking] 无图片附件，使用标准文本API');
      const { fetchTranslate } = await import('@renderer/services/ApiService');
      const result = await fetchTranslate({ message, assistant, onResponse });
      console.log('[DeepThinking] 文本API请求完成，结果长度:', result.length);
      return result;
    }
  } catch (error) {
    console.error('[DeepThinking] API调用失败:', error);
    throw error;
  }
}

// 定义思考动画
const thinkingAnimation = keyframes`
  0% {
    transform: scale(1);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.15);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 0.8;
  }
`

// 定义按钮悬浮动画
const hoverAnimation = keyframes`
  0% {
    box-shadow: 0 0 0 rgba(146, 84, 222, 0);
  }
  100% {
    box-shadow: 0 0 8px rgba(146, 84, 222, 0.5);
  }
`

const DeepThinkingButton: FC<Props> = ({ text, files = [], topic, onDeepThinking, disabled, style, isLoading }) => {
  const { t } = useTranslation()
  const { translateModel } = useDefaultModel() // 使用翻译模型作为深度思考模型
  const [isThinking, setIsThinking] = useState(false)

  const hasContent = text?.trim().length > 0 || (files && files.length > 0)
  const hasImages = files && files.some(file => file.type === 'image')

  const thinkingConfirm = () => {
    // 根据是否有图片附件显示不同的确认信息
    const confirmTitle = hasImages
      ? t('deep_thinking.confirm.title_with_image') || '深度思考(包含图片)'
      : t('deep_thinking.confirm.title')

    const confirmContent = hasImages
      ? t('deep_thinking.confirm.content_with_image') || '模型将分析您提供的文本和图片，进行深度思考并给出详细分析。继续？'
      : t('deep_thinking.confirm.content')

    return window?.modal?.confirm({
      title: confirmTitle,
      content: confirmContent,
      centered: true
    })
  }

  const handleDeepThinking = async () => {
    if (!hasContent) return

    if (!(await thinkingConfirm())) {
      return
    }

    if (!translateModel) {
      window.message.error({
        content: t('deep_thinking.error.not_configured'),
        key: 'deep-thinking-message'
      })
      return
    }

    // 先复制原文到剪贴板
    if (text?.trim()) {
      await navigator.clipboard.writeText(text)
    }

    setIsThinking(true)
    try {
      // 获取对话上下文
      const contextContent = await buildContextMessages(topic?.id, text);
      console.log('[DeepThinking] 构建上下文完成，长度:', contextContent.length);

      // 创建深度思考助手
      const assistant = getDefaultDeepThinkingTextAssistant(contextContent)

      // 创建用户消息
      const message = getUserMessage({
        assistant,
        topic: getDefaultTopic('default'),
        type: 'text',
        content: contextContent || text // 使用构建的上下文或原始文本
      })

      // 添加文件附件
      if (files && files.length > 0) {
        message.files = files
      }

      // 添加调试日志
      console.log('[DeepThinking] Sending request with assistant:', assistant)
      console.log('[DeepThinking] Sending request with message:', message)
      console.log('[DeepThinking] Files included:', files)

      // 发送请求
      const thinkingResult = await fetchDeepThinking({ message, assistant })
      console.log('[DeepThinking] Received thinking result:', thinkingResult)

      // 调用回调函数
      onDeepThinking(thinkingResult)

      window.message.success({
        content: t('deep_thinking.success'),
        key: 'deep-thinking-message'
      })
    } catch (error) {
      console.error('Deep thinking failed:', error)
      window.message.error({
        content: t('deep_thinking.error.failed'),
        key: 'deep-thinking-message'
      })
    } finally {
      setIsThinking(false)
    }
  }

  useEffect(() => {
    setIsThinking(isLoading ?? false)
  }, [isLoading])

  return (
    <Tooltip
      placement="top"
      title={hasImages
        ? t('deep_thinking.title_with_image') || '深度思考(带图片分析)'
        : t('deep_thinking.title')}
      arrow
      styles={{ root: { fontSize: '12px' } }}
    >
      <ThinkingButton
        type="text"
        onClick={handleDeepThinking}
        disabled={disabled || !hasContent || isThinking}
        style={style}
        $isThinking={isThinking}
        $hasImages={hasImages}
      >
        <BrainIcon size={18} $isThinking={isThinking} $hasImages={hasImages} />
      </ThinkingButton>
    </Tooltip>
  )
}

const ThinkingButton = styled(Button) <{ $isThinking: boolean; $hasImages?: boolean }>`
  min-width: 34px;
  height: 34px;
  font-size: 16px;
  border-radius: 50%;
  transition: all 0.3s ease;
  color: var(--color-icon);
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  padding: 0;
  margin: 0 2px;
  position: relative;
  overflow: hidden;
  background-color: ${props => props.$isThinking
    ? 'var(--color-primary-light)'
    : props.$hasImages
      ? 'rgba(146, 84, 222, 0.1)'
      : 'transparent'};
  
  &:hover {
    background-color: ${props => props.$isThinking
    ? 'var(--color-primary-light)'
    : props.$hasImages
      ? 'rgba(146, 84, 222, 0.2)'
      : 'var(--color-background-soft)'};
    animation: ${hoverAnimation} 0.5s ease-in-out forwards;
    transform: translateY(-1px);
  }
  
  &:active {
    transform: translateY(1px);
  }
  
  &.active {
    background-color: var(--color-primary) !important;
    color: var(--color-white-soft);
    
    &:hover {
      background-color: var(--color-primary);
    }
  }
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--color-primary);
    opacity: 0;
    border-radius: 50%;
    transition: opacity 0.3s ease;
    z-index: -1;
  }
  
  &:hover::before {
    opacity: 0.1;
  }
  
  &:disabled {
    opacity: 0.5;
    transform: none;
    animation: none;
  }
`

const BrainIcon = styled(Brain) <{ $isThinking: boolean; $hasImages?: boolean }>`
  color: ${props => {
    if (props.$isThinking) return 'var(--color-primary)';
    if (props.$hasImages) return 'var(--color-primary)';
    return 'var(--color-icon)';
  }};
  animation: ${props => props.$isThinking ? thinkingAnimation : 'none'} 1.5s infinite ease-in-out;
  transition: color 0.3s ease;
  
  ${ThinkingButton}:hover & {
    color: ${props => {
    if (props.$isThinking) return 'var(--color-primary)';
    if (props.$hasImages) return 'var(--color-primary)';
    return 'var(--color-text-1)';
  }};
  }
`

export default DeepThinkingButton
