import { FOOTNOTE_PROMPT, REFERENCE_PROMPT } from '@renderer/config/prompts'
import { getLMStudioKeepAliveTime } from '@renderer/hooks/useLMStudio'
import { getOllamaKeepAliveTime } from '@renderer/hooks/useOllama'
import { getKnowledgeBaseReferences } from '@renderer/services/KnowledgeService'
import type {
  Assistant,
  GenerateImageParams,
  KnowledgeReference,
  Message,
  Model,
  Provider,
  Suggestion,
  WebSearchResponse
} from '@renderer/types'
import { delay, isJSON, parseJSON } from '@renderer/utils'
import { addAbortController, removeAbortController } from '@renderer/utils/abortController'
import { formatApiHost } from '@renderer/utils/api'
import { t } from 'i18next'
import { isEmpty } from 'lodash'
import type OpenAI from 'openai'

import type { CompletionsParams } from '.'

export default abstract class BaseProvider {
  protected provider: Provider
  protected host: string
  protected apiKey: string

  constructor(provider: Provider) {
    this.provider = provider
    this.host = this.getBaseURL()
    this.apiKey = this.getApiKey()
  }

  abstract completions({ messages, assistant, onChunk, onFilterMessages }: CompletionsParams): Promise<void>
  abstract translate(message: Message, assistant: Assistant, onResponse?: (text: string) => void): Promise<string>
  abstract summaries(messages: Message[], assistant: Assistant): Promise<string>
  abstract summaryForSearch(messages: Message[], assistant: Assistant): Promise<string | null>
  abstract suggestions(messages: Message[], assistant: Assistant): Promise<Suggestion[]>
  abstract generateText({
    prompt,
    content,
    modelId
  }: {
    prompt: string
    content: string
    modelId?: string
  }): Promise<string>
  abstract check(model: Model): Promise<{ valid: boolean; error: Error | null }>
  abstract models(): Promise<OpenAI.Models.Model[]>
  abstract generateImage(params: GenerateImageParams): Promise<string[]>
  abstract generateImageByChat({ messages, assistant, onChunk, onFilterMessages }: CompletionsParams): Promise<void>
  abstract getEmbeddingDimensions(model: Model): Promise<number>

  public getBaseURL(): string {
    const host = this.provider.apiHost
    return formatApiHost(host)
  }

  public getApiKey() {
    const keys = this.provider.apiKey.split(',').map((key) => key.trim())
    const keyName = `provider:${this.provider.id}:last_used_key`

    if (keys.length === 1) {
      return keys[0]
    }

    const lastUsedKey = window.keyv.get(keyName)
    if (!lastUsedKey) {
      window.keyv.set(keyName, keys[0])
      return keys[0]
    }

    const currentIndex = keys.indexOf(lastUsedKey)
    const nextIndex = (currentIndex + 1) % keys.length
    const nextKey = keys[nextIndex]
    window.keyv.set(keyName, nextKey)

    return nextKey
  }

  public defaultHeaders() {
    return {
      'HTTP-Referer': 'https://cherry-ai.com',
      'X-Title': 'Cherry Studio',
      'X-Api-Key': this.apiKey
    }
  }

  public get keepAliveTime() {
    return this.provider.id === 'ollama'
      ? getOllamaKeepAliveTime()
      : this.provider.id === 'lmstudio'
        ? getLMStudioKeepAliveTime()
        : undefined
  }

  public async fakeCompletions({ onChunk }: CompletionsParams) {
    for (let i = 0; i < 100; i++) {
      await delay(0.01)
      onChunk({ text: i + '\n', usage: { completion_tokens: 0, prompt_tokens: 0, total_tokens: 0 } })
    }
  }

  public async getMessageContent(message: Message) {
    if (isEmpty(message.content) && !message.referencedMessages?.length) {
      return message.content
    }

    // 处理引用消息
    if (message.referencedMessages && message.referencedMessages.length > 0) {
      const refMsg = message.referencedMessages[0]
      const roleText = refMsg.role === 'user' ? '用户' : 'AI'
      const referencedContent = `===引用消息开始===\n角色: ${roleText}\n内容: ${refMsg.content}\n===引用消息结束===`
      // 如果消息内容为空，则直接返回引用内容
      if (isEmpty(message.content.trim())) {
        return referencedContent
      }
      return `${message.content}\n\n${referencedContent}`
    }

    const webSearchReferences = await this.getWebSearchReferences(message)

    if (!isEmpty(webSearchReferences)) {
      const referenceContent = `\`\`\`json\n${JSON.stringify(webSearchReferences, null, 2)}\n\`\`\``
      return REFERENCE_PROMPT.replace('{question}', message.content).replace('{references}', referenceContent)
    }

    const knowledgeReferences = await getKnowledgeBaseReferences(message)

    if (!isEmpty(message.knowledgeBaseIds) && isEmpty(knowledgeReferences)) {
      window.message.info({ content: t('knowledge.no_match'), key: 'knowledge-base-no-match-info' })
    }

    if (!isEmpty(knowledgeReferences)) {
      const referenceContent = `\`\`\`json\n${JSON.stringify(knowledgeReferences, null, 2)}\n\`\`\``
      return FOOTNOTE_PROMPT.replace('{question}', message.content).replace('{references}', referenceContent)
    }

    return message.content
  }

  private async getWebSearchReferences(message: Message) {
    if (isEmpty(message.content)) {
      return []
    }
    const webSearch: WebSearchResponse = window.keyv.get(`web-search-${message.id}`)

    if (webSearch) {
      return webSearch.results.map(
        (result, index) =>
          ({
            id: index + 1,
            content: result.content,
            sourceUrl: result.url,
            type: 'url'
          }) as KnowledgeReference
      )
    }

    return []
  }

  protected getCustomParameters(assistant: Assistant) {
    return (
      assistant?.settings?.customParameters?.reduce((acc, param) => {
        if (!param.name?.trim()) {
          return acc
        }
        if (param.type === 'json') {
          const value = param.value as string
          if (value === 'undefined') {
            return { ...acc, [param.name]: undefined }
          }
          return { ...acc, [param.name]: isJSON(value) ? parseJSON(value) : value }
        }
        return {
          ...acc,
          [param.name]: param.value
        }
      }, {}) || {}
    )
  }

  protected createAbortController(messageId?: string, isAddEventListener?: boolean) {
    const abortController = new AbortController()
    const abortFn = () => abortController.abort()

    if (messageId) {
      addAbortController(messageId, abortFn)
    }

    const cleanup = () => {
      if (messageId) {
        try {
          // 无论是否中止，都尝试resolve promise
          signalPromise.resolve?.(undefined)
          removeAbortController(messageId, abortFn)
        } catch (error) {
          console.error('[BaseProvider] Error during cleanup:', error)
        }
      }
    }
    const signalPromise: {
      resolve: (value: unknown) => void
      promise: Promise<unknown>
    } = {
      resolve: () => {},
      promise: Promise.resolve()
    }

    if (isAddEventListener) {
      // 创建一个包含事件处理器的对象
      const handlers = {
        abortHandler: () => {
          console.log('[BaseProvider] Abort event detected, will be handled during cleanup')
        }
      }

      // 添加事件监听器
      abortController.signal.addEventListener('abort', handlers.abortHandler)

      // 创建一个包装的cleanup函数
      const wrappedCleanup = () => {
        try {
          // 移除事件监听器
          abortController.signal.removeEventListener('abort', handlers.abortHandler)
          // 调用原始的cleanup函数
          cleanup()
        } catch (error) {
          console.error('[BaseProvider] Error in wrapped cleanup:', error)
        }
      }

      signalPromise.promise = new Promise((resolve) => {
        signalPromise.resolve = resolve
      })

      return {
        abortController,
        cleanup: wrappedCleanup,
        signalPromise
      }
    }
    return {
      abortController,
      cleanup
    }
  }
}
