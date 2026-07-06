import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        dark: true,
        colors: {
          // Unified slate palette shared across every page (matches the Wordle board)
          background: '#020617',
          surface: '#0f172a',
          primary: '#8e24aa', // purple, matches the app bar
          secondary: '#a78bfa',
        },
      },
    },
  },
})

export default vuetify
