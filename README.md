# morleyd.github.io

David Morley's personal site — a research-scientist portfolio plus a small arcade
of browser games. Live at **[morleyd.github.io](https://morleyd.github.io)**.

Single-page app built with **Vue 3**, **Vuetify 4**, and **Vite**, deployed to
GitHub Pages automatically on every push to `master`.

## What's here

**Portfolio**: Home (headline, featured work, timeline), `/work` (case studies,
earlier projects, archive), `/about` (`/contact` redirects there), and the
résumé PDF. All portfolio copy lives in
[`src/data/portfolio.ts`](src/data/portfolio.ts); the components only render it.

**Playground** (`/games`, URL unchanged): the games below, plus the art gallery.

| Game | Route | Notes |
|------|-------|-------|
| Wizard Chess | `/wizard-chess` | Chess where every piece is a character with moods, bonds, and opinions — a social sim layered over a search engine (`chess.js` + a Web Worker). |
| Wordle | `/wordle` | With a shareable daily/seeded mode. |
| Wordle Helper | `/wordle-helper` | Solver / candidate explorer. |
| Snake | `/snake` | |
| Minesweeper | `/minesweeper` | |
| Lights Out | `/lights-out` | |
| Flood It | `/flood-it` | |
| Gradient Sort | `/gradient-sort` | |

Most games take an optional seed in the URL so a specific board can be shared.

## Local development

```bash
npm install
npm run dev        # Vite dev server on http://localhost:3000
```

### Scripts

| Command | Does |
|---------|------|
| `npm run dev` | Start the dev server. |
| `npm run build` | Production build to `dist/` (also emits `404.html` for SPA-style deep links). |
| `npm run preview` | Serve the production build locally. |
| `npm run test:unit` | Vitest unit tests. |
| `npm run test:e2e` | Playwright end-to-end tests. |
| `npm run lint` | ESLint (flat config) with `--fix`. |
| `npm run format` | Prettier over `src/`. |

## Refreshing the résumé

`public/David-Morley-Resume.pdf` is the public web copy of the résumé: the same
one page, without the phone number. It's built outside this repo, from the
résumé's Markdown source, by `build.sh` (pandoc + headless Chrome), which writes
both `resume.pdf` and `resume-web.pdf`. To refresh it:

1. Edit the résumé source and run `sh build.sh` next to it.
2. Copy `resume-web.pdf` over `public/David-Morley-Resume.pdf`.
3. If a headline number changed, update `src/data/portfolio.ts` to match: the
   site and the PDF must say the same thing.

The link-preview image (`public/og-image.png`, 1200×630) is a static render of
the name and headline; regenerate it if the headline changes.

## Deployment

Pushing to `master` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds and publishes `dist/` to GitHub Pages. No manual step. `master` is
lightly protected (no force-push or deletion); everything else is fair game.

## Maintenance

This repo is intentionally low-touch — Dependabot's routine PRs are off. A couple
of times a year, from the repo root:

```bash
npm outdated                              # what's behind
npm audit                                 # any real vulnerabilities
npm run lint && npm run test:unit && npm run build   # confirm still healthy
```

Bump what looks safe, run the checks, and push. Major-version bumps (Vue,
vue-router, ESLint, Vitest) deserve a manual look — verify the app still boots
via `npm run preview` before pushing.
