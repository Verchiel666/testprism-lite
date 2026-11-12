// Weak suite: one happy path only. It passes the reference but also passes broken candidates.
import assert from 'node:assert/strict'
import { parseRange } from '../../calc.mjs'

assert.deepEqual(parseRange('1-3'), [1, 2, 3])
console.log('weak suite: ok')
