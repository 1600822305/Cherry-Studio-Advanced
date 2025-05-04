import { StarFilled, StarOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import React, { useCallback, useEffect, useState } from 'react'

import { useBookmarks } from '../hooks/useBookmarks'
import { Bookmark } from '../types/bookmark'
import AddBookmarkDialog from './AddBookmarkDialog'

interface BookmarkButtonProps {
  url: string
  title: string
  favicon?: string
}

const BookmarkButton: React.FC<BookmarkButtonProps> = ({ url, title, favicon }) => {
  const { bookmarks, addBookmark, deleteBookmark } = useBookmarks()
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [currentBookmark, setCurrentBookmark] = useState<Bookmark | null>(null)
  const [dialogVisible, setDialogVisible] = useState(false)

  // 检查当前页面是否已经被收藏
  useEffect(() => {
    if (!url) return

    const bookmark = bookmarks.find((b) => b.url === url)
    setIsBookmarked(!!bookmark)
    setCurrentBookmark(bookmark || null)
  }, [url, bookmarks])

  // 处理添加书签
  const handleAddBookmark = useCallback(
    async (title: string, url: string, favicon?: string, folderId?: string | null) => {
      await addBookmark(title, url, favicon, folderId ?? null)
      setDialogVisible(false)
    },
    [addBookmark]
  )

  // 处理删除书签
  const handleRemoveBookmark = useCallback(async () => {
    if (currentBookmark) {
      await deleteBookmark(currentBookmark.id)
    }
  }, [currentBookmark, deleteBookmark])

  // 处理按钮点击
  const handleClick = useCallback(() => {
    if (isBookmarked) {
      handleRemoveBookmark()
    } else {
      setDialogVisible(true)
    }
  }, [isBookmarked, handleRemoveBookmark])

  return (
    <>
      <Tooltip title={isBookmarked ? 'Remove from bookmarks' : 'Add to bookmarks'}>
        <Button
          type="text"
          icon={isBookmarked ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
          onClick={handleClick}
        />
      </Tooltip>

      <AddBookmarkDialog
        visible={dialogVisible}
        onClose={() => setDialogVisible(false)}
        initialValues={{ title, url, favicon }}
        onAdd={handleAddBookmark}
      />
    </>
  )
}

export default BookmarkButton
