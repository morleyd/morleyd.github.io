import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import vuetify from './plugins/vuetify'
import './assets/app.css'

const app = createApp(App)

// Surface any uncaught error loudly (with a tag) so a white-screen during a
// playtest leaves a breadcrumb in the console instead of vanishing silently.
// These only log — they never swallow — so real bugs still fail visibly.
app.config.errorHandler = (err, _instance, info) => {
  console.error('[app] Vue error:', info, err)
}
window.addEventListener('error', (e) => console.error('[app] window error:', e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => console.error('[app] unhandled rejection:', e.reason))

app.use(router)
app.use(vuetify)

app.mount('#app')
