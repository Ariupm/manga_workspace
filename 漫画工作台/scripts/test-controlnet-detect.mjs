import fs from "node:fs";
import path from "node:path";

const moduleName = process.argv[2] || "segmentation";
const source = path.resolve(process.argv[3] || "workspace/generated/stages/sd-stage-job-448-outfit_refinement-character_xiaofen-8f40a110-48e8-4d7c-95e8-48a0203beb7e.png");
const response = await fetch("http://127.0.0.1:7860/controlnet/detect", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ controlnet_module: moduleName, controlnet_input_images: [fs.readFileSync(source).toString("base64")], controlnet_processor_res: 512 }),
});
const text = await response.text();
if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 500)}`);
const data = JSON.parse(text);
if (!data.images?.[0]) throw new Error("detector returned no image");
const output = path.resolve(`workspace/generated/${moduleName.replace(/[^a-z0-9_-]/gi, "_")}-detect-test.png`);
fs.writeFileSync(output, Buffer.from(data.images[0].replace(/^data:image\/\w+;base64,/, ""), "base64"));
console.log(JSON.stringify({ output, info: data.info || null }));
