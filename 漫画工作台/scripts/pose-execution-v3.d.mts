import type { PoseControlV3, PoseScenePlanV3 } from "../lib/pose-v3/schema";
import type { buildRegionalPrompt } from "../lib/prompts";
type RepairPasses = ReturnType<typeof buildRegionalPrompt>["repairPasses"];
export type PoseExecutionV3 = {
  coordinateSpace: "projected_canvas";
  framingMode: "upper_body" | "full_body";
  projectionHash: string | null;
  warnings: string[];
  sourceRepairPasses: RepairPasses;
  scenePlan: PoseScenePlanV3 & { coordinateSpace: "projected_canvas" };
  repairPasses: RepairPasses;
};
export function compilePoseExecutionV3(control: PoseControlV3, repairPasses?: Partial<RepairPasses>, options?:{advisory?:boolean}): PoseExecutionV3;
export function preparePoseExecutionV3<T>(recipe: T): T & { poseExecution?: PoseExecutionV3 };
