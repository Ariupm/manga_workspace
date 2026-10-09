import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {draftHasHardFailure,generationHasHardFailure} from './draft-approval-policy.mjs';
const unavailable='手部深度修复未应用，已保留道具阶段图片：所有可用手部检测器均未返回可用轮廓';
test('optional hand detector unavailability allows draft and final without erasing audit',()=>{
 const recipe={pixelQa:{status:'passed'},semanticQa:{status:'manual_required'},postprocessWarnings:[unavailable],passTraces:[{stage:'hand_refinement',semanticStatus:'not_applied'}]};
 const before=JSON.stringify(recipe);
 assert.equal(draftHasHardFailure(recipe),false);assert.equal(generationHasHardFailure(recipe),false);assert.equal(JSON.stringify(recipe),before);
});
test('real decode and postprocessing failures still report failures, including mixed warnings',()=>{
 for(const recipe of [{pixelQa:{status:'blocked'}},{semanticQa:{status:'blocked'}},{postprocessWarnings:[unavailable,'视线校正失败：HTTP 500']},{postprocessWarnings:['手部深度修复未应用，已保留道具阶段图片：图像解码失败']}])assert.equal(generationHasHardFailure(recipe),true);
});
test('final worker and recovery use shared policy instead of rejecting every warning',()=>{
 const worker=fs.readFileSync(new URL('./sd-worker.mjs',import.meta.url),'utf8');
 assert.match(worker,/if \(generationHasHardFailure\(payload.recipe\)\)/);
 assert.doesNotMatch(worker,/if \(postprocessWarnings.length \|\|/);
 assert.match(fs.readFileSync(new URL('./recover-sd-final.mjs',import.meta.url),'utf8'),/generationHasHardFailure\(recipe\)/);
});
