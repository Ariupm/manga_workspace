import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { propObjectMask } from "./prop-mask-plan.mjs";

test("object-only masks keep projected contacts and other actors' wrists black", async () => {
  for (const center of [.25, .5, .75]) {
    for (const span of [.08, .3]) {
      const width = 512, height = 512;
      const contacts = [{ x: center-span/2, y: .65 }, { x: center+span/2, y: .65 }];
      const people = [Array(18).fill(null), Array(18).fill(null)];
      people[1][4] = { x: center, y: .7 };
      const plan = propObjectMask({ width, height, objectBounds: { x: (center-span/2)*width, y: .55*height, width: span*width, height: .2*height }, contacts, people });
      const { data, info } = await sharp(Buffer.from(plan.svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const value = (x,y) => data[(Math.round(y)*width+Math.round(x))*info.channels];
      for (const point of [...contacts, people[1][4]]) assert.equal(value(point.x*width,point.y*height), 0);
      assert.equal(value(center*width,.6*height), 255, "object interior remains editable");
      assert.equal(value(0,0), 0, "background stays protected");
    }
  }
});

test("hidden and invalid wrist points cannot move the object mask", () => {
  const args = { width: 512, height: 512, objectBounds: { x: 190, y: 200, width: 120, height: 100 } };
  const person = Array(18).fill(null); person[4] = { x: -1, y: -1 }; person[7] = { x: NaN, y: .5 };
  assert.equal(propObjectMask({ ...args, people: [person] }).svg, propObjectMask(args).svg);
});
