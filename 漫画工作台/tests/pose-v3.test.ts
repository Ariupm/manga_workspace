import assert from "node:assert/strict";
import test from "node:test";
import { applyPoseControlOverrideV3, buildPoseControlV3 } from "../lib/pose-v3";
import { chooseProjectionV3, evaluateJointEvidenceV3, transformPeopleV3 } from "../lib/pose-v3/projection";
import { validatePoseSceneV3 } from "../lib/pose-v3/validation";
import { preparePoseExecutionV3 } from "../scripts/pose-execution-v3.mjs";
import { solvePortableContactsV3 } from "../lib/pose-v3/contact-geometry";
import { openPoseColors, renderOpenPoseSvgV2 } from "../lib/pose-v2";
import { renderControlOpenPoseV3 } from "../lib/pose-v3/render";
import { propBodySizePlan } from "../scripts/sd-worker-logic.mjs";

test("all 18 OpenPose joints use the installed annotator palette, including the left ear", () => {
  assert.equal(openPoseColors.length, 18);
  const points = Array.from({length:18},(_,i)=>({x:.1+i*.04,y:.5}));
  const v2 = renderOpenPoseSvgV2([points],512,512);
  const v3 = renderControlOpenPoseV3([points],[points.map(()=>"visible")],512,512);
  for (const svg of [v2,v3]) {
    const circles = [...svg.matchAll(/<circle[^>]+fill="([^"]+)"/g)].map(m=>m[1]);
    assert.deepEqual(circles,openPoseColors);
    assert.equal(circles[17],"#ff0055");
  }
});

test("required prop and contact evidence participates in composition and shares execution coordinates", () => {
  for (const object of ["book", "cup", "package", "tool"]) {
    for (const camera of ["close-up", "medium shot", "wide shot"]) {
      for (const handMode of ["one", "two"] as const) {
        const relation = { relationId: "contact", characterId: "actor", required: true, object, purpose: "carry", handMode,
          activeHand: handMode === "two" ? "both" as const : "left" as const,
          objectCenter: { x: .5, y: .53 }, region: { xStart: 0, xEnd: 1 },
          contactAnchors: handMode === "two" ? [{ hand: "left" as const, x: .545, y: .53 }, { hand: "right" as const, x: .455, y: .53 }]
            : [{ hand: "left" as const, x: .5, y: .53 }],
        };
        const control = buildPoseControlV3(shot(`holding a ${object}`, camera), [relation])!;
        assert.ok(control.scenePlan.evidence.find(e => e.relationId === relation.relationId)?.points?.length);
        assert.equal(control.scenePlan.projection!.evidenceVisible["relation:contact"], true);
        if(control.safety.errors.some(e=>e.includes("crop includes torso"))){assert.equal(camera,"close-up");assert.throws(()=>preparePoseExecutionV3({poseControl:control}),/framing conflict/);continue;}
        const recipe = preparePoseExecutionV3({ poseControl: control, generationSpec: { repairPasses: { propInteractions: [relation] } } });
        const execution = recipe.poseExecution!;
        for (const anchor of execution.repairPasses.propInteractions[0].contactAnchors) {
          const wrist = control.people[0][anchor.hand === "left" ? 7 : 4];
          assert.ok(Math.abs(anchor.x - wrist.x) < 1e-10);
          assert.ok(Math.abs(anchor.y - wrist.y) < 1e-10);
        }
      }
    }
  }
});

test("joint evidence belongs to its actor, including reordered and legacy scenes", () => {
  const inside = Array.from({ length: 18 }, () => ({ x: .5, y: .5 }));
  const outside = inside.map(point => ({ ...point }));
  outside[4] = { x: 1.2, y: .5 };
  for (const jointIndices of [[4], [3, 4], [0, 4, 7]]) {
    for (const people of [[inside, outside], [outside, inside]]) {
      const evidence = people.map((_, personIndex) => ({ id: `actor-${personIndex}`, kind: "joint" as const, required: true, personIndex, jointIndices, description: "actor contact" }));
      const result = evaluateJointEvidenceV3(people, evidence);
      people.forEach((person, i) => assert.equal(result[`actor-${i}`], person === inside));
      assert.equal(evaluateJointEvidenceV3(people, [{ ...evidence[0], personIndex: undefined }])["actor-0"], false);
      assert.equal(evaluateJointEvidenceV3(people, [{ ...evidence[0], personIndex: 9 }])["actor-0"], false);
    }
  }
  const evidence = [{ id: "second-wrist", kind: "joint" as const, required: true, personIndex: 1, jointIndices: [4], description: "second actor wrist" }];
  const locked = chooseProjectionV3([inside, outside], evidence, "locked", "head_shoulders")!;
  assert.equal(locked.evidenceVisible["second-wrist"], false);
  assert.ok(locked.hardFailures.includes("required evidence out of frame: second-wrist"));
});

test("combined locomotion and environment actions retain explicit portable contacts", () => {
  for (const action of ["walking out of the door", "walking while opening the door", "running while carrying a book", "standing while pulling a door"]) {
    for (const hand of ["left", "right"] as const) {
      const target = { x: hand === "left" ? .55 : .45, y: .58 };
      const relation = { relationId: "held", characterId: "actor", required: true, object: "smartphone", purpose: "carry", handMode: "one" as const, activeHand: hand, region:{xStart:0,xEnd:1}, objectCenter: target, contactAnchors: [{hand,...target}] };
      const control = buildPoseControlV3(shot(action, "medium shot"), [relation])!;
      const wrist = control.fullPeople[0][hand === "left" ? 7 : 4];
      assert.ok(Math.hypot(wrist.x-target.x,wrist.y-target.y)<1e-10, `${action}/${hand}: lost contact`);
      assert.ok(control.safety.valid || control.safety.errors.every(e=>e.includes("crop still includes knees or feet")),JSON.stringify(control.safety));
      // A low carried prop may share the raised running knee's height: retain contact and reject the incompatible waist crop.
      const nose=control.fullPeople[0][0];
      for(const eye of [14,15]) assert.ok(Math.abs(control.fullPeople[0][eye].y-nose.y)<.035,`${action}: eye detached from walking head`);
    }
  }
});

test("构图包含完整道具包络，不能只把中心放在画内", () => {
  for(const shape of ["portrait_rect","landscape_rect","cylinder","elongated"]) {
    for(const camera of ["close-up","medium shot","wide shot"]) {
      const relation={relationId:"edge",characterId:"actor",required:true,object:"prop",purpose:"carry",shape,handMode:"one" as const,activeHand:"left" as const,objectCenter:{x:.55,y:.58},region:{xStart:0,xEnd:1},contactAnchors:[{hand:"left" as const,x:.55,y:.58}]};
      const control=buildPoseControlV3(shot("walking while opening a door",camera),[relation])!;
      assert.equal(control.scenePlan.projection!.evidenceVisible['relation:edge'],true);
      // A long tool held at hip level can physically conflict with an upper
      // crop. Preserve that blocker instead of cropping the tool or showing legs.
      if (!control.safety.valid) {
        assert.notEqual(camera,"wide shot");
        assert.ok(control.safety.errors.every(error=>/crop still includes knees or feet|crop includes torso below its framing boundary|required evidence out of frame: actor:walk_gait/.test(error)));
      }
      if(control.safety.errors.some(e=>e.includes("crop includes torso"))){assert.throws(()=>preparePoseExecutionV3({poseControl:control}),/framing conflict/);continue;}
      const recipe=preparePoseExecutionV3({poseControl:control,generationSpec:{repairPasses:{propInteractions:[relation]}}});
      const prop=recipe.poseExecution!.repairPasses.propInteractions[0];
      const size=propBodySizePlan({shape,hasPoseContact:true}).envelope;
      assert.ok(prop.objectCenter.y+size.height/2<=.98+1e-8);
      assert.ok(prop.objectCenter.y-size.height/2>=.02-1e-8);
    }
  }
});

test("planner binds evidence and joint edits refresh visibility instead of trusting old success", () => {
  const base = buildPoseControlV3(shot("standing still", "wide shot"))!;
  assert.ok(base.scenePlan.evidence.filter(e => e.jointIndices?.length).every(e => e.personIndex === 0));
  const edited = base.people.map(person => person.map(point => ({ ...point })));
  edited[0][0] = { x: 1.2, y: .5 };
  const result = applyPoseControlOverrideV3(base, { schemaVersion: "pose-override-v1", people: edited, editMode: "joint_edit" });
  assert.equal(result.safety.valid, false);
  assert.equal(result.visibility[0][0], "out_of_frame");
  assert.ok(result.framingWarnings.some(x => x.includes("required evidence out of frame")));
  const stale = structuredClone(result.scenePlan);
  stale.projection!.hardFailures = [];
  for (const key of Object.keys(stale.projection!.evidenceVisible)) stale.projection!.evidenceVisible[key] = true;
  assert.equal(validatePoseSceneV3(stale).valid, false);
});

const shot = (action: string, camera = "medium shot") => ({
  id: 7001, pageId: 1, order: 1, title: "v3 test", description: action,
  actionEn: action, camera: camera, cameraEn: camera, compositionEn: "",
  characterIds: ["actor"], characterLooks: {}, visualSpecConfirmed: true,
  visualSpec: { camera: { shotSize: camera }, characters: [{ characterId: "actor", action, expression: "focused" }] },
} as any);

test("medium seated crop excludes knees and feet while preserving full action geometry", () => {
  for (const action of ["sitting on a sofa", "walking toward the exit", "holding a book with both hands"]) {
    const medium = buildPoseControlV3(shot(action, "medium shot"))!;
    const wide = buildPoseControlV3(shot(action, "wide shot"))!;
    assert.equal(medium.scenePlan.preferredComposition, "waist_up");
    assert.equal(medium.safety.valid, true, JSON.stringify(medium.safety));
    assert.equal(medium.scenePlan.projection!.composition, "waist_up");
    assert.ok([9,10,12,13].every(i => medium.visibility[0][i] === "out_of_frame"));
    assert.ok([0,1,2,5].every(i => medium.visibility[0][i] === "visible"));
    assert.ok(wide.visibility[0].every(v => v === "visible"));
    assert.equal(medium.fullPeople[0].length, 18);
    const recipe = preparePoseExecutionV3({ poseControl: medium, generationSpec: { repairPasses: {} } });
    assert.equal(recipe.poseExecution!.framingMode, "upper_body");
  }
});

test("anatomical projection respects requested crop and is invariant to scene translation", () => {
  const base = buildPoseControlV3(shot("sitting on a sofa", "medium shot"))!;
  const full = base.fullPeople;
  const shifted = full.map(person => person.map(p => ({ x: p.x + .17, y: p.y - .08 })));
  const a = chooseProjectionV3(full, base.scenePlan.evidence, "preferred", "waist_up")!;
  const b = chooseProjectionV3(shifted, base.scenePlan.evidence, "preferred", "waist_up")!;
  assert.equal(a.composition, "waist_up");
  assert.equal(b.composition, a.composition);
  const pa = transformPeopleV3(full, a.scale, a.translate);
  const pb = transformPeopleV3(shifted, b.scale, b.translate);
  pa[0].forEach((p,i) => { assert.ok(Math.abs(p.x-pb[0][i].x)<1e-9); assert.ok(Math.abs(p.y-pb[0][i].y)<1e-9); });
});

test("an incompatible upper-body crop is blocked instead of silently becoming full-body", () => {
  const base = buildPoseControlV3(shot("walking toward the exit", "wide shot"))!;
  const plan = chooseProjectionV3(base.fullPeople, base.scenePlan.evidence, "preferred", "waist_up")!;
  assert.equal(plan.composition, "waist_up");
  assert.ok(plan.hardFailures.some(x => x.includes("required evidence")));
});

test("portable contacts preserve declared anchors and solve fixed arm lengths in full pose space", () => {
  const base = buildPoseControlV3(shot("sitting on a sofa", "wide shot"))!;
  for (const object of ["book", "cup", "package", "smartphone"]) {
    for (const mirror of [false, true]) {
      for (const purpose of ["read", "carry", "operate", "place"]) {
        const people = structuredClone(base.fullPeople);
        if (mirror) people[0].forEach(p => p.x = 1 - p.x);
        const plans = structuredClone(base.scenePlan.people);
        plans[0].relationTargets = [{ object, purpose, target: {x:.5,y:.45}, handMode:"two", activeHand:"both",
          gazeTarget:{kind:"independent",point:null,targetId:null,source:"test"},
          wristAssignments:[{hand:"right",joint:4,x:.465,y:.45},{hand:"left",joint:7,x:.535,y:.45}] }];
        const snapshot = JSON.stringify({people,plans});
        const result = solvePortableContactsV3(people, plans);
        assert.deepEqual(result[0][4], {x:.465,y:.45});
        assert.deepEqual(result[0][7], {x:.535,y:.45});
        const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
        const hips={x:(people[0][8].x+people[0][11].x)/2,y:(people[0][8].y+people[0][11].y)/2};
        const upper=Math.max(.17,Math.min(.23,distance(people[0][1],hips)*.72));
        for(const [shoulder,elbow,wrist] of [[2,3,4],[5,6,7]]){
          assert.ok(Math.abs(distance(result[0][shoulder],result[0][elbow])-upper)<1e-9);
          assert.ok(Math.abs(distance(result[0][elbow],result[0][wrist])-upper*.95)<1e-9);
        }
        assert.equal(JSON.stringify({people,plans}), snapshot);
      }
    }
  }
});

test("parameter overrides refresh action evidence and keep support conflict gates", () => {
  const base = buildPoseControlV3(shot("walking toward the exit", "medium shot"))!;
  const edited = applyPoseControlOverrideV3(base, { schemaVersion: "pose-override-v1", templateId:"phone_two" });
  assert.ok(edited.scenePlan.evidence.some(e => e.id.includes("phone_head_direction")));
  assert.ok(!edited.scenePlan.evidence.some(e => e.id.includes("walk_gait")));
  assert.deepEqual(edited.scenePlan.supportRelations, edited.scenePlan.people.map(p => p.supportRelation));
  const conflicting = structuredClone(edited.scenePlan);
  conflicting.overrideConflicts = ["story support conflict"];
  assert.ok(validatePoseSceneV3(conflicting).errors.includes("story support conflict"));
});

test("V3 keeps a complete locomotion skeleton and projects it without mutating source joints", () => {
  const control = buildPoseControlV3(shot("running toward the exit"));
  assert.ok(control);
  assert.equal(control.posePlanVersion, "3.0");
  assert.equal(control.fullPeople[0].length, 18);
  assert.ok(control.fullPeople[0].slice(8, 14).every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
  assert.notDeepEqual(control.people, control.fullPeople);
  assert.equal(control.audit.deterministic, true);
});

test("V3 is deterministic for identical input and separates walk from run templates", () => {
  const a = buildPoseControlV3(shot("walking toward the exit"));
  const b = buildPoseControlV3(shot("walking toward the exit"));
  const run = buildPoseControlV3(shot("running toward the exit"));
  assert.ok(a && b && run);
  assert.deepEqual(a.audit, b.audit);
  assert.equal(a.scenePlan.people[0].templateId, "walk");
  assert.equal(run.scenePlan.people[0].templateId, "run");
  assert.notDeepEqual(a.fullPeople[0].slice(8, 14), run.fullPeople[0].slice(8, 14));
});

test("V3 rejects collapsed two-hand contact anchors", () => {
  const control = buildPoseControlV3(shot("holding a box with both hands"), [{
    characterId: "actor", required: true, object: "box", purpose: "hold", handMode: "two",
    objectCenter: { x: .5, y: .5 }, region: { xStart: .2, xEnd: .8 }, activeHand: "both",
    contactAnchors: [{ hand: "left", x: .5, y: .5 }, { hand: "right", x: .5, y: .5 }],
  }]);
  assert.ok(control);
  assert.equal(control.safety.valid, false);
  assert.ok(control.safety.errors.some((error) => error.includes("collapse")));
});

test("V3 legacy-style controls rebuild template geometry and mirror deterministically", () => {
  const base = buildPoseControlV3(shot("walking toward the door"));
  assert.ok(base);
  const kneel = applyPoseControlOverrideV3(base, { schemaVersion: "pose-override-v1", templateId: "kneel_single", phase: "contact", mirror: true });
  assert.equal(kneel.scenePlan.people[0].templateId, "kneel_single");
  assert.notDeepEqual(kneel.fullPeople[0].slice(8, 14), base.fullPeople[0].slice(8, 14));
  assert.notEqual(kneel.audit.templateHash, base.audit.templateHash);
  assert.notEqual(kneel.audit.projectionHash, base.audit.projectionHash);
});

test("V3 provides distinct one-hand and two-hand smartphone templates", () => {
  const base = buildPoseControlV3(shot("walking toward the door"));
  assert.ok(base);
  const one = applyPoseControlOverrideV3(base, { schemaVersion: "pose-override-v1", templateId: "phone_one" });
  const two = applyPoseControlOverrideV3(base, { schemaVersion: "pose-override-v1", templateId: "phone_two" });
  assert.equal(one.scenePlan.people[0].templateId, "phone_one");
  assert.equal(two.scenePlan.people[0].templateId, "phone_two");
  assert.notDeepEqual(one.fullPeople[0].slice(3, 8), two.fullPeople[0].slice(3, 8));
  assert.ok(Math.abs(two.fullPeople[0][4].x - two.fullPeople[0][7].x) >= .06);
});

test("walk template has a planted support leg, lifted swing foot and contralateral arm swing", () => {
  const walk = buildPoseControlV3(shot("walking toward the exit"));
  assert.ok(walk);
  const gait = walk.scenePlan.people[0].locomotion!;
  const points = walk.fullPeople[0];
  const supportAnkle = gait.supportSide === "right" ? 10 : 13;
  const swingKnee = gait.swingSide === "right" ? 9 : 12;
  const swingAnkle = gait.swingSide === "right" ? 10 : 13;
  const swingHip = gait.swingSide === "right" ? 8 : 11;
  assert.ok(points[supportAnkle].y >= .9, "support foot must remain planted");
  assert.ok(points[swingAnkle].y < points[supportAnkle].y, "swing foot must be lifted");
  assert.ok(Math.abs(points[swingKnee].x - points[swingHip].x) > .07, "swing knee must advance away from the hip axis");
  assert.ok((points[4].x-points[2].x)*(points[7].x-points[5].x)<0, "opposite arms must swing in opposite directions relative to their shoulders");
});

test("walk phase and mirror controls rebuild the gait instead of returning a standing pose", () => {
  const base = buildPoseControlV3(shot("walking toward the exit"));
  assert.ok(base);
  const toeOff = applyPoseControlOverrideV3(base, { schemaVersion: "pose-override-v1", templateId: "walk", phase: "follow_through" });
  const mirrored = applyPoseControlOverrideV3(base, { schemaVersion: "pose-override-v1", templateId: "walk", mirror: true });
  assert.notDeepEqual(toeOff.fullPeople[0].slice(8, 14), base.fullPeople[0].slice(8, 14));
  assert.notDeepEqual(mirrored.fullPeople[0], base.fullPeople[0]);
  assert.ok(new Set(base.fullPeople[0].slice(8, 14).map((point) => point.x.toFixed(3))).size >= 5);
});

test("V3 joint edit preserves projected canvas coordinates while parameter edit may reproject", () => {
  const base = buildPoseControlV3(shot("holding a book with one hand", "wide shot"));
  assert.ok(base);
  const edited = base.people.map((person) => person.map((point) => ({ ...point })));
  edited[0][0] = { x: .22, y: .08 };
  edited[0][4] = { x: .82, y: .42 };
  const joint = applyPoseControlOverrideV3(base, { schemaVersion: "pose-override-v1", people: edited, editMode: "joint_edit", coordinateSpace: "projected_canvas", projectionIntent: "lock_current" });
  assert.deepEqual(joint.people, edited);
  assert.equal(joint.scenePlan.projection?.scale, base.scenePlan.projection?.scale);
  assert.deepEqual(joint.scenePlan.projection?.translate, base.scenePlan.projection?.translate);
  assert.equal(joint.scenePlan.projection?.source, "user_locked");
  assert.equal(joint.override?.coordinateSpace, "projected_canvas");
  assert.equal(joint.override?.projectionIntent, "lock_current");
  const parameter = applyPoseControlOverrideV3(base, { schemaVersion: "pose-override-v1", templateId: "phone_two", editMode: "parameter_edit", coordinateSpace: "full_pose", projectionIntent: "recompute" });
  assert.notEqual(parameter.audit.projectionHash, base.audit.projectionHash);
});
