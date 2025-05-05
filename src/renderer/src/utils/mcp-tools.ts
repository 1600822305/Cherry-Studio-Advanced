import { ContentBlockParam, ToolUnion, ToolUseBlock } from '@anthropic-ai/sdk/resources'
import { MessageParam } from '@anthropic-ai/sdk/resources'
import {
  ArraySchema,
  BaseSchema,
  BooleanSchema,
  EnumStringSchema,
  FunctionCall,
  FunctionDeclaration,
  FunctionDeclarationSchema,
  FunctionDeclarationSchemaProperty,
  IntegerSchema,
  NumberSchema,
  ObjectSchema,
  SchemaType,
  SimpleStringSchema,
  Tool as geminiTool
} from '@google/generative-ai'
import { Content, Part } from '@google/generative-ai'
import store from '@renderer/store'
import { MCPCallToolResponse, MCPServer, MCPTool, MCPToolResponse } from '@renderer/types'
import {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool
} from 'openai/resources'

import { ChunkCallbackData, CompletionsParams } from '../providers/AiProvider'

const ensureValidSchema = (obj: Record<string, any>): FunctionDeclarationSchemaProperty => {
  // Filter out unsupported keys for Gemini
  const filteredObj = filterUnsupportedKeys(obj)

  // Handle base schema properties
  const baseSchema = {
    description: filteredObj.description,
    nullable: filteredObj.nullable
  } as BaseSchema

  // Handle string type
  if (filteredObj.type?.toLowerCase() === SchemaType.STRING) {
    if (filteredObj.enum && Array.isArray(filteredObj.enum)) {
      return {
        ...baseSchema,
        type: SchemaType.STRING,
        format: 'enum',
        enum: filteredObj.enum as string[]
      } as EnumStringSchema
    }
    return {
      ...baseSchema,
      type: SchemaType.STRING,
      format: filteredObj.format === 'date-time' ? 'date-time' : undefined
    } as SimpleStringSchema
  }

  // Handle number type
  if (filteredObj.type?.toLowerCase() === SchemaType.NUMBER) {
    return {
      ...baseSchema,
      type: SchemaType.NUMBER,
      format: ['float', 'double'].includes(filteredObj.format) ? (filteredObj.format as 'float' | 'double') : undefined
    } as NumberSchema
  }

  // Handle integer type
  if (filteredObj.type?.toLowerCase() === SchemaType.INTEGER) {
    return {
      ...baseSchema,
      type: SchemaType.INTEGER,
      format: ['int32', 'int64'].includes(filteredObj.format) ? (filteredObj.format as 'int32' | 'int64') : undefined
    } as IntegerSchema
  }

  // Handle boolean type
  if (filteredObj.type?.toLowerCase() === SchemaType.BOOLEAN) {
    return {
      ...baseSchema,
      type: SchemaType.BOOLEAN
    } as BooleanSchema
  }

  // Handle array type
  if (filteredObj.type?.toLowerCase() === SchemaType.ARRAY) {
    return {
      ...baseSchema,
      type: SchemaType.ARRAY,
      items: filteredObj.items
        ? ensureValidSchema(filteredObj.items as Record<string, any>)
        : ({ type: SchemaType.STRING } as SimpleStringSchema),
      minItems: filteredObj.minItems,
      maxItems: filteredObj.maxItems
    } as ArraySchema
  }

  // Handle object type (default)
  const properties = filteredObj.properties
    ? Object.fromEntries(
        Object.entries(filteredObj.properties).map(([key, value]) => [
          key,
          ensureValidSchema(value as Record<string, any>)
        ])
      )
    : { _empty: { type: SchemaType.STRING } as SimpleStringSchema } // Ensure properties is never empty

  return {
    ...baseSchema,
    type: SchemaType.OBJECT,
    properties,
    required: Array.isArray(filteredObj.required) ? filteredObj.required : undefined
  } as ObjectSchema
}

function filterUnsupportedKeys(obj: Record<string, any>): Record<string, any> {
  const supportedBaseKeys = ['description', 'nullable']
  const supportedStringKeys = [...supportedBaseKeys, 'type', 'format', 'enum']
  const supportedNumberKeys = [...supportedBaseKeys, 'type', 'format']
  const supportedBooleanKeys = [...supportedBaseKeys, 'type']
  const supportedArrayKeys = [...supportedBaseKeys, 'type', 'items', 'minItems', 'maxItems']
  const supportedObjectKeys = [...supportedBaseKeys, 'type', 'properties', 'required']

  const filtered: Record<string, any> = {}

  let keysToKeep: string[]

  if (obj.type?.toLowerCase() === SchemaType.STRING) {
    keysToKeep = supportedStringKeys
  } else if (obj.type?.toLowerCase() === SchemaType.NUMBER) {
    keysToKeep = supportedNumberKeys
  } else if (obj.type?.toLowerCase() === SchemaType.INTEGER) {
    keysToKeep = supportedNumberKeys
  } else if (obj.type?.toLowerCase() === SchemaType.BOOLEAN) {
    keysToKeep = supportedBooleanKeys
  } else if (obj.type?.toLowerCase() === SchemaType.ARRAY) {
    keysToKeep = supportedArrayKeys
  } else {
    // Default to object type
    keysToKeep = supportedObjectKeys
  }

  // copy supported keys
  for (const key of keysToKeep) {
    if (obj[key] !== undefined) {
      filtered[key] = obj[key]
    }
  }

  return filtered
}

function filterPropertieAttributes(tool: MCPTool, filterNestedObj: boolean = false): Record<string, object> {
  const properties = tool.inputSchema.properties
  if (!properties) {
    return {}
  }

  // For OpenAI, we don't need to validate as strictly
  if (!filterNestedObj) {
    return properties
  }

  const processedProperties = Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, ensureValidSchema(value as Record<string, any>)])
  )

  return processedProperties
}

export function mcpToolsToOpenAITools(mcpTools: MCPTool[]): Array<ChatCompletionTool> {
  return mcpTools.map((tool) => ({
    type: 'function',
    name: tool.name,
    function: {
      name: tool.id,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: filterPropertieAttributes(tool)
      }
    }
  }))
}

export function openAIToolsToMcpTool(
  mcpTools: MCPTool[] | undefined,
  llmTool: ChatCompletionMessageToolCall
): MCPTool | undefined {
  if (!mcpTools) {
    return undefined
  }

  const tool = mcpTools.find(
    (mcptool) => mcptool.id === llmTool.function.name || mcptool.name === llmTool.function.name
  )

  if (!tool) {
    console.warn('No MCP Tool found for tool call:', llmTool)
    return undefined
  }

  console.log(
    `[MCP] OpenAI Tool to MCP Tool: ${tool.serverName} ${tool.name}`,
    tool,
    'args',
    llmTool.function.arguments
  )
  // use this to parse the arguments and avoid parsing errors
  let args: any = {}
  try {
    args = JSON.parse(llmTool.function.arguments)
  } catch (e) {
    console.error('Error parsing arguments', e)
  }

  return {
    id: tool.id,
    serverId: tool.serverId,
    serverName: tool.serverName,
    name: tool.name,
    description: tool.description,
    inputSchema: args,
    // Add the missing toolKey property
    toolKey: `${tool.serverId}-${tool.name}`
  }
}

export async function callMCPTool(tool: MCPTool): Promise<MCPCallToolResponse> {
  console.log(`[MCP] Calling Tool: ${tool.serverName} ${tool.name}`, tool)
  try {
    const server = getMcpServerByTool(tool)

    if (!server) {
      throw new Error(`Server not found: ${tool.serverName}`)
    }

    const resp = await window.api.mcp.callTool({
      server,
      name: tool.name,
      args: tool.inputSchema
    })

    console.log(`[MCP] Tool called: ${tool.serverName} ${tool.name}`, resp)
    return resp
  } catch (e) {
    console.error(`[MCP] Error calling Tool: ${tool.serverName} ${tool.name}`, e)
    return Promise.resolve({
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error calling tool ${tool.name}: ${JSON.stringify(e)}`
        }
      ]
    })
  }
}

export function mcpToolsToAnthropicTools(mcpTools: MCPTool[]): Array<ToolUnion> {
  return mcpTools.map((tool) => {
    const t: ToolUnion = {
      name: tool.id,
      description: tool.description,
      // @ts-ignore no check
      input_schema: tool.inputSchema
    }
    return t
  })
}

export function anthropicToolUseToMcpTool(mcpTools: MCPTool[] | undefined, toolUse: ToolUseBlock): MCPTool | undefined {
  if (!mcpTools) return undefined
  const tool = mcpTools.find((tool) => tool.id === toolUse.name)
  if (!tool) {
    return undefined
  }
  // @ts-ignore ignore type as it it unknow
  tool.inputSchema = toolUse.input
  return tool
}

export function mcpToolsToGeminiTools(mcpTools: MCPTool[] | undefined): geminiTool[] {
  if (!mcpTools || mcpTools.length === 0) {
    // No tools available
    return []
  }
  const functions: FunctionDeclaration[] = []

  for (const tool of mcpTools) {
    const properties = filterPropertieAttributes(tool, true)
    const functionDeclaration: FunctionDeclaration = {
      name: tool.id,
      description: tool.description,
      parameters: {
        type: SchemaType.OBJECT,
        properties:
          Object.keys(properties).length > 0
            ? Object.fromEntries(
                Object.entries(properties).map(([key, value]) => [key, ensureValidSchema(value as Record<string, any>)])
              )
            : {} // Return empty object if no properties, instead of _empty placeholder
      } as FunctionDeclarationSchema
    }
    functions.push(functionDeclaration)
  }
  const tool: geminiTool = {
    functionDeclarations: functions
  }
  // Return empty array if no functions, otherwise return the tool definition
  return functions.length > 0 ? [tool] : []
}

export function geminiFunctionCallToMcpTool(
  mcpTools: MCPTool[] | undefined,
  fcall: FunctionCall | undefined
): MCPTool | undefined {
  if (!fcall) return undefined
  if (!mcpTools) return undefined
  const tool = mcpTools.find((tool) => tool.id === fcall.name)
  if (!tool) {
    return undefined
  }
  // @ts-ignore schema is not a valid property
  tool.inputSchema = fcall.args
  return tool
}

export function upsertMCPToolResponse(
  results: MCPToolResponse[],
  resp: MCPToolResponse,
  onChunk: ({ mcpToolResponse }: ChunkCallbackData) => void
) {
  try {
    for (const ret of results) {
      if (ret.id === resp.id) {
        ret.response = resp.response
        ret.status = resp.status
        return
      }
    }
    results.push(resp)
  } finally {
    onChunk({
      text: '\n',
      mcpToolResponse: results
    })
  }
}

export function filterMCPTools(
  mcpTools: MCPTool[] | undefined,
  enabledServers: MCPServer[] | undefined
): MCPTool[] | undefined {
  if (mcpTools) {
    if (enabledServers) {
      mcpTools = mcpTools.filter((t) => enabledServers.some((m) => m.name === t.serverName))
    } else {
      mcpTools = []
    }
  }
  return mcpTools
}

export function getMcpServerByTool(tool: MCPTool) {
  const servers = store.getState().mcp.servers
  return servers.find((s) => s.id === tool.serverId)
}

export function parseToolUse(content: string, mcpTools: MCPTool[]): MCPToolResponse[] {
  console.log('[parseToolUse] 开始解析工具调用', {
    contentLength: content?.length || 0,
    mcpToolsCount: mcpTools?.length || 0
  })

  if (!content || !mcpTools || mcpTools.length === 0) {
    console.log('[parseToolUse] 无内容或无工具，跳过解析')
    return []
  }

  // 支持三种格式的工具调用
  // 1. 标准格式: <tool_use><name>工具名</name><arguments>参数</arguments></tool_use>
  const standardToolUsePattern =
    /<tool_use>([\s\S]*?)<name>([\s\S]*?)<\/name>([\s\S]*?)<arguments>([\s\S]*?)<\/arguments>([\s\S]*?)<\/tool_use>/g

  // 2. Roo Code格式: <工具名><参数名>参数值</参数名></工具名>
  const rooCodeToolUsePattern = new RegExp(`<(${mcpTools.map((tool) => tool.id).join('|')})>([\\s\\S]*?)<\\/\\1>`, 'g') // Keep escapes needed for RegExp constructor

  // 3. 简化格式: <tool_use>工具ID参数JSON</tool_use>
  const simplifiedToolUsePattern = /<tool_use>\s*([\w\d]+)\s*([\s\S]*?)\s*<\/tool_use>/g // Remove unnecessary escapes: \s, \S, \/

  // 4. Gemini超简化格式: <tool_use>\n工具名\n参数\n</tool_use>
  const geminiSimplifiedToolUsePattern = /<tool_use>\s*\n\s*([\w\d_-]+)\s*\n\s*([\s\S]*?)\s*\n\s*<\/tool_use>/g

  // 5. Gemini无换行简化格式: <tool_use>工具名 参数</tool_use>
  const geminiNoLineBreakPattern = /<tool_use>\s*([\w\d_-]+)\s+([\s\S]*?)\s*<\/tool_use>/g

  // 6. Gemini极简格式: <tool_use>工具名</tool_use>
  const geminiMinimalPattern = /<tool_use>\s*([\w\d_-]+)\s*<\/tool_use>/g

  const tools: MCPToolResponse[] = []
  let idx = 0

  // 处理标准格式
  let match
  while ((match = standardToolUsePattern.exec(content)) !== null) {
    const toolName = match[2].trim()
    const toolArgs = match[4].trim()

    // 尝试解析参数为JSON
    let parsedArgs
    try {
      parsedArgs = JSON.parse(toolArgs)
    } catch (error) {
      // 如果解析失败，使用字符串原样
      parsedArgs = toolArgs
    }

    const mcpTool = mcpTools.find((tool) => tool.id === toolName)
    if (!mcpTool) {
      console.error(`Tool "${toolName}" not found in MCP tools`)
      continue
    }

    // 添加到工具数组
    tools.push({
      id: `${toolName}-${idx++}`, // 每个工具调用的唯一ID
      tool: {
        ...mcpTool,
        inputSchema: parsedArgs
      },
      status: 'pending'
    })
  }

  // 处理Roo Code格式
  while ((match = rooCodeToolUsePattern.exec(content)) !== null) {
    const toolName = match[1].trim()
    const toolContent = match[2].trim()

    // 解析参数
    const params: Record<string, any> = {}
    const paramPattern = /<([\w\d_]+)>([\s\S]*?)<\/\1>/g
    let paramMatch

    while ((paramMatch = paramPattern.exec(toolContent)) !== null) {
      const paramName = paramMatch[1].trim()
      const paramValue = paramMatch[2].trim()
      params[paramName] = paramValue
    }

    const mcpTool = mcpTools.find((tool) => tool.id === toolName)
    if (!mcpTool) {
      console.error(`Tool "${toolName}" not found in MCP tools`)
      continue
    }

    // 添加到工具数组
    tools.push({
      id: `${toolName}-${idx++}`,
      tool: {
        ...mcpTool,
        inputSchema: { type: 'object', title: 'Input', properties: params }
      },
      status: 'pending'
    })
  }

  // 处理简化格式
  while ((match = simplifiedToolUsePattern.exec(content)) !== null) {
    const toolName = match[1].trim()
    const toolArgs = match[2].trim()

    // 尝试解析参数为JSON
    let parsedArgs
    try {
      parsedArgs = JSON.parse(toolArgs)
    } catch (error) {
      // 如果解析失败，使用字符串原样
      parsedArgs = toolArgs
    }

    const mcpTool = mcpTools.find((tool) => tool.id === toolName)
    if (!mcpTool) {
      console.error(`Tool "${toolName}" not found in MCP tools`)
      continue
    }

    // 添加到工具数组
    tools.push({
      id: `${toolName}-${idx++}`,
      tool: {
        ...mcpTool,
        inputSchema: parsedArgs
      },
      status: 'pending'
    })
  }

  // 处理Gemini超简化格式
  while ((match = geminiSimplifiedToolUsePattern.exec(content)) !== null) {
    const toolName = match[1].trim()
    const toolArgs = match[2].trim()

    // 尝试解析参数为JSON
    let parsedArgs
    try {
      parsedArgs = JSON.parse(toolArgs)
    } catch (error) {
      // 如果解析失败，使用字符串原样
      parsedArgs = toolArgs
    }

    const mcpTool = mcpTools.find((tool) => tool.id === toolName)
    if (!mcpTool) {
      console.error(`Tool "${toolName}" not found in MCP tools`)
      continue
    }

    // 添加到工具数组
    tools.push({
      id: `${toolName}-${idx++}`,
      tool: {
        ...mcpTool,
        inputSchema: parsedArgs
      },
      status: 'pending'
    })
  }

  // 处理Gemini无换行简化格式
  while ((match = geminiNoLineBreakPattern.exec(content)) !== null) {
    const toolName = match[1].trim()
    const toolArgs = match[2].trim()

    // 尝试解析参数为JSON
    let parsedArgs
    try {
      parsedArgs = JSON.parse(toolArgs)
    } catch (error) {
      // 如果解析失败，使用字符串原样
      parsedArgs = toolArgs
    }

    const mcpTool = mcpTools.find((tool) => tool.id === toolName)
    if (!mcpTool) {
      console.error(`Tool "${toolName}" not found in MCP tools`)
      continue
    }

    // 添加到工具数组
    tools.push({
      id: `${toolName}-${idx++}`,
      tool: {
        ...mcpTool,
        inputSchema: parsedArgs
      },
      status: 'pending'
    })
  }

  // 处理Gemini极简格式 - 没有参数的情况
  while ((match = geminiMinimalPattern.exec(content)) !== null) {
    const toolName = match[1].trim()
    // 对于没有参数的情况，使用正确的InputSchema格式
    const parsedArgs = {
      type: 'object',
      title: 'Input',
      properties: {}
    }

    const mcpTool = mcpTools.find((tool) => tool.id === toolName)
    if (!mcpTool) {
      console.error(`Tool "${toolName}" not found in MCP tools`)
      continue
    }

    // 添加到工具数组
    tools.push({
      id: `${toolName}-${idx++}`,
      tool: {
        ...mcpTool,
        inputSchema: parsedArgs
      },
      status: 'pending'
    })
  }

  console.log('[parseToolUse] 解析完成，找到工具调用数量:', tools.length)
  return tools
}

// 新增函数：执行工具调用并返回结果，但不转换为消息
export async function executeToolCalls(
  tools: MCPToolResponse[],
  toolResponses: MCPToolResponse[],
  onChunk: ({ mcpToolResponse }: ChunkCallbackData) => void,
  idx: number
): Promise<{ toolId: string; response: MCPCallToolResponse }[]> {
  if (!tools || tools.length === 0) {
    return []
  }

  // 标记所有工具为调用中
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i]
    upsertMCPToolResponse(toolResponses, { id: `${tool.id}-${idx}-${i}`, tool: tool.tool, status: 'invoking' }, onChunk)
  }

  const images: string[] = []
  const toolPromises = tools.map(async (tool, i) => {
    const toolCallResponse = await callMCPTool(tool.tool)
    upsertMCPToolResponse(
      toolResponses,
      { id: `${tool.id}-${idx}-${i}`, tool: tool.tool, status: 'done', response: toolCallResponse },
      onChunk
    )

    for (const content of toolCallResponse.content) {
      if (content.type === 'image' && content.data) {
        images.push(`data:${content.mimeType};base64,${content.data}`)
      }
    }

    onChunk({
      text: '\n',
      generateImage: {
        type: 'base64',
        images: images
      }
    })

    return {
      toolId: tool.tool.id,
      response: toolCallResponse
    }
  })

  return await Promise.all(toolPromises)
}

// 修改后的函数：解析工具调用并执行，然后转换为消息
export async function parseAndCallTools(
  content: string,
  toolResponses: MCPToolResponse[],
  onChunk: CompletionsParams['onChunk'],
  idx: number,
  convertToMessage: (
    toolCallId: string,
    resp: MCPCallToolResponse,
    isVisionModel: boolean
  ) => ChatCompletionMessageParam | MessageParam | Content,
  mcpTools?: MCPTool[],
  isVisionModel: boolean = false
): Promise<(ChatCompletionMessageParam | MessageParam | Content)[]> {
  const toolResults: (ChatCompletionMessageParam | MessageParam | Content)[] = []
  // process tool use
  const tools = parseToolUse(content, mcpTools || [])
  if (!tools || tools.length === 0) {
    return toolResults
  }

  // 执行工具调用
  const toolCallResults = await executeToolCalls(tools, toolResponses, onChunk, idx)

  // 转换工具调用结果为消息
  for (const result of toolCallResults) {
    toolResults.push(convertToMessage(result.toolId, result.response, isVisionModel))
  }

  return toolResults
}

export function mcpToolCallResponseToOpenAIMessage(
  toolCallId: string,
  resp: MCPCallToolResponse,
  isVisionModel: boolean = false
): ChatCompletionMessageParam {
  const message = {
    role: 'user'
  } as ChatCompletionMessageParam

  if (resp.isError) {
    message.content = JSON.stringify(resp.content)
  } else {
    const content: ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: `Here is the result of tool call ${toolCallId}:`
      }
    ]

    if (isVisionModel) {
      for (const item of resp.content) {
        switch (item.type) {
          case 'text':
            content.push({
              type: 'text',
              text: item.text || 'no content'
            })
            break
          case 'image':
            content.push({
              type: 'image_url',
              image_url: {
                url: `data:${item.mimeType};base64,${item.data}`,
                detail: 'auto'
              }
            })
            break
          case 'audio':
            content.push({
              type: 'input_audio',
              input_audio: {
                data: `data:${item.mimeType};base64,${item.data}`,
                format: 'mp3'
              }
            })
            break
          default:
            content.push({
              type: 'text',
              text: `Unsupported type: ${item.type}`
            })
            break
        }
      }
    } else {
      content.push({
        type: 'text',
        text: JSON.stringify(resp.content)
      })
    }

    message.content = content
  }

  return message
}

export function mcpToolCallResponseToAnthropicMessage(
  toolCallId: string,
  resp: MCPCallToolResponse,
  isVisionModel: boolean = false
): MessageParam {
  const message = {
    role: 'user'
  } as MessageParam
  if (resp.isError) {
    message.content = JSON.stringify(resp.content)
  } else {
    const content: ContentBlockParam[] = [
      {
        type: 'text',
        text: `Here is the result of tool call ${toolCallId}:`
      }
    ]
    if (isVisionModel) {
      for (const item of resp.content) {
        switch (item.type) {
          case 'text':
            content.push({
              type: 'text',
              text: item.text || 'no content'
            })
            break
          case 'image':
            if (
              item.mimeType === 'image/png' ||
              item.mimeType === 'image/jpeg' ||
              item.mimeType === 'image/webp' ||
              item.mimeType === 'image/gif'
            ) {
              content.push({
                type: 'image',
                source: {
                  type: 'base64',
                  data: `data:${item.mimeType};base64,${item.data}`,
                  media_type: item.mimeType
                }
              })
            } else {
              content.push({
                type: 'text',
                text: `Unsupported image type: ${item.mimeType}`
              })
            }
            break
          default:
            content.push({
              type: 'text',
              text: `Unsupported type: ${item.type}`
            })
            break
        }
      }
    } else {
      content.push({
        type: 'text',
        text: JSON.stringify(resp.content)
      })
    }
    message.content = content
  }

  return message // This function seems unused in the new flow, keeping for potential reference
}

/**
 * Converts the response from an MCP tool call into a Gemini Part object
 * suitable for sending back to the model as a function response.
 * @param toolCallName The name/ID of the function that was called.
 * @param resp The response object from the MCP tool call.
 * @returns A Gemini Part object containing the function response.
 */
export function mcpToolCallResponseToGeminiFunctionResponsePart(toolCallName: string, resp: MCPCallToolResponse): Part {
  // Serialize the response content.
  // Join text parts, stringify others. Handle potential errors.
  const responseContent = resp.content
    .map((item) => {
      if (item.type === 'text') return item.text
      try {
        return JSON.stringify(item) // Fallback for non-text parts
      } catch (e) {
        console.error('Error stringifying tool response part:', item, e)
        return `[Error serializing ${item.type} part]`
      }
    })
    .join('\n')

  return {
    functionResponse: {
      name: toolCallName,
      response: {
        // Pass the serialized content. Add error prefix if needed.
        content: resp.isError ? `Error: ${responseContent}` : responseContent || '(empty response)'
      }
    }
  }
}
