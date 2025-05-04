import { DEFAULT_MAX_TOKENS } from '@renderer/config/constant'
import {
  getOpenAIWebSearchParams,
  isGrokReasoningModel,
  isHunyuanSearchModel,
  isOpenAIoSeries,
  isOpenAIWebSearch,
  isReasoningModel,
  isSupportedModel,
  isVisionModel,
  isZhipuModel,
  OPENAI_NO_SUPPORT_DEV_ROLE_MODELS
} from '@renderer/config/models'
import { getStoreSetting } from '@renderer/hooks/useSettings'
import i18n from '@renderer/i18n'
import { getAssistantSettings, getDefaultModel, getTopNamingModel } from '@renderer/services/AssistantService'
import { EVENT_NAMES } from '@renderer/services/EventService'
import {
  filterContextMessages,
  filterEmptyMessages,
  filterUserRoleStartMessages
} from '@renderer/services/MessagesService'
import { processReqMessages } from '@renderer/services/ModelMessageService'
import store from '@renderer/store'
import { getActiveServers } from '@renderer/store/mcp'
import {
  Assistant,
  FileTypes,
  GenerateImageParams,
  MCPToolResponse,
  Message,
  Model,
  Provider,
  Suggestion
} from '@renderer/types'
import { removeSpecialCharactersForTopicName } from '@renderer/utils'
import { addImageFileToContents } from '@renderer/utils/formats'
import { mcpToolCallResponseToOpenAIMessage, parseAndCallTools } from '@renderer/utils/mcp-tools'
import { buildSystemPrompt } from '@renderer/utils/prompt'
import { isEmpty, takeRight } from 'lodash'
import OpenAI, { AzureOpenAI } from 'openai'
import {
  ChatCompletionContentPart,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam
} from 'openai/resources'

import { CompletionsParams } from '.'
import BaseProvider from './BaseProvider'

type ReasoningEffort = 'high' | 'medium' | 'low'

export default class OpenAIProvider extends BaseProvider {
  private sdk: OpenAI

  constructor(provider: Provider) {
    super(provider)

    if (provider.id === 'azure-openai' || provider.type === 'azure-openai') {
      this.sdk = new AzureOpenAI({
        dangerouslyAllowBrowser: true,
        apiKey: this.apiKey,
        apiVersion: provider.apiVersion,
        endpoint: provider.apiHost
      })
      return
    }

    this.sdk = new OpenAI({
      dangerouslyAllowBrowser: true,
      apiKey: this.apiKey,
      baseURL: this.getBaseURL(),
      defaultHeaders: {
        ...this.defaultHeaders(),
        ...(this.provider.id === 'copilot' ? { 'editor-version': 'vscode/1.97.2' } : {}),
        ...(this.provider.id === 'copilot' ? { 'copilot-vision-request': 'true' } : {})
      }
    })
  }

  /**
   * Check if the provider does not support files
   * @returns True if the provider does not support files, false otherwise
   */
  private get isNotSupportFiles() {
    if (this.provider?.isNotSupportArrayContent) {
      return true
    }

    const providers = ['deepseek', 'baichuan', 'minimax', 'xirang']

    return providers.includes(this.provider.id)
  }

  /**
   * Extract the file content from the message
   * @param message - The message
   * @returns The file content
   */
  private async extractFileContent(message: Message) {
    if (message.files && message.files.length > 0) {
      const textFiles = message.files.filter((file) => [FileTypes.TEXT, FileTypes.DOCUMENT].includes(file.type))

      if (textFiles.length > 0) {
        let text = ''
        const divider = '\n\n---\n\n'

        for (const file of textFiles) {
          const fileContent = (await window.api.file.read(file.id + file.ext)).trim()
          const fileNameRow = 'file: ' + file.origin_name + '\n\n'
          text = text + fileNameRow + fileContent + divider
        }

        return text
      }
    }

    return ''
  }

  /**
   * Get the message parameter
   * @param message - The message
   * @param model - The model
   * @returns The message parameter
   */
  private async getMessageParam(
    message: Message,
    model: Model
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
    const isVision = isVisionModel(model)
    const content = await this.getMessageContent(message)

    // If the message does not have files, return the message
    if (isEmpty(message.files)) {
      return {
        role: message.role,
        content
      }
    }

    // If the model does not support files, extract the file content
    if (this.isNotSupportFiles) {
      const fileContent = await this.extractFileContent(message)

      return {
        role: message.role,
        content: content + '\n\n---\n\n' + fileContent
      }
    }

    // If the model supports files, add the file content to the message
    const parts: ChatCompletionContentPart[] = []

    if (content) {
      parts.push({ type: 'text', text: content })
    }

    for (const file of message.files || []) {
      if (file.type === FileTypes.IMAGE && isVision) {
        const image = await window.api.file.base64Image(file.id + file.ext)
        parts.push({
          type: 'image_url',
          image_url: { url: image.data }
        })
      }
      if ([FileTypes.TEXT, FileTypes.DOCUMENT].includes(file.type)) {
        const fileContent = await (await window.api.file.read(file.id + file.ext)).trim()
        parts.push({
          type: 'text',
          text: file.origin_name + '\n' + fileContent
        })
      }
    }

    return {
      role: message.role,
      content: parts
    } as ChatCompletionMessageParam
  }

  /**
   * Get the temperature for the assistant
   * @param assistant - The assistant
   * @param model - The model
   * @returns The temperature
   */
  private getTemperature(assistant: Assistant, model: Model) {
    return isReasoningModel(model) || isOpenAIWebSearch(model) ? undefined : assistant?.settings?.temperature
  }

  /**
   * Get the provider specific parameters for the assistant
   * @param assistant - The assistant
   * @param model - The model
   * @returns The provider specific parameters
   */
  private getProviderSpecificParameters(assistant: Assistant, model: Model) {
    const { maxTokens } = getAssistantSettings(assistant)

    if (this.provider.id === 'openrouter') {
      if (model.id.includes('deepseek-r1')) {
        return {
          include_reasoning: true
        }
      }
    }

    if (this.isOpenAIReasoning(model)) {
      return {
        max_tokens: undefined,
        max_completion_tokens: maxTokens
      }
    }

    return {}
  }

  /**
   * Get the top P for the assistant
   * @param assistant - The assistant
   * @param model - The model
   * @returns The top P
   */
  private getTopP(assistant: Assistant, model: Model) {
    if (isReasoningModel(model) || isOpenAIWebSearch(model)) return undefined

    return assistant?.settings?.topP
  }

  /**
   * Get the reasoning effort for the assistant
   * @param assistant - The assistant
   * @param model - The model
   * @returns The reasoning effort
   */
  private getReasoningEffort(assistant: Assistant, model: Model) {
    if (this.provider.id === 'groq') {
      return {}
    }

    if (isReasoningModel(model)) {
      if (model.provider === 'openrouter') {
        return {
          reasoning: {
            effort: assistant?.settings?.reasoning_effort
          }
        }
      }

      if (isGrokReasoningModel(model)) {
        return {
          reasoning_effort: assistant?.settings?.reasoning_effort
        }
      }

      if (isOpenAIoSeries(model)) {
        return {
          reasoning_effort: assistant?.settings?.reasoning_effort
        }
      }

      if (model.id.includes('claude-3.7-sonnet') || model.id.includes('claude-3-7-sonnet')) {
        const effortRatios: Record<ReasoningEffort, number> = {
          high: 0.8,
          medium: 0.5,
          low: 0.2
        }

        const effort = assistant?.settings?.reasoning_effort as ReasoningEffort
        const effortRatio = effortRatios[effort]

        if (!effortRatio) {
          return {}
        }

        const maxTokens = assistant?.settings?.maxTokens || DEFAULT_MAX_TOKENS
        const budgetTokens = Math.trunc(Math.max(Math.min(maxTokens * effortRatio, 32000), 1024))

        return {
          thinking: {
            type: 'enabled',
            budget_tokens: budgetTokens
          }
        }
      }

      return {}
    }

    return {}
  }

  /**
   * Check if the model is an OpenAI reasoning model
   * @param model - The model
   * @returns True if the model is an OpenAI reasoning model, false otherwise
   */
  private isOpenAIReasoning(model: Model) {
    return model.id.startsWith('o1') || model.id.startsWith('o3') || model.id.startsWith('o4')
  }

  /**
   * Generate completions for the assistant
   * @param messages - The messages
   * @param assistant - The assistant
   * @param mcpTools - The MCP tools
   * @param onChunk - The onChunk callback
   * @param onFilterMessages - The onFilterMessages callback
   * @returns The completions
   */
  async completions({ messages, assistant, mcpTools, onChunk, onFilterMessages }: CompletionsParams): Promise<void> {
    if (assistant.enableGenerateImage) {
      await this.generateImageByChat({ messages, assistant, onChunk } as CompletionsParams)
      return
    }
    const defaultModel = getDefaultModel()
    const model = assistant.model || defaultModel
    const { contextCount, maxTokens, streamOutput } = getAssistantSettings(assistant)
    messages = addImageFileToContents(messages)
    // 应用记忆功能到系统提示词
    const { applyMemoriesToPrompt } = await import('@renderer/services/MemoryService')
    // 获取当前话题ID
    const currentTopicId = messages.length > 0 ? messages[0].topicId : undefined
    const enhancedPrompt = await applyMemoriesToPrompt(assistant.prompt || '', currentTopicId)
    console.log(
      '[OpenAIProvider.completions] Applied memories to prompt, length difference:',
      enhancedPrompt.length - (assistant.prompt || '').length
    )

    let systemMessage = { role: 'system', content: enhancedPrompt }
    if (isOpenAIoSeries(model) && !OPENAI_NO_SUPPORT_DEV_ROLE_MODELS.includes(model.id)) {
      systemMessage = {
        role: 'developer',
        content: `Formatting re-enabled${systemMessage ? '\n' + systemMessage.content : ''}`
      }
    }
    if (mcpTools && mcpTools.length > 0) {
      // 获取是否使用提示词调用工具的设置
      const usePromptForToolCalling = store.getState().settings.useOpenAIPromptForToolCalling

      if (usePromptForToolCalling) {
        // 使用提示词调用工具
        systemMessage.content = await buildSystemPrompt(
          systemMessage.content || '',
          mcpTools,
          getActiveServers(store.getState())
        )
        console.log('[OpenAIProvider] 使用提示词调用MCP工具')
      } else {
        // 使用函数调用
        console.log('[OpenAIProvider] 使用函数调用MCP工具')
      }
    }

    const userMessages: ChatCompletionMessageParam[] = []
    const _messages = filterUserRoleStartMessages(
      filterEmptyMessages(filterContextMessages(takeRight(messages, contextCount + 1)))
    )

    onFilterMessages(_messages)

    for (const message of _messages) {
      userMessages.push(await this.getMessageParam(message, model))
    }

    const isOpenAIReasoning = this.isOpenAIReasoning(model)

    const isSupportStreamOutput = () => {
      if (isOpenAIReasoning) {
        return false
      }
      return streamOutput
    }

    let hasReasoningContent = false
    let lastChunk = ''
    const isReasoningJustDone = (
      delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & {
        reasoning_content?: string
        reasoning?: string
        thinking?: string
      }
    ) => {
      if (!delta?.content) return false

      // 检查当前chunk和上一个chunk的组合是否形成###Response标记
      const combinedChunks = lastChunk + delta.content
      lastChunk = delta.content

      // 检测思考结束 - 支持多种标签格式
      if (
        combinedChunks.includes('###Response') ||
        delta.content === '</think>' ||
        delta.content.includes('</think>') ||
        delta.content === '</thinking>' ||
        delta.content.includes('</thinking>')
      ) {
        return true
      }

      // 如果有reasoning_content或reasoning，说明是在思考中
      if (delta?.reasoning_content || delta?.reasoning || delta?.thinking) {
        hasReasoningContent = true
      }

      // 如果之前有reasoning_content或reasoning，现在有普通content，说明思考结束
      if (hasReasoningContent && delta.content) {
        return true
      }

      return false
    }

    let time_first_token_millsec = 0
    let time_first_content_millsec = 0
    const start_time_millsec = new Date().getTime()
    const lastUserMessage = _messages.findLast((m) => m.role === 'user')
    const { abortController, cleanup, signalPromise } = this.createAbortController(lastUserMessage?.id, true)
    const { signal } = abortController
    await this.checkIsCopilot()

    //当 systemMessage 内容为空时不发送 systemMessage
    let reqMessages: ChatCompletionMessageParam[]
    if (!systemMessage.content) {
      reqMessages = [...userMessages]
    } else {
      reqMessages = [systemMessage, ...userMessages].filter(Boolean) as ChatCompletionMessageParam[]
    }

    // 处理连续的相同角色消息，例如 deepseek-reasoner 模型不支持连续的用户或助手消息
    console.debug('[tool] reqMessages before processing', model.id, reqMessages)
    reqMessages = processReqMessages(model, reqMessages)
    console.debug('[tool] reqMessages', model.id, reqMessages)

    const toolResponses: MCPToolResponse[] = []
    let firstChunk = true

    const processToolUses = async (content: string, idx: number) => {
      try {
        // 执行工具调用并获取结果
        const toolResults = await parseAndCallTools(
          content,
          toolResponses,
          onChunk,
          idx,
          mcpToolCallResponseToOpenAIMessage,
          mcpTools,
          isVisionModel(model)
        )

        // 如果有工具调用结果，将其添加到上下文中，并进行第二次API调用
        if (toolResults.length > 0) {
          console.log('[OpenAIProvider] 工具调用已执行，将结果添加到上下文并生成第二条消息')

          // 添加原始助手消息到消息列表
          reqMessages.push({
            role: 'assistant',
            content: content
          } as ChatCompletionMessageParam)

          // 添加工具调用结果到消息列表
          toolResults.forEach((ts) => reqMessages.push(ts as ChatCompletionMessageParam))

          try {
            // 进行第二次API调用
            const requestParams: any = {
              model: model.id,
              messages: reqMessages,
              temperature: this.getTemperature(assistant, model),
              top_p: this.getTopP(assistant, model),
              max_tokens: maxTokens,
              stream: isSupportStreamOutput()
            }

            // 添加其他参数
            const webSearchParams = getOpenAIWebSearchParams(assistant, model)
            const reasoningEffort = this.getReasoningEffort(assistant, model)
            const specificParams = this.getProviderSpecificParameters(assistant, model)
            const customParams = this.getCustomParameters(assistant)

            // 合并所有参数
            const newStream = await this.sdk.chat.completions.create(
              {
                ...requestParams,
                ...webSearchParams,
                ...reasoningEffort,
                ...specificParams,
                ...customParams
              },
              {
                signal
              }
            )

            // 处理第二次响应
            await processStream(newStream, idx + 1)
          } catch (error: any) {
            // 处理API调用错误
            console.error('[OpenAIProvider] 第二次API调用失败:', error)

            // 尝试使用简化的消息列表再次请求
            try {
              // 创建简化的消息列表，只包含系统消息、最后一条用户消息和工具调用结果
              const lastUserMessage = reqMessages.find((m) => m.role === 'user')
              const simplifiedMessages: ChatCompletionMessageParam[] = [
                reqMessages[0], // 系统消息
                ...(lastUserMessage ? [lastUserMessage] : []), // 最后一条用户消息，如果存在
                ...toolResults.map((ts) => ts as ChatCompletionMessageParam) // 工具调用结果
              ]

              // 等待3秒再尝试
              await new Promise((resolve) => setTimeout(resolve, 3000))

              const fallbackResponse = await this.sdk.chat.completions.create(
                {
                  model: model.id,
                  messages: simplifiedMessages,
                  temperature: this.getTemperature(assistant, model),
                  top_p: this.getTopP(assistant, model),
                  max_tokens: maxTokens,
                  stream: isSupportStreamOutput()
                },
                {
                  signal
                }
              )

              // 处理备用方案响应
              if (isSupportStreamOutput()) {
                await processStream(fallbackResponse, idx + 1)
              } else {
                // 非流式响应的处理
                const time_completion_millsec = new Date().getTime() - start_time_millsec
                const response = fallbackResponse as OpenAI.Chat.Completions.ChatCompletion

                onChunk({
                  text: response.choices[0].message?.content || '',
                  usage: response.usage,
                  metrics: {
                    completion_tokens: response.usage?.completion_tokens,
                    time_completion_millsec,
                    time_first_token_millsec: 0
                  }
                })
              }
            } catch (fallbackError: any) {
              // 备用方案也失败
              onChunk({
                text: `\n\n工具调用结果处理失败: ${error.message || '未知错误'}`
              })
            }
          }
        }
      } catch (error: any) {
        // 处理工具调用过程中的错误
        console.error('[OpenAIProvider] 工具调用过程出错:', error)

        // 向用户发送错误消息
        onChunk({
          text: `\n\n工具调用过程出错: ${error.message || '未知错误'}`
        })
      }
    }

    const processStream = async (stream: any, idx: number) => {
      if (!isSupportStreamOutput()) {
        const time_completion_millsec = new Date().getTime() - start_time_millsec
        return onChunk({
          text: stream.choices[0].message?.content || '',
          usage: stream.usage,
          metrics: {
            completion_tokens: stream.usage?.completion_tokens,
            time_completion_millsec,
            time_first_token_millsec: 0
          }
        })
      }

      let content = '' // Accumulates the full, raw content
      let isCurrentlyThinking = false // Flag to track if we are inside <thinking> tags

      for await (const chunk of stream) {
        if (window.keyv.get(EVENT_NAMES.CHAT_COMPLETION_PAUSED)) {
          break
        }

        const delta = chunk.choices[0]?.delta
        let deltaContent = delta?.content || '' // Get delta content for processing

        // Accumulate raw content
        if (delta?.content) {
          content += delta.content
        }

        let textToSend = '' // Content for the main answer part
        let reasoningToSend = delta?.reasoning_content || delta?.reasoning || '' // Content for the thinking box (includes specific fields + tagged content)

        if (isReasoningModel(model)) {
          // Process content chunk by chunk, handling tags
          while (deltaContent.length > 0) {
            if (isCurrentlyThinking) {
              // Look for the end tag
              const endTagThinkIndex = deltaContent.indexOf('</think>')
              const endTagThinkingIndex = deltaContent.indexOf('</thinking>')
              let endTagIndex = -1
              let endTag = ''

              if (endTagThinkIndex !== -1 && (endTagThinkingIndex === -1 || endTagThinkIndex < endTagThinkingIndex)) {
                endTagIndex = endTagThinkIndex
                endTag = '</think>'
              } else if (endTagThinkingIndex !== -1) {
                endTagIndex = endTagThinkingIndex
                endTag = '</thinking>'
              }

              if (endTagIndex !== -1) {
                // End tag found in this chunk
                const thinkingPart = deltaContent.substring(0, endTagIndex + endTag.length)
                reasoningToSend += thinkingPart // Add content up to and including the tag to reasoning
                deltaContent = deltaContent.substring(endTagIndex + endTag.length) // Remaining content
                isCurrentlyThinking = false // Exited thinking state
              } else {
                // No end tag in this chunk, entire chunk is thinking content
                reasoningToSend += deltaContent
                deltaContent = '' // Consumed the chunk
              }
            } else {
              // Not currently thinking, look for the start tag
              const startTagThinkIndex = deltaContent.indexOf('<think>')
              const startTagThinkingIndex = deltaContent.indexOf('<thinking>')
              let startTagIndex = -1

              if (
                startTagThinkIndex !== -1 &&
                (startTagThinkingIndex === -1 || startTagThinkIndex < startTagThinkingIndex)
              ) {
                startTagIndex = startTagThinkIndex
              } else if (startTagThinkingIndex !== -1) {
                startTagIndex = startTagThinkingIndex
              }

              if (startTagIndex !== -1) {
                // Start tag found in this chunk
                const nonThinkingPart = deltaContent.substring(0, startTagIndex)
                textToSend += nonThinkingPart // Add content before the tag to text
                // The part from the tag onwards will be handled in the next iteration or as reasoning
                deltaContent = deltaContent.substring(startTagIndex)
                isCurrentlyThinking = true // Entered thinking state
              } else {
                // No start tag in this chunk, entire chunk is non-thinking content
                textToSend += deltaContent
                deltaContent = '' // Consumed the chunk
              }
            }
          }
        } else {
          // Non-reasoning models: always assign to textToSend
          textToSend = delta?.content || '' // Use original delta content directly
        }

        // --- Timing and other metadata calculation ---
        if (delta?.reasoning_content || delta?.reasoning) {
          // Keep track if specific reasoning fields were ever present
          hasReasoningContent = true
        }
        if (time_first_token_millsec == 0 && delta?.content) {
          // First token with any content
          time_first_token_millsec = new Date().getTime() - start_time_millsec
        }
        // Use the previously modified isReasoningJustDone for timing the end of *initial* reasoning phase
        if (time_first_content_millsec == 0 && isReasoningJustDone(delta)) {
          time_first_content_millsec = new Date().getTime()
        }
        const time_completion_millsec = new Date().getTime() - start_time_millsec
        const time_thinking_millsec = time_first_content_millsec ? time_first_content_millsec - start_time_millsec : 0
        // --- End Timing ---

        // Extract citations from the raw response if available
        const citations = (chunk as OpenAI.Chat.Completions.ChatCompletionChunk & { citations?: string[] })?.citations
        const finishReason = chunk.choices[0]?.finish_reason

        let webSearch: any[] | undefined = undefined
        if (assistant.enableWebSearch && isZhipuModel(model) && finishReason === 'stop') {
          webSearch = chunk?.web_search
        }
        if (firstChunk && assistant.enableWebSearch && isHunyuanSearchModel(model)) {
          webSearch = chunk?.search_info?.search_results
          firstChunk = false // Corrected: set to false after processing first chunk
        }

        // 添加日志输出，帮助调试
        if (reasoningToSend && reasoningToSend.length > 0) {
          console.log('[OpenAIProvider] 发送思考内容，长度:', reasoningToSend.length)
        }

        // Call onChunk only if there's something to send (text, reasoning, or metadata)
        if (textToSend || reasoningToSend || chunk.usage || webSearch || delta?.annotations || citations) {
          onChunk({
            text: textToSend, // Only non-thinking content
            reasoning_content: reasoningToSend, // Thinking content + specific reasoning fields
            usage: chunk.usage,
            metrics: {
              completion_tokens: chunk.usage?.completion_tokens,
              time_completion_millsec,
              time_first_token_millsec,
              time_thinking_millsec
            },
            webSearch,
            annotations: delta?.annotations,
            citations,
            mcpToolResponse: toolResponses
          })
        }
      } // End for await loop

      await processToolUses(content, idx) // Process tool uses based on the full accumulated content
    }

    const stream = await this.sdk.chat.completions
      // @ts-ignore key is not typed
      .create(
        {
          model: model.id,
          messages: reqMessages,
          temperature: this.getTemperature(assistant, model),
          top_p: this.getTopP(assistant, model),
          max_tokens: maxTokens,
          keep_alive: this.keepAliveTime,
          stream: isSupportStreamOutput(),
          ...(mcpTools && mcpTools.length > 0 && !store.getState().settings.usePromptForToolCalling
            ? {
                tools: mcpTools.map((tool) => ({
                  type: 'function',
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema
                  }
                }))
              }
            : {}),
          ...getOpenAIWebSearchParams(assistant, model),
          ...this.getReasoningEffort(assistant, model),
          ...this.getProviderSpecificParameters(assistant, model),
          ...this.getCustomParameters(assistant)
        },
        {
          signal
        }
      )

    await processStream(stream, 0).finally(cleanup)
    // 捕获signal的错误
    await signalPromise?.promise?.catch((error) => {
      throw error
    })
  }

  /**
   * Translate a message
   * @param message - The message
   * @param assistant - The assistant
   * @param onResponse - The onResponse callback
   * @returns The translated message
   */
  async translate(message: Message, assistant: Assistant, onResponse?: (text: string) => void) {
    const defaultModel = getDefaultModel()
    const model = assistant.model || defaultModel

    // 应用记忆功能到系统提示词
    const { applyMemoriesToPrompt } = await import('@renderer/services/MemoryService')
    // 获取当前话题ID
    const currentTopicId = message.topicId
    const enhancedPrompt = await applyMemoriesToPrompt(assistant.prompt || '', currentTopicId)
    console.log(
      '[OpenAIProvider.translate] Applied memories to prompt, length difference:',
      enhancedPrompt.length - (assistant.prompt || '').length
    )

    const messages = message.content
      ? [
          { role: 'system', content: enhancedPrompt },
          { role: 'user', content: message.content }
        ]
      : [{ role: 'user', content: enhancedPrompt }]

    const isOpenAIReasoning = this.isOpenAIReasoning(model)

    const isSupportedStreamOutput = () => {
      if (!onResponse) {
        return false
      }
      if (isOpenAIReasoning) {
        return false
      }
      return true
    }

    const stream = isSupportedStreamOutput()

    await this.checkIsCopilot()

    // @ts-ignore key is not typed
    const response = await this.sdk.chat.completions.create({
      model: model.id,
      messages: messages as ChatCompletionMessageParam[],
      stream,
      keep_alive: this.keepAliveTime,
      temperature: assistant?.settings?.temperature
    })

    if (!stream) {
      return response.choices[0].message?.content || ''
    }

    let text = ''
    let isThinking = false
    const isReasoning = isReasoningModel(model)

    for await (const chunk of response) {
      const deltaContent = chunk.choices[0]?.delta?.content || ''

      if (isReasoning) {
        // 检测思考开始 - 支持多种标签格式
        if (deltaContent.includes('<think>') || deltaContent.includes('<thinking>')) {
          isThinking = true
        }

        if (!isThinking) {
          text += deltaContent
          onResponse?.(text)
        }

        // 检测思考结束 - 支持多种标签格式
        if (deltaContent.includes('</think>') || deltaContent.includes('</thinking>')) {
          isThinking = false
        }
      } else {
        text += deltaContent
        onResponse?.(text)
      }
    }

    return text
  }

  /**
   * Summarize a message
   * @param messages - The messages
   * @param assistant - The assistant
   * @returns The summary
   */
  public async summaries(messages: Message[], assistant: Assistant): Promise<string> {
    const model = getTopNamingModel() || assistant.model || getDefaultModel()

    const userMessages = takeRight(messages, 5)
      .filter((message) => !message.isPreset)
      .map((message) => ({
        role: message.role,
        content: message.content
      }))

    const userMessageContent = userMessages.reduce((prev, curr) => {
      const content = curr.role === 'user' ? `User: ${curr.content}` : `Assistant: ${curr.content}`
      return prev + (prev ? '\n' : '') + content
    }, '')

    // 获取原始提示词
    const originalPrompt = getStoreSetting('topicNamingPrompt') || i18n.t('prompts.title')

    // 应用记忆功能到系统提示词
    const { applyMemoriesToPrompt } = await import('@renderer/services/MemoryService')
    // 获取当前话题ID
    const currentTopicId = messages.length > 0 ? messages[0].topicId : undefined
    // 使用双重类型断言强制转换类型
    const enhancedPrompt = (await applyMemoriesToPrompt(originalPrompt as string, currentTopicId)) as unknown as string
    // 存储原始提示词长度
    const originalPromptLength = (originalPrompt as string).length
    console.log(
      '[OpenAIProvider.summaries] Applied memories to prompt, length difference:',
      enhancedPrompt.length - originalPromptLength
    )

    const systemMessage = {
      role: 'system',
      content: enhancedPrompt
    }

    const userMessage = {
      role: 'user',
      content: userMessageContent
    }

    await this.checkIsCopilot()

    // @ts-ignore key is not typed
    const response = await this.sdk.chat.completions.create({
      model: model.id,
      messages: [systemMessage, userMessage] as ChatCompletionMessageParam[],
      stream: false,
      keep_alive: this.keepAliveTime,
      max_tokens: 1000
    })

    // 针对思考类模型的返回，总结仅截取思考标签之后的内容
    let content = response.choices[0].message?.content || ''
    // 支持多种思考标签格式
    content = content.replace(/^<think>(.*?)<\/think>/s, '')
    content = content.replace(/^<thinking>(.*?)<\/thinking>/s, '')

    return removeSpecialCharactersForTopicName(content.substring(0, 50))
  }

  /**
   * Summarize a message for search
   * @param messages - The messages
   * @param assistant - The assistant
   * @returns The summary
   */
  public async summaryForSearch(messages: Message[], assistant: Assistant): Promise<string | null> {
    const model = assistant.model || getDefaultModel()

    const systemMessage = {
      role: 'system',
      content: assistant.prompt
    }

    const userMessage = {
      role: 'user',
      content: messages.map((m) => m.content).join('\n')
    }
    // @ts-ignore key is not typed
    const response = await this.sdk.chat.completions.create(
      {
        model: model.id,
        messages: [systemMessage, userMessage] as ChatCompletionMessageParam[],
        stream: false,
        keep_alive: this.keepAliveTime,
        max_tokens: 1000
      },
      {
        timeout: 20 * 1000
      }
    )

    // 针对思考类模型的返回，总结仅截取思考标签之后的内容
    let content = response.choices[0].message?.content || ''
    // 支持多种思考标签格式
    content = content.replace(/^<think>(.*?)<\/think>/s, '')
    content = content.replace(/^<thinking>(.*?)<\/thinking>/s, '')

    return content
  }

  /**
   * Generate text
   * @param prompt - The prompt
   * @param content - The content
   * @param modelId - Optional model ID to use
   * @returns The generated text
   */
  public async generateText({
    prompt,
    content,
    modelId
  }: {
    prompt: string
    content: string
    modelId?: string
  }): Promise<string> {
    // 使用指定的模型或默认模型
    const model = modelId
      ? store
          .getState()
          .llm.providers.flatMap((provider) => provider.models)
          .find((m) => m.id === modelId)
      : getDefaultModel()

    if (!model) {
      console.error(`Model ${modelId} not found, using default model`)
      return ''
    }

    await this.checkIsCopilot()

    // 应用记忆功能到系统提示词
    const { applyMemoriesToPrompt } = await import('@renderer/services/MemoryService')
    // 使用双重类型断言强制转换类型
    const enhancedPrompt = (await applyMemoriesToPrompt(prompt as string)) as unknown as string
    // 存储原始提示词长度
    const promptLength = (prompt as string).length
    console.log('[OpenAIProvider] Applied memories to prompt, length difference:', enhancedPrompt.length - promptLength)

    const response = await this.sdk.chat.completions.create({
      model: model.id,
      stream: false,
      messages: [
        { role: 'system', content: enhancedPrompt },
        { role: 'user', content }
      ]
    })

    return response.choices[0].message?.content || ''
  }

  /**
   * Generate suggestions
   * @param messages - The messages
   * @param assistant - The assistant
   * @returns The suggestions
   */
  async suggestions(messages: Message[], assistant: Assistant): Promise<Suggestion[]> {
    const model = assistant.model

    if (!model) {
      return []
    }

    await this.checkIsCopilot()

    const response: any = await this.sdk.request({
      method: 'post',
      path: '/advice_questions',
      body: {
        messages: messages.filter((m) => m.role === 'user').map((m) => ({ role: m.role, content: m.content })),
        model: model.id,
        max_tokens: 0,
        temperature: 0,
        n: 0
      }
    })

    return response?.questions?.filter(Boolean)?.map((q: any) => ({ content: q })) || []
  }

  /**
   * Check if the model is valid
   * @param model - The model
   * @returns The validity of the model
   */
  public async check(model: Model): Promise<{ valid: boolean; error: Error | null }> {
    if (!model) {
      return { valid: false, error: new Error('No model found') }
    }
    const body = {
      model: model.id,
      messages: [{ role: 'user', content: 'hi' }],
      stream: false
    }

    try {
      await this.checkIsCopilot()
      const response = await this.sdk.chat.completions.create(body as ChatCompletionCreateParamsNonStreaming)

      return {
        valid: Boolean(response?.choices[0].message),
        error: null
      }
    } catch (error: any) {
      return {
        valid: false,
        error
      }
    }
  }

  /**
   * Get the models
   * @returns The models
   */
  public async models(): Promise<OpenAI.Models.Model[]> {
    try {
      await this.checkIsCopilot()

      const response = await this.sdk.models.list()

      if (this.provider.id === 'github') {
        // @ts-ignore key is not typed
        return response.body
          .map((model: any) => ({
            id: model.name,
            description: model.summary,
            object: 'model',
            owned_by: model.publisher
          }))
          .filter(isSupportedModel)
      }

      if (this.provider.id === 'together') {
        // @ts-ignore key is not typed
        return response?.body
          .map((model: any) => ({
            id: model.id,
            description: model.display_name,
            object: 'model',
            owned_by: model.organization
          }))
          .filter(isSupportedModel)
      }

      const models = response?.data || []

      return models.filter(isSupportedModel)
    } catch (error) {
      return []
    }
  }

  /**
   * Generate an image
   * @param params - The parameters
   * @returns The generated image
   */
  public async generateImage({
    model,
    prompt,
    negativePrompt,
    imageSize,
    batchSize,
    seed,
    numInferenceSteps,
    guidanceScale,
    signal,
    promptEnhancement
  }: GenerateImageParams): Promise<string[]> {
    const response = (await this.sdk.request({
      method: 'post',
      path: '/images/generations',
      signal,
      body: {
        model,
        prompt,
        negative_prompt: negativePrompt,
        image_size: imageSize,
        batch_size: batchSize,
        seed: seed ? parseInt(seed) : undefined,
        num_inference_steps: numInferenceSteps,
        guidance_scale: guidanceScale,
        prompt_enhancement: promptEnhancement
      }
    })) as { data: Array<{ url: string }> }

    return response.data.map((item) => item.url)
  }

  /**
   * Get the embedding dimensions
   * @param model - The model
   * @returns The embedding dimensions
   */
  public async getEmbeddingDimensions(model: Model): Promise<number> {
    await this.checkIsCopilot()

    const data = await this.sdk.embeddings.create({
      model: model.id,
      input: model?.provider === 'baidu-cloud' ? ['hi'] : 'hi'
    })
    return data.data[0].embedding.length
  }

  public async checkIsCopilot() {
    if (this.provider.id !== 'copilot') return
    const defaultHeaders = store.getState().copilot.defaultHeaders
    // copilot每次请求前需要重新获取token，因为token中附带时间戳
    const { token } = await window.api.copilot.getToken(defaultHeaders)
    this.sdk.apiKey = token
  }

  public async generateImageByChat({ messages, assistant, onChunk }: CompletionsParams): Promise<void> {
    const defaultModel = getDefaultModel()
    const model = assistant.model || defaultModel
    const lastUserMessage = messages.findLast((m) => m.role === 'user')
    const { abortController } = this.createAbortController(lastUserMessage?.id, true)
    const { signal } = abortController

    console.log('[OpenAIProvider.generateImageByChat] 开始生成图像，模型:', model.id)
    console.log('[OpenAIProvider.generateImageByChat] 用户消息:', lastUserMessage?.content)

    const response = await this.sdk.images.generate(
      {
        model: model.id,
        prompt: lastUserMessage?.content || '',
        response_format: model.id.includes('gpt-image-1') ? undefined : 'b64_json'
      },
      {
        signal
      }
    )

    return onChunk({
      text: '',
      generateImage: {
        type: 'base64',
        images: response.data.map((item) => `data:image/png;base64,${item.b64_json}`)
      }
    })
  }
}
