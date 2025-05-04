import { getFileType } from '@main/utils/file'
import { FileType } from '@types'
import { app } from 'electron'
import logger from 'electron-log'
import * as fs from 'fs'
import * as path from 'path'
import { PDFDocument } from 'pdf-lib'
import { v4 as uuidv4 } from 'uuid'

export class PDFService {
  // 使用方法而不是静态属性来获取目录路径
  private static getTempDir(): string {
    return path.join(app.getPath('temp'), 'CherryStudio')
  }

  private static getStorageDir(): string {
    return path.join(app.getPath('userData'), 'files')
  }

  /**
   * 获取PDF文件的页数
   * @param _ Electron IPC事件
   * @param filePath PDF文件路径
   * @returns PDF文件的页数
   */
  static async getPDFPageCount(_: Electron.IpcMainInvokeEvent, filePath: string): Promise<number> {
    try {
      logger.info(`[PDFService] Getting page count for PDF: ${filePath}`)
      const pdfBytes = fs.readFileSync(filePath)
      const pdfDoc = await PDFDocument.load(pdfBytes)
      const pageCount = pdfDoc.getPageCount()
      logger.info(`[PDFService] PDF page count: ${pageCount}`)
      return pageCount
    } catch (error) {
      logger.error('[PDFService] Error getting PDF page count:', error)
      throw error
    }
  }

  /**
   * 分割PDF文件
   * @param _ Electron IPC事件
   * @param file 原始PDF文件
   * @param pageRange 页码范围，例如：1-5,8,10-15
   * @returns 分割后的PDF文件信息
   */
  static async splitPDF(_: Electron.IpcMainInvokeEvent, file: FileType, pageRange: string): Promise<FileType> {
    try {
      logger.info(`[PDFService] Splitting PDF: ${file.path}, page range: ${pageRange}`)
      logger.info(`[PDFService] File details:`, JSON.stringify(file))

      // 确保临时目录存在
      const tempDir = PDFService.getTempDir()
      if (!fs.existsSync(tempDir)) {
        logger.info(`[PDFService] Creating temp directory: ${tempDir}`)
        fs.mkdirSync(tempDir, { recursive: true })
      }

      // 确保存储目录存在
      const storageDir = PDFService.getStorageDir()
      if (!fs.existsSync(storageDir)) {
        logger.info(`[PDFService] Creating storage directory: ${storageDir}`)
        fs.mkdirSync(storageDir, { recursive: true })
      }

      // 读取原始PDF文件
      logger.info(`[PDFService] Reading PDF file: ${file.path}`)
      const pdfBytes = fs.readFileSync(file.path)
      logger.info(`[PDFService] PDF file read, size: ${pdfBytes.length} bytes`)
      const pdfDoc = await PDFDocument.load(pdfBytes)
      logger.info(`[PDFService] PDF document loaded, page count: ${pdfDoc.getPageCount()}`)

      // 创建新的PDF文档
      const newPdfDoc = await PDFDocument.create()
      logger.info(`[PDFService] New PDF document created`)

      // 解析页码范围
      const pageIndexes = this.parsePageRange(pageRange, pdfDoc.getPageCount())
      logger.info(`[PDFService] Page range parsed, indexes: ${pageIndexes.join(', ')}`)

      // 复制指定页面到新文档
      const copiedPages = await newPdfDoc.copyPages(pdfDoc, pageIndexes)
      logger.info(`[PDFService] Pages copied, count: ${copiedPages.length}`)
      copiedPages.forEach((page, index) => {
        logger.info(`[PDFService] Adding page ${index + 1} to new document`)
        newPdfDoc.addPage(page)
      })

      // 保存新文档
      logger.info(`[PDFService] Saving new PDF document`)
      const newPdfBytes = await newPdfDoc.save()
      logger.info(`[PDFService] New PDF document saved, size: ${newPdfBytes.length} bytes`)

      // 生成新文件ID和路径
      const uuid = uuidv4()
      const ext = '.pdf'
      // 使用之前已经声明的storageDir变量
      const destPath = path.join(storageDir, uuid + ext)
      logger.info(`[PDFService] Destination path: ${destPath}`)

      // 写入新文件
      logger.info(`[PDFService] Writing new PDF file`)
      fs.writeFileSync(destPath, newPdfBytes)
      logger.info(`[PDFService] New PDF file written`)

      // 获取文件状态
      const stats = fs.statSync(destPath)
      logger.info(`[PDFService] File stats: size=${stats.size}, created=${stats.birthtime}`)

      // 创建新文件信息
      const newFile: FileType = {
        id: uuid,
        origin_name: `${path.basename(file.origin_name, '.pdf')}_pages_${pageRange}.pdf`,
        name: uuid + ext,
        path: destPath,
        created_at: stats.birthtime.toISOString(),
        size: stats.size,
        ext: ext,
        type: getFileType(ext),
        count: 1,
        pdf_page_range: pageRange
      }

      logger.info(`[PDFService] PDF split successful: ${newFile.path}`)
      logger.info(`[PDFService] New file details:`, JSON.stringify(newFile))
      return newFile
    } catch (error) {
      logger.error('[PDFService] Error splitting PDF:', error)
      throw error
    }
  }

  /**
   * 解析页码范围字符串为页码索引数组
   * @param pageRange 页码范围字符串，例如：1-5,8,10-15
   * @param totalPages PDF文档总页数
   * @returns 页码索引数组（从0开始）
   */
  private static parsePageRange(pageRange: string, totalPages: number): number[] {
    logger.info(`[PDFService] Parsing page range: ${pageRange}, total pages: ${totalPages}`)
    const pageIndexes: number[] = []
    const parts = pageRange.split(',')
    logger.info(`[PDFService] Page range parts: ${JSON.stringify(parts)}`)

    try {
      for (const part of parts) {
        const trimmed = part.trim()
        if (!trimmed) {
          logger.info(`[PDFService] Empty part, skipping`)
          continue
        }

        logger.info(`[PDFService] Processing part: ${trimmed}`)

        if (trimmed.includes('-')) {
          const [startStr, endStr] = trimmed.split('-')
          const start = parseInt(startStr.trim())
          const end = parseInt(endStr.trim())
          logger.info(`[PDFService] Range part: ${trimmed}, start: ${start}, end: ${end}`)

          if (isNaN(start) || isNaN(end)) {
            logger.error(`[PDFService] Invalid range part (NaN): ${trimmed}`)
            continue
          }

          if (start < 1 || end > totalPages || start > end) {
            logger.warn(`[PDFService] Invalid range: ${start}-${end}, totalPages: ${totalPages}`)
            continue
          }

          for (let i = start; i <= end; i++) {
            pageIndexes.push(i - 1) // PDF页码从0开始，但用户输入从1开始
            logger.info(`[PDFService] Added page index: ${i - 1} (page ${i})`)
          }
        } else {
          const page = parseInt(trimmed)
          logger.info(`[PDFService] Single page: ${page}`)

          if (isNaN(page)) {
            logger.error(`[PDFService] Invalid page number (NaN): ${trimmed}`)
            continue
          }

          if (page < 1 || page > totalPages) {
            logger.warn(`[PDFService] Page ${page} out of range, totalPages: ${totalPages}`)
            continue
          }

          pageIndexes.push(page - 1) // PDF页码从0开始，但用户输入从1开始
          logger.info(`[PDFService] Added page index: ${page - 1} (page ${page})`)
        }
      }

      // 去重并排序
      const result = [...new Set(pageIndexes)].sort((a, b) => a - b)
      logger.info(`[PDFService] Final page indexes: ${result.join(', ')}`)
      return result
    } catch (error) {
      logger.error(`[PDFService] Error parsing page range: ${error}`)
      // 如果解析出错，返回空数组
      return []
    }
  }
}
