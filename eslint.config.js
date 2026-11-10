import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import tseslint from 'typescript-eslint'

// Flat config. Lints JS, TS and Vue SFCs — @vue/eslint-config-typescript
// wires the TypeScript parser into <script> blocks. Not type-aware (the
// app has no tsconfig; Vite/esbuild handle transpilation), so rules stay syntactic.
export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{js,mjs,ts,mts,vue}'],
  },
  {
    name: 'app/files-to-ignore',
    // .claude/ holds local Claude Code worktrees: full repo copies with their
    // own node_modules, which crash ESLint if it walks into them.
    ignores: ['**/dist/**', '**/coverage/**', '**/playwright-report/**', '**/test-results/**', '**/.claude/**'],
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
    // This app mixes plain-JS and TS single-file components. Parse every <script>
    // block with the TypeScript parser: otherwise plain <script setup> blocks get
    // the JS scope analyzer under typescript-eslint's rules, which then reports
    // every variable as "only used as a type".
    name: 'app/vue-script-parser',
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/*.spec.{js,ts}'],
    rules: {
      // The chess-sim specs assert invariants inside per-ply game loops, where an
      // expect() guarded by a turn/gameOver check is intentional (and does run).
      'vitest/no-conditional-expect': 'off',
    },
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
