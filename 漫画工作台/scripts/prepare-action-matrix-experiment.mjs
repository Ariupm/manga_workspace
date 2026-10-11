// Prepare explicit repeatable experiments. No SD requests or production writes.
// node scripts/prepare-action-matrix-experiment.mjs fixtures.json new-out
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const [file, out] = process.argv.slice(2);
if (!file || !out) throw Error('Fixtures and new output directory required');
const suite = JSON.parse(fs.readFileSync(file, 'utf8'));
assert.equal(suite.version, 'sd15-action-matrix-1');
assert.ok(suite.seeds.length >= 2 && suite.seeds.every(s => Number.isInteger(s) && s >= 0));
assert.equal(new Set(suite.seeds).size, suite.seeds.length);
assert.equal(new Set(suite.cases.map(c => c.id)).size, suite.cases.length);
const requests = [];
// Finish one seed across all actions before the second, to inspect breadth early.
for (const seed of suite.seeds) for (const c of suite.cases) {
  assert.ok(/^[a-z0-9-]+$/.test(c.id));
  assert.ok(c.prompt && c.criteria.length && c.failureExample);
  requests.push({name: `${c.id}-${seed}`, description: JSON.stringify({criteria: c.criteria, failureExample: c.failureExample}),
    request: {...suite.settings, prompt: c.prompt, negative_prompt: suite.negative, seed,
      batch_size: 1, n_iter: 1, send_images: true, do_not_save_grid: true,
      alwayson_scripts: {ControlNet: {args: []}}}});
}
assert.ok(!fs.existsSync(out), 'Preserve earlier experiments; use a new output directory');
fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(path.join(out, 'cases.json'), JSON.stringify(requests, null, 2));
fs.writeFileSync(path.join(out, 'protocol.json'), JSON.stringify(suite, null, 2));
console.log(JSON.stringify({actions: suite.cases.length, seeds: suite.seeds, requests: requests.length, output: out}));
