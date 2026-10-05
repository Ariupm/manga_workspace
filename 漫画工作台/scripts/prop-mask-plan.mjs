// Object-only passes protect known contact/wrist coordinates. This is geometric
// protection, not a claim that the full hand silhouette has been segmented.
export function propObjectMask({ width, height, objectBounds, contacts = [], people = [], uncertaintyPadding = 0 }) {
  const paddingX = Math.max(3, objectBounds.width * .07);
  const paddingY = Math.max(4, objectBounds.height * .05);
  const padX = paddingX * (uncertaintyPadding ? 2 : 1);
  const padY = paddingY * (uncertaintyPadding ? 2 : 1);
  const points = [...contacts, ...people.flatMap(person => [person?.[4], person?.[7]])]
    .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1);
  const radius = Math.max(5, Math.min(width, height) * .022);
  const protectedContacts = points.map(point => ({ x: point.x * width, y: point.y * height, radius }));
  const disks = protectedContacts.map(point => `<circle cx="${point.x}" cy="${point.y}" r="${point.radius}" fill="black"/>`).join("");
  return {
    protectedContacts,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><rect x="${objectBounds.x-padX}" y="${objectBounds.y-padY}" width="${objectBounds.width+padX*2}" height="${objectBounds.height+padY*2}" rx="${Math.max(8,objectBounds.width*.1)}" fill="white"/>${disks}</svg>`,
  };
}
