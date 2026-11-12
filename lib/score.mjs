// Metrics, identical in meaning to the reference implementation in the TestPrism artifact:
//   baseline_detected : the suite fails on the untouched program state
//   VAR               : share of oracle-valid candidates the suite accepts
//   IRR               : share of oracle-invalid candidates the suite rejects
//   RAR               : single-reference success (baseline fails AND the reference/gold passes)
//   resolved (JSF)    : baseline_detected && VAR == 1 && IRR == 1 && no patch errors
export function scoreCandidates({ baselineDetected, goldPassed, results }) {
  const valid = results.filter((r) => r.label === 'oracle_valid')
  const invalid = results.filter((r) => r.label === 'oracle_invalid')
  const matched = (r) => r.label === 'oracle_valid' ? r.suitePassed === true : r.suitePassed === false
  const patchErrors = results.filter((r) => r.patchError).length
  const VAR = valid.length ? valid.filter(matched).length / valid.length : null
  const IRR = invalid.length ? invalid.filter(matched).length / invalid.length : null
  const RAR = baselineDetected && goldPassed === true ? 1 : 0
  return {
    baselineDetected,
    RAR,
    VAR,
    IRR,
    patchErrors,
    resolved: Boolean(baselineDetected && VAR === 1 && IRR === 1 && patchErrors === 0),
    nValid: valid.length,
    nInvalid: invalid.length,
  }
}

/** JSF on a panel of `nValid` valid + `nInvalid` invalid candidates, in panel order (the RQ2 curve). */
export function jsfAtSize({ baselineDetected, valid, invalid }, nValid, nInvalid) {
  if (!baselineDetected) return 0
  for (let i = 0; i < nValid; i++) if (valid[i] !== true) return 0
  for (let i = 0; i < nInvalid; i++) if (invalid[i] !== true) return 0
  return 1
}

export function panelCurve(report) {
  const valid = Object.values(report.candidates).filter((c) => c.label === 'oracle_valid').map((c) => c.matchedExpectation === true)
  const invalid = Object.values(report.candidates).filter((c) => c.label === 'oracle_invalid').map((c) => c.matchedExpectation === true)
  const rows = []
  for (let k = 0; k <= Math.max(valid.length, invalid.length); k++) {
    rows.push({
      panelSize: 1 + valid.length + invalid.length,
      extraValid: Math.min(k, valid.length),
      extraInvalid: Math.min(k, invalid.length),
      size: 1 + Math.min(k, valid.length) + Math.min(k, invalid.length),
      validOnly: jsfAtSize({ baselineDetected: report.baselineDetected, valid, invalid }, Math.min(k, valid.length), 0),
      invalidOnly: jsfAtSize({ baselineDetected: report.baselineDetected, valid, invalid }, 0, Math.min(k, invalid.length)),
      alternating: jsfAtSize({ baselineDetected: report.baselineDetected, valid, invalid }, Math.min(k, valid.length), Math.min(k, invalid.length)),
    })
  }
  return rows
}

export const pct = (x) => (x == null ? '  -' : String(Math.round(x * 100)).padStart(3) + '%')
