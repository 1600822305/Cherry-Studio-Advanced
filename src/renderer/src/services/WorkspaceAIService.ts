import store from '@renderer/store'
import {
  selectCurrentWorkspace,
  selectEnableWorkspacePrompt,
  selectVisibleToAIWorkspaces
} from '@renderer/store/workspace'

import WorkspaceService from './WorkspaceService'

/**
 * 获取工作区文件结构信息，用于构建系统提示词
 * @returns 工作区文件结构信息
 */
export const getWorkspaceInfo = async (): Promise<string> => {
  try {
    // 获取当前活动的工作区
    const activeWorkspace = selectCurrentWorkspace(store.getState())

    // 获取对AI可见的工作区
    const visibleWorkspaces = selectVisibleToAIWorkspaces(store.getState())

    // 检查当前工作区是否对AI可见
    if (!activeWorkspace || !visibleWorkspaces.some((w) => w.id === activeWorkspace.id)) {
      return ''
    }

    // 获取工作区文件夹结构（只获取根目录）
    const folderStructure = await WorkspaceService.getWorkspaceFolderStructure(activeWorkspace.path, {
      maxDepth: 1, // 只获取根目录下的文件和文件夹
      lazyLoad: true // 使用懒加载模式
    })

    if (!folderStructure) {
      return ''
    }

    // 构建文件结构信息
    let workspaceInfo = `当前工作区: ${activeWorkspace.name}\n`
    workspaceInfo += `工作区路径: ${activeWorkspace.path}\n\n`
    workspaceInfo += `工作区文件结构:\n`

    // 构建文件结构字符串（只处理根目录）
    const buildStructureString = (node: any) => {
      if (node.type === 'directory') {
        workspaceInfo += `📁 ${node.name}/\n`

        if (node.children && node.children.length > 0) {
          // 按名称排序，先显示目录，再显示文件
          const dirs = node.children
            .filter((child: any) => child.type === 'directory')
            .sort((a: any, b: any) => a.name.localeCompare(b.name))

          const files = node.children
            .filter((child: any) => child.type === 'file')
            .sort((a: any, b: any) => a.name.localeCompare(b.name))

          // 先列出目录
          for (const dir of dirs) {
            workspaceInfo += `  📁 ${dir.name}/\n`
          }

          // 再列出文件
          for (const file of files) {
            workspaceInfo += `  📄 ${file.name}\n`
          }
        }
      }
    }

    // 开始构建结构字符串（只处理根目录）
    buildStructureString(folderStructure)

    return workspaceInfo
  } catch (error) {
    console.error('获取工作区信息失败:', error)
    return ''
  }
}

/**
 * 将工作区信息添加到系统提示词
 * @param systemPrompt 原始系统提示词
 * @returns 增强后的系统提示词
 */
export const enhancePromptWithWorkspaceInfo = async (systemPrompt: string): Promise<string> => {
  // 检查是否启用工作区提示词
  const enableWorkspacePrompt = selectEnableWorkspacePrompt(store.getState())

  // 如果未启用工作区提示词，直接返回原始提示词
  if (!enableWorkspacePrompt) {
    console.log('[WorkspaceAIService] 工作区提示词未启用，跳过添加工作区信息')
    return systemPrompt
  }

  const workspaceInfo = await getWorkspaceInfo()

  if (!workspaceInfo) {
    return systemPrompt
  }

  // 添加工作区信息到系统提示词
  console.log('[WorkspaceAIService] 工作区提示词已启用，添加工作区信息')
  return `${systemPrompt}\n\n工作区信息:\n${workspaceInfo}\n\n请注意，上面只显示了工作区根目录下的文件和文件夹。如果需要查看子目录或文件内容，请使用相应的工具函数，如 workspace_list_files 或 workspace_read_file。\n\n请在回答用户问题时，考虑工作区中的文件结构和内容。`
}
