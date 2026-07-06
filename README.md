# morleyd.github.io

David Morley's personal site, built as a Vite + Vue 3 (Vuetify) single-page app and
deployed to GitHub Pages at **https://morleyd.github.io**.

## Pages

- **/** — home (timeline, projects, awards)
- **/contact** — contact info
- **/wordle** — a full Wordle game (daily puzzle, hard mode, custom/shared words,
  free-play random words, and post-game analysis). Shared puzzles use
  `/wordle/<hash>`.
- **/time-since** — a count-up timer

## Tech stack

- [Vite](https://vite.dev/) build tooling
- [Vue 3](https://vuejs.org/) (`<script setup>`) + [Vue Router](https://router.vuejs.org/)
- [Vuetify 3](https://vuetifyjs.com/) component library
- Vitest (unit tests) — configured; game-logic services live in `vue-app/src/services/`

## Project layout

```
vue-app/            # the application (all source + build config)
  src/
    views/          # routed pages (HomeView, ContactView, WordleView, TimeSinceView)
    components/      # AppBar, Projects, Awards, Timeline
    services/       # framework-free game logic (wordleLogic, hardMode, analyzer, …)
    router/         # route definitions
  public/           # static assets copied verbatim into the build
.github/workflows/  # CI that builds and deploys to GitHub Pages
```

## Local development

```sh
cd vue-app
npm install
npm run dev        # dev server on http://localhost:3000
npm run build      # production build to vue-app/dist (also writes 404.html)
npm run preview    # serve the production build locally
npm run test:unit  # run vitest
```

## Deployment

Pushes to `master` trigger [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds `vue-app` and publishes `vue-app/dist` to GitHub Pages. The build copies
`index.html` to `404.html` so client-side routes (e.g. a shared `/wordle/<hash>` link)
resolve on a hard refresh, since GitHub Pages has no SPA fallback of its own.
