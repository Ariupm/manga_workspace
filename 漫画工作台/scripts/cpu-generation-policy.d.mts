export function cpuGenerationPolicy(profile: string): { version: string; draftHandDetail: string } | null;
export function deferDraftHandDetail(options: { policy?: { version?: string; draftHandDetail?: string } | null; phase: string; profile: string; contactSucceeded: boolean; relationFailed: boolean }): boolean;
