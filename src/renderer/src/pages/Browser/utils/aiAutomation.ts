import { Model } from '@renderer/types'
import { WebviewTag } from 'electron'

import { generateAIResponse } from '../utils/chatUtils'
import { BrowserAction, executeBrowserAction } from './browserAutomation'

/**
 * 自定义浏览器操作类型扩展
 */
export type CustomBrowserAction =
  | BrowserAction
  | {
      type: 'customResult'
      content: string
    }

/**
 * AI任务类型
 */
export type AITask = {
  id?: string // 任务唯一标识符
  description: string
  steps: string[]
  currentStep: number
  completed: boolean
  result?: string
  error?: string
  executionState?: Record<string, any> // 任务执行状态存储
  history?: Array<{
    step: string
    result: string
    timestamp: number
  }> // 执行历史记录
  retryCount?: number // 重试计数
  subtasks?: AITask[] // 子任务
  parentTaskId?: string // 父任务ID
}

/**
 * 解析复杂指令为任务
 * @param instruction 用户指令
 * @returns AI任务
 */
export function parseComplexInstruction(instruction: string): AITask | null {
  instruction = instruction.toLowerCase().trim()

  // 搜索并提取信息的任务
  if (
    instruction.includes('搜索') &&
    (instruction.includes('提取') || instruction.includes('总结') || instruction.includes('找出'))
  ) {
    const query = instruction.replace(/搜索|提取|总结|找出|信息|内容|关于/g, '').trim()

    return {
      id: generateTaskId(),
      description: `搜索并提取关于"${query}"的信息`,
      steps: [
        `搜索"${query}"`,
        '分析搜索结果页面',
        '点击最相关的搜索结果',
        '分析页面内容并提取相关信息',
        '总结提取的信息'
      ],
      currentStep: 0,
      completed: false,
      executionState: {},
      history: [],
      retryCount: 0
    }
  }

  // 比较多个结果的任务
  if (instruction.includes('比较') && instruction.includes('搜索')) {
    const items = instruction
      .replace(/比较|搜索|之间的|区别|不同/g, '')
      .trim()
      .split(/和|与|,|，/)
    if (items.length >= 2) {
      const item1 = items[0].trim()
      const item2 = items[1].trim()

      return {
        id: generateTaskId(),
        description: `比较"${item1}"和"${item2}"`,
        steps: [
          `搜索"${item1}"`,
          '分析页面内容并提取关于第一项的信息',
          `搜索"${item2}"`,
          '分析页面内容并提取关于第二项的信息',
          '比较两项信息并总结区别'
        ],
        currentStep: 0,
        completed: false,
        executionState: {
          item1Data: '',
          item2Data: ''
        },
        history: [],
        retryCount: 0
      }
    }
  }

  // 查找特定信息的任务
  if (instruction.includes('查找') || instruction.includes('找到')) {
    const target = instruction.replace(/查找|找到|搜索|关于/g, '').trim()

    return {
      id: generateTaskId(),
      description: `查找关于"${target}"的信息`,
      steps: [`搜索"${target}"`, '分析搜索结果页面', '点击最相关的搜索结果', '分析页面内容并提取相关信息'],
      currentStep: 0,
      completed: false,
      executionState: {},
      history: [],
      retryCount: 0
    }
  }

  // 浏览特定网站的任务
  const websiteMatch = instruction.match(/浏览|查看|打开|访问(.*?)网站|网页/)
  if (websiteMatch && websiteMatch[1]) {
    const website = websiteMatch[1].trim()

    return {
      id: generateTaskId(),
      description: `浏览"${website}"网站`,
      steps: [`打开"${website}"网站`, '分析网站首页内容', '浏览主要栏目或功能', '总结网站的主要内容和功能'],
      currentStep: 0,
      completed: false,
      executionState: {},
      history: [],
      retryCount: 0
    }
  }

  // 直接搜索任务 - 处理简单的搜索指令
  if (instruction.includes('搜索')) {
    const query = instruction.replace(/搜索/g, '').trim()

    return {
      id: generateTaskId(),
      description: `搜索"${query}"`,
      steps: [`搜索"${query}"`, '分析搜索结果页面', '点击最相关的搜索结果', '分析页面内容'],
      currentStep: 0,
      completed: false,
      executionState: {},
      history: [],
      retryCount: 0
    }
  }

  // 简单指令的通用任务 - 将指令本身作为搜索关键词
  return {
    id: generateTaskId(),
    description: instruction,
    steps: [`搜索"${instruction}"`, '分析搜索结果页面', '点击最相关的搜索结果', '分析页面内容'],
    currentStep: 0,
    completed: false,
    executionState: {},
    history: [],
    retryCount: 0
  }
}

/**
 * 生成任务唯一ID
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}

/**
 * 将任务步骤转换为浏览器操作
 * @param step 任务步骤描述
 * @param webview webview元素
 * @param model AI模型
 * @param task 当前任务上下文
 * @returns 浏览器操作
 */
export async function stepToBrowserAction(
  step: string,
  webview: WebviewTag | null,
  model?: Model,
  task?: AITask
): Promise<CustomBrowserAction | null> {
  step = step.toLowerCase().trim()

  // 从执行状态中获取上下文信息 (当前未使用，但保留注释以便将来使用)
  // const executionContext = task?.executionState || {}

  // 获取任务历史记录以提供更多上下文 (当前未使用，但保留注释以便将来使用)
  // const taskHistory = task?.history || []

  // 搜索相关步骤
  if (step.includes('搜索')) {
    const match = step.match(/搜索"(.*?)"/)
    if (match && match[1]) {
      const query = match[1]
      return { type: 'search', engine: 'baidu', query }
    }
  }

  // 比较信息步骤 - 增强处理
  if (step.includes('比较') && step.includes('信息') && step.includes('总结')) {
    if (task && task.executionState) {
      const item1Data = task.executionState.item1Data || ''
      const item2Data = task.executionState.item2Data || ''

      if (item1Data && item2Data) {
        // 使用AI来比较两个项目的数据
        const comparisonPrompt = `
请比较以下两项信息并总结它们之间的主要区别和相似之处:

第一项信息:
${item1Data}

第二项信息:
${item2Data}

请详细分析两者的异同点，重点关注:
1. 主要特点的差异
2. 共同点
3. 各自的优缺点
4. 适用场景

请提供一个结构化的比较分析。
`

        try {
          const comparisonResult = await generateAIResponse(comparisonPrompt, [], model)

          // 保存比较结果到任务状态
          if (task.executionState) {
            task.executionState.comparisonResult = comparisonResult
          }

          // 返回自定义结果，表示已完成比较
          return {
            type: 'customResult',
            content: comparisonResult
          }
        } catch (error) {
          console.error('Error generating comparison:', error)
        }
      }
    }
  }

  // 点击相关步骤
  if (step.includes('点击')) {
    // 如果webview可用，尝试使用视觉AI识别和点击元素
    if (webview) {
      // 增加更多的点击相关关键词匹配
      const clickKeywords = [
        '点击',
        '选择',
        '打开',
        '访问',
        '查看',
        '浏览',
        '第一个',
        '第二个',
        '第三个',
        '搜索结果',
        '链接',
        '百度百科',
        '维基百科'
      ]

      // 检查步骤是否包含任何点击关键词
      const containsClickKeyword = clickKeywords.some((keyword) => step.includes(keyword))

      if (containsClickKeyword) {
        console.log('Using visual interaction for step:', step)

        // 如果是特定的结果选择，提供更精确的指令
        if (step.includes('第一个搜索结果')) {
          return { type: 'visualInteraction', instruction: '点击第一个搜索结果链接', model }
        } else if (step.includes('第二个搜索结果')) {
          return { type: 'visualInteraction', instruction: '点击第二个搜索结果链接', model }
        } else if (step.includes('百度百科') || step.includes('维基百科')) {
          return {
            type: 'visualInteraction',
            instruction: `点击包含${step.includes('百度百科') ? '百度百科' : '维基百科'}的链接`,
            model
          }
        } else {
          return { type: 'visualInteraction', instruction: step, model }
        }
      }
    }

    // 如果视觉AI不可用或不适用，回退到原来的方法
    if (
      step.includes('最相关的搜索结果') ||
      step.includes('第一个搜索结果') ||
      step.includes('第一个链接') ||
      step.includes('搜索结果')
    ) {
      // 尝试找到第一个搜索结果并点击
      try {
        if (webview) {
          const firstResultSelector = await findFirstSearchResultSelector(webview)
          if (firstResultSelector) {
            return { type: 'click', selector: firstResultSelector }
          } else {
            // 如果找不到选择器，使用视觉交互作为备选方案
            return { type: 'visualInteraction', instruction: step, model }
          }
        }
      } catch (error) {
        console.error('Error finding first search result:', error)
        // 出错时使用视觉交互作为备选方案
        return { type: 'visualInteraction', instruction: step, model }
      }
    }

    // 对于其他点击操作，也使用视觉交互
    return { type: 'visualInteraction', instruction: step, model }
  }

  // 分析页面内容步骤
  if (step.includes('分析页面内容') || step.includes('分析搜索结果页面')) {
    // 根据任务执行状态记录不同的分析结果
    if (step.includes('第一项的信息') && task?.executionState) {
      // 获取页面内容并存储为第一项信息
      const action = { type: 'getContent' } as BrowserAction
      // 在执行操作后，我们将把返回的内容存储到item1Data中
      task.executionState.analysisTarget = 'item1Data'
      return action
    } else if (step.includes('第二项的信息') && task?.executionState) {
      // 获取页面内容并存储为第二项信息
      const action = { type: 'getContent' } as BrowserAction
      // 在执行操作后，我们将把返回的内容存储到item2Data中
      task.executionState.analysisTarget = 'item2Data'
      return action
    } else {
      return { type: 'getContent' } as BrowserAction
    }
  }

  // 打开网站步骤
  const openMatch = step.match(/打开"(.*?)"网站/)
  if (openMatch && openMatch[1]) {
    let url = openMatch[1]
    if (!url.includes('.')) {
      url = url + '.com'
    }
    return { type: 'navigate', url }
  }

  // 添加对后退、返回命令的支持
  if (step.includes('返回') || step.includes('后退') || step.includes('回到上一页')) {
    return { type: 'back' }
  }

  // 添加对标签页管理命令的支持

  // 切换标签页
  const switchTabMatch = step.match(/切换到(第(\d+)个|(\d+)号)?标签页/)
  if (switchTabMatch) {
    const tabNum = parseInt(switchTabMatch[2] || switchTabMatch[3] || '1')
    return { type: 'switchToTab', tabIndex: tabNum - 1 } // 将用户输入的1-indexed转换为0-indexed
  }

  // 列出所有标签页
  if (step.includes('列出标签页') || step.includes('显示所有标签') || step.includes('查看所有标签')) {
    return { type: 'listTabs' }
  }

  // 关闭标签页
  const closeTabMatch = step.match(/关闭(第(\d+)个|(\d+)号)?标签页/)
  if (closeTabMatch) {
    const tabNum = parseInt(closeTabMatch[2] || closeTabMatch[3] || '1')
    return { type: 'closeTab', tabIndex: tabNum - 1 } // 将用户输入的1-indexed转换为0-indexed
  }

  // 创建新标签页
  const createTabMatch = step.match(/在新标签页中打开["']?(.+?)["']?/)
  if (createTabMatch && createTabMatch[1]) {
    let url = createTabMatch[1].trim()
    if (!url.includes('.') && !url.startsWith('http')) {
      url = 'https://www.google.com/search?q=' + encodeURIComponent(url)
    } else if (!url.startsWith('http')) {
      url = 'https://' + url
    }
    return { type: 'createTab', url }
  }

  // 浏览步骤
  if (step.includes('浏览')) {
    return { type: 'scrollDown' }
  }

  // 总结步骤 - 使用AI来处理收集到的信息
  if (step.includes('总结') && step.includes('信息')) {
    if (task && task.result) {
      // 使用AI总结已收集的信息
      const summaryPrompt = `
请总结以下内容的要点和关键信息:

${task.result}

请提供一个简洁但全面的总结，包括:
1. 主要内容
2. 关键要点
3. 值得注意的细节
`

      try {
        const summaryResult = await generateAIResponse(summaryPrompt, [], model)

        // 返回自定义结果，表示已完成总结
        return {
          type: 'customResult',
          content: summaryResult
        }
      } catch (error) {
        console.error('Error generating summary:', error)
      }
    }
  }

  // 无法识别的步骤，尝试使用视觉AI
  if (webview) {
    console.log('Using visual interaction for unrecognized step:', step)
    return { type: 'visualInteraction', instruction: step, model }
  }

  // 如果webview不可用，返回null
  return null
}

/**
 * 查找第一个搜索结果的选择器
 * @param webview webview元素
 * @returns 选择器
 */
async function findFirstSearchResultSelector(webview: WebviewTag): Promise<string | null> {
  try {
    // 执行JavaScript查找第一个搜索结果
    const result = await webview.executeJavaScript(`
      (function() {
        // 百度搜索结果
        if (window.location.href.includes('baidu.com')) {
          const baiduResults = document.querySelectorAll('.result a, .c-container a');
          if (baiduResults.length > 0) {
            return { selector: '.result a:first-child, .c-container a:first-child' };
          }
        }

        // 谷歌搜索结果
        if (window.location.href.includes('google.com')) {
          const googleResults = document.querySelectorAll('.g a');
          if (googleResults.length > 0) {
            return { selector: '.g a:first-child' };
          }
        }

        // 必应搜索结果
        if (window.location.href.includes('bing.com')) {
          const bingResults = document.querySelectorAll('.b_algo a');
          if (bingResults.length > 0) {
            return { selector: '.b_algo a:first-child' };
          }
        }

        // 通用搜索结果查找
        const allLinks = Array.from(document.querySelectorAll('a'));
        const visibleLinks = allLinks.filter(link => {
          const rect = link.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 &&
                 window.getComputedStyle(link).display !== 'none' &&
                 window.getComputedStyle(link).visibility !== 'hidden';
        });

        if (visibleLinks.length > 0) {
          // 尝试找到第一个看起来像搜索结果的链接
          const resultLink = visibleLinks.find(link => {
            const text = link.textContent || '';
            const href = link.href || '';
            return text.length > 20 && href.includes('http') && !href.includes('javascript:');
          });

          if (resultLink) {
            // 创建一个选择器
            if (resultLink.id) {
              return { selector: '#' + resultLink.id };
            } else if (resultLink.className) {
              const classes = resultLink.className.split(' ').map(c => '.' + c).join('');
              return { selector: 'a' + classes };
            } else {
              // 使用XPath创建一个选择器
              const allLinkElements = document.querySelectorAll('a');
              const index = Array.from(allLinkElements).indexOf(resultLink);
              return { selector: \`a:nth-of-type(\${index + 1})\` };
            }
          }
        }

        return { selector: null };
      })();
    `)

    return result.selector
  } catch (error) {
    console.error('Error finding first search result selector:', error)
    return null
  }
}

/**
 * 使用AI生成任务步骤
 * @param instruction 用户指令
 * @param model AI模型
 * @returns 生成的AI任务
 */
export async function generateTaskStepsWithAI(instruction: string, model?: Model): Promise<AITask> {
  try {
    // 先尝试使用规则解析，这样可以处理常见任务模式
    const ruleBasedTask = parseComplexInstruction(instruction)
    if (ruleBasedTask) {
      return ruleBasedTask
    }

    // 使用AI模型生成步骤
    const prompt = `
你是一个专门帮助用户将自然语言指令转换为具体浏览器操作步骤的AI助手。
请将以下用户指令转换为一系列明确的浏览器操作步骤。
每个步骤应该是一个简单、明确的操作，如搜索、点击、分析内容等。

用户指令: "${instruction}"

请生成一个JSON格式的任务，包含以下字段:
- description: 任务描述
- steps: 步骤数组，每个步骤是一个字符串

注意：第一步必须是搜索操作，例如"搜索xxx"。
无论用户的指令是什么，都必须从搜索开始，除非明确要求打开特定网站。

示例输出:
{
  "description": "搜索并提取关于人工智能的信息",
  "steps": [
    "搜索\\"人工智能最新进展\\"",
    "分析搜索结果页面",
    "点击最相关的搜索结果",
    "分析页面内容并提取相关信息"
  ]
}

请确保步骤是浏览器可以执行的，支持的操作类型包括:
- 搜索: 如"搜索\\"关键词\\""
- 点击: 如"点击最相关的搜索结果"
- 分析: 如"分析页面内容并提取相关信息"
- 导航: 如"打开\\"example.com\\"网站"
- 滚动: 如"向下滚动页面"
- 比较: 如"比较两项信息并总结区别"
- 总结: 如"总结提取的信息"

针对复杂任务，请确保提供足够详细的步骤，例如比较两个主题时:
1. 首先搜索第一个主题
2. 分析并提取第一个主题的信息
3. 搜索第二个主题
4. 分析并提取第二个主题的信息
5. 比较两者信息并总结

请根据用户指令生成适当的步骤:`

    // 调用AI模型生成步骤
    const aiResponse = await generateAIResponse(prompt, [], model)

    // 解析AI响应
    try {
      // 尝试从响应中提取JSON
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const taskJson = JSON.parse(jsonMatch[0])

        // 验证JSON格式
        if (taskJson.description && Array.isArray(taskJson.steps) && taskJson.steps.length > 0) {
          // 确保第一步是搜索操作，除非明确是打开特定网站
          const firstStep = taskJson.steps[0].toLowerCase()
          if (!firstStep.includes('搜索') && !firstStep.includes('打开') && !firstStep.includes('导航')) {
            // 在步骤前插入搜索步骤
            taskJson.steps.unshift(`搜索"${instruction}"`)
          }

          return {
            id: generateTaskId(),
            description: taskJson.description,
            steps: taskJson.steps,
            currentStep: 0,
            completed: false,
            executionState: {},
            history: [],
            retryCount: 0
          }
        }
      }

      // 如果无法解析JSON，尝试从文本中提取步骤
      const stepsMatch = aiResponse.match(/步骤[：:]\s*([\s\S]*?)(?:\n\n|$)/)
      if (stepsMatch) {
        const stepsText = stepsMatch[1]
        const steps = stepsText
          .split(/\n/)
          .map((step) => step.replace(/^\d+[.、\s]+/, '').trim())
          .filter((step) => step.length > 0)

        if (steps.length > 0) {
          // 确保第一步是搜索操作，除非明确是打开特定网站
          const firstStep = steps[0].toLowerCase()
          if (!firstStep.includes('搜索') && !firstStep.includes('打开') && !firstStep.includes('导航')) {
            // 在步骤前插入搜索步骤
            steps.unshift(`搜索"${instruction}"`)
          }

          return {
            id: generateTaskId(),
            description: instruction,
            steps,
            currentStep: 0,
            completed: false,
            executionState: {},
            history: [],
            retryCount: 0
          }
        }
      }
    } catch (error) {
      console.error('Error parsing AI response:', error)
    }

    // 如果所有解析尝试都失败，返回一个基本任务
    return {
      id: generateTaskId(),
      description: instruction,
      steps: ['搜索"' + instruction + '"', '分析搜索结果页面', '点击最相关的搜索结果', '分析页面内容并提取相关信息'],
      currentStep: 0,
      completed: false,
      executionState: {},
      history: [],
      retryCount: 0
    }
  } catch (error) {
    console.error('Error generating task steps with AI:', error)

    // 出错时返回一个基本任务
    return {
      id: generateTaskId(),
      description: instruction,
      steps: ['搜索"' + instruction + '"', '分析搜索结果页面'],
      currentStep: 0,
      completed: false,
      executionState: {},
      history: [],
      retryCount: 0
    }
  }
}

/**
 * 执行AI任务
 * @param task AI任务
 * @param webview webview元素
 * @param model AI模型
 * @returns 更新后的任务
 */
export async function executeAITask(task: AITask, webview: WebviewTag | null, model?: Model): Promise<AITask> {
  if (task.completed || task.currentStep >= task.steps.length) {
    task.completed = true
    return task
  }

  // 最大重试次数
  const MAX_RETRIES = 3

  try {
    // 获取当前步骤
    const currentStep = task.steps[task.currentStep]
    console.log(`执行任务步骤: ${currentStep}`)

    // 特殊处理：如果是第一步且没有明确搜索指令，且不是导航指令，则默认添加百度搜索步骤
    if (
      task.currentStep === 0 &&
      !currentStep.toLowerCase().includes('搜索') &&
      !currentStep.toLowerCase().includes('打开') &&
      !currentStep.toLowerCase().includes('导航') &&
      !currentStep.toLowerCase().includes('访问')
    ) {
      // 使用任务描述作为搜索关键词
      const searchKeyword = task.description.replace(/["""]/g, '')
      console.log(`添加默认搜索步骤，搜索关键词: ${searchKeyword}`)

      // 创建搜索操作
      const searchAction: BrowserAction = {
        type: 'search',
        engine: 'baidu',
        query: searchKeyword
      }

      // 执行搜索操作
      const searchResult = await executeBrowserAction(webview, searchAction)

      if (searchResult.success) {
        console.log('默认搜索步骤执行成功，继续执行原定步骤')
        // 记录到执行历史，但不增加currentStep，仍然执行原来的第一步
        if (!task.history) {
          task.history = []
        }

        task.history.push({
          step: `默认搜索"${searchKeyword}"`,
          result: 'success',
          timestamp: Date.now()
        })
      } else {
        console.error('默认搜索步骤执行失败:', searchResult.error)
      }
    }

    // 将步骤转换为浏览器操作
    const action = await stepToBrowserAction(currentStep, webview, model, task)
    console.log(`步骤转换为操作: `, action)

    if (action && webview) {
      // 如果是自定义结果类型，直接处理
      if (action.type === 'customResult') {
        // 保存结果
        task.result = action.content

        // 更新任务状态
        task.currentStep++
        task.retryCount = 0

        // 检查任务是否完成
        if (task.currentStep >= task.steps.length) {
          task.completed = true
        }

        return { ...task }
      }

      // 执行标准浏览器操作
      console.log(`开始执行浏览器操作: ${action.type}`)
      const result = await executeBrowserAction(webview, action as BrowserAction)
      console.log(`浏览器操作执行结果: `, result.success ? '成功' : '失败', result.error || '')

      // 记录执行历史
      if (!task.history) {
        task.history = []
      }

      task.history.push({
        step: currentStep,
        result: result.success ? 'success' : `failed: ${result.error || 'unknown error'}`,
        timestamp: Date.now()
      })

      if (result.success) {
        // 如果是获取内容的操作，根据任务状态保存内容
        if (action.type === 'getContent' && result.content) {
          if (task.executionState?.analysisTarget === 'item1Data') {
            task.executionState.item1Data = result.content
            console.log('已保存内容到item1Data')
          } else if (task.executionState?.analysisTarget === 'item2Data') {
            task.executionState.item2Data = result.content
            console.log('已保存内容到item2Data')
          } else {
            task.result = result.content
            console.log('已保存内容到任务结果')
          }
        } else if ((action as any).type === 'customResult' && (action as any).content) {
          // 处理自定义结果类型
          task.result = (action as any).content
          console.log('已保存自定义结果到任务')
        }

        // 更新任务状态
        task.currentStep++
        task.retryCount = 0 // 重置重试计数
        console.log(`更新任务状态: 当前步骤 ${task.currentStep}/${task.steps.length}`)

        // 检查任务是否完成
        if (task.currentStep >= task.steps.length) {
          task.completed = true
          console.log(`任务已完成`)

          // 如果是比较任务，并且有比较结果，将其作为最终结果
          if (task.executionState?.comparisonResult) {
            task.result = task.executionState.comparisonResult
          }
        }
      } else {
        // 操作失败，尝试重试
        const retryCount = task.retryCount || 0
        if (retryCount < MAX_RETRIES) {
          console.log(`步骤执行失败，尝试重试 ${retryCount + 1}/${MAX_RETRIES}`)
          task.retryCount = retryCount + 1

          // 添加延迟后重试
          await new Promise((resolve) => setTimeout(resolve, 1000))
          return executeAITask(task, webview, model)
        } else {
          // 超过最大重试次数，标记为失败
          task.error = `执行步骤"${currentStep}"失败: ${result.error}`
          console.error(`任务执行失败: ${task.error}`)

          // 尝试执行替代步骤或恢复策略
          if (await tryRecoverFromError(task, webview, model)) {
            // 恢复成功，继续执行
            task.error = undefined
            task.retryCount = 0
            return executeAITask(task, webview, model)
          }
        }
      }
    } else {
      // 无法将步骤转换为操作
      task.error = `无法将步骤"${currentStep}"转换为浏览器操作`
      console.error(`任务执行失败: ${task.error}`)
    }
  } catch (error) {
    // 执行出错
    task.error = `执行任务出错: ${error}`
    console.error(`任务执行异常: ${task.error}`)
  }

  // 返回更新后的任务
  return { ...task }
}

/**
 * 尝试从错误中恢复
 * @param task 出错的任务
 * @param webview webview元素
 * @param model AI模型
 * @returns 是否成功恢复
 */
async function tryRecoverFromError(task: AITask, webview: WebviewTag | null, model?: Model): Promise<boolean> {
  if (!webview) return false

  console.log('尝试从错误中恢复任务执行')

  // 构建错误恢复提示词
  const prompt = `
你是一个专门解决浏览器自动化问题的AI助手。
当前任务执行过程中遇到了问题，需要你提供一个替代方案来继续执行任务。

任务描述: ${task.description}
当前步骤: ${task.steps[task.currentStep]} (第${task.currentStep + 1}步，共${task.steps.length}步)
执行错误: ${task.error}

任务历史:
${task.history?.map((h) => `- ${h.step}: ${h.result}`).join('\n') || '无历史记录'}

请提供一个替代的步骤来代替当前步骤，或者提供一个可以跳过当前步骤的解决方案。
返回JSON格式:
{
  "recoverStrategy": "replace" | "skip" | "modify" | "abort",
  "replacementStep": "如果选择replace策略，提供替代步骤",
  "explanation": "解释你的恢复策略"
}
`

  try {
    // 调用AI提供恢复策略
    const recoveryResponse = await generateAIResponse(prompt, [], model)

    // 解析AI响应
    const jsonMatch = recoveryResponse.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const recoveryPlan = JSON.parse(jsonMatch[0])

      if (recoveryPlan.recoverStrategy === 'replace' && recoveryPlan.replacementStep) {
        // 替换当前步骤
        console.log(`替换当前步骤为: ${recoveryPlan.replacementStep}`)
        task.steps[task.currentStep] = recoveryPlan.replacementStep
        return true
      } else if (recoveryPlan.recoverStrategy === 'skip') {
        // 跳过当前步骤
        console.log('跳过当前步骤')
        task.currentStep++
        return true
      } else if (recoveryPlan.recoverStrategy === 'modify') {
        // 修改任务流程，添加新步骤或调整现有步骤
        console.log('修改任务流程')
        // 如果有提供替代步骤，替换当前步骤
        if (recoveryPlan.replacementStep) {
          task.steps[task.currentStep] = recoveryPlan.replacementStep
        }
        return true
      } else {
        // 无法恢复，放弃任务
        console.log('无法恢复任务，放弃执行')
        return false
      }
    }
  } catch (error) {
    console.error('错误恢复过程中出错:', error)
  }

  return false
}

/**
 * 分解复杂任务为多个子任务
 * @param task 复杂任务
 * @param model AI模型
 * @returns 带有子任务的任务
 */
export async function decomposeComplexTask(task: AITask, model?: Model): Promise<AITask> {
  // 检查任务是否足够复杂需要分解
  if (task.steps.length <= 5) {
    return task // 不需要分解
  }

  // 构建分解任务的提示词
  const prompt = `
你是一个任务规划专家，擅长将复杂任务分解为更易管理的子任务。
请将下面的复杂任务分解为2-3个子任务，每个子任务包含几个步骤。

任务描述: ${task.description}
任务步骤:
${task.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

请返回JSON格式的子任务列表:
{
  "subtasks": [
    {
      "description": "子任务1描述",
      "steps": ["步骤1", "步骤2", ...]
    },
    {
      "description": "子任务2描述",
      "steps": ["步骤1", "步骤2", ...]
    },
    ...
  ]
}
`

  try {
    // 调用AI分解任务
    const decompositionResponse = await generateAIResponse(prompt, [], model)

    // 解析AI响应
    const jsonMatch = decompositionResponse.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const decomposition = JSON.parse(jsonMatch[0])

      if (decomposition.subtasks && Array.isArray(decomposition.subtasks) && decomposition.subtasks.length > 0) {
        // 创建子任务
        const subtasks: AITask[] = decomposition.subtasks.map((subtask: any) => ({
          id: generateTaskId(),
          parentTaskId: task.id,
          description: subtask.description,
          steps: subtask.steps,
          currentStep: 0,
          completed: false,
          executionState: {},
          history: [],
          retryCount: 0
        }))

        // 更新主任务
        task.subtasks = subtasks

        return task
      }
    }
  } catch (error) {
    console.error('分解任务时出错:', error)
  }

  return task // 分解失败，返回原始任务
}

/**
 * 执行包含子任务的复杂任务
 * @param task 复杂任务
 * @param webview webview元素
 * @param model AI模型
 * @returns 更新后的任务
 */
export async function executeComplexTask(task: AITask, webview: WebviewTag | null, model?: Model): Promise<AITask> {
  // 如果没有子任务，使用普通任务执行
  if (!task.subtasks || task.subtasks.length === 0) {
    return executeAITask(task, webview, model)
  }

  console.log(`执行复杂任务: ${task.description}，包含${task.subtasks.length}个子任务`)

  // 收集所有子任务的结果
  const results: string[] = []
  let allSubtasksCompleted = true

  // 逐个执行子任务
  for (let i = 0; i < task.subtasks.length; i++) {
    const subtask = task.subtasks[i]
    console.log(`执行子任务 ${i + 1}/${task.subtasks.length}: ${subtask.description}`)

    if (!subtask.completed) {
      // 执行子任务
      const updatedSubtask = await executeAITask(subtask, webview, model)
      task.subtasks[i] = updatedSubtask

      // 如果子任务执行失败，标记整体任务失败
      if (updatedSubtask.error) {
        task.error = `子任务 "${updatedSubtask.description}" 执行失败: ${updatedSubtask.error}`
        allSubtasksCompleted = false
        break
      }

      // 收集子任务结果
      if (updatedSubtask.result) {
        results.push(updatedSubtask.result)
      }
    } else if (subtask.result) {
      // 子任务已完成，收集结果
      results.push(subtask.result)
    }
  }

  // 如果所有子任务都成功完成，整合结果
  if (allSubtasksCompleted) {
    task.completed = true

    // 如果有多个子任务结果，合并它们
    if (results.length > 0) {
      // 使用AI整合所有结果
      const integrationPrompt = `
请整合以下来自多个子任务的结果，提供一个全面的总结:

${results.map((result, index) => `## 子任务 ${index + 1} 结果:\n${result}`).join('\n\n')}

请综合所有信息，提供一个连贯的总结。确保涵盖所有重要信息，避免重复，并突出主要发现。
`
      try {
        const integratedResult = await generateAIResponse(integrationPrompt, [], model)
        task.result = integratedResult
      } catch (error) {
        console.error('整合子任务结果时出错:', error)
        // 如果整合失败，直接连接所有结果
        task.result = results.join('\n\n--- 子任务分隔线 ---\n\n')
      }
    }
  }

  return task
}
