import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { buildPoseControlV3 } from "../lib/pose-v3";
import type { Shot } from "../lib/types";

// Diagnostic companion to the short-prompt baseline. This creates an isolated
// request fixture; it never inserts a production job or approves a draft.
async function main() {
  const source = JSON.parse(fs.readFileSync("scripts/quality-fixtures/seated-phone-baseline.json", "utf8"));
  const shot = {
    id: 7001, pageId: 1, order: 1, title: "seated phone diagnostic",
    description: "sitting on a sofa, holding a phone with both hands at chest level, looking down at the phone",
    actionEn: "sitting on a sofa, holding a phone with both hands at chest level, looking down at the phone",
    camera: "medium shot", cameraEn: "medium shot", compositionEn: "",
    characterIds: ["actor"], characterLooks: {}, visualSpecConfirmed: true,
    visualSpec: { camera: { shotSize: "medium shot" }, characters: [{ characterId: "actor", action: "sitting on a sofa, holding a phone with both hands at chest level", gazeTarget: "phone", expression: "gentle smile" }] },
  } as unknown as Shot;
  const control = buildPoseControlV3(shot, [{
    relationId: "read-phone", characterId: "actor", required: true, object: "smartphone", purpose: "read",
    handMode: "two", activeHand: "both", objectCenter: { x: .5, y: .48 }, region: { xStart: 0, xEnd: 1 },
    contactAnchors: [{ hand: "left", x: .535, y: .48 }, { hand: "right", x: .465, y: .48 }],
    gazeMode: "object", gazeTarget: { kind: "object", point: { x: .5, y: .48 }, targetId: "phone", source: "diagnostic" },
  }]);
  if (!control?.safety.valid) throw new Error(JSON.stringify(control?.safety || "missing pose"));
  const out = path.resolve("workspace/quality-fixtures", process.argv[2] || "seated-phone-pose");
  if (fs.existsSync(out)) throw new Error("Diagnostic fixture already exists; use a new label");
  fs.mkdirSync(out, { recursive: true });
  const png = await sharp(Buffer.from(control.svg)).png().toBuffer();
  fs.writeFileSync(path.join(out, "pose.png"), png);
  fs.writeFileSync(path.join(out, "pose-plan.json"), JSON.stringify(control, null, 2));
  const fixture = { ...source, id: path.basename(out),
    purpose: "与无控制基线相同模型、seed、prompt 和采样参数，仅加入当前 V3 OpenPose；检验姿态控制，不代表完整工作台或身份/服装一致性已通过。",
    payload: { ...source.payload, alwayson_scripts: { ControlNet: { args: [{
      enabled: true, module: "none", model: "control_v11p_sd15_openpose [cab727d4]", image: png.toString("base64"),
      weight: 1, guidance_start: 0, guidance_end: .85, resize_mode: "Just Resize", pixel_perfect: false,
      processor_res: 512, low_vram: true, control_mode: "Balanced",
    }] } } },
  };
  fs.writeFileSync(path.join(out, "fixture.json"), JSON.stringify(fixture, null, 2));
  console.log(JSON.stringify({ out, composition: control.scenePlan.projection?.composition, projection: control.scenePlan.projection,
    wrists: [control.people[0][4], control.people[0][7]], nose: control.people[0][0] }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
