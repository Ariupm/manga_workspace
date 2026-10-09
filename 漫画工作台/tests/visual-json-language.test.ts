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

test('Chinese output uses Python once after one DeepSeek call; English fields and facts stay identical',async()=>{
  let calls=0,pythonCalls=0;
  const source={actorCharacterId:'小粉',count:2,phase:'contact',enabled:true,nullable:null,evidence:'小粉从包裹里拿出两本书，轻轻抚摸封面，眼中充满期待。',action:'holding two books',warnings:['手在画外'],nested:{region:[0,.5]}};
  const result=await requestEnglishVisualJson(async()=>{calls++;return {data:source};},'plan','story',data=>assert.equal(data.count,2),{},async texts=>{
    pythonCalls++;assert.deepEqual(texts,[source.evidence,'手在画外']);return ['Xiao Fen takes two books out of the package, gently touches the covers, and looks expectant.','The hand is outside the frame.'];
  });
  assert.equal(calls,1);assert.equal(pythonCalls,1);assert.equal(result.languageCompilation.mode,'python_argos_translation');
  assert.deepEqual(result.data,{...source,evidence:result.languageCompilation.audit[0].compiled,warnings:['The hand is outside the frame.']});
  assert.equal(source.warnings[0],'手在画外');
});

test('pure English skips Python including Chinese opaque identifiers',async()=>{
  const source={characterId:'小粉',scene:{location:'desk'},count:2};
  const result=await requestEnglishVisualJson(async()=>({data:source}),'plan','story',undefined,{},async()=>{throw new Error('must not run');});
  assert.equal(result.data,source);assert.equal(result.languageCompilation.mode,'direct_english');
});

test('translation failures retain candidate and never trigger a second DeepSeek call',async()=>{
  for(const translate of [async()=>['还有中文'],async()=>[],async()=>[''],async()=>{throw new Error('offline model unavailable');}]){
    let calls=0,validated=false;
    await assert.rejects(requestEnglishVisualJson(async()=>{calls++;return {data:{evidence:'无法明确识别的复杂场景'}};},'system','input',()=>{validated=true;},{},translate),error=>{
      assert.match((error as Error).message,/Python自动英文翻译失败/);assert.ok((error as any).candidate);return true;
    });
    assert.equal(calls,1);assert.equal(validated,false);
  }
});

test('successful translation still runs structural validation',async()=>{
  await assert.rejects(requestEnglishVisualJson(async()=>({data:{evidence:'原文',count:0}}),'system','input',()=>{throw new Error('invalid count');},{},async()=>['source text']),/invalid count/);
});
