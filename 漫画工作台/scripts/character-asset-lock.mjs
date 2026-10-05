export function canReclaimAssetLock(lock, ageMs, probe = pid => process.kill(pid, 0)) {
  if (Number.isInteger(lock?.pid) && lock.pid > 0) {
    try { probe(lock.pid); return false; }
    catch (error) { return error?.code === "ESRCH"; }
  }
  // A just-created file can briefly precede its JSON contents.
  return ageMs > 30 * 60 * 1000;
}
