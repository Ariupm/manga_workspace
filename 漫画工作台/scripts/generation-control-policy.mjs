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
  };
}

/** Off means no planned spatial controls or guessed local masks, at any stage. */
export function assertControlPolicyRequest(recipe, payload, context) {
  if (usesPoseGeometry(recipe)) return;
  if (context.stage !== 'base' || payload.mask) throw new Error('Disabled pose: local pass requires independent image localization');
  for (const unit of payload.alwayson_scripts?.ControlNet?.args || []) {
    if (!['identity', 'outfit'].includes(unit.role)) throw new Error('Disabled pose: geometry control cannot be sent');
  }
}
