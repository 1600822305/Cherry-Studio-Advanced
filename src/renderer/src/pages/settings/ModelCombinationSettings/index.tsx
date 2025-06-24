import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useProviders } from '@renderer/hooks/useProvider'
import { useAppDispatch } from '@renderer/store'
import { addProvider, removeProvider } from '@renderer/store/llm'
import { Model } from '@renderer/types'
import { uuid } from '@renderer/utils'
import {
  checkModelCombinationsInLocalStorage,
  createDeepClaudeProvider,
  ThinkingLibrary
} from '@renderer/utils/createDeepClaudeProvider'
import {
  addThinkingLibrary,
  debugThinkingLibraries,
  DEFAULT_THINKING_LIBRARIES,
  getThinkingLibraries,
  saveThinkingLibraries,
  updateThinkingLibrary
} from '@renderer/utils/thinkingLibrary'
import { Button, Form, Input, message, Modal, Select, Switch, Tabs } from 'antd'
import { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import { SettingContainer, SettingDivider, SettingGroup, SettingTitle } from '..'

// 模型组合类型
interface ModelCombination {
  id: string
  name: string
  reasonerModel: Model | null
  targetModel: Model | null
  isActive: boolean
  thinkingLibraryId?: string
}

const ModelCombinationSettings: FC = () => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const dispatch = useAppDispatch()
  const { providers } = useProviders()

  // 从本地存储获取模型组合列表
  const [combinations, setCombinations] = useState<ModelCombination[]>([])
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [editingCombination, setEditingCombination] = useState<ModelCombination | null>(null)
  const [form] = Form.useForm()
  const [libraryForm] = Form.useForm()
  const [thinkingLibraries, setThinkingLibraries] = useState<ThinkingLibrary[]>([])
  const [isLibraryModalVisible, setIsLibraryModalVisible] = useState(false)
  const [editingLibrary, setEditingLibrary] = useState<ThinkingLibrary | null>(null)
  const [activeTab, setActiveTab] = useState('combinations')

  // 获取所有可用的模型
  const allModels = providers.flatMap((provider) =>
    provider.models.map((model) => ({
      ...model,
      providerName: provider.name
    }))
  )

  // 根据ID查找模型
  const findModelById = (id: string): Model | null => {
    for (const provider of providers) {
      const model = provider.models.find((m) => m.id === id)
      if (model) return model
    }
    return null
  }

  // 初始化时加载思考库
  useEffect(() => {
    console.log('[ModelCombinationSettings] 加载思考库')
    const libraries = getThinkingLibraries()
    console.log('[ModelCombinationSettings] 获取到思考库数量:', libraries.length)
    setThinkingLibraries(libraries)
  }, [])

  // 每次切换到思考库标签页时重新加载
  useEffect(() => {
    if (activeTab === 'libraries') {
      console.log('[ModelCombinationSettings] 切换到思考库标签页，重新加载思考库')
      const libraries = getThinkingLibraries()
      console.log('[ModelCombinationSettings] 重新加载思考库数量:', libraries.length)
      setThinkingLibraries(libraries)
    }
  }, [activeTab])

  // 初始化时从localStorage加载模型组合
  useEffect(() => {
    const savedCombinations = localStorage.getItem('modelCombinations')
    if (savedCombinations) {
      try {
        const parsed = JSON.parse(savedCombinations)
        // 确保reasonerModel和targetModel是完整的模型对象
        const restoredCombinations = parsed.map((comb: any) => ({
          ...comb,
          reasonerModel: comb.reasonerModel ? findModelById(comb.reasonerModel.id) : null,
          targetModel: comb.targetModel ? findModelById(comb.targetModel.id) : null
        }))
        setCombinations(restoredCombinations)
      } catch (e) {
        console.error('Failed to parse saved model combinations:', e)
      }
    }
  }, [providers])

  // 单独的useEffect来处理DeepClaude提供商的更新
  useEffect(() => {
    // 使用延迟来确保所有模型都已加载
    const timer = setTimeout(() => {
      if (combinations.length > 0 && providers.length > 0) {
        // 只有当combinations和providers都有值时才更新DeepClaude提供商
        console.log('[ModelCombinationSettings] 更新DeepClaude提供商', combinations.length, providers.length)
        updateDeepClaudeProviders(combinations)
      }
    }, 500) // 等待500ms确保所有状态都已更新

    return () => clearTimeout(timer) // 清理定时器
  }, [combinations.length, providers.length])

  // 保存模型组合到localStorage
  const saveCombinations = (newCombinations: ModelCombination[]) => {
    console.log(
      '[ModelCombinationSettings] 保存模型组合:',
      newCombinations.map((c) => ({
        id: c.id,
        name: c.name,
        reasonerModel: {
          id: c.reasonerModel?.id,
          name: c.reasonerModel?.name,
          provider: c.reasonerModel?.provider
        },
        targetModel: {
          id: c.targetModel?.id,
          name: c.targetModel?.name,
          provider: c.targetModel?.provider
        },
        isActive: c.isActive
      }))
    )

    // 确保模型组合中的模型对象是完整的
    const combinationsToSave = newCombinations.map((c) => ({
      id: c.id,
      name: c.name,
      reasonerModel: c.reasonerModel
        ? {
          id: c.reasonerModel.id,
          name: c.reasonerModel.name,
          provider: c.reasonerModel.provider,
          group: c.reasonerModel.group,
          type: c.reasonerModel.type
        }
        : null,
      targetModel: c.targetModel
        ? {
          id: c.targetModel.id,
          name: c.targetModel.name,
          provider: c.targetModel.provider,
          group: c.targetModel.group,
          type: c.targetModel.type
        }
        : null,
      isActive: c.isActive
    }))

    localStorage.setItem('modelCombinations', JSON.stringify(combinationsToSave))
    console.log('[ModelCombinationSettings] 已保存模型组合到localStorage')
    checkModelCombinationsInLocalStorage() // 检查保存的数据
    setCombinations(newCombinations)

    // 更新DeepClaude提供商
    updateDeepClaudeProviders(newCombinations)
  }

  // 更新DeepClaude提供商
  const updateDeepClaudeProviders = (combinations: ModelCombination[]) => {
    // 使用setTimeout来避免在渲染周期内进行多次状态更新
    setTimeout(() => {
      // 移除所有现有的DeepClaude提供商
      const existingDeepClaudeProviders = providers.filter((p) => p.type === 'deepclaude')
      console.log('[ModelCombinationSettings] 移除现有DeepClaude提供商数量:', existingDeepClaudeProviders.length)
      existingDeepClaudeProviders.forEach((provider) => {
        dispatch(removeProvider(provider))
      })

      // 创建并添加新的DeepClaude提供商
      const activeCombinations = combinations.filter((c) => c.isActive && c.reasonerModel && c.targetModel)
      console.log('[ModelCombinationSettings] 激活的模型组合数量:', activeCombinations.length)
      console.log(
        '[ModelCombinationSettings] 激活的模型组合详情:',
        activeCombinations.map((c) => ({
          id: c.id,
          name: c.name,
          reasonerModel: {
            id: c.reasonerModel?.id,
            name: c.reasonerModel?.name,
            provider: c.reasonerModel?.provider
          },
          targetModel: {
            id: c.targetModel?.id,
            name: c.targetModel?.name,
            provider: c.targetModel?.provider
          }
        }))
      )

      if (activeCombinations.length > 0) {
        // 创建一个单一的DeepClaude提供商，包含所有激活的模型组合
        const provider = createDeepClaudeProvider(activeCombinations)
        console.log(
          '[ModelCombinationSettings] 创建的DeepClaude提供商:',
          provider.id,
          provider.name,
          provider.type,
          provider.models.map((m) => ({ id: m.id, name: m.name, provider: m.provider }))
        )
        dispatch(addProvider(provider))
      }
    }, 0)
  }

  // 添加或编辑模型组合
  const handleAddOrEditCombination = (values: any) => {
    const { name, reasonerModelId, targetModelId, isActive, thinkingLibraryId } = values

    const reasonerModel = findModelById(reasonerModelId)
    const targetModel = findModelById(targetModelId)

    if (!reasonerModel || !targetModel) {
      message.error(t('settings.modelCombination.modelNotFound'))
      return
    }

    if (editingCombination) {
      // 编辑现有组合
      const updatedCombinations = combinations.map((comb) =>
        comb.id === editingCombination.id
          ? { ...comb, name, reasonerModel, targetModel, isActive: isActive !== false, thinkingLibraryId }
          : comb
      )
      saveCombinations(updatedCombinations)
      message.success(t('settings.modelCombination.updateSuccess'))
    } else {
      // 添加新组合
      const newCombination: ModelCombination = {
        id: uuid(),
        name,
        reasonerModel,
        targetModel,
        isActive: isActive !== false,
        thinkingLibraryId
      }
      saveCombinations([...combinations, newCombination])
      message.success(t('settings.modelCombination.addSuccess'))
    }

    setIsModalVisible(false)
    setEditingCombination(null)
    form.resetFields()
  }

  // 删除模型组合
  const handleDeleteCombination = (id: string) => {
    Modal.confirm({
      title: t('settings.modelCombination.confirmDelete'),
      content: t('settings.modelCombination.confirmDeleteContent'),
      onOk: () => {
        const updatedCombinations = combinations.filter((comb) => comb.id !== id)
        saveCombinations(updatedCombinations)
        message.success(t('settings.modelCombination.deleteSuccess'))
      }
    })
  }

  // 编辑模型组合
  const handleEditCombination = (combination: ModelCombination) => {
    setEditingCombination(combination)
    form.setFieldsValue({
      name: combination.name,
      reasonerModelId: combination.reasonerModel?.id,
      targetModelId: combination.targetModel?.id,
      isActive: combination.isActive,
      thinkingLibraryId: combination.thinkingLibraryId
    })
    setIsModalVisible(true)
  }

  // 切换模型组合的激活状态
  const toggleCombinationActive = (id: string, isActive: boolean) => {
    const updatedCombinations = combinations.map((comb) => (comb.id === id ? { ...comb, isActive } : comb))
    saveCombinations(updatedCombinations)
  }

  // 添加或编辑思考库
  const handleAddOrEditLibrary = (values: any) => {
    const { name, description, category, prompt } = values
    console.log('[ModelCombinationSettings] 添加/编辑思考库:', name)

    if (editingLibrary) {
      // 编辑现有思考库
      const updatedLibrary: ThinkingLibrary = {
        ...editingLibrary,
        name,
        description,
        category,
        prompt
      }
      console.log('[ModelCombinationSettings] 更新思考库:', updatedLibrary.id)
      updateThinkingLibrary(updatedLibrary)

      // 重新加载思考库列表
      const updatedLibraries = getThinkingLibraries()
      console.log('[ModelCombinationSettings] 更新后思考库数量:', updatedLibraries.length)
      setThinkingLibraries(updatedLibraries)
      message.success(t('settings.thinkingLibrary.updateSuccess'))
    } else {
      // 添加新思考库
      console.log('[ModelCombinationSettings] 添加新思考库:', name, category)

      try {
        // 先清除缓存，确保获取最新数据
        const currentLibraries = getThinkingLibraries()
        console.log('[ModelCombinationSettings] 当前思考库数量:', currentLibraries.length)

        // 添加新思考库
        const newLibrary = addThinkingLibrary({
          name,
          description,
          category,
          prompt
        })
        console.log('[ModelCombinationSettings] 新思考库已添加:', newLibrary.id)

        // 直接构造新的思考库数组，而不是从 localStorage 重新加载
        const updatedLibraries = [...currentLibraries, newLibrary]
        console.log('[ModelCombinationSettings] 添加后思考库数量:', updatedLibraries.length)

        // 强制更新状态
        setThinkingLibraries(updatedLibraries)

        // 调用调试函数查看存储状态
        debugThinkingLibraries()

        message.success(t('settings.thinkingLibrary.addSuccess'))
      } catch (e) {
        console.error('[ModelCombinationSettings] 添加思考库失败:', e)
        message.error('添加思考库失败，请查看控制台日志')
      }
    }

    // 关闭模态框
    setIsLibraryModalVisible(false)
    setEditingLibrary(null)
    libraryForm.resetFields()
  }

  // 删除思考库
  const handleDeleteLibrary = (id: string) => {
    Modal.confirm({
      title: t('settings.thinkingLibrary.confirmDelete'),
      content: t('settings.thinkingLibrary.confirmDeleteContent'),
      onOk: () => {
        try {
          console.log('[ModelCombinationSettings] 删除思考库:', id)

          // 先获取当前思考库列表
          const currentLibraries = getThinkingLibraries()
          console.log('[ModelCombinationSettings] 当前思考库数量:', currentLibraries.length)

          // 直接在内存中过滤要删除的思考库
          const filteredLibraries = currentLibraries.filter((lib) => lib.id !== id)
          console.log('[ModelCombinationSettings] 过滤后思考库数量:', filteredLibraries.length)

          // 保存到localStorage
          saveThinkingLibraries(filteredLibraries)

          // 强制更新状态
          setThinkingLibraries([...filteredLibraries])

          // 调用调试函数查看存储状态
          debugThinkingLibraries()

          message.success(t('settings.thinkingLibrary.deleteSuccess'))
        } catch (e) {
          console.error('[ModelCombinationSettings] 删除思考库失败:', e)
          message.error('删除思考库失败，请查看控制台日志')
        }
      }
    })
  }

  // 编辑思考库
  const handleEditLibrary = (library: ThinkingLibrary) => {
    setEditingLibrary(library)
    libraryForm.setFieldsValue({
      name: library.name,
      description: library.description,
      category: library.category,
      prompt: library.prompt
    })
    setIsLibraryModalVisible(true)
  }

  return (
    <SettingContainer theme={theme}>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'combinations',
            label: t('settings.modelCombination.title'),
            children: (
              <SettingGroup theme={theme}>
                <SettingTitle>
                  {t('settings.modelCombination.title')}
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setEditingCombination(null)
                      form.resetFields()
                      setIsModalVisible(true)
                    }}>
                    {t('settings.modelCombination.add')}
                  </Button>
                </SettingTitle>
                <SettingDivider />

                {combinations.length === 0 ? (
                  <EmptyState>{t('settings.modelCombination.empty')}</EmptyState>
                ) : (
                  <CombinationList>
                    {combinations.map((combination) => (
                      <CombinationItem key={combination.id}>
                        <CombinationInfo>
                          <CombinationName>{combination.name}</CombinationName>
                          <CombinationDetail>
                            {t('settings.modelCombination.reasoner')}:{' '}
                            {combination.reasonerModel?.name || t('settings.modelCombination.notSelected')}
                          </CombinationDetail>
                          <CombinationDetail>
                            {t('settings.modelCombination.target')}:{' '}
                            {combination.targetModel?.name || t('settings.modelCombination.notSelected')}
                          </CombinationDetail>
                        </CombinationInfo>
                        <CombinationActions>
                          <Switch
                            checked={combination.isActive}
                            onChange={(checked) => toggleCombinationActive(combination.id, checked)}
                          />
                          <Button
                            icon={<EditOutlined />}
                            type="text"
                            onClick={() => handleEditCombination(combination)}
                          />
                          <Button
                            icon={<DeleteOutlined />}
                            type="text"
                            danger
                            onClick={() => handleDeleteCombination(combination.id)}
                          />
                        </CombinationActions>
                      </CombinationItem>
                    ))}
                  </CombinationList>
                )}
              </SettingGroup>
            )
          },
          {
            key: 'libraries',
            label: t('settings.thinkingLibrary.title'),
            children: (
              <SettingGroup theme={theme}>
                <SettingTitle>
                  {t('settings.thinkingLibrary.title')}
                  <ButtonGroup>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setEditingLibrary(null)
                        libraryForm.resetFields()
                        setIsLibraryModalVisible(true)
                      }}>
                      {t('settings.thinkingLibrary.add')}
                    </Button>
                    <Button
                      onClick={() => {
                        Modal.confirm({
                          title: '重置思考库',
                          content: '确定要重置思考库吗？这将删除所有自定义思考库，并恢复默认思考库。',
                          onOk: () => {
                            try {
                              console.log('[ModelCombinationSettings] 重置思考库')
                              // 删除localStorage中的思考库数据
                              localStorage.removeItem('thinkingLibraries')
                              // 重新加载默认思考库
                              const defaultLibraries = getThinkingLibraries() // 这将返回默认思考库
                              console.log('[ModelCombinationSettings] 默认思考库数量:', defaultLibraries.length)
                              // 更新状态
                              setThinkingLibraries([...defaultLibraries])
                              // 调用调试函数查看存储状态
                              debugThinkingLibraries()
                              message.success('思考库已重置为默认状态')
                            } catch (e) {
                              console.error('[ModelCombinationSettings] 重置思考库失败:', e)
                              message.error('重置思考库失败，请查看控制台日志')
                            }
                          }
                        })
                      }}>
                      重置
                    </Button>
                    <Button
                      onClick={() => {
                        // 调用调试函数，在控制台显示思考库数据
                        debugThinkingLibraries()
                        message.info('思考库调试信息已输出到控制台，请按F12查看')
                      }}>
                      调试
                    </Button>
                    <Button
                      onClick={() => {
                        Modal.confirm({
                          title: '强制更新思考库',
                          content: '确定要强制更新思考库吗？这将保留现有思考库，并添加缺失的默认思考库。',
                          onOk: () => {
                            try {
                              console.log('[ModelCombinationSettings] 强制更新思考库')

                              // 获取当前思考库
                              const currentLibraries = getThinkingLibraries()
                              console.log('[ModelCombinationSettings] 当前思考库数量:', currentLibraries.length)

                              // 获取默认思考库中缺失的思考库
                              const existingIds = new Set(currentLibraries.map((lib) => lib.id))
                              const missingLibraries = DEFAULT_THINKING_LIBRARIES.filter(
                                (lib: ThinkingLibrary) => !existingIds.has(lib.id)
                              )
                              console.log('[ModelCombinationSettings] 缺失的默认思考库数量:', missingLibraries.length)

                              if (missingLibraries.length > 0) {
                                // 合并思考库
                                const updatedLibraries = [...currentLibraries, ...missingLibraries]
                                console.log('[ModelCombinationSettings] 更新后思考库数量:', updatedLibraries.length)

                                // 保存到localStorage
                                saveThinkingLibraries(updatedLibraries)

                                // 更新状态
                                setThinkingLibraries([...updatedLibraries])

                                // 调用调试函数查看存储状态
                                debugThinkingLibraries()

                                message.success(`思考库已更新，添加了${missingLibraries.length}个缺失的默认思考库`)
                              } else {
                                message.info('所有默认思考库已存在，无需更新')
                              }
                            } catch (e) {
                              console.error('[ModelCombinationSettings] 强制更新思考库失败:', e)
                              message.error('强制更新思考库失败，请查看控制台日志')
                            }
                          }
                        })
                      }}>
                      更新
                    </Button>
                  </ButtonGroup>
                </SettingTitle>
                <SettingDivider />

                {thinkingLibraries.length === 0 ? (
                  <EmptyState>{t('settings.thinkingLibrary.empty')}</EmptyState>
                ) : (
                  <CombinationList>
                    {thinkingLibraries.map((library) => (
                      <CombinationItem key={library.id}>
                        <CombinationInfo>
                          <CombinationName>{library.name}</CombinationName>
                          <CombinationDetail>
                            {t('settings.thinkingLibrary.category')}: {library.category}
                          </CombinationDetail>
                          <CombinationDetail>
                            {t('settings.thinkingLibrary.description')}: {library.description}
                          </CombinationDetail>
                        </CombinationInfo>
                        <CombinationActions>
                          <Button icon={<EditOutlined />} type="text" onClick={() => handleEditLibrary(library)} />
                          <Button
                            icon={<DeleteOutlined />}
                            type="text"
                            danger
                            onClick={() => handleDeleteLibrary(library.id)}
                          />
                        </CombinationActions>
                      </CombinationItem>
                    ))}
                  </CombinationList>
                )}
              </SettingGroup>
            )
          }
        ]}
      />

      {/* 添加/编辑模型组合的模态框 */}
      <Modal
        title={editingCombination ? t('settings.modelCombination.editTitle') : t('settings.modelCombination.addTitle')}
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false)
          setEditingCombination(null)
          form.resetFields()
        }}
        footer={null}>
        <Form form={form} layout="vertical" onFinish={handleAddOrEditCombination}>
          <Form.Item
            name="name"
            label={t('settings.modelCombination.name')}
            rules={[{ required: true, message: t('settings.modelCombination.nameRequired') }]}>
            <Input placeholder={t('settings.modelCombination.namePlaceholder')} />
          </Form.Item>

          <Form.Item
            name="reasonerModelId"
            label={t('settings.modelCombination.reasonerModel')}
            rules={[{ required: true, message: t('settings.modelCombination.reasonerModelRequired') }]}>
            <Select placeholder={t('settings.modelCombination.selectModel')} showSearch optionFilterProp="label">
              {allModels.map((model) => (
                <Select.Option key={model.id} value={model.id} label={`${model.name} (${model.providerName})`}>
                  {model.name} ({model.providerName})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="targetModelId"
            label={t('settings.modelCombination.targetModel')}
            rules={[{ required: true, message: t('settings.modelCombination.targetModelRequired') }]}>
            <Select placeholder={t('settings.modelCombination.selectModel')} showSearch optionFilterProp="label">
              {allModels.map((model) => (
                <Select.Option key={model.id} value={model.id} label={`${model.name} (${model.providerName})`}>
                  {model.name} ({model.providerName})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="thinkingLibraryId" label="思考库">
            <Select placeholder="选择思考库（可选）" allowClear>
              {thinkingLibraries.map((library) => (
                <Select.Option key={library.id} value={library.id} label={`${library.name} (${library.category})`}>
                  {library.name} ({library.category})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="isActive" valuePropName="checked" initialValue={true}>
            <Switch checkedChildren={t('common.enabled')} unCheckedChildren={t('common.disabled')} />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit">
              {editingCombination ? t('common.save') : t('common.add')}
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加/编辑思考库的模态框 */}
      <Modal
        title={editingLibrary ? t('settings.thinkingLibrary.editTitle') : t('settings.thinkingLibrary.addTitle')}
        open={isLibraryModalVisible}
        onCancel={() => {
          setIsLibraryModalVisible(false)
          setEditingLibrary(null)
          libraryForm.resetFields()
        }}
        footer={null}>
        <Form form={libraryForm} layout="vertical" onFinish={handleAddOrEditLibrary}>
          <Form.Item
            name="name"
            label={t('settings.thinkingLibrary.name')}
            rules={[{ required: true, message: t('settings.thinkingLibrary.nameRequired') }]}>
            <Input placeholder={t('settings.thinkingLibrary.namePlaceholder')} />
          </Form.Item>

          <Form.Item
            name="description"
            label={t('settings.thinkingLibrary.description')}
            rules={[{ required: true, message: t('settings.thinkingLibrary.descriptionRequired') }]}>
            <Input.TextArea placeholder={t('settings.thinkingLibrary.descriptionPlaceholder')} rows={2} />
          </Form.Item>

          <Form.Item
            name="category"
            label={t('settings.thinkingLibrary.category')}
            rules={[{ required: true, message: t('settings.thinkingLibrary.categoryRequired') }]}>
            <Input placeholder={t('settings.thinkingLibrary.categoryPlaceholder')} />
          </Form.Item>

          <Form.Item
            name="prompt"
            label={t('settings.thinkingLibrary.prompt')}
            rules={[{ required: true, message: t('settings.thinkingLibrary.promptRequired') }]}>
            <Input.TextArea placeholder={t('settings.thinkingLibrary.promptPlaceholder')} rows={10} />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit">
              {editingLibrary ? t('common.save') : t('common.add')}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </SettingContainer>
  )
}

// 样式组件
const EmptyState = styled.div`
  text-align: center;
  padding: 20px;
  color: var(--color-text-3);
`

const CombinationList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const CombinationItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  background-color: var(--color-bg-2);
  border: 1px solid var(--color-border);
`

const CombinationInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const CombinationName = styled.div`
  font-weight: 500;
  font-size: 16px;
  color: var(--color-text-1);
`

const CombinationDetail = styled.div`
  font-size: 14px;
  color: var(--color-text-2);
`

const CombinationActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const ButtonGroup = styled.div`
  display: flex;
  gap: 8px;
`

export default ModelCombinationSettings
