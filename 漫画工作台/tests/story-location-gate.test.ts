import assert from "node:assert/strict";
import test from "node:test";

test("未知地点即使force也在请求SD之前阻断", async () => {
  process.env.STUDIO_DB_PATH = ":memory:";
  const previousProvider = process.env.IMAGE_PROVIDER;
  process.env.IMAGE_PROVIDER = "sd-webui";
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => { calls++; assert.match(String(input), /chat\/completions/); throw new Error("translator unavailable"); };
  try {
    const { getStudioData, updateShot } = await import("../lib/db");
    const { POST } = await import("../app/api/studio/route");
    const shot = getStudioData(1).episode.pages[0].shots[0];
    updateShot(shot.id, { scene: "未识别的特殊场所", sceneEn: "coherent everyday environment", environment: {}, locked: false, characterLooks: {}, actionEn: "standing calmly", expressionEn: "calm", compositionEn: "single person", camera: "中景", cameraEn: "medium shot", description: "一个人物静静站着" });
    for (const action of ["generate", "generateDraft"]) {
      const response = await POST(new Request("http://localhost/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, projectId: 1, shotId: shot.id, force: true, width: 512, height: 512 }) }));
      const result = await response.json();
      assert.equal(response.status, 422, JSON.stringify(result));
      assert.equal(result.code, "STORY_LOCATION_COMPILATION_FAILED", JSON.stringify(result));
    }
    // The translator may call the configured language model; no SD request is made.
  } finally {
    globalThis.fetch = originalFetch;
    if (previousProvider === undefined) delete process.env.IMAGE_PROVIDER;
    else process.env.IMAGE_PROVIDER = previousProvider;
  }
});
