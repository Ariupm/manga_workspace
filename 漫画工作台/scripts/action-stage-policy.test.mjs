import assert from 'node:assert/strict';
import test from 'node:test';
import {actionStageState,contactPassAllowed,synchronizedActionTerms,actionContactTerms} from './action-stage-policy.mjs';
import {deferRequiredPropsFromBasePrompt} from './sd-worker-logic.mjs';
test('held preparation preserves hand contact without claiming tool-work contact',()=>{
 assert.equal(actionStageState('place','anticipation').contactRequired,true);
 assert.equal(actionStageState('pick','anticipation').contactRequired,false);
 assert.equal(actionStageState('place','follow_through').contactRequired,false);
 for(const actionId of ['tool','write']){
  const relation={actionPlan:{actionId,phase:'anticipation',geometry:{modelVersion:'action-mechanism-1',mechanism:'work',phase:'anticipation'}},visualFacts:{support:{state:'held'}}};
  assert.equal(contactPassAllowed(relation),true);
  assert.match(actionContactTerms(relation).join(' '),/remains separated/);
  assert.doesNotMatch(actionContactTerms(relation).join(' '),/working end meets/);
  relation.visualFacts.support.state='on_support';assert.equal(contactPassAllowed(relation),false);
 }
});
test('all dynamic action families use one stage state in base prompt and contact eligibility',()=>{
 for(const actionId of ['pick','place','open','close','operate_environment','write','tool','push','pull'])for(const phase of ['anticipation','contact','follow_through']){
 const state=actionStageState(actionId,phase);
 const r={object:'object',required:true,shape:'landscape_rect',handMode:'one',activeHand:'left',purpose:actionId,positive:['both hands physically contact the object'],actionPlan:{actionId,phase,geometry:{modelVersion:'action-mechanism-1',actionId,phase}}};
 assert.equal(contactPassAllowed(r),state.contactRequired);
 const base=deferRequiredPropsFromBasePrompt('',[r]).prompt;
 if(!state.contactRequired){assert.doesNotMatch(base,/hand contacts|hands contact/);assert.match(base,/without contact|released/);assert.doesNotMatch(synchronizedActionTerms(r).join(' '),/both hands physically contact/);}
 }
});
test('manual phase override removes preceding action-stage wording',()=>{
 const r={object:'book',positive:['reaching toward','action stage anticipation'],actionRelationAudit:{phase:'contact',contactState:'contact',geometry:{modelVersion:'action-mechanism-1',actionId:'pick',phase:'contact'}}};
 const terms=synchronizedActionTerms(r).join(' ');assert.doesNotMatch(terms,/anticipation|reaching toward/);assert.match(terms,/picking up/);
});
