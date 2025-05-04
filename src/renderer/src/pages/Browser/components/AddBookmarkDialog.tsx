import { FolderOutlined } from '@ant-design/icons'
import { Form, Input, Modal, TreeSelect } from 'antd'
import React, { useCallback, useEffect, useState } from 'react'

import { useBookmarks } from '../hooks/useBookmarks'
import { BookmarkFolder } from '../types/bookmark'

interface AddBookmarkDialogProps {
  visible: boolean
  onClose: () => void
  initialValues?: {
    title: string
    url: string
    favicon?: string
  }
  onAdd: (title: string, url: string, favicon?: string, folderId?: string | null) => void
}

const AddBookmarkDialog: React.FC<AddBookmarkDialogProps> = ({ visible, onClose, initialValues, onAdd }) => {
  const [form] = Form.useForm()
  const { folders, loading } = useBookmarks()
  const [treeData, setTreeData] = useState<any[]>([])

  // 将文件夹数据转换为树形结构
  useEffect(() => {
    if (!folders || !Array.isArray(folders)) {
      // 如果 folders 不存在或不是数组，设置默认的根目录选项
      setTreeData([
        {
          title: 'Bookmarks Bar',
          value: null,
          key: 'root',
          icon: <FolderOutlined />
        }
      ])
      return
    }

    // 构建文件夹树
    const buildFolderTree = (items: BookmarkFolder[], parentId: string | null = null): any[] => {
      return items
        .filter((item) => item && item.parentId === parentId)
        .map((item) => {
          if (!item) return null
          return {
            title: item.title || 'Unnamed Folder',
            value: item.id,
            key: item.id,
            icon: <FolderOutlined />,
            children: buildFolderTree(items, item.id)
          }
        })
        .filter(Boolean) // 过滤掉 null 项
    }

    // 添加根目录选项
    const folderTree = [
      {
        title: 'Bookmarks Bar',
        value: null,
        key: 'root',
        icon: <FolderOutlined />
      },
      ...buildFolderTree(folders)
    ]

    setTreeData(folderTree)
  }, [folders])

  // 重置表单
  useEffect(() => {
    if (visible) {
      form.resetFields()
      if (initialValues) {
        form.setFieldsValue({
          ...initialValues,
          folderId: null // 默认保存到书签栏
        })
      }
    }
  }, [visible, initialValues, form])

  // 处理提交
  const handleSubmit = useCallback(() => {
    form
      .validateFields()
      .then((values) => {
        onAdd(values.title, values.url, values.favicon, values.folderId)
        onClose()
      })
      .catch((info) => {
        console.log('Validate Failed:', info)
      })
  }, [form, onAdd, onClose])

  return (
    <Modal title="Add Bookmark" open={visible} onOk={handleSubmit} onCancel={onClose} okText="Add" cancelText="Cancel">
      <Form form={form} layout="vertical" initialValues={{ folderId: null }}>
        <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Please input the title!' }]}>
          <Input placeholder="Bookmark title" />
        </Form.Item>

        <Form.Item
          name="url"
          label="URL"
          rules={[
            { required: true, message: 'Please input the URL!' },
            { type: 'url', message: 'Please enter a valid URL!' }
          ]}>
          <Input placeholder="https://example.com" />
        </Form.Item>

        <Form.Item name="favicon" label="Favicon URL" rules={[{ type: 'url', message: 'Please enter a valid URL!' }]}>
          <Input placeholder="https://example.com/favicon.ico" />
        </Form.Item>

        <Form.Item name="folderId" label="Save to">
          <TreeSelect
            treeData={treeData || []}
            placeholder="Select a folder"
            loading={loading}
            treeDefaultExpandAll
            showSearch
            allowClear
            treeNodeFilterProp="title"
            fieldNames={{ label: 'title', value: 'value', children: 'children' }}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default AddBookmarkDialog
