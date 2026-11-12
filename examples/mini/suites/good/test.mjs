// Strong suite: exact values for every rule in the spec, including both error cases.
import assert from 'node:assert/strict'
import { parseRange } from '../../calc.mjs'

const eq = (input, expected) => assert.deepEqual(parseRange(input), expected, `input ${JSON.stringify(input)}`)

eq('1', [1])
eq('1-3', [1, 2, 3])
eq('1-3,5', [1, 2, 3, 5])
eq('1-3, 5', [1, 2, 3, 5])
eq('7-8,1', [7, 8, 1])
eq('-2-1', [-2, -1, 0, 1])
assert.throws(() => parseRange('5-3'), (e) => e instanceof RangeError && e.message === 'descending range')
assert.throws(() => parseRange('1,x'), (e) => e instanceof TypeError && e.message === 'bad item')
assert.throws(() => parseRange('1,,3'), (e) => e instanceof TypeError && e.message === 'bad item')
console.log('good suite: ok')
