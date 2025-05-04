import { WebviewTag } from 'electron'

import { BrowserAction, executeBrowserAction } from './browserAutomation'
import { generateAIResponse } from './chatUtils'
import { getWebviewContent } from './webContentUtils'

/**
 * AI控制器类型
 */
export type AIControllerAction = {
  type: 'navigate' | 'search' | 'click' | 'type' | 'execute' | 'analyze'
  instruction: string
  context?: string
}

/**
 * 让AI分析用户指令并决定如何操控浏览器
 * @param instruction 用户指令
 * @param webview webview元素
 * @param model 使用的AI模型
 * @returns 操作结果
 */
export async function letAIControlBrowser(
  instruction: string,
  webview: WebviewTag | null,
  model: any
): Promise<{
  success: boolean
  content?: string
  action?: string
  error?: string
}> {
  if (!webview) {
    return { success: false, error: 'Webview not available' }
  }

  try {
    // 获取当前页面内容作为上下文
    const pageContent = await getWebviewContent(webview)
    const currentUrl = await webview.executeJavaScript('window.location.href')

    // 构建提示词，让AI决定如何操控浏览器
    const prompt = `
你是一个浏览器自动化助手，你有能力直接控制浏览器执行各种操作。用户的指令将由你来解析并执行。
这不是一个假设的场景，你真的可以控制浏览器。

当前浏览器URL: ${currentUrl}
当前页面内容摘要: ${pageContent.substring(0, 500)}...

用户指令: "${instruction}"

重要提示：你必须选择一个操作来执行，而不是简单地回复用户。你有以下操作可以执行:

1. navigate: 导航到特定URL
   - 例如：当用户说"打开百度"时，你应该导航到"https://www.baidu.com"
   - 例如：当用户说"去知乎"时，你应该导航到"https://www.zhihu.com"

2. search: 使用搜索引擎搜索
   - 例如：当用户说"搜索人工智能最新进展"时，你应该使用百度搜索"人工智能最新进展"
   - 例如：当用户说"谷歌搜索机器学习"时，你应该使用谷歌搜索"机器学习"

3. click: 点击页面上的元素
   - 例如：当用户说"点击登录按钮"时，你应该点击页面上的登录按钮
   - 例如：当用户说"点击第一个搜索结果"时，你应该点击第一个搜索结果

4. type: 在输入框中输入文本
   - 例如：当用户说"在搜索框中输入深度学习"时，你应该在搜索框中输入"深度学习"
   - 例如：当用户说"填写用户名为admin"时，你应该在用户名输入框中输入"admin"

5. execute: 执行JavaScript代码
   - 例如：当用户说"获取页面标题"时，你应该执行"document.title"
   - 例如：当用户说"滚动到页面底部"时，你应该执行"window.scrollTo(0, document.body.scrollHeight)"

6. analyze: 分析当前页面内容
   - 例如：当用户说"分析这个页面的主要内容"时，你应该分析页面内容
   - 例如：当用户说"总结这篇文章"时，你应该分析并总结页面内容

你必须以JSON格式返回你的决定，格式如下:
{
  "action": "操作类型(navigate/search/click/type/execute/analyze)",
  "params": {
    // 根据操作类型提供必要的参数
    // navigate: { "url": "完整URL" }
    // search: { "engine": "baidu/google/bing", "query": "搜索查询" }
    // click: { "selector": "CSS选择器或描述性文本" }
    // type: { "selector": "CSS选择器或描述性文本", "text": "要输入的文本" }
    // execute: { "code": "JavaScript代码" }
    // analyze: { "focus": "分析重点(可选)" }
  },
  "reasoning": "你的决策理由"
}

只返回JSON对象，不要有其他文本。不要解释你的回答，只返回JSON。
记住：你必须执行一个操作，而不是简单地回复用户。
`

    // 调用AI模型获取决策
    const aiDecision = await generateAIResponse(prompt, [], model)

    // 解析AI的决策
    let decision
    try {
      // 尝试提取JSON部分
      const jsonMatch = aiDecision.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        decision = JSON.parse(jsonMatch[0])
      } else {
        // 如果没有找到JSON格式，尝试直接解析
        try {
          decision = JSON.parse(aiDecision)
        } catch (innerError) {
          // 如果直接解析失败，尝试使用更宽松的方法提取JSON
          console.warn('Failed to parse AI decision directly, trying fallback methods')

          // 尝试查找可能的JSON开始位置
          const possibleJsonStart = aiDecision.indexOf('{')
          const possibleJsonEnd = aiDecision.lastIndexOf('}')

          if (possibleJsonStart !== -1 && possibleJsonEnd !== -1 && possibleJsonEnd > possibleJsonStart) {
            const jsonCandidate = aiDecision.substring(possibleJsonStart, possibleJsonEnd + 1)
            try {
              decision = JSON.parse(jsonCandidate)
            } catch (fallbackError) {
              throw new Error('所有JSON解析方法都失败')
            }
          } else {
            throw new Error('无法在响应中找到有效的JSON')
          }
        }
      }

      // 验证决策是否有效
      if (!decision || !decision.action || !decision.params) {
        // 如果决策无效，尝试创建一个默认的分析操作
        console.warn('AI decision is invalid, creating default analyze action')
        decision = {
          action: 'analyze',
          params: { focus: '页面内容' },
          reasoning: '由于无法解析有效的决策，默认分析当前页面内容'
        }
      }
    } catch (error) {
      console.error('Error parsing AI decision:', error)

      // 创建一个默认的分析操作
      decision = {
        action: 'analyze',
        params: { focus: '页面内容' },
        reasoning: '由于解析错误，默认分析当前页面内容'
      }

      console.log('Created default decision:', decision)
      console.log('Original AI response:', aiDecision)
    }

    // 根据AI的决策执行操作
    if (decision && decision.action && decision.params) {
      let browserAction: BrowserAction | null = null

      switch (decision.action) {
        case 'navigate':
          browserAction = { type: 'navigate', url: decision.params.url }
          break

        case 'search':
          browserAction = {
            type: 'search',
            engine: decision.params.engine || 'baidu',
            query: decision.params.query
          }
          break

        case 'click':
          // 如果提供的是描述性文本而不是CSS选择器，尝试找到匹配的元素
          if (
            decision.params.selector &&
            !decision.params.selector.includes('.') &&
            !decision.params.selector.includes('#') &&
            !decision.params.selector.includes('[')
          ) {
            try {
              // 使用JavaScript查找匹配的元素
              const findElementScript = `
                (function() {
                  // 查找包含特定文本的元素
                  function findElementByText(text) {
                    const elements = Array.from(document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"], .btn, .button'));

                    // 首先尝试精确匹配
                    for (const el of elements) {
                      if (el.textContent && el.textContent.trim() === text) {
                        return {
                          selector: generateSelector(el),
                          text: el.textContent.trim(),
                          tag: el.tagName.toLowerCase()
                        };
                      }
                    }

                    // 然后尝试包含匹配
                    for (const el of elements) {
                      if (el.textContent && el.textContent.trim().includes(text)) {
                        return {
                          selector: generateSelector(el),
                          text: el.textContent.trim(),
                          tag: el.tagName.toLowerCase()
                        };
                      }
                    }

                    // 尝试查找图像按钮或链接
                    const imgElements = Array.from(document.querySelectorAll('img'));
                    for (const img of imgElements) {
                      if (img.alt && img.alt.includes(text)) {
                        return {
                          selector: generateSelector(img),
                          text: img.alt,
                          tag: 'img'
                        };
                      }
                    }

                    // 尝试查找标题元素
                    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
                    for (const heading of headings) {
                      if (heading.textContent && heading.textContent.trim().includes(text)) {
                        return {
                          selector: generateSelector(heading),
                          text: heading.textContent.trim(),
                          tag: heading.tagName.toLowerCase()
                        };
                      }
                    }

                    // 尝试查找任何包含文本的元素
                    const allElements = Array.from(document.querySelectorAll('*'));
                    for (const el of allElements) {
                      if (el.textContent && el.textContent.trim() === text) {
                        return {
                          selector: generateSelector(el),
                          text: el.textContent.trim(),
                          tag: el.tagName.toLowerCase()
                        };
                      }
                    }

                    return null;
                  }

                  // 生成元素的CSS选择器
                  function generateSelector(el) {
                    if (el.id) {
                      return '#' + el.id;
                    }

                    if (el.className && typeof el.className === 'string') {
                      const classes = el.className.trim().split(/\\s+/);
                      if (classes.length > 0 && classes[0]) {
                        return el.tagName.toLowerCase() + '.' + classes[0];
                      }
                    }

                    // 尝试使用属性选择器
                    if (el.getAttribute('name')) {
                      return el.tagName.toLowerCase() + '[name="' + el.getAttribute('name') + '"]';
                    }

                    if (el.getAttribute('data-testid')) {
                      return '[data-testid="' + el.getAttribute('data-testid') + '"]';
                    }

                    // 使用nth-child选择器
                    let parent = el.parentElement;
                    if (parent) {
                      const children = Array.from(parent.children);
                      const index = children.indexOf(el);
                      if (index !== -1) {
                        return el.tagName.toLowerCase() + ':nth-child(' + (index + 1) + ')';
                      }
                    }

                    return el.tagName.toLowerCase();
                  }

                  return findElementByText("${decision.params.selector.replace(/"/g, '\\"')}");
                })();
              `

              const elementInfo = await webview.executeJavaScript(findElementScript)

              if (elementInfo && elementInfo.selector) {
                console.log('Found element for text:', decision.params.selector, 'Selector:', elementInfo.selector)
                browserAction = { type: 'click', selector: elementInfo.selector }
              } else {
                console.warn('Could not find element with text:', decision.params.selector)
                browserAction = { type: 'click', selector: decision.params.selector }
              }
            } catch (error) {
              console.error('Error finding element by text:', error)
              browserAction = { type: 'click', selector: decision.params.selector }
            }
          } else {
            browserAction = { type: 'click', selector: decision.params.selector }
          }
          break

        case 'type':
          // 如果提供的是描述性文本而不是CSS选择器，尝试找到匹配的输入元素
          if (
            decision.params.selector &&
            !decision.params.selector.includes('.') &&
            !decision.params.selector.includes('#') &&
            !decision.params.selector.includes('[')
          ) {
            try {
              // 使用JavaScript查找匹配的输入元素
              const findInputScript = `
                (function() {
                  // 查找匹配的输入元素
                  function findInputElement(description) {
                    // 尝试查找带有标签的输入元素
                    const labels = Array.from(document.querySelectorAll('label'));
                    for (const label of labels) {
                      if (label.textContent && label.textContent.toLowerCase().includes(description.toLowerCase())) {
                        const forId = label.getAttribute('for');
                        if (forId) {
                          const input = document.getElementById(forId);
                          if (input && (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA' || input.tagName === 'SELECT')) {
                            return {
                              selector: '#' + forId,
                              tag: input.tagName.toLowerCase()
                            };
                          }
                        }

                        // 检查标签内的输入元素
                        const input = label.querySelector('input, textarea, select');
                        if (input) {
                          return {
                            selector: generateSelector(input),
                            tag: input.tagName.toLowerCase()
                          };
                        }
                      }
                    }

                    // 尝试查找带有placeholder的输入元素
                    const inputs = Array.from(document.querySelectorAll('input, textarea'));
                    for (const input of inputs) {
                      const placeholder = input.getAttribute('placeholder');
                      if (placeholder && placeholder.toLowerCase().includes(description.toLowerCase())) {
                        return {
                          selector: generateSelector(input),
                          tag: input.tagName.toLowerCase()
                        };
                      }
                    }

                    // 尝试查找带有name或aria-label的输入元素
                    for (const input of inputs) {
                      const name = input.getAttribute('name');
                      const ariaLabel = input.getAttribute('aria-label');

                      if ((name && name.toLowerCase().includes(description.toLowerCase())) ||
                          (ariaLabel && ariaLabel.toLowerCase().includes(description.toLowerCase()))) {
                        return {
                          selector: generateSelector(input),
                          tag: input.tagName.toLowerCase()
                        };
                      }
                    }

                    // 尝试查找搜索框
                    if (description.toLowerCase().includes('搜索') || description.toLowerCase().includes('search')) {
                      const searchInputs = Array.from(document.querySelectorAll('input[type="search"], input[name*="search"], input[name*="query"], input[placeholder*="搜索"], input[placeholder*="search"]'));
                      if (searchInputs.length > 0) {
                        return {
                          selector: generateSelector(searchInputs[0]),
                          tag: searchInputs[0].tagName.toLowerCase()
                        };
                      }
                    }

                    return null;
                  }

                  // 生成元素的CSS选择器
                  function generateSelector(el) {
                    if (el.id) {
                      return '#' + el.id;
                    }

                    if (el.name) {
                      return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
                    }

                    if (el.className && typeof el.className === 'string') {
                      const classes = el.className.trim().split(/\\s+/);
                      if (classes.length > 0 && classes[0]) {
                        return el.tagName.toLowerCase() + '.' + classes[0];
                      }
                    }

                    return el.tagName.toLowerCase();
                  }

                  return findInputElement("${decision.params.selector.replace(/"/g, '\\"')}");
                })();
              `

              const inputInfo = await webview.executeJavaScript(findInputScript)

              if (inputInfo && inputInfo.selector) {
                console.log(
                  'Found input element for description:',
                  decision.params.selector,
                  'Selector:',
                  inputInfo.selector
                )
                browserAction = {
                  type: 'type',
                  selector: inputInfo.selector,
                  text: decision.params.text
                }
              } else {
                console.warn('Could not find input element with description:', decision.params.selector)
                browserAction = {
                  type: 'type',
                  selector: decision.params.selector,
                  text: decision.params.text
                }
              }
            } catch (error) {
              console.error('Error finding input element by description:', error)
              browserAction = {
                type: 'type',
                selector: decision.params.selector,
                text: decision.params.text
              }
            }
          } else {
            browserAction = {
              type: 'type',
              selector: decision.params.selector,
              text: decision.params.text
            }
          }
          break

        case 'execute':
          // 执行JavaScript代码
          try {
            await webview.executeJavaScript(decision.params.code)
            return {
              success: true,
              content: await getWebviewContent(webview),
              action: `执行了JavaScript代码: ${decision.reasoning || '根据您的指令'}`
            }
          } catch (error) {
            return {
              success: false,
              error: `执行JavaScript代码失败: ${error}`
            }
          }

        case 'analyze':
          // 分析当前页面内容
          return {
            success: true,
            content: pageContent,
            action: `分析了当前页面内容: ${decision.reasoning || '根据您的指令'}`
          }

        default:
          return {
            success: false,
            error: `不支持的操作类型: ${decision.action}`
          }
      }

      if (browserAction) {
        // 执行浏览器操作
        const result = await executeBrowserAction(webview, browserAction)

        if (result.success) {
          return {
            success: true,
            content: result.content,
            action: decision.reasoning || '根据您的指令执行了操作'
          }
        } else {
          return {
            success: false,
            error: `执行操作失败: ${result.error}`
          }
        }
      }
    }

    return {
      success: false,
      error: '无效的AI决策',
      content: aiDecision
    }
  } catch (error) {
    console.error('Error letting AI control browser:', error)
    return { success: false, error: `${error}` }
  }
}
