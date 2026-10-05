export function propBodySizePlan(input?: {
  shape?: string; orientation?: string; contactSpan?: number;
  hasPoseContact?: boolean; regionWidth?: number;
}): { width: number; height: number; envelope: { width: number; height: number } };
