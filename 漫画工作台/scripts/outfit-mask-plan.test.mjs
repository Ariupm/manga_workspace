import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { outfitMaskPlan } from "./outfit-mask-plan.mjs";

const actor = x => {
  const p = Array.from({ length: 18 }, () => ({ x: -1, y: -1 }));
  p[0] = { x, y: .16 }; p[1] = { x, y: .29 };
  p[2] = { x: x - .1, y: .32 }; p[5] = { x: x + .1, y: .32 };
  p[3] = { x: x - .1, y: .6 }; p[6] = { x: x + .1, y: .6 };
  p[4] = { x: x - .055, y: .49 }; p[7] = { x: x + .055, y: .49 };
  p[8] = { x: x - .065, y: .69 }; p[11] = { x: x + .065, y: .69 };
  return p;
};

test("outfit masks preserve face, both hands and each prop at different actor positions", async () => {
  for (const x of [.25, .5, .75]) for (const zone of ["upper", "lower", "full"]) {
    const person = actor(x);
    const people = [person, actor(x === .25 ? .75 : .25)];
    const region = x === .5 ? { xStart: 0, xEnd: 1 } : x < .5 ? { xStart: 0, xEnd: .5 } : { xStart: .5, xEnd: 1 };
    const propBounds = [{ x: x - .035, y: .43, width: .07, height: .14 }];
    const input = { width: 512, height: 512, person, people, region, zone, propBounds };
    const before = JSON.stringify(input);
    const plan = outfitMaskPlan(input);
    const { data, info } = await sharp(Buffer.from(plan.svg)).greyscale().raw().toBuffer({ resolveWithObject: true });
    const pixel = (px, py) => data[(Math.floor(py * 512) * 512 + Math.floor(px * 512)) * info.channels];
    for (const point of [person[0], person[4], person[7], { x, y: .49 }]) assert.equal(pixel(point.x, point.y), 0, `${x}/${zone} protected point`);
    assert.equal(pixel(x, zone === "lower" ? .84 : .38), 255, `${x}/${zone} editable garment`);
    if (x !== .5) assert.equal(pixel(x === .25 ? .8 : .2, .55), 0, "other character region unchanged");
    assert.equal(JSON.stringify(input), before);
  }
});

test("cropped lower garment is skipped and invalid protection fails explicitly", () => {
  const person = actor(.5);
  person[8] = person[11] = { x: -1, y: -1 };
  const options = { width: 512, height: 512, person, people: [person] };
  assert.equal(outfitMaskPlan({ ...options, zone: "lower" }).empty, true);
  assert.equal(outfitMaskPlan({ ...options, zone: "upper" }).empty, false);
  assert.throws(() => outfitMaskPlan({ ...options, zone: "upper", propBounds: [{ x: NaN, y: .4, width: .1, height: .1 }] }), /prop bounds/);
  assert.throws(() => outfitMaskPlan({ ...options, zone: "upper", region: { xStart: .8, xEnd: .2 } }), /region/);
});
