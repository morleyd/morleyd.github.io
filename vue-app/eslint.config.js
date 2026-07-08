import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

// Flat config (ESLint 9). Lints JS, TS and Vue SFCs — @vue/eslint-config-typescript
// wires the TypeScript parser into <script lang="ts"> blocks. Not type-aware (the
// app has no tsconfig; Vite/esbuild handle transpilation), so rules stay syntactic.
export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{js,mjs,ts,mts,vue}'],
  },
  {
    name: 'app/files-to-ignore',
    ignores: ['**/dist/**', '**/coverage/**', '**/playwright-report/**', '**/test-results/**'],
  },
  {
    // App code runs in the browser; config/tooling files run in Node.
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  js.configs.recommended,
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/*.spec.{js,ts}'],
  },
  {
    name: 'app/rule-tweaks',
    rules: {
      // This app deliberately mixes plain-JS and TS single-file components, so
      // don't force a `lang="ts"` on every <script>.
      'vue/block-lang': 'off',
      // Single-word view/component names (Snake, Wordle, Projects, Timeline) are
      // intentional here.
      'vue/multi-word-component-names': 'off',
    },
  },
  skipFormatting,
)
