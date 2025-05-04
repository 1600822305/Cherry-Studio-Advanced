import { db } from '@renderer/databases'
import { v4 as uuidv4 } from 'uuid'

import { Bookmark, BookmarkFolder, BookmarkTreeNode } from '../types/bookmark'

/**
 * 书签服务类
 * 提供书签的增删改查功能
 */
class BookmarkService {
  /**
   * 添加书签
   * @param title 书签标题
   * @param url 书签URL
   * @param favicon 书签图标
   * @param parentId 父文件夹ID，null表示根目录
   * @returns 新创建的书签
   */
  async addBookmark(title: string, url: string, favicon?: string, parentId: string | null = null): Promise<Bookmark> {
    const now = new Date().toISOString()
    const bookmark: Bookmark = {
      id: uuidv4(),
      title,
      url,
      favicon,
      parentId,
      createdAt: now,
      updatedAt: now
    }

    await db.bookmarks.add(bookmark)
    return bookmark
  }

  /**
   * 更新书签
   * @param id 书签ID
   * @param updates 更新内容
   * @returns 更新后的书签
   */
  async updateBookmark(id: string, updates: Partial<Bookmark>): Promise<Bookmark | undefined> {
    const bookmark = await db.bookmarks.get(id)
    if (!bookmark) return undefined

    const updatedBookmark = {
      ...bookmark,
      ...updates,
      updatedAt: new Date().toISOString()
    }

    await db.bookmarks.update(id, updatedBookmark)
    return updatedBookmark
  }

  /**
   * 删除书签
   * @param id 书签ID
   * @returns 是否删除成功
   */
  async deleteBookmark(id: string): Promise<boolean> {
    try {
      await db.bookmarks.delete(id)
      return true
    } catch (error) {
      console.error('Failed to delete bookmark:', error)
      return false
    }
  }

  /**
   * 获取书签
   * @param id 书签ID
   * @returns 书签对象
   */
  async getBookmark(id: string): Promise<Bookmark | undefined> {
    return db.bookmarks.get(id)
  }

  /**
   * 获取所有书签
   * @returns 书签数组
   */
  async getAllBookmarks(): Promise<Bookmark[]> {
    return db.bookmarks.toArray()
  }

  /**
   * 获取指定文件夹下的书签
   * @param folderId 文件夹ID，null表示根目录
   * @returns 书签数组
   */
  async getBookmarksByFolder(folderId: string | null): Promise<Bookmark[]> {
    if (folderId === null) {
      // 获取所有书签，然后过滤出 parentId 为 null 的书签
      const allBookmarks = await db.bookmarks.toArray()
      return allBookmarks.filter((bookmark) => bookmark.parentId === null)
    }
    return db.bookmarks.where('parentId').equals(folderId).toArray()
  }

  /**
   * 添加书签文件夹
   * @param title 文件夹标题
   * @param parentId 父文件夹ID，null表示根目录
   * @returns 新创建的文件夹
   */
  async addFolder(title: string, parentId: string | null = null): Promise<BookmarkFolder> {
    const now = new Date().toISOString()
    const folder: BookmarkFolder = {
      id: uuidv4(),
      title,
      parentId,
      createdAt: now,
      updatedAt: now
    }

    await db.bookmark_folders.add(folder)
    return folder
  }

  /**
   * 更新书签文件夹
   * @param id 文件夹ID
   * @param updates 更新内容
   * @returns 更新后的文件夹
   */
  async updateFolder(id: string, updates: Partial<BookmarkFolder>): Promise<BookmarkFolder | undefined> {
    const folder = await db.bookmark_folders.get(id)
    if (!folder) return undefined

    const updatedFolder = {
      ...folder,
      ...updates,
      updatedAt: new Date().toISOString()
    }

    await db.bookmark_folders.update(id, updatedFolder)
    return updatedFolder
  }

  /**
   * 删除书签文件夹
   * @param id 文件夹ID
   * @param recursive 是否递归删除子文件夹和书签
   * @returns 是否删除成功
   */
  async deleteFolder(id: string, recursive: boolean = true): Promise<boolean> {
    try {
      if (recursive) {
        // 获取所有子文件夹
        const childFolders = await db.bookmark_folders.where('parentId').equals(id).toArray()

        // 递归删除子文件夹
        for (const folder of childFolders) {
          await this.deleteFolder(folder.id, true)
        }

        // 删除该文件夹下的所有书签
        await db.bookmarks.where('parentId').equals(id).delete()
      } else {
        // 将该文件夹下的书签和子文件夹移动到根目录
        await db.bookmarks.where('parentId').equals(id).modify({ parentId: null })
        await db.bookmark_folders.where('parentId').equals(id).modify({ parentId: null })
      }

      // 删除文件夹本身
      await db.bookmark_folders.delete(id)
      return true
    } catch (error) {
      console.error('Failed to delete bookmark folder:', error)
      return false
    }
  }

  /**
   * 获取书签文件夹
   * @param id 文件夹ID
   * @returns 文件夹对象
   */
  async getFolder(id: string): Promise<BookmarkFolder | undefined> {
    return db.bookmark_folders.get(id)
  }

  /**
   * 获取所有书签文件夹
   * @returns 文件夹数组
   */
  async getAllFolders(): Promise<BookmarkFolder[]> {
    return db.bookmark_folders.toArray()
  }

  /**
   * 获取指定文件夹下的子文件夹
   * @param parentId 父文件夹ID，null表示根目录
   * @returns 文件夹数组
   */
  async getSubFolders(parentId: string | null): Promise<BookmarkFolder[]> {
    if (parentId === null) {
      // 获取所有文件夹，然后过滤出 parentId 为 null 的文件夹
      const allFolders = await db.bookmark_folders.toArray()
      return allFolders.filter((folder) => folder.parentId === null)
    }
    return db.bookmark_folders.where('parentId').equals(parentId).toArray()
  }

  /**
   * 构建书签树
   * @returns 书签树结构
   */
  async getBookmarkTree(): Promise<BookmarkTreeNode[]> {
    const bookmarks = await this.getAllBookmarks()
    const folders = await this.getAllFolders()

    // 创建节点映射
    const nodeMap: Record<string, BookmarkTreeNode> = {}

    // 添加文件夹节点
    for (const folder of folders) {
      nodeMap[folder.id] = {
        ...folder,
        children: [],
        isFolder: true
      }
    }

    // 添加书签节点
    for (const bookmark of bookmarks) {
      nodeMap[bookmark.id] = {
        ...bookmark,
        isFolder: false
      }
    }

    // 构建树结构
    const rootNodes: BookmarkTreeNode[] = []

    // 处理文件夹
    for (const folder of folders) {
      const node = nodeMap[folder.id]

      if (folder.parentId === null) {
        rootNodes.push(node)
      } else if (nodeMap[folder.parentId]) {
        if (!nodeMap[folder.parentId].children) {
          nodeMap[folder.parentId].children = []
        }
        nodeMap[folder.parentId].children!.push(node)
      } else {
        // 父文件夹不存在，将节点添加到根目录
        rootNodes.push(node)
      }
    }

    // 处理书签
    for (const bookmark of bookmarks) {
      const node = nodeMap[bookmark.id]

      if (bookmark.parentId === null) {
        rootNodes.push(node)
      } else if (nodeMap[bookmark.parentId]) {
        if (!nodeMap[bookmark.parentId].children) {
          nodeMap[bookmark.parentId].children = []
        }
        nodeMap[bookmark.parentId].children!.push(node)
      } else {
        // 父文件夹不存在，将节点添加到根目录
        rootNodes.push(node)
      }
    }

    return rootNodes
  }

  /**
   * 导出书签数据
   * @returns 包含所有书签和文件夹的对象
   */
  async exportBookmarks(): Promise<{ bookmarks: Bookmark[]; folders: BookmarkFolder[] }> {
    const bookmarks = await this.getAllBookmarks()
    const folders = await this.getAllFolders()
    return { bookmarks, folders }
  }

  /**
   * 导入书签数据
   * @param data 包含书签和文件夹的对象
   * @returns 是否导入成功
   */
  async importBookmarks(data: { bookmarks: Bookmark[]; folders: BookmarkFolder[] }): Promise<boolean> {
    try {
      await db.transaction('rw', [db.bookmarks, db.bookmark_folders], async () => {
        // 先导入文件夹
        for (const folder of data.folders) {
          await db.bookmark_folders.put(folder)
        }

        // 再导入书签
        for (const bookmark of data.bookmarks) {
          await db.bookmarks.put(bookmark)
        }
      })
      return true
    } catch (error) {
      console.error('Failed to import bookmarks:', error)
      return false
    }
  }

  /**
   * 搜索书签
   * @param query 搜索关键词
   * @returns 匹配的书签数组
   */
  async searchBookmarks(query: string): Promise<Bookmark[]> {
    if (!query) return []

    const lowerQuery = query.toLowerCase()
    const bookmarks = await this.getAllBookmarks()

    return bookmarks.filter(
      (bookmark) => bookmark.title.toLowerCase().includes(lowerQuery) || bookmark.url.toLowerCase().includes(lowerQuery)
    )
  }
}

// 导出单例
export const bookmarkService = new BookmarkService()
