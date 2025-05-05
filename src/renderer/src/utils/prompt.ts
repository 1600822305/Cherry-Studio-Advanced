import store from '@renderer/store'
import { MCPTool } from '@renderer/types'

export const SYSTEM_PROMPT = `In this environment you have access to a set of tools you can use to answer the user's question. \
You can use one tool per message, and will receive the result of that tool use in the user's response. You use tools step-by-step to accomplish a given task, with each tool use informed by the result of the previous tool use.

## Tool Use Formatting

Tool use is formatted using XML-style tags. The tool name is enclosed in opening and closing tags, and each parameter is similarly enclosed within its own set of tags. Here's the structure:

<tool_use>
  <name>{tool_name}</name>
  <arguments>{json_arguments}</arguments>
</tool_use>

The tool name should be the exact name of the tool you are using, and the arguments should be a JSON object containing the parameters required by that tool. For example:
<tool_use>
  <name>python_interpreter</name>
  <arguments>{"code": "5 + 3 + 1294.678"}</arguments>
</tool_use>

The user will respond with the result of the tool use, which should be formatted as follows:

<tool_use_result>
  <name>{tool_name}</name>
  <result>{result}</result>
</tool_use_result>

The result should be a string, which can represent a file or any other output type. You can use this result as input for the next action.
For example, if the result of the tool use is an image file, you can use it in the next action like this:

<tool_use>
  <name>image_transformer</name>
  <arguments>{"image": "image_1.jpg"}</arguments>
</tool_use>

Always adhere to this format for the tool use to ensure proper parsing and execution.

## Tool Use Examples
{{ TOOL_USE_EXAMPLES }}

## Tool Use Available Tools
Above example were using notional tools that might not exist for you. You only have access to these tools:
{{ AVAILABLE_TOOLS }}

## Tool Use Rules
Here are the rules you should always follow to solve your task:
1. Always use the right arguments for the tools. Never use variable names as the action arguments, use the value instead.
2. Call a tool only when needed: do not call the search agent if you do not need information, try to solve the task yourself.
3. If no tool call is needed, just answer the question directly.
4. Never re-do a tool call that you previously did with the exact same parameters.
5. For tool use, MARK SURE use XML tag format as shown in the examples above. Do not use any other format.

# User Instructions
{{ USER_SYSTEM_PROMPT }}

Now Begin! If you solve the task correctly, you will receive a reward of $1,000,000.
`

export const ToolUseExamples = `
Here are a few examples using notional tools:
---
User: Generate an image of the oldest person in this document.

Assistant: I can use the document_qa tool to find out who the oldest person is in the document.
<tool_use>
  <name>document_qa</name>
  <arguments>{"document": "document.pdf", "question": "Who is the oldest person mentioned?"}</arguments>
</tool_use>

User: <tool_use_result>
  <name>document_qa</name>
  <result>John Doe, a 55 year old lumberjack living in Newfoundland.</result>
</tool_use_result>

Assistant: I can use the image_generator tool to create a portrait of John Doe.
<tool_use>
  <name>image_generator</name>
  <arguments>{"prompt": "A portrait of John Doe, a 55-year-old man living in Canada."}</arguments>
</tool_use>

User: <tool_use_result>
  <name>image_generator</name>
  <result>image.png</result>
</tool_use_result>

Assistant: the image is generated as image.png

---
User: "What is the result of the following operation: 5 + 3 + 1294.678?"

Assistant: I can use the python_interpreter tool to calculate the result of the operation.
<tool_use>
  <name>python_interpreter</name>
  <arguments>{"code": "5 + 3 + 1294.678"}</arguments>
</tool_use>

User: <tool_use_result>
  <name>python_interpreter</name>
  <result>1302.678</result>
</tool_use_result>

Assistant: The result of the operation is 1302.678.

---
User: "Which city has the highest population , Guangzhou or Shanghai?"

Assistant: I can use the search tool to find the population of Guangzhou.
<tool_use>
  <name>search</name>
  <arguments>{"query": "Population Guangzhou"}</arguments>
</tool_use>

User: <tool_use_result>
  <name>search</name>
  <result>Guangzhou has a population of 15 million inhabitants as of 2021.</result>
</tool_use_result>

Assistant: I can use the search tool to find the population of Shanghai.
<tool_use>
  <name>search</name>
  <arguments>{"query": "Population Shanghai"}</arguments>
</tool_use>

User: <tool_use_result>
  <name>search</name>
  <result>26 million (2019)</result>
</tool_use_result>
Assistant: The population of Shanghai is 26 million, while Guangzhou has a population of 15 million. Therefore, Shanghai has the highest population.
`

export const AvailableTools = (tools: MCPTool[]) => {
  const availableTools = tools
    .map((tool) => {
      return `
<tool>
  <name>${tool.id}</name>
  <description>${tool.description}</description>
  <arguments>
    ${tool.inputSchema ? JSON.stringify(tool.inputSchema) : ''}
  </arguments>
</tool>
`
    })
    .join('\n')
  return `<tools>
${availableTools}
</tools>`
}

import { applyMemoriesToPrompt } from '@renderer/services/MemoryService'
import { MCPServer } from '@renderer/types'

import { getRememberedMemories } from './remember-utils'
// 添加强化工具使用的提示词
export const GEMINI_TOOL_PROMPT = `
你有权限使用一系列工具来帮助回答用户的问题。请严格遵守以下指导：

1. 必须主动使用工具：当用户请求信息或操作时，你必须立即主动使用相关工具，而不是等待用户提示。不要先回复"我可以帮你查看"等语句，直接调用工具获取信息。

2. 工具使用场景（必须立即执行）：
   - 用户询问文件、目录或工作区相关信息时，立即使用 workspace_list_files 工具
   - 用户要查看文件内容时，立即使用 workspace_read_file 工具
   - 用户要创建或修改文件时，立即使用 workspace_create_file 或 workspace_write_file 工具
   - 用户要搜索文件时，立即使用 workspace_search_files 工具
   - 用户需要当前时间时，立即使用 get_current_time 工具
   - 用户需要浏览器相关功能时，使用相应的浏览器工具

3. 直接调用原则：当用户请求信息时，不要先解释你将要做什么，直接调用工具并展示结果。例如，当用户请求"查看工作区文件"时，直接调用 workspace_list_files 工具。

4. 不要等待用户确认：当用户请求信息时，不要等待用户确认或提示就直接调用工具。用户已经默认同意你使用工具。

5. 连续工具调用：如果需要多个工具才能完成任务，请连续调用工具，不要中断询问用户。
`

// 创建一个统一的系统提示词模板，适用于所有模型的提示词调用模式
export const SYSTEM_PROMPT_UNIFIED = `
你是一个能够使用工具的AI助手。你可以通过XML格式的标签调用工具来完成用户请求。

当需要使用工具时，请按照以下格式：
<tool_use>
  <n>工具名称</n>
  <arguments>{"参数1":"值1","参数2":"值2"}</arguments>
</tool_use>

工具调用示例：
{{ TOOL_USE_EXAMPLES }}

可用的工具列表：
{{ AVAILABLE_TOOLS }}

使用工具的指导原则：
1. 主动使用工具：当用户请求需要工具帮助的信息时，直接使用相应工具。
2. 清晰表达意图：先简短说明你将使用什么工具做什么，再调用工具。
3. 连续工具调用：如需要多个工具完成任务，可以连续调用。
4. 解释工具结果：工具返回结果后，简洁地解释结果含义。

{{ USER_SYSTEM_PROMPT }}
`

export const buildSystemPrompt = async (
  userSystemPrompt: string,
  tools: MCPTool[],
  mcpServers: MCPServer[] = []
): Promise<string> => {
  // 获取MCP记忆
  let mcpMemoriesPrompt = ''
  try {
    mcpMemoriesPrompt = await getRememberedMemories(mcpServers)
  } catch (error) {
    console.error('Error getting MCP memories:', error)
  }

  // 获取内置记忆
  let appMemoriesPrompt = ''
  try {
    // 应用内置记忆功能
    console.log('[Prompt] Applying app memories to prompt')
    // 直接将用户系统提示词传递给 applyMemoriesToPrompt，让它添加记忆
    appMemoriesPrompt = await applyMemoriesToPrompt(userSystemPrompt)
    console.log('[Prompt] App memories prompt length:', appMemoriesPrompt.length - userSystemPrompt.length)
  } catch (error) {
    console.error('Error applying app memories:', error)
    // 如果应用 Redux 记忆失败，至少保留原始用户提示
    appMemoriesPrompt = userSystemPrompt
  }

  // 添加记忆工具的使用说明
  // 合并所有提示词
  // 注意：appMemoriesPrompt 已经包含 userSystemPrompt，所以不需要再次添加
  // 合并 app 记忆（已包含 user prompt）和 mcp 记忆
  const enhancedPrompt = appMemoriesPrompt + (mcpMemoriesPrompt ? `\n\n${mcpMemoriesPrompt}` : '')

  let finalPrompt: string
  // 检查是否有工具可用
  if (tools && tools.length > 0) {
    // 根据provider类型获取相应的设置
    const callStack = new Error().stack || ''
    const isOpenAIProvider = callStack.includes('OpenAIProvider')
    const isGeminiProvider = callStack.includes('GeminiProvider')

    // 获取对应提供商的提示词调用设置
    let usePromptForToolCalling = false
    if (isOpenAIProvider) {
      usePromptForToolCalling = store.getState().settings.useOpenAIPromptForToolCalling
    } else if (isGeminiProvider) {
      usePromptForToolCalling = store.getState().settings.useGeminiPromptForToolCalling
    } else {
      // 兼容旧版设置
      usePromptForToolCalling = store.getState().settings.usePromptForToolCalling
    }

    console.log('[Prompt] Building prompt for tools:', {
      promptLength: enhancedPrompt.length,
      usePromptForToolCalling,
      isOpenAIProvider,
      isGeminiProvider
    })

    if (isOpenAIProvider && usePromptForToolCalling) {
      // 对于OpenAI，使用统一的提示词模板
      const openAIToolPrompt = SYSTEM_PROMPT_UNIFIED.replace('{{ TOOL_USE_EXAMPLES }}', ToolUseExamples)
        .replace('{{ AVAILABLE_TOOLS }}', AvailableTools(tools))
        .replace('{{ USER_SYSTEM_PROMPT }}', enhancedPrompt)

      console.log('[Prompt] Using unified tool prompt for OpenAI')
      finalPrompt = openAIToolPrompt
    } else if (isGeminiProvider && usePromptForToolCalling) {
      // 对于Gemini，使用相同的统一提示词模板
      const geminiToolPrompt = SYSTEM_PROMPT_UNIFIED.replace('{{ TOOL_USE_EXAMPLES }}', ToolUseExamples)
        .replace('{{ AVAILABLE_TOOLS }}', AvailableTools(tools))
        .replace('{{ USER_SYSTEM_PROMPT }}', enhancedPrompt)

      console.log('[Prompt] Using unified tool prompt for Gemini')
      finalPrompt = geminiToolPrompt
    } else {
      // 默认情况，直接使用增强的提示词
      finalPrompt = enhancedPrompt
    }
  } else {
    console.log('[Prompt] Building prompt without tools:', {
      promptLength: enhancedPrompt.length
    })
    // 如果没有工具，直接使用增强的提示词
    finalPrompt = enhancedPrompt
  }
  // Single return point for the function
  return finalPrompt
} // Closing brace for the buildSystemPrompt function moved here
