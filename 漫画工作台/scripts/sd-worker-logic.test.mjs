import assert from "node:assert/strict";
import test from "node:test";
import { identityRefinementPlan, gazeMaskCenter, semanticReviewLabels, semanticReviewContract, semanticApprovalCoversItems, faceRefinementPassPlan, identityReferenceForCharacter } from "./sd-worker-logic.mjs";

test("identity refinement separates off-camera and camera gaze", () => {
  const off = identityRefinementPlan("eyes focused on the phone screen, no eye contact with camera", "draft");
  const cam = identityRefinementPlan("looking toward the viewer", "draft");
  assert.equal(off.preservesOffCameraGaze, true); assert.equal(off.denoisingStrength, .28); assert.equal(off.controlWeightMode, "capped_0.78");
  assert.equal(cam.allowsCameraGaze, true); assert.equal(cam.preservesOffCameraGaze, false); assert.equal(cam.denoisingStrength, .38);
});

test("gaze mask uses nose for left, center and right, with region fallback", () => {
  for (const x of [.2, .5, .8]) assert.equal(gazeMaskCenter({width:512,height:512,poseNose:{x,y:.25},region:{xStart:0,xEnd:1},shotSize:"close-up"}).x, x);
  const fallback=gazeMaskCenter({width:512,height:512,region:{xStart:.7,xEnd:1},shotSize:"medium shot"});
  assert.equal(fallback.x, .85); assert.equal(fallback.sourceX, "region"); assert.equal(fallback.y, .27);
});

test("identity and gaze passes share high, middle and low face geometry", () => {
  const reference={characterId:"a",module:"ip-adapter_clip_h",model:"face",weight:.9};
  for (const y of [.15,.28,.46]) {
    const identity=faceRefinementPassPlan({pass:"identity",phase:"draft",shotSize:"close-up",poseNose:{x:.4,y},identityReference:reference,gazeText:"eyes focused on a phone"});
    const gaze=faceRefinementPassPlan({pass:"gaze",phase:"draft",shotSize:"close-up",poseNose:{x:.4,y},identityReference:reference,gazeText:"eyes focused on a phone"});
    assert.deepEqual(identity.center,gaze.center);
    assert.equal(gaze.center.y,y);
    assert.equal(gaze.identityControl?.characterId,"a");
    assert.equal(gaze.identityControl?.weight,.78);
  }
});

test("face pass falls back by region and selects the matching multi-person identity", () => {
  const references=[{characterId:"left",weight:.8},{characterId:"right",weight:.9}];
  const selected=identityReferenceForCharacter(references,"right",0);
  const plan=faceRefinementPassPlan({pass:"gaze",phase:"final",shotSize:"medium shot",region:{xStart:.55,xEnd:1},identityReference:selected,gazeText:"eyes directed toward a tool"});
  assert.equal(plan.center.x,.775);
  assert.equal(plan.center.y,.27);
  assert.equal(plan.center.sourceY,"shot_size");
  assert.equal(plan.identityControl?.characterId,"right");
  assert.equal(plan.denoisingStrength,.28);
});

test("semantic QA emits review requirements, never fabricated failures", () => {
  const labels=semanticReviewLabels({hasInteraction:true,gazeMode:"object",shotSize:"close-up",poseRequired:true});
  assert.deepEqual(labels,["interaction_review_required","gaze_review_required","framing_review_required","pose_review_required","hands_review_required","prop_review_required"]);
  assert.ok(labels.every((label)=>label.endsWith("review_required")));
});

test("semantic review contract covers identity, outfit, hands, prop, composition and lighting", () => {
  const contract=semanticReviewContract({
    generationSpec:{
      visualSpec:{camera:{shotSize:"close-up",composition:"character behind a small foreground table"},scene:{lighting:"soft window light"},characters:[{gazeTarget:"phone screen",hands:"both hands holding smartphone"}],interactions:[{propId:"smartphone",gazeTarget:"phone screen"}]},
      poseControl:{kind:"single_action_seated_v1"},
      repairPasses:{propInteraction:{object:"smartphone",gazeMode:"object",orientation:"portrait",viewerSurface:"screen"}},
      qualityGate:{outfitConditioning:[{characterId:"hero",status:"text_only"}]},
    },
    references:[{role:"identity",characterId:"hero"}],
    adapterStatus:{outfit:"text_only_manual_review"},
    characterLooks:{hero:{outfitId:"outfit_hero"}},
    environment:{depth:"foreground, midground and background",keyLight:"window key light"},
  });
  const ids=new Set(contract.items.map((item)=>item.id));
  for (const id of ["identity_review_required","outfit_review_required","hands_review_required","prop_review_required","interaction_review_required","gaze_review_required","framing_review_required","pose_review_required","composition_review_required","lighting_review_required"]) assert.equal(ids.has(id),true,id);
  assert.equal(contract.items.find((item)=>item.id==="hands_review_required")?.priority,"P0");
  assert.equal(contract.items.find((item)=>item.id==="composition_review_required")?.priority,"P2");
  assert.ok(contract.items.every((item)=>item.sources.length&&item.expectation));
});

test("semantic review contract does not invent requirements for a plain static input", () => {
  const contract=semanticReviewContract({generationSpec:{visualSpec:{camera:{},scene:{},characters:[],interactions:[]}}});
  assert.deepEqual(contract.items,[]);
  assert.equal(semanticApprovalCoversItems(contract.items,null),true);
});

test("semantic approval must pass every required contract item", () => {
  const items=[{id:"interaction_review_required",required:true},{id:"lighting_review_required",required:true}];
  assert.equal(semanticApprovalCoversItems(items,null),false);
  assert.equal(semanticApprovalCoversItems(items,{version:"semantic-review-v1",verdicts:{interaction_review_required:"pass"}}),false);
  assert.equal(semanticApprovalCoversItems(items,{version:"semantic-review-v1",verdicts:{interaction_review_required:"pass",lighting_review_required:"fail"}}),false);
  assert.equal(semanticApprovalCoversItems(items,{version:"semantic-review-v1",verdicts:{interaction_review_required:"pass",lighting_review_required:"pass"}}),true);
});
