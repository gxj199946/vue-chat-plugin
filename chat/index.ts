import { App } from 'vue'
import Chat from './Chat.vue'

export { Chat }

export default {
  install: (app: App, options = {}) => {
    app.component('Chat', Chat)
  }
}
