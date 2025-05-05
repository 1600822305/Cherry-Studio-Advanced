import { CheckCircleOutlined, LoadingOutlined, StopOutlined } from '@ant-design/icons'
import { Button, Card, Collapse, Progress, Space, Steps, Typography } from 'antd'
import React from 'react'

import { AITask } from '../utils/aiAutomation'

const { Text, Paragraph } = Typography
const { Step } = Steps
const { Panel } = Collapse

interface TaskExecutionPanelProps {
  task: AITask
  onClose: () => void
  onShowResult?: (result: string) => void
}

const TaskExecutionPanel: React.FC<TaskExecutionPanelProps> = ({ task, onClose, onShowResult }) => {
  // 计算进度百分比
  const progressPercent = Math.round((task.currentStep / task.steps.length) * 100)

  // 获取步骤状态
  const getStepStatus = (index: number) => {
    if (task.error) {
      return index === task.currentStep - 1 ? 'error' : index < task.currentStep ? 'finish' : 'wait'
    }

    if (index < task.currentStep) {
      return 'finish'
    } else if (index === task.currentStep && !task.completed) {
      return 'process'
    } else {
      return 'wait'
    }
  }

  // 计算子任务总体进度
  const calculateSubtasksProgress = () => {
    if (!task.subtasks || task.subtasks.length === 0) return 0

    let completedSubtasks = 0
    task.subtasks.forEach((subtask) => {
      if (subtask.completed) {
        completedSubtasks++
      } else {
        // 部分完成的子任务计算部分进度
        const subtaskProgress = subtask.currentStep / subtask.steps.length
        completedSubtasks += subtaskProgress
      }
    })

    return Math.round((completedSubtasks / task.subtasks.length) * 100)
  }

  return (
    <Card
      title={
        <Space>
          {task.completed ? (
            <CheckCircleOutlined style={{ color: 'green' }} />
          ) : task.error ? (
            <StopOutlined style={{ color: 'red' }} />
          ) : (
            <LoadingOutlined spin />
          )}
          <span>{task.description}</span>
        </Space>
      }
      extra={<Button onClick={onClose}>关闭</Button>}
      style={{ marginBottom: 16 }}>
      {/* 如果有子任务，显示子任务进度 */}
      {task.subtasks && task.subtasks.length > 0 ? (
        <>
          <Progress
            percent={calculateSubtasksProgress()}
            status={task.error ? 'exception' : task.completed ? 'success' : 'active'}
            style={{ marginBottom: 16 }}
          />

          <Paragraph>
            <Text strong>当前执行: </Text>
            <Text>复杂任务已分解为 {task.subtasks.length} 个子任务</Text>
          </Paragraph>

          <Collapse defaultActiveKey={['0']} style={{ marginBottom: 16 }}>
            {task.subtasks.map((subtask, index) => (
              <Panel
                header={
                  <Space>
                    {subtask.completed ? (
                      <CheckCircleOutlined style={{ color: 'green' }} />
                    ) : subtask.error ? (
                      <StopOutlined style={{ color: 'red' }} />
                    ) : subtask.currentStep > 0 ? (
                      <LoadingOutlined spin />
                    ) : null}
                    <Text strong>
                      子任务 {index + 1}: {subtask.description}
                    </Text>
                    <Text type={subtask.completed ? 'success' : subtask.error ? 'danger' : 'warning'}>
                      {subtask.completed
                        ? '已完成'
                        : subtask.error
                          ? '出错'
                          : `进行中 (${Math.round((subtask.currentStep / subtask.steps.length) * 100)}%)`}
                    </Text>
                  </Space>
                }
                key={index.toString()}>
                <Steps direction="vertical" current={subtask.currentStep} size="small">
                  {subtask.steps.map((step, stepIndex) => (
                    <Step
                      key={stepIndex}
                      title={step}
                      status={
                        subtask.error && stepIndex === subtask.currentStep - 1
                          ? 'error'
                          : stepIndex < subtask.currentStep
                            ? 'finish'
                            : stepIndex === subtask.currentStep && !subtask.completed && !subtask.error
                              ? 'process'
                              : 'wait'
                      }
                      description={
                        stepIndex < subtask.currentStep ? (
                          <Text type="success">已完成</Text>
                        ) : stepIndex === subtask.currentStep && !subtask.completed && !subtask.error ? (
                          <Text type="warning">执行中...</Text>
                        ) : subtask.error && stepIndex === subtask.currentStep ? (
                          <Text type="danger">执行出错</Text>
                        ) : null
                      }
                    />
                  ))}
                </Steps>

                {subtask.error && (
                  <Card type="inner" title="执行错误" size="small" style={{ marginTop: 16 }}>
                    <Paragraph type="danger">{subtask.error}</Paragraph>
                  </Card>
                )}

                {subtask.completed && subtask.result && (
                  <Card type="inner" title="子任务结果" size="small" style={{ marginTop: 16 }}>
                    <Paragraph>
                      {subtask.result.length > 100 ? subtask.result.substring(0, 100) + '...' : subtask.result}
                    </Paragraph>
                  </Card>
                )}
              </Panel>
            ))}
          </Collapse>
        </>
      ) : (
        // 原始单一任务视图
        <>
          <Progress
            percent={progressPercent}
            status={task.error ? 'exception' : task.completed ? 'success' : 'active'}
            style={{ marginBottom: 16 }}
          />

          <Steps direction="vertical" current={task.currentStep} style={{ marginBottom: 16 }}>
            {task.steps.map((step, index) => (
              <Step
                key={index}
                title={step}
                status={getStepStatus(index)}
                description={
                  index < task.currentStep ? (
                    <Text type="success">已完成</Text>
                  ) : index === task.currentStep && !task.completed && !task.error ? (
                    <Text type="warning">执行中...</Text>
                  ) : task.error && index === task.currentStep ? (
                    <Text type="danger">执行出错</Text>
                  ) : null
                }
              />
            ))}
          </Steps>
        </>
      )}

      {task.error && (
        <Card type="inner" title="执行错误" style={{ marginBottom: 16 }}>
          <Paragraph type="danger">{task.error}</Paragraph>
        </Card>
      )}

      {task.completed && !task.error && task.result && (
        <Card
          type="inner"
          title="执行结果"
          extra={
            onShowResult && (
              <Button type="link" onClick={() => onShowResult(task.result || '')}>
                查看详情
              </Button>
            )
          }>
          <Paragraph>
            任务已成功完成。
            {task.result && task.result.length > 150 ? task.result.substring(0, 150) + '...' : task.result}
          </Paragraph>
        </Card>
      )}

      {task.completed && !task.error && !task.result && (
        <Card type="inner" title="执行结果">
          <Paragraph>任务已成功完成。</Paragraph>
        </Card>
      )}
    </Card>
  )
}

export default TaskExecutionPanel
