import test from 'node:test';
import assert from 'node:assert/strict';
import {generationEditorialInput} from '../scripts/generation-editorial-policy.mjs';
test('structured previews cannot reintroduce stale gaze, visibility or negative text',()=>{
 for(const promptMode of ['structured','forced_structured','auto_repaired']){
  const input={promptMode,promptOverride:'face and upper body clearly visible',negativePromptOverride:'old negatives',regionalPromptOverride:{commonPrompt:'old',characterPrompts:['old a','old b']},poseControlEnabled:false,referenceImagesEnabled:false,poseControlOverride:{phase:'anticipation'},seed:123,width:512};
  const result=generationEditorialInput(input);
  assert.equal(result.promptOverride,undefined);assert.equal(result.regionalPromptOverride,undefined);assert.equal(result.negativePromptOverride,undefined);
  assert.equal(result.seed,123);assert.equal(result.width,512);assert.equal(result.poseControlEnabled,false);assert.equal(result.referenceImagesEnabled,false);assert.deepEqual(result.poseControlOverride,input.poseControlOverride);assert.ok(input.promptOverride);
 }
});
test('manual and legacy overrides remain intact',()=>{
 for(const promptMode of ['manual_override',undefined]){
  const input={promptMode,promptOverride:'custom',negativePromptOverride:'custom negative',regionalPromptOverride:{commonPrompt:'custom common'}};
  assert.deepEqual(generationEditorialInput(input),input);
 }
});
