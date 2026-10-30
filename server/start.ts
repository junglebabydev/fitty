// Entry point of the self-hosted container (Dockerfile, docs/SELF_HOST.md). Bundled to server.mjs by esbuild.
// Env: PORT (default 8080), DIST_DIR (default ./dist), DATA_DIR (default ./data), plus the Worker secrets and vars.
import { createHost } from './host'

const port = Number(process.env.PORT || 8080)
const server = createHost({ distDir: process.env.DIST_DIR || 'dist', dataDir: process.env.DATA_DIR || 'data', vars: process.env })

server.listen(port, () => console.log(`fitty listening on :${port}`))
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
