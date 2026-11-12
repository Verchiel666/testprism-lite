// Tiny module used by the self-test: parse a range list such as "1-3,5,7-8".
// Spec:
//   - items are separated by commas; optional spaces after a comma are allowed
//   - "a-b" expands to every integer from a to b inclusive
//   - a > b is an error: throw new RangeError('descending range')
//   - a non-numeric item is an error: throw new TypeError('bad item')
export function parseRange(text) {
  throw new Error('not implemented')
}
