export function draftHasHardFailure(recipe?: { pixelQa?: { status?: string }; semanticQa?: { status?: string }; postprocessWarnings?: string[] }): boolean;
export const generationHasHardFailure: typeof draftHasHardFailure;
