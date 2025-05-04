// 聊天工具函数
import { fetchGenerate } from '@renderer/services/ApiService'
import { getDefaultModel } from '@renderer/services/AssistantService'
import { Model } from '@renderer/types'
import { v4 as uuid } from 'uuid'

// 生成唯一ID
export function generateUniqueId(): string {
  return uuid()
}

// 消息类型定义
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  hidden?: boolean // 是否在UI中隐藏该消息
}

// 本地存储键
const CHAT_MESSAGES_KEY = 'browser_chat_messages'

// 获取聊天消息历史
export function getChatMessages(): ChatMessage[] {
  try {
    const messagesJson = localStorage.getItem(CHAT_MESSAGES_KEY)
    if (messagesJson) {
      return JSON.parse(messagesJson)
    }
  } catch (error) {
    console.error('Failed to load chat messages:', error)
  }
  return []
}

// 保存聊天消息历史
export function saveChatMessages(messages: ChatMessage[]): void {
  try {
    // 只保留最近的50条消息
    const recentMessages = messages.slice(-50)
    localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(recentMessages))
  } catch (error) {
    console.error('Failed to save chat messages:', error)
  }
}

// 添加新消息
export function addChatMessage(message: ChatMessage, existingMessages?: ChatMessage[]): ChatMessage[] {
  const messages = existingMessages || getChatMessages()
  const updatedMessages = [...messages, message]
  saveChatMessages(updatedMessages)
  return updatedMessages
}

// 清除聊天历史
export function clearChatMessages(): void {
  localStorage.removeItem(CHAT_MESSAGES_KEY)
}

// 获取最近的聊天历史作为上下文
function getRecentChatContext(messages: ChatMessage[], maxMessages: number = 10): string {
  // 获取最近的消息作为上下文
  const recentMessages = messages.slice(-maxMessages)

  // 格式化消息为文本
  return recentMessages
    .map((msg) => {
      const role = msg.role === 'user' ? '用户' : '助手'
      return `${role}: ${msg.content}`
    })
    .join('\n\n')
}

// 生成AI回复 - 连接到真实的AI模型
export async function generateAIResponse(
  userMessage: string,
  chatHistory: ChatMessage[] = [],
  model?: Model
): Promise<string> {
  try {
    // 获取模型 - 使用指定的模型或默认模型
    const selectedModel = model || getDefaultModel()

    // 构建提示词
    const context = getRecentChatContext(chatHistory)
    const prompt = `你是一个内嵌在浏览器中的聊天助手，用户正在浏览网页时与你交流。
请提供简洁、有帮助的回复。回复应该友好、专业，并且直接回答用户的问题。
不要在回复中使用"作为AI助手"、"作为语言模型"等表述。

${context ? `以下是之前的对话历史：\n${context}\n\n` : ''}

请回复用户的最新消息: "${userMessage}"`

    // 创建包含模型ID和提供商ID的JSON字符串
    const modelIdWithProvider = JSON.stringify({
      id: selectedModel.id,
      provider: selectedModel.provider
    })

    // 调用AI模型获取回复
    const response = await fetchGenerate({
      prompt: prompt,
      content: userMessage,
      modelId: modelIdWithProvider
    })

    return response || '抱歉，我无法生成回复。请稍后再试。'
  } catch (error) {
    console.error('Error generating AI response:', error)
    return '抱歉，生成回复时出现错误。请稍后再试。'
  }
}
