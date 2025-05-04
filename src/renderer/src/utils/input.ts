import { FileType } from '@renderer/types'
import Logger from 'electron-log/renderer'

// 声明一个接口，描述带有 path 属性的 File 对象
interface ElectronFile extends File {
  path: string
}

export const getFilesFromDropEvent = async (e: React.DragEvent<HTMLDivElement>): Promise<FileType[]> => {
  if (e.dataTransfer.files.length > 0) {
    // 使用 Electron 的 IPC 通道获取文件路径
    // 在 Electron 32.3.3 中，File.path 已被移除，所以我们需要使用替代方法

    // 首先，我们需要将文件转换为可以通过 IPC 传输的格式
    const files = Array.from(e.dataTransfer.files)

    // 使用 electron.remote 或 IPC 获取文件路径
    // 这里我们使用一个新的 IPC 方法来处理拖放的文件
    const results = await Promise.allSettled(
      files.map(async (file) => {
        try {
          // 检查文件是否有 path 属性（旧版 Electron）
          const hasPath = 'path' in file && typeof (file as any).path === 'string'

          if (hasPath) {
            // 如果有 path 属性，直接使用
            return window.api.file.get((file as ElectronFile).path)
          } else {
            // 对于没有 path 属性的文件（Electron 32.3.3+）
            // 我们需要将文件内容写入临时文件，然后获取该文件

            // 使用标准 File 属性，避免类型问题
            const fileName = file.name
            const tempFilePath = await window.api.file.create(fileName)

            // 读取文件内容
            const reader = new FileReader()
            const fileContent = await new Promise<ArrayBuffer>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as ArrayBuffer)
              reader.onerror = reject
              reader.readAsArrayBuffer(file)
            })

            const uint8Array = new Uint8Array(fileContent)
            await window.api.file.write(tempFilePath, uint8Array)
            return window.api.file.get(tempFilePath)
          }
        } catch (error) {
          Logger.error('[src/renderer/src/utils/input.ts] Processing dropped file:', error)
          return null
        }
      })
    )

    const list: FileType[] = []
    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value !== null) {
          list.push(result.value)
        }
      } else {
        Logger.error('[src/renderer/src/utils/input.ts] getFilesFromDropEvent:', result.reason)
      }
    }
    return list
  } else {
    return new Promise((resolve) => {
      let existCodefilesFormat = false
      for (const item of e.dataTransfer.items) {
        const { type } = item
        if (type === 'codefiles') {
          item.getAsString(async (filePathListString) => {
            const filePathList: string[] = JSON.parse(filePathListString)
            const filePathListPromises = filePathList.map((filePath) => window.api.file.get(filePath))
            resolve(
              await Promise.allSettled(filePathListPromises).then((results) =>
                results
                  .filter((result) => result.status === 'fulfilled')
                  .filter((result) => result.value !== null)
                  .map((result) => result.value!)
              )
            )
          })

          existCodefilesFormat = true
          break
        }
      }

      if (!existCodefilesFormat) {
        resolve([])
      }
    })
  }
}
