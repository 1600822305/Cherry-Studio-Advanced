import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit'
import db from '@renderer/databases'
import { RootState } from '@renderer/store'
import { nanoid } from 'nanoid'

// 工作区类型定义
export interface Workspace {
  id: string
  name: string
  path: string
  createdAt: number
  updatedAt: number
  visibleToAI?: boolean // 是否对AI可见，默认为true
}

// 工作区状态
export interface WorkspaceState {
  workspaces: Workspace[]
  currentWorkspaceId: string | null
  isLoading: boolean
  error: string | null
  enableWorkspacePrompt: boolean // 是否启用工作区提示词
}

// 初始状态
const initialState: WorkspaceState = {
  workspaces: [],
  currentWorkspaceId: null,
  isLoading: false,
  error: null,
  enableWorkspacePrompt: false // 默认不启用工作区提示词
}

// 创建工作区 slice
const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    // 设置工作区列表
    setWorkspaces: (state, action: PayloadAction<Workspace[]>) => {
      state.workspaces = action.payload
    },

    // 添加工作区
    addWorkspace: (state, action: PayloadAction<Omit<Workspace, 'id' | 'createdAt' | 'updatedAt' | 'visibleToAI'>>) => {
      const newWorkspace: Workspace = {
        id: nanoid(),
        ...action.payload,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        visibleToAI: true // 默认对AI可见
      }
      state.workspaces.push(newWorkspace)

      // 保存到数据库
      db.workspaces.add(newWorkspace)
    },

    // 更新工作区
    updateWorkspace: (state, action: PayloadAction<{ id: string; workspace: Partial<Workspace> }>) => {
      const { id, workspace } = action.payload
      const index = state.workspaces.findIndex((w) => w.id === id)

      if (index !== -1) {
        state.workspaces[index] = {
          ...state.workspaces[index],
          ...workspace,
          updatedAt: Date.now()
        }

        // 更新数据库
        db.workspaces.update(id, {
          ...workspace,
          updatedAt: Date.now()
        })
      }
    },

    // 删除工作区
    removeWorkspace: (state, action: PayloadAction<string>) => {
      const id = action.payload
      state.workspaces = state.workspaces.filter((w) => w.id !== id)

      // 如果删除的是当前工作区，重置当前工作区
      if (state.currentWorkspaceId === id) {
        state.currentWorkspaceId = state.workspaces.length > 0 ? state.workspaces[0].id : null
      }

      // 从数据库删除
      db.workspaces.delete(id)
    },

    // 设置当前工作区
    setCurrentWorkspace: (state, action: PayloadAction<string | null>) => {
      state.currentWorkspaceId = action.payload

      // 保存当前工作区ID到本地存储
      if (action.payload) {
        localStorage.setItem('currentWorkspaceId', action.payload)
      } else {
        localStorage.removeItem('currentWorkspaceId')
      }
    },

    // 设置加载状态
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },

    // 设置错误信息
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },

    // 设置是否启用工作区提示词
    setEnableWorkspacePrompt: (state, action: PayloadAction<boolean>) => {
      state.enableWorkspacePrompt = action.payload

      // 保存到本地存储
      localStorage.setItem('enableWorkspacePrompt', action.payload ? 'true' : 'false')
    }
  }
})

// 导出 actions
export const {
  setWorkspaces,
  addWorkspace,
  updateWorkspace,
  removeWorkspace,
  setCurrentWorkspace,
  setLoading,
  setError,
  setEnableWorkspacePrompt
} = workspaceSlice.actions

// 选择器
export const selectWorkspaces = (state: RootState) => state.workspace.workspaces
export const selectCurrentWorkspaceId = (state: RootState) => state.workspace.currentWorkspaceId

// 使用createSelector记忆化选择器
export const selectCurrentWorkspace = createSelector(
  [(state: RootState) => state.workspace.currentWorkspaceId, (state: RootState) => state.workspace.workspaces],
  (currentWorkspaceId, workspaces) => {
    return currentWorkspaceId ? workspaces.find((w) => w.id === currentWorkspaceId) || null : null
  }
)

export const selectIsLoading = (state: RootState) => state.workspace.isLoading
export const selectError = (state: RootState) => state.workspace.error
export const selectEnableWorkspacePrompt = (state: RootState) => state.workspace.enableWorkspacePrompt

// 选择对AI可见的工作区
export const selectVisibleToAIWorkspaces = createSelector(
  [(state: RootState) => state.workspace.workspaces],
  (workspaces) => {
    return workspaces.filter((w) => w.visibleToAI !== false) // 如果visibleToAI为undefined或true，则返回
  }
)

// 导出 reducer
export default workspaceSlice.reducer

// 初始化工作区数据
export const initWorkspaces = () => async (dispatch: any) => {
  try {
    dispatch(setLoading(true))

    // 从数据库加载工作区
    let workspaces = await db.workspaces.toArray()

    // 检查并设置默认的visibleToAI属性
    let needsUpdate = false
    workspaces = workspaces.map((workspace) => {
      if (workspace.visibleToAI === undefined) {
        needsUpdate = true
        // 默认只有第一个工作区对AI可见
        const isFirstWorkspace = workspaces.length > 0 && workspace.id === workspaces[0].id
        return {
          ...workspace,
          visibleToAI: isFirstWorkspace
        }
      }
      return workspace
    })

    // 如果有更新，则保存到数据库
    if (needsUpdate) {
      console.log('[Workspace] 更新工作区的visibleToAI属性')
      for (const workspace of workspaces) {
        await db.workspaces.update(workspace.id, { visibleToAI: workspace.visibleToAI })
      }
    }

    dispatch(setWorkspaces(workspaces))

    // 从本地存储获取当前工作区ID
    const currentWorkspaceId = localStorage.getItem('currentWorkspaceId')
    if (currentWorkspaceId && workspaces.some((w) => w.id === currentWorkspaceId)) {
      dispatch(setCurrentWorkspace(currentWorkspaceId))
    } else if (workspaces.length > 0) {
      dispatch(setCurrentWorkspace(workspaces[0].id))
    }

    // 从本地存储获取工作区提示词状态
    const enableWorkspacePrompt = localStorage.getItem('enableWorkspacePrompt')
    if (enableWorkspacePrompt === 'true') {
      dispatch(setEnableWorkspacePrompt(true))
    }

    dispatch(setLoading(false))
  } catch (error) {
    console.error('Failed to initialize workspaces:', error)
    dispatch(setError('Failed to initialize workspaces'))
    dispatch(setLoading(false))
  }
}
