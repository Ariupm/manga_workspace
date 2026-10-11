import assert from 'node:assert/strict';
import test from 'node:test';
import {actionIntent} from '../lib/pose-action-semantics';
import {extraTemplateFromText} from '../lib/pose-v3/action-catalog';
import {inferStoryActionContract} from '../lib/story-action-contract';

test('directional reaching shares recognition and preserves confirmed target and phase across regions',()=>{
 for(const direction of ['up','upward','upwards','down','downward','downwards','out','across','forward','backward','for','toward','towards','to']){
  const text=`reaching ${direction} with her right arm to grasp the cup`;
  assert.equal(actionIntent(text),'reach',text);
  assert.equal(extraTemplateFromText(text),'reach',text);
  for(const region of [{xStart:0,xEnd:1},{xStart:0,xEnd:.45},{xStart:.55,xEnd:1}])for(const y of [.2,.7]){
   const input={object:'cup',purpose:'pick',objectCenter:{x:(region.xStart+region.xEnd)/2,y},region};
   const plan=inferStoryActionContract(input,text,'',true)!;
   assert.equal(plan.actionId,'pick');assert.equal(plan.phase,'anticipation');
   assert.deepEqual(plan.geometry.baseCenter,input.objectCenter);
   assert.equal(plan.evidence,text);
   assert.equal(inferStoryActionContract(input,text,'contact',true)!.phase,'contact');
   assert.equal(inferStoryActionContract(input,text,'follow_through',true)!.phase,'follow_through');
   assert.equal(inferStoryActionContract(input,text,'contact',true,'place')!.actionId,'place');
  }
  for(const prefix of ['not','never','without']){
   assert.equal(actionIntent(`${prefix} ${text}`),null);
   assert.notEqual(extraTemplateFromText(`${prefix} ${text}`),'reach');
  }
 }
 for(const text of ['a cup out of reach','reaching a conclusion','outreach program','holding an open book']){
  assert.equal(actionIntent(text),null);assert.notEqual(extraTemplateFromText(text),'reach');
 }
});

test('ordinary actions retain their distinct catalog choices instead of becoming reaching',()=>{
 for(const [text,id] of [
  ['writing with a pen on paper','write'],['drinking from a cup','drink'],
  ['cutting paper with scissors','tool'],['cutting tape on a box with scissors','tool'],
  ['typing on a keyboard','tool'],['opening a door','open'],['closing a box','close'],
  ['pointing at a page','point'],['looking up at the shelf','look_up'],
  ['lowering her head toward the book','nod'],['turning the head','head_turn'],
 ])assert.equal(extraTemplateFromText(text),id,text);
 assert.equal(extraTemplateFromText('pouring water from a pitcher into a glass'),undefined,
  'Pouring has no independent catalog mechanism; do not report it as supported');
});
