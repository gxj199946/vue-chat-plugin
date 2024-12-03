# Vue Chat Plugin

A Vue 3 plugin that provides a customizable chat interface component.

## Installation

```bash
npm install vue-chat-plugin  # or your package name
```

## Usage

### Global Registration

```js
import { createApp } from 'vue'
import ChatPlugin from 'vue-chat-plugin'  // or your package name
import App from './App.vue'

const app = createApp(App)
app.use(ChatPlugin)
```

### In Component

```vue
<template>
  <Chat
    :endpoint="/chat/rag/vector"
    width="300px"
    height="400px"
    fontSize="14px"
    :draggable="true"
    :minimizable="true"
  />
</template>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| locale | string | '' | Localization setting |
| endpoint | string | '/chat/rag/vector' | Chat API endpoint |
| width | string | '300px' | Width of the chat window |
| height | string | '400px' | Height of the chat window |
| fontSize | string | '14px' | Font size for messages |
| draggable | boolean | false | Enable window dragging |
| minimizable | boolean | false | Enable window minimization |

## Features

- Markdown support with syntax highlighting
- Draggable chat window
- Minimizable interface
- Real-time message streaming
- Auto-resizing input
- Customizable styling
