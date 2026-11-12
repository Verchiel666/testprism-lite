// End-to-end evaluation of one test suite against one panel.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { prepareWorkspace, applyPatch, runSuite, findImplName, rmrf, SUITE_DIR } from './run.mjs'
import { scoreCandidates } from './score.mjs'

export async function evaluate({
  taskDir, suiteDir, patchSet = null, panel = null, implName = null,
  run = null, adapt = true, python = null, pythonPath = null, keep = false,
  workdir = null, timeoutPatch = 120000, timeoutSuite = 300000, log = () => {},
}) {
  const candidates = patchSet ? patchSet.solutions : panel
  if (!candidates || !candidates.length) throw new Error('nothing to evaluate: pass --patch-set or --panel')
  const root = workdir || fs.mkdtempSync(path.join(os.tmpdir(), 'testprism-lite-'))
  fs.mkdirSync(root, { recursive: true })
  const started = Date.now()
  const report = {
    taskId: patchSet?.taskId || path.basename(path.resolve(taskDir)),
    patchSetId: patchSet?.patchSetId || null,
    schemaVersion: patchSet?.schemaVersion || null,
    startedAt: new Date().toISOString(),
    suite: path.resolve(suiteDir),
    candidates: {},
  }

  const wsBaseline = prepareWorkspace(taskDir, suiteDir, path.join(root, 'baseline'))
  const base = await runSuite(wsBaseline, { run, timeout: timeoutSuite, pythonPath })
  report.baseline = base
  report.baselineDetected = !base.passed
  log(`baseline: ${base.passed ? 'suite PASSED (it does not detect the missing work)' : 'suite FAILED as required'}`)

  let goldPassed = null
  for (const cand of candidates) {
    const ws = prepareWorkspace(taskDir, suiteDir, path.join(root, 'cand-' + cand.id))
    let applied = { ok: true, exitCode: 0, rewrites: [] }
    if (cand.file) applied = applyPatch(cand.file, ws, { adapt, python, timeout: timeoutPatch })
    let suite = null
    if (applied.ok) suite = await runSuite(ws, { run, timeout: timeoutSuite, pythonPath })
    const suitePassed = suite ? suite.passed : null
    const matched = cand.label === 'oracle_valid' ? suitePassed === true : suitePassed === false
    report.candidates[cand.id] = {
      label: cand.label,
      isGold: Boolean(cand.isGold),
      patchError: !applied.ok,
      patch: { exitCode: applied.exitCode, rewrites: applied.rewrites || [], output: applied.output },
      suitePassed,
      matchedExpectation: applied.ok && matched,
      seconds: suite?.seconds ?? null,
      output: suite?.output ?? null,
    }
    if (cand.isGold) goldPassed = suitePassed
    log(`  ${cand.id.padEnd(16)} ${cand.label.padEnd(14)} ${applied.ok ? (suitePassed ? 'suite PASS' : 'suite FAIL') : 'PATCH ERROR'} ${applied.ok && matched ? 'ok' : 'MISS'}`)
    if (!keep) rmrf(ws)
  }

  const metrics = scoreCandidates({
    baselineDetected: report.baselineDetected,
    goldPassed,
    results: Object.entries(report.candidates).map(([id, c]) => ({ id, label: c.label, suitePassed: c.suitePassed, patchError: c.patchError })),
  })
  Object.assign(report, metrics, { secondsTotal: Math.round((Date.now() - started) / 100) / 10 })
  if (keep) report.workdir = root
  else rmrf(root)
  return report
}

export function summarizeReport(report) {
  return {
    task: report.taskId,
    baselineDetected: report.baselineDetected,
    RAR: report.RAR,
    VAR: report.VAR,
    IRR: report.IRR,
    JSF: report.resolved,
    patchErrors: report.patchErrors,
    seconds: report.secondsTotal,
  }
}
