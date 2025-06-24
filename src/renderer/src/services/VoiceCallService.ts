import { DEFAULT_VOICE_CALL_PROMPT } from '@renderer/config/prompts'
import { fetchChatCompletion } from '@renderer/services/ApiService'
import ASRService from '@renderer/services/ASRService'
import { getDefaultAssistant } from '@renderer/services/AssistantService'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import TTSService from '@renderer/services/TTSService'
import store from '@renderer/store'
import { setSkipNextAutoTTS } from '@renderer/store/settings'
import i18n from 'i18next'

interface VoiceCallCallbacks {
  onTranscript: (text: string) => void
  onResponse: (text: string) => void
  onListeningStateChange: (isListening: boolean) => void
  onSpeakingStateChange: (isSpeaking: boolean) => void
}

// 为TypeScript添加SpeechRecognition类型
declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

class VoiceCallServiceClass {
  private recognition: any = null
  private isCallActive = false
  private isRecording = false // 新增录音状态
  private isPaused = false
  private callbacks: VoiceCallCallbacks | null = null
  private _currentTranscript = '' // 使用下划线前缀避免未使用警告
  private _accumulatedTranscript = '' // 累积的语音识别结果
  private conversationHistory: { role: string; content: string }[] = []
  private isProcessingResponse = false
  private ttsService = TTSService
  private recordingTimeout: NodeJS.Timeout | null = null // 录音超时定时器

  async initialize() {
    // 检查麦克风权限
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
    } catch (error) {
      console.error('麦克风权限被拒绝:', error)
      console.error(i18n.t('settings.voice_call.microphone_denied'))
      throw new Error('麦克风权限被拒绝')
    }

    // 获取当前ASR服务类型
    const { asrServiceType } = store.getState().settings

    // 如果使用浏览器ASR，检查浏览器支持
    if (asrServiceType === 'browser') {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.error(i18n.t('settings.asr.error.browser_not_support'))
        throw new Error('当前浏览器不支持语音识别')
      }

      // 初始化浏览器语音识别
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      this.recognition = new SpeechRecognition()
      this.recognition.continuous = true
      this.recognition.interimResults = true
      this.recognition.lang = navigator.language || 'zh-CN'
      
      // 添加错误处理
      this.recognition.onerror = (event: any) => {
        const errorMessage = event.error || '未知错误';
        console.error('浏览器语音识别错误:', errorMessage)
        window.message.error({ 
          content: `语音识别错误: ${errorMessage}`, 
          key: 'voice-call-error' 
        })
      }
    } else if (asrServiceType === 'local') {
      // 如果使用本地服务器ASR，实现连接重试机制
      try {
        // 尝试连接本地ASR服务器，最多尝试3次
        console.log('初始化时尝试连接语音识别服务器')
        
        // 定义重试机制
        const maxRetries = 3;
        let retryCount = 0;
        let connected = false;
        
        while (!connected && retryCount < maxRetries) {
          try {
            connected = await ASRService.connectToWebSocketServer();
            if (connected) {
              console.log('语音识别服务器连接成功');
              break;
            } else {
              retryCount++;
              console.warn(`连接语音识别服务器失败，正在重试 (${retryCount}/${maxRetries})...`);
              // 等待一段时间再重试
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (connError) {
            retryCount++;
            console.error(`连接语音识别服务器失败 (${retryCount}/${maxRetries}):`, connError);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        if (!connected) {
          console.warn('多次尝试后仍无法连接到语音识别服务，将在需要时重试');
          // 显示轻量级警告但不中断流程
          window.message.warning({ 
            content: i18n.t('settings.asr.warning.connection_retry_later'), 
            key: 'voice-call-warning' 
          });
        }
      } catch (initialError) {
        console.error('连接语音识别服务器失败:', initialError);
        window.message.warning({ 
          content: i18n.t('settings.asr.warning.connection_failed'), 
          key: 'voice-call-warning' 
        });
        // 不抛出异常，允许程序继续运行，在需要时重试
      }
    }

    return true
  }

  async startCall(callbacks: VoiceCallCallbacks) {
    this.callbacks = callbacks
    this.isCallActive = true
    this.conversationHistory = []

    // 获取当前ASR服务类型
    const { asrServiceType } = store.getState().settings

    // 如果是本地服务器ASR，预先连接服务器
    if (asrServiceType === 'local') {
      try {
        // 尝试连接WebSocket服务器
        console.log('通话开始，预先连接语音识别服务器')
        const connected = await ASRService.connectToWebSocketServer()
        if (!connected) {
          console.warn('无法连接到语音识别服务器，将在需要时重试')
          // 显示警告但不中断流程
          window.message.warning({ 
            content: i18n.t('settings.asr.warning.connection_retry_later') || '无法连接到语音识别服务器，将在需要时重试', 
            key: 'voice-call-warning' 
          })
        } else {
          console.log('语音识别服务器连接成功')
        }
      } catch (connError) {
        console.error('连接语音识别服务器失败:', connError)
        // 显示警告但不中断流程
        window.message.warning({ 
          content: i18n.t('settings.asr.warning.connection_failed') || '连接语音识别服务器失败，将在需要时重试', 
          key: 'voice-call-warning' 
        })
      }
    }

    // 根据不同的ASR服务类型进行初始化
    if (asrServiceType === 'browser') {
      if (!this.recognition) {
        window.message.error({ content: i18n.t('settings.asr.error.browser_not_support') || '浏览器不支持语音识别', key: 'voice-call-error' })
        throw new Error('浏览器语音识别未初始化')
      }

      // 设置浏览器语音识别事件处理
      this.recognition.onresult = (event: any) => {
        let interimTranscript = ''
        let finalTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript
          } else {
            interimTranscript += event.results[i][0].transcript
          }
        }

        if (interimTranscript) {
          // 更新当前的临时识别结果
          this._currentTranscript = interimTranscript
          // 显示累积结果 + 当前临时结果
          this.callbacks?.onTranscript(this._accumulatedTranscript + ' ' + interimTranscript)
        }

        if (finalTranscript) {
          // 将最终结果累积到总结果中
          if (this._accumulatedTranscript) {
            // 如果已经有累积的文本，添加空格再追加
            this._accumulatedTranscript += ' ' + finalTranscript
          } else {
            // 如果是第一段文本，直接设置
            this._accumulatedTranscript = finalTranscript
          }

          // 更新当前的识别结果
          this._currentTranscript = ''
          // 显示累积的完整结果
          this.callbacks?.onTranscript(this._accumulatedTranscript)

          // 在录音过程中只更新transcript，不触发handleUserSpeech
          // 松开按钮后才会处理完整的录音内容
        }
      }

      this.recognition.onstart = () => {
        this.isRecording = true
        this.callbacks?.onListeningStateChange(true)
      }

      this.recognition.onend = () => {
        this.isRecording = false
        this.callbacks?.onListeningStateChange(false)
      }

      this.recognition.onerror = (event: any) => {
        const errorMessage = typeof event.error === 'string' ? event.error : '未知错误'
        console.error('语音识别错误', errorMessage)
        this.isRecording = false
        this.callbacks?.onListeningStateChange(false)
        
        // 避免在录音中显示过多错误消息
        if (!this.isPaused) {
          window.message.error({ 
            content: `语音识别错误: ${errorMessage}`, 
            key: 'voice-call-error' 
          })
        }
      }
    }

    // 设置skipNextAutoTTS为true，防止自动播放最后一条消息
    store.dispatch(setSkipNextAutoTTS(true))

    try {
      // 播放欢迎语音 - 根据当前语言获取本地化的欢迎消息
      const welcomeMessage = i18n.t('settings.voice_call.welcome_message')

      // 监听TTS状态
      const ttsStateHandler = (isPlaying: boolean) => {
        this.callbacks?.onSpeakingStateChange(isPlaying)
      }

      // 监听TTS播放状态
      window.addEventListener('tts-state-change', (event: any) => {
        ttsStateHandler(event.detail.isPlaying)
      })

      // 播放欢迎语音，并手动设置初始状态
      this.callbacks?.onSpeakingStateChange(true)
      
      // 使用await等待TTS播放完成
      await this.ttsService.speak(welcomeMessage)
      
      // 等待一小段时间确保状态更新
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // 播放完成后更新状态
      if (!this.ttsService.isCurrentlyPlaying()) {
        this.callbacks?.onSpeakingStateChange(false)
      }
    } catch (error) {
      console.error('播放欢迎语音失败:', error)
      // 错误时也要确保状态正确
      this.callbacks?.onSpeakingStateChange(false)
    }

    return true
  }

  /**
   * 开始录音
   * @returns Promise<boolean> 是否成功开始录音
   */
  async startRecording(): Promise<boolean> {
    if (!this.isCallActive || this.isPaused || this.isProcessingResponse || this.isRecording) {
      return false
    }

    // 重置累积的文本
    this._accumulatedTranscript = ''

    // 获取当前ASR服务类型
    const { asrServiceType } = store.getState().settings

    try {
      if (asrServiceType === 'browser') {
        // 浏览器ASR
        if (!this.recognition) {
          throw new Error('Browser speech recognition not initialized')
        }

        this.recognition.start()
        this.isRecording = true
      } else if (asrServiceType === 'local') {
        // 本地服务器ASR
        try {
          // 先检查连接状态，如果未连接则尝试重新连接
          if (!ASRService.isWebSocketConnected()) {
            console.log('语音识别服务器未连接，尝试重新连接')
            const connected = await ASRService.connectToWebSocketServer()
            if (!connected) {
              throw new Error('无法连接到语音识别服务器')
            }

            // 等待一下，确保连接已建立
            await new Promise((resolve) => setTimeout(resolve, 500))
          }

          // 开始录音
          await ASRService.startRecording((text, isFinal) => {
            if (text) {
              if (isFinal) {
                // 如果是最终结果，累积到总结果中
                if (this._accumulatedTranscript) {
                  // 如果已经有累积的文本，添加空格再追加
                  this._accumulatedTranscript += ' ' + text
                } else {
                  // 如果是第一段文本，直接设置
                  this._accumulatedTranscript = text
                }

                // 更新当前的识别结果
                this._currentTranscript = ''
                // 显示累积的完整结果
                this.callbacks?.onTranscript(this._accumulatedTranscript)
              } else {
                // 如果是临时结果，更新当前的识别结果
                this._currentTranscript = text
                // 只显示当前临时结果，不与累积结果拼接
                this.callbacks?.onTranscript(text)
              }

              // 在录音过程中只更新transcript，不触发handleUserSpeech
              // 松开按钮后才会处理完整的录音内容
            }
          })

          this.isRecording = true
          this.callbacks?.onListeningStateChange(true)
        } catch (error) {
          console.error('启动语音识别失败:', error)
          throw error
        }
      } else if (asrServiceType === 'openai') {
        // OpenAI ASR
        await ASRService.startRecording()
        this.isRecording = true
        this.callbacks?.onListeningStateChange(true)
      }

      // 设置最长录音时间，防止用户忘记松开
      this.recordingTimeout = setTimeout(() => {
        if (this.isRecording) {
          this.stopRecording()
        }
      }, 60000) // 60秒最长录音时间

      return true
    } catch (error) {
      console.error('Failed to start recording:', error)
      this.isRecording = false
      this.callbacks?.onListeningStateChange(false)
      return false
    }
  }

  /**
   * 停止录音并处理结果，将录音内容发送给AI
   * @returns Promise<boolean> 是否成功停止录音
   */
  async stopRecording(): Promise<boolean> {
    if (!this.isCallActive || !this.isRecording) {
      return false
    }

    // 清除录音超时定时器
    if (this.recordingTimeout) {
      clearTimeout(this.recordingTimeout)
      this.recordingTimeout = null
    }

    // 获取当前ASR服务类型
    const { asrServiceType } = store.getState().settings

    try {
      // 立即设置录音状态为false，防止重复处理
      this.isRecording = false
      this.callbacks?.onListeningStateChange(false)

      // 存储当前的语音识别结果，用于松开按钮后发送给AI
      const currentTranscript = this._currentTranscript
      // 存储累积的语音识别结果
      const accumulatedTranscript = this._accumulatedTranscript

      if (asrServiceType === 'browser') {
        // 浏览器ASR
        if (!this.recognition) {
          throw new Error('Browser speech recognition not initialized')
        }

        this.recognition.stop()

        // 优先使用累积的文本，如果有的话
        if (accumulatedTranscript) {
          console.log('发送累积的语音识别结果给AI:', accumulatedTranscript)
          this.handleUserSpeech(accumulatedTranscript)
        } else if (currentTranscript) {
          // 如果没有累积结果，使用当前结果
          console.log('没有累积结果，使用当前结果:', currentTranscript)
          this.handleUserSpeech(currentTranscript)
        }

        // 清除状态
        this._currentTranscript = ''
        this._accumulatedTranscript = ''
      } else if (asrServiceType === 'local') {
        // 本地服务器ASR
        // 创建一个承诺，等待最终结果
        const finalResultPromise = new Promise<string>((resolve) => {
          // 设置一个超时器，确保不会无限等待
          const timeoutId = setTimeout(() => {
            console.log('等待最终结果超时，使用当前结果')
            resolve(this._currentTranscript)
          }, 1500) // 1.5秒超时

          // 设置回调函数来接收最终结果
          const resultCallback = (text: string, isFinal?: boolean) => {
            // 如果是空字符串，表示只是重置状态，不处理
            if (text === '') return

            if (text) {
              // 只处理最终结果，忽略中间结果
              if (isFinal) {
                clearTimeout(timeoutId)
                console.log('收到最终语音识别结果:', text)
                this._currentTranscript = text
                this.callbacks?.onTranscript(text)
                resolve(text)
              } else {
                // 对于中间结果，只更新显示，不解析Promise
                console.log('收到中间语音识别结果:', text)
                this.callbacks?.onTranscript(text)
              }
            }
          }

          // 停止录音，但不取消，以获取最终结果
          ASRService.stopRecording(resultCallback)

          // 添加额外的安全措施，在停止后立即发送重置命令
          setTimeout(() => {
            // 发送重置命令，确保浏览器不会继续发送结果
            ASRService.cancelRecording()

            // 清除ASRService中的回调函数，防止后续结果被处理
            ASRService.resultCallback = null
          }, 2000) // 2秒后强制取消，作为安全措施
        })

        // 等待最终结果，但最多等待3秒
        const finalText = await finalResultPromise

        // 优先使用累积的文本，如果有的话
        if (accumulatedTranscript) {
          console.log('发送累积的语音识别结果给AI:', accumulatedTranscript)
          this.handleUserSpeech(accumulatedTranscript)
        } else if (finalText) {
          // 如果没有累积结果，使用最终结果
          console.log('发送最终语音识别结果给AI:', finalText)
          this.handleUserSpeech(finalText)
        } else if (currentTranscript) {
          // 如果没有最终结果，使用当前结果
          console.log('没有最终结果，使用当前结果:', currentTranscript)
          this.handleUserSpeech(currentTranscript)
        }

        // 再次确保所有状态被重置
        this._currentTranscript = ''
        this._accumulatedTranscript = ''
      } else if (asrServiceType === 'openai') {
        // OpenAI ASR
        await ASRService.stopRecording((text) => {
          // 更新最终的语音识别结果
          if (text) {
            this._currentTranscript = text
            this.callbacks?.onTranscript(text)
          }
        })

        // 使用最新的语音识别结果
        const finalTranscript = this._currentTranscript
        if (finalTranscript) {
          this.handleUserSpeech(finalTranscript)
        }

        // 清除状态
        this._currentTranscript = ''
        this._accumulatedTranscript = ''
      }

      return true
    } catch (error) {
      console.error('Failed to stop recording:', error)
      this.isRecording = false
      this.callbacks?.onListeningStateChange(false)

      // 确保在出错时也清除状态
      this._currentTranscript = ''
      this._accumulatedTranscript = ''

      // 强制取消录音
      ASRService.cancelRecording()

      return false
    }
  }

  /**
   * 处理用户语音输入
   * @param text 语音识别结果文本
   * @param sendToChat 是否将结果发送到聊天界面
   */
  async handleUserSpeech(text: string, sendToChat: boolean = false): Promise<boolean> {
    // 空文本检查
    if (!text || text.trim() === '') {
      console.log('语音识别结果为空，不处理');
      return false;
    }

    if (!this.isCallActive || this.isProcessingResponse || this.isPaused) {
      console.log('语音通话未激活或正在处理或已暂停，不处理语音输入');
      return false;
    }

    // 暂停语音识别，避免在AI回复时继续识别
    const { asrServiceType } = store.getState().settings
    if (asrServiceType === 'browser') {
      this.recognition?.stop()
    } else if (asrServiceType === 'local' || asrServiceType === 'openai') {
      ASRService.cancelRecording()
    }

    this.isProcessingResponse = true

    try {
      // 获取当前助手
      const assistant = getDefaultAssistant()
      if (!assistant) {
        throw new Error('无法获取默认助手');
      }

      // 检查是否有自定义模型
      const { voiceCallModel } = store.getState().settings
      if (voiceCallModel) {
        // 如果有自定义模型，覆盖默认助手的模型
        assistant.model = voiceCallModel
        console.log('设置语音通话专用模型:', JSON.stringify(voiceCallModel))
      } else {
        console.log('没有设置语音通话专用模型，使用默认助手模型:', JSON.stringify(assistant.model))
      }

      // 如果需要发送到聊天界面，触发事件
      if (sendToChat) {
        console.log('将语音识别结果发送到聊天界面:', text)

        try {
          // 准备要发送的模型
          const modelToUse = voiceCallModel || assistant.model
          if (!modelToUse) {
            throw new Error('没有可用的模型');
          }

          // 打印日志查看模型信息
          console.log('使用模型:', modelToUse ? JSON.stringify(modelToUse) : 'null')

          // 准备事件数据
          const eventData = {
            text,
            model: modelToUse,
            isVoiceCall: true, // 标记这是语音通话消息
            isVoiceCallMessage: true, // 明确标记这是语音通话消息，供Message组件使用
            useVoiceCallModel: true, // 明确标记使用语音通话模型
            voiceCallModelId: voiceCallModel?.id // 传递语音通话模型ID
          }

          // 发送事件
          EventEmitter.emit(EVENT_NAMES.VOICE_CALL_MESSAGE, eventData)
          console.log('语音通话消息事件已触发')

          // 使用消息通知用户
          window.message.success({ content: '语音识别已完成，正在发送消息...', key: 'voice-call-send' })

          // 处理完成后重置状态
          this.isProcessingResponse = false
          return true
        } catch (sendError) {
          const errorMsg = sendError instanceof Error ? sendError.message : String(sendError);
          console.error('发送语音通话消息失败:', errorMsg)
          window.message.error({ content: '发送语音通话消息失败', key: 'voice-call-error' })
          this.isProcessingResponse = false
          return false
        }
      }

      // 如果不发送到聊天界面，则在这里处理对话
      try {
        // 添加用户消息到对话历史
        this.conversationHistory.push({ role: 'user', content: text })

        // 更新对话界面中的显示
        this.callbacks?.onTranscript('')

        // 开始处理AI响应
        const messages = [...this.conversationHistory]

        // 获取自定义语音通话提示词
        const settings = store.getState().settings
        const customPrompt = settings.voiceCallPrompt || DEFAULT_VOICE_CALL_PROMPT
        
        // 添加系统提示词
        messages.unshift({ role: 'system', content: customPrompt })

        // 调用API获取AI回复
        const modelToUse = voiceCallModel || assistant.model
        if (!modelToUse) {
          throw new Error('没有可用的模型');
        }

        // 创建消息对象
        const topic = { id: 'voice-call', name: '语音通话' }
        const userMsg = {
          id: 'voice-call-user-' + Date.now(),
          role: 'user' as 'user',
          content: text,
          assistantId: assistant.id,
          topicId: topic.id,
          model: modelToUse,
          createdAt: new Date().toISOString(),
          type: 'text' as 'text',
          status: 'success' as 'success'
        }
        
        const aiMsg = {
          id: 'voice-call-ai-' + Date.now(),
          role: 'assistant' as 'assistant',
          content: '',
          assistantId: assistant.id,
          topicId: topic.id,
          model: modelToUse,
          createdAt: new Date().toISOString(),
          type: 'text' as 'text',
          status: 'sending' as 'sending',
          metadata: {
            isVoiceCallMessage: true // 标记为语音通话消息，确保自动TTS播放
          }
        }

        // 开始请求AI响应
        window.message.loading({ content: '正在思考...', key: 'voice-call-thinking' })
        
        // 发送API请求
        const result = await fetchChatCompletion({
          message: aiMsg,
          messages: [userMsg],
          assistant: assistant,
          onResponse: (msg) => {
            console.log('收到AI响应进度更新:', msg.content.length > 20 ? msg.content.substring(0, 20) + '...' : msg.content)
          }
        })
        
        if (!result || !result.content) {
          throw new Error('获取AI回复失败');
        }

        // 添加AI回复到对话历史
        this.conversationHistory.push({ role: 'assistant', content: result.content })

        // 关闭思考中提示
        window.message.success({ content: '思考完成', key: 'voice-call-thinking' })

        // 合成语音并播放
        this.callbacks?.onResponse(result.content)

        // 更新UI状态
        this.callbacks?.onSpeakingStateChange(true)

        // 合成并播放语音
        try {
          await this.ttsService.speak(result.content)
          // 等待一小段时间确保状态更新
          await new Promise(resolve => setTimeout(resolve, 100))
          
          // 播放完成后更新状态
          if (!this.ttsService.isCurrentlyPlaying()) {
            this.callbacks?.onSpeakingStateChange(false)
          }
        } catch (ttsError) {
          const ttsErrorMsg = ttsError instanceof Error ? ttsError.message : String(ttsError);
          console.error('TTS播放失败:', ttsErrorMsg)
          // 确保状态更新
          this.callbacks?.onSpeakingStateChange(false)
        }

        // 处理完成后重置状态
        this.isProcessingResponse = false
        return true
      } catch (dialogError) {
        const dialogErrorMsg = dialogError instanceof Error ? dialogError.message : String(dialogError);
        console.error('处理对话失败:', dialogError)
        window.message.error({ content: '处理对话失败: ' + dialogErrorMsg, key: 'voice-call-error' })
        
        // 处理完成后重置状态
        this.isProcessingResponse = false
        
        // 确保TTS状态重置
        this.callbacks?.onSpeakingStateChange(false)
        
        return false
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('处理用户语音输入失败:', error)
      window.message.error({ content: '处理用户语音输入失败: ' + errorMsg, key: 'voice-call-error' })
      
      // 处理完成后重置状态
      this.isProcessingResponse = false
      return false
    }
  }

  /**
   * 停止录音并将结果发送到聊天界面
   * @returns Promise<boolean> 是否成功停止录音
   */
  async stopRecordingAndSendToChat(): Promise<boolean> {
    if (!this.isCallActive || !this.isRecording) {
      return false
    }

    // 清除录音超时定时器
    if (this.recordingTimeout) {
      clearTimeout(this.recordingTimeout)
      this.recordingTimeout = null
    }

    // 获取当前ASR服务类型
    const { asrServiceType } = store.getState().settings

    try {
      // 立即设置录音状态为false，防止重复处理
      this.isRecording = false
      this.callbacks?.onListeningStateChange(false)

      // 存储当前的语音识别结果，用于松开按钮后发送给AI
      const currentTranscript = this._currentTranscript
      // 存储累积的语音识别结果
      const accumulatedTranscript = this._accumulatedTranscript

      if (asrServiceType === 'browser') {
        // 浏览器ASR
        if (!this.recognition) {
          throw new Error('Browser speech recognition not initialized')
        }

        this.recognition.stop()

        // 优先使用累积的文本，如果有的话
        if (accumulatedTranscript && accumulatedTranscript.trim()) {
          console.log('发送累积的语音识别结果给聊天界面:', accumulatedTranscript)
          this.handleUserSpeech(accumulatedTranscript, true)
        } else if (currentTranscript && currentTranscript.trim()) {
          // 如果没有累积结果，使用当前结果
          console.log('没有累积结果，使用当前结果发送给聊天界面:', currentTranscript)
          this.handleUserSpeech(currentTranscript, true)
        } else {
          console.log('没有有效的语音识别结果，不发送消息')
          window.message.info({ content: '没有收到语音输入', key: 'voice-call-empty' })
        }

        // 清除状态
        this._currentTranscript = ''
        this._accumulatedTranscript = ''
      } else if (asrServiceType === 'local') {
        // 本地服务器ASR
        // 创建一个承诺，等待最终结果
        const finalResultPromise = new Promise<string>((resolve) => {
          // 设置一个超时器，确保不会无限等待
          const timeoutId = setTimeout(() => {
            console.log('等待最终结果超时，使用当前结果')
            resolve(this._currentTranscript)
          }, 1500) // 1.5秒超时

          // 设置回调函数来接收最终结果
          const resultCallback = (text: string, isFinal?: boolean) => {
            // 如果是空字符串，表示只是重置状态，不处理
            if (text === '') return

            if (text) {
              // 只处理最终结果，忽略中间结果
              if (isFinal) {
                clearTimeout(timeoutId)
                console.log('收到最终语音识别结果:', text)
                this._currentTranscript = text
                this.callbacks?.onTranscript(text)
                resolve(text)
              } else {
                // 对于中间结果，只更新显示，不解析Promise
                console.log('收到中间语音识别结果:', text)
                this.callbacks?.onTranscript(text)
              }
            }
          }

          // 停止录音，但不取消，以获取最终结果
          ASRService.stopRecording(resultCallback)

          // 添加额外的安全措施，在停止后立即发送重置命令
          setTimeout(() => {
            // 发送重置命令，确保浏览器不会继续发送结果
            ASRService.cancelRecording()

            // 清除ASRService中的回调函数，防止后续结果被处理
            ASRService.resultCallback = null
          }, 2000) // 2秒后强制取消，作为安全措施
        })

        // 等待最终结果，但最多等待3秒
        const finalText = await finalResultPromise

        // 优先使用累积的文本，如果有的话
        if (accumulatedTranscript && accumulatedTranscript.trim()) {
          console.log('发送累积的语音识别结果给聊天界面:', accumulatedTranscript)
          this.handleUserSpeech(accumulatedTranscript, true)
        } else if (finalText && finalText.trim()) {
          // 如果没有累积结果，使用最终结果
          console.log('发送最终语音识别结果给聊天界面:', finalText)
          this.handleUserSpeech(finalText, true)
        } else if (currentTranscript && currentTranscript.trim()) {
          // 如果没有最终结果，使用当前结果
          console.log('没有最终结果，使用当前结果发送给聊天界面:', currentTranscript)
          this.handleUserSpeech(currentTranscript, true)
        } else {
          console.log('没有有效的语音识别结果，不发送消息')
          window.message.info({ content: '没有收到语音输入', key: 'voice-call-empty' })
        }

        // 再次确保所有状态被重置
        this._currentTranscript = ''
        this._accumulatedTranscript = ''
      } else if (asrServiceType === 'openai') {
        // OpenAI ASR
        await ASRService.stopRecording((text) => {
          // 更新最终的语音识别结果
          if (text) {
            this._currentTranscript = text
            this.callbacks?.onTranscript(text)
          }
        })

        // 使用最新的语音识别结果
        const finalTranscript = this._currentTranscript
        if (finalTranscript && finalTranscript.trim()) {
          console.log('发送OpenAI语音识别结果给聊天界面:', finalTranscript)
          this.handleUserSpeech(finalTranscript, true)
        } else {
          console.log('没有有效的OpenAI语音识别结果，不发送消息')
          window.message.info({ content: '没有收到语音输入', key: 'voice-call-empty' })
        }

        // 清除状态
        this._currentTranscript = ''
        this._accumulatedTranscript = ''
      }

      return true
    } catch (error) {
      console.error('Failed to stop recording:', error)
      this.isRecording = false
      this.callbacks?.onListeningStateChange(false)

      // 确保在出错时也清除状态
      this._currentTranscript = ''
      this._accumulatedTranscript = ''

      // 强制取消录音
      ASRService.cancelRecording()

      return false
    }
  }

  /**
   * 取消录音，不发送给AI
   * @returns Promise<boolean> 是否成功取消录音
   */
  async cancelRecording(): Promise<boolean> {
    if (!this.isCallActive || !this.isRecording) {
      return false
    }

    // 清除录音超时定时器
    if (this.recordingTimeout) {
      clearTimeout(this.recordingTimeout)
      this.recordingTimeout = null
    }

    // 获取当前ASR服务类型
    const { asrServiceType } = store.getState().settings

    try {
      if (asrServiceType === 'browser') {
        // 浏览器ASR
        if (!this.recognition) {
          throw new Error('Browser speech recognition not initialized')
        }

        this.recognition.stop()
        this.isRecording = false
        this.callbacks?.onListeningStateChange(false)
      } else if (asrServiceType === 'local') {
        // 本地服务器ASR
        ASRService.cancelRecording()
        this.isRecording = false
        this.callbacks?.onListeningStateChange(false)
      } else if (asrServiceType === 'openai') {
        // OpenAI ASR
        ASRService.cancelRecording()
        this.isRecording = false
        this.callbacks?.onListeningStateChange(false)
      }

      // 清除当前识别结果
      this._currentTranscript = ''
      this.callbacks?.onTranscript('')

      return true
    } catch (error) {
      console.error('Failed to cancel recording:', error)
      this.isRecording = false
      this.callbacks?.onListeningStateChange(false)
      return false
    }
  }

  setMuted(muted: boolean) {
    // 如果设置为静音，停止当前TTS播放
    if (muted && this.ttsService.isCurrentlyPlaying()) {
      this.ttsService.stop()
    }
  }

  /**
   * 停止TTS播放
   * @returns void
   */
  stopTTS(): void {
    // 无论是否正在播放，都强制停止TTS
    this.ttsService.stop()
    console.log('强制停止TTS播放')

    // 注意：不需要手动触发事件，因为在TTSService.stop()中已经触发了
  }

  setPaused(paused: boolean) {
    this.isPaused = paused

    // 获取当前ASR服务类型
    const { asrServiceType } = store.getState().settings

    if (paused) {
      // 暂停语音识别
      if (asrServiceType === 'browser') {
        this.recognition?.stop()
      } else if (asrServiceType === 'local' || asrServiceType === 'openai') {
        ASRService.cancelRecording()
      }

      // 暂停TTS
      if (this.ttsService.isCurrentlyPlaying()) {
        this.ttsService.stop()
      }
    }
    // 不自动恢复语音识别，等待用户长按按钮
  }

  endCall() {
    if (!this.isCallActive) {
      return; // 避免重复调用
    }

    // 设置状态为非活动
    this.isCallActive = false

    try {
      // 获取当前ASR服务类型
      const { asrServiceType } = store.getState().settings

      // 停止语音识别
      if (asrServiceType === 'browser') {
        try {
          this.recognition?.stop();
        } catch (error) {
          console.error('停止浏览器语音识别时出错:', error);
        }
      } else if (asrServiceType === 'local' || asrServiceType === 'openai') {
        try {
          ASRService.cancelRecording();
        } catch (error) {
          console.error('取消ASR录音时出错:', error);
        }
      }

      // 停止TTS
      try {
        if (this.ttsService.isCurrentlyPlaying()) {
          this.ttsService.stop();
        }
      } catch (error) {
        console.error('停止TTS播放时出错:', error);
      }

      // 重置状态
      this.isRecording = false;
      this.isPaused = false;
      this.isProcessingResponse = false;
      this._currentTranscript = '';
      this._accumulatedTranscript = '';
      this.conversationHistory = [];

      // 清除录音超时定时器
      if (this.recordingTimeout) {
        clearTimeout(this.recordingTimeout);
        this.recordingTimeout = null;
      }

      // 移除可能的事件监听器
      window.removeEventListener('tts-state-change', this.handleTTSStateChange as EventListener);

      // 通知UI更新状态
      if (this.callbacks) {
        this.callbacks.onListeningStateChange(false);
        this.callbacks.onSpeakingStateChange(false);
        this.callbacks.onTranscript('');
        this.callbacks = null;
      }

      console.log('语音通话已结束');
    } catch (error) {
      console.error('结束语音通话时出错:', error);
    }
  }

  // TTS状态变化处理函数
  private handleTTSStateChange = (event: CustomEvent) => {
    const { isPlaying } = event.detail;
    this.callbacks?.onSpeakingStateChange(isPlaying);
  }
}

export const VoiceCallService = new VoiceCallServiceClass()
