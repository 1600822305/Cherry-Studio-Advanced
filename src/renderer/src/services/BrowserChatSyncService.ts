// 浏览器聊天同步服务
import db from '@renderer/databases'
import { ChatMessage } from '@renderer/pages/Browser/utils/chatUtils'
import store from '@renderer/store'
import { addAssistant } from '@renderer/store/assistants'
import { loadTopicMessages } from '@renderer/store/messages'
import { Assistant, Message, Topic } from '@renderer/types'
import { throttle } from 'lodash'
import { v4 as uuid } from 'uuid'

import { getDefaultModel } from './AssistantService'

// 浏览器聊天助手ID的前缀，用于标识
const BROWSER_CHAT_ASSISTANT_PREFIX = 'browser_chat_assistant_'

// 最后同步时间的本地存储键
const LAST_SYNC_TIME_KEY = 'browser_chat_last_sync_time'

// 获取浏览器聊天助手ID
export function getBrowserChatAssistantId(): string {
  return `${BROWSER_CHAT_ASSISTANT_PREFIX}${uuid()}`
}

// 检查助手是否是浏览器聊天助手
export function isBrowserChatAssistant(assistantId: string): boolean {
  return assistantId.startsWith(BROWSER_CHAT_ASSISTANT_PREFIX)
}

// 获取最后同步时间
function getLastSyncTime(): string {
  return localStorage.getItem(LAST_SYNC_TIME_KEY) || '1970-01-01T00:00:00.000Z'
}

// 设置最后同步时间
function setLastSyncTime(time: string): void {
  localStorage.setItem(LAST_SYNC_TIME_KEY, time)
}

// 将浏览器聊天消息转换为主界面消息格式
function convertBrowserChatMessage(message: ChatMessage, assistantId: string, topicId: string): Message {
  return {
    id: uuid(), // 生成新的ID
    assistantId,
    role: message.role,
    content: message.content,
    topicId,
    createdAt: message.timestamp,
    status: 'success',
    type: 'text'
  }
}

// 初始化浏览器聊天助手
export async function initBrowserChatAssistant(): Promise<Assistant | null> {
  try {
    // 获取所有助手
    const assistants = store.getState().assistants.assistants

    // 检查是否已存在浏览器聊天助手
    const existingAssistant = assistants.find(
      (assistant) => assistant.name === '浏览器聊天助手' || isBrowserChatAssistant(assistant.id)
    )

    if (existingAssistant) {
      return existingAssistant
    }

    // 创建新的浏览器聊天助手
    const assistantId = getBrowserChatAssistantId()
    const topicId = uuid()

    // 创建默认话题
    const topic: Topic = {
      id: topicId,
      assistantId: assistantId,
      name: '浏览器聊天记录',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      isNameManuallyEdited: true // 防止自动重命名
    }

    // 创建浏览器聊天助手
    const assistant: Assistant = {
      id: assistantId,
      name: '浏览器聊天助手',
      emoji: '🌐', // 使用地球仪表情作为浏览器图标
      prompt: '你是一个内嵌在浏览器中的聊天助手，可以帮助用户浏览网页、搜索信息和回答问题。',
      topics: [topic],
      model: getDefaultModel(),
      type: 'assistant'
    }

    // 添加到数据库
    await db.topics.add({ id: topic.id, messages: [] })

    // 添加到Redux
    store.dispatch(addAssistant(assistant))

    console.log('浏览器聊天助手创建成功:', assistant.id)
    return assistant
  } catch (error) {
    console.error('初始化浏览器聊天助手失败:', error)
    return null
  }
}

// 同步浏览器聊天消息到主界面
export async function syncBrowserChatMessages(): Promise<void> {
  try {
    // 获取浏览器聊天消息
    const browserChatMessages = getBrowserChatMessages()
    if (!browserChatMessages || browserChatMessages.length === 0) {
      return
    }

    // 获取最后同步时间
    const lastSyncTime = getLastSyncTime()

    // 过滤出新消息
    const newMessages = browserChatMessages.filter((message) => new Date(message.timestamp) > new Date(lastSyncTime))

    if (newMessages.length === 0) {
      return
    }

    // 初始化浏览器聊天助手
    const assistant = await initBrowserChatAssistant()
    if (!assistant || assistant.topics.length === 0) {
      return
    }

    // 获取默认话题
    const topic = assistant.topics[0]

    // 获取话题当前消息
    const existingMessages = await db.topics.get(topic.id).then((t) => t?.messages || [])

    // 转换并添加新消息
    const convertedMessages = newMessages.map((message) => convertBrowserChatMessage(message, assistant.id, topic.id))

    // 合并消息
    const updatedMessages = [...existingMessages, ...convertedMessages]

    // 更新数据库
    await db.topics.update(topic.id, { messages: updatedMessages })

    // 更新Redux
    store.dispatch(loadTopicMessages({ topicId: topic.id, messages: updatedMessages }))

    // 更新最后同步时间
    const latestMessage = newMessages.reduce(
      (latest, message) => (new Date(message.timestamp) > new Date(latest.timestamp) ? message : latest),
      newMessages[0]
    )
    setLastSyncTime(latestMessage.timestamp)

    console.log(`已同步 ${newMessages.length} 条浏览器聊天消息到主界面`)
  } catch (error) {
    console.error('同步浏览器聊天消息失败:', error)
  }
}

// 获取浏览器聊天消息
function getBrowserChatMessages(): ChatMessage[] {
  try {
    const messagesJson = localStorage.getItem('browser_chat_messages')
    if (messagesJson) {
      return JSON.parse(messagesJson)
    }
  } catch (error) {
    console.error('获取浏览器聊天消息失败:', error)
  }
  return []
}

// 节流版本的同步函数，避免频繁同步
export const throttledSyncBrowserChatMessages = throttle(syncBrowserChatMessages, 5000)
