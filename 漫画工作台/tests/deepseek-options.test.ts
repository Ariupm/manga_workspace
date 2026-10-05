import test from 'node:test';
import assert from 'node:assert/strict';
import {callDeepSeekJsonWithConfig} from '../lib/deepseek';

test('有界规划可关闭V4思考；未声明兼容的模型不附加专属参数', async()=>{
  const original=globalThis.fetch;
  const bodies:any[]=[];
  globalThis.fetch=async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({choices:[{message:{content:'{"ok":true}'},finish_reason:'stop'}],usage:{completion_tokens:12}}));};
  try {
    for(const model of ['deepseek-v4-pro','custom-model']) await callDeepSeekJsonWithConfig('JSON only','test',{baseUrl:'https://example.invalid',model,apiKey:'test'},{thinking:'disabled',maxTokens:4500});
    assert.deepEqual(bodies[0].thinking,{type:'disabled'});
    assert.equal(bodies[0].max_tokens,4500);
    assert.equal(bodies[1].thinking,undefined);
  } finally {globalThis.fetch=original;}
});

test('截断响应即使包含可解析JSON也不能被当作完整规划', async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'{"timeline":[]}'},finish_reason:'length'}]}));
  try {await assert.rejects(callDeepSeekJsonWithConfig('JSON','test',{baseUrl:'https://example.invalid',model:'deepseek-v4-pro',apiKey:'test'}),/token 上限/);}
  finally {globalThis.fetch=original;}
});
