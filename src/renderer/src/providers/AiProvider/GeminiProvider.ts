import {
  ContentListUnion,
  createPartFromBase64,
  FinishReason,
  GenerateContentResponse,
  GoogleGenAI
} from '@google/genai'
import {
  Content,
  FileDataPart,
  GenerateContentStreamResult,
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  InlineDataPart,
  Part,
  RequestOptions,
  SafetySetting,
  TextPart
} from '@google/generative-ai'
import {
  isGemmaModel,
  isGenerateImageModel,
  isSupportedThinkingBudgetModel,
  isWebSearchModel
} from '@renderer/config/models'
import { getStoreSetting } from '@renderer/hooks/useSettings'
import i18n from '@renderer/i18n'
import agentService from '@renderer/services/AgentService'
import { getAssistantSettings, getDefaultModel, getTopNamingModel } from '@renderer/services/AssistantService'
import { EVENT_NAMES } from '@renderer/services/EventService'
import {
  filterContextMessages,
  filterEmptyMessages,
  filterUserRoleStartMessages
} from '@renderer/services/MessagesService'
import WebSearchService from '@renderer/services/WebSearchService'
import store from '@renderer/store'
import { getActiveServers } from '@renderer/store/mcp'
import {
  Assistant,
  FileType,
  FileTypes,
  MCPCallToolResponse,
  MCPToolResponse,
  Message,
  Model,
  Provider,
  Suggestion
} from '@renderer/types' // Re-add MCPToolResponse
import { removeSpecialCharactersForTopicName } from '@renderer/utils'
import {
  callMCPTool, // Re-add import
  geminiFunctionCallToMcpTool, // Re-add import
  mcpToolCallResponseToGeminiFunctionResponsePart, // Re-add import
  mcpToolsToGeminiTools, // Import for UI updates
  parseToolUse,
  upsertMCPToolResponse // Re-add import
} from '@renderer/utils/mcp-tools'
import { buildSystemPrompt } from '@renderer/utils/prompt'
import { MB } from '@shared/config/constant'
import axios from 'axios'
import { isEmpty, takeRight } from 'lodash'
import OpenAI from 'openai'

import { ChunkCallbackData, CompletionsParams } from '.'
import BaseProvider from './BaseProvider'

export default class GeminiProvider extends BaseProvider {
  private sdk: GoogleGenerativeAI
  private requestOptions: RequestOptions
  private imageSdk: GoogleGenAI
  // // 存储对话ID到SDK实例的映射 (当前实现未复用，仅写入)
  // private conversationSdks: Map<string, GoogleGenerativeAI> = new Map()
  // // 存储对话ID到图像SDK实例的映射 (当前实现未复用，仅写入)
  // private conversationImageSdks: Map<string, GoogleGenAI> = new Map()

  constructor(provider: Provider) {
    super(provider)
    // 获取新的API密钥，实现轮流使用多个密钥
    const apiKey = this.getApiKey()
    this.sdk = new GoogleGenerativeAI(apiKey)
    /// this sdk is experimental
    this.imageSdk = new GoogleGenAI({ apiKey: apiKey, httpOptions: { baseUrl: this.getBaseURL() } })
    this.requestOptions = {
      baseUrl: this.getBaseURL()
    }
    console.log(`[GeminiProvider] Initialized with API key`)
  }

  /**
   * 获取与对话关联的SDK实例
   * @param conversationId - 对话ID
   * @returns SDK实例
   */
  private getOrCreateSdk(conversationId: string): GoogleGenerativeAI {
    // 获取新的API密钥，实现轮流使用多个密钥
    const apiKey = this.getApiKey()

    // 如果没有提供对话ID，创建一个新的SDK实例
    if (!conversationId) {
      this.sdk = new GoogleGenerativeAI(apiKey)
      return this.sdk
    }

    // 创建新的SDK实例
    const newSdk = new GoogleGenerativeAI(apiKey)

    // // 存储SDK实例，覆盖之前的实例 (当前实现未复用，仅写入)
    // this.conversationSdks.set(conversationId, newSdk)

    // console.log(`[GeminiProvider] Created new SDK for conversation ${conversationId} with API key`)

    return newSdk
  }

  /**
   * 获取与对话关联的图像SDK实例
   * @param conversationId - 对话ID
   * @returns 图像SDK实例
   */
  private getOrCreateImageSdk(conversationId: string): GoogleGenAI {
    // 获取新的API密钥，实现轮流使用多个密钥
    const apiKey = this.getApiKey()

    // 如果没有提供对话ID，创建一个新的SDK实例
    if (!conversationId) {
      this.imageSdk = new GoogleGenAI({ apiKey: apiKey, httpOptions: { baseUrl: this.getBaseURL() } })
      return this.imageSdk
    }

    // 创建新的SDK实例
    const newSdk = new GoogleGenAI({ apiKey: apiKey, httpOptions: { baseUrl: this.getBaseURL() } })

    // // 存储SDK实例，覆盖之前的实例 (当前实现未复用，仅写入)
    // this.conversationImageSdks.set(conversationId, newSdk)

    // console.log(`[GeminiProvider] Created new Image SDK for conversation ${conversationId} with API key`)

    return newSdk
  }

  public getBaseURL(): string {
    return this.provider.apiHost
  }

  /**
   * Handle a PDF file
   * @param file - The file
   * @returns The part
   */
  private async handlePdfFile(file: FileType): Promise<Part> {
    const smallFileSize = 20 * MB
    const isSmallFile = file.size < smallFileSize

    if (isSmallFile) {
      const { data, mimeType } = await window.api.gemini.base64File(file)
      return {
        inlineData: {
          data,
          mimeType
        }
      } as InlineDataPart
    }

    // Retrieve file from Gemini uploaded files
    const fileMetadata = await window.api.gemini.retrieveFile(file, this.apiKey)

    if (fileMetadata) {
      return {
        fileData: {
          fileUri: fileMetadata.uri,
          mimeType: fileMetadata.mimeType
        }
      } as FileDataPart
    }

    // If file is not found, upload it to Gemini
    const uploadResult = await window.api.gemini.uploadFile(file, this.apiKey)

    return {
      fileData: {
        fileUri: uploadResult.file.uri,
        mimeType: uploadResult.file.mimeType
      }
    } as FileDataPart
  }

  /**
   * Get the message contents
   * @param message - The message
   * @returns The message contents
   */
  private async getMessageContents(message: Message): Promise<Content> {
    const role = message.role === 'user' ? 'user' : 'model'

    const parts: Part[] = [{ text: await this.getMessageContent(message) }]
    // Add any generated images from previous responses
    if (message.metadata?.generateImage?.images && message.metadata.generateImage.images.length > 0) {
      for (const imageUrl of message.metadata.generateImage.images) {
        if (imageUrl && imageUrl.startsWith('data:')) {
          // Extract base64 data and mime type from the data URL
          const matches = imageUrl.match(/^data:(.+);base64,(.*)$/)
          if (matches && matches.length === 3) {
            const mimeType = matches[1]
            const base64Data = matches[2]
            parts.push({
              inlineData: {
                data: base64Data,
                mimeType: mimeType
              }
            } as InlineDataPart)
          }
        }
      }
    }

    for (const file of message.files || []) {
      if (file.type === FileTypes.IMAGE) {
        const base64Data = await window.api.file.base64Image(file.id + file.ext)
        parts.push({
          inlineData: {
            data: base64Data.base64,
            mimeType: base64Data.mime
          }
        } as InlineDataPart)
      }

      if (file.ext === '.pdf') {
        parts.push(await this.handlePdfFile(file))
        continue
      }

      if ([FileTypes.TEXT, FileTypes.DOCUMENT].includes(file.type)) {
        const fileContent = await (await window.api.file.read(file.id + file.ext)).trim()
        parts.push({
          text: file.origin_name + '\n' + fileContent
        } as TextPart)
      }
    }

    return {
      role,
      parts
    }
  }

  /**
   * Get the safety settings
   * @param modelId - The model ID
   * @returns The safety settings
   */
  private getSafetySettings(modelId: string): SafetySetting[] {
    const safetyThreshold = modelId.includes('gemini-2.0-flash-exp')
      ? ('OFF' as HarmBlockThreshold)
      : HarmBlockThreshold.BLOCK_NONE

    return [
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: safetyThreshold
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: safetyThreshold
      },
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: safetyThreshold
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: safetyThreshold
      },
      {
        category: 'HARM_CATEGORY_CIVIC_INTEGRITY' as HarmCategory,
        threshold: safetyThreshold
      }
    ]
  }

  /**
   * Get thinking budget configuration for Gemini 2.5 models
   * @param assistant - The assistant
   * @param model - The model
   * @returns The thinking budget configuration
   */
  private getThinkingConfig(assistant: Assistant, model: Model): Record<string, any> {
    // 只对支持思考预算的模型应用思考预算功能
    if (!isSupportedThinkingBudgetModel(model)) {
      console.log('[ThinkingBudget] 模型不支持思考预算:', model.id)
      return {}
    }

    console.log('[ThinkingBudget] 模型支持思考预算:', model.id)

    // 从自定义参数中查找thinkingBudget参数
    const customParams = this.getCustomParameters(assistant) as Record<string, any>
    if (customParams.thinkingBudget !== undefined || customParams.thinking_budget !== undefined) {
      // 如果已经在自定义参数中设置了思考预算，直接使用
      const budget = customParams.thinkingBudget || customParams.thinking_budget
      console.log('[ThinkingBudget] 使用自定义参数中的思考预算:', budget)
      return {
        thinkingConfig: {
          thinkingBudget: budget
        }
      }
    }

    // 从助手设置中获取思考预算
    if (assistant?.settings?.thinkingBudget !== undefined) {
      console.log('[ThinkingBudget] 使用助手设置中的思考预算:', assistant.settings.thinkingBudget)

      // 确保思考预算是一个有效的数字
      const budget = Number(assistant.settings.thinkingBudget)
      if (!isNaN(budget) && budget >= 0) {
        return {
          thinkingConfig: {
            thinkingBudget: budget
          }
        }
      } else {
        console.log('[ThinkingBudget] 助手设置中的思考预算无效，使用默认值')
      }
    }

    // 默认思考预算为8192 tokens
    const defaultThinkingBudget = 8192
    console.log('[ThinkingBudget] 使用默认思考预算:', defaultThinkingBudget)

    return {
      thinkingConfig: {
        thinkingBudget: defaultThinkingBudget
      }
    }
  }

  /**
   * Generate completions
   * @param messages - The messages
   * @param assistant - The assistant
   * @param mcpTools - The MCP tools
   * @param onChunk - The onChunk callback
   * @param onFilterMessages - The onFilterMessages callback
   */
  public async completions({ messages, assistant, mcpTools, onChunk, onFilterMessages }: CompletionsParams) {
    // 获取对话ID，用于关联SDK实例
    const conversationId = assistant.id || ''

    // 检查是否启用了Agent模式
    const isAgentMode = store.getState().settings.enableAgentMode
    const maxApiRequests = store.getState().settings.agentModeMaxApiRequests

    // 如果启用了Agent模式，初始化Agent服务
    if (isAgentMode && mcpTools && mcpTools.length > 0) {
      agentService.startAgent(maxApiRequests)

      // 添加初始任务
      const lastMessage = messages[messages.length - 1]
      // 确保 lastMessage 存在且有 id，如果不存在则使用空字符串
      const messageId = lastMessage?.id || ''
      agentService.addTask(
        '分析用户请求',
        `分析用户的请求: "${lastMessage.content.substring(0, 100)}${lastMessage.content.length > 100 ? '...' : ''}"`,
        messageId // 传入消息ID
      )
    }

    // 检查是否是恢复的会话(重启后打开的旧会话)
    const isRestoredSession = messages.length > 1 && window.keyv.get('APP_JUST_STARTED') === true

    // 如果是刚启动应用，标记应用已启动
    if (window.keyv.get('APP_JUST_STARTED') === true) {
      window.keyv.set('APP_JUST_STARTED', false)
      console.log('[GeminiProvider] 应用刚刚启动，可能需要特殊处理恢复的会话')
    }

    if (isRestoredSession) {
      console.log('[GeminiProvider] 检测到恢复的会话，确保工具调用处理正确')
    }

    if (assistant.enableGenerateImage) {
      await this.generateImageExp({ messages, assistant, onFilterMessages, onChunk })
    } else {
      const defaultModel = getDefaultModel()
      const model = assistant.model || defaultModel
      const { contextCount, maxTokens, streamOutput } = getAssistantSettings(assistant)

      const userMessages = filterUserRoleStartMessages(
        filterEmptyMessages(filterContextMessages(takeRight(messages, contextCount + 2)))
      )
      onFilterMessages(userMessages)

      const userLastMessage = userMessages.pop()

      const history: Content[] = []

      for (const message of userMessages) {
        history.push(await this.getMessageContents(message))
      }

      // 获取当前话题ID
      const currentTopicId = messages.length > 0 ? messages[0].topicId : undefined

      // 应用记忆功能到系统提示词
      const { applyMemoriesToPrompt } = await import('@renderer/services/MemoryService')
      const enhancedPrompt = await applyMemoriesToPrompt(assistant.prompt || '', currentTopicId)
      console.log(
        '[GeminiProvider.completions] Applied memories to prompt, length difference:',
        enhancedPrompt.length - (assistant.prompt || '').length
      )

      // 使用增强后的提示词
      let systemInstruction = enhancedPrompt

      // 如果有MCP工具，进一步处理
      if (mcpTools && mcpTools.length > 0) {
        systemInstruction = await buildSystemPrompt(enhancedPrompt, mcpTools, getActiveServers(store.getState()))
      }

      // 检查是否使用Gemini的函数调用
      const useGeminiPromptForToolCalling = store.getState().settings.useGeminiPromptForToolCalling

      // Format MCP tools for Gemini native function calling, only if not using prompt-based tool calling
      let tools: any[] = []
      if (!useGeminiPromptForToolCalling && mcpTools && mcpTools.length > 0) {
        tools = mcpToolsToGeminiTools(mcpTools)
        console.log('[GeminiProvider] 使用函数调用方式调用MCP工具')
      } else if (mcpTools && mcpTools.length > 0) {
        console.log('[GeminiProvider] 使用提示词方式调用MCP工具')
        // 使用空数组，不添加工具
        tools = []
      }

      const toolResponses: MCPToolResponse[] = [] // Re-add for UI updates

      if (!WebSearchService.isOverwriteEnabled() && assistant.enableWebSearch && isWebSearchModel(model)) {
        tools.push({
          // @ts-ignore googleSearch is not a valid tool for Gemini
          googleSearch: {}
        })
      }

      // 使用与对话关联的SDK实例
      const sdk = this.getOrCreateSdk(conversationId)

      // 打印思考预算值
      console.log('[completions] 助手设置中的思考预算值:', assistant?.settings?.thinkingBudget)

      // 获取思考预算配置
      const thinkingConfig = this.getThinkingConfig(assistant, model)
      console.log('[completions] 思考预算配置:', JSON.stringify(thinkingConfig))

      const geminiModel = sdk.getGenerativeModel(
        {
          model: model.id,
          ...(isGemmaModel(model) ? {} : { systemInstruction: systemInstruction }),
          safetySettings: this.getSafetySettings(model.id),
          tools: tools, // Pass formatted tools here
          generationConfig: {
            ...thinkingConfig,
            maxOutputTokens: maxTokens,
            temperature: assistant?.settings?.temperature,
            topP: assistant?.settings?.topP,
            ...this.getCustomParameters(assistant)
          }
        },
        this.requestOptions
      )

      const chat = geminiModel.startChat({ history })
      const messageContents = await this.getMessageContents(userLastMessage!)

      if (isGemmaModel(model) && assistant.prompt) {
        const isFirstMessage = history.length === 0
        if (isFirstMessage) {
          const systemMessage = {
            role: 'user',
            parts: [
              {
                text:
                  '<start_of_turn>user\n' +
                  systemInstruction +
                  '<end_of_turn>\n' +
                  '<start_of_turn>user\n' +
                  messageContents.parts[0].text +
                  '<end_of_turn>'
              }
            ]
          }
          messageContents.parts = systemMessage.parts
        }
      }

      const start_time_millsec = new Date().getTime()
      const { abortController, cleanup } = this.createAbortController(userLastMessage?.id)
      const { signal } = abortController

      if (!streamOutput) {
        const { response } = await chat.sendMessage(messageContents.parts, { signal })
        const time_completion_millsec = new Date().getTime() - start_time_millsec
        onChunk({
          text: response.candidates?.[0].content.parts[0].text,
          usage: {
            prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
            completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
            total_tokens: response.usageMetadata?.totalTokenCount || 0
          },
          metrics: {
            completion_tokens: response.usageMetadata?.candidatesTokenCount,
            time_completion_millsec,
            time_first_token_millsec: 0
          },
          search: response.candidates?.[0]?.groundingMetadata
        })
        return
      }

      const userMessagesStream = await chat.sendMessageStream(messageContents.parts, { signal })
      let time_first_token_millsec = 0

      // Remove unused processToolUses function
      // const processToolUses = async (content: string, idx: number) => { ... }

      // 从设置中获取最大工具调用次数限制，防止无限循环
      const MAX_TOOL_CALLS = store.getState().settings.agentAutoExecutionCount

      /**
       * 处理响应流并递归处理工具调用
       * @param stream 响应流
       * @param toolCallCount 当前工具调用计数
       * @param isFirstCall 是否是第一次调用
       * @param previousToolResponses 之前的工具调用响应列表，用于添加到历史记录
       */
      const processStreamWithToolCalls = async (
        stream: GenerateContentStreamResult,
        toolCallCount: number = 0,
        isFirstCall: boolean = true,
        // 注意：保留参数以保持接口兼容性
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _previousToolResponses: { functionCall: any; response: any }[] = []
      ): Promise<void> => {
        // 检查是否超过最大工具调用次数
        if (toolCallCount >= MAX_TOOL_CALLS) {
          console.warn(`[GeminiProvider] 达到最大工具调用次数限制 (${MAX_TOOL_CALLS})，停止处理更多工具调用`)
          onChunk({
            text: `\n\n注意：已达到最大工具调用次数限制 (${MAX_TOOL_CALLS})。`
          })
          return
        }

        let aggregatedResponseText = ''
        let functionCallParts: Part[] = [] // 存储潜在的函数调用

        // 处理流式响应
        for await (const chunk of stream.stream) {
          if (window.keyv.get(EVENT_NAMES.CHAT_COMPLETION_PAUSED)) break

          // 只在第一次调用时更新首个token时间
          if (isFirstCall && time_first_token_millsec == 0) {
            time_first_token_millsec = new Date().getTime() - start_time_millsec
          }

          const time_completion_millsec = new Date().getTime() - start_time_millsec

          // 聚合文本内容
          const chunkText = chunk.text()
          aggregatedResponseText += chunkText

          // 检查块中是否有函数调用
          const functionCalls = chunk.functionCalls()
          if (functionCalls && functionCalls.length > 0) {
            // 存储函数调用部分以供后续处理
            functionCallParts = [{ functionCall: functionCalls[0] }]

            // 直接传递原生函数调用对象给UI渲染组件，不转换为XML
            const functionCall = functionCalls[0]

            // !!!重要!!! 创建一个特殊的占位符，包含唯一ID
            // 使用占位符而不是空文本是为了解决工具块定位问题
            // 如果发送空文本，UI无法确定在哪里插入工具块
            // 占位符提供了明确的位置标记，确保工具块在正确位置渲染
            const placeholderId = `${functionCall.name}_${Date.now()}`
            const placeholderText = `<tool_placeholder id="${placeholderId}"></tool_placeholder>`

            // 发送原生函数调用格式，添加geminiFunctionCall标记表明这是Gemini函数调用
            onChunk({
              text: placeholderText, // 使用占位符而不是空文本，确保UI能在正确位置渲染工具块
              geminiFunctionCall: {
                // 添加一个新的属性传递Gemini函数调用信息
                name: functionCall.name,
                args: functionCall.args || {},
                placeholderId // 也将占位符ID添加到元数据中，便于在UI层关联占位符和函数调用
              },
              metadata: {
                // 在消息的metadata中也添加geminiFunctionCall信息
                geminiFunctionCall: {
                  name: functionCall.name,
                  args: functionCall.args || {},
                  placeholderId // 保持一致性，在metadata中也包含占位符ID
                }
              },
              usage: {
                prompt_tokens: chunk.usageMetadata?.promptTokenCount || 0,
                completion_tokens: chunk.usageMetadata?.candidatesTokenCount || 0,
                total_tokens: chunk.usageMetadata?.totalTokenCount || 0
              },
              metrics: {
                completion_tokens: chunk.usageMetadata?.candidatesTokenCount,
                time_completion_millsec,
                time_first_token_millsec
              },
              search: chunk.candidates?.[0]?.groundingMetadata,
              mcpToolResponse: toolResponses
            })

            // 继续循环，不添加XML到聚合文本
            continue
          }

          // 发送文本块到UI
          onChunk({
            text: chunkText,
            usage: {
              prompt_tokens: chunk.usageMetadata?.promptTokenCount || 0,
              completion_tokens: chunk.usageMetadata?.candidatesTokenCount || 0,
              total_tokens: chunk.usageMetadata?.totalTokenCount || 0
            },
            metrics: {
              completion_tokens: chunk.usageMetadata?.candidatesTokenCount,
              time_completion_millsec,
              time_first_token_millsec
            },
            search: chunk.candidates?.[0]?.groundingMetadata,
            mcpToolResponse: toolResponses // 传递更新的工具响应到UI
          })
        }

        // --- 处理整个流后 ---

        if (functionCallParts.length > 0) {
          // 检测到函数调用
          const functionCall = functionCallParts[0].functionCall
          if (!functionCall) {
            console.error('Error: functionCall part exists but functionCall is undefined')
            return // 或适当处理错误
          }

          console.log(`[GeminiProvider] 检测到函数调用 #${toolCallCount + 1}:`, functionCall)

          // 将Gemini函数调用转换为MCPTool格式
          const mcpToolToCall = geminiFunctionCallToMcpTool(mcpTools, functionCall)

          if (mcpToolToCall) {
            // --- UI更新: 标记工具为调用中 ---
            const toolCallIdForUI = `${functionCall.name}-${Date.now()}` // 创建用于UI跟踪的唯一ID
            const actualArgs = functionCall.args || {} // 获取实际参数
            upsertMCPToolResponse(
              toolResponses,
              { id: toolCallIdForUI, tool: mcpToolToCall, args: actualArgs, status: 'invoking' },
              onChunk
            )

            // 检查是否启用了Agent模式
            let toolResponse: MCPCallToolResponse

            if (isAgentMode) {
              // 在Agent模式下，添加任务并执行
              const taskTitle = `执行工具: ${mcpToolToCall.name}`
              const taskDescription = `使用参数: ${JSON.stringify(actualArgs, null, 2)}`
              // 关联到最后一条用户消息的ID，如果不存在则使用空字符串
              const userLastMessageId = userLastMessage?.id || ''
              const taskId = agentService.addTask(taskTitle, taskDescription, userLastMessageId)

              // 通过Agent服务执行工具
              try {
                toolResponse = await agentService.executeTask(taskId, mcpToolToCall)
              } catch (error) {
                console.error('[GeminiProvider] Agent执行工具出错:', error)
                toolResponse = {
                  isError: true,
                  content: [
                    {
                      type: 'text',
                      text: `Error executing tool ${mcpToolToCall.name}: ${error instanceof Error ? error.message : String(error)}`
                    }
                  ]
                }
              }
            } else {
              // 正常模式下直接执行工具
              toolResponse = await callMCPTool(mcpToolToCall)
            }

            // 截断工具响应内容，避免日志过长
            const truncatedResponse = this.truncateToolResponse(toolResponse)
            console.log('[GeminiProvider] 收到MCP工具响应:', JSON.stringify(truncatedResponse, null, 2))

            // --- UI更新: 标记工具为完成，添加单独更新工具块的标记 ---
            upsertMCPToolResponse(
              toolResponses,
              { id: toolCallIdForUI, tool: mcpToolToCall, args: actualArgs, status: 'done', response: toolResponse },
              (chunkData) => {
                // 使用metadata传递工具块更新标记
                onChunk({
                  ...chunkData,
                  metadata: {
                    ...(chunkData.metadata || {}),
                    updateToolBlockOnly: true // 指示前端只更新工具块，不刷新整个聊天
                  }
                })
              }
            )

            // 添加1秒延迟，让用户有时间查看工具执行结果
            // 这样提高用户体验，避免结果显示太快用户来不及查看
            console.log(`[GeminiProvider] 等待1秒后继续处理: ${mcpToolToCall.name}`)
            await new Promise((resolve) => setTimeout(resolve, 1000))

            // 将工具响应格式化为Gemini FunctionResponse Part
            const functionResponsePart = mcpToolCallResponseToGeminiFunctionResponsePart(
              functionCall.name,
              toolResponse
            )
            // 截断格式化的FunctionResponse Part内容，避免日志过长
            // 使用简单的方法：直接截断JSON字符串
            const functionResponseStr = JSON.stringify(functionResponsePart, null, 2)
            const truncatedStr =
              functionResponseStr.length > 1000
                ? functionResponseStr.substring(0, 1000) + `... [截断，完整长度: ${functionResponseStr.length}字符]`
                : functionResponseStr
            console.log('[GeminiProvider] 格式化的FunctionResponse Part:', truncatedStr)

            // --- 代理循环: 将结果发送回Gemini ---
            console.log(`[GeminiProvider] 将工具响应 #${toolCallCount + 1} 发送回Gemini...`)

            // 将工具调用和响应添加到历史记录中
            // 注意：不再需要将工具调用和响应添加到历史记录中

            // 将工具调用添加到历史记录中（模型角色）
            const toolCallMessage: Content = {
              role: 'model',
              parts: [
                {
                  functionCall: functionCall // 添加原始的函数调用，保持Gemini原生格式
                }
              ]
            }

            // 将工具调用添加到历史中
            history.push(toolCallMessage)

            // 添加工具调用响应到历史记录中（用户角色）
            const toolResultMessage: Content = {
              role: 'user',
              parts: [
                {
                  text: `工具调用结果 (${functionCall.name}):\n${
                    toolResponse.isError
                      ? `Error: ${JSON.stringify(toolResponse.content)}`
                      : toolResponse.content
                          .map((item) => (item.type === 'text' ? item.text : JSON.stringify(item)))
                          .join('\n')
                  }`
                }
              ]
            }

            // 将工具响应添加到历史中
            history.push(toolResultMessage)

            // 打印添加到历史记录的内容，便于调试（截断过长内容）
            console.log('[GeminiProvider] 添加到历史的工具调用:', JSON.stringify(toolCallMessage, null, 2))

            // 截断工具响应消息内容，避免日志过长
            const truncatedResponseMessage = { ...toolResultMessage }
            if (
              truncatedResponseMessage.parts &&
              truncatedResponseMessage.parts[0] &&
              truncatedResponseMessage.parts[0].text
            ) {
              const text = truncatedResponseMessage.parts[0].text
              if (text.length > 500) {
                truncatedResponseMessage.parts[0].text =
                  text.substring(0, 500) + `... [截断，完整长度: ${text.length}字符]`
              }
            }
            console.log('[GeminiProvider] 添加到历史的工具响应:', JSON.stringify(truncatedResponseMessage, null, 2))

            // 打印历史记录信息，便于调试
            console.log(`[GeminiProvider] 工具调用历史记录已更新，当前历史长度: ${history.length}`)

            try {
              // 创建一个新的聊天实例，包含更新后的历史
              const updatedChat = geminiModel.startChat({ history })

              // 创建一个触发继续响应的简短提示
              const continuationPrompt: Part[] = [{ text: '请根据工具执行结果继续回复' }]

              // 添加一个标志表明这是工具调用后的继续响应，避免UI重渲染
              window.keyv.set('GEMINI_TOOL_CONTINUATION', true)

              // 获取Gemini对工具执行结果的回复
              const continuationStream = await updatedChat.sendMessageStream(continuationPrompt, { signal })

              // 确保使用同一个工具响应数组，避免状态重置
              // 处理Gemini的回复流
              await processStreamWithToolCalls(continuationStream, toolCallCount + 1, false, [])

              // 移除标志
              window.keyv.remove('GEMINI_TOOL_CONTINUATION')

              // 已处理完整流程，返回
              return
            } catch (error) {
              // 捕获API错误（包括配额超限等）
              console.error('[GeminiProvider] API错误:', error)

              // 格式化错误消息
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : typeof error === 'object' && error !== null
                    ? JSON.stringify(error)
                    : String(error)

              // 发送错误消息到UI，但保留工具块
              onChunk({
                text: `\n\n遇到错误: ${errorMessage}\n\n工具 ${mcpToolToCall.name} 已成功执行，但模型无法继续处理结果。`,
                mcpToolResponse: toolResponses // 重要：再次传递工具响应，确保工具块不会消失
              })

              // 如果在Agent模式，添加错误任务并停止
              if (isAgentMode) {
                agentService.addTask(
                  'API错误',
                  `在处理工具 ${mcpToolToCall.name} 的结果时遇到API错误: ${errorMessage}`,
                  userLastMessage?.id || ''
                )
                agentService.stopAgent()
              }
            }
          } else {
            console.error('[GeminiProvider] 找不到匹配的MCP工具:', functionCall.name)
            // 处理找不到工具的情况
            onChunk({ text: `\n\n错误: 找不到工具 ${functionCall.name}。` })
          }
        } else {
          console.log(
            `[GeminiProvider] 没有检测到函数调用 (调用计数: ${toolCallCount})。最终响应:`,
            aggregatedResponseText.substring(0, 500) + (aggregatedResponseText.length > 500 ? '...' : '')
          )

          // 检查XML格式的工具调用（当使用提示词模式时）
          if (useGeminiPromptForToolCalling && mcpTools && mcpTools.length > 0) {
            console.log('[GeminiProvider] 使用提示词模式，检查XML格式的工具调用')

            // 检查是否是恢复的会话中的工具调用
            const isRestoredSessionToolCall = isRestoredSession && aggregatedResponseText.includes('<tool_placeholder')

            if (isRestoredSessionToolCall) {
              console.log('[GeminiProvider] 检测到恢复会话中的工具调用，特殊处理:', aggregatedResponseText)
              // 对于恢复的会话，我们需要特殊处理工具占位符
              // 提取工具名称，格式如 <tool_placeholder id="get_current_time_1234567890"></tool_placeholder>
              const toolPlaceholderMatch = aggregatedResponseText.match(/<tool_placeholder id="([^_]+)_/)

              if (toolPlaceholderMatch && toolPlaceholderMatch[1]) {
                const toolName = toolPlaceholderMatch[1]
                console.log('[GeminiProvider] 从工具占位符提取的工具名称:', toolName)

                // 查找匹配的工具
                const matchedTool = mcpTools.find((tool) => tool.id === toolName)

                if (matchedTool) {
                  console.log('[GeminiProvider] 找到匹配的工具:', matchedTool.id)

                  // 创建一个模拟的工具调用
                  const simulatedToolCall = {
                    id: `${matchedTool.id}-${Date.now()}`,
                    tool: matchedTool,
                    status: 'pending'
                  }

                  // 添加到解析出的工具中，以便正常执行
                  // 这里不应该返回工具调用数组，因为函数返回类型是void
                  console.log('[GeminiProvider] 找到模拟工具调用:', simulatedToolCall)
                  // 在这里处理模拟工具调用的逻辑
                  return
                }
              }
            }

            // 从aggregatedResponseText中解析工具调用
            const parsedTools = parseToolUse(aggregatedResponseText, mcpTools)

            if (parsedTools && parsedTools.length > 0) {
              console.log('[GeminiProvider] 从文本中解析到XML工具调用:', parsedTools.length)

              // 处理每个解析出的工具调用
              for (const toolCall of parsedTools) {
                // 更新UI状态为调用中
                const toolCallIdForUI = `${toolCall.tool.id}-${Date.now()}`
                const actualArgs = toolCall.tool.inputSchema || {}

                upsertMCPToolResponse(
                  toolResponses,
                  { id: toolCallIdForUI, tool: toolCall.tool, args: actualArgs, status: 'invoking' },
                  onChunk
                )

                // 执行工具调用
                let toolResponse: MCPCallToolResponse
                try {
                  toolResponse = await callMCPTool(toolCall.tool)
                } catch (error) {
                  console.error('[GeminiProvider] 执行XML工具调用失败:', error)
                  toolResponse = {
                    isError: true,
                    content: [
                      {
                        type: 'text',
                        text: `Error executing tool ${toolCall.tool.id}: ${error instanceof Error ? error.message : String(error)}`
                      }
                    ]
                  }
                }

                // 更新UI状态为完成
                upsertMCPToolResponse(
                  toolResponses,
                  {
                    id: toolCallIdForUI,
                    tool: toolCall.tool,
                    args: actualArgs,
                    status: 'done',
                    response: toolResponse
                  },
                  (chunkData) => {
                    // 使用metadata传递工具块更新标记
                    onChunk({
                      ...chunkData,
                      metadata: {
                        ...(chunkData.metadata || {}),
                        updateToolBlockOnly: true // 指示前端只更新工具块，不刷新整个聊天
                      }
                    })
                  }
                )

                // 获取工具响应文本用于历史记录
                const responseText = toolResponse.isError
                  ? `执行工具 ${toolCall.tool.id} 失败: ${JSON.stringify(toolResponse.content)}`
                  : toolResponse.content.map((item) => (item.type === 'text' ? item.text : '[非文本内容]')).join('\n')

                // 将工具调用结果添加到历史记录中，以供Gemini后续处理
                const userLastMessageWithFunctionResponse = {
                  role: 'user',
                  parts: [
                    {
                      text: `<tool_use_result>\n<name>${toolCall.tool.id}</name>\n<result>${responseText}</result>\n</tool_use_result>`
                    }
                  ]
                }

                // 添加到历史中以便Gemini可以引用
                history.push(userLastMessageWithFunctionResponse)

                // 等待1秒，让用户有时间查看结果
                await new Promise((resolve) => setTimeout(resolve, 1000))

                // 使用更新后的历史记录重新获取Gemini的回复
                console.log('[GeminiProvider] 将工具执行结果发送回Gemini，等待继续回复')

                try {
                  // 创建一个新的聊天实例，包含更新后的历史
                  const updatedChat = geminiModel.startChat({ history })

                  // 创建一个触发继续响应的简短提示
                  const continuationPrompt: Part[] = [{ text: '请根据工具执行结果继续回复' }]

                  // 添加一个标志表明这是工具调用后的继续响应，避免UI重渲染
                  window.keyv.set('GEMINI_TOOL_CONTINUATION', true)

                  // 获取Gemini对工具执行结果的回复
                  const continuationStream = await updatedChat.sendMessageStream(continuationPrompt, { signal })

                  // 确保使用同一个工具响应数组，避免状态重置
                  // 处理Gemini的回复流
                  await processStreamWithToolCalls(continuationStream, toolCallCount + 1, false, [])

                  // 移除标志
                  window.keyv.remove('GEMINI_TOOL_CONTINUATION')

                  // 已处理完整流程，返回
                  return
                } catch (error) {
                  console.error('[GeminiProvider] 处理工具结果失败:', error)
                  onChunk({
                    text: `\n\n处理工具结果失败: ${error instanceof Error ? error.message : String(error)}`
                  })
                  return
                }
              }
            } else {
              console.log('[GeminiProvider] 未从文本中解析到XML工具调用')
            }
          }

          // 如果没有工具调用，只需记录完成
          console.log('[GeminiProvider] 工具调用处理完成。流式响应已完成。')
        }
      }

      // 使用新的递归函数处理初始流
      const processStream = async (stream: GenerateContentStreamResult) => {
        try {
          await processStreamWithToolCalls(stream, 0, true, [])
        } catch (error) {
          // 捕获顶层错误
          console.error('[GeminiProvider] 顶层流处理错误:', error)

          const errorMessage =
            error instanceof Error
              ? error.message
              : typeof error === 'object' && error !== null
                ? JSON.stringify(error)
                : String(error)

          // 发送错误消息到UI
          onChunk({
            text: `\n\n遇到错误: ${errorMessage}\n\n`,
            // 如果有工具响应，再次传递确保工具块不会消失
            ...(toolResponses.length > 0 ? { mcpToolResponse: toolResponses } : {})
          })

          // 如果在Agent模式，记录错误并停止
          if (store.getState().settings.enableAgentMode) {
            agentService.addTask('API错误', `处理响应流时遇到API错误: ${errorMessage}`, userLastMessage?.id || '')
            agentService.stopAgent()
          }
        }
      }

      try {
        // Start processing the initial stream
        await processStream(userMessagesStream).finally(() => {
          // 清理资源
          cleanup()

          // 如果启用了Agent模式，添加完成任务并停止Agent
          const isAgentMode = store.getState().settings.enableAgentMode
          if (isAgentMode) {
            // 添加任务完成的消息
            // 关联到最后一条用户消息的ID，如果不存在则使用空字符串
            agentService.addTask('任务完成', '所有请求的任务已完成', userLastMessage?.id || '') // 传入消息ID

            // 停止Agent模式
            setTimeout(() => {
              agentService.stopAgent()
            }, 1000) // 延迟1秒停止，确保UI能够显示最终状态
          }
        })
      } catch (error) {
        // 最外层错误处理
        console.error('[GeminiProvider] 最外层处理错误:', error)

        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null
              ? JSON.stringify(error)
              : String(error)

        // 发送最终错误消息到UI
        onChunk({
          text: `\n\n遇到关键错误，无法继续生成: ${errorMessage}`,
          // 如果有工具响应，再次传递确保工具块不会消失
          ...(toolResponses.length > 0 ? { mcpToolResponse: toolResponses } : {})
        })

        // 清理资源
        cleanup()

        // 如果在Agent模式，记录错误并停止
        if (store.getState().settings.enableAgentMode) {
          agentService.addTask('关键错误', `遇到关键错误: ${errorMessage}`, userLastMessage?.id || '')
          agentService.stopAgent()
        }
      }
    }
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
    const { maxTokens } = getAssistantSettings(assistant)
    const model = assistant.model || defaultModel

    // 获取对话ID，用于关联SDK实例
    const conversationId = assistant.id || ''

    // 获取当前话题ID
    const currentTopicId = message.topicId

    // 应用记忆功能到系统提示词
    const { applyMemoriesToPrompt } = await import('@renderer/services/MemoryService')
    const enhancedPrompt = await applyMemoriesToPrompt(assistant.prompt || '', currentTopicId)
    console.log(
      '[GeminiProvider.translate] Applied memories to prompt, length difference:',
      enhancedPrompt.length - (assistant.prompt || '').length
    )

    // 使用与对话关联的SDK实例
    const sdk = this.getOrCreateSdk(conversationId)

    const geminiModel = sdk.getGenerativeModel(
      {
        model: model.id,
        ...(isGemmaModel(model) ? {} : { systemInstruction: enhancedPrompt }),
        ...this.getThinkingConfig(assistant, model),
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: assistant?.settings?.temperature
        }
      },
      this.requestOptions
    )

    const content =
      isGemmaModel(model) && enhancedPrompt
        ? `<start_of_turn>user\n${enhancedPrompt}<end_of_turn>\n<start_of_turn>user\n${message.content}<end_of_turn>`
        : message.content

    if (!onResponse) {
      const { response } = await geminiModel.generateContent(content)
      return response.text()
    }

    const response = await geminiModel.generateContentStream(content)

    let text = ''

    for await (const chunk of response.stream) {
      text += chunk.text()
      onResponse(text)
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
    const originalPrompt = (getStoreSetting('topicNamingPrompt') as string) || i18n.t('prompts.title')

    // 获取当前话题ID
    const currentTopicId = messages.length > 0 ? messages[0].topicId : undefined

    // 应用记忆功能到系统提示词
    const { applyMemoriesToPrompt } = await import('@renderer/services/MemoryService')
    const enhancedPrompt = await applyMemoriesToPrompt(originalPrompt, currentTopicId)
    console.log(
      '[GeminiProvider.summaries] Applied memories to prompt, length difference:',
      enhancedPrompt.length - originalPrompt.length
    )

    const systemMessage = {
      role: 'system',
      content: enhancedPrompt
    }

    const userMessage = {
      role: 'user',
      content: userMessageContent
    }

    // 获取对话ID，用于关联SDK实例
    const conversationId = assistant.id || ''

    // 使用与对话关联的SDK实例
    const sdk = this.getOrCreateSdk(conversationId)

    const geminiModel = sdk.getGenerativeModel(
      {
        model: model.id,
        ...(isGemmaModel(model) ? {} : { systemInstruction: systemMessage.content }),
        ...this.getThinkingConfig(assistant, model),
        generationConfig: {
          temperature: assistant?.settings?.temperature
        }
      },
      this.requestOptions
    )

    const chat = geminiModel.startChat()
    const content = isGemmaModel(model)
      ? `<start_of_turn>user\n${enhancedPrompt}<end_of_turn>\n<start_of_turn>user\n${userMessage.content}<end_of_turn>`
      : userMessage.content

    const { response } = await chat.sendMessage(content)

    return removeSpecialCharactersForTopicName(response.text())
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
    modelId,
    conversationId = ''
  }: {
    prompt: string
    content: string
    modelId?: string
    conversationId?: string
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

    // 应用记忆功能到系统提示词
    const { applyMemoriesToPrompt } = await import('@renderer/services/MemoryService')
    const enhancedPrompt = await applyMemoriesToPrompt(prompt)
    console.log(
      '[GeminiProvider] Applied memories to prompt, length difference:',
      enhancedPrompt.length - prompt.length
    )

    const systemMessage = { role: 'system', content: enhancedPrompt }

    // 使用与对话关联的SDK实例
    const sdk = this.getOrCreateSdk(conversationId)

    const geminiModel = sdk.getGenerativeModel(
      {
        model: model.id,
        ...(isGemmaModel(model) ? {} : { systemInstruction: systemMessage.content }),
        ...this.getThinkingConfig({ model } as Assistant, model)
      },
      this.requestOptions
    )

    const chat = geminiModel.startChat()
    const messageContent = isGemmaModel(model)
      ? `<start_of_turn>user\n${enhancedPrompt}<end_of_turn>\n<start_of_turn>user\n${content}<end_of_turn>`
      : content

    const { response } = await chat.sendMessage(messageContent)

    return response.text()
  }

  /**
   * Generate suggestions
   * @returns The suggestions
   */
  public async suggestions(): Promise<Suggestion[]> {
    return [] // Placeholder/Unused interface method? Actual logic in generateImageExp
  }

  /**
   * Summarize a message for search
   * @param messages - The messages
   * @param assistant - The assistant
   * @returns The summary
   */
  public async summaryForSearch(messages: Message[], assistant: Assistant): Promise<string> {
    const model = assistant.model || getDefaultModel()

    // 获取当前话题ID
    const currentTopicId = messages.length > 0 ? messages[0].topicId : undefined

    // 应用记忆功能到系统提示词
    const { applyMemoriesToPrompt } = await import('@renderer/services/MemoryService')
    const enhancedPrompt = await applyMemoriesToPrompt(assistant.prompt || '', currentTopicId)
    console.log(
      '[GeminiProvider.summaryForSearch] Applied memories to prompt, length difference:',
      enhancedPrompt.length - (assistant.prompt || '').length
    )

    // 不再需要单独的systemMessage变量，因为我们直接使用enhancedPrompt

    const userMessage = {
      role: 'user',
      content: messages.map((m) => m.content).join('\n')
    }

    // 获取对话ID，用于关联SDK实例
    const conversationId = assistant.id || ''

    // 使用与对话关联的SDK实例
    const sdk = this.getOrCreateSdk(conversationId)

    const geminiModel = sdk.getGenerativeModel(
      {
        model: model.id,
        systemInstruction: enhancedPrompt,
        ...this.getThinkingConfig(assistant, model),
        generationConfig: {
          temperature: assistant?.settings?.temperature
        }
      },
      {
        ...this.requestOptions,
        timeout: 20 * 1000
      }
    )

    const chat = geminiModel.startChat()
    const { response } = await chat.sendMessage(userMessage.content)

    return response.text()
  }

  /**
   * Generate an image
   * @returns The generated image
   */
  public async generateImage(): Promise<string[]> {
    return [] // Placeholder/Unused interface method?
  }

  /**
   * 生成图像
   * @param messages - 消息列表
   * @param assistant - 助手配置
   * @param onChunk - 处理生成块的回调
   * @param onFilterMessages - 过滤消息的回调
   * @returns Promise<void>
   */
  private async generateImageExp({ messages, assistant, onChunk, onFilterMessages }: CompletionsParams): Promise<void> {
    const defaultModel = getDefaultModel()
    const model = assistant.model || defaultModel
    const { contextCount, streamOutput, maxTokens } = getAssistantSettings(assistant)

    // 获取对话ID，用于关联SDK实例
    const conversationId = assistant.id || ''

    const userMessages = filterUserRoleStartMessages(filterContextMessages(takeRight(messages, contextCount + 2)))
    onFilterMessages(userMessages)

    const userLastMessage = userMessages.pop()
    if (!userLastMessage) {
      throw new Error('No user message found')
    }

    const history: Content[] = []

    for (const message of userMessages) {
      history.push(await this.getMessageContents(message))
    }

    const userLastMessageContent = await this.getMessageContents(userLastMessage)
    const allContents = [...history, userLastMessageContent]

    let contents: ContentListUnion = allContents.length > 0 ? (allContents as ContentListUnion) : []

    contents = await this.addImageFileToContents(userLastMessage, contents)

    // 使用与对话关联的图像SDK实例
    const imageSdk = this.getOrCreateImageSdk(conversationId)

    // 获取思考预算值
    const thinkingBudget = assistant?.settings?.thinkingBudget

    if (!streamOutput) {
      const response = await this.callGeminiGenerateContent(
        model.id,
        contents,
        maxTokens,
        imageSdk,
        thinkingBudget,
        model
      )

      const { isValid, message } = this.isValidGeminiResponse(response)
      if (!isValid) {
        throw new Error(`Gemini API error: ${message}`)
      }

      this.processGeminiImageResponse(response, onChunk)
      return
    }
    const response = await this.callGeminiGenerateContentStream(
      model.id,
      contents,
      maxTokens,
      imageSdk,
      thinkingBudget,
      model
    )

    for await (const chunk of response) {
      this.processGeminiImageResponse(chunk, onChunk)
    }
  }

  /**
   * 添加图片文件到内容列表
   * @param message - 用户消息
   * @param contents - 内容列表
   * @returns 更新后的内容列表
   */
  private async addImageFileToContents(message: Message, contents: ContentListUnion): Promise<ContentListUnion> {
    if (message.files && message.files.length > 0) {
      const file = message.files[0]
      const fileContent = await window.api.file.base64Image(file.id + file.ext)

      if (fileContent && fileContent.base64) {
        const contentsArray = Array.isArray(contents) ? contents : [contents]
        return [...contentsArray, createPartFromBase64(fileContent.base64, fileContent.mime)]
      }
    }
    return contents
  }

  /**
   * 调用Gemini API生成内容
   * @param modelId - 模型ID
   * @param contents - 内容列表
   * @returns 生成结果
   */
  private async callGeminiGenerateContent(
    modelId: string,
    contents: ContentListUnion,
    maxTokens?: number,
    sdk?: GoogleGenAI,
    thinkingBudget?: number,
    model?: Model
  ): Promise<GenerateContentResponse> {
    try {
      // 获取新的API密钥，实现轮流使用多个密钥
      const apiKey = this.getApiKey()

      // 创建新的SDK实例
      const apiSdk = sdk || new GoogleGenAI({ apiKey: apiKey, httpOptions: { baseUrl: this.getBaseURL() } })

      // 检查是否为支持思考预算的模型
      const isThinkingBudgetSupported = modelId.includes('gemini-2.5')

      // 使用传入的思考预算值或默认值
      const budget = thinkingBudget !== undefined ? thinkingBudget : 8192
      const thinkingConfig = isThinkingBudgetSupported ? { thinkingConfig: { thinkingBudget: budget } } : {}
      console.log('[API调用] 思考预算配置:', JSON.stringify(thinkingConfig))

      // 构建请求配置
      const config = {
        responseModalities: model && isGenerateImageModel(model) ? ['Text', 'Image'] : undefined,
        responseMimeType: model && isGenerateImageModel(model) ? 'text/plain' : undefined,
        maxOutputTokens: maxTokens,
        ...(isThinkingBudgetSupported && budget >= 0 ? { thinkingConfig: { thinkingBudget: budget } } : {})
      }

      console.log('[API调用] 最终请求配置:', JSON.stringify(config))

      return await apiSdk.models.generateContent({
        model: modelId,
        contents: contents,
        config: config
      })
    } catch (error) {
      console.error('Gemini API error:', error)
      throw error
    }
  }

  private async callGeminiGenerateContentStream(
    modelId: string,
    contents: ContentListUnion,
    maxTokens?: number,
    sdk?: GoogleGenAI,
    thinkingBudget?: number,
    model?: Model
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    try {
      // 获取新的API密钥，实现轮流使用多个密钥
      const apiKey = this.getApiKey()

      // 创建新的SDK实例
      const apiSdk = sdk || new GoogleGenAI({ apiKey: apiKey, httpOptions: { baseUrl: this.getBaseURL() } })

      // 检查是否为支持思考预算的模型
      const isThinkingBudgetSupported = modelId.includes('gemini-2.5')

      // 使用传入的思考预算值或默认值
      const budget = thinkingBudget !== undefined ? thinkingBudget : 8192
      const thinkingConfig = isThinkingBudgetSupported ? { thinkingConfig: { thinkingBudget: budget } } : {}
      console.log('[API流式调用] 思考预算配置:', JSON.stringify(thinkingConfig))

      // 构建请求配置
      const config = {
        responseModalities: model && isGenerateImageModel(model) ? ['Text', 'Image'] : undefined,
        responseMimeType: model && isGenerateImageModel(model) ? 'text/plain' : undefined,
        maxOutputTokens: maxTokens,
        ...(isThinkingBudgetSupported && budget >= 0 ? { thinkingConfig: { thinkingBudget: budget } } : {})
      }

      console.log('[API流式调用] 最终请求配置:', JSON.stringify(config))

      return await apiSdk.models.generateContentStream({
        model: modelId,
        contents: contents,
        config: config
      })
    } catch (error) {
      console.error('Gemini API error:', error)
      throw error
    }
  }

  /**
   * 检查Gemini响应是否有效
   * @param response - Gemini响应
   * @returns 是否有效
   */
  private isValidGeminiResponse(response: GenerateContentResponse): { isValid: boolean; message: string } {
    return {
      isValid: response?.candidates?.[0]?.finishReason === FinishReason.STOP ? true : false,
      message: response?.candidates?.[0]?.finishReason || ''
    }
  }

  /**
   * 处理Gemini图像响应
   * @param response - Gemini响应
   * @param onChunk - 处理生成块的回调
   */
  private processGeminiImageResponse(response: any, onChunk: (chunk: ChunkCallbackData) => void): void {
    const parts = response.candidates[0].content.parts
    if (!parts) {
      return
    }
    // 提取图像数据
    const images = parts
      .filter((part: Part) => part.inlineData)
      .map((part: Part) => {
        if (!part.inlineData) {
          return null
        }
        const dataPrefix = `data:${part.inlineData.mimeType || 'image/png'};base64,`
        return part.inlineData.data.startsWith('data:') ? part.inlineData.data : dataPrefix + part.inlineData.data
      })

    // 提取文本数据
    const text = parts
      .filter((part: Part) => part.text !== undefined)
      .map((part: Part) => part.text)
      .join('')

    // 返回结果
    onChunk({
      text,
      generateImage: {
        type: 'base64',
        images
      },
      usage: {
        prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
        completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: response.usageMetadata?.totalTokenCount || 0
      },
      metrics: {
        completion_tokens: response.usageMetadata?.candidatesTokenCount
      }
    })
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
      max_tokens: 100,
      stream: false
    }

    try {
      // 使用新的API密钥创建一个临时SDK实例进行检查
      const apiKey = this.getApiKey()
      const tempSdk = new GoogleGenerativeAI(apiKey)

      const geminiModel = tempSdk.getGenerativeModel({ model: body.model }, this.requestOptions)
      const result = await geminiModel.generateContent(body.messages[0].content)
      return {
        valid: !isEmpty(result.response.text()),
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
      const api = this.provider.apiHost + '/v1beta/models'
      const { data } = await axios.get(api, { params: { key: this.apiKey } })

      return data.models.map(
        (m: { name: string; displayName: string; description: string }) =>
          ({
            id: m.name.replace('models/', ''),
            name: m.displayName,
            description: m.description,
            object: 'model',
            created: Date.now(),
            owned_by: 'gemini'
          }) as OpenAI.Models.Model
      )
    } catch (error) {
      return []
    }
  }

  /**
   * Get the embedding dimensions
   * @param model - The model
   * @returns The embedding dimensions
   */
  public async getEmbeddingDimensions(model: Model): Promise<number> {
    // 使用新的API密钥创建一个临时SDK实例
    const apiKey = this.getApiKey()
    const tempSdk = new GoogleGenerativeAI(apiKey)

    const data = await tempSdk.getGenerativeModel({ model: model.id }, this.requestOptions).embedContent('hi')
    return data.embedding.values.length
  }

  /**
   * 截断工具响应内容，避免日志过长
   * @param toolResponse - 工具响应
   * @returns 截断后的工具响应
   */
  private truncateToolResponse(toolResponse: any): any {
    if (!toolResponse || !toolResponse.content) {
      return toolResponse
    }

    // 创建响应的深拷贝，避免修改原始对象
    const truncated = JSON.parse(JSON.stringify(toolResponse))

    // 最大文本长度限制
    const MAX_TEXT_LENGTH = 500

    // 处理内容数组
    if (Array.isArray(truncated.content)) {
      truncated.content = truncated.content.map((item: any) => {
        // 处理文本类型内容
        if (item.type === 'text' && item.text && item.text.length > MAX_TEXT_LENGTH) {
          return {
            ...item,
            text: item.text.substring(0, MAX_TEXT_LENGTH) + `... [截断，完整长度: ${item.text.length}字符]`
          }
        }
        // 处理图片类型内容
        if (item.type === 'image' && item.data) {
          return {
            ...item,
            data: '[图片数据已截断]'
          }
        }
        return item
      })
    }

    return truncated
  }

  public generateImageByChat(): Promise<void> {
    throw new Error('Method not implemented.')
  }
}
