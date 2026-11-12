#!/bin/sh
set -eu
cd "$APP_DIR"
cat > calc.mjs <<'JS'
const expand = (a, b) => {
  if (a > b) throw new RangeError('descending range')
  const arr = []
  while (a <= b) arr[arr.length] = a++
  return arr
}
export function parseRange(text) {
  return String(text).split(',').flatMap((raw) => {
    const item = raw.replace(/^\s+|\s+$/g, '')
    if (item.length === 0) throw new TypeError('bad item')
    const dash = item.indexOf('-', item.startsWith('-') ? 1 : 0)
    if (dash > 0) return expand(Number(item.slice(0, dash)), Number(item.slice(dash + 1)))
    if (!/^-?\d+$/.test(item)) throw new TypeError('bad item')
    return [Number(item)]
  })
}
JS
