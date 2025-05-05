import { Model } from '@renderer/types'
import { WebviewTag } from 'electron'
import { v4 as uuid } from 'uuid'

import { AITask, executeAITask, generateTaskStepsWithAI } from './aiAutomation'
import { generateAIResponse } from './chatUtils'

/**
 * 复杂任务类型
 */
export enum ComplexTaskType {
  MULTI_STEP = 'multi_step', // 多步骤任务
  LOOP = 'loop', // 循环任务
  CONDITION = 'condition', // 条件分支任务
  DATA_COLLECTION = 'data_collection', // 数据收集任务
  INTERACTIVE = 'interactive' // 交互式任务
}

/**
 * 增强型AI任务
 */
export type EnhancedAITask = AITask & {
  id: string // 唯一任务ID
  taskType: ComplexTaskType // 任务类型
  subTasks?: EnhancedAITask[] // 子任务列表
  context?: string // 任务上下文
  collectedData?: any[] // 收集的数据
  variables?: Record<string, any> // 任务变量
  maxRetries?: number // 最大重试次数
  retries?: number // 当前已重试次数
  parentId?: string // 父任务ID
}

/**
 * 创建增强型任务
 */
export async function createEnhancedTask(
  instruction: string,
  model?: Model,
  taskType: ComplexTaskType = ComplexTaskType.MULTI_STEP,
  parentId?: string
): Promise<EnhancedAITask> {
  const baseTask = await generateTaskStepsWithAI(instruction, model)

  return {
    ...baseTask,
    id: uuid(),
    taskType,
    subTasks: [],
    variables: {},
    collectedData: [],
    maxRetries: 3,
    retries: 0,
    parentId
  }
}

/**
 * 根据复杂指令创建适当的任务类型
 */
export async function createTaskFromInstruction(instruction: string, model?: Model): Promise<EnhancedAITask> {
  // 分析指令以确定任务类型
  const taskTypePrompt = `
请分析以下任务指令，确定这是什么类型的任务：
${instruction}

请从以下任务类型中选择一种最匹配的：
1. MULTI_STEP（多步骤任务）：需要执行多个顺序步骤但无需循环或条件
2. LOOP（循环任务）：需要重复执行某些步骤，如遍历多个结果
3. CONDITION（条件分支任务）：需要根据内容做不同的决策
4. DATA_COLLECTION（数据收集任务）：需要从多个页面收集和整理信息
5. INTERACTIVE（交互式任务）：需要与网页进行复杂交互

只返回一个任务类型名称，例如：MULTI_STEP、LOOP等。不要返回任何解释。
`

  try {
    const typeResponse = await generateAIResponse(taskTypePrompt, [], model)
    const taskType = determineTaskType(typeResponse)

    // 创建增强任务
    return await createEnhancedTask(instruction, model, taskType)
  } catch (error) {
    console.error('Error determining task type:', error)
    // 默认创建多步骤任务
    return await createEnhancedTask(instruction, model)
  }
}

/**
 * 从AI响应中确定任务类型
 */
function determineTaskType(response: string): ComplexTaskType {
  const normalizedResponse = response.trim().toUpperCase()

  if (normalizedResponse.includes('LOOP')) return ComplexTaskType.LOOP
  if (normalizedResponse.includes('CONDITION')) return ComplexTaskType.CONDITION
  if (normalizedResponse.includes('DATA_COLLECTION')) return ComplexTaskType.DATA_COLLECTION
  if (normalizedResponse.includes('INTERACTIVE')) return ComplexTaskType.INTERACTIVE

  // 默认为多步骤任务
  return ComplexTaskType.MULTI_STEP
}

/**
 * 为循环任务生成子任务
 */
export async function generateLoopSubtasks(
  task: EnhancedAITask,
  items: string[],
  model?: Model
): Promise<EnhancedAITask> {
  const subtasks: EnhancedAITask[] = []

  // 为每个项目创建子任务
  for (const item of items) {
    const prompt = `
基于主任务"${task.description}"，为具体项目"${item}"创建子任务步骤。

主任务步骤是：
${task.steps.join('\n')}

请为项目"${item}"生成特定的步骤，确保步骤适用于这个具体项目。
`

    const subTask = await createEnhancedTask(prompt, model, ComplexTaskType.MULTI_STEP, task.id)
    subTask.context = `项目: ${item}`
    subtasks.push(subTask)
  }

  return {
    ...task,
    subTasks: subtasks
  }
}

/**
 * 处理数据收集任务
 */
export async function processDataCollectionTask(
  task: EnhancedAITask,
  webview: WebviewTag | null,
  model?: Model
): Promise<EnhancedAITask> {
  // 执行基本任务流程
  const updatedTask = await executeEnhancedTask(task, webview, model)

  // 如果有结果，使用AI解析结构化数据
  if (updatedTask.result) {
    const extractionPrompt = `
从以下网页内容中提取结构化数据。目标任务：${task.description}

内容：
${updatedTask.result.substring(0, 5000)}

请以JSON格式返回提取的数据，结构应该清晰合理。
只返回JSON对象，不要有其他文本。
`

    try {
      const extractionResponse = await generateAIResponse(extractionPrompt, [], model)

      // 尝试解析结构化数据
      const jsonMatch = extractionResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const extractedData = JSON.parse(jsonMatch[0])
          updatedTask.collectedData = Array.isArray(extractedData) ? extractedData : [extractedData]
        } catch (e) {
          console.error('Failed to parse structured data:', e)
        }
      }
    } catch (error) {
      console.error('Error extracting structured data:', error)
    }
  }

  return updatedTask
}

/**
 * 执行增强型任务
 */
export async function executeEnhancedTask(
  task: EnhancedAITask,
  webview: WebviewTag | null,
  model?: Model
): Promise<EnhancedAITask> {
  // 如果任务已完成或有错误，直接返回
  if (task.completed || task.error) {
    return task
  }

  // 根据任务类型执行不同的逻辑
  switch (task.taskType) {
    case ComplexTaskType.LOOP:
      return await executeLoopTask(task, webview, model)

    case ComplexTaskType.DATA_COLLECTION:
      return await processDataCollectionTask(task, webview, model)

    case ComplexTaskType.CONDITION:
      return await executeConditionalTask(task, webview, model)

    case ComplexTaskType.INTERACTIVE:
      return await executeInteractiveTask(task, webview, model)

    case ComplexTaskType.MULTI_STEP:
    default: {
      // 对于基本多步骤任务，使用现有执行逻辑
      const baseResult = await executeAITask(task, webview, model)
      return {
        ...task,
        ...baseResult,
        id: task.id,
        taskType: task.taskType,
        subTasks: task.subTasks,
        variables: task.variables,
        collectedData: task.collectedData,
        retries: task.retries,
        maxRetries: task.maxRetries,
        parentId: task.parentId
      }
    }
  }
}

/**
 * 执行循环任务
 */
async function executeLoopTask(
  task: EnhancedAITask,
  webview: WebviewTag | null,
  model?: Model
): Promise<EnhancedAITask> {
  // 如果没有子任务，先创建一个基础任务来获取项目列表
  if (!task.subTasks || task.subTasks.length === 0) {
    // 执行主任务来获取项目列表
    const baseTask = await executeAITask(
      {
        description: task.description,
        steps: task.steps,
        currentStep: task.currentStep,
        completed: task.completed,
        result: task.result,
        error: task.error
      },
      webview,
      model
    )

    // 更新任务状态
    task = {
      ...task,
      currentStep: baseTask.currentStep,
      completed: false, // 强制设为false，因为我们还需要处理子任务
      result: baseTask.result,
      error: baseTask.error
    }

    // 如果主任务执行失败，直接返回
    if (task.error) {
      return task
    }

    // 使用AI分析结果并识别项目列表
    if (task.result) {
      const itemExtractionPrompt = `
从以下内容中提取需要循环处理的项目列表。任务描述：${task.description}

内容：
${task.result.substring(0, 5000)}

请提取明确的项目列表，每个项目应该简洁明了。只返回项目列表，一行一个项目，不要有额外文本。
`

      try {
        const itemsResponse = await generateAIResponse(itemExtractionPrompt, [], model)
        const items = itemsResponse
          .split('\n')
          .map((item) => item.trim())
          .filter((item) => item.length > 0 && !item.startsWith('项目') && !item.match(/^\d+\.\s*/))

        if (items.length > 0) {
          // 为每个项目生成子任务
          task = await generateLoopSubtasks(task, items, model)
        } else {
          task.error = '无法提取循环处理的项目列表'
        }
      } catch (error) {
        console.error('Error extracting loop items:', error)
        task.error = `提取循环项目时出错: ${error}`
      }
    } else {
      task.error = '没有获取到可供处理的内容'
    }

    // 如果没有成功创建子任务，返回错误
    if (!task.subTasks || task.subTasks.length === 0) {
      if (!task.error) {
        task.error = '无法创建循环子任务'
      }
      return task
    }
  }

  // 执行子任务
  const updatedSubTasks = [...(task.subTasks || [])]
  for (let i = 0; i < updatedSubTasks.length; i++) {
    // 跳过已完成或有错误的子任务
    if (updatedSubTasks[i].completed || updatedSubTasks[i].error) {
      continue
    }

    // 执行当前子任务
    updatedSubTasks[i] = await executeEnhancedTask(updatedSubTasks[i], webview, model)

    // 如果当前子任务未完成，暂停循环
    if (!updatedSubTasks[i].completed && !updatedSubTasks[i].error) {
      break
    }
  }

  // 更新子任务列表
  task.subTasks = updatedSubTasks

  // 检查所有子任务是否都已完成
  const allCompleted = task.subTasks.every((subTask) => subTask.completed || subTask.error)

  // 如果所有子任务都已完成，标记主任务为完成
  if (allCompleted) {
    task.completed = true

    // 合并子任务的结果
    const successfulResults = task.subTasks
      .filter((subTask) => subTask.completed && !subTask.error && subTask.result)
      .map((subTask) => ({ context: subTask.context, result: subTask.result }))

    // 收集所有子任务的数据
    const collectedData = task.subTasks
      .filter((subTask) => subTask.collectedData && subTask.collectedData.length > 0)
      .flatMap((subTask) => subTask.collectedData || [])

    if (collectedData.length > 0) {
      task.collectedData = collectedData
    }

    // 生成综合结果
    if (successfulResults.length > 0) {
      const summaryPrompt = `
请总结以下循环任务的结果。总任务：${task.description}

${successfulResults.map((r) => `项目: ${r.context}\n结果: ${r.result?.substring(0, 500)}\n`).join('\n---\n')}

请简洁地总结所有结果，并提取关键信息。
`

      try {
        task.result = await generateAIResponse(summaryPrompt, [], model)
      } catch (error) {
        console.error('Error generating summary for loop task:', error)
        // 使用简单合并作为备选方案
        task.result = `所有子任务结果:\n\n${successfulResults.map((r) => `${r.context}:\n${r.result?.substring(0, 300)}...\n`).join('\n---\n')}`
      }
    } else {
      task.result = '循环任务完成，但没有成功的子任务结果'
    }
  }

  return task
}

/**
 * 执行条件分支任务
 */
async function executeConditionalTask(
  task: EnhancedAITask,
  webview: WebviewTag | null,
  model?: Model
): Promise<EnhancedAITask> {
  // 先执行基本任务流程来获取信息
  const baseResult = await executeAITask(
    {
      description: task.description,
      steps: task.steps,
      currentStep: task.currentStep,
      completed: false,
      result: task.result,
      error: task.error
    },
    webview,
    model
  )

  // 更新任务状态
  task = {
    ...task,
    currentStep: baseResult.currentStep,
    result: baseResult.result,
    error: baseResult.error
  }

  // 如果任务执行失败，直接返回
  if (task.error) {
    return task
  }

  // 如果没有结果，无法进行条件判断
  if (!task.result) {
    task.error = '无法获取内容进行条件判断'
    return task
  }

  // 如果没有子任务，使用AI分析结果并创建分支任务
  if (!task.subTasks || task.subTasks.length === 0) {
    const branchPrompt = `
分析以下内容，并确定接下来应该执行哪一种操作。任务描述：${task.description}

内容：
${task.result.substring(0, 5000)}

请判断应该执行哪一种操作，并简要说明原因。然后给出具体的步骤。
只返回一种最合适的操作方案及其步骤。
`

    try {
      const branchResponse = await generateAIResponse(branchPrompt, [], model)

      // 创建分支子任务
      const subTask = await createEnhancedTask(branchResponse, model, ComplexTaskType.MULTI_STEP, task.id)
      task.subTasks = [subTask]
    } catch (error) {
      console.error('Error creating conditional branch:', error)
      task.error = `创建条件分支时出错: ${error}`
      return task
    }
  }

  // 执行选定的分支任务
  if (task.subTasks && task.subTasks.length > 0) {
    const branchTask = task.subTasks[0]
    const updatedBranchTask = await executeEnhancedTask(branchTask, webview, model)
    task.subTasks = [updatedBranchTask]

    // 如果分支任务完成，标记主任务为完成
    if (updatedBranchTask.completed) {
      task.completed = true
      // 使用分支任务的结果作为主任务的结果
      if (updatedBranchTask.result) {
        task.result = updatedBranchTask.result
      }
      // 合并收集的数据
      if (updatedBranchTask.collectedData && updatedBranchTask.collectedData.length > 0) {
        task.collectedData = updatedBranchTask.collectedData
      }
    }
  }

  return task
}

/**
 * 执行交互式任务
 */
async function executeInteractiveTask(
  task: EnhancedAITask,
  webview: WebviewTag | null,
  model?: Model
): Promise<EnhancedAITask> {
  // 交互式任务需要特殊处理，增加动态决策能力
  // 默认先按普通任务执行
  const baseResult = await executeAITask(
    {
      description: task.description,
      steps: task.steps,
      currentStep: task.currentStep,
      completed: false,
      result: task.result,
      error: task.error
    },
    webview,
    model
  )

  // 更新任务状态
  task = {
    ...task,
    currentStep: baseResult.currentStep,
    result: baseResult.result,
    error: baseResult.error
  }

  // 如果所有预定义步骤完成但任务需要继续
  if (task.currentStep >= task.steps.length && !task.error) {
    // 使用AI分析网页内容并决定下一步操作
    if (webview && task.result) {
      const nextActionPrompt = `
分析当前网页内容并决定下一步操作。任务描述：${task.description}

当前网页内容：
${task.result.substring(0, 5000)}

已完成的步骤：
${task.steps.join('\n')}

请确定下一步最合适的操作，并给出具体的操作步骤。
返回格式：
{
  "action": "继续执行/结束任务",
  "reason": "简短理由",
  "next_steps": ["下一步操作1", "下一步操作2", ...]
}
只返回JSON格式，不要有其他文本。
`

      try {
        const nextActionResponse = await generateAIResponse(nextActionPrompt, [], model)

        // 解析AI响应
        const jsonMatch = nextActionResponse.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          try {
            const nextAction = JSON.parse(jsonMatch[0])

            // 判断是否继续执行
            if (
              nextAction.action === '继续执行' &&
              Array.isArray(nextAction.next_steps) &&
              nextAction.next_steps.length > 0
            ) {
              // 添加新步骤
              task.steps = [...task.steps, ...nextAction.next_steps]

              // 不标记为完成，继续执行新步骤
              task.completed = false

              // 递归调用自身执行新步骤
              return await executeInteractiveTask(task, webview, model)
            } else {
              // 标记任务完成
              task.completed = true
            }
          } catch (e) {
            console.error('Failed to parse next action:', e)
            // 默认标记任务完成
            task.completed = true
          }
        } else {
          // 找不到JSON，默认标记任务完成
          task.completed = true
        }
      } catch (error) {
        console.error('Error determining next action:', error)
        // 出错时标记任务完成
        task.completed = true
      }
    } else {
      // 没有网页内容或webview，标记任务完成
      task.completed = true
    }
  }

  return task
}

/**
 * 智能重试执行任务
 */
export async function retryTaskWithAlternative(
  task: EnhancedAITask,
  _webview: WebviewTag | null,
  model?: Model
): Promise<EnhancedAITask> {
  // 如果没有错误或已达到最大重试次数，直接返回
  if (!task.error || !task.maxRetries || (task.retries && task.retries >= task.maxRetries)) {
    return task
  }

  // 增加重试次数
  const retries = (task.retries || 0) + 1

  // 使用AI生成替代解决方案
  const retryPrompt = `
任务执行失败，请提供替代解决方案。
任务描述：${task.description}
原始步骤：
${task.steps.join('\n')}
错误信息：${task.error}
当前执行到第 ${task.currentStep} 步。

请提供重新设计的任务步骤，以避免先前的错误。
重点改进失败的步骤，可以尝试不同的方法来实现相同的目标。
返回完整的步骤列表，而不仅仅是修改的部分。
`

  try {
    const alternativeResponse = await generateAIResponse(retryPrompt, [], model)

    // 解析重新设计的步骤
    const steps = alternativeResponse
      .split('\n')
      .map((step) => step.trim())
      .filter((step) => step.length > 0 && !step.startsWith('步骤') && !step.match(/^\d+\.\s*/))

    if (steps.length > 0) {
      // 创建新的任务对象，保留原任务的ID和上下文
      return {
        ...task,
        steps,
        currentStep: 0,
        completed: false,
        error: undefined,
        retries,
        result: undefined
      }
    } else {
      // 无法提取有效步骤，更新原任务
      return {
        ...task,
        retries,
        error: `${task.error} (重试失败: 无法生成替代步骤)`
      }
    }
  } catch (error) {
    console.error('Error generating alternative steps:', error)

    // 更新原任务
    return {
      ...task,
      retries,
      error: `${task.error} (重试失败: ${error})`
    }
  }
}
