// Freeze this policy in new recipes; historical jobs keep their pass schedule.
export function cpuGenerationPolicy(profile) {
  return ["cpu_local_fast", "cpu_local_complex"].includes(profile)
    ? { version: "cpu-generation-1", draftHandDetail: "after_contact_defer_to_final" }
    : null;
}

export function deferDraftHandDetail({ policy, phase, profile, contactSucceeded, relationFailed }) {
  return policy?.version === "cpu-generation-1"
    && policy.draftHandDetail === "after_contact_defer_to_final"
    && ["cpu_local_fast", "cpu_local_complex"].includes(profile)
    && phase === "draft" && contactSucceeded === true && relationFailed === false;
}
