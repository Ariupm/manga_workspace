import { callDeepSeekJson } from "./deepseek";
import profileSchema from "../scripts/character-profile.schema.json";

const profileKeys = ["agePresentationEn", "faceShapeEn", "bodyTypeEn", "skinToneEn", "distinguishingFeaturesEn", "temperamentEn", "baseOutfitEn", "baseShoesEn"] as const;
const english = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim()) && !/^(?:unknown|unspecified|n\/a)$/i.test(value.trim()) && !/[\u3400-\u9fff]/u.test(value);

export function validateCharacterProfileDraft(value: unknown) {
  const data = value as Record<string, any> | null;
  if (!data || typeof data !== "object" || typeof data.descriptionCn !== "string" || !data.descriptionCn.trim()
    || !["appearanceEn", "hairColorEn", "hairStyleEn", "eyeColorEn"].every(key => english(data[key]))
    || !Array.isArray(data.invariantsEn) || data.invariantsEn.length < 3 || !data.invariantsEn.every(english)
    || !data.profile || !profileKeys.every(key => english(data.profile[key]))) {
    throw new Error("人物草拟结果缺少完整英文视觉字段，请重试或手工填写。");
  }
  return data;
}

export async function draftCharacterProfile(name: string, conceptCn: string, notes: string) {
  const result = await callDeepSeekJson(
    "Draft a reusable adult manga character profile as a JSON object strictly matching this schema: " + JSON.stringify(profileSchema) + ". All values except descriptionCn must be concise English. Preserve the user's distinguishing identity, clothing and hair details. Propose coherent visual details for unspecified fields; never use empty or unknown placeholders. This is an unconfirmed draft, not permission to save or generate assets.",
    JSON.stringify({ name, conceptCn, notes }),
    { maxTokens: 2400, thinking: "disabled" },
  );
  return { draft: validateCharacterProfileDraft(result.data), provider: "deepseek", model: result.model };
}
