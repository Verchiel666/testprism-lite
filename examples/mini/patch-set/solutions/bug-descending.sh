#!/bin/sh
set -eu
cd "$APP_DIR"
cat > calc.mjs <<'JS'
export function parseRange(text) {
  const out = []
  for (const raw of String(text).split(',')) {
    const item = raw.trim()
    if (!item) throw new TypeError('bad item')
    const m = item.match(/^(-?\d+)-(-?\d+)$/)
    if (m) {
      const a = Number(m[1])
      const b = Number(m[2])
      const step = a <= b ? 1 : -1
      for (let i = a; step > 0 ? i <= b : i >= b; i += step) out.push(i)
      continue
    }
    if (!/^-?\d+$/.test(item)) throw new TypeError('bad item')
    out.push(Number(item))
  }
  return out
}
JS
