import assert from "node:assert/strict";
import test from "node:test";
import { compilePoseExecutionV3, preparePoseExecutionV3 } from "./pose-execution-v3.mjs";

function fixture(scale = 1.35, translate = { x: .04, y: -.075 }) {
  const fullPeople = [0, 1].map(i => Array.from({ length: 18 }, (_, j) => ({ x: .25 + i * .5 + j * .001, y: .2 + j * .03 })));
  const support = i => ({ characterId: `actor${i}`, region: { xStart: i * .5, xEnd: (i + 1) * .5, yStart: .6, yEnd: .9 },
    pelvisAnchor: { x: .25 + i * .5, y: .7 }, torsoAnchor: { x: .25 + i * .5, y: .3 }, contactPlaneY: .76,
    visibleEdge: { xStart: i * .5 + .1, xEnd: i * .5 + .4, y: .76 }, supportKind: "sofa" });
  const relations = [0, 1].map(i => ({ characterId: `actor${i}`, relationId: `r${i}`, required: true, object: i ? "book" : "cup",
    objectCenter: { x: .25 + i * .5, y: .5 }, region: { xStart: i * .5, xEnd: (i + 1) * .5 }, handMode: "two",
    gazeTarget: { kind: "object", point: { x: .25 + i * .5, y: .5 }, targetId: `object${i}` },
    contactAnchors: [{ hand: "left", x: .1, y: .1 }, { hand: "right", x: .2, y: .1 }],
    surfacePlan: { normal: { x: .1, y: -.2 }, exclusionRegions: [{ xStart: .1, xEnd: .2, yStart: .1, yEnd: .2 }] },
  }));
  const scenePlan = { projection: { scale, translate }, fullPeople, projectionHash: "test-hash", interactionTarget: { x: .5, y: .4 },
    relations, supportRelations: [0, 1].map(support),
    people: [0, 1].map(i => ({ characterId: `actor${i}`, anchor: { x: .25 + i * .5, y: .5 }, scale: 1,
      target: relations[i].objectCenter, gazeTarget: relations[i].gazeTarget, supportRelation: support(i),
      headDirection: { target: relations[i].objectCenter, dx: .1, dy: .2, mode: "down" },
      relationTargets: [{ ...relations[i], target: relations[i].objectCenter,
        wristAssignments: [{ hand: "right", joint: 4, x: .2, y: .1 }, { hand: "left", joint: 7, x: .1, y: .1 }] }],
    })),
  };
  return { poseControl: { posePlanVersion: "3.0", fullPeople, scenePlan },
    generationSpec: { repairPasses: { propInteraction: relations[0], propInteractions: relations },
      characterRegions: [0, 1].map(i => ({ characterId: `actor${i}`, region: { xStart: i * .5, xEnd: (i + 1) * .5 } })) },
    references: [0, 1].map(i => ({ characterId: `actor${i}`, role: "identity", region: { xStart: i * .5, xEnd: (i + 1) * .5 } })),
    regionalPrompter: { enabled: true, orientation: "Horizontal", ratios: "1,1" },
  };
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test("legacy recipes with an inside center but clipped prop envelope are rejected",()=>{
  const recipe=fixture(1,{x:0,y:0});
  recipe.generationSpec.repairPasses.propInteractions[0].shape="portrait_rect";
  recipe.generationSpec.repairPasses.propInteractions[0].objectCenter.y=.95;
  assert.throws(()=>compilePoseExecutionV3(recipe.poseControl,recipe.generationSpec.repairPasses),/envelope outside canvas/);
});

test("one projection governs props, contact wrists, gaze and support without mutating full plans", () => {
  for (const scale of [.72, .9, 1.35, 1.65]) {
    const recipe = fixture(scale);
    const before = structuredClone(recipe);
    const t = p => ({ x: (p.x - .5) * scale + .54, y: (p.y - .5) * scale + .425 });
    const execution = compilePoseExecutionV3(recipe.poseControl, recipe.generationSpec.repairPasses);
    assert.deepEqual(recipe, before);
    for (const [i, person] of execution.scenePlan.people.entries()) {
      const original = before.poseControl.scenePlan.people[i];
      close(person.anchor.x, t(original.anchor).x);
      close(person.gazeTarget.point.y, t(original.gazeTarget.point).y);
      close(person.headDirection.target.y, person.gazeTarget.point.y);
      close(person.headDirection.dy, original.headDirection.dy * scale);
      for (const a of person.relationTargets[0].wristAssignments) {
        const expected = t(before.poseControl.fullPeople[i][a.joint]);
        close(a.x, expected.x); close(a.y, expected.y);
      }
      const contract = execution.repairPasses.propInteractions[i];
      close(contract.objectCenter.x, t(original.target).x);
      for (const a of contract.contactAnchors) {
        const expected = t(before.poseControl.fullPeople[i][a.hand === "left" ? 7 : 4]);
        close(a.x, expected.x); close(a.y, expected.y);
      }
      assert.deepEqual(contract.surfacePlan.normal, before.generationSpec.repairPasses.propInteractions[i].surfacePlan.normal);
      close(contract.surfacePlan.exclusionRegions[0].yStart, t({ x: .1, y: .1 }).y);
      const projectedSupport = execution.scenePlan.supportRelations[i];
      close(projectedSupport.contactPlaneY, t({ x: .5, y: .76 }).y);
      close(projectedSupport.visibleEdge.y, projectedSupport.contactPlaneY);
      assert.deepEqual(projectedSupport, person.supportRelation);
    }
  }
});

test("draft/final replay projects once and keeps regional and identity partitions aligned", () => {
  const recipe = fixture();
  const original = structuredClone(recipe.poseControl);
  preparePoseExecutionV3(recipe);
  const once = structuredClone(recipe);
  preparePoseExecutionV3(recipe);
  assert.deepEqual(recipe, once);
  assert.deepEqual(recipe.poseControl, original);
  recipe.references[0].weight = .92;
  recipe.regionalPrompter.prompt = "final stage prompt";
  preparePoseExecutionV3(recipe);
  assert.equal(recipe.references[0].weight, .92);
  assert.equal(recipe.regionalPrompter.prompt, "final stage prompt");
  const regions = recipe.generationSpec.characterRegions.map(r => r.region);
  close(regions[0].xEnd, .54);
  close(regions[1].xStart, .54);
  assert.deepEqual(recipe.references.map(r => r.region), regions);
  recipe.regionalPrompter.ratios.split(",").map(Number).forEach((ratio, i) => close(ratio, regions[i].xEnd - regions[i].xStart));
  // Reprojection uses original full coordinates even after a serialized replay.
  recipe.poseControl.scenePlan.projection.scale = .9;
  preparePoseExecutionV3(recipe);
  close(recipe.generationSpec.repairPasses.propInteractions[0].objectCenter.x, (.25 - .5) * .9 + .54);
});

test("legacy recipes stay unchanged and invalid V3 inputs fail before a request", () => {
  const legacy = fixture(); legacy.poseControl.posePlanVersion = "2.0";
  const copy = structuredClone(legacy);
  preparePoseExecutionV3(legacy);
  assert.deepEqual(legacy, copy);
  for (const scale of [0, NaN, Infinity]) {
    assert.throws(() => preparePoseExecutionV3(fixture(scale)), /finite positive projection/);
  }
  const missing = fixture(); missing.generationSpec.repairPasses.propInteractions[0].characterId = "missing";
  assert.throws(() => preparePoseExecutionV3(missing), /missing.*wrist/);
});

 test("advisory pose policy preserves framing failures and still rejects invalid numeric geometry", () => {
  const recipe = fixture(1, {x:0,y:0});
  recipe.poseControl.scenePlan.projection.composition = "chest_action";
  assert.throws(() => preparePoseExecutionV3(recipe), /framing conflict/);
  recipe.posePreflightPolicy = "advisory";
  preparePoseExecutionV3(recipe);
  assert.ok(recipe.poseExecution.warnings.some(message => message.includes("framing conflict")));
  recipe.poseControl.scenePlan.projection.scale = NaN;
  assert.throws(() => preparePoseExecutionV3(recipe), /finite positive projection/);
});
