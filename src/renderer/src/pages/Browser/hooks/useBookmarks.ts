import { useCallback, useEffect, useState } from 'react'

import { bookmarkService } from '../services/BookmarkService'
import { Bookmark, BookmarkFolder, BookmarkTreeNode } from '../types/bookmark'

/**
 * 书签管理Hook
 * 提供书签的增删改查功能
 */
export const useBookmarks = () => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [folders, setFolders] = useState<BookmarkFolder[]>([])
  const [bookmarkTree, setBookmarkTree] = useState<BookmarkTreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // 加载所有书签和文件夹
  const loadBookmarks = useCallback(async () => {
    try {
      setLoading(true)
      const [allBookmarks, allFolders, tree] = await Promise.all([
        bookmarkService.getAllBookmarks(),
        bookmarkService.getAllFolders(),
        bookmarkService.getBookmarkTree()
      ])
      setBookmarks(allBookmarks)
      setFolders(allFolders)
      setBookmarkTree(tree)
      setError(null)
    } catch (err) {
      console.error('Failed to load bookmarks:', err)
      setError(err instanceof Error ? err : new Error('Failed to load bookmarks'))
    } finally {
      setLoading(false)
    }
  }, [])

  // 初始加载
  useEffect(() => {
    loadBookmarks()
  }, [loadBookmarks])

  // 添加书签
  const addBookmark = useCallback(
    async (title: string, url: string, favicon?: string, parentId: string | null = null) => {
      try {
        const newBookmark = await bookmarkService.addBookmark(title, url, favicon, parentId)
        setBookmarks((prev) => [...prev, newBookmark])
        await loadBookmarks() // 重新加载以更新树结构
        return newBookmark
      } catch (err) {
        console.error('Failed to add bookmark:', err)
        setError(err instanceof Error ? err : new Error('Failed to add bookmark'))
        return null
      }
    },
    [loadBookmarks]
  )

  // 更新书签
  const updateBookmark = useCallback(
    async (id: string, updates: Partial<Bookmark>) => {
      try {
        const updatedBookmark = await bookmarkService.updateBookmark(id, updates)
        if (updatedBookmark) {
          setBookmarks((prev) => prev.map((bookmark) => (bookmark.id === id ? updatedBookmark : bookmark)))
          await loadBookmarks() // 重新加载以更新树结构
        }
        return updatedBookmark
      } catch (err) {
        console.error('Failed to update bookmark:', err)
        setError(err instanceof Error ? err : new Error('Failed to update bookmark'))
        return null
      }
    },
    [loadBookmarks]
  )

  // 删除书签
  const deleteBookmark = useCallback(
    async (id: string) => {
      try {
        const success = await bookmarkService.deleteBookmark(id)
        if (success) {
          setBookmarks((prev) => prev.filter((bookmark) => bookmark.id !== id))
          await loadBookmarks() // 重新加载以更新树结构
        }
        return success
      } catch (err) {
        console.error('Failed to delete bookmark:', err)
        setError(err instanceof Error ? err : new Error('Failed to delete bookmark'))
        return false
      }
    },
    [loadBookmarks]
  )

  // 添加文件夹
  const addFolder = useCallback(
    async (title: string, parentId: string | null = null) => {
      try {
        const newFolder = await bookmarkService.addFolder(title, parentId)
        setFolders((prev) => [...prev, newFolder])
        await loadBookmarks() // 重新加载以更新树结构
        return newFolder
      } catch (err) {
        console.error('Failed to add folder:', err)
        setError(err instanceof Error ? err : new Error('Failed to add folder'))
        return null
      }
    },
    [loadBookmarks]
  )

  // 更新文件夹
  const updateFolder = useCallback(
    async (id: string, updates: Partial<BookmarkFolder>) => {
      try {
        const updatedFolder = await bookmarkService.updateFolder(id, updates)
        if (updatedFolder) {
          setFolders((prev) => prev.map((folder) => (folder.id === id ? updatedFolder : folder)))
          await loadBookmarks() // 重新加载以更新树结构
        }
        return updatedFolder
      } catch (err) {
        console.error('Failed to update folder:', err)
        setError(err instanceof Error ? err : new Error('Failed to update folder'))
        return null
      }
    },
    [loadBookmarks]
  )

  // 删除文件夹
  const deleteFolder = useCallback(
    async (id: string, recursive: boolean = true) => {
      try {
        const success = await bookmarkService.deleteFolder(id, recursive)
        if (success) {
          setFolders((prev) => prev.filter((folder) => folder.id !== id))
          await loadBookmarks() // 重新加载以更新树结构
        }
        return success
      } catch (err) {
        console.error('Failed to delete folder:', err)
        setError(err instanceof Error ? err : new Error('Failed to delete folder'))
        return false
      }
    },
    [loadBookmarks]
  )

  // 搜索书签
  const searchBookmarks = useCallback(async (query: string) => {
    try {
      return await bookmarkService.searchBookmarks(query)
    } catch (err) {
      console.error('Failed to search bookmarks:', err)
      setError(err instanceof Error ? err : new Error('Failed to search bookmarks'))
      return []
    }
  }, [])

  // 导出书签
  const exportBookmarks = useCallback(async () => {
    try {
      return await bookmarkService.exportBookmarks()
    } catch (err) {
      console.error('Failed to export bookmarks:', err)
      setError(err instanceof Error ? err : new Error('Failed to export bookmarks'))
      return null
    }
  }, [])

  // 导入书签
  const importBookmarks = useCallback(
    async (data: { bookmarks: Bookmark[]; folders: BookmarkFolder[] }) => {
      try {
        const success = await bookmarkService.importBookmarks(data)
        if (success) {
          await loadBookmarks() // 重新加载
        }
        return success
      } catch (err) {
        console.error('Failed to import bookmarks:', err)
        setError(err instanceof Error ? err : new Error('Failed to import bookmarks'))
        return false
      }
    },
    [loadBookmarks]
  )

  return {
    bookmarks,
    folders,
    bookmarkTree,
    loading,
    error,
    loadBookmarks,
    addBookmark,
    updateBookmark,
    deleteBookmark,
    addFolder,
    updateFolder,
    deleteFolder,
    searchBookmarks,
    exportBookmarks,
    importBookmarks
  }
}
