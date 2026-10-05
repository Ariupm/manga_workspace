/** Local fallback for unplanned shots; confirmed visual specs remain authoritative. */
export const isGenericLocation = (value = "") => !value.trim() || /^(?:unknown|specific (?:everyday|story) location(?: \d+)?|coherent (?:everyday|story) environment|everyday narrative setting)$/i.test(value.trim());

type Location = { locationType: string; location: string; foreground: string; midground: string; background: string };
const locations: Array<{ pattern: RegExp; value: Location }> = [
  { pattern: /快递站|驿站|取件点|快递柜|parcel (?:pickup|collection)|delivery station|post office/i, value: { locationType: "parcel collection facility", location: "parcel pickup station", foreground: "edge of the parcel collection counter", midground: "service counter and storage shelves with delivery parcels", background: "rows of parcel storage shelves and pickup compartments" } },
  { pattern: /书房|study room|home study/i, value: { locationType: "residential interior", location: "home study room", foreground: "desk edge", midground: "writing desk and chair", background: "bookshelves and a window" } },
  { pattern: /卧室|寝室|bedroom/i, value: { locationType: "residential interior", location: "bedroom", foreground: "bedside table edge", midground: "bed and bedside furniture", background: "wardrobe and curtains" } },
  { pattern: /家门|公寓门|门廊|front door|porch/i, value: { locationType: "residential entrance", location: "apartment entrance beside the front door", foreground: "door frame", midground: "front door and entrance landing", background: "residential entrance architecture" } },
  { pattern: /厨房|kitchen/i, value: { locationType: "residential interior", location: "home kitchen", foreground: "counter edge", midground: "worktop and sink", background: "kitchen cabinets and tiled wall" } },
  { pattern: /客厅|living room/i, value: { locationType: "residential interior", location: "home living room", foreground: "coffee table edge", midground: "sofa and rug", background: "window and shelving" } },
  { pattern: /餐厅|餐馆|restaurant|dining room/i, value: { locationType: "dining interior", location: "dining room", foreground: "table edge", midground: "dining tables and chairs", background: "dining room walls and windows" } },
  { pattern: /办公室|公司|办公|office/i, value: { locationType: "workplace", location: "modern office", foreground: "desk edge", midground: "office desks and chairs", background: "office windows and corridor" } },
  { pattern: /车站|地铁|公交|train station|transit station|subway|railway/i, value: { locationType: "public transit setting", location: "transit station", foreground: "platform marking", midground: "waiting area and railings", background: "receding platform architecture" } },
  { pattern: /街道|街边|人行道|街头|道路|通勤|street|sidewalk|road/i, value: { locationType: "urban exterior", location: "city street", foreground: "curb edge", midground: "sidewalk and street furniture", background: "receding buildings and storefronts" } },
  { pattern: /(?:的家|在家|家里|家中)$|^(?:home|someone's home)$/i, value: { locationType: "residential interior", location: "home interior", foreground: "", midground: "", background: "" } },
];

export function resolveStoryLocation(scene = "", sceneEn = ""): Location | null {
  // A supplied English description is more precise than a category template.
  if (!isGenericLocation(sceneEn) && !/[\u3400-\u9fff]/.test(sceneEn)) {
    const category = locations.find(item => item.pattern.test(sceneEn));
    return { locationType: "", foreground: "", midground: "", background: "", ...category?.value, location: sceneEn.trim() };
  }
  if (isGenericLocation(scene)) return null;
  const match = locations.find(item => item.pattern.test(scene));
  if (match) return { ...match.value };
  if (!/[\u3400-\u9fff]/.test(scene)) return { locationType: "", location: scene.trim(), foreground: "", midground: "", background: "" };
  return null;
}
