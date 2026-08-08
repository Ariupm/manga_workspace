export type StoryAnalysis = {
  kind: "日常短篇" | "长篇章节" | "长篇素材";
  theme: string;
  emotion: string[];
  characters: string[];
  scenes: string[];
  recommendedPages: number;
  outfitId: string;
  shoeId: string;
  affectsMainline: boolean;
  analysisSource?: "deepseek" | "rules";
  analysisWarning?: string;
  outline?: Array<{ title: string; description: string; emotion: string }>;
  script?: Array<{ scene: string; timeOfDay: string; summary: string; dialogue: string }>;
  panels?: Array<{
    pageNumber: number;
    title: string;
    description: string;
    actionEn: string;
    expressionEn: string;
    gazeEn: string;
    handsEn: string;
    dialogue: string;
    camera: "远景" | "全景" | "中景" | "近景" | "特写";
    scene: string;
    timeOfDay: string;
    characterNames: string[];
  }>;
};

export function analyzeStory(text: string): StoryAnalysis {
  const longSignals = ["伏笔","真相","多年以前","家族","秘密","主线","决战"];
  const materialSignals = ["灵感","以后","将来","有一天也许","设想"];
  const isMaterial = materialSignals.some(x => text.includes(x));
  const isLong = text.length > 180 || longSignals.some(x => text.includes(x));
  const rain = /雨|暴雨|雨伞/.test(text);
  const work = /上班|下班|公司|面试|求职/.test(text);
  const night = /夜|晚/.test(text);
  const characters = ["小粉"];
  if (/陌生女孩|女孩/.test(text)) characters.push("待创建角色：陌生女孩");
  if (/花花/.test(text)) characters.push("花花");
  const scenes = [...new Set([
    work ? "公司或通勤街道" : "日常室内",
    rain ? "雨中的街道" : "",
    night ? "夜间场景" : ""
  ].filter(Boolean))];
  return {
    kind: isMaterial ? "长篇素材" : isLong ? "长篇章节" : "日常短篇",
    theme: rain ? "意外相遇与陌生人的善意" : "平凡日常中的温柔与成长",
    emotion: rain ? ["疲惫","为难","意外","温暖"] : ["平静","期待","小波折","释然"],
    characters,
    scenes,
    recommendedPages: text.length > 260 ? 7 : text.length > 130 ? 6 : 5,
    outfitId: work ? "XF-WORK-01" : "XF-CASUAL-01",
    shoeId: work ? "XF-SHOE-05" : "XF-SHOE-10",
    affectsMainline: isLong,
    analysisSource: "rules",
  };
}
