import assert from "node:assert/strict";
import test from "node:test";
import { controlExecutionCoverage, deferRequiredPropsFromBasePrompt, evaluateCaptionForRequiredProps, generationProfilePlan, handDepthDetectionUsable, handPoseDetectionUsable, identityRefinementPlan, gazeMaskCenter, identityReferenceMaskPlan, outfitGarmentZones, propBodySizePlan, propSizePlan, selectControlUnitsForProfile, semanticReviewContractForStage, semanticReviewLabels, semanticReviewContract, semanticApprovalCoversItems, faceRefinementPassPlan, identityReferenceForCharacter, shouldUseOutfitVisualReference, structuredGazeExecutionPlan, upperBodyVisiblePrompt } from "./sd-worker-logic.mjs";

test("identity refinement separates off-camera and camera gaze", () => {
  const off = identityRefinementPlan("eyes focused on the phone screen, no eye contact with camera", "draft");
  const cam = identityRefinementPlan("looking toward the viewer", "draft");
  assert.equal(off.preservesOffCameraGaze, true); assert.equal(off.denoisingStrength, .28); assert.equal(off.controlWeightMode, "capped_0.78");
  assert.equal(cam.allowsCameraGaze, true); assert.equal(cam.preservesOffCameraGaze, false); assert.equal(cam.denoisingStrength, .38);
  assert.equal(identityRefinementPlan("same established facial identity, readable symmetrical eyes, defined facial features").preservesOffCameraGaze, false);
});

test("gaze mask uses nose for left, center and right, with region fallback", () => {
  for (const x of [.2, .5, .8]) assert.equal(gazeMaskCenter({width:512,height:512,poseNose:{x,y:.25},region:{xStart:0,xEnd:1},shotSize:"close-up"}).x, x);
  const fallback=gazeMaskCenter({width:512,height:512,region:{xStart:.7,xEnd:1},shotSize:"medium shot"});
  assert.equal(fallback.x, .85); assert.equal(fallback.sourceX, "region"); assert.equal(fallback.y, .27);
});

test("base identity mask is a face-only ellipse even when a single-person reference has no region", () => {
  const plan = identityReferenceMaskPlan({ width: 512, height: 512, poseNose: { x: .529315, y: .159186 }, region: null, shotSize: "close shot" });
  assert.deepEqual(plan.center, { x: .529315, y: .159186 });
  assert.equal(plan.sourceX, "pose_nose");
  assert.equal(plan.sourceY, "pose_nose");
  assert.equal(plan.shotClass, "medium");
  assert.deepEqual(plan.region, { xStart: 0, xEnd: 1 });
  assert.ok(plan.normalizedBounds.width < .25);
  assert.ok(plan.normalizedBounds.height < .3);
  assert.ok(plan.normalizedBounds.y + plan.normalizedBounds.height < .32, "identity reference must not reach the upper garment");
});

test("base identity masks remain inside the matching character region for multiple people", () => {
  const left = identityReferenceMaskPlan({ width: 768, height: 512, poseNose: { x: .24, y: .2 }, region: { xStart: 0, xEnd: .5 }, shotSize: "medium shot" });
  const right = identityReferenceMaskPlan({ width: 768, height: 512, poseNose: { x: .78, y: .22 }, region: { xStart: .5, xEnd: 1 }, shotSize: "medium shot" });
  assert.ok(left.normalizedBounds.x >= 0 && left.normalizedBounds.x + left.normalizedBounds.width <= .5);
  assert.ok(right.normalizedBounds.x >= .5 && right.normalizedBounds.x + right.normalizedBounds.width <= 1);
  assert.equal(left.center.x, .24);
  assert.equal(right.center.x, .78);
  assert.notDeepEqual(left.bounds, right.bounds);
});

test("base identity mask falls back to character region and shot size and clamps a stale nose", () => {
  const fallback = identityReferenceMaskPlan({ width: 512, height: 512, region: { xStart: .6, xEnd: 1 }, shotSize: "full shot" });
  assert.equal(fallback.center.x, .8);
  assert.equal(fallback.center.y, .18);
  assert.equal(fallback.sourceX, "character_region");
  assert.equal(fallback.sourceY, "shot_size");
  const clamped = identityReferenceMaskPlan({ width: 512, height: 512, poseNose: { x: .1, y: .2 }, region: { xStart: .5, xEnd: 1 }, shotSize: "medium shot" });
  assert.equal(clamped.sourceX, "pose_nose_clamped_to_character_region");
  assert.ok(clamped.normalizedBounds.x >= .5);
});

test("structured gaze executor selects each uncovered concrete target and never invents independent gaze", () => {
  const plan = structuredGazeExecutionPlan({
    coveredCharacterIds: ["relation-covered"],
    people: [
      { characterId: "free", gazeTarget: { kind: "target", point: { x: .76, y: .31 }, targetId: "character:right", source: "interaction.target_character_shared_axis" }, headDirection: { mode: "up_right", target: { x: .76, y: .31 } } },
      { characterId: "relation-covered", gazeTarget: { kind: "object", point: { x: .44, y: .62 }, targetId: "prop:phone", source: "interaction.object_center" }, headDirection: { mode: "down_left", target: { x: .44, y: .62 } } },
      { characterId: "independent", gazeTarget: { kind: "independent", point: null, targetId: null, source: "scene_plan.no_structured_gaze_target" }, headDirection: { mode: "independent", target: null } },
      { characterId: "invalid", gazeTarget: { kind: "target", point: { x: Number.NaN, y: .2 }, source: "bad_input" } },
    ],
  });
  assert.equal(plan.passes.length, 1);
  assert.equal(plan.passes[0].characterId, "free");
  assert.deepEqual(plan.passes[0].targetCenter, { x: .76, y: .31 });
  assert.equal(plan.passes[0].headTargetMatchesStructured, true);
  assert.equal(plan.passes[0].canonicalHeadDirection, "up-right");
  assert.deepEqual(plan.skipped.map((item) => item.reason), ["successful_relation_gaze_coverage", "independent_or_null_target", "invalid_structured_target"]);
  assert.equal(plan.hasStructuredTarget, true);
});

test("structured gaze executor rejects stale head targets and deduplicates characters", () => {
  const plan = structuredGazeExecutionPlan({ people: [
    { characterId: "same", gazeTarget: { kind: "work_point", point: { x: .32, y: .7 }, source: "interaction.work_point" }, headDirection: { mode: "right", target: { x: .8, y: .2 } } },
    { characterId: "same", gazeTarget: { kind: "target", point: { x: .7, y: .3 }, source: "duplicate" } },
  ] });
  assert.equal(plan.passes.length, 1);
  assert.equal(plan.passes[0].headTargetMatchesStructured, false);
  assert.equal(plan.passes[0].canonicalHeadDirection, null);
  assert.equal(plan.skipped[0].reason, "duplicate_character_plan");
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
  assert.deepEqual(labels,["interaction_review_required","gaze_review_required","framing_review_required","pose_review_required","hands_review_required","prop_review_required","prop_cardinality_review_required"]);
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

test("semantic review contract requires count, anatomy and explicit story expression", () => {
  const contract = semanticReviewContract({ generationSpec: { visualSpec: {
    camera: {}, characters: [{ characterId: "hero", expression: "happy anticipation", expressionReason: "receives a notification" }], interactions: []
  } } });
  const byId = new Map(contract.items.map((item) => [item.id, item]));
  assert.equal(byId.get("character_count_review_required")?.priority, "P0");
  assert.equal(byId.get("anatomy_review_required")?.priority, "P0");
  assert.equal(byId.get("expression_review_required")?.priority, "P1");
  assert.match(byId.get("expression_review_required")?.expectation || "", /happy anticipation/);
});

test("semantic approval must pass every required contract item", () => {
  const items=[{id:"interaction_review_required",required:true},{id:"lighting_review_required",required:true}];
  assert.equal(semanticApprovalCoversItems(items,null),false);
  assert.equal(semanticApprovalCoversItems(items,{version:"semantic-review-v1",verdicts:{interaction_review_required:"pass"}}),false);
  assert.equal(semanticApprovalCoversItems(items,{version:"semantic-review-v1",verdicts:{interaction_review_required:"pass",lighting_review_required:"fail"}}),false);
  assert.equal(semanticApprovalCoversItems(items,{version:"semantic-review-v1",verdicts:{interaction_review_required:"pass",lighting_review_required:"pass"}}),true);
});

test("CPU profiles cap peak base controls and run required refinements serially", () => {
  const fast = generationProfilePlan("cpu_local_fast", 1);
  const complex = generationProfilePlan("cpu_local_complex", 2);
  assert.equal(fast.runDraftRefinements, true);
  assert.equal(fast.maxInitialControlUnits, 3);
  assert.equal(fast.draftLongEdge, 448);
  assert.equal(complex.maxInitialControlUnits, 3);
  const selected = selectControlUnitsForProfile([
    { stage: "identity_reference", id: "identity" },
    { stage: "initial_prop_structure", id: "prop" },
    { stage: "pose", id: "pose" },
  ], "cpu_local_fast");
  assert.deepEqual(selected.map((item) => item.id), ["identity", "prop", "pose"]);
});

test("complex CPU prioritizes non-serial pose and support controls in the peak-memory base stage", () => {
  const selected = selectControlUnitsForProfile([
    { stage: "identity_reference", id: "identity" },
    { stage: "upper_body_composition_scale", id: "composition" },
    { stage: "initial_prop_structure", id: "prop" },
    { stage: "pose", id: "pose" },
    { stage: "support_surface_geometry", id: "support" },
  ], "cpu_local_complex");
  assert.deepEqual(selected.map((item) => item.id), ["prop", "pose", "support"]);
  assert.equal(selected.some((item) => item.id === "identity"), false);
  assert.equal(selected.some((item) => item.id === "composition"), false);
  assert.equal(selected.some((item) => item.id === "prop"), true);
});

test("upper-body deferred prop leaves CPU base slots for pose and support", () => {
  const selected = selectControlUnitsForProfile([
    { stage: "identity_reference", id: "identity" },
    { stage: "pose", id: "pose" },
    { stage: "deferred_prop_structure", id: "prop" },
    { stage: "support_surface_geometry", id: "support" },
  ], "cpu_local_complex");
  assert.deepEqual(selected.map((item) => item.id), ["pose", "prop", "support"]);
});

test("coverage only accepts serial compensation with explicit equivalent capabilities", () => {
  const units = [
    { stage: "identity_reference", characterId: "hero" },
    { stage: "pose" },
    { stage: "deferred_prop_structure", relationId: "phone-1" },
    { stage: "support_surface_geometry" },
  ];
  const selected = units.filter((unit) => unit.stage !== "deferred_prop_structure");
  const insufficient = controlExecutionCoverage(units, selected, { runRefinements: true, serialCapabilities: {
    identity_reference: { available: true, preservesPose: true },
    deferred_prop_structure: { available: true, includesObject: true, includesRequiredHands: false, includesPoseContact: false, preservesPose: true },
  } });
  assert.equal(insufficient.complete, false);
  assert.deepEqual(insufficient.entries.map((item) => [item.stage, item.status]), [
    ["identity_reference", "applied_in_base"],
    ["pose", "applied_in_base"],
    ["deferred_prop_structure", "uncovered"],
    ["support_surface_geometry", "applied_in_base"],
  ]);
  const equivalent = controlExecutionCoverage(units, selected, { runRefinements: true, serialCapabilities: {
    identity_reference: { available: true, preservesPose: true },
    deferred_prop_structure: { available: true, includesObject: true, includesRequiredHands: true, includesPoseContact: true, preservesPose: true },
  } });
  assert.equal(equivalent.complete, true);
  assert.equal(controlExecutionCoverage(units, selected, { runRefinements: false }).complete, false);
});

test("caption gate detects required smartphone aliases and reports omissions", () => {
  const interactions = [{ relationId: "phone-1", required: true, object: "smartphone" }];
  assert.equal(evaluateCaptionForRequiredProps("a woman looking at a cell phone", interactions).missing.length, 0);
  assert.deepEqual(evaluateCaptionForRequiredProps("a woman sitting on a sofa", interactions).missing.map((item) => item.object), ["smartphone"]);
});

test("required props retain their structured category while fine content is deferred", () => {
  const result = deferRequiredPropsFromBasePrompt("one woman, (looking toward the smartphone, head and pupils aligned toward the action target:1.3), phone screen visible, seated on a sofa", [{ required: true, object: "smartphone", handMode: "two", shape: "portrait_rect", orientation: "portrait", objectCenter: { x: .5, y: .47 }, contactAnchors: [{ x: .445, y: .47 }, { x: .555, y: .47 }], region: { xStart: 0, xEnd: 1 } }]);
  assert.match(result.prompt, /clearly visible actual smartphone/);
  assert.equal(/phone screen visible/i.test(result.prompt), true);
  assert.equal(/head and pupils aligned/i.test(result.prompt), true);
  assert.equal([...result.prompt].filter((character) => character === "(").length, [...result.prompt].filter((character) => character === ")").length);
  assert.match(result.prompt, /both declared hands contact distinct object-side anchors/);
  assert.match(result.prompt, /approximately 0\.08 frame-width by 0\.16 frame-height/);
  assert.match(result.negative, /readable prop text/);
  assert.deepEqual(result.objects, ["smartphone"]);
});

test("prop surface deferral preserves one-hand purpose gaze and the other action", () => {
  const result = deferRequiredPropsFromBasePrompt(
    "one woman, right hand carries a smartphone at her side, left hand closes the door, eyes looking forward",
    [{ required: true, object: "smartphone", purpose: "carry", handMode: "one", activeHand: "right", gazeMode: "independent", shape: "portrait_rect", orientation: "portrait", objectCenter: { x: .7, y: .68 }, contactAnchors: [{ x: .7, y: .68, hand: "right", role: "active" }], region: { xStart: .5, xEnd: 1 } }],
  );
  assert.match(result.prompt, /right hand carries a smartphone at her side/);
  assert.match(result.prompt, /left hand closes the door/);
  assert.match(result.prompt, /eyes looking forward/);
  assert.match(result.prompt, /only the right hand contacts the object/);
  assert.doesNotMatch(result.prompt, /both acting hands wrap/);
});

test("surface phrase rewrite never deletes a mixed semicolon clause or negative text constraint", () => {
  const original = "left hand holding smartphone at her side; right hand closing the door; eyes looking toward the path; no legible text";
  const result = deferRequiredPropsFromBasePrompt(original, [{
    required: true, object: "smartphone", purpose: "carry", handMode: "one", activeHand: "left", gazeMode: "independent",
    shape: "portrait_rect", orientation: "portrait", objectCenter: { x: .3, y: .68 },
    contactAnchors: [{ x: .3, y: .68, hand: "left", role: "active" }], region: { xStart: 0, xEnd: .5 },
  }]);
  assert.match(result.prompt, /left hand holding smartphone at her side/);
  assert.match(result.prompt, /right hand closing the door/);
  assert.match(result.prompt, /eyes looking toward the path/);
  assert.match(result.prompt, /no legible text/);
  assert.deepEqual(result.removed, []);

  const positiveDetail = deferRequiredPropsFromBasePrompt("left hand holds a book with intricate prop surface detail while looking forward", [{
    required: true, object: "book", purpose: "carry", handMode: "one", activeHand: "left", gazeMode: "independent",
    shape: "portrait_rect", objectCenter: { x: .3, y: .6 }, contactAnchors: [{ x: .3, y: .6, hand: "left", role: "active" }], region: { xStart: 0, xEnd: .5 },
  }]);
  assert.match(positiveDetail.prompt, /left hand holds a book/);
  assert.match(positiveDetail.prompt, /while looking forward/);
  assert.match(positiveDetail.prompt, /simplified non-legible prop surface detail/);
  assert.deepEqual(positiveDetail.removed, ["intricate prop surface detail"]);
});

test("hand depth gate rejects flat detector output and accepts a real contour", () => {
  assert.deepEqual(handDepthDetectionUsable([{ stdev: 0 }, { stdev: 0 }, { stdev: 0 }]), { usable: false, variance: 0 });
  assert.deepEqual(handDepthDetectionUsable([{ stdev: 2 }, { stdev: 7.5 }, { stdev: 3 }]), { usable: true, variance: 7.5 });
});

test("hand pose gate rejects colored body pose without real hand keypoints", () => {
  const sentinel = Array.from({ length: 21 }, () => [-0.001953125, -0.001953125, 1]).flat();
  const payload = { poses: [{ people: [{ hand_left_keypoints_2d: sentinel, hand_right_keypoints_2d: sentinel }] }] };
  const result = handPoseDetectionUsable(payload, { requiredHands: 2 });
  assert.equal(result.usable, false);
  assert.equal(result.detectedHands, 0);
});

test("hand pose gate requires distinct detected hands near every declared anchor", () => {
  const hand = (cx) => Array.from({ length: 21 }, (_, index) => [cx + (index % 4) * .008, .5 + Math.floor(index / 4) * .008, .9]).flat();
  const payload = { poses: [{ people: [{ hand_left_keypoints_2d: hand(.62), hand_right_keypoints_2d: hand(.38) }] }] };
  const result = handPoseDetectionUsable(payload, { requiredHands: 2, anchors: [{ hand: "left", x: .62, y: .52 }, { hand: "right", x: .38, y: .52 }], imageWidth: 1, imageHeight: 1 });
  assert.equal(result.usable, true);
  assert.equal(result.matches.filter((item) => item.matched).length, 2);
});

test("outfit contracts bind upper and lower garments to separate body zones", () => {
  assert.deepEqual(outfitGarmentZones("cream-yellow top with a soft pink midi skirt"), [
    { zone: "upper", prompt: "cream-yellow top" },
    { zone: "lower", prompt: "a soft pink midi skirt" },
  ]);
  assert.deepEqual(outfitGarmentZones("navy one-piece dress"), [{ zone: "full", prompt: "navy one-piece dress" }]);
  assert.equal(shouldUseOutfitVisualReference("upper", false), false);
  assert.equal(shouldUseOutfitVisualReference("lower", true), true);
  assert.equal(shouldUseOutfitVisualReference("full", false), false);
  assert.equal(shouldUseOutfitVisualReference("", true), false);
});

test("prop sizing follows shape and contact span without object-name special cases", () => {
  assert.deepEqual(propSizePlan({ shape: "portrait_rect", orientation: "portrait", contactSpan: .09, hasPoseContact: true }), { width: .135, height: 0.19575 });
  assert.ok(propSizePlan({ shape: "landscape_rect", contactSpan: .09, hasPoseContact: true }).height < .1);
  assert.ok(propSizePlan({ shape: "elongated", contactSpan: .09, hasPoseContact: true }).width > .14);
  const body = propBodySizePlan({ shape: "portrait_rect", orientation: "portrait", contactSpan: .09, hasPoseContact: true });
  assert.ok(Math.abs(body.width - .0702) < 1e-9);
  assert.ok(Math.abs(body.height - .160515) < 1e-9);
  assert.deepEqual(body.envelope, { width: .135, height: .19575 });
});

test("upper-body prompt omits lower garments and shoes", () => {
  const prompt = upperBodyVisiblePrompt("cream-yellow top with a soft pink midi skirt, clean casual sneakers, plush sofa, subtle foreground object framing the scene, coffee table, strict crop, no visible legs", { suppressForegroundClutter: true });
  assert.match(prompt, /cream-yellow top/);
  assert.doesNotMatch(prompt, /midi skirt|sneakers/);
  assert.doesNotMatch(prompt, /sofa/);
  assert.doesNotMatch(prompt, /foreground|coffee table/);
  assert.match(prompt, /no visible legs/);
});

test("upper-body portable contact prompt keeps acting hands above the lap", () => {
  const prompt = upperBodyVisiblePrompt("one adult woman, close shot, seated on a sofa, a rug in the foreground", {
    suppressForegroundClutter: true,
    raisedHandContact: true,
  });
  assert.match(prompt, /hands meet at the declared mid-chest contact point/);
  assert.match(prompt, /do not press downward onto a lap or foreground surface/);
  assert.match(prompt, /no visible floor or ground plane/);
  assert.doesNotMatch(prompt, /seated on a sofa/);
  assert.doesNotMatch(prompt, /rug/);
});

test("draft review blocks visible semantic failures before final refinements", () => {
  const args = { generationSpec: { visualSpec: {
    camera: { shotSize: "medium shot", composition: "seated beside the window" },
    scene: { lighting: "window light" },
    characters: [{ characterId: "hero", expression: "happy", hands: "both hands holding a smartphone", gazeTarget: "phone screen" }],
    interactions: [{ propId: "smartphone", gazeTarget: "phone screen" }],
  }, poseControl: { kind: "seated" }, repairPasses: { propInteraction: { object: "smartphone", gazeMode: "object" } } } };
  const draft = semanticReviewContractForStage(args, "draft");
  const final = semanticReviewContractForStage(args, "final");
  assert.ok(draft.items.some((item) => item.id === "character_count_review_required"));
  assert.ok(draft.items.some((item) => item.id === "pose_review_required"));
  assert.ok(draft.items.some((item) => item.id === "anatomy_review_required"));
  assert.ok(draft.items.some((item) => item.id === "hands_review_required"));
  assert.ok(draft.items.some((item) => item.id === "prop_review_required"));
  assert.ok(draft.items.some((item) => item.id === "gaze_review_required"));
  assert.ok(draft.items.some((item) => item.id === "expression_review_required"));
  assert.ok(final.items.some((item) => item.id === "hands_review_required"));
  assert.ok(final.items.some((item) => item.id === "gaze_review_required"));
});

test("legacy execution review inputs preserve count anatomy framing gaze and expression checks", () => {
  const contract = semanticReviewContractForStage({ generationSpec: {
    visualSpec: null,
    reviewInputs: {
      source: "compiled_execution_contract",
      characterCount: 1,
      shotSize: "medium shot",
      characters: [{ characterId: "hero", expression: "eager anticipation", gazeTarget: "looking along the direction of movement", hands: "hands visible" }],
    },
  } }, "draft");
  const ids = new Set(contract.items.map((item) => item.id));
  for (const id of ["character_count_review_required", "anatomy_review_required", "framing_review_required", "gaze_review_required", "expression_review_required", "hands_review_required"]) assert.ok(ids.has(id), id);
  assert.match(contract.items.find((item) => item.id === "character_count_review_required")?.sources.join(" ") || "", /reviewInputs/);
});
