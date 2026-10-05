import test from 'node:test';
import assert from 'node:assert/strict';
import {assertEnglishVisualJson,requestEnglishVisualJson,compileVisualJsonToEnglish} from '../lib/visual-json-language';

test('English visual validation covers evidence and nested arrays while preserving opaque IDs',()=>{
  assert.doesNotThrow(()=>assertEnglishVisualJson({characterId:'小粉',scene:{location:'home'},provenance:{evidence:'two books'}}));
  assert.throws(()=>assertEnglishVisualJson({interactions:[{visualFacts:{provenance:{object:{evidence:'两本书'}}}}]}),/\$\.interactions\[0\]\.visualFacts\.provenance\.object\.evidence/);
  assert.throws(()=>assertEnglishVisualJson({warnings:['手在画外']}),/warnings\[0\]/);
  const home=compileVisualJsonToEnglish({scene:{location:'某个人的家'}});assert.equal((home.data as any).scene.location,'home interior');assert.equal(home.audit[0].original,'某个人的家');
  const tool=compileVisualJsonToEnglish({evidence:'用剪刀小心地拆开'});assert.match((tool.data as any).evidence,/carefully opening.*with scissors/);
});

test('DeepSeek is called once; Chinese prose is compiled locally without changing numeric facts',async()=>{
  const calls:Array<{system:string,user:string}>=[];
  const result=await requestEnglishVisualJson(async(system,user)=>{calls.push({system,user});return {data:{scene:{location:'书桌'},count:2}};},'plan a scene','story input',data=>{if(data.count!==2)throw new Error('count must preserve two objects');});
  assert.equal(result.data.count,2);assert.equal(calls.length,1);assert.equal(result.data.scene.location,'desk');
  assert.match(calls[0].system,/provenance evidence/);assert.equal(result.languageCompilation.mode,'local_visual_compiler');assert.equal(result.languageCompilation.audit[0].original,'书桌');
});

test('unrecognized Chinese or invalid structure fails without an extra API call or fake success',async()=>{
  let count=0;
  await assert.rejects(requestEnglishVisualJson(async()=>{count++;return{data:{action:'无法明确识别的复杂场景'}};},'system','input'),/本地英文编译/);
  assert.equal(count,1);
  const source={actorCharacterId:'小粉',count:2,phase:'contact',evidence:'两本书'};
  const compiled=compileVisualJsonToEnglish(source);assert.equal((compiled.data as any).actorCharacterId,'小粉');assert.equal((compiled.data as any).count,2);assert.match((compiled.data as any).evidence,/two.*book/);
});
