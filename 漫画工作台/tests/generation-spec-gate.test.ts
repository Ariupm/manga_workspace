import assert from "node:assert/strict";
import test from "node:test";

test("已确认规格的P0冲突在force生成时仍返回422且不调用SD", async () => {
  // Never allow this integration test to open the production database.
  process.env.STUDIO_DB_PATH = ":memory:";
  const previousProvider = process.env.IMAGE_PROVIDER;
  process.env.IMAGE_PROVIDER = "sd-webui";
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls++; throw new Error("SD must not be contacted"); };
  try {
    const { getStudioData, updateShotVisualSpec, updateShot } = await import("../lib/db");
    const { normalizeShotSpec } = await import("../lib/visual-planning");
    const { POST } = await import("../app/api/studio/route");
    const data = getStudioData(1);
    const base = data.episode.pages[0].shots[0];
    const id = base.characterIds[0];
    updateShot(base.id, { locked: false, characterLooks: {} });
    const spec = normalizeShotSpec({ characters: [{ characterId: id, position: "left side of the frame", region: { xStart: 0, xEnd: 1 }, action: "standing calmly", actionTarget: "window", gazeTarget: "window", hands: "hands naturally at sides" }] }, { ...base, characterLooks: {} });
    updateShotVisualSpec(base.id, spec, "diagnostic");
    for (const action of ["generate", "generateDraft"]) {
      const response = await POST(new Request("http://localhost/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, projectId: 1, shotId: base.id, force: true }) }));
      const body = await response.json();
      assert.equal(response.status, 422, JSON.stringify(body));
      assert.equal(body.code, "VISUAL_SPEC_REQUIRES_RECONFIRMATION");
      assert.deepEqual(body.validation.errors, []);
      assert.ok(body.validation.failures.some((failure: { code: string }) => failure.code === "position_region_conflict"));
      assert.match(body.error, /position=.*left.*region=0-1/);
    }
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousProvider === undefined) delete process.env.IMAGE_PROVIDER;
    else process.env.IMAGE_PROVIDER = previousProvider;
  }
});
