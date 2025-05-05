// src/main/mcpServers/function-plot.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js'
import axios from 'axios'
import Logger from 'electron-log'

// 定义函数绘图工具的参数接口
interface PlotFunctionArgs {
  /**
   * 要绘制的函数表达式，例如 "x^2", "2*x+1" 等
   */
  expression: string

  /**
   * X轴的最小值
   */
  xMin?: number

  /**
   * X轴的最大值
   */
  xMax?: number

  /**
   * Y轴的最小值，如果不提供则自动计算
   */
  yMin?: number

  /**
   * Y轴的最大值，如果不提供则自动计算
   */
  yMax?: number

  /**
   * 图表标题
   */
  title?: string

  /**
   * X轴标签
   */
  xLabel?: string

  /**
   * Y轴标签
   */
  yLabel?: string

  /**
   * 图表宽度（像素）
   */
  width?: number

  /**
   * 图表高度（像素）
   */
  height?: number

  /**
   * 数据点数量，越多曲线越平滑
   */
  points?: number

  /**
   * 线条颜色
   */
  color?: string
}

// 验证函数绘图参数
function isValidPlotFunctionArgs(args: any): args is PlotFunctionArgs {
  if (!args || typeof args !== 'object') return false
  if (typeof args.expression !== 'string' || args.expression.trim() === '') return false

  // 验证可选参数（如果提供）
  if (args.xMin !== undefined && typeof args.xMin !== 'number') return false
  if (args.xMax !== undefined && typeof args.xMax !== 'number') return false
  if (args.yMin !== undefined && typeof args.yMin !== 'number') return false
  if (args.yMax !== undefined && typeof args.yMax !== 'number') return false
  if (args.title !== undefined && typeof args.title !== 'string') return false
  if (args.xLabel !== undefined && typeof args.xLabel !== 'string') return false
  if (args.yLabel !== undefined && typeof args.yLabel !== 'string') return false
  if (args.width !== undefined && (typeof args.width !== 'number' || args.width <= 0)) return false
  if (args.height !== undefined && (typeof args.height !== 'number' || args.height <= 0)) return false
  if (args.points !== undefined && (typeof args.points !== 'number' || args.points <= 0)) return false
  if (args.color !== undefined && typeof args.color !== 'string') return false

  return true
}

// 计算函数值
function evaluateExpression(expression: string, x: number): number {
  try {
    // 替换常见的数学表达式为JavaScript可以理解的形式
    const jsExpression = expression
      .replace(/\^/g, '**') // 将 ^ 替换为 **
      .replace(/sin\(/g, 'Math.sin(')
      .replace(/cos\(/g, 'Math.cos(')
      .replace(/tan\(/g, 'Math.tan(')
      .replace(/sqrt\(/g, 'Math.sqrt(')
      .replace(/abs\(/g, 'Math.abs(')
      .replace(/log\(/g, 'Math.log(')
      .replace(/exp\(/g, 'Math.exp(')
      .replace(/pi/g, 'Math.PI')
      .replace(/e/g, 'Math.E')

    // 使用Function构造函数创建一个可以计算表达式的函数
    const func = new Function('x', `return ${jsExpression}`)
    return func(x)
  } catch (error) {
    Logger.error(`[FunctionPlot] 表达式计算错误: ${error}`)
    throw new Error(`表达式计算错误: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// 分析函数表达式并确定合适的范围
function analyzeFunctionExpression(expression: string): { xMin: number; xMax: number } {
  try {
    // 默认范围
    let xMin = -10
    let xMax = 10

    // 尝试识别函数类型
    const normalizedExpression = expression
      .replace(/\s+/g, '') // 移除空格
      .replace(/\*/g, '') // 移除乘法符号
      .replace(/\^/g, '**') // 将 ^ 替换为 **
      .toLowerCase() // 转换为小写

    // 检查是否是二次函数 (ax^2 + bx + c)
    const quadraticRegex = /^([-+]?\d*\.?\d*)x\*\*2([-+]\d*\.?\d*x)?([-+]\d*\.?\d*)?$/
    const quadraticMatch = normalizedExpression.match(quadraticRegex)

    if (quadraticMatch) {
      // 提取系数
      const a = quadraticMatch[1] ? parseFloat(quadraticMatch[1]) : 1

      // 如果是二次函数，计算顶点
      // 对于 ax^2 + bx + c，顶点的 x 坐标是 -b/(2a)
      let b = 0
      if (quadraticMatch[2]) {
        const bMatch = quadraticMatch[2].match(/([-+]?\d*\.?\d*)x/)
        if (bMatch && bMatch[1]) {
          b = parseFloat(bMatch[1])
        }
      }

      // 计算顶点的 x 坐标
      const vertexX = -b / (2 * a)

      // 根据顶点和系数设置范围
      // 如果 a > 0，函数是开口向上的抛物线
      // 如果 a < 0，函数是开口向下的抛物线
      const rangeWidth = Math.max(Math.abs(vertexX) * 2, 10) // 至少包含 -5 到 5
      xMin = vertexX - rangeWidth / 2
      xMax = vertexX + rangeWidth / 2

      // 确保范围至少有一定宽度
      if (xMax - xMin < 10) {
        const center = (xMin + xMax) / 2
        xMin = center - 5
        xMax = center + 5
      }

      Logger.info(`[FunctionPlot] 检测到二次函数，顶点 x = ${vertexX}，设置范围为 [${xMin}, ${xMax}]`)
      return { xMin, xMax }
    }

    // 检查是否是三角函数
    if (
      normalizedExpression.includes('sin') ||
      normalizedExpression.includes('cos') ||
      normalizedExpression.includes('tan')
    ) {
      // 对于三角函数，通常显示几个周期
      xMin = -2 * Math.PI
      xMax = 2 * Math.PI
      Logger.info(`[FunctionPlot] 检测到三角函数，设置范围为 [${xMin}, ${xMax}]`)
      return { xMin, xMax }
    }

    // 检查是否是指数函数
    if (normalizedExpression.includes('exp') || normalizedExpression.includes('e**')) {
      // 对于指数函数，通常显示较小的范围
      xMin = -5
      xMax = 5
      Logger.info(`[FunctionPlot] 检测到指数函数，设置范围为 [${xMin}, ${xMax}]`)
      return { xMin, xMax }
    }

    // 检查是否是对数函数
    if (normalizedExpression.includes('log')) {
      // 对于对数函数，通常显示正数范围
      xMin = 0.1
      xMax = 10
      Logger.info(`[FunctionPlot] 检测到对数函数，设置范围为 [${xMin}, ${xMax}]`)
      return { xMin, xMax }
    }

    // 默认范围
    Logger.info(`[FunctionPlot] 使用默认范围 [${xMin}, ${xMax}]`)
    return { xMin, xMax }
  } catch (error) {
    Logger.error(`[FunctionPlot] 分析函数表达式错误: ${error}`)
    // 出错时返回默认范围
    return { xMin: -10, xMax: 10 }
  }
}

// 函数绘图服务器类
class FunctionPlotServer {
  public server: Server

  constructor() {
    Logger.info('[FunctionPlot] 创建服务器')

    // 初始化服务器
    this.server = new Server(
      {
        name: 'function-plot-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {
            listChanged: true
          }
        }
      }
    )

    Logger.info('[FunctionPlot] 服务器初始化完成')
    this.setupRequestHandlers()
  }

  // 设置请求处理程序
  private setupRequestHandlers() {
    // 列出工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      Logger.info('[FunctionPlot] 列出工具请求')
      return {
        tools: [
          {
            name: 'plot_function',
            description: '绘制数学函数图像，支持二次函数、线性函数等。返回PNG格式的图像。',
            inputSchema: {
              type: 'object',
              properties: {
                expression: {
                  type: 'string',
                  description: '必需。要绘制的函数表达式，例如 "x^2", "2*x+1" 等'
                },
                xMin: {
                  type: 'number',
                  description: '可选。X轴的最小值，默认为 -10'
                },
                xMax: {
                  type: 'number',
                  description: '可选。X轴的最大值，默认为 10'
                },
                yMin: {
                  type: 'number',
                  description: '可选。Y轴的最小值，如果不提供则自动计算'
                },
                yMax: {
                  type: 'number',
                  description: '可选。Y轴的最大值，如果不提供则自动计算'
                },
                title: {
                  type: 'string',
                  description: '可选。图表标题'
                },
                xLabel: {
                  type: 'string',
                  description: '可选。X轴标签，默认为 "x"'
                },
                yLabel: {
                  type: 'string',
                  description: '可选。Y轴标签，默认为 "y"'
                },
                width: {
                  type: 'number',
                  description: '可选。图表宽度（像素），默认为 800'
                },
                height: {
                  type: 'number',
                  description: '可选。图表高度（像素），默认为 600'
                },
                points: {
                  type: 'number',
                  description: '可选。数据点数量，越多曲线越平滑，默认为 100'
                },
                color: {
                  type: 'string',
                  description: '可选。线条颜色，默认为 "rgb(75, 192, 192)"'
                }
              },
              required: ['expression']
            }
          }
        ]
      }
    })

    // 处理工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      Logger.info(`[FunctionPlot] 工具调用: ${name}`, args)

      try {
        if (name === 'plot_function') {
          return await this.handlePlotFunction(args)
        }

        throw new McpError(ErrorCode.MethodNotFound, `未知工具: ${name}`)
      } catch (error) {
        Logger.error(`[FunctionPlot] 处理工具调用 ${name} 时出错:`, error)
        return {
          content: [
            {
              type: 'text',
              text: error instanceof Error ? error.message : String(error)
            }
          ],
          isError: true
        }
      }
    })
  }

  // 处理绘制函数图像
  private async handlePlotFunction(args: any) {
    // 验证参数
    if (!isValidPlotFunctionArgs(args)) {
      Logger.error('[FunctionPlot] 无效的参数:', args)
      throw new McpError(ErrorCode.InvalidParams, '无效的参数。必需: expression (字符串)。')
    }

    try {
      // 设置默认值
      const expression = args.expression

      // 分析函数表达式，确定合适的 x 轴范围
      const { xMin: autoXMin, xMax: autoXMax } = analyzeFunctionExpression(expression)

      // 使用用户提供的范围或自动计算的范围
      const xMin = args.xMin !== undefined ? args.xMin : autoXMin
      const xMax = args.xMax !== undefined ? args.xMax : autoXMax
      const title = args.title || `函数: ${expression}`
      const xLabel = args.xLabel || 'x'
      const yLabel = args.yLabel || 'y'
      const width = args.width || 800
      const height = args.height || 500
      const points = args.points || 100
      const color = args.color || 'rgb(75, 192, 192)'

      // 创建数据点
      const step = (xMax - xMin) / (points - 1)
      const xValues: number[] = []
      const yValues: number[] = []
      let minY = Infinity
      let maxY = -Infinity

      for (let i = 0; i < points; i++) {
        const x = xMin + i * step
        try {
          const y = evaluateExpression(expression, x)

          // 跳过无效值
          if (isNaN(y) || !isFinite(y)) continue

          xValues.push(x)
          yValues.push(y)

          // 更新Y轴范围
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        } catch (error) {
          Logger.warn(`[FunctionPlot] 计算点 (${x}) 时出错:`, error)
          // 跳过出错的点
          continue
        }
      }

      // 如果没有有效数据点，抛出错误
      if (xValues.length === 0) {
        throw new Error('无法计算任何有效的函数值。请检查您的表达式。')
      }

      // 设置Y轴范围，如果没有提供
      const yMin = args.yMin !== undefined ? args.yMin : minY - (maxY - minY) * 0.1
      const yMax = args.yMax !== undefined ? args.yMax : maxY + (maxY - minY) * 0.1

      // 使用 QuickChart.io API 生成图表
      // 构建 Chart.js 配置
      const chartConfig = {
        type: 'line',
        data: {
          datasets: [
            // 函数曲线
            {
              label: expression,
              data: xValues.map((x, i) => ({ x, y: yValues[i] })),
              borderColor: color,
              backgroundColor: 'rgba(0, 0, 0, 0)',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.4
            },
            // X轴线 (y=0)
            {
              label: 'X轴',
              data: [
                { x: xMin, y: 0 },
                { x: xMax, y: 0 }
              ],
              borderColor: 'rgba(0, 0, 0, 0.5)',
              borderWidth: 1,
              pointRadius: 0,
              tension: 0,
              borderDash: [],
              hidden: yMin > 0 || yMax < 0 // 如果Y轴范围不包含0，则隐藏X轴
            },
            // Y轴线 (x=0)
            {
              label: 'Y轴',
              data: [
                { x: 0, y: yMin },
                { x: 0, y: yMax }
              ],
              borderColor: 'rgba(0, 0, 0, 0.5)',
              borderWidth: 1,
              pointRadius: 0,
              tension: 0,
              borderDash: [],
              hidden: xMin > 0 || xMax < 0 // 如果X轴范围不包含0，则隐藏Y轴
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: title,
              font: {
                size: 16
              }
            },
            legend: {
              display: true,
              position: 'top',
              labels: {
                filter: function (legendItem: { text: string }) {
                  // 只显示函数曲线的图例，隐藏坐标轴线的图例
                  return legendItem.text === expression
                }
              }
            }
          },
          scales: {
            x: {
              type: 'linear',
              position: 'center', // 将X轴放在中间
              title: {
                display: true,
                text: xLabel
              },
              min: xMin,
              max: xMax,
              grid: {
                color: 'rgba(0, 0, 0, 0.1)',
                borderColor: 'rgba(0, 0, 0, 0.5)',
                tickColor: 'rgba(0, 0, 0, 0.5)',
                drawBorder: true,
                drawOnChartArea: true,
                drawTicks: true,
                display: true
              },
              ticks: {
                display: true,
                color: 'rgba(0, 0, 0, 0.8)'
              },
              border: {
                display: true,
                color: 'rgba(0, 0, 0, 0.5)',
                width: 1
              }
            },
            y: {
              type: 'linear',
              position: 'center', // 将Y轴放在中间
              title: {
                display: true,
                text: yLabel
              },
              min: yMin,
              max: yMax,
              grid: {
                color: 'rgba(0, 0, 0, 0.1)',
                borderColor: 'rgba(0, 0, 0, 0.5)',
                tickColor: 'rgba(0, 0, 0, 0.5)',
                drawBorder: true,
                drawOnChartArea: true,
                drawTicks: true,
                display: true
              },
              ticks: {
                display: true,
                color: 'rgba(0, 0, 0, 0.8)'
              },
              border: {
                display: true,
                color: 'rgba(0, 0, 0, 0.5)',
                width: 1
              }
            }
          }
        }
      }

      // 将配置转换为 URL 参数
      const chartConfigStr = encodeURIComponent(JSON.stringify(chartConfig))

      // 构建 QuickChart.io URL
      const chartUrl = `https://quickchart.io/chart?c=${chartConfigStr}&w=${width}&h=${height}&v=4&backgroundColor=white`

      // 生成 Desmos 链接
      const desmosLink = this.generateDesmosLink(expression)

      // 生成 GeoGebra 链接
      const geogebraLink = this.generateGeoGebraLink(expression)

      // 生成 FunctionPlot 链接
      const functionPlotLink = this.generateFunctionPlotLink(expression, xMin, xMax, yMin, yMax)

      // 获取图像并转换为 base64
      try {
        // 获取图像
        const response = await axios.get(chartUrl, { responseType: 'arraybuffer' })
        const imageBuffer = Buffer.from(response.data, 'binary')
        const base64Image = imageBuffer.toString('base64')

        // 返回 base64 编码的图像和在线绘图工具链接
        return {
          content: [
            {
              type: 'text',
              text:
                `## ${title}\n\n` +
                `函数: ${expression}\n` +
                `x 范围: [${xMin}, ${xMax}]\n` +
                `y 范围: [${yMin.toFixed(2)}, ${yMax.toFixed(2)}]\n\n` +
                `在线查看此函数:\n` +
                `- [在 Desmos 中查看](${desmosLink})\n` +
                `- [在 GeoGebra 中查看](${geogebraLink})\n` +
                `- [在 FunctionPlot 中查看](${functionPlotLink})\n`
            },
            {
              type: 'image',
              data: base64Image,
              mimeType: 'image/png',
              title: title,
              description: `函数: ${expression}, x 范围: [${xMin}, ${xMax}], y 范围: [${yMin.toFixed(2)}, ${yMax.toFixed(2)}]`
            }
          ]
        }
      } catch (imageError) {
        Logger.error('[FunctionPlot] 获取图像失败:', imageError)

        // 如果获取图像失败，回退到返回图像 URL
        return {
          content: [
            {
              type: 'text',
              text:
                `## ${title}\n\n` +
                `![${expression}](${chartUrl})\n\n` +
                `函数: ${expression}\n` +
                `x 范围: [${xMin}, ${xMax}]\n` +
                `y 范围: [${yMin.toFixed(2)}, ${yMax.toFixed(2)}]\n\n` +
                `在线查看此函数:\n` +
                `- [在 Desmos 中查看](${desmosLink})\n` +
                `- [在 GeoGebra 中查看](${geogebraLink})\n` +
                `- [在 FunctionPlot 中查看](${functionPlotLink})\n`
            }
          ]
        }
      }
    } catch (error) {
      Logger.error('[FunctionPlot] 绘制函数图像失败:', error)

      // 如果失败，回退到生成在线绘图工具链接
      try {
        const expression = args.expression

        // 分析函数表达式，确定合适的 x 轴范围
        const { xMin: autoXMin, xMax: autoXMax } = analyzeFunctionExpression(expression)

        // 使用用户提供的范围或自动计算的范围
        const xMin = args.xMin !== undefined ? args.xMin : autoXMin
        const xMax = args.xMax !== undefined ? args.xMax : autoXMax
        const yMin = args.yMin
        const yMax = args.yMax

        const desmosLink = this.generateDesmosLink(expression)
        const geogebraLink = this.generateGeoGebraLink(expression)
        const functionPlotLink = this.generateFunctionPlotLink(expression, xMin, xMax, yMin, yMax)

        return {
          content: [
            {
              type: 'text',
              text:
                `## 函数: ${expression}\n\n` +
                `无法生成函数图像，请使用以下链接在线查看:\n` +
                `- [在 Desmos 中查看](${desmosLink})\n` +
                `- [在 GeoGebra 中查看](${geogebraLink})\n` +
                `- [在 FunctionPlot 中查看](${functionPlotLink})\n\n` +
                `错误信息: ${error instanceof Error ? error.message : String(error)}`
            }
          ],
          isError: true
        }
      } catch (linkError) {
        throw new Error(`绘制函数图像失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  // 生成 Desmos 链接
  private generateDesmosLink(expression: string): string {
    // 替换表达式中的特殊字符
    const formattedExpression = expression
      .replace(/\^/g, '%5E')
      .replace(/\+/g, '%2B')
      .replace(/\//g, '%2F')
      .replace(/\*/g, '*')
      .replace(/ /g, '')

    return `https://www.desmos.com/calculator?expression=${formattedExpression}`
  }

  // 生成 GeoGebra 链接
  private generateGeoGebraLink(expression: string): string {
    // 替换表达式中的特殊字符
    const formattedExpression = expression
      .replace(/\^/g, '%5E')
      .replace(/\+/g, '%2B')
      .replace(/\//g, '%2F')
      .replace(/\*/g, '*')
      .replace(/ /g, '')

    return `https://www.geogebra.org/calculator?expression=${formattedExpression}`
  }

  // 生成 FunctionPlot 链接
  private generateFunctionPlotLink(
    expression: string,
    xMin: number,
    xMax: number,
    yMin?: number,
    yMax?: number
  ): string {
    // 创建 FunctionPlot 配置
    const config = {
      target: '#plot',
      width: 800,
      height: 500,
      grid: true,
      xAxis: {
        domain: [xMin, xMax]
      },
      yAxis: {
        domain: yMin !== undefined && yMax !== undefined ? [yMin, yMax] : undefined
      },
      data: [
        {
          fn: expression
        }
      ]
    }

    // 将配置转换为 URL 参数
    const configStr = encodeURIComponent(JSON.stringify(config))

    // 构建 Observable 链接
    return `https://observablehq.com/@mauriciopoppe/function-plot?config=${configStr}`
  }
}

export default FunctionPlotServer
