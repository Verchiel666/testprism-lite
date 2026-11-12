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
      if (a > b) throw new RangeError('descending range')
      for (let i = a; i <= b; i++) out.push(i)
      continue
    }
    if (!/^-?\d+$/.test(item)) throw new TypeError('bad item')
    out.push(Number(item))
  }
  return out
}
JS
