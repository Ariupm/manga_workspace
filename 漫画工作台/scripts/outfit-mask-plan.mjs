const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Canvas geometry only. Protected prop bounds must come from the same solver
 * as the later prop pass, not from an independent guessed object position. */
export function outfitMaskPlan({ width, height, person = [], people = [], region = { xStart: 0, xEnd: 1 }, zone, propBounds = [] }) {
  if (!["upper", "lower", "full"].includes(zone) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("Invalid outfit mask inputs");
  if (!Number.isFinite(region.xStart) || !Number.isFinite(region.xEnd) || region.xStart >= region.xEnd) throw new Error("Invalid outfit character region");
  const xStart = clamp(region.xStart, 0, 1), xEnd = clamp(region.xEnd, 0, 1);
  const shoulders = [person[2], person[5]].filter(validPoint);
  // Out-of-frame hips use their projected position when supplied. The V3
  // public skeleton uses -1 sentinels, so absent hips fall back below the frame.
  const hips = [person[8], person[11]].filter(p => p && Number.isFinite(p.y) && p.y >= 0);
  const hipY = hips.length ? Math.max(...hips.map(p => p.y)) : person.length ? 1.08 : .68;
  const left = Math.max(xStart, Math.min(...(shoulders.length ? shoulders.map(p => p.x) : [xStart + .18])) - .12);
  const right = Math.min(xEnd, Math.max(...(shoulders.length ? shoulders.map(p => p.x) : [xEnd - .18])) + .12);
  const top = Math.max(0, (shoulders.length ? Math.min(...shoulders.map(p => p.y)) : .28) - .04);
  const bottom = Math.min(1, Math.max(top + .28, hipY + .3));
  const zoneTop = zone === "lower" ? Math.max(top + .2, hipY - .08) : top;
  const zoneBottom = zone === "upper" ? Math.min(bottom, hipY + .06) : bottom;
  const bounds = { xStart: left, xEnd: right, yStart: zoneTop, yEnd: zoneBottom };
  const protectedRegions = [];
  for (const [personIndex, actor] of people.entries()) {
    if (validPoint(actor[0])) protectedRegions.push({ kind: "ellipse", role: "face", personIndex, x: actor[0].x, y: actor[0].y, rx: .14, ry: .19 });
    for (const joint of [4, 7]) if (validPoint(actor[joint])) {
      const elbow = actor[joint - 1];
      const radius = validPoint(elbow) ? clamp(Math.hypot(actor[joint].x - elbow.x, actor[joint].y - elbow.y) * .4, .045, .095) : .07;
      protectedRegions.push({ kind: "ellipse", role: "hand", personIndex, joint, x: actor[joint].x, y: actor[joint].y, rx: radius, ry: radius });
    }
  }
  for (const box of propBounds) {
    if (![box?.x, box?.y, box?.width, box?.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) throw new Error("Invalid outfit protected prop bounds");
    protectedRegions.push({ ...box, kind: "rect", role: "prop" });
  }
  const empty = right <= left || zoneBottom <= zoneTop || zoneTop >= 1 || zoneBottom <= 0;
  const protections = protectedRegions.map(p => p.kind === "ellipse"
    ? `<ellipse cx="${p.x * width}" cy="${p.y * height}" rx="${p.rx * width}" ry="${p.ry * height}" fill="black"/>`
    : `<rect x="${(p.x - .012) * width}" y="${(p.y - .012) * height}" width="${(p.width + .024) * width}" height="${(p.height + .024) * height}" fill="black"/>`).join("");
  const garment = empty ? "" : `<path d="M ${left * width} ${zoneTop * height} L ${right * width} ${zoneTop * height} L ${Math.min(xEnd, right + .08) * width} ${zoneBottom * height} L ${Math.max(xStart, left - .08) * width} ${zoneBottom * height} Z" fill="white"/>`;
  return { zone, bounds, protectedRegions, empty, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/>${garment}${protections}</svg>` };
}
