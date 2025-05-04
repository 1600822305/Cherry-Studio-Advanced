import { CheckOutlined, LoadingOutlined, WarningOutlined } from '@ant-design/icons'
import { Collapse } from 'antd'
import { FC, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

export interface AgentTask {
  id: string
  title: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'error'
  result?: string
  messageId: string // 添加 messageId 字段
  toolName?: string // 添加 toolName 字段
  toolArgs?: any // 添加 toolArgs 字段
  toolResponse?: any // 添加 toolResponse 字段
}

interface Props {
  tasks: AgentTask[]
  onTaskClick?: (taskId: string, messageId: string) => void // 修改参数类型为 taskId 和 messageId
  scrollToMessage?: (messageId: string) => void // 添加 scrollToMessage 属性
}

const AgentTaskList: FC<Props> = ({ tasks, onTaskClick, scrollToMessage }) => {
  const { t } = useTranslation()
  const [activeKeys, setActiveKeys] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const taskRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const observerRef = useRef<IntersectionObserver | null>(null)

  // 添加调试日志，监控任务列表数据
  useEffect(() => {
    console.log('AgentTaskList 接收到的任务数据:', {
      tasksCount: tasks.length,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        messageId: t.messageId
      }))
    })
  }, [tasks])

  // 添加全局样式，使展开的任务更加明显
  useEffect(() => {
    // 添加自定义样式到文档头
    const styleElement = document.createElement('style')
    styleElement.textContent = `
      .agent-tasks-collapse .ant-collapse-item-active {
        border-left: 3px solid var(--color-primary);
        background-color: var(--color-bg-2);
      }

      .agent-tasks-collapse .ant-collapse-content {
        max-height: 400px;
        overflow-y: auto;
        scrollbar-width: thin;
      }

      .agent-tasks-collapse .ant-collapse-content::-webkit-scrollbar {
        width: 4px;
      }

      .agent-tasks-collapse .ant-collapse-content::-webkit-scrollbar-thumb {
        background-color: var(--color-scrollbar-thumb);
        border-radius: 4px;
      }
    `
    document.head.appendChild(styleElement)

    // 清理函数
    return () => {
      document.head.removeChild(styleElement)
    }
  }, [])

  // 设置交叉观察器，监控任务项的可见性
  useEffect(() => {
    // 创建交叉观察器
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const taskId = entry.target.getAttribute('data-task-id')
          if (taskId) {
            // 如果任务不可见（滚动出视图），且当前是展开状态，则折叠它
            if (!entry.isIntersecting && activeKeys.includes(taskId)) {
              console.log(`任务 ${taskId} 已滚出视图，自动折叠`)
              setActiveKeys((prevKeys) => prevKeys.filter((key) => key !== taskId))
            }
          }
        })
      },
      {
        root: document.getElementById('messages'), // 使用消息容器作为根元素
        rootMargin: '-20px 0px', // 提前20px触发
        threshold: 0 // 当元素完全不可见时触发
      }
    )

    return () => {
      // 清理观察器
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [activeKeys])

  // 任务点击处理函数
  const handleTaskClick = (taskId: string, messageId: string) => {
    console.log('任务点击事件:', { taskId, messageId })
    if (onTaskClick) {
      onTaskClick(taskId, messageId) // 调用 onTaskClick 传递 taskId 和 messageId
    }
    if (scrollToMessage && messageId) {
      scrollToMessage(messageId) // 调用 scrollToMessage 传递 messageId
    }
  }

  // 注册任务元素到观察器
  const registerTaskRef = (taskId: string, element: HTMLDivElement | null) => {
    if (element && observerRef.current) {
      // 存储元素引用
      taskRefs.current.set(taskId, element)

      // 添加到观察器
      element.setAttribute('data-task-id', taskId)
      observerRef.current.observe(element)

      console.log(`任务 ${taskId} 已注册到观察器`)
    }
  }

  // 处理任务展开/折叠
  const handleCollapseChange = (keys: string[]) => {
    console.log('任务展开/折叠状态变更:', keys)
    setActiveKeys(keys)
  }

  const collapseItems = useMemo(() => {
    return tasks.map((task) => {
      const isRunning = task.status === 'running'
      const isCompleted = task.status === 'completed'
      const hasError = task.status === 'error'

      return {
        key: task.id,
        label: (
          <TaskTitleLabel
            ref={(el) => registerTaskRef(task.id, el)}
            onClick={(e) => {
              e.stopPropagation() // 阻止事件冒泡，避免触发 Collapse 的展开/折叠
              handleTaskClick(task.id, task.messageId) // 传递 taskId 和 messageId
            }}>
            <TitleContent>
              <TaskName>{task.title}</TaskName>
              <StatusIndicator $isRunning={isRunning} $hasError={hasError}>
                {isRunning
                  ? t('agent.task.running')
                  : hasError
                    ? t('agent.task.error')
                    : isCompleted
                      ? t('agent.task.completed')
                      : t('agent.task.pending')}
                {isRunning && <LoadingOutlined spin style={{ marginLeft: 6 }} />}
                {isCompleted && <CheckOutlined style={{ marginLeft: 6 }} />}
                {hasError && <WarningOutlined style={{ marginLeft: 6 }} />}
              </StatusIndicator>
            </TitleContent>
          </TaskTitleLabel>
        ),
        children: (
          <TaskContent>
            <TaskDescription>{task.description}</TaskDescription>
            {task.toolArgs && Object.keys(task.toolArgs).length > 0 && (
              <TaskToolArgs>
                <TaskToolArgsTitle>参数:</TaskToolArgsTitle>
                <pre>{JSON.stringify(task.toolArgs, null, 2)}</pre>
              </TaskToolArgs>
            )}
            {task.result && <TaskResult>{task.result}</TaskResult>}
          </TaskContent>
        )
      }
    })
  }, [tasks, t, handleTaskClick]) // 添加 handleTaskClick 到依赖数组

  // 添加检查，使用useEffect以避免在渲染时直接调用console.log
  useEffect(() => {
    console.log('AgentTaskList 渲染检查:', {
      tasksLength: tasks.length,
      返回null: tasks.length === 0
    })
  }, [tasks.length])

  if (tasks.length === 0) return null

  return (
    <TasksContainer className="agent-tasks-container" ref={containerRef}>
      <TasksHeader>
        <TasksTitle>{t('agent.tasks.title')}</TasksTitle>
        <TasksCount>
          {t('agent.tasks.count', {
            completed: tasks.filter((t) => t.status === 'completed').length,
            total: tasks.length
          })}
        </TasksCount>
      </TasksHeader>
      <Collapse
        bordered={false}
        activeKey={activeKeys}
        onChange={handleCollapseChange}
        items={collapseItems}
        expandIconPosition="end"
        className="agent-tasks-collapse"
      />
    </TasksContainer>
  )
}

const TasksContainer = styled.div`
  margin-bottom: 15px;
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--color-bg-1);
  border: 1px solid var(--color-border);
`

const TasksHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
`

const TasksTitle = styled.div`
  font-weight: 500;
  font-size: 14px;
`

const TasksCount = styled.div`
  font-size: 12px;
  color: var(--color-text-2);
`

const TaskTitleLabel = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
`

const TitleContent = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const TaskName = styled.span`
  font-weight: 500;
`

const StatusIndicator = styled.span<{ $isRunning: boolean; $hasError?: boolean }>`
  color: ${(props) => {
    if (props.$hasError) return 'var(--color-error, #ff4d4f)'
    if (props.$isRunning) return 'var(--color-primary)'
    return 'var(--color-success, #52c41a)'
  }};
  font-size: 11px;
  display: flex;
  align-items: center;
  opacity: 0.85;
  border-left: 1px solid var(--color-border);
  padding-left: 8px;
`

const TaskContent = styled.div`
  padding: 12px 16px;
`

const TaskDescription = styled.div`
  margin-bottom: 8px;
  font-size: 13px;
`

const TaskToolArgs = styled.div`
  margin-bottom: 8px;
  background-color: var(--color-bg-2);
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;

  pre {
    margin: 0;
    font-family: 'Ubuntu Mono', monospace;
    white-space: pre-wrap;
    word-break: break-all;
  }
`

const TaskToolArgsTitle = styled.div`
  font-weight: 500;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--color-text-2);
`

const TaskResult = styled.div`
  background-color: var(--color-bg-2);
  padding: 8px;
  border-radius: 4px;
  font-family: 'Ubuntu Mono', monospace;
  font-size: 12px;
  white-space: pre-wrap;
`

export default AgentTaskList
