// Command line surface.
import fs from 'node:fs'
import path from 'node:path'
import { loadPatchSet, loadPanel, summarize } from './manifest.mjs'
import { evaluate, summarizeReport } from './evaluate.mjs'
import { panelCurve, pct } from './score.mjs'
import { prepareWorkspace, findImplName, rmrf } from './run.mjs'
import { runSuite } from './run.mjs'

const HELP = `testprism-lite — score a test suite against a panel of implementations (no Docker)

usage:
  testprism-lite run    --task <dir> (--patch-set <dir> | --panel <file>) --suite <dir> [options]
  testprism-lite ref    --task <dir> --patch-set <dir> --suite <dir>      only baseline + reference (fast)
  testprism-lite probe  --task <dir> --suite <dir> --impl <file> [--impl-name <name>]
  testprism-lite scan   --task <dir> (--patch-set <dir> | --panel <file>) --suite <dir>   JSF vs panel size

options:
  --run "<cmd>"     command that runs the suite inside the prepared workspace (exit 0 = accepted)
                    default: sh .testprism/suite/run-tests.sh if present, else python3 -m pytest
  --impl-name <f>   workspace file a probe/panel implementation replaces (default: first source file)
  --no-adapt        do not rewrite "cd /app" in published patch scripts
  --python <path>   also route bare "python3" calls in patch scripts to this interpreter
  --pythonpath <d>  extra PYTHONPATH entry (e.g. a directory with pytest installed)
  --keep            keep the prepared workspaces (path printed in the report)
  --workdir <dir>   where to prepare workspaces (default: a temp dir)
  --json <file>     write the full JSON report
  --quiet           only print the summary line
  -h, --help

what the numbers mean:
  RAR  single-reference success: suite fails on the original code and passes on the reference.
  VAR  share of correct alternative implementations the suite accepts.
  IRR  share of incorrect implementations the suite rejects.
  JSF  resolved = baseline detected && VAR == 1 && IRR == 1 && no patch errors.
       JSF <= RAR always: single-reference evaluation can only overstate a suite's quality.
`

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('-')) { out._.push(a); continue }
    if (a === '-h' || a === '--help') { out.help = true; continue }
    if (a === '--keep') { out.keep = true; continue }
    if (a === '--quiet') { out.quiet = true; continue }
    if (a === '--no-adapt') { out.adapt = false; continue }
    const key = a.replace(/^--/, '')
    const val = argv[i + 1]
    if (val === undefined || val.startsWith('--')) throw new Error(`missing value for ${a}`)
    out[key] = val
    i++
  }
  return out
}

function require(args, name) {
  if (!args[name]) throw new Error(`missing --${name}`)
  return args[name]
}

function loadPanelOrSet(args) {
  if (args['patch-set']) return { patchSet: loadPatchSet(args['patch-set']) }
  if (args.panel) return { panel: loadPanel(args.panel) }
  throw new Error('pass --patch-set <dir> (TestPrism manifest) or --panel <file> (generic JSON panel)')
}

function printReport(report, quiet) {
  if (!quiet) {
    console.log('')
    console.log(`task          ${report.taskId}`)
    if (report.patchSetId) console.log(`patch set     ${report.patchSetId} (schema ${report.schemaVersion})`)
    console.log(`suite         ${report.suite}`)
    console.log(`baseline      ${report.baselineDetected ? 'fails as required' : 'PASSES -> the suite cannot detect incomplete work'}`)
    console.log('')
  }
  const s = summarizeReport(report)
  const pad = (x) => String(x).padStart(4)
  console.log(`RAR ${pct(s.RAR)}   VAR ${pct(s.VAR)}   IRR ${pct(s.IRR)}   JSF ${s.JSF ? 'PASS' : 'fail'}   (patch errors ${s.patchErrors}, ${s.seconds}s)`)
  if (report.workdir) console.log(`workspaces kept in ${report.workdir}`)
}

export async function main(argv) {
  const args = parseArgs(argv)
  if (args.help || !args._.length) { console.log(HELP); return 0 }
  const cmd = args._[0]
  const common = {
    run: args.run || null,
    adapt: args.adapt !== false,
    python: args.python || null,
    pythonPath: args.pythonpath ? path.resolve(args.pythonpath) : null,
    keep: Boolean(args.keep),
    workdir: args.workdir || null,
    timeoutSuite: args['timeout-suite'] ? Number(args['timeout-suite']) * 1000 : 300000,
  }
  const writeJson = (report) => {
    if (!args.json) return
    fs.mkdirSync(path.dirname(path.resolve(args.json)), { recursive: true })
    fs.writeFileSync(path.resolve(args.json), JSON.stringify(report, null, 1))
    if (!args.quiet) console.log(`report written to ${path.resolve(args.json)}`)
  }

  if (cmd === 'probe') {
    const taskDir = require(args, 'task')
    const suiteDir = require(args, 'suite')
    const impl = require(args, 'impl')
    const workdir = args.workdir || null
    const ws = prepareWorkspace(taskDir, suiteDir, workdir || path.join(fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'tpl-probe-')), 'ws'))
    const name = findImplName(ws, args['impl-name'])
    fs.copyFileSync(path.resolve(impl), path.join(ws, name))
    const res = await runSuite(ws, { run: common.run, timeout: common.timeoutSuite, pythonPath: common.pythonPath })
    const report = { probe: path.resolve(impl), implName: name, ...res }
    if (!args.quiet) console.log(`probe ${path.basename(impl)} -> ${res.passed ? 'ACCEPTED' : 'REJECTED'} (${name})`)
    writeJson(report)
    if (!common.keep) rmrf(path.dirname(ws))
    return 0
  }

  const taskDir = require(args, 'task')
  const suiteDir = require(args, 'suite')
  const loaded = loadPanelOrSet(args)
  if (cmd === 'ref' && loaded.patchSet) {
    const gold = loaded.patchSet.solutions.filter((s) => s.isGold)
    if (!gold.length) throw new Error('patch set has no is_gold solution')
    loaded.patchSet = { ...loaded.patchSet, solutions: gold.map((s) => ({ ...s, label: 'oracle_valid' })) }
  }
  if (!['run', 'ref', 'scan'].includes(cmd)) throw new Error(`unknown command ${cmd}`)
  const report = await evaluate({
    taskDir, suiteDir, ...loaded, ...common,
    implName: args['impl-name'] || null,
    log: args.quiet ? () => {} : (line) => console.log(line),
  })
  if (args['patch-set'] || args.panel) {
    const counts = summarize(report.candidates ? Object.values(report.candidates).map((c) => ({ label: c.label })) : [])
    if (!args.quiet) console.log(`\npanel: ${counts.valid} valid / ${counts.invalid} invalid`)
  }
  printReport(report, args.quiet)
  if (cmd === 'scan') {
    const curve = panelCurve(report)
    console.log('\npanel members | valid-only | invalid-only | alternating')
    for (const row of curve) {
      console.log(`${String(1 + row.extraValid + row.extraInvalid).padStart(3)}          | ${row.validOnly ? ' PASS ' : ' fail '}     | ${row.invalidOnly ? ' PASS ' : ' fail '}     | ${row.alternating ? ' PASS ' : ' fail '}`)
    }
    report.curve = curve
  }
  writeJson(report)
  return report.resolved ? 0 : 1
}
