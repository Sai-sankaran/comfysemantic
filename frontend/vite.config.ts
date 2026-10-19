import { readFile } from 'node:fs/promises'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Serves `/__screens` in dev only.
 *
 * A middleware rather than a second HTML file in the project root: a file would
 * be part of the source tree and easy to build by accident, whereas a plugin only
 * ever exists in `vite dev` and `vite serve`. `npm run build` never sees it, which
 * is what makes "excluded from the production build" true rather than merely
 * intended.
 */
function screensRoute(): Plugin {
  return {
    name: 'comfypanel-dev-screens',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0]

        if (url === '/__screens') {
          // Resolved from the configured root rather than from `import.meta.url`,
          // so it keeps working no matter where the config file sits. Getting this
          // wrong is silent: the read fails, `next()` runs, and Vite's SPA fallback
          // serves the main app at this path instead - which looks exactly like the
          // middleware not existing. Hence the loud 500 below rather than `next()`.
          const file = path.join(server.config.root, 'harness', 'screens.html')
          try {
            const raw = await readFile(file, 'utf-8')
            // `transformIndexHtml` is not optional. A hand-written HTML file served
            // from middleware never passes through Vite's index transform, so the
            // React Refresh preamble is missing and the first component to render
            // throws "can't detect preamble". This is the same injection the real
            // index.html gets, so HMR behaves identically on both pages.
            const html = await server.transformIndexHtml('/__screens', raw)
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.setHeader('Cache-Control', 'no-store')
            res.end(html)
          } catch (e) {
            res.statusCode = 500
            res.end(
              `<h1>/__screens could not load</h1><p>${String(e)}</p><p>Tried: <code>${file}</code></p>`,
            )
          }
          return
        }

        /**
         * The scenario catalogue, as JSON.
         *
         * `npm run shots` reads the list from *here* rather than keeping a copy,
         * because a second copy in the script would drift and a screenshot run
         * that quietly photographed last month's scenarios would be worse than no
         * run at all. `ssrLoadModule` evaluates the very same TypeScript module the
         * page imports, so there is one source of truth and no build step.
         */
        if (url === '/__screens/scenarios.json') {
          try {
            const mod = await server.ssrLoadModule('/src/dev/scenarios.ts')
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(
              JSON.stringify(
                { scenarios: mod.allScenarios(), missingSta: mod.missingStaStates() },
                null,
                2,
              ),
            )
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(e) }))
          }
          return
        }

        return next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), screensRoute()],
})