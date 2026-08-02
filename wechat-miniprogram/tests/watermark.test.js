const assert = require('assert');
const { fitLongEdge, formatStamp } = require('../utils/watermark');

assert.deepStrictEqual(fitLongEdge(4000, 3000, 1280), { width: 1280, height: 960 });
assert.deepStrictEqual(fitLongEdge(3000, 4000, 1280), { width: 960, height: 1280 });
assert.deepStrictEqual(fitLongEdge(800, 600, 1280), { width: 800, height: 600 });
assert.deepStrictEqual(fitLongEdge(1280, 1280, 1280), { width: 1280, height: 1280 });

assert.strictEqual(formatStamp(new Date(2026, 7, 2, 9, 5)), '2026-08-02 09:05');

console.log('watermark tests passed');
