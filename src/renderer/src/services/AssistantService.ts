import { DEFAULT_CONTEXTCOUNT, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '@renderer/config/constant'
import db from '@renderer/databases'
import i18n from '@renderer/i18n'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import store from '@renderer/store'
import { addAssistant } from '@renderer/store/assistants'
import { Agent, Assistant, AssistantSettings, Message, Model, Provider, Topic } from '@renderer/types'
import { uuid } from '@renderer/utils'

import { estimateMessageUsage } from './TokenService'

export function getDefaultAssistant(): Assistant {
  return {
    id: 'default',
    name: i18n.t('chat.default.name'),
    emoji: '😀',
    prompt: '',
    topics: [getDefaultTopic('default')],
    messages: [],
    type: 'assistant'
  }
}

export function getDefaultTranslateAssistant(targetLanguage: string, text: string): Assistant {
  const translateModel = getTranslateModel()
  const assistant: Assistant = getDefaultAssistant()
  assistant.model = translateModel

  assistant.settings = {
    temperature: 0.7
  }

  assistant.prompt = store
    .getState()
    .settings.translateModelPrompt.replaceAll('{{target_language}}', targetLanguage)
    .replaceAll('{{text}}', text)
  return assistant
}

export function getDefaultAssistantSettings() {
  return store.getState().assistants.defaultAssistant.settings
}

export function getDefaultTopic(assistantId: string): Topic {
  return {
    id: uuid(),
    assistantId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name: i18n.t('chat.default.topic.name'),
    messages: [],
    isNameManuallyEdited: false
  }
}

export function getDefaultProvider() {
  return getProviderByModel(getDefaultModel())
}

export function getDefaultModel() {
  return store.getState().llm.defaultModel
}

export function getTopNamingModel() {
  return store.getState().llm.topicNamingModel
}

export function getTranslateModel() {
  return store.getState().llm.translateModel
}

export function getAssistantProvider(assistant: Assistant): Provider {
  const providers = store.getState().llm.providers

  // 检查是否是DeepClaude模型
  if (assistant.model?.provider === 'deepclaude') {
    console.log('[getAssistantProvider] 检测到DeepClaude模型:', assistant.model.id, assistant.model.name)

    // 列出所有提供商，便于调试
    console.log(
      '[getAssistantProvider] 当前所有提供商:',
      providers.map((p) => ({ id: p.id, name: p.name, type: p.type }))
    )

    // 查找所有DeepClaude类型的提供商
    const deepClaudeProviders = providers.filter((p) => p.type === 'deepclaude')
    console.log('[getAssistantProvider] 找到DeepClaude类型的提供商数量:', deepClaudeProviders.length)

    if (deepClaudeProviders.length > 0) {
      // 先尝试查找与model.id匹配的提供商
      const matchingProvider = deepClaudeProviders.find((p) => p.id === assistant.model?.id)
      if (matchingProvider) {
        console.log('[getAssistantProvider] 找到匹配的DeepClaude提供商:', matchingProvider.id, matchingProvider.name)
        return matchingProvider
      }

      // 如果没有找到匹配的，使用第一个DeepClaude提供商
      console.log(
        '[getAssistantProvider] 使用第一个DeepClaude提供商:',
        deepClaudeProviders[0].id,
        deepClaudeProviders[0].name
      )
      return deepClaudeProviders[0]
    }

    console.log('[getAssistantProvider] 未找到DeepClaude提供商，将使用默认提供商')
  }

  // 常规模型处理
  const provider = providers.find((p) => p.id === assistant.model?.provider)
  if (provider) {
    return provider
  }

  // 如果没有找到提供商，使用默认提供商
  console.log('[getAssistantProvider] 未找到提供商，使用默认提供商')
  return getDefaultProvider()
}

export function getProviderByModel(model?: Model): Provider {
  const providers = store.getState().llm.providers
  const providerId = model ? model.provider : getDefaultProvider().id
  return providers.find((p) => p.id === providerId) as Provider
}

export function getProviderByModelId(modelId?: string) {
  const providers = store.getState().llm.providers
  const _modelId = modelId || getDefaultModel().id
  return providers.find((p) => p.models.find((m) => m.id === _modelId)) as Provider
}

export const getAssistantSettings = (assistant: Assistant): AssistantSettings => {
  const contextCount = assistant?.settings?.contextCount ?? DEFAULT_CONTEXTCOUNT
  const getAssistantMaxTokens = () => {
    if (assistant.settings?.enableMaxTokens) {
      const maxTokens = assistant.settings.maxTokens
      if (typeof maxTokens === 'number') {
        return maxTokens > 0 ? maxTokens : DEFAULT_MAX_TOKENS
      }
      return DEFAULT_MAX_TOKENS
    }
    return undefined
  }

  return {
    contextCount: contextCount === 20 ? 100000 : contextCount,
    temperature: assistant?.settings?.temperature ?? DEFAULT_TEMPERATURE,
    topP: assistant?.settings?.topP ?? 1,
    enableMaxTokens: assistant?.settings?.enableMaxTokens ?? false,
    maxTokens: getAssistantMaxTokens(),
    streamOutput: assistant?.settings?.streamOutput ?? true,
    hideMessages: assistant?.settings?.hideMessages ?? false,
    defaultModel: assistant?.defaultModel ?? undefined,
    customParameters: assistant?.settings?.customParameters ?? []
  }
}

export function getAssistantById(id: string) {
  const assistants = store.getState().assistants.assistants
  return assistants.find((a) => a.id === id)
}

export async function addAssistantMessagesToTopic(
  topicId: string,
  newMessages: Message[]
): Promise<Message[]>;
export async function addAssistantMessagesToTopic({
  assistant,
  topic
}: {
  assistant: Assistant;
  topic: Topic;
}): Promise<Message[]>;
export async function addAssistantMessagesToTopic(
  topicIdOrParams: string | { assistant: Assistant; topic: Topic },
  newMessages?: Message[]
): Promise<Message[]> {
  // 处理重载情况
  if (typeof topicIdOrParams === 'string') {
    // 直接添加消息到主题
    const topicId = topicIdOrParams;

    // 获取主题
    const topic = await db.topics.get(topicId);
    if (!topic) {
      console.error(`[addAssistantMessagesToTopic] Topic not found: ${topicId}`);
      return [];
    }

    // 获取现有消息
    const existingMessages = topic.messages || [];

    // 合并消息
    const messages = [...existingMessages, ...(newMessages || [])];

    // 更新主题
    await db.topics.update(topicId, { messages });

    // 触发事件通知UI更新
    try {
      // 使用Redux store直接更新
      store.dispatch({
        type: 'messages/loadTopicMessages',
        payload: { topicId, messages }
      })

      // 同时使用window.api方式更新（兼容性考虑）
      if (window.api?.store?.dispatch) {
        window.api.store.dispatch(
          window.api.store.updateTopicMessagesThunk(topicId, messages)
        )
      }

      // 触发消息更新事件，确保UI刷新
      EventEmitter.emit(EVENT_NAMES.RECEIVE_MESSAGE, messages[messages.length - 1])

      console.log('[addAssistantMessagesToTopic] Successfully updated messages and triggered UI refresh')
    } catch (error) {
      console.error('[addAssistantMessagesToTopic] Failed to update UI:', error)
    };

    return messages;
  } else {
    // 原始功能：从助手添加预设消息到主题
    const { assistant, topic } = topicIdOrParams;
    const messages: Message[] = [];
    const defaultModel = getDefaultModel();

    for (const msg of assistant?.messages || []) {
      const message: Message = {
        id: uuid(),
        assistantId: assistant.id,
        role: msg.role,
        content: msg.content,
        topicId: topic.id,
        createdAt: new Date().toISOString(),
        status: 'success',
        model: assistant.defaultModel || defaultModel,
        type: 'text',
        isPreset: true
      };
      message.usage = await estimateMessageUsage(message);
      messages.push(message);
    }

    if (await db.topics.get(topic.id)) {
      await db.topics.update(topic.id, { messages });
    } else {
      await db.topics.add({ id: topic.id, messages });
    }

    return messages;
  }
}

export async function createAssistantFromAgent(agent: Agent) {
  const assistantId = uuid()
  const topic = getDefaultTopic(assistantId)

  const assistant: Assistant = {
    ...agent,
    id: assistantId,
    name: agent.name,
    emoji: agent.emoji,
    topics: [topic],
    model: agent.defaultModel,
    type: 'assistant'
  }

  store.dispatch(addAssistant(assistant))

  await addAssistantMessagesToTopic({ assistant, topic })

  window.message.success({
    content: i18n.t('message.assistant.added.content'),
    key: 'assistant-added'
  })

  return assistant
}
