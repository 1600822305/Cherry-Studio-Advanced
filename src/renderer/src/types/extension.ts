// 扩展相关类型定义
export interface Extension {
  id: string
  name: string
  version: string
  description?: string
  icons?: Array<{
    size: number
    url: string
  }>
  hostPermissions?: string[]
  permissions?: string[]
  manifest: any
}
