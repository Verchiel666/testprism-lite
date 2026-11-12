#!/usr/bin/env node
import { main } from '../lib/cli.mjs'

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code
}).catch((err) => {
  console.error('error: ' + (err && err.message ? err.message : String(err)))
  process.exitCode = 2
})
