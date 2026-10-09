// Explicit experiment only: remove head joints from an existing control map.
// No generation request or production/database writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';

async function main() {
  const [requestFile, recipeFile, outputDirectory] = process.argv.slice(2);
  if (!requestFile || !recipeFile || !outputDirectory) throw Error('Usage: request.json recipe-payload.json new-output-directory');
  const request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
  const recipe = JSON.parse(fs.readFileSync(recipeFile, 'utf8')).recipe;
  const pose = recipe.poseControl;
  const units = request.alwayson_scripts?.ControlNet?.args || [];
  const matches = units.filter((unit: { model?: string }) => /openpose/i.test(unit.model || ''));
  assert.equal(matches.length, 1, 'Exactly one OpenPose unit required');
  assert.equal(pose.posePlanVersion, '3.0');
  assert.equal(request.width, pose.width);
  assert.equal(request.height, pose.height);
  // Use the frozen SVG, not a current re-render of a historical recipe.
  const originalSvg = pose.svg;
  const original = await sharp(Buffer.from(originalSvg)).ensureAlpha().raw().toBuffer();
  const saved = await sharp(Buffer.from(matches[0].image, 'base64')).ensureAlpha().raw().toBuffer();
  assert.ok(original.equals(saved), 'Frozen SVG must reproduce the saved control pixels before ablation');
  const headJoints = new Set([0, 14, 15, 16, 17]);
  const normalizedHeadPoints = pose.people.flatMap((person: Array<{x:number;y:number}>) => person.filter((_, index) => headJoints.has(index)));
  assert.ok(normalizedHeadPoints.every((point: {x:number;y:number}) => Number.isFinite(point.x) && Number.isFinite(point.y) && !(point.x === -1 && point.y === -1)), 'Head joints must be available; sentinel coordinates cannot identify SVG primitives');
  const headPoints = normalizedHeadPoints.map((point: {x:number;y:number}) => ({ x: point.x * pose.width, y: point.y * pose.height }));
  const isHead = (x: number, y: number) => headPoints.some((p: {x:number;y:number}) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6);
  let removedCircles = 0, removedEdges = 0;
  const svg = originalSvg.replace(/<(circle|line)\b[^>]*\/>/g, (element: string, kind: string) => {
    const attrs = Object.fromEntries([...element.matchAll(/([a-z][a-z0-9_-]*)="([^"]*)"/gi)].map(match => [match[1], match[2]]));
    const remove = kind === 'circle' ? isHead(Number(attrs.cx), Number(attrs.cy)) : isHead(Number(attrs.x1), Number(attrs.y1)) || isHead(Number(attrs.x2), Number(attrs.y2));
    if (remove) { if (kind === 'circle') removedCircles++; else removedEdges++; }
    return remove ? '' : element;
  });
  assert.ok(removedCircles > 0 && removedEdges > 0, 'No head primitives matched');
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  matches[0].image = png.toString('base64');
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'body-only-control.png'), png, { flag: 'wx' });
  fs.writeFileSync(path.join(outputDirectory, 'body-only-cases.json'), JSON.stringify([{
    name: 'identity-body-pose',
    description: 'Only OpenPose image changes: omit nose/eyes/ears and their edges for all actors; original body geometry, identity mask/reference and scalar settings preserved. Baseline control pixels verified identical before editing.',
    request,
  }]), { flag: 'wx' });
  console.log(JSON.stringify({ outputDirectory, removedJoints: [...headJoints], removedCircles, removedEdges, actors: pose.people.length, originalPixelMatch: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
