import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import Logger from 'electron-log'

import BraveSearchServer from './brave-search'
import CalculatorServer from './calculator'
import DifyKnowledgeServer from './dify-knowledge'
import FetchServer from './fetch'
import FileSystemServer from './filesystem'
import FunctionPlotServer from './function-plot'
import MemoryServer from './memory'
import ThinkingServer from './sequentialthinking'
import SiliconFlowFluxServer from './siliconflow-flux'
import SimpleRememberServer from './simpleremember'
import TimeToolsServer from './timetools'
import { WorkspaceFileToolServer } from './workspacefile'

export async function createInMemoryMCPServer(
  name: string,
  args: string[] = [],
  envs: Record<string, string> = {}
): Promise<Server> {
  Logger.info(`[MCP] Creating in-memory MCP server: ${name} with args: ${args} and envs: ${JSON.stringify(envs)}`)
  switch (name) {
    case '@cherry/memory': {
      const envPath = envs.MEMORY_FILE_PATH
      return new MemoryServer(envPath).server
    }
    case '@cherry/sequentialthinking': {
      return new ThinkingServer().server
    }
    case '@cherry/brave-search': {
      return new BraveSearchServer(envs.BRAVE_API_KEY).server
    }
    case '@cherry/fetch': {
      return new FetchServer().server
    }
    case '@cherry/filesystem': {
      return new FileSystemServer(args).server
    }
    case '@cherry/dify-knowledge': {
      const difyKey = envs.DIFY_KEY
      return new DifyKnowledgeServer(difyKey, args).server
    }
    case '@cherry/simpleremember': {
      const envPath = envs.SIMPLEREMEMBER_FILE_PATH
      return new SimpleRememberServer(envPath).server
    }
    case '@cherry/workspacefile': {
      const workspacePath = envs.WORKSPACE_PATH
      if (!workspacePath) {
        throw new Error('WORKSPACE_PATH environment variable is required for WorkspaceFileTool server')
      }

      // 验证工作区路径是否存在
      try {
        const fs = require('fs/promises')
        const stats = await fs.stat(workspacePath)
        if (!stats.isDirectory()) {
          throw new Error(`工作区路径不是一个目录: ${workspacePath}`)
        }
      } catch (error) {
        Logger.error(`[WorkspaceFileTool] 工作区路径无效:`, error)
        // 添加类型检查，确保 error 是 Error 实例
        if (error instanceof Error) {
          throw new Error(`工作区路径无效: ${error.message}`)
        } else {
          // 如果不是 Error 实例，抛出通用错误
          throw new Error(`工作区路径无效: 未知错误`)
        }
      }

      return new WorkspaceFileToolServer(workspacePath).server
    }
    case '@cherry/timetools': {
      Logger.info('[MCP] Creating TimeToolsServer instance')
      try {
        const server = new TimeToolsServer().server
        Logger.info('[MCP] TimeToolsServer instance created successfully')
        return server
      } catch (error) {
        Logger.error('[MCP] Error creating TimeToolsServer instance:', error)
        throw error
      }
    }
    case '@cherry/calculator': {
      Logger.info('[MCP] Creating CalculatorServer instance')
      try {
        // 创建计算器服务器实例
        const calculatorServer = new CalculatorServer()

        // 返回服务器实例
        // 注意：初始化过程已经在构造函数中启动，会异步完成
        Logger.info('[MCP] CalculatorServer instance created successfully')
        return calculatorServer.server
      } catch (error) {
        Logger.error('[MCP] Error creating CalculatorServer instance:', error)
        throw error
      }
    }
    case '@cherry/siliconflow-flux': {
      Logger.info('[MCP] Creating SiliconFlowFluxServer instance')
      try {
        const apiKey = envs.SILICONFLOW_API_KEY
        if (!apiKey) {
          throw new Error('SILICONFLOW_API_KEY environment variable is required for SiliconFlow Flux server')
        }

        const server = new SiliconFlowFluxServer(apiKey).server
        Logger.info('[MCP] SiliconFlowFluxServer instance created successfully')
        return server
      } catch (error) {
        Logger.error('[MCP] Error creating SiliconFlowFluxServer instance:', error)
        throw error
      }
    }
    case '@cherry/function-plot': {
      Logger.info('[MCP] Creating FunctionPlotServer instance')
      try {
        const server = new FunctionPlotServer().server
        Logger.info('[MCP] FunctionPlotServer instance created successfully')
        return server
      } catch (error) {
        Logger.error('[MCP] Error creating FunctionPlotServer instance:', error)
        throw error
      }
    }
    default:
      throw new Error(`Unknown in-memory MCP server: ${name}`)
  }
}
