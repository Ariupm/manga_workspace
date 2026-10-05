/** Explicit user choice; recipes without the policy retain historical behavior. */
export function usesPoseGeometry(recipe = {}) {
  return recipe.poseUsage?.version !== 'pose-usage-1' || recipe.poseUsage.enabled !== false;
}

export function poseUsagePlan(enabled = true) {
  if (typeof enabled !== 'boolean') throw new Error('poseControlEnabled must be boolean');
  return {
    version: 'pose-usage-1', enabled,
    status: enabled ? 'requested' : 'disabled_by_user',
    geometryDependentPasses: enabled ? 'existing_policy' : 'skipped_without_image_localization',
    identityReference: enabled ? 'existing_policy' : 'base_character_region',
    referenceRegionVersion: 'authored-region-1',
  };
}

/** Authored character region only; never invent a face location from disabled Pose. */
export function referenceRegionPlan(recipe, reference) {
  const character = recipe.generationSpec?.characterRegions?.find(item => item.characterId === reference.characterId);
  const region = reference.region || (recipe.poseUsage?.referenceRegionVersion === 'authored-region-1' ? character?.region : null);
  if (!region) return null;
  const {xStart, xEnd} = region;
  if (![xStart, xEnd].every(Number.isFinite) || xStart < 0 || xEnd > 1 || xStart >= xEnd)
    throw new Error('Invalid character reference region');
  const width = recipe.width, height = recipe.height;
  const x = Math.round(xStart * width), right = Math.round(xEnd * width);
  return {shape:'character_region', region:{xStart,xEnd}, source:reference.region ? 'reference.region' : 'characterRegions.characterId',
    bounds:{x,y:0,width:Math.max(1,right-x),height}, normalizedBounds:{x:xStart,y:0,width:xEnd-xStart,height:1}};
}

/** Off means no planned spatial controls or guessed local masks, at any stage. */
export function assertControlPolicyRequest(recipe, payload, context) {
  if (usesPoseGeometry(recipe)) return;
  if (context.stage !== 'base' || payload.mask) throw new Error('Disabled pose: local pass requires independent image localization');
  for (const unit of payload.alwayson_scripts?.ControlNet?.args || []) {
    if (!['identity', 'outfit'].includes(unit.role)) throw new Error('Disabled pose: geometry control cannot be sent');
  }
}
