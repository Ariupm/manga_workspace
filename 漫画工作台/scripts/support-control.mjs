// Rasterize only geometry that intersects the actual viewport. A floor below
// an upper-body crop is still part of the scene, but must not consume a slot.
export function supportControlPlan(supportRelations = [], width = 512, height = 512) {
  const stroke = Math.max(7, width * .014), visible = [], skipped = [], shapes = [];
  for (const support of supportRelations) {
    const edge = support.visibleEdge || {};
    const x1 = edge.xStart * width, x2 = edge.xEnd * width, y = edge.y * height;
    const cx = support.pelvisAnchor?.x * width;
    const span = x2 - x1;
    if (![x1,x2,y,cx].every(Number.isFinite) || span <= 0 || support.supportKind === 'unknown') {
      skipped.push({supportSurfaceId:support.supportSurfaceId,reason:'invalid_or_unknown_geometry'}); continue;
    }
    const upper = support.supportKind === 'sofa' ? y-height*.035 : support.supportKind === 'bed' ? y-height*.04 : y;
    const lower = ['sofa','bed'].includes(support.supportKind) ? y+height*.08 : support.supportKind === 'chair' ? y+height*.12 : y;
    const left = support.supportKind === 'sofa' ? Math.min(x1,cx) : x1;
    const right = support.supportKind === 'sofa' ? Math.max(x2,cx) : x2;
    const back = support.backEdge;
    const validBack = back && [back.x,back.yStart,back.yEnd].every(Number.isFinite);
    const bounds = validBack ? {left:Math.min(left,back.x*width),right:Math.max(right,back.x*width),upper:Math.min(upper,back.yStart*height),lower:Math.max(lower,back.yEnd*height)} : {left,right,upper,lower};
    if (bounds.right+stroke/2<0 || bounds.left-stroke/2>width || bounds.lower+stroke/2<0 || bounds.upper-stroke/2>height) {
      skipped.push({supportSurfaceId:support.supportSurfaceId,reason:'outside_projected_viewport'}); continue;
    }
    const shape = support.supportKind === 'sofa'
      ? `<path d="M ${x1} ${y} Q ${cx} ${y-height*.035} ${x2} ${y}"/><path d="M ${x1+span*.08} ${y} L ${x1+span*.08} ${y+height*.08}"/><path d="M ${x2-span*.08} ${y} L ${x2-span*.08} ${y+height*.08}"/>`
      : support.supportKind === 'chair'
        ? `<path d="M ${x1} ${y} L ${x2} ${y}"/><path d="M ${x1+span*.12} ${y} L ${x1+span*.2} ${y+height*.12}"/><path d="M ${x2-span*.12} ${y} L ${x2-span*.2} ${y+height*.12}"/>`
        : support.supportKind === 'bed'
          ? `<path d="M ${x1} ${y} L ${x2} ${y}"/><path d="M ${x1} ${y-height*.04} L ${x1} ${y+height*.08}"/>`
          : `<path d="M ${x1} ${y} L ${x2} ${y}"/>`;
    const backShape = validBack
      ? `<path d="M ${back.x*width} ${back.yStart*height} L ${back.x*width} ${back.yEnd*height}"/>` : '';
    visible.push(support); shapes.push((support.supportKind==='wall'?'':shape)+backShape);
  }
  return {visible,skipped,svg:visible.length ? `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><g fill="none" stroke="white" stroke-width="${stroke}" stroke-linecap="round">${shapes.join('')}</g></svg>` : null};
}
