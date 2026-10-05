import assert from 'node:assert/strict';
import test from 'node:test';
import {getStudioData,saveShotVisualSpec} from '../lib/db';
import {normalizeShotSpec} from '../lib/visual-planning';
import {POST} from '../app/api/studio/route';
test('pending new specification cannot silently fall back even with force',async()=>{
 const data=getStudioData(1),shot=data.episode.pages[0].shots[0];
 saveShotVisualSpec(shot.id,normalizeShotSpec({},shot),'deepseek','pending-test',{});
 const provider=process.env.IMAGE_PROVIDER,fetch=globalThis.fetch;
 process.env.IMAGE_PROVIDER='sd-webui';
 globalThis.fetch=async()=>{throw new Error('No external calls allowed');};
 try{for(const action of ['generate','generateDraft']){
  const response=await POST(new Request('http://localhost/api/studio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,projectId:1,shotId:shot.id,force:true})}));
  assert.equal(response.status,409);assert.equal((await response.json()).code,'VISUAL_SPEC_PENDING_CONFIRMATION');
 }}finally{globalThis.fetch=fetch;if(provider===undefined)delete process.env.IMAGE_PROVIDER;else process.env.IMAGE_PROVIDER=provider;}
});
