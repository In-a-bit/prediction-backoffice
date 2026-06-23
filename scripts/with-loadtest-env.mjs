// Runs `next <args>` with .env.local.loadtest loaded into the environment.
//
// Why not `node --env-file=.env.local.loadtest next dev`?
//   `next dev` forks worker processes, and Node forwards the parent's
//   --env-file flag to them via NODE_OPTIONS — which Node then rejects with
//   "--env-file is not allowed in NODE_OPTIONS", crashing the workers.
//
// Loading the file into process.env instead inherits cleanly to every forked
// child. Next.js checks process.env BEFORE .env.local, so the load-test values
// win without touching your normal .env.local.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

// Throws if the file is missing — fail loudly rather than load-test dev config.
process.loadEnvFile('.env.local.loadtest')

const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next')
const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
