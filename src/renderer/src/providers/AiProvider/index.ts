import type { GroundingMetadata } from '@google/generative-ai'
import BaseProvider from '@renderer/providers/AiProvider/BaseProvider'
import ProviderFactory from '@renderer/providers/AiProvider/ProviderFactory'
import type {
  Assistant,
  GenerateImageParams,
  GenerateImageResponse,
  MCPTool,
  MCPToolResponse,
  Message,
  Metrics,
  Model,
  Provider,
  Suggestion
} from '@renderer/types'
import OpenAI from 'openai'

export interface ChunkCallbackData {
  text?: string
  reasoning_content?: string
  usage?: OpenAI.Completions.CompletionUsage
  metrics?: Metrics
  // Zhipu web search
  webSearch?: any[]
  // Gemini web search
  search?: GroundingMetadata
  // Openai web search
  annotations?: OpenAI.Chat.Completions.ChatCompletionMessage.Annotation[]
  // Openrouter web search or Knowledge base
  citations?: string[]
  mcpToolResponse?: MCPToolResponse[]
  generateImage?: GenerateImageResponse
  // Gemini原生函数调用格式
  geminiFunctionCall?: {
    name: string // 函数调用的名称
    args: Record<string, any> // 函数调用的参数
    placeholderId?: string // 占位符ID，用于在UI中定位工具块的确切位置
    // 该字段至关重要，保证了工具块在文本流中正确定位
    // 如果没有此ID，工具块将无法在正确位置渲染
  }
  // 额外元数据，将被合并到消息的metadata中
  metadata?: Record<string, any>
}

export interface CompletionsParams {
  messages: Message[]
  assistant: Assistant
  onChunk: ({
    text,
    reasoning_content,
    usage,
    metrics,
    webSearch,
    search,
    annotations,
    citations,
    mcpToolResponse,
    generateImage
  }: ChunkCallbackData) => void
  onFilterMessages: (messages: Message[]) => void
  mcpTools?: MCPTool[]
}

export default class AiProvider {
  private sdk: BaseProvider

  constructor(provider: Provider) {
    this.sdk = ProviderFactory.create(provider)
  }

  public async fakeCompletions(params: CompletionsParams): Promise<void> {
    return this.sdk.fakeCompletions(params)
  }

  public async completions({
    messages,
    assistant,
    mcpTools,
    onChunk,
    onFilterMessages
  }: CompletionsParams): Promise<void> {
    return this.sdk.completions({ messages, assistant, mcpTools, onChunk, onFilterMessages })
  }

  public async translate(message: Message, assistant: Assistant, onResponse?: (text: string) => void): Promise<string> {
    return this.sdk.translate(message, assistant, onResponse)
  }

  public async summaries(messages: Message[], assistant: Assistant): Promise<string> {
    return this.sdk.summaries(messages, assistant)
  }

  public async summaryForSearch(messages: Message[], assistant: Assistant): Promise<string | null> {
    return this.sdk.summaryForSearch(messages, assistant)
  }

  public async suggestions(messages: Message[], assistant: Assistant): Promise<Suggestion[]> {
    return this.sdk.suggestions(messages, assistant)
  }

  public async generateText({
    prompt,
    content,
    modelId
  }: {
    prompt: string
    content: string
    modelId?: string
  }): Promise<string> {
    return this.sdk.generateText({ prompt, content, modelId })
  }

  public async check(model: Model): Promise<{ valid: boolean; error: Error | null }> {
    return this.sdk.check(model)
  }

  public async models(): Promise<OpenAI.Models.Model[]> {
    return this.sdk.models()
  }

  public getApiKey(): string {
    return this.sdk.getApiKey()
  }

  public async generateImage(params: GenerateImageParams): Promise<string[]> {
    return this.sdk.generateImage(params)
  }

  public async generateImageByChat({
    messages,
    assistant,
    onChunk,
    onFilterMessages
  }: CompletionsParams): Promise<void> {
    return this.sdk.generateImageByChat({ messages, assistant, onChunk, onFilterMessages })
  }

  public async getEmbeddingDimensions(model: Model): Promise<number> {
    return this.sdk.getEmbeddingDimensions(model)
  }

  public getBaseURL(): string {
    return this.sdk.getBaseURL()
  }
}
