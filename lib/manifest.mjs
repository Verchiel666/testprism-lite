// Patch-set manifests (TestPrism schema v3 / v4) and generic panels.
import fs from 'node:fs'
import path from 'node:path'

export const VALID = 'oracle_valid'
export const INVALID = 'oracle_invalid'

/**
 * Load a TestPrism patch-set directory (contains manifest.json + solution scripts).
 * Returns { taskId, patchSetId, schemaVersion, solutions: [{ id, label, path, isGold }] }
 */
export function loadPatchSet(patchDir) {
  const abs = path.resolve(patchDir)
  const manifestPath = path.join(abs, 'manifest.json')
  if (!fs.existsSync(manifestPath)) throw new Error(`no manifest.json in ${abs}`)
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const solutions = (raw.solutions || []).map((s) => {
    const label = s.label === VALID || s.label === INVALID ? s.label : String(s.label || '')
    if (label !== VALID && label !== INVALID) throw new Error(`unknown label ${JSON.stringify(s.label)} for solution ${s.id}`)
    const file = path.join(abs, s.path)
    if (!fs.existsSync(file)) throw new Error(`missing solution file ${s.path}`)
    return { id: s.id, label, path: s.path, file, isGold: Boolean(s.is_gold) }
  })
  if (!solutions.length) throw new Error('patch set has no solutions')
  return {
    root: abs,
    taskId: raw.task_id || null,
    patchSetId: raw.patch_set_id || null,
    schemaVersion: raw.schema_version || 3,
    solutions,
  }
}

/**
 * Load a generic panel: [{ id, label: "valid"|"invalid"|"oracle_valid"|"oracle_invalid", impl }]
 * where `impl` is a file copied over `--impl-name` (or the single .py/.js file) in the workspace.
 */
export function loadPanel(panelFile) {
  const abs = path.resolve(panelFile)
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'))
  const list = Array.isArray(raw) ? raw : raw.panel
  if (!Array.isArray(list)) throw new Error('panel must be an array or { panel: [...] }')
  const base = path.dirname(abs)
  return list.map((entry, i) => {
    const label = String(entry.label || '').toLowerCase()
    const kind = label === 'valid' || label === VALID ? VALID : label === 'invalid' || label === INVALID ? INVALID : null
    if (!kind) throw new Error(`panel entry ${i}: label must be valid/invalid`)
    const impl = path.resolve(base, entry.impl)
    if (!fs.existsSync(impl)) throw new Error(`panel entry ${i}: missing ${entry.impl}`)
    return { id: entry.id || `cand-${i + 1}`, label: kind, file: impl, isGold: Boolean(entry.gold), path: entry.impl }
  })
}

export function summarize(solutions) {
  return {
    valid: solutions.filter((s) => s.label === VALID).length,
    invalid: solutions.filter((s) => s.label === INVALID).length,
  }
}
