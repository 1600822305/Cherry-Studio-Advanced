// src/main/mcpServers/siliconflow-flux.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import axios from 'axios'
import Logger from 'electron-log'

// 图像生成参数接口
interface ImageGenerationArgs {
  /**
   * 图像生成提示词。建议使用英文以获得最佳效果。
   */
  prompt: string

  /**
   * 生成图像的分辨率。
   */
  resolution: '1024x1024' | '960x1280' | '768x1024' | '720x1440' | '720x1280'

  /**
   * 可选的随机种子，用于生成可重复的结果。如果不提供，将使用随机种子。
   */
  seed?: number
}

// 存储图像生成结果的接口
interface ImageGeneration {
  prompt: string
  resolution: string
  response: any // 存储完整的API响应
  imageUrl?: string // 存储提取的图像URL
  timestamp: string
}

// 验证图像生成参数
function isValidImageGenerationArgs(args: any): args is ImageGenerationArgs {
  if (!args || typeof args !== 'object') return false
  if (typeof args.prompt !== 'string' || args.prompt.trim() === '') return false

  const validResolutions = ['1024x1024', '960x1280', '768x1024', '720x1440', '720x1280']
  if (typeof args.resolution !== 'string' || !validResolutions.includes(args.resolution)) return false

  // 验证可选参数（如果提供）
  if (args.seed !== undefined) {
    const seed = Number(args.seed)
    if (!Number.isInteger(seed) || seed < 0) return false
  }

  return true
}

// SiliconFlow Flux MCP 服务器类
class SiliconFlowFluxServer {
  public server: Server
  private apiKey: string
  private apiConfig = {
    BASE_URL: 'https://api.siliconflow.cn',
    ENDPOINTS: {
      IMAGE_GENERATION: '/v1/images/generations'
    },
    MODEL_ID: 'black-forest-labs/FLUX.1-schnell',
    DEFAULT_PARAMS: {
      num_inference_steps: 20,
      guidance_scale: 7.5,
      batch_size: 1
    },
    MAX_CACHED_GENERATIONS: 10
  }
  private axiosInstance: ReturnType<typeof axios.create>
  private recentImageGenerations: ImageGeneration[] = []

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('SILICONFLOW_API_KEY 环境变量是必需的，请在环境变量中设置')
    }

    this.apiKey = apiKey
    Logger.info('[SiliconFlowFlux] 创建服务器')

    // 初始化服务器
    this.server = new Server(
      {
        name: 'siliconflow-flux-image-server',
        version: '0.1.0'
      },
      {
        capabilities: {
          resources: {}, // 保留资源能力
          tools: {}
        }
      }
    )

    // 配置 Axios 实例
    this.axiosInstance = axios.create({
      baseURL: this.apiConfig.BASE_URL,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    this.setupErrorHandling()
    this.setupHandlers()
    Logger.info('[SiliconFlowFlux] 服务器初始化完成')
  }

  // 设置错误处理
  private setupErrorHandling() {
    this.server.onerror = (error) => {
      Logger.error('[SiliconFlowFlux] MCP 错误:', error)
    }
  }

  // 设置请求处理程序
  private setupHandlers() {
    this.setupResourceHandlers()
    this.setupToolHandlers()
  }

  // 设置资源处理程序
  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: this.recentImageGenerations.map((generation, index) => ({
        uri: `siliconflow://flux/images/${index}`,
        name: `最近的 Flux 图像: ${generation.prompt.substring(0, 30)}${generation.prompt.length > 30 ? '...' : ''}`,
        mimeType: 'application/json',
        description: `[${generation.resolution}] 提示词: ${generation.prompt} (${generation.timestamp})`
      }))
    }))

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const siliconflowMatch = request.params.uri.match(/^siliconflow:\/\/flux\/images\/(\d+)$/)
      if (siliconflowMatch) {
        const index = parseInt(siliconflowMatch[1])
        const generation = this.recentImageGenerations[index]
        if (!generation) {
          throw new McpError(ErrorCode.InvalidRequest, `图像生成结果未找到，索引: ${index}`)
        }

        // 返回缓存的 API 响应和提取的 URL
        const responseData = {
          prompt: generation.prompt,
          resolution: generation.resolution,
          timestamp: generation.timestamp,
          imageUrl: generation.imageUrl,
          apiResponse: generation.response
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(responseData, null, 2)
            }
          ]
        }
      }

      throw new McpError(ErrorCode.InvalidRequest, `无效的资源 URI: ${request.params.uri}`)
    })
  }

  // 设置工具处理程序
  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_image',
          description: `使用 SiliconFlow API 的 Flux Schnell 模型 (black-forest-labs/FLUX.1-schnell) 生成图像。提供详细的英文提示词并选择分辨率。`,
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: '必需。图像生成的详细文本提示词。为获得最佳效果，请使用英文！'
              },
              resolution: {
                type: 'string',
                description: '必需。所需的图像分辨率。',
                enum: ['1024x1024', '960x1280', '768x1024', '720x1440', '720x1280']
              },
              seed: {
                type: 'integer',
                description: '可选。用于可重复性的特定种子。如果省略，将使用随机种子。',
                minimum: 0
              }
            },
            required: ['prompt', 'resolution']
          }
        }
      ]
    }))

    // 处理工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === 'generate_image') {
        return this.handleGenerateImageTool(request)
      }

      // 处理未知工具
      throw new McpError(ErrorCode.MethodNotFound, `未知工具: '${request.params.name}'`)
    })
  }

  // 处理图像生成工具
  private async handleGenerateImageTool(request: any) {
    const params = request.params.arguments as unknown

    // 验证参数
    if (!isValidImageGenerationArgs(params)) {
      Logger.error('[SiliconFlowFlux] 收到无效参数:', params)
      throw new McpError(
        ErrorCode.InvalidParams,
        '输入参数无效！必需: prompt (字符串), resolution (枚举)。可选: seed (整数)。请检查您的输入。'
      )
    }

    Logger.info(
      `[SiliconFlowFlux] 收到图像生成请求: 提示词="${params.prompt}", 分辨率="${params.resolution}", 种子=${
        params.seed ?? '随机'
      }`
    )

    try {
      // 准备 API 请求参数
      const [width, height] = params.resolution.split('x').map(Number)
      const apiParams = {
        model: this.apiConfig.MODEL_ID,
        prompt: params.prompt,
        width,
        height,
        ...this.apiConfig.DEFAULT_PARAMS
      }

      // 如果提供了种子，添加到请求中
      if (params.seed !== undefined) {
        Object.assign(apiParams, { seed: params.seed })
      }

      Logger.info('[SiliconFlowFlux] 发送 API 请求:', JSON.stringify(apiParams))

      // 调用 SiliconFlow API
      const response = await this.axiosInstance.post(this.apiConfig.ENDPOINTS.IMAGE_GENERATION, apiParams)
      const responseData = response.data

      // 验证 API 响应
      if (!responseData || !responseData.data || !Array.isArray(responseData.data) || responseData.data.length === 0) {
        throw new Error(`从 SiliconFlow API 收到的响应格式无效: ${JSON.stringify(responseData)}`)
      }

      // 提取图像 URL
      const imageUrl = responseData.data[0]?.url
      if (!imageUrl) {
        throw new Error('API 响应中未找到图像 URL')
      }

      Logger.info('[SiliconFlowFlux] 成功生成图像:', imageUrl)

      // 缓存生成结果
      const generation: ImageGeneration = {
        prompt: params.prompt,
        resolution: params.resolution,
        response: responseData,
        imageUrl,
        timestamp: new Date().toISOString()
      }

      // 添加到最近的生成列表，保持最大缓存大小
      this.recentImageGenerations.unshift(generation)
      if (this.recentImageGenerations.length > this.apiConfig.MAX_CACHED_GENERATIONS) {
        this.recentImageGenerations.pop()
      }

      // 返回 Markdown 格式的图像
      const markdownImage = `![${params.prompt}](${imageUrl})\n\n*分辨率: ${params.resolution} | 提示词: ${params.prompt}*`

      return {
        content: [
          {
            type: 'text',
            text: markdownImage
          }
        ]
      }
    } catch (error) {
      Logger.error('[SiliconFlowFlux] 图像生成失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)

      // 返回错误响应
      return {
        content: [
          {
            type: 'text',
            text: `图像生成失败: ${errorMessage}`
          }
        ],
        isError: true
      }
    }
  }
}

export default SiliconFlowFluxServer
