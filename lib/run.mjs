// Workspace preparation, candidate application and suite execution.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, execFile } from 'node:child_process'

export const SUITE_DIR = '.testprism/suite'

export function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

export function prepareWorkspace(taskDir, suiteDir, workdir) {
  const ws = path.resolve(workdir)
  rmrf(ws)
  fs.mkdirSync(path.dirname(ws), { recursive: true })
  const src = path.join(taskDir, 'workspace')
  if (!fs.existsSync(src)) throw new Error(`task has no workspace/ directory: ${src}`)
  fs.cpSync(src, ws, { recursive: true })
  const dst = path.join(ws, SUITE_DIR)
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  const suiteRoot = path.resolve(suiteDir)
  const SKIP = new Set(['.meta', '__pycache__', 'node_modules', '.git'])
  fs.cpSync(suiteRoot, dst, {
    recursive: true,
    // match on the path RELATIVE to the suite root, so a checkout that itself lives
    // under node_modules (an installed package) is not filtered out wholesale
    filter: (p) => {
      const rel = path.relative(suiteRoot, p)
      if (!rel) return true
      return !rel.split(path.sep).some((seg) => SKIP.has(seg))
    },
  })
  return ws
}

/**
 * Run a patch script inside the workspace.
 * `cd /app` (the container workdir several published patch sets hardcode) is rewritten to
 * `cd "$APP_DIR"` so the same script works in a plain directory; every other byte is kept.
 */
export function applyPatch(scriptFile, ws, { adapt = true, python = null, env = {}, timeout = 120000 } = {}) {
  let text = fs.readFileSync(scriptFile, 'utf8')
  const rewrites = []
  if (adapt) {
    const before = text
    text = text.replace(/\ncd \/app\n/, '\ncd "$APP_DIR"\n')
    if (text !== before) rewrites.push('cd /app -> $APP_DIR')
    if (python) {
      const before2 = text
      text = text.replace(/^python3\b/gm, JSON.stringify(python).slice(1, -1))
      if (text !== before2) rewrites.push('python3 -> ' + python)
    }
  }
  const runner = path.join(path.dirname(ws), path.basename(ws) + '.patch.sh')
  fs.writeFileSync(runner, text)
  const started = Date.now()
  try {
    execFileSync('sh', [runner], {
      cwd: ws,
      env: { ...process.env, ...env, APP_DIR: ws },
      timeout,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { ok: true, exitCode: 0, seconds: (Date.now() - started) / 1000, rewrites }
  } catch (e) {
    return {
      ok: false,
      exitCode: typeof e.status === 'number' ? e.status : null,
      seconds: (Date.now() - started) / 1000,
      output: String((e.stdout || '') + (e.stderr || '')).slice(-2000) || String(e.message).slice(0, 400),
      rewrites,
    }
  }
}

export function defaultRunner(ws) {
  const suite = path.join(ws, SUITE_DIR)
  const entry = path.join(suite, 'run-tests.sh')
  if (fs.existsSync(entry)) return { cmd: 'sh', args: [path.join(SUITE_DIR, 'run-tests.sh')], kind: 'run-tests.sh' }
  const hasPy = fs.existsSync(suite) && fs.readdirSync(suite, { recursive: true }).some((f) => String(f).endsWith('.py'))
  if (hasPy) return { cmd: 'python3', args: ['-m', 'pytest', SUITE_DIR, '-q', '--no-header', '-p', 'no:cacheprovider'], kind: 'pytest' }
  throw new Error('cannot infer how to run this suite: pass --run "<command>" (exit 0 = suite passed)')
}

/** Run the suite inside the workspace; exit code 0 means the suite accepted this implementation. */
export function runSuite(ws, { run = null, timeout = 300000, env = {}, pythonPath = null } = {}) {
  const started = Date.now()
  const spec = run ? { cmd: 'sh', args: ['-c', run], kind: 'custom' } : defaultRunner(ws)
  return new Promise((resolve) => {
    execFile(spec.cmd, spec.args, {
      cwd: ws,
      timeout,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, APP_DIR: ws, ...env, PYTHONPATH: [ws, pythonPath, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) },
    }, (err, stdout, stderr) => {
      const out = String(stdout || '') + String(stderr || '')
      resolve({
        runner: spec.kind,
        exitCode: err ? (typeof err.code === 'number' ? err.code : null) : 0,
        timeout: Boolean(err && err.killed),
        passed: !err,
        seconds: (Date.now() - started) / 1000,
        output: out.slice(-4000),
      })
    })
  })
}

export function findImplName(ws, preferred) {
  if (preferred) return preferred
  const files = fs.readdirSync(ws).filter((f) => f.endsWith('.py') || f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.ts'))
  const notSuite = files.filter((f) => !f.startsWith('.'))
  if (!notSuite.length) throw new Error('cannot infer the implementation file name: pass --impl-name')
  return notSuite[0]
}
