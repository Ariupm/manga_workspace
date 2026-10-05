import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { renderControlOpenPoseV3 } from "../lib/pose-v3/render";

async function main() {
  const sourceDirectory = path.resolve(process.argv[2]);
  const out = path.resolve("workspace/quality-fixtures", process.argv[3]);
  if (fs.existsSync(out)) throw new Error("Use a new diagnostic label");
  const plan = JSON.parse(fs.readFileSync(path.join(sourceDirectory, "pose-plan.json"), "utf8"));
  const fixture = JSON.parse(fs.readFileSync(path.join(sourceDirectory, "fixture.json"), "utf8"));
  const visibility = plan.visibility.map((person: string[]) => person.map((visible, joint) => joint >= 14 ? "out_of_frame" : visible));
  const svg = renderControlOpenPoseV3(plan.people, visibility, plan.width, plan.height);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  fixture.id = path.basename(out);
  fixture.purpose = "隔离头部控制对照：保持同一姿态和采样，只移除眼耳四点及相连线，保留鼻、颈和身体；不改变生产控制图。";
  fixture.sourceDirectory = sourceDirectory;
  fixture.payload.alwayson_scripts.ControlNet.args[0].image = png.toString("base64");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "pose.png"), png);
  fs.writeFileSync(path.join(out, "fixture.json"), JSON.stringify(fixture, null, 2));
  console.log(out);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
