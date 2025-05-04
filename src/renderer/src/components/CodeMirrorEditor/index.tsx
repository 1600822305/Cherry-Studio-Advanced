import './styles.css'
import './ChineseSearchPanel.css'

import { autocompletion } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from '@codemirror/commands'
import { cpp } from '@codemirror/lang-cpp'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { php } from '@codemirror/lang-php'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { sql } from '@codemirror/lang-sql'
import { vue } from '@codemirror/lang-vue'
import { xml } from '@codemirror/lang-xml'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { searchKeymap } from '@codemirror/search'
import { EditorState, Extension } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useSettings } from '@renderer/hooks/useSettings'
import { CodeStyleVarious, ThemeMode } from '@renderer/types'
import { useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import styled from 'styled-components'

import { createChineseSearchPanel, openChineseSearchPanel } from './ChineseSearchPanel'

// 自定义语法高亮样式
const lightThemeHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#0000ff' },
  { tag: tags.comment, color: '#008000', fontStyle: 'italic' },
  { tag: tags.string, color: '#a31515' },
  { tag: tags.number, color: '#098658' },
  { tag: tags.operator, color: '#000000' },
  { tag: tags.variableName, color: '#001080' },
  { tag: tags.propertyName, color: '#001080' },
  { tag: tags.className, color: '#267f99' },
  { tag: tags.typeName, color: '#267f99' },
  { tag: tags.definition(tags.variableName), color: '#001080' },
  { tag: tags.definition(tags.propertyName), color: '#001080' },
  { tag: tags.definition(tags.className), color: '#267f99' },
  { tag: tags.definition(tags.typeName), color: '#267f99' },
  { tag: tags.function(tags.variableName), color: '#795e26' },
  { tag: tags.function(tags.propertyName), color: '#795e26' },
  { tag: tags.angleBracket, color: '#800000' },
  { tag: tags.tagName, color: '#800000' },
  { tag: tags.attributeName, color: '#ff0000' },
  { tag: tags.attributeValue, color: '#0000ff' },
  { tag: tags.heading, color: '#800000', fontWeight: 'bold' },
  { tag: tags.link, color: '#0000ff', textDecoration: 'underline' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' }
])

// 暗色主题语法高亮样式
const darkThemeHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#569cd6' },
  { tag: tags.comment, color: '#6a9955', fontStyle: 'italic' },
  { tag: tags.string, color: '#ce9178' },
  { tag: tags.number, color: '#b5cea8' },
  { tag: tags.operator, color: '#d4d4d4' },
  { tag: tags.variableName, color: '#9cdcfe' },
  { tag: tags.propertyName, color: '#9cdcfe' },
  { tag: tags.className, color: '#4ec9b0' },
  { tag: tags.typeName, color: '#4ec9b0' },
  { tag: tags.definition(tags.variableName), color: '#9cdcfe' },
  { tag: tags.definition(tags.propertyName), color: '#9cdcfe' },
  { tag: tags.definition(tags.className), color: '#4ec9b0' },
  { tag: tags.definition(tags.typeName), color: '#4ec9b0' },
  { tag: tags.function(tags.variableName), color: '#dcdcaa' },
  { tag: tags.function(tags.propertyName), color: '#dcdcaa' },
  { tag: tags.angleBracket, color: '#808080' },
  { tag: tags.tagName, color: '#569cd6' },
  { tag: tags.attributeName, color: '#9cdcfe' },
  { tag: tags.attributeValue, color: '#ce9178' },
  { tag: tags.heading, color: '#569cd6', fontWeight: 'bold' },
  { tag: tags.link, color: '#569cd6', textDecoration: 'underline' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' }
])

export interface CodeMirrorEditorRef {
  undo: () => boolean
  redo: () => boolean
  openSearch: () => void
  getContent: () => string
}

interface CodeMirrorEditorProps {
  code: string
  language: string
  onChange?: (value: string) => void
  readOnly?: boolean
  showLineNumbers?: boolean
  fontSize?: number
  height?: string
}

// 获取CodeMirror主题扩展
const getThemeExtension = (codeStyle: CodeStyleVarious, isDarkMode: boolean): Extension | null => {
  // 支持的主题列表
  // 目前只内置了 oneDark 主题，其他主题需要逐步添加
  if (isDarkMode) {
    switch (String(codeStyle)) {
      case 'auto':
      case 'one-dark':
        return oneDark
      case 'ayu-dark':
        return createCustomTheme({
          base: oneDark,
          colors: {
            background: '#0F1419',
            foreground: '#E6E1CF',
            keyword: '#FF8F40',
            comment: '#5C6773',
            string: '#C2D94C',
            function: '#FFB454',
            variable: '#F07178',
            type: '#59C2FF'
          }
        })
      case 'andromeda':
        return createCustomTheme({
          base: oneDark,
          colors: {
            background: '#23262E',
            foreground: '#D5CED9',
            keyword: '#9F7EFE',
            comment: '#6C6F93',
            string: '#D98E48',
            function: '#6C6F93',
            variable: '#D5CED9',
            type: '#9F7EFE'
          }
        })
      case 'aurora-x':
        return createCustomTheme({
          base: oneDark,
          colors: {
            background: '#011627',
            foreground: '#D6DEEB',
            keyword: '#C792EA',
            comment: '#637777',
            string: '#ECC48D',
            function: '#82AAFF',
            variable: '#D7DBE0',
            type: '#FFCB8B'
          }
        })
      case 'catppuccin-frappe':
        return createCustomTheme({
          base: oneDark,
          colors: {
            background: '#303446',
            foreground: '#C6D0F5',
            keyword: '#ca9ee6',
            comment: '#838BA7',
            string: '#a6d189',
            function: '#8caaee',
            variable: '#c6d0f5',
            type: '#e5c890'
          }
        })
      case 'catppuccin-macchiato':
        return createCustomTheme({
          base: oneDark,
          colors: {
            background: '#24273A',
            foreground: '#CAD3F5',
            keyword: '#c6a0f6',
            comment: '#8087A2',
            string: '#a6da95',
            function: '#8aadf4',
            variable: '#cad3f5',
            type: '#eed49f'
          }
        })
      case 'catppuccin-mocha':
        return createCustomTheme({
          base: oneDark,
          colors: {
            background: '#1E1E2E',
            foreground: '#CDD6F4',
            keyword: '#CBA6F7',
            comment: '#7F849C',
            string: '#A6E3A1',
            function: '#89B4FA',
            variable: '#CDD6F4',
            type: '#F9E2AF'
          }
        })
      default:
        return oneDark
    }
  } else {
    // 亮色主题
    switch (String(codeStyle)) {
      case 'auto':
        return null // 使用默认的亮色主题
      case 'catppuccin-latte':
        return createCustomTheme({
          base: null,
          colors: {
            background: '#EFF1F5',
            foreground: '#4C4F69',
            keyword: '#8839EF',
            comment: '#ACB0BE',
            string: '#40A02B',
            function: '#1E66F5',
            variable: '#4C4F69',
            type: '#DF8E1D'
          }
        })
      default:
        return null // 使用默认的亮色主题
    }
  }
}

// 创建自定义主题
const createCustomTheme = (options: {
  base: Extension | null
  colors: {
    background: string
    foreground: string
    keyword: string
    comment: string
    string: string
    function: string
    variable: string
    type: string
  }
}): Extension => {
  const { colors, base } = options

  // 创建自定义高亮样式
  const customHighlightStyle = HighlightStyle.define([
    { tag: tags.keyword, color: colors.keyword },
    { tag: tags.comment, color: colors.comment, fontStyle: 'italic' },
    { tag: tags.string, color: colors.string },
    { tag: tags.function(tags.variableName), color: colors.function },
    { tag: tags.function(tags.propertyName), color: colors.function },
    { tag: tags.variableName, color: colors.variable },
    { tag: tags.propertyName, color: colors.variable },
    { tag: tags.typeName, color: colors.type },
    { tag: tags.className, color: colors.type }
  ])

  // 创建主题
  const customTheme = EditorView.theme({
    '&': {
      backgroundColor: colors.background,
      color: colors.foreground
    },
    '.cm-content': {
      caretColor: colors.foreground
    },
    '.cm-cursor': {
      borderLeftColor: colors.foreground
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: colors.foreground + '33' // 添加半透明
    },
    '.cm-gutters': {
      backgroundColor: colors.background,
      color: colors.comment,
      borderRight: `1px solid ${colors.comment}33`
    },
    '.cm-activeLineGutter': {
      backgroundColor: colors.foreground + '0F'
    }
  })

  if (base) {
    // 如果有基础主题，将自定义样式与基础主题结合
    return [base, customTheme, syntaxHighlighting(customHighlightStyle)]
  }

  return [customTheme, syntaxHighlighting(customHighlightStyle)]
}

const getLanguageExtension = (language: string) => {
  switch (language.toLowerCase()) {
    case 'javascript':
    case 'js':
    case 'jsx':
    case 'typescript':
    case 'ts':
    case 'tsx':
      return javascript()
    case 'python':
    case 'py':
      return python()
    case 'html':
      return html()
    case 'css':
    case 'scss':
    case 'less':
      return css()
    case 'json':
      return json()
    case 'markdown':
    case 'md':
      return markdown()
    case 'cpp':
    case 'c':
    case 'c++':
    case 'h':
    case 'hpp':
      return cpp()
    case 'java':
      return java()
    case 'php':
      return php()
    case 'rust':
    case 'rs':
      return rust()
    case 'sql':
      return sql()
    case 'xml':
    case 'svg':
      return xml()
    case 'vue':
      return vue()
    default:
      return javascript()
  }
}

const CodeMirrorEditor = ({
  ref,
  code,
  language,
  onChange,
  readOnly = false,
  showLineNumbers = true,
  fontSize = 14,
  height = 'auto'
}: CodeMirrorEditorProps & { ref?: React.RefObject<CodeMirrorEditorRef | null> }) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const { theme } = useTheme()
  const { codeStyle } = useSettings()

  // 根据当前主题和代码风格选择高亮样式
  const highlightStyle = useMemo(() => {
    // 如果代码风格设置为auto或未设置，则根据主题选择默认样式
    if (!codeStyle || codeStyle === 'auto') {
      return theme === ThemeMode.dark ? darkThemeHighlightStyle : lightThemeHighlightStyle
    }

    // 暗色主题下特定风格的高亮样式
    if (theme === ThemeMode.dark) {
      switch (String(codeStyle)) {
        case 'one-dark':
          // oneDark主题使用暗色默认高亮样式
          return darkThemeHighlightStyle
        case 'ayu-dark':
          return HighlightStyle.define([
            { tag: tags.keyword, color: '#FF8F40' },
            { tag: tags.comment, color: '#5C6773', fontStyle: 'italic' },
            { tag: tags.string, color: '#C2D94C' },
            { tag: tags.number, color: '#FFB454' },
            { tag: tags.operator, color: '#E6E1CF' },
            { tag: tags.variableName, color: '#F07178' },
            { tag: tags.propertyName, color: '#F07178' },
            { tag: tags.className, color: '#59C2FF' },
            { tag: tags.typeName, color: '#59C2FF' },
            { tag: tags.function(tags.variableName), color: '#FFB454' },
            { tag: tags.function(tags.propertyName), color: '#FFB454' }
          ])
        case 'andromeda':
          return HighlightStyle.define([
            { tag: tags.keyword, color: '#9F7EFE' },
            { tag: tags.comment, color: '#6C6F93', fontStyle: 'italic' },
            { tag: tags.string, color: '#D98E48' },
            { tag: tags.number, color: '#AF98E6' },
            { tag: tags.operator, color: '#D5CED9' },
            { tag: tags.variableName, color: '#D5CED9' },
            { tag: tags.propertyName, color: '#D5CED9' },
            { tag: tags.className, color: '#9F7EFE' },
            { tag: tags.typeName, color: '#9F7EFE' },
            { tag: tags.function(tags.variableName), color: '#6C6F93' },
            { tag: tags.function(tags.propertyName), color: '#6C6F93' }
          ])
        case 'aurora-x':
          return HighlightStyle.define([
            { tag: tags.keyword, color: '#C792EA' },
            { tag: tags.comment, color: '#637777', fontStyle: 'italic' },
            { tag: tags.string, color: '#ECC48D' },
            { tag: tags.number, color: '#F78C6C' },
            { tag: tags.operator, color: '#D6DEEB' },
            { tag: tags.variableName, color: '#D7DBE0' },
            { tag: tags.propertyName, color: '#D7DBE0' },
            { tag: tags.className, color: '#FFCB8B' },
            { tag: tags.typeName, color: '#FFCB8B' },
            { tag: tags.function(tags.variableName), color: '#82AAFF' },
            { tag: tags.function(tags.propertyName), color: '#82AAFF' }
          ])
        case 'catppuccin-frappe':
          return HighlightStyle.define([
            { tag: tags.keyword, color: '#ca9ee6' },
            { tag: tags.comment, color: '#838BA7', fontStyle: 'italic' },
            { tag: tags.string, color: '#a6d189' },
            { tag: tags.number, color: '#ef9f76' },
            { tag: tags.operator, color: '#c6d0f5' },
            { tag: tags.variableName, color: '#c6d0f5' },
            { tag: tags.propertyName, color: '#c6d0f5' },
            { tag: tags.className, color: '#e5c890' },
            { tag: tags.typeName, color: '#e5c890' },
            { tag: tags.function(tags.variableName), color: '#8caaee' },
            { tag: tags.function(tags.propertyName), color: '#8caaee' }
          ])
        case 'catppuccin-macchiato':
        case 'catppuccin-mocha':
          return HighlightStyle.define([
            { tag: tags.keyword, color: '#CBA6F7' },
            { tag: tags.comment, color: '#7F849C', fontStyle: 'italic' },
            { tag: tags.string, color: '#A6E3A1' },
            { tag: tags.number, color: '#F5A97F' },
            { tag: tags.operator, color: '#CDD6F4' },
            { tag: tags.variableName, color: '#CDD6F4' },
            { tag: tags.propertyName, color: '#CDD6F4' },
            { tag: tags.className, color: '#F9E2AF' },
            { tag: tags.typeName, color: '#F9E2AF' },
            { tag: tags.function(tags.variableName), color: '#89B4FA' },
            { tag: tags.function(tags.propertyName), color: '#89B4FA' }
          ])
        default:
          return darkThemeHighlightStyle
      }
    } else {
      // 亮色主题下特定风格的高亮样式
      switch (String(codeStyle)) {
        case 'catppuccin-latte':
          return HighlightStyle.define([
            { tag: tags.keyword, color: '#8839EF' },
            { tag: tags.comment, color: '#ACB0BE', fontStyle: 'italic' },
            { tag: tags.string, color: '#40A02B' },
            { tag: tags.number, color: '#FE640B' },
            { tag: tags.operator, color: '#4C4F69' },
            { tag: tags.variableName, color: '#4C4F69' },
            { tag: tags.propertyName, color: '#4C4F69' },
            { tag: tags.className, color: '#DF8E1D' },
            { tag: tags.typeName, color: '#DF8E1D' },
            { tag: tags.function(tags.variableName), color: '#1E66F5' },
            { tag: tags.function(tags.propertyName), color: '#1E66F5' }
          ])
        default:
          return lightThemeHighlightStyle
      }
    }
  }, [theme, codeStyle])

  // 暴露撤销/重做方法和获取内容方法
  useImperativeHandle(ref, () => ({
    undo: () => {
      if (editorViewRef.current) {
        try {
          // 使用用户事件标记来触发撤销
          const success = undo({ state: editorViewRef.current.state, dispatch: editorViewRef.current.dispatch })
          // 返回是否成功撤销
          return success
        } catch (error) {
          return false
        }
      }
      return false
    },
    redo: () => {
      if (editorViewRef.current) {
        try {
          // 使用用户事件标记来触发重做
          const success = redo({ state: editorViewRef.current.state, dispatch: editorViewRef.current.dispatch })
          // 返回是否成功重做
          return success
        } catch (error) {
          return false
        }
      }
      return false
    },
    openSearch: () => {
      if (editorViewRef.current) {
        openChineseSearchPanel(editorViewRef.current)
      }
    },
    // 获取当前编辑器内容
    getContent: () => {
      if (editorViewRef.current) {
        return editorViewRef.current.state.doc.toString()
      }
      return code
    }
  }))

  useEffect(() => {
    if (!editorRef.current) return

    // 清除之前的编辑器实例
    if (editorViewRef.current) {
      editorViewRef.current.destroy()
    }

    const languageExtension = getLanguageExtension(language)

    // 监听编辑器所有更新
    const updateListener = EditorView.updateListener.of((update) => {
      // 当文档变化时更新内部状态
      if (update.docChanged) {
        // 记录所有文档变化
        if (onChange) {
          onChange(update.state.doc.toString())
        }
      }
    })

    // 根据主题将编辑器容器添加暗色模式类
    if (editorRef.current) {
      if (theme === ThemeMode.dark) {
        editorRef.current.classList.add('dark-theme')
      } else {
        editorRef.current.classList.remove('dark-theme')
      }

      // 清除所有主题相关的类名
      editorRef.current.classList.remove(
        'ayu-dark-theme',
        'andromeda-theme',
        'aurora-x-theme',
        'catppuccin-frappe-theme',
        'catppuccin-latte-theme',
        'catppuccin-macchiato-theme',
        'catppuccin-mocha-theme'
      )

      // 添加当前主题的类名
      if (codeStyle && codeStyle !== 'auto') {
        editorRef.current.classList.add(`${codeStyle}-theme`)
      }
    }

    // 添加主题扩展
    const themeExtension = getThemeExtension(codeStyle, theme === ThemeMode.dark)

    const extensions = [
      // 主题扩展放在最前面，确保其他样式可以覆盖它
      ...(themeExtension ? [themeExtension] : []),

      // 配置历史记录
      history(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        indentWithTab,
        { key: 'Mod-z', run: undo },
        { key: 'Mod-y', run: redo },
        { key: 'Mod-Shift-z', run: redo }
      ]),
      // 高亮样式放在主题之后，确保它可以覆盖主题默认样式
      syntaxHighlighting(highlightStyle),
      languageExtension,
      EditorView.editable.of(!readOnly),
      updateListener,
      EditorState.readOnly.of(readOnly),
      highlightActiveLine(),
      autocompletion(),
      createChineseSearchPanel(),
      EditorView.theme({
        '&': {
          fontSize: `${fontSize}px`,
          height: height
        },
        '.cm-content': {
          fontFamily: 'monospace'
        }
      })
    ]

    // 添加行号
    if (showLineNumbers) {
      extensions.push(lineNumbers())
    }

    // 创建状态并设置到编辑器实例
    const state = EditorState.create({
      doc: code,
      extensions
    })

    const view = new EditorView({
      state,
      parent: editorRef.current
    })

    editorViewRef.current = view

    // 添加一个控制台日志，帮助调试主题设置
    console.log(`CodeMirror应用主题: ${codeStyle}, 暗黑模式: ${theme === ThemeMode.dark}`)

    return () => {
      view.destroy()
    }
  }, [code, language, onChange, readOnly, showLineNumbers, theme, codeStyle, highlightStyle, fontSize, height])

  return <EditorContainer ref={editorRef} />
}

const EditorContainer = styled.div`
  width: 100%;
  border-radius: 4px;
  overflow: hidden;

  .cm-editor {
    height: 100%;
  }

  .cm-scroller {
    overflow: auto;
  }
`

export default CodeMirrorEditor
