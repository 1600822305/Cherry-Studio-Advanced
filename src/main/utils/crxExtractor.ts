import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { app } from 'electron'
import log from 'electron-log'

/**
 * 解析CRX文件并提取为未打包的扩展
 * 参考: https://developer.chrome.com/docs/extensions/reference/crx/
 */
export async function extractCrxFile(crxFilePath: string): Promise<string> {
  try {
    // 检查文件路径
    if (!crxFilePath || typeof crxFilePath !== 'string') {
      throw new Error('无效的CRX文件路径')
    }

    // 检查文件是否存在
    if (!fs.existsSync(crxFilePath)) {
      throw new Error(`CRX文件不存在: ${crxFilePath}`)
    }

    // 读取CRX文件
    let crxBuffer: Buffer
    try {
      crxBuffer = fs.readFileSync(crxFilePath)

      // 检查文件大小是否合理
      if (crxBuffer.length < 16) {
        throw new Error('文件太小，不是有效的CRX文件')
      }
    } catch (readError: any) {
      log.error('读取CRX文件失败:', readError)
      throw new Error(`读取CRX文件失败: ${readError.message}`)
    }

    // 检查CRX文件头
    const header = crxBuffer.slice(0, 4).toString()
    if (header !== 'Cr24') {
      throw new Error('无效的CRX文件格式: 文件头不是Cr24')
    }

    // 解析CRX版本
    const version = crxBuffer.readUInt32LE(4)
    log.info(`CRX版本: ${version}`)

    let publicKeyLength = 0
    let signatureLength = 0
    let headerSize = 0
    let zipStartOffset = 0

    // 根据CRX版本解析文件
    if (version === 2) {
      publicKeyLength = crxBuffer.readUInt32LE(8)
      signatureLength = crxBuffer.readUInt32LE(12)
      headerSize = 16
      zipStartOffset = headerSize + publicKeyLength + signatureLength
    } else if (version === 3) {
      headerSize = 12
      const headerLength = crxBuffer.readUInt32LE(8)
      zipStartOffset = headerSize + headerLength
    } else {
      throw new Error(`不支持的CRX版本: ${version}`)
    }

    // 检查zipStartOffset是否合理
    if (zipStartOffset >= crxBuffer.length) {
      throw new Error('CRX文件格式错误: ZIP内容偏移量超出文件范围')
    }

    // 提取ZIP内容
    const zipContent = crxBuffer.slice(zipStartOffset)

    // 创建临时目录存放解压后的扩展
    const extensionsDir = path.join(app.getPath('userData'), 'extensions')
    if (!fs.existsSync(extensionsDir)) {
      fs.mkdirSync(extensionsDir, { recursive: true })
    }

    // 为扩展创建唯一ID (使用文件哈希)
    const hash = crypto.createHash('md5').update(crxBuffer).digest('hex')
    const extractDir = path.join(extensionsDir, `crx_${hash}`)

    // 如果目录已存在，先删除
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true })
    }

    // 创建目录
    fs.mkdirSync(extractDir, { recursive: true })

    // 保存ZIP内容到临时文件
    const zipPath = path.join(extractDir, 'temp.zip')
    fs.writeFileSync(zipPath, zipContent)

    // 解压ZIP文件
    try {
      const AdmZip = require('adm-zip')
      const zip = new AdmZip(zipPath)
      zip.extractAllTo(extractDir, true)
    } catch (zipError: any) {
      log.error('解压ZIP内容失败:', zipError)
      throw new Error(`解压ZIP内容失败: ${zipError.message}`)
    }

    // 删除临时ZIP文件
    try {
      fs.unlinkSync(zipPath)
    } catch (error) {
      log.warn('删除临时ZIP文件失败:', error)
      // 不抛出异常，继续处理
    }

    // 检查manifest.json是否存在
    const manifestPath = path.join(extractDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      throw new Error('无效的扩展: 找不到manifest.json文件')
    }

    log.info(`CRX扩展成功解压到: ${extractDir}`)
    return extractDir
  } catch (error) {
    log.error('解析CRX文件失败:', error)
    throw error
  }
}
