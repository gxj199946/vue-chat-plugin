<template>
  <div class="chat-container" 
       :style="containerStyle"
       ref="chatContainer"
       @mousedown="handleDragStart"
       @click="isMinimized && toggleMinimize()"
       :class="{ 'draggable': props.draggable, 'minimized': isMinimized }">
    <div class="chat-header" :class="{ 'draggable': props.draggable }">
      <div class="chat-title">
        <svg class="chat-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168l-.79 2.864a1.25 1.25 0 001.52 1.52l2.864-.79A9.956 9.956 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" fill="currentColor"/>
        </svg>
        <span v-if="!isMinimized">AI 智能助手</span>
      </div>
      <!-- 最小化按钮 -->
      <button v-if="props.minimizable && !isMinimized" 
              @click.stop="toggleMinimize" 
              class="minimize-button"
              title="最小化">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 13H5v-2h14v2z" fill="currentColor"/>
        </svg>
      </button>
    </div>
    <div v-show="!isMinimized" class="chat-messages custom-scrollbar" ref="messageContainer">
      <!-- 消息内容 -->
      <div v-for="(message, index) in messages" :key="index" 
           class="message" :class="[message.role, { 'first-message': index === 0 }]">
        <div class="message-content" :class="{ 'with-avatar': true }">
          <template v-if="message.role === 'user'">
            <div class="avatar user">
              &#x1F481;
            </div>
            <div class="message-bubble user">
              <div class="text" :style="messageTextStyle" v-html="formatMessage(message.content)"></div>
              <div v-if="message.content" class="message-time">{{ message.time || formatTime() }}</div>
            </div>
          </template>
          <template v-else>
            <div class="avatar assistant">
              &#x1F916;
            </div>
            <div class="message-bubble assistant">
              <div class="text" :style="messageTextStyle">
                <span v-html="formatMessage(message.content)"></span>
                <span v-if="isStreaming && index === messages.length - 1" class="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </div>
              <div v-if="message.content" class="message-time">{{ message.time || formatTime() }}</div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-show="!isMinimized" class="chat-input-container">
      <div class="input-wrapper">
        <textarea
          v-model="userInput"
          @keydown.enter.prevent="sendMessage"
          placeholder="&#x8bf7;&#x8f93;&#x5165;&#x60a8;&#x7684;&#x95ee;&#x9898;..."
          :disabled="isStreaming"
          rows="1"
          @input="autoResize"
          ref="inputArea"
          :style="messageTextStyle"
        ></textarea>
        <button 
          @click="isStreaming ? stopStreaming() : sendMessage()" 
          :disabled="!isStreaming && !userInput.trim()"
          class="send-button"
          :class="{ 'stop-button': isStreaming }"
        >
          <template v-if="!isStreaming">
            <svg class="send-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
            </svg>
          </template>
          <template v-else>
            <svg class="stop-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
              <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
            </svg>
          </template>
        </button>
      </div>
    </div>
    <div v-if="isMinimized" class="minimized-label">AI &#x667a;&#x80fd;&#x52a9;&#x624b;</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, computed, watch, onUnmounted } from 'vue'
import MarkdownIt from 'markdown-it'
import MarkdownItHighlightjs from 'markdown-it-highlightjs'
import { fetchEventSource } from '@microsoft/fetch-event-source'

interface ChatProps {
  locale?: string;
  endpoint?: string;
  width?: string;
  height?: string;
  fontSize?: string;
  draggable?: boolean;
  minimizable?: boolean;
}

const props = withDefaults(defineProps<ChatProps>(), {
  locale: '',
  endpoint: '/chat/rag/vector',
  width: '300px',
  height: '400px',
  fontSize: '14px',
  draggable: false,
  minimizable: false
})

const md = new MarkdownIt({
  html: true,
  breaks: true,  // &#x8ba1;&#x5226;&#x6c17;&#x7f51;
  linkify: true, // &#x81ea;&#x52a8;&#x8ba1;&#x5226;&#x94fe;&#x63a5;
  typographer: true,  // &#x542f;&#x7528;&#x4e00;&#x4e9b;&#x8bed;&#x8a00;&#x66f6;&#x6362;
  quotes: '',
}).use(MarkdownItHighlightjs)

md.renderer.rules.heading_open = (tokens, idx) => {
  const token = tokens[idx];
  const level = token.markup.length; // # &#x7684;&#x6570;&#x91cf;&#x4ee3;&#x8868;&#x7a7a;&#x7ea7;
  return `<h${level} class="markdown-heading level-${level}">`;
};

const messageContainer = ref<HTMLElement | null>(null)
const messages = ref<{ role: string; content: string; id: number; time?: string }[]>([])
const userInput = ref('')
const isStreaming = ref(false)
const streamingContent = ref('')
const inputArea = ref<HTMLTextAreaElement | null>(null)
let assistantId = 0
let controller: AbortController | null = null;

const isMinimized = ref(false)

// 计算容器样式，处理最小化状态和拖拽位置
const containerStyle = computed(() => {
  // 基础样式配置
  const baseStyle: Record<string, any> = {
    width: isMinimized.value ? '60px' : props.width,
    height: isMinimized.value ? '80px' : props.height,
    transform: `translate(${containerPos.value.x}px, ${containerPos.value.y}px)`,
    transformOrigin: 'right bottom'
  }

  // 非拖拽状态下添加过渡动画
  if (!isDragging.value) {
    baseStyle.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
  }
  
  // 最小化状态的额外样式
  if (isMinimized.value) {
    return {
      ...baseStyle,
      borderRadius: '10px',
      overflow: 'hidden'
    }
  }
  
  return baseStyle
})

const messageTextStyle = computed(() => ({
  fontSize: props.fontSize,
}))

const formatMessage = (content: string): string => {
  try {
    let processedContent = content
      .replace(/\n{2,}/g, '\n\n')
      .replace(/\n-/g, '\n\n-')
      .replace(/\n(#{1,6})\s/g, '\n\n$1 ');
    
    return md.render(processedContent);
  } catch (err) {
    console.error('Markdown &#x5904;&#x7406;&#x9519;&#x8bef;', err);
    return content;
  }
}

const formatTime = () => {
  const now = new Date()
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
}

const autoResize = () => {
  if (inputArea.value) {
    inputArea.value.style.height = 'auto'
    inputArea.value.style.height = Math.min(inputArea.value.scrollHeight, 120) + 'px'
  }
}

const scrollToBottom = async () => {
  await nextTick()
  if (messageContainer.value) {
    messageContainer.value.scrollTo({
      top: messageContainer.value.scrollHeight,
      behavior: 'smooth'
    })
  }
}

watch(() => messages.value, () => {
  scrollToBottom()
}, { deep: true })

const stopStreaming = () => {
  if (controller) {
    controller.abort();
    controller = null;
    isStreaming.value = false;
  }
};

const handleStreamResponse = async (text: string) => {
  try {
    // 处理响应文本
    streamingContent.value += text
    messages.value[messages.value.length - 1].content = streamingContent.value
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.log('Stream aborted')
    } else {
      console.error('Error in stream response:', error)
    }
  }
};

const sendMessage = async () => {
  if (!userInput.value.trim() || isStreaming.value) return

  const userMessage = {
    role: 'user',
    content: userInput.value,
    id: Date.now(),
    time: formatTime()
  }

  messages.value.push(userMessage)
  userInput.value = ''
  autoResize()

  // 添加助手消息占位
  const assistantMessage = {
    role: 'assistant',
    content: '',
    id: ++assistantId,
    time: formatTime()
  }
  messages.value.push(assistantMessage)

  streamingContent.value = ''
  isStreaming.value = true

  try {
    controller = new AbortController()
    await fetchEventSource(props.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messages.value.map(({ role, content }) => ({ role, content }))
      }),
      signal: controller.signal,
      async onmessage(event) {
        if (event.data === '[DONE]') {
          isStreaming.value = false
          controller = null
          return
        }
        try {
          const data = JSON.parse(event.data)
          handleStreamResponse(data.content)
        } catch (err) {
          console.error('Error parsing message:', err)
        }
      },
      onerror(err: Error) {
        console.error('EventSource error:', err)
        isStreaming.value = false
        controller = null
        throw err
      }
    })
  } catch (error) {
    const err = error as Error
    if (err?.name === 'AbortError') {
      console.log('Stream aborted')
    } else {
      console.error('Error in sendMessage:', err)
      messages.value[messages.value.length - 1].content = 'Error: Failed to get response from server.'
    }
    isStreaming.value = false
    controller = null
  }
}

const isDragging = ref(false)
const dragStartPos = ref({ x: 0, y: 0 })
const containerPos = ref({ x: 0, y: 0 })
const chatContainer = ref<HTMLElement | null>(null)

const handleDragStart = (e: MouseEvent) => {
  if (!props.draggable) return
  
  const target = e.target as HTMLElement
  if (!target.closest('.chat-header')) return
  
  isDragging.value = true
  dragStartPos.value = {
    x: e.clientX - containerPos.value.x,
    y: e.clientY - containerPos.value.y
  }
  
  if (chatContainer.value) {
    chatContainer.value.style.cursor = 'move'
  }
}

const handleDrag = (e: MouseEvent) => {
  if (!isDragging.value) return
  
  containerPos.value = {
    x: e.clientX - dragStartPos.value.x,
    y: e.clientY - dragStartPos.value.y
  }
  
  if (chatContainer.value) {
    chatContainer.value.style.transform = `translate(${containerPos.value.x}px, ${containerPos.value.y}px)`
  }
}

const handleDragEnd = () => {
  isDragging.value = false
  if (chatContainer.value) {
    chatContainer.value.style.cursor = ''
  }
}

const toggleMinimize = () => {
  isMinimized.value = !isMinimized.value
}

onMounted(() => {
  const {userInfo}=JSON.parse(localStorage.getItem('auth')!);
  nextTick(() => {
    messages.value.push({
      role: 'assistant',
      content: `\u4f60\u597d${userInfo.username}\uff01\u6211\u662f\AI\u52a9\u624b\uff0c\u6709\u4ec0\u4e48\u53ef\u4ee5\u5e2e\u4f60\u7684\uff1f`,
      id: ++assistantId
    })
  })
  if (props.draggable) {
    document.addEventListener('mousemove', handleDrag)
    document.addEventListener('mouseup', handleDragEnd)
  }
})

onUnmounted(() => {
  if (controller) {
    controller.abort();
  }
  if (props.draggable) {
    document.removeEventListener('mousemove', handleDrag)
    document.removeEventListener('mouseup', handleDragEnd)
  }
})
</script>

<style lang="scss" scoped>
// 聊天容器的基础样式
.chat-container {
  position: fixed;        // 固定定位，不随页面滚动
  top: 30%;              // 初始垂直位置
  left: 74%;             // 初始水平位置
  transform: translate(-50%, -50%);  // 居中定位偏移
  background: #fff;      // 白色背景
  border-radius: 8px;    // 圆角边框
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);  // 阴影效果
  display: flex;         // 弹性布局
  flex-direction: column;  // 子元素垂直排列
  overflow: hidden;      // 隐藏溢出内容
  z-index: 1000000000;   // 确保显示在最上层
  transform-origin: right bottom;  // 变换原点设置为右下角，控制最小化/展开的方向
  
  // 最小化状态的样式
  &.minimized {
    cursor: pointer;     // 鼠标悬停显示手型光标
    transform-origin: right bottom;  // 变换原点设置为右下角，控制缩放方向
    
    .chat-header {
      padding: 8px 0;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      
      .chat-title {
        margin: 0;
        
        .chat-icon {
          width: 32px;
          height: 32px;
          color: #1a73e8;
        }
      }
    }
  }
}

.minimized-label {
  text-align: center;
  font-size: 12px;
  color: #666;
  padding: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-header {
  padding: 12px;
  background: #fff;
  border-bottom: 1px solid #eaecef;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  
  .chat-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
    color: #333;
    
    .chat-icon {
      width: 24px;
      height: 24px;
      color: #1a73e8;
    }
  }
}

.minimize-button {
  width: 28px;
  height: 28px;
  padding: 4px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  
  &:hover {
    background: #f5f5f5;
    border-color: #ccc;
  }
  
  svg {
    width: 16px;
    height: 16px;
  }
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  scroll-behavior: smooth;
}

// &#x81ea;&#x5b9a;&#x4e49;&#x6eda;&#x52a8;&#x683c;&#x5f0f;
.custom-scrollbar {
  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 3px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 3px;
    transition: background 0.2s ease;
    
    &:hover {
      background: rgba(0, 0, 0, 0.2);
    }
  }
  
  &::-webkit-scrollbar-corner {
    background: transparent;
  }
}

.message {
  margin-bottom: 16px;
  transition: all 0.3s ease;
  
  &:last-child {
    margin-bottom: 0;
  }

  &.user .message-content {
    flex-direction: row-reverse;
    
    .message-bubble {
      background: #1976d2;
      color: white;
      margin-right: 8px;
      
      .message-time {
        color: rgba(255, 255, 255, 0.7);
      }
    }
  }
}

.typing-dots {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  
  span {
    width: 4px;
    height: 4px;
    margin: 0 2px;
    background: currentColor;
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out;
    
    &:nth-child(1) { animation-delay: -0.32s; }
    &:nth-child(2) { animation-delay: -0.16s; }
  }
}

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: flex-end;
  width: 100%;
  
  textarea {
    flex: 1;
    min-height: 40px;
    max-height: 120px;
    padding: 8px 40px 8px 12px;
    border: 1px solid #ddd;
    border-radius: 20px;
    resize: none;
    outline: none;
    font-family: inherit;
    
    &:focus {
      border-color: #1a73e8;
    }
    
    &:disabled {
      background-color: #f5f5f5;
    }
  }
}

.send-button {
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: 32px;
  height: 32px;
  padding: 6px;
  border: none;
  border-radius: 50%;
  background: #1a73e8;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  
  &:hover:not(:disabled) {
    background: #1557b0;
  }
  
  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
  
  &.stop-button {
    background: #dc3545;
    
    &:hover {
      background: #c82333;
    }
  }

  .send-icon, .stop-icon {
    width: 20px;
    height: 20px;
  }
}

.chat-input-container {
  padding: 12px;
  border-top: 1px solid #eaecef;
  background: #fff;
}

.message {
  margin-bottom: 16px;
  transition: all 0.3s ease;
  
  &:last-child {
    margin-bottom: 0;
  }
}

.message-content {
  display: flex;
  gap: 8px;
  
  &.with-avatar {
    padding-left: 8px;
  }
}

.avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
  
  &.user {
    background: #e3f2fd;
  }
  
  &.assistant {
    background: #f5f5f5;
  }
}

.message-bubble {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 12px;
  position: relative;
  
  &.assistant {
    background: #f8f9fa;
    
    :deep(.markdown-heading) {
      margin: 16px 0 8px;
      font-weight: 600;
      line-height: 1.4;
      
      &.level-1 {
        font-size: 1.4em;
        border-bottom: 1px solid #eaecef;
        padding-bottom: 0.3em;
      }
      
      &.level-2 {
        font-size: 1.3em;
      }
      
      &.level-3 {
        font-size: 1.2em;
      }
      
      &.level-4 {
        font-size: 1.1em;
      }
      
      &.level-5, &.level-6 {
        font-size: 1em;
      }
      
      &:first-child {
        margin-top: 0;
      }
    }
    
    :deep(p) {
      margin: 8px 0;
      line-height: 1.6;
      
      &:first-child {
        margin-top: 0;
      }
      
      &:last-child {
        margin-bottom: 0;
      }
    }
    
    :deep(ul), :deep(ol) {
      margin: 8px 0;
      padding-left: 20px;
      
      li {
        margin: 4px 0;
      }
    }
    
    :deep(code) {
      background: #e9ecef;
      padding: 2px 4px;
      border-radius: 4px;
      font-family: monospace;
    }
    
    :deep(pre) {
      background: #282c34;
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 8px 0;
      
      code {
        background: none;
        padding: 0;
        color: #abb2bf;
      }
    }
  }
  
  &.user {
    background: #1a73e8;
    color: white;
  }
  
  .text {
    line-height: 1.5;
    word-break: break-word;
    
    :deep(p) {
      margin: 0;
    }
  }
  
  .message-time {
    font-size: 12px;
    color: #999;
    margin-top: 4px;
    text-align: right;
  }
}

:deep(.text) {
  line-height: 1.6;
  font-size: 14px;
}

:deep(.text p) {
  margin: 0 0 8px;
}

:deep(.text p:last-child) {
  margin-bottom: 0;
}

:deep(.text pre) {
  background: #f8f9fa;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

:deep(.text code) {
  font-family: 'Fira Code', monospace;
  background: #f1f3f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}
</style>