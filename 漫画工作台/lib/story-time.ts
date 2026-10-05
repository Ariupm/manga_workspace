export const englishTime = (value: string) => {
  const times: Array<[RegExp, string]> = [
    [/\bmidnight\b|午夜|子夜/i, "midnight"],
    [/\bdawn\b|\bsunrise\b|黎明|破晓|拂晓|日出/i, "dawn"],
    [/\bdusk\b|\bsunset\b|黄昏|日落/i, "dusk"],
    [/\bnight(?:time)?\b|深夜|夜晚|夜间|晚上|凌晨|雨夜|入夜|半夜|^\s*夜\s*$/i, "night"],
    [/\bevening\b|傍晚|晚间/i, "evening"],
    [/\bnoon\b|\bmidday\b|中午|正午/i, "noon"],
    [/\bafternoon\b|下午|午后/i, "afternoon"],
    [/\bmorning\b|早晨|清晨|早上|上午|^\s*晨\s*$/i, "morning"],
  ];
  return times.find(([pattern]) => pattern.test(value))?.[1] || "daytime";
};
