import assert from "node:assert/strict";
import test from "node:test";
import { applyPoseControlOverrideV3, buildPoseControlV3 } from "../lib/pose-v3";

const shot = (action: string, camera = "medium shot") => ({
  id: 7001, pageId: 1, order: 1, title: "v3 test", description: action,
  actionEn: action, camera: camera, cameraEn: camera, compositionEn: "",
  characterIds: ["actor"], characterLooks: {}, visualSpecConfirmed: true,
  visualSpec: { camera: { shotSize: camera }, characters: [{ characterId: "actor", action, expression: "focused" }] },
} as any);

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
  assert.notEqual(points[4].y, points[7].y, "opposite arms must occupy different swing phases");
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
