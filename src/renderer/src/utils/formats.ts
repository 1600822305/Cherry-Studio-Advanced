import { isReasoningModel } from '@renderer/config/models'
import { getAssistantById } from '@renderer/services/AssistantService'
import { Message } from '@renderer/types'

export function escapeDollarNumber(text: string) {
  let escapedText = ''

  for (let i = 0; i < text.length; i += 1) {
    let char = text[i]
    const nextChar = text[i + 1] || ' '

    if (char === '$' && nextChar >= '0' && nextChar <= '9') {
      char = '\\$'
    }

    escapedText += char
  }

  return escapedText
}

export function escapeBrackets(text: string) {
  if (!text) return ''

  const pattern = /(```[\s\S]*?```|`.*?`)|\\\[([\s\S]*?[^\\])\\\]|\\\((.*?)\\\)/g
  return text.replace(pattern, (match, codeBlock, squareBracket, roundBracket) => {
    if (codeBlock) {
      return codeBlock
    } else if (squareBracket) {
      return `
$$
${squareBracket}
$$
`
    } else if (roundBracket) {
      return `$${roundBracket}$`
    }
    return match
  })
}

export function extractTitle(html: string): string | null {
  const titleRegex = /<title>(.*?)<\/title>/i
  const match = html.match(titleRegex)

  if (match && match[1]) {
    return match[1].trim()
  }

  return null
}

export function removeSvgEmptyLines(text: string): string {
  // 用正则表达式匹配 <svg> 标签内的内容
  const svgPattern = /(<svg[\s\S]*?<\/svg>)/g

  return text.replace(svgPattern, (svgMatch) => {
    // 将 SVG 内容按行分割,过滤掉空行,然后重新组合
    return svgMatch
      .split('\n')
      .filter((line) => line.trim() !== '')
      .join('\n')
  })
}

export function withGeminiGrounding(message: Message) {
  // 检查消息内容是否为空或未定义
  if (message.content === undefined) {
    return ''
  }

  const { groundingSupports } = message?.metadata?.groundingMetadata || {}

  if (!groundingSupports) {
    return message.content
  }

  let content = message.content

  groundingSupports.forEach((support) => {
    const text = support?.segment
    const indices = support?.groundingChunckIndices

    if (!text || !indices) return

    const nodes = indices.reduce<string[]>((acc, index) => {
      acc.push(`<sup>${index + 1}</sup>`)
      return acc
    }, [])

    content = content.replace(text, `${text} ${nodes.join(' ')}`)
  })

  return content
}

interface ThoughtProcessor {
  canProcess: (content: string, message?: Message) => boolean
  process: (content: string) => { reasoning: string; content: string }
}

const glmZeroPreviewProcessor: ThoughtProcessor = {
  canProcess: (content: string, message?: Message) => {
    if (!message) return false

    const modelId = message.modelId || ''
    const modelName = message.model?.name || ''
    const isGLMZeroPreview =
      modelId.toLowerCase().includes('glm-zero-preview') || modelName.toLowerCase().includes('glm-zero-preview')

    // 更严格的检测标准，要求同时满足模型类型和特定的格式标记
    const hasThinkingMarker = 
      /^###\s*Thinking/m.test(content) || 
      /^###\s*思考/m.test(content) || 
      (content.includes('###Thinking') && content.includes('###Response')) ||
      (content.includes('### Thinking') && content.includes('### Response')) ||
      (content.includes('###思考') && content.includes('###回应'));
      
    return isGLMZeroPreview && hasThinkingMarker;
  },
  process: (content: string) => {
    // 支持多种分隔符格式
    const separators = ['###', '### ']
    let parts: string[] = []

    // 尝试使用不同的分隔符分割内容
    for (const separator of separators) {
      if (content.includes(separator)) {
        parts = content.split(separator)
        break
      }
    }

    if (parts.length === 0) {
      parts = content.split('###') // 默认分隔符
    }

    // 支持英文和中文的思考和回应标记
    const thinkingKeywords = ['Thinking', '思考', '推理']
    const responseKeywords = ['Response', '回应', '回复', '回答']

    // 查找思考部分
    let thinkingMatch: string | undefined = undefined
    for (const keyword of thinkingKeywords) {
      const match = parts.find((part) => part && typeof part === 'string' && part.trim().startsWith(keyword))
      if (match) {
        thinkingMatch = match
        break
      }
    }

    // 查找回应部分
    let responseMatch: string | undefined = undefined
    for (const keyword of responseKeywords) {
      const match = parts.find((part) => part && typeof part === 'string' && part.trim().startsWith(keyword))
      if (match) {
        responseMatch = match
        break
      }
    }

    // 提取思考内容和回应内容
    let reasoning = ''
    if (thinkingMatch) {
      // 移除开头的关键词
      for (const keyword of thinkingKeywords) {
        if (thinkingMatch.trim().startsWith(keyword)) {
          reasoning = thinkingMatch.replace(keyword, '').trim()
          break
        }
      }
    }

    let finalContent = ''
    if (responseMatch) {
      // 移除开头的关键词
      for (const keyword of responseKeywords) {
        if (responseMatch.trim().startsWith(keyword)) {
          finalContent = responseMatch.replace(keyword, '').trim()
          break
        }
      }
    }

    return {
      reasoning: reasoning,
      content: finalContent || content // 如果没有找到回应部分，返回原始内容
    }
  }
}

const thinkTagProcessor: ThoughtProcessor = {
  canProcess: (content: string, message?: Message) => {
    if (!message) return false

    // 更严格地检测真正的思考过程标签
    // 1. 检查是否包含明确的思考标签
    const hasThinkTag = 
      /<think>|<thinking>|<thoughts>|<thought>|<reasoning>|<reason>|<analysis>|<reflection>/i.test(content) ||
      /<\/think>|<\/thinking>|<\/thoughts>|<\/thought>|<\/reasoning>|<\/reason>|<\/analysis>|<\/reflection>/i.test(content);
      
    // 2. 检查是否包含明确的思考过程标记
    const hasThinkLabel = 
      /^思考过程[:：]/m.test(content) ||
      /^推理过程[:：]/m.test(content) ||
      /^思考[:：]/m.test(content) ||
      /^分析[:：]/m.test(content) ||
      /^Thinking[:：]/m.test(content) ||
      /^Reasoning[:：]/m.test(content) ||
      /^Analysis[:：]/m.test(content);
      
    // 3. 排除常见误判情况
    const isLikelyMathContent = 
      (content.includes('$a_') && content.includes('\\cdot')) ||
      (content.includes('题目') && content.includes('解答'));
      
    return (hasThinkTag || hasThinkLabel) && !isLikelyMathContent;
  },
  process: (content: string) => {
    // 1. 处理正常闭合的 think 标签 - 支持多行匹配
    const thinkPatterns = [
      /<think>([\s\S]*?)<\/think>/,
      /<thinking>([\s\S]*?)<\/thinking>/,
      /<thoughts>([\s\S]*?)<\/thoughts>/,
      /<thought>([\s\S]*?)<\/thought>/,
      /<reasoning>([\s\S]*?)<\/reasoning>/,
      /<reason>([\s\S]*?)<\/reason>/,
      /<analysis>([\s\S]*?)<\/analysis>/,
      /<reflection>([\s\S]*?)<\/reflection>/
    ]

    // 尝试匹配所有支持的标签格式
    for (const pattern of thinkPatterns) {
      const matches = content.match(pattern)
      if (matches) {
        return {
          reasoning: matches[1].trim(),
          content: content.replace(pattern, '').trim()
        }
      }
    }

    // 2. 处理只有结束标签的情况
    const endTags = [
      '</think>',
      '</thinking>',
      '</thoughts>',
      '</thought>',
      '</reasoning>',
      '</reason>',
      '</analysis>',
      '</reflection>'
    ]
    for (const endTag of endTags) {
      if (content.includes(endTag)) {
        const parts = content.split(endTag)
        return {
          reasoning: parts[0].trim(),
          content: parts.slice(1).join(endTag).trim()
        }
      }
    }

    // 3. 处理只有开始标签的情况
    const startTags = [
      '<think>',
      '<thinking>',
      '<thoughts>',
      '<thought>',
      '<reasoning>',
      '<reason>',
      '<analysis>',
      '<reflection>'
    ]
    for (const startTag of startTags) {
      if (content.includes(startTag)) {
        const parts = content.split(startTag)
        if (parts.length > 1) {
          return {
            reasoning: parts[1].trim(), // 跳过标签前的内容
            content: parts[0].trim()
          }
        }
      }
    }

    // 4. 处理各种中文思考过程标记格式
    const thinkingLabelPatterns = [
      /(思考过程[:：])([\s\S]*?)(?=\n\n|$)/,
      /(推理过程[:：])([\s\S]*?)(?=\n\n|$)/,
      /(思考[:：])([\s\S]*?)(?=\n\n|$)/,
      /(分析[:：])([\s\S]*?)(?=\n\n|$)/,
      /(推理[:：])([\s\S]*?)(?=\n\n|$)/,
      /(分析思考[:：])([\s\S]*?)(?=\n\n|$)/,
      /(思路[:：])([\s\S]*?)(?=\n\n|$)/
    ]

    // 尝试匹配所有支持的中文标记格式
    for (const pattern of thinkingLabelPatterns) {
      const matches = content.match(pattern)
      if (matches) {
        return {
          reasoning: matches[2].trim(),
          content: content.replace(pattern, '').trim()
        }
      }
    }

    // 5. 处理英文思考过程标记格式
    const englishLabelPatterns = [
      /(Thinking[:：])([\s\S]*?)(?=\n\n|$)/,
      /(Reasoning[:：])([\s\S]*?)(?=\n\n|$)/,
      /(Analysis[:：])([\s\S]*?)(?=\n\n|$)/,
      /(Thought Process[:：])([\s\S]*?)(?=\n\n|$)/,
      /(Thoughts[:：])([\s\S]*?)(?=\n\n|$)/,
      /(Let me think[:：])([\s\S]*?)(?=\n\n|$)/
    ]

    // 尝试匹配所有支持的英文标记格式
    for (const pattern of englishLabelPatterns) {
      const matches = content.match(pattern)
      if (matches) {
        return {
          reasoning: matches[2].trim(),
          content: content.replace(pattern, '').trim()
        }
      }
    }

    // 6. 处理Markdown格式的思考过程
    const markdownPatterns = [
      /```思考\n([\s\S]*?)```/,
      /```thinking\n([\s\S]*?)```/,
      /```thoughts\n([\s\S]*?)```/,
      /```reasoning\n([\s\S]*?)```/,
      /```analysis\n([\s\S]*?)```/
    ]

    // 尝试匹配所有支持的Markdown格式
    for (const pattern of markdownPatterns) {
      const matches = content.match(pattern)
      if (matches) {
        return {
          reasoning: matches[1].trim(),
          content: content.replace(pattern, '').trim()
        }
      }
    }

    // 7. 处理特殊分隔符格式
    const separatorPatterns = [
      /###\s*思考\s*###([\s\S]*?)(?=###|$)/,
      /###\s*Thinking\s*###([\s\S]*?)(?=###|$)/,
      /===\s*思考\s*===([\s\S]*?)(?====|$)/,
      /===\s*Thinking\s*===([\s\S]*?)(?====|$)/,
      /\*\*\*\s*思考\s*\*\*\*([\s\S]*?)(?=\*\*\*|$)/,
      /\*\*\*\s*Thinking\s*\*\*\*([\s\S]*?)(?=\*\*\*|$)/
    ]

    // 尝试匹配所有支持的分隔符格式
    for (const pattern of separatorPatterns) {
      const matches = content.match(pattern)
      if (matches) {
        return {
          reasoning: matches[1].trim(),
          content: content.replace(pattern, '').trim()
        }
      }
    }

    // 8. 处理JSON格式的思考内容
    try {
      // 尝试查找JSON格式的思考标签 - 更健壮的正则表达式
      const jsonPattern = /(\{\s*["'](?:thinking|thought|reasoning|thoughts|analysis|reflection)["']\s*:[\s\S]*?\})/gi

      const matches = content.match(jsonPattern)
      if (matches && matches.length > 0) {
        // 遍历所有匹配项
        for (const jsonString of matches) {
          try {
            const jsonObj = JSON.parse(jsonString)
            // 尝试从多个可能的键中提取思考内容
            const keys = ['thinking', 'thought', 'reasoning', 'thoughts', 'analysis', 'reflection']
            for (const key of keys) {
              if (jsonObj[key]) {
                return {
                  reasoning: jsonObj[key].trim(),
                  content: content.replace(jsonString, '').trim()
                }
              }
            }
          } catch (err) {
            console.log('[thinkTagProcessor] JSON解析错误:', err)
            // 尝试修复常见的JSON格式问题
            try {
              // 处理单引号替换为双引号
              const fixedJsonString = jsonString.replace(/'/g, '"')
              const jsonObj = JSON.parse(fixedJsonString)

              const keys = ['thinking', 'thought', 'reasoning', 'thoughts', 'analysis', 'reflection']
              for (const key of keys) {
                if (jsonObj[key]) {
                  return {
                    reasoning: jsonObj[key].trim(),
                    content: content.replace(jsonString, '').trim()
                  }
                }
              }
            } catch (fixError) {
              console.log('[thinkTagProcessor] 修复JSON失败:', fixError)
            }
          }
        }
      }
    } catch (error) {
      console.log('[thinkTagProcessor] 处理JSON格式思考标签时出错:', error)
    }

    // 如果没有找到任何匹配，返回原始内容
    return {
      reasoning: '',
      content
    }
  }
}

// 添加一个新的处理器，专门处理OpenAI格式的JSON流式输出
const openaiJsonProcessor: ThoughtProcessor = {
  canProcess: (content: string, message?: Message) => {
    if (!message) return false

    // 使用更严格的条件检查是否包含OpenAI格式的JSON流式输出特征
    const containsOpenAIJsonHeader = 
      /^data: \{"id":"chatcmpl-/m.test(content) || 
      /^data: \{"id":.*?"model":/m.test(content);
    
    // 检查是否包含标准OpenAI流式响应格式
    const containsOpenAIStreamFormat = 
      /data:\s*\{.*?"choices":\s*\[\{.*?"delta":\s*\{.*?"content":/i.test(content) &&
      /^data:/m.test(content);
    
    // 添加明确的排除条件，避免误判普通HTML或Markdown内容
    const isLikelyNormalContent = 
      (content.includes('<p>') && content.includes('</p>')) || 
      (content.includes('#') && content.includes('```')) ||
      (content.includes('|') && content.includes('---') && content.includes('|'));
      
    return (containsOpenAIJsonHeader || containsOpenAIStreamFormat) && !isLikelyNormalContent;
  },
  process: (content: string) => {
    try {
      // 特殊处理您提供的示例格式
      // 这种格式的特点是分块在多个data行中，且包含think标签
      if (/data:.*?"delta":\s*\{"content":\s*"<think>.*?\}/i.test(content)) {
        // 提取所有内容行
        const contentLines: string[] = []
        const dataLines = content.split('\n')
        let hasThinkOpen = false
        let hasThinkClose = false
        let reasoning = ''
        let normalContent = ''
        let collectingThink = false

        for (const line of dataLines) {
          if (!line.trim() || line === 'data: [DONE]') continue

          if (line.includes('"content":')) {
            // 提取content部分
            const contentMatch = line.match(/"content":\s*"(.*?)(?:"|,$)/)
            if (contentMatch && contentMatch[1]) {
              const contentChunk = contentMatch[1]
                .replace(/\\"/g, '"')
                .replace(/\\n/g, '\n')
                .replace(/\\t/g, '\t')
                .replace(/\\r/g, '')

              contentLines.push(contentChunk)

              // 跟踪思考标签的开始和结束
              if (contentChunk.includes('<think>')) {
                hasThinkOpen = true
                collectingThink = true
                // 处理可能同时包含起始标签和内容的情况
                const parts = contentChunk.split('<think>')
                if (parts.length > 1) {
                  normalContent += parts[0]
                  reasoning += parts[1]
                }
              } else if (contentChunk.includes('</think>')) {
                hasThinkClose = true
                collectingThink = false
                // 处理可能同时包含结束标签和内容的情况
                const parts = contentChunk.split('</think>')
                if (parts.length > 1) {
                  reasoning += parts[0]
                  normalContent += parts[1]
                }
              } else if (collectingThink) {
                reasoning += contentChunk
              } else {
                normalContent += contentChunk
              }
            }
          }
        }

        // 如果找到了完整的思考过程
        if (hasThinkOpen && hasThinkClose && reasoning) {
          console.log('[openaiJsonProcessor] 成功提取流式思考过程:', reasoning.substring(0, 50))
          return {
            reasoning: reasoning.trim(),
            content: normalContent.trim()
          }
        }

        // 组合所有内容,尝试正则提取法
        const combinedContent = contentLines.join('')

        // 如果包含完整的think标签
        if (hasThinkOpen && hasThinkClose) {
          const thinkMatch = combinedContent.match(/<think>([\s\S]*?)<\/think>/i)
          if (thinkMatch) {
            return {
              reasoning: thinkMatch[1].trim(),
              content: combinedContent.replace(/<think>[\s\S]*?<\/think>/i, '').trim()
            }
          }
        }
        // 如果只有开始标签
        else if (hasThinkOpen && !hasThinkClose) {
          const parts = combinedContent.split(/<think>/i)
          if (parts.length > 1) {
            return {
              reasoning: parts[1].trim(),
              content: parts[0].trim()
            }
          }
        }

        // 记录内容中的标签信息便于调试
        console.log('[openaiJsonProcessor] 流式处理状态:', {
          hasThinkOpen,
          hasThinkClose,
          contentLength: combinedContent.length,
          sampleContent: combinedContent.substring(0, 100)
        })
      }

      // 分割行并提取JSON内容
      const jsonLines = content.split('\n')
      let combinedText = ''
      let fullContent = ''

      for (const line of jsonLines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const jsonStr = line.substring(6)
            const jsonData = JSON.parse(jsonStr)

            if (
              jsonData.choices &&
              jsonData.choices[0] &&
              jsonData.choices[0].delta &&
              jsonData.choices[0].delta.content
            ) {
              const chunkContent = jsonData.choices[0].delta.content
              combinedText += chunkContent
              fullContent += chunkContent
            }
          } catch (e) {
            // 忽略JSON解析错误
            console.log('[openaiJsonProcessor] JSON解析错误，跳过此行:', e)
          }
        }
      }

      // 如果成功提取了文本，处理思考过程
      if (combinedText) {
        // 检查是否是完整的思考过程（有开始和结束标签）
        const hasOpenTag = /<think>|<thinking>|<thoughts>|<thought>|<reasoning>|<reason>|<analysis>|<reflection>/i.test(
          combinedText
        )
        const hasCloseTag =
          /<\/think>|<\/thinking>|<\/thoughts>|<\/thought>|<\/reasoning>|<\/reason>|<\/analysis>|<\/reflection>/i.test(
            combinedText
          )

        // 完整的思考标签处理
        if (hasOpenTag && hasCloseTag) {
          // 使用与 thinkTagProcessor 相同的处理逻辑来提取思考过程
          // 处理正常闭合的 think 标签 - 支持多行匹配
          const thinkPatterns = [
            /<think>([\s\S]*?)<\/think>/i,
            /<thinking>([\s\S]*?)<\/thinking>/i,
            /<thoughts>([\s\S]*?)<\/thoughts>/i,
            /<thought>([\s\S]*?)<\/thought>/i,
            /<reasoning>([\s\S]*?)<\/reasoning>/i,
            /<reason>([\s\S]*?)<\/reason>/i,
            /<analysis>([\s\S]*?)<\/analysis>/i,
            /<reflection>([\s\S]*?)<\/reflection>/i
          ]

          // 尝试匹配所有支持的标签格式
          for (const pattern of thinkPatterns) {
            const matches = combinedText.match(pattern)
            if (matches) {
              // 完全移除思考标签及其内容，确保不会在内容中重复显示
              const tagRegex = new RegExp(pattern.source, 'gi')
              return {
                reasoning: matches[1].trim(),
                content: combinedText.replace(tagRegex, '').trim()
              }
            }
          }
        }
        // 只有开始标签，没有结束标签的情况（所有内容都视为思考）
        else if (hasOpenTag && !hasCloseTag) {
          const startTags = [
            '<think>',
            '<thinking>',
            '<thoughts>',
            '<thought>',
            '<reasoning>',
            '<reason>',
            '<analysis>',
            '<reflection>'
          ]

          for (const startTag of startTags) {
            if (combinedText.toLowerCase().includes(startTag.toLowerCase())) {
              const parts = combinedText.split(new RegExp(startTag, 'i'))
              if (parts.length > 1) {
                return {
                  reasoning: parts.slice(1).join('').trim(),
                  content: parts[0].trim()
                }
              }
            }
          }
        }
        // 只有结束标签，没有开始标签的情况（所有内容都视为思考）
        else if (!hasOpenTag && hasCloseTag) {
          const endTags = [
            '</think>',
            '</thinking>',
            '</thoughts>',
            '</thought>',
            '</reasoning>',
            '</reason>',
            '</analysis>',
            '</reflection>'
          ]

          for (const endTag of endTags) {
            if (combinedText.toLowerCase().includes(endTag.toLowerCase())) {
              const parts = combinedText.split(new RegExp(endTag, 'i'))
              return {
                reasoning: parts[0].trim(),
                content: parts.slice(1).join('').trim()
              }
            }
          }
        }

        // 检查JSON中是否有完整标签（例如JSON delta中的<think>和</think>）
        try {
          // 使用更灵活的方式来查找JSON中的标签
          if (fullContent.includes('<think>') || fullContent.includes('&lt;think&gt;')) {
            const processedContent = fullContent.replace(/&lt;/g, '<').replace(/&gt;/g, '>')

            const thinkMatches = processedContent.match(/<think>([\s\S]*?)<\/think>/i)
            if (thinkMatches) {
              return {
                reasoning: thinkMatches[1].trim(),
                content: processedContent.replace(/<think>[\s\S]*?<\/think>/i, '').trim()
              }
            }
          }

          // 检查流式输出中的JSON思考格式
          // 例如：{"content": "<think>思考内容</think>"}
          const combinedJsonData = fullContent.replace(/}{/g, '},{')
          if (
            combinedJsonData.includes('{"thinking":') ||
            combinedJsonData.includes('{"thought":') ||
            combinedJsonData.includes('"content": "<think>')
          ) {
            try {
              // 尝试识别JSON对象中的思考部分
              const jsonPattern = /(\{"thinking":|{"thought":|"content":\s*"<think>)([\s\S]*?)(<\/think>"|"})/gi
              const match = jsonPattern.exec(combinedJsonData)

              if (match && match[2]) {
                // 清理提取的思考内容
                const reasoning = match[2]
                  .replace(/<think>|<\/think>/gi, '')
                  .replace(/^"|"$/g, '')
                  .replace(/\\"/g, '"')
                  .replace(/\\n/g, '\n')
                  .trim()

                return {
                  reasoning: reasoning,
                  content: fullContent.replace(match[0], '').trim()
                }
              }

              // 特别处理流式分块的情况
              if (combinedJsonData.includes('"content": "<think>')) {
                const startIndex = combinedJsonData.indexOf('"content": "<think>') + 13
                const endIndex = combinedJsonData.indexOf('</think>"', startIndex)

                if (startIndex > 13 && endIndex > startIndex) {
                  const reasoning = combinedJsonData.substring(startIndex + 7, endIndex).trim()
                  return {
                    reasoning: reasoning,
                    content: fullContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
                  }
                }
              }
            } catch (err) {
              console.log('[openaiJsonProcessor] 处理JSON思考格式出错:', err)
            }
          }
        } catch (error) {
          console.log('[openaiJsonProcessor] 处理JSON中的标签时出错:', error)
        }

        // 处理各种中文思考过程标记格式
        const thinkingLabelPatterns = [
          /(思考过程[:：])([\s\S]*?)(?=\n\n|$)/,
          /(推理过程[:：])([\s\S]*?)(?=\n\n|$)/,
          /(思考[:：])([\s\S]*?)(?=\n\n|$)/,
          /(分析[:：])([\s\S]*?)(?=\n\n|$)/,
          /(推理[:：])([\s\S]*?)(?=\n\n|$)/,
          /(分析思考[:：])([\s\S]*?)(?=\n\n|$)/,
          /(思路[:：])([\s\S]*?)(?=\n\n|$)/
        ]

        // 尝试匹配所有支持的中文标记格式
        for (const pattern of thinkingLabelPatterns) {
          const matches = combinedText.match(pattern)
          if (matches) {
            // 完全移除思考标记及其内容
            const fullMatch = matches[0]
            return {
              reasoning: matches[2].trim(),
              content: combinedText.replace(fullMatch, '').trim()
            }
          }
        }

        // 处理英文思考过程标记格式
        const englishLabelPatterns = [
          /(Thinking[:：])([\s\S]*?)(?=\n\n|$)/,
          /(Reasoning[:：])([\s\S]*?)(?=\n\n|$)/,
          /(Analysis[:：])([\s\S]*?)(?=\n\n|$)/,
          /(Thought Process[:：])([\s\S]*?)(?=\n\n|$)/,
          /(Thoughts[:：])([\s\S]*?)(?=\n\n|$)/,
          /(Let me think[:：])([\s\S]*?)(?=\n\n|$)/
        ]

        // 尝试匹配所有支持的英文标记格式
        for (const pattern of englishLabelPatterns) {
          const matches = combinedText.match(pattern)
          if (matches) {
            // 完全移除思考标记及其内容
            const fullMatch = matches[0]
            return {
              reasoning: matches[2].trim(),
              content: combinedText.replace(fullMatch, '').trim()
            }
          }
        }

        // 如果没有找到思考标记，返回原始内容
        return {
          reasoning: '',
          content: combinedText
        }
      }
    } catch (error) {
      console.error('[openaiJsonProcessor] 处理OpenAI JSON输出时出错:', error)
    }

    // 如果处理失败，返回原始内容
    return {
      reasoning: '',
      content
    }
  }
}

// 添加一个新的处理器，专门处理JSON格式的思考标签
const jsonThoughtProcessor: ThoughtProcessor = {
  canProcess: (content: string, message?: Message) => {
    if (!message) return false

    // 检查是否包含JSON格式的思考标签 - 更严格的匹配条件
    // 1. 必须是完整的JSON格式，以{开始，以}结束
    // 2. 必须包含thinking/thought/reasoning等关键词作为JSON键
    const strictJsonPattern = /^\s*\{\s*["'](?:thinking|thought|reasoning|thoughts|analysis|reflection)["']\s*:\s*["'][\s\S]*?["']\s*\}\s*$/i
    
    // 多行模式下，识别完整的JSON对象
    const multilineJsonPattern = /\{\s*["'](?:thinking|thought|reasoning|thoughts|analysis|reflection)["']\s*:\s*["'][\s\S]*?["']\s*\}/i
    
    // 只有在内容看起来确实像JSON时才返回true
    return strictJsonPattern.test(content) || 
           (multilineJsonPattern.test(content) && content.includes('{') && content.includes('}'));
  },
  process: (content: string) => {
    try {
      // 尝试查找JSON格式的思考标签 - 更健壮的正则表达式
      const jsonPattern = /(\{\s*["'](?:thinking|thought|reasoning|thoughts|analysis|reflection)["']\s*:[\s\S]*?\})/gi

      const matches = content.match(jsonPattern)
      if (matches && matches.length > 0) {
        // 遍历所有匹配项
        for (const jsonString of matches) {
          try {
            const jsonObj = JSON.parse(jsonString)
            // 尝试从多个可能的键中提取思考内容
            const keys = ['thinking', 'thought', 'reasoning', 'thoughts', 'analysis', 'reflection']
            for (const key of keys) {
              if (jsonObj[key]) {
                return {
                  reasoning: jsonObj[key].trim(),
                  content: content.replace(jsonString, '').trim()
                }
              }
            }
          } catch (err) {
            console.log('[jsonThoughtProcessor] JSON解析错误:', err)
            // 尝试修复常见的JSON格式问题
            try {
              // 处理单引号替换为双引号
              const fixedJsonString = jsonString.replace(/'/g, '"')
              const jsonObj = JSON.parse(fixedJsonString)

              const keys = ['thinking', 'thought', 'reasoning', 'thoughts', 'analysis', 'reflection']
              for (const key of keys) {
                if (jsonObj[key]) {
                  return {
                    reasoning: jsonObj[key].trim(),
                    content: content.replace(jsonString, '').trim()
                  }
                }
              }
            } catch (fixError) {
              console.log('[jsonThoughtProcessor] 修复JSON失败:', fixError)
            }
          }
        }
      }

      // 如果没有找到任何匹配，返回原始内容
      return {
        reasoning: '',
        content
      }
    } catch (error) {
      console.error('[jsonThoughtProcessor] 处理JSON格式思考标签时出错:', error)
      return {
        reasoning: '',
        content
      }
    }
  }
}

export function withMessageThought(message: Message) {
  if (message.role !== 'assistant') {
    return message
  }

  // 检查消息内容是否为空或未定义
  if (message.content === undefined) {
    message.content = ''
    return message
  }

  const model = message.model
  if (!model || !isReasoningModel(model)) return message

  const isClaude37Sonnet = model.id.includes('claude-3-7-sonnet') || model.id.includes('claude-3.7-sonnet')
  if (isClaude37Sonnet) {
    const assistant = getAssistantById(message.assistantId)
    if (!assistant?.settings?.reasoning_effort) return message
  }

  // 获取原始内容并处理
  const originalContent = message.content.trim()
  
  // === 0. 特殊检测：排除明显不是思考过程的内容 ===
  // 排除数学内容
  if (
    (originalContent.includes('$a_') && originalContent.includes('等比数列')) ||
    (originalContent.includes('题目') && originalContent.includes('完全正确')) ||
    (originalContent.includes('你的计算结果') && originalContent.includes('正确'))
  ) {
    return message;
  }
  
  // 排除常见的普通对话内容
  if (
    (originalContent.startsWith('非常棒！') || originalContent.startsWith('很好！')) &&
    originalContent.includes('题目') &&
    !originalContent.includes('<think>') &&
    !originalContent.includes('思考过程：')
  ) {
    return message;
  }

  // === 1. 首先尝试直接提取<think>标签 ===
  const thinkPattern = /<think>([\s\S]*?)<\/think>/i
  const thinkMatch = originalContent.match(thinkPattern)

  if (thinkMatch) {
    // 找到匹配，提取思考内容并清理消息
    const reasoning = thinkMatch[1].trim()
    // 完全移除思考标签及其内容
    const cleanContent = originalContent.replace(thinkPattern, '').trim()

    // 显式设置两个属性
    message.reasoning_content = reasoning
    message.content = cleanContent

    console.log(
      '[withMessageThought] 直接提取到思考过程:',
      reasoning.substring(0, 50) + (reasoning.length > 50 ? '...' : '')
    )

    return message
  }

  // === 2. 如果没有找到直接标签，尝试其他处理器 ===
  const processors: ThoughtProcessor[] = [
    openaiJsonProcessor,
    glmZeroPreviewProcessor,
    jsonThoughtProcessor,
    thinkTagProcessor
  ]

  // 尝试使用所有处理器提取思考过程
  for (const processor of processors) {
    if (processor.canProcess(originalContent, message)) {
      const { reasoning, content: processedContent } = processor.process(originalContent)

      // 只有当成功提取到思考过程时才更新消息
      if (reasoning) {
        // 同时设置两个属性，确保内容不重复
        message.reasoning_content = reasoning
        message.content = processedContent
        console.log('[withMessageThought] 提取到思考过程通过处理器:', processor.constructor?.name)
        break // 一旦找到匹配的处理器并成功提取，就停止处理
      }
    }
  }

  // === 3. 安全检查：确保内容不包含思考标签 ===
  // 如果内容仍然包含思考标签，强制清理
  if (message.content && thinkPattern.test(message.content)) {
    const cleanContent = message.content.replace(thinkPattern, '').trim()
    console.log('[withMessageThought] 强制清理残留的思考标签')
    message.content = cleanContent
  }

  // === 4. 处理可能的片段思考标签 ===
  // 处理可能的不完整标签
  const partialOpenTag = /<think>/i
  const partialCloseTag = /<\/think>/i
  if (message.content && (partialOpenTag.test(message.content) || partialCloseTag.test(message.content))) {
    console.log('[withMessageThought] 发现并清理不完整的思考标签')
    message.content = message.content.replace(partialOpenTag, '').replace(partialCloseTag, '').trim()
  }

  return message
}

export function withGenerateImage(message: Message) {
  // 检查消息内容是否为空或未定义
  if (message.content === undefined) {
    message.content = ''
    return message
  }
  const imagePattern = new RegExp(`!\\[[^\\]]*\\]\\((.*?)\\s*("(?:.*[^"])")?\\s*\\)`)
  const imageMatches = message.content.match(imagePattern)

  if (!imageMatches || imageMatches[1] === null) {
    return message
  }

  const cleanImgContent = message.content
    .replace(imagePattern, '')
    .replace(/\n\s*\n/g, '\n')
    .trim()

  const downloadPattern = new RegExp(`\\[[^\\]]*\\]\\((.*?)\\s*("(?:.*[^"])")?\\s*\\)`)
  const downloadMatches = cleanImgContent.match(downloadPattern)

  let cleanContent = cleanImgContent
  if (downloadMatches) {
    cleanContent = cleanImgContent
      .replace(downloadPattern, '')
      .replace(/\n\s*\n/g, '\n')
      .trim()
  }

  message = {
    ...message,
    content: cleanContent,
    metadata: {
      ...message.metadata,
      generateImage: {
        type: 'url',
        images: [imageMatches[1]]
      }
    }
  }
  return message
}

export function addImageFileToContents(messages: Message[]) {
  const lastAssistantMessage = messages.findLast((m) => m.role === 'assistant')
  if (!lastAssistantMessage || !lastAssistantMessage.metadata || !lastAssistantMessage.metadata.generateImage) {
    return messages
  }

  const imageFiles = lastAssistantMessage.metadata.generateImage.images
  const updatedAssistantMessage = {
    ...lastAssistantMessage,
    images: imageFiles
  }

  return messages.map((message) => (message.role === 'assistant' ? updatedAssistantMessage : message))
}
