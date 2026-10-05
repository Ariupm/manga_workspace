import test from "node:test";
import assert from "node:assert/strict";
import { canReclaimAssetLock } from "./character-asset-lock.mjs";

test("long-running asset owners retain the lock regardless of age", () => {
  assert.equal(canReclaimAssetLock({pid:process.pid}, 5 * 60 * 60 * 1000), false);
  for (const code of ["EPERM", "EACCES", "EIO"]) {
    assert.equal(canReclaimAssetLock({pid:123}, Infinity, () => { throw {code}; }), false);
  }
});
test("only confirmed dead owners or expired malformed locks are reclaimed", () => {
  assert.equal(canReclaimAssetLock({pid:123}, 0, () => { throw {code:"ESRCH"}; }), true);
  for (const value of [null, {}, {pid:-1}, {pid:"123"}]) {
    assert.equal(canReclaimAssetLock(value, 100), false);
    assert.equal(canReclaimAssetLock(value, 31 * 60 * 1000), true);
  }
});
