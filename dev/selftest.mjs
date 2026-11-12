// Self-test: exercises the CLI end to end on examples/mini (no network, no extra deps).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const cli = path.join(root, 'bin/testprism-lite.mjs')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-selftest-'))
let pass = 0
const fails = []
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')) }
}
function run(args) {
  const json = path.join(tmp, 'out-' + Math.random().toString(36).slice(2) + '.json')
  try {
    execFileSync(process.execPath, [cli, ...args, '--json', json, '--quiet'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    // exit code 1 means "not resolved" which is a valid outcome, 2 is a real error
    const code = e.status
    if (code !== 1) throw new Error(`${args[0]} exited ${code}: ${(e.stdout || '') + (e.stderr || '')}`)
  }
  return JSON.parse(fs.readFileSync(json, 'utf8'))
}
const mini = {
  task: 'examples/mini/task',
  patchSet: 'examples/mini/patch-set',
  good: 'examples/mini/suites/good',
  weak: 'examples/mini/suites/weak',
}

console.log('run: a strong suite resolves (JSF pass)')
{
  const r = run(['run', '--task', mini.task, '--patch-set', mini.patchSet, '--suite', mini.good])
  ok('baseline detected', r.baselineDetected === true)
  ok('VAR = 1', r.VAR === 1, String(r.VAR))
  ok('IRR = 1', r.IRR === 1, String(r.IRR))
  ok('JSF resolved', r.resolved === true)
  ok('no patch errors', r.patchErrors === 0)
}

console.log('run: a weak suite passes single-reference (RAR) but fails JSF')
{
  const r = run(['run', '--task', mini.task, '--patch-set', mini.patchSet, '--suite', mini.weak])
  ok('RAR = 1 (single reference says "good test")', r.RAR === 1)
  ok('VAR = 1', r.VAR === 1)
  ok('IRR = 0 (accepts every broken candidate)', r.IRR === 0, String(r.IRR))
  ok('JSF not resolved', r.resolved === false)
  ok('RAR >= JSF invariant', Number(r.RAR) >= Number(r.resolved))
}

console.log('ref: single-reference mode runs baseline + gold only')
{
  const r = run(['ref', '--task', mini.task, '--patch-set', mini.patchSet, '--suite', mini.good])
  const ids = Object.keys(r.candidates)
  ok('exactly one candidate evaluated', ids.length === 1, ids.join(','))
  ok('it is the gold', r.candidates[ids[0]].isGold === true)
  ok('RAR = 1', r.RAR === 1)
}

console.log('probe: arbitrary implementation as a one-candidate panel')
{
  const goldImpl = path.join(tmp, 'calc.mjs')
  execFileSync('sh', [path.join(root, 'examples/mini/patch-set/solutions/gold.sh')], {
    env: { ...process.env, APP_DIR: tmp }, cwd: tmp,
  })
  ok('gold implementation materialised', fs.existsSync(goldImpl))
  const good = run(['probe', '--task', mini.task, '--suite', mini.good, '--impl', goldImpl, '--impl-name', 'calc.mjs'])
  ok('strong suite accepts the gold implementation', good.passed === true)
  const weak = run(['probe', '--task', mini.task, '--suite', mini.weak, '--impl', goldImpl, '--impl-name', 'calc.mjs'])
  ok('weak suite also accepts the gold implementation', weak.passed === true)
  const stub = path.join(mini.task, 'workspace/calc.mjs')
  const onStub = run(['probe', '--task', mini.task, '--suite', mini.good, '--impl', stub, '--impl-name', 'calc.mjs'])
  ok('strong suite rejects the untouched stub', onStub.passed === false)
}

console.log('scan: JSF as a function of panel size')
{
  const r = run(['scan', '--task', mini.task, '--patch-set', mini.patchSet, '--suite', mini.weak])
  ok('curve has one row per panel size', Array.isArray(r.curve) && r.curve.length >= 3, String(r.curve?.length))
  const first = r.curve[0]
  ok('size-1 row equals the single-reference result', first.validOnly === 1 && first.invalidOnly === 1)
  const worse = r.curve.some((row) => row.alternating === 0)
  ok('adding invalid candidates eventually breaks it', worse)
}

console.log('probe with a generic --run command')
{
  const r = run(['run', '--task', mini.task, '--patch-set', mini.patchSet, '--suite', mini.good, '--run', 'node .testprism/suite/test.mjs'])
  ok('custom runner still scores the panel', r.VAR === 1 && r.IRR === 1)
}

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fails.length ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  - ' + f); process.exitCode = 1 }
