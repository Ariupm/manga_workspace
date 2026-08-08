import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  Asset,
  Candidate,
  Character,
  ComicPage,
  GenerationJob,
  PageLayout,
  Shot,
  StudioData,
  TextLayer,
  Timeline,
} from "./types";
import { buildGenerationPrompt } from "./prompts";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";
const db = new DatabaseSync(
  process.env.STUDIO_DB_PATH === ":memory:" || isProductionBuild
    ? ":memory:"
    : path.join(dataDir, "studio.db"),
);
db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

const schema = `
CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', cover_path TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', updated_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT NOT NULL DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS episodes (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, synopsis TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT '', FOREIGN KEY(project_id) REFERENCES projects(id));
CREATE TABLE IF NOT EXISTS pages (id INTEGER PRIMARY KEY, episode_id INTEGER NOT NULL, number INTEGER NOT NULL, title TEXT NOT NULL, layout TEXT NOT NULL DEFAULT 'grid', FOREIGN KEY(episode_id) REFERENCES episodes(id));
CREATE TABLE IF NOT EXISTS shots (id INTEGER PRIMARY KEY, page_id INTEGER NOT NULL, position INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, dialogue TEXT NOT NULL DEFAULT '', camera TEXT NOT NULL DEFAULT '中景', character_ids TEXT NOT NULL DEFAULT '[]', scene TEXT NOT NULL DEFAULT '', time_of_day TEXT NOT NULL DEFAULT '', outfit_id TEXT NOT NULL DEFAULT '', shoe_id TEXT NOT NULL DEFAULT '', locked INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft', FOREIGN KEY(page_id) REFERENCES pages(id));
CREATE TABLE IF NOT EXISTS candidates (id INTEGER PRIMARY KEY, shot_id INTEGER NOT NULL, image_path TEXT NOT NULL, label TEXT NOT NULL, version INTEGER NOT NULL, selected INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(shot_id) REFERENCES shots(id));
CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS timeline (id INTEGER PRIMARY KEY, episode_id INTEGER NOT NULL, sequence INTEGER NOT NULL, label TEXT NOT NULL, time_of_day TEXT NOT NULL, outfit_id TEXT NOT NULL, shoe_id TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', FOREIGN KEY(episode_id) REFERENCES episodes(id));
CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, shot_id INTEGER NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS text_layers (id INTEGER PRIMARY KEY, page_id INTEGER NOT NULL, shot_id INTEGER, type TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', x REAL NOT NULL DEFAULT 62, y REAL NOT NULL DEFAULT 8, width REAL NOT NULL DEFAULT 32, height REAL NOT NULL DEFAULT 16, font_family TEXT NOT NULL DEFAULT 'Microsoft YaHei', font_size REAL NOT NULL DEFAULT 18, color TEXT NOT NULL DEFAULT '#222222', background TEXT NOT NULL DEFAULT '#ffffff', border_color TEXT NOT NULL DEFAULT '#222222', rotation REAL NOT NULL DEFAULT 0, z_index INTEGER NOT NULL DEFAULT 10, hidden INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(page_id) REFERENCES pages(id), FOREIGN KEY(shot_id) REFERENCES shots(id));
CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, name TEXT NOT NULL, description_cn TEXT NOT NULL DEFAULT '', appearance_en TEXT NOT NULL DEFAULT '', invariants_en TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'draft');
CREATE TABLE IF NOT EXISTS character_references (id INTEGER PRIMARY KEY, character_id TEXT NOT NULL, type TEXT NOT NULL, path TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(character_id) REFERENCES characters(id));
CREATE TABLE IF NOT EXISTS character_asset_jobs (id INTEGER PRIMARY KEY, character_id TEXT NOT NULL, asset_type TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'codex-imagegen', status TEXT NOT NULL DEFAULT 'queued', prompt TEXT NOT NULL, negative_prompt TEXT NOT NULL DEFAULT '', master_reference_id INTEGER, error TEXT NOT NULL DEFAULT '', stage TEXT NOT NULL DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(character_id) REFERENCES characters(id));
CREATE TABLE IF NOT EXISTS character_asset_candidates (id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL, character_id TEXT NOT NULL, asset_type TEXT NOT NULL, path TEXT NOT NULL, selected INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(job_id) REFERENCES character_asset_jobs(id), FOREIGN KEY(character_id) REFERENCES characters(id));
CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS story_materials (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, analysis_json TEXT NOT NULL DEFAULT '{}', created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(project_id) REFERENCES projects(id));
CREATE TABLE IF NOT EXISTS series_memory (project_id INTEGER PRIMARY KEY, content TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(project_id) REFERENCES projects(id));
CREATE TABLE IF NOT EXISTS visual_planning_failures (id INTEGER PRIMARY KEY, episode_id INTEGER NOT NULL, shot_id INTEGER, action TEXT NOT NULL, error_code TEXT NOT NULL DEFAULT '', error_summary TEXT NOT NULL DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(episode_id) REFERENCES episodes(id));
`;
db.exec(schema);

function ensureEpisodeColumns() {
  const columns = new Set(
    (
      db.prepare("PRAGMA table_info(episodes)").all() as Array<{ name: string }>
    ).map((row) => row.name),
  );
  const additions = [
    ["raw_material", "TEXT NOT NULL DEFAULT ''"],
    ["analysis_json", "TEXT NOT NULL DEFAULT '{}'"],
    ["outline_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["script_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["created_at", "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [name, type] of additions)
    if (!columns.has(name))
      db.exec(`ALTER TABLE episodes ADD COLUMN ${name} ${type}`);
}
ensureEpisodeColumns();
ensureColumns("projects", [
  ["description", "TEXT NOT NULL DEFAULT ''"],
  ["cover_path", "TEXT NOT NULL DEFAULT ''"],
  ["status", "TEXT NOT NULL DEFAULT 'active'"],
  ["updated_at", "TEXT NOT NULL DEFAULT ''"],
  ["notes", "TEXT NOT NULL DEFAULT ''"],
]);
ensureColumns("episodes", [
  ["visual_plan_json", "TEXT NOT NULL DEFAULT 'null'"],
  ["visual_plan_version", "INTEGER NOT NULL DEFAULT 0"],
  ["visual_plan_confirmed", "INTEGER NOT NULL DEFAULT 0"],
  ["visual_plan_meta_json", "TEXT NOT NULL DEFAULT '{}'"],
]);

function ensureColumns(table: string, additions: Array<[string, string]>) {
  const columns = new Set(
    (
      db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    ).map((row) => row.name),
  );
  for (const [name, type] of additions)
    if (!columns.has(name))
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
}
ensureColumns("pages", [["layout_json", "TEXT NOT NULL DEFAULT '{}'"]]);
ensureColumns("shots", [
  ["expression_en", "TEXT NOT NULL DEFAULT 'gentle, natural expression'"],
  ["action_en", "TEXT NOT NULL DEFAULT ''"],
  ["scene_en", "TEXT NOT NULL DEFAULT ''"],
  ["camera_en", "TEXT NOT NULL DEFAULT 'medium shot'"],
  ["lighting_en", "TEXT NOT NULL DEFAULT 'soft cinematic lighting'"],
  ["composition_en", "TEXT NOT NULL DEFAULT 'clear storytelling composition'"],
  [
    "negative_prompt_en",
    "TEXT NOT NULL DEFAULT 'low quality, blurry, deformed anatomy, bad hands, extra fingers, child, chibi, inconsistent face, wrong hair color, wrong outfit, text, letters, watermark, logo'",
  ],
  ["crop_x", "REAL NOT NULL DEFAULT 50"],
  ["crop_y", "REAL NOT NULL DEFAULT 50"],
  ["crop_scale", "REAL NOT NULL DEFAULT 1"],
  ["layout_col_span", "INTEGER NOT NULL DEFAULT 1"],
  ["layout_row_span", "INTEGER NOT NULL DEFAULT 1"],
  ["environment_json", "TEXT NOT NULL DEFAULT '{}'"],
  ["character_looks_json", "TEXT NOT NULL DEFAULT '{}'"],
  ["generation_width", "INTEGER NOT NULL DEFAULT 512"],
  ["generation_height", "INTEGER NOT NULL DEFAULT 512"],
  ["visual_spec_json", "TEXT NOT NULL DEFAULT 'null'"],
  ["visual_spec_source", "TEXT NOT NULL DEFAULT 'rules'"],
  ["visual_spec_version", "INTEGER NOT NULL DEFAULT 0"],
  ["visual_spec_confirmed", "INTEGER NOT NULL DEFAULT 0"],
  ["visual_spec_dependency_hash", "TEXT NOT NULL DEFAULT ''"],
  ["visual_spec_meta_json", "TEXT NOT NULL DEFAULT '{}'"],
]);
ensureColumns("characters", [
  ["visual_traits_json", "TEXT NOT NULL DEFAULT '{}'"],
  ["concept_cn", "TEXT NOT NULL DEFAULT ''"],
  ["notes", "TEXT NOT NULL DEFAULT ''"],
  ["profile_json", "TEXT NOT NULL DEFAULT '{}'"],
  ["profile_status", "TEXT NOT NULL DEFAULT 'draft'"],
  ["profile_version", "INTEGER NOT NULL DEFAULT 1"],
  ["identity_master_reference_id", "INTEGER"],
]);
ensureColumns("assets", [
  ["character_id", "TEXT NOT NULL DEFAULT 'character_xiaofen'"],
  ["visual_description_en", "TEXT NOT NULL DEFAULT ''"],
  ["default_shoe_id", "TEXT NOT NULL DEFAULT ''"],
  ["confirmed", "INTEGER NOT NULL DEFAULT 1"],
  ["quality_status", "TEXT NOT NULL DEFAULT 'unknown'"],
]);
ensureColumns("jobs", [
  ["updated_at", "TEXT NOT NULL DEFAULT ''"],
  ["progress", "REAL NOT NULL DEFAULT 0"],
  ["error", "TEXT NOT NULL DEFAULT ''"],
  ["stage", "TEXT NOT NULL DEFAULT ''"],
]);
db.prepare("DELETE FROM jobs WHERE provider='mock'").run();
db.prepare("DELETE FROM jobs WHERE status='cancelled'").run();
db.prepare(
  "UPDATE jobs SET error='旧版连接等待超过5分钟后超时；SD已完成采样但响应未能回写' WHERE provider='sd-webui' AND status='failed' AND error='fetch failed'",
).run();

function migrateContent() {
  db.prepare(
    "INSERT OR IGNORE INTO characters(id,name,description_cn,appearance_en,invariants_en,status) VALUES(?,?,?,?,?,?)",
  ).run(
    "character_xiaofen",
    "小粉",
    "成年女性，粉色长发，温柔而有内在力量",
    "adult woman, waist-length layered soft pink hair, airy side-swept bangs, warm pink-brown eyes, gentle oval face",
    JSON.stringify([
      "adult woman",
      "pink hair",
      "warm pink-brown eyes",
      "gentle oval face",
    ]),
    "ready",
  );
  const xiaofenFace = path.join(
    process.cwd(),
    "..",
    "角色资产",
    "小粉",
    "00-原始参考图.png",
  );
  if (fs.existsSync(xiaofenFace))
    db.prepare(
      `INSERT INTO character_references(character_id,type,path,confirmed)
    SELECT 'character_xiaofen','face',?,1 WHERE NOT EXISTS(
      SELECT 1 FROM character_references WHERE character_id='character_xiaofen' AND type='face' AND confirmed=1
    )`,
    ).run("../角色资产/小粉/00-原始参考图.png");
  db.prepare(
    "UPDATE characters SET visual_traits_json=? WHERE id='character_xiaofen' AND (visual_traits_json='' OR visual_traits_json='{}')",
  ).run(
    JSON.stringify({
      hairColorEn: "soft pink hair",
      hairStyleEn: "waist-length layered hair with airy side-swept bangs",
      eyeColorEn: "warm pink-brown eyes",
    }),
  );
  db.prepare(`UPDATE characters SET
    name='小泠',
    description_cn='成年女性配角，冷静温柔，与小粉形成清晰视觉区分',
    concept_cn=CASE WHEN concept_cn='' THEN '雨天向小粉递伞的成年女性，冷静温柔，银灰长直发和蓝眼' ELSE concept_cn END,
    appearance_en='adult woman, gentle cool-toned oval face, fair neutral skin, slender balanced build, long straight silver-gray hair, airy side-parted bangs, clear blue eyes, calm and kind presence',
    invariants_en=?,
    visual_traits_json=?,
    profile_json=?,
    profile_status='confirmed'
    WHERE id='character_story_1785412662713_1' AND name='陌生女孩'`).run(
      JSON.stringify(['adult woman','long straight silver-gray hair','airy side-parted bangs','clear blue eyes','distinct identity from Xiaofen','stable face and body proportions']),
      JSON.stringify({hairColorEn:'silver-gray hair',hairStyleEn:'long straight hair with airy side-parted bangs',eyeColorEn:'clear blue eyes'}),
      JSON.stringify({agePresentationEn:'adult woman in her twenties',faceShapeEn:'gentle cool-toned oval face',bodyTypeEn:'slender balanced build',skinToneEn:'fair neutral skin',distinguishingFeaturesEn:'clear blue eyes and long silver-gray hair',temperamentEn:'calm, kind and quietly reassuring',baseOutfitEn:'light gray-blue trench coat, white inner top and navy skirt',baseShoesEn:'dark low-heeled rain-ready commuting shoes'}),
    );
  const descriptions: Record<string, string> = {
    character_xiaofen:
      "adult woman, canonical face, waist-length layered soft pink hair, airy side-swept bangs, warm pink-brown eyes, gentle oval face",
    "XF-SLEEP-02":
      "soft pink short-sleeve rabbit-print pajamas with cropped lounge pants",
    "XF-WORK-01":
      "elegant pink office dress with a neat white collar and refined tailoring",
    "XF-CASUAL-01": "cream-yellow top with a soft pink midi skirt",
    "XF-SHOE-02": "pink cross-strap indoor slippers",
  };
  for (const [id, description] of Object.entries(descriptions))
    db.prepare(
      "UPDATE assets SET visual_description_en=? WHERE id=? AND visual_description_en=''",
    ).run(description, id);
  db.prepare(
    `INSERT INTO text_layers(page_id,shot_id,type,text)
    SELECT shots.page_id,shots.id,'speech',shots.dialogue FROM shots
    WHERE shots.dialogue<>'' AND NOT EXISTS(SELECT 1 FROM text_layers WHERE text_layers.shot_id=shots.id AND text_layers.type='speech')`,
  ).run();
  const isolated = db
    .prepare(
      "SELECT value FROM app_meta WHERE key='isolated_project_candidates_v1'",
    )
    .get();
  if (!isolated) {
    db.prepare(
      `DELETE FROM candidates WHERE shot_id IN (
      SELECT shots.id FROM shots JOIN pages ON pages.id=shots.page_id JOIN episodes ON episodes.id=pages.episode_id WHERE episodes.project_id<>1
    )`,
    ).run();
    db.prepare(
      "UPDATE shots SET status='draft' WHERE page_id IN (SELECT pages.id FROM pages JOIN episodes ON episodes.id=pages.episode_id WHERE episodes.project_id<>1)",
    ).run();
    db.prepare(
      "INSERT INTO app_meta(key,value) VALUES('isolated_project_candidates_v1',CURRENT_TIMESTAMP)",
    ).run();
  }
  const catalogPath = path.join(
    process.cwd(),
    "..",
    "角色资产",
    "小粉",
    "asset-catalog.json",
  );
  if (fs.existsSync(catalogPath)) {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as any;
    const outfitDescriptions: Record<string, string> = {
      "XF-SLEEP-01": "soft floral summer nightdress",
      "XF-SLEEP-02":
        "soft pink rabbit-print short-sleeve pajamas with cropped pants",
      "XF-WORK-01": "white short-sleeve blouse tucked into a dusty-pink calf-length A-line skirt, slim brown waist belt, nude-pink low heels and a structured brown shoulder bag",
      "XF-WORK-02": "light gray tailored blazer with wide-leg trousers",
      "XF-WORK-03": "gray-blue belted shirt dress",
      "XF-WORK-04": "ivory knit top with a navy midi skirt",
      "XF-CASUAL-01": "cream-yellow top with a soft pink midi skirt",
      "XF-CASUAL-02": "mint knit top with ivory wide-leg trousers",
      "XF-CASUAL-03": "pink and white floral summer dress",
    };
    const groups = Object.values(catalog.wardrobe ?? {}) as any[];
    for (const item of groups.flat())
      db.prepare(
        "INSERT OR IGNORE INTO assets(id,type,name,path,tags,character_id,visual_description_en,confirmed) VALUES(?,?,?,?,?,?,?,1)",
      ).run(
        item.id,
        "outfit",
        item.name,
        `../角色资产/小粉/${item.source}`,
        JSON.stringify(["小粉", "服装", `位置${item.position}`]),
        "character_xiaofen",
        outfitDescriptions[item.id] || "coherent adult women's outfit",
      );
    db.prepare("UPDATE assets SET visual_description_en=? WHERE id='XF-WORK-01'").run(
      outfitDescriptions["XF-WORK-01"],
    );
    for (const item of groups.flat())
      db.prepare("UPDATE assets SET default_shoe_id=? WHERE id=?").run(
        item.defaultShoes?.[0] ?? "",
        item.id,
      );
    const shoeDescriptions: Record<string, string> = {
      home_slippers: "soft indoor slippers",
      summer_sandals: "delicate summer sandals",
      work_heels: "elegant low-heeled office shoes",
      work_flats: "refined flat office shoes",
      casual_flats: "comfortable casual flats",
      sneakers: "clean casual sneakers",
      summer_flats: "light woven summer flats",
    };
    for (const item of catalog.footwear ?? [])
      db.prepare(
        "INSERT OR IGNORE INTO assets(id,type,name,path,tags,character_id,visual_description_en,confirmed) VALUES(?,?,?,?,?,?,?,1)",
      ).run(
        item.id,
        "shoes",
        item.name,
        `../角色资产/小粉/${item.source}`,
        JSON.stringify(["小粉", "鞋履", item.category, `位置${item.position}`]),
        "character_xiaofen",
        shoeDescriptions[item.category] || "matching adult footwear",
      );
    for (const item of [...groups.flat(), ...(catalog.footwear ?? [])]) {
      const splitPath = `workspace/assets/xiaofen/${item.id}.png`;
      if (fs.existsSync(path.join(process.cwd(), splitPath)))
        db.prepare("UPDATE assets SET path=?,confirmed=1 WHERE id=?").run(
          splitPath,
          item.id,
        );
    }
  }
  if (
    !db
      .prepare("SELECT value FROM app_meta WHERE key='deduplicate_projects_v1'")
      .get()
  ) {
    const duplicates = db
      .prepare(
        "SELECT title,MIN(id) keep_id FROM projects GROUP BY title HAVING COUNT(*)>1",
      )
      .all() as Array<{ title: string; keep_id: number }>;
    for (const duplicate of duplicates) {
      const ids = db
        .prepare("SELECT id FROM projects WHERE title=? AND id<>?")
        .all(duplicate.title, duplicate.keep_id) as Array<{ id: number }>;
      for (const item of ids) {
        db.prepare("UPDATE episodes SET project_id=? WHERE project_id=?").run(
          duplicate.keep_id,
          item.id,
        );
        db.prepare(
          "UPDATE story_materials SET project_id=? WHERE project_id=?",
        ).run(duplicate.keep_id, item.id);
        db.prepare("DELETE FROM projects WHERE id=?").run(item.id);
      }
    }
    db.prepare(
      "INSERT INTO app_meta(key,value) VALUES('deduplicate_projects_v1',CURRENT_TIMESTAMP)",
    ).run();
  }
  db.prepare(
    `UPDATE assets SET quality_status=CASE
    WHEN type='character' THEN 'complete_identity'
    WHEN type='shoes' THEN 'partial_footwear'
    WHEN type='outfit' AND (name LIKE '%套%' OR name LIKE '%裙%' OR name LIKE '%装%') THEN 'complete_outfit'
    ELSE 'partial_outfit' END WHERE quality_status='unknown'`,
  ).run();
  if (
    !db
      .prepare(
        "SELECT value FROM app_meta WHERE key='expand_legacy_episodes_v1'",
      )
      .get()
  ) {
    const legacy = db
      .prepare(
        "SELECT episodes.id,COUNT(pages.id) page_count FROM episodes LEFT JOIN pages ON pages.episode_id=episodes.id GROUP BY episodes.id HAVING COUNT(pages.id)<5",
      )
      .all() as Array<{ id: number; page_count: number }>;
    for (const episode of legacy) {
      for (
        let pageNumber = episode.page_count + 1;
        pageNumber <= 5;
        pageNumber++
      ) {
        const page = db
          .prepare(
            "INSERT INTO pages(episode_id,number,title,layout) VALUES(?,?,?,'dynamic')",
          )
          .run(episode.id, pageNumber, `兼容迁移 · 第 ${pageNumber} 页`);
        const pageId = Number(page.lastInsertRowid);
        for (let position = 1; position <= 6; position++)
          db.prepare(
            "INSERT INTO shots(page_id,position,title,description,camera,character_ids,status) VALUES(?,?,?,?,?,?,?)",
          ).run(
            pageId,
            position,
            `待补分镜 ${position}`,
            "旧章节兼容迁移新增的空白分格，请根据原剧情补充动作与镜头。",
            position % 3 === 1 ? "远景" : position % 3 === 2 ? "中景" : "近景",
            JSON.stringify(["character_xiaofen"]),
            "draft",
          );
      }
    }
    db.prepare(
      "INSERT INTO app_meta(key,value) VALUES('expand_legacy_episodes_v1',CURRENT_TIMESTAMP)",
    ).run();
  }
}

function repairNarrativeCharacterBindings() {
  const episodeRows = db
    .prepare("SELECT id, analysis_json FROM episodes")
    .all() as Array<{ id: number; analysis_json: string }>;
  const findCharacter = db.prepare("SELECT id FROM characters WHERE name=?");
  const shotsForEpisode = db.prepare(
    "SELECT shots.id,shots.title,shots.description,shots.dialogue,shots.scene,shots.character_ids FROM shots JOIN pages ON pages.id=shots.page_id WHERE pages.episode_id=?",
  );
  const updateShot = db.prepare("UPDATE shots SET character_ids=? WHERE id=?");
  for (const episode of episodeRows) {
    let names: string[] = [];
    try {
      const analysis = JSON.parse(episode.analysis_json || "{}") as {
        characters?: string[];
      };
      names = (analysis.characters || [])
        .map((name) => String(name).replace(/^待创建角色[：:]\s*/, "").trim())
        .filter(Boolean);
    } catch {}
    if (!names.includes("小粉")) names.unshift("小粉");
    const episodeCharacters = names
      .map((name) => ({
        name,
        id: (findCharacter.get(name) as { id?: string } | undefined)?.id,
      }))
      .filter((item): item is { name: string; id: string } => Boolean(item.id));
    for (const shot of shotsForEpisode.all(episode.id) as Array<{
      id: number;
      title: string;
      description: string;
      dialogue: string;
      scene: string;
      character_ids: string;
    }>) {
      const text = `${shot.title} ${shot.description} ${shot.dialogue} ${shot.scene}`;
      let ids: string[] = [];
      try {
        ids = JSON.parse(shot.character_ids || "[]") as string[];
      } catch {}
      const next = new Set(ids);
      for (const character of episodeCharacters)
        if (character.name === "小粉" || text.includes(character.name))
          next.add(character.id);
      if (
        /两个人|两人|二人|她们|双方|一起并肩|two (?:women|girls|characters|people)|both women/i.test(
          text,
        ) &&
        episodeCharacters.length === 2
      )
        episodeCharacters.forEach((character) => next.add(character.id));
      const repaired = [...next];
      if (JSON.stringify(repaired) !== JSON.stringify(ids))
        updateShot.run(JSON.stringify(repaired), shot.id);
    }
  }
}

function seedIfEmpty() {
  const count = (
    db.prepare("SELECT COUNT(*) c FROM projects").get() as { c: number }
  ).c;
  if (count) return;
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO projects(id,title) VALUES(1,?)").run("小粉求职记");
    db.prepare(
      "INSERT INTO episodes(id,project_id,title,kind,synopsis) VALUES(1,1,?,?,?)",
    ).run(
      "第五章 · 求职日常",
      "long",
      "小粉在新家展开规律又略显焦虑的求职日常，从清晨醒来到夜晚入睡。",
    );
    db.prepare(
      "INSERT INTO pages(id,episode_id,number,title,layout) VALUES(1,1,6,?,?)",
    ).run("求职 · 循环", "five");
    const shots = [
      [
        "吃包子",
        "坐在餐桌前手持包子吃早餐，清晨室内柔光。",
        "先吃饱，今天一定会有好消息。",
        "中景",
        "餐厅",
        "清晨",
      ],
      [
        "上午刷招聘",
        "坐在桌边查看手机招聘应用，神情期待。",
        "",
        "近景",
        "客厅",
        "上午",
      ],
      [
        "准备午餐",
        "厨房切菜，动作自然，手部清晰。",
        "",
        "中景",
        "厨房",
        "中午",
      ],
      [
        "独自午餐",
        "碗筷与手机支架入画，一个人的安静日常。",
        "",
        "全景",
        "餐厅",
        "中午",
      ],
      [
        "午睡",
        "伏在桌面休息，午后阳光从窗边照入。",
        "",
        "远景",
        "客厅",
        "午后",
      ],
    ];
    const insertShot = db.prepare(
      "INSERT INTO shots(page_id,position,title,description,dialogue,camera,character_ids,scene,time_of_day,outfit_id,shoe_id,status) VALUES(1,?,?,?,?,?,?,?,?,?,?,?)",
    );
    const sourceImages = [
      "../小粉的美好早晨.png",
      "../小粉的美好早晨-第二页.png",
      "../小粉的美好早晨-第3页.png",
      "../小粉的美好早晨-第4页.png",
      "../小粉的美好早晨-第5页.png",
    ];
    shots.forEach((s, index) => {
      const result = insertShot.run(
        index + 1,
        s[0],
        s[1],
        s[2],
        s[3],
        JSON.stringify(["character_xiaofen"]),
        s[4],
        s[5],
        "XF-SLEEP-02",
        "XF-SHOE-02",
        "draft",
      );
      const id = Number(result.lastInsertRowid);
      db.prepare(
        "INSERT INTO candidates(shot_id,image_path,label,version,selected) VALUES(?,?,?,?,1)",
      ).run(id, sourceImages[index], "参考候选", 1);
      db.prepare(
        "INSERT INTO candidates(shot_id,image_path,label,version,selected) VALUES(?,?,?,?,0)",
      ).run(id, sourceImages[(index + 1) % sourceImages.length], "备选构图", 2);
    });
    const assets: Array<[string, string, string, string, string[]]> = [
      [
        "character_xiaofen",
        "character",
        "小粉标准形象",
        "../角色资产/小粉/01-标准三视图.png",
        ["成年女性", "粉色长发", "暖粉棕眼睛"],
      ],
      [
        "XF-SLEEP-02",
        "outfit",
        "兔子短袖七分裤睡衣",
        "../角色资产/小粉/夏季衣橱/01-夏季睡衣-2套.png",
        ["夏季", "居家", "睡衣"],
      ],
      [
        "XF-WORK-01",
        "outfit",
        "粉色长裙经典通勤装",
        "../角色资产/小粉/夏季衣橱/02-夏季工作装-4套.png",
        ["夏季", "工作"],
      ],
      [
        "XF-CASUAL-01",
        "outfit",
        "奶黄上衣粉色半身裙",
        "../角色资产/小粉/夏季衣橱/03-夏季休闲装-3套.png",
        ["夏季", "休闲"],
      ],
      [
        "XF-SHOE-02",
        "shoes",
        "粉色交叉居家拖鞋",
        "../角色资产/小粉/夏季衣橱/04-夏季鞋履-12双.png",
        ["居家", "拖鞋"],
      ],
    ];
    assets.forEach((a) =>
      db
        .prepare("INSERT INTO assets(id,type,name,path,tags) VALUES(?,?,?,?,?)")
        .run(a[0], a[1], a[2], a[3], JSON.stringify(a[4])),
    );
    [
      ["清晨起床", "清晨"],
      ["早餐与求职", "上午"],
      ["午餐", "中午"],
      ["短暂休息", "午后"],
    ].forEach((t, i) =>
      db
        .prepare(
          "INSERT INTO timeline(episode_id,sequence,label,time_of_day,outfit_id,shoe_id,note) VALUES(1,?,?,?,?,?,?)",
        )
        .run(
          i + 1,
          t[0],
          t[1],
          "XF-SLEEP-02",
          "XF-SHOE-02",
          "同一天居家造型保持一致",
        ),
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
seedIfEmpty();
migrateContent();
repairNarrativeCharacterBindings();

function one<T>(sql: string, ...params: (string | number)[]) {
  return db.prepare(sql).get(...params) as T;
}
function all<T>(sql: string, ...params: (string | number)[]) {
  return db.prepare(sql).all(...params) as T[];
}
const json = <T>(value: string) => JSON.parse(value) as T;
const safeJson = <T>(value: string | undefined, fallback: T): T => {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};
const emptyEnvironment = {
  locationType: "",
  location: "",
  foreground: "",
  midground: "",
  background: "",
  depth: "",
  weather: "",
  timeVisual: "",
  keyLight: "",
  ambientLight: "",
  colorTemperature: "",
  atmosphere: "",
  emphasis: "balanced" as const,
};
const emptyTraits = { hairColorEn: "", hairStyleEn: "", eyeColorEn: "" };
const emptyCharacterProfile = { agePresentationEn: "", faceShapeEn: "", bodyTypeEn: "", skinToneEn: "", distinguishingFeaturesEn: "", temperamentEn: "", baseOutfitEn: "", baseShoesEn: "" };
const defaultLayout = (layout: string): PageLayout => ({
  ratio: "a4",
  template:
    layout === "five" ? "rhythm-5" : layout === "grid" ? "grid-6" : "dynamic",
  width: 900,
  height: 1273,
  gap: 8,
  padding: 24,
});

export function recordBelongsToProject(
  kind: "shot" | "page" | "episode" | "layer" | "candidate" | "job",
  id: number,
  projectId: number,
) {
  const joins = {
    shot: "shots JOIN pages ON pages.id=shots.page_id JOIN episodes ON episodes.id=pages.episode_id",
    page: "pages JOIN episodes ON episodes.id=pages.episode_id",
    episode: "episodes",
    layer:
      "text_layers JOIN pages ON pages.id=text_layers.page_id JOIN episodes ON episodes.id=pages.episode_id",
    candidate:
      "candidates JOIN shots ON shots.id=candidates.shot_id JOIN pages ON pages.id=shots.page_id JOIN episodes ON episodes.id=pages.episode_id",
    job: "jobs JOIN shots ON shots.id=jobs.shot_id JOIN pages ON pages.id=shots.page_id JOIN episodes ON episodes.id=pages.episode_id",
  } as const;
  const columns = {
    shot: "shots.id",
    page: "pages.id",
    episode: "episodes.id",
    layer: "text_layers.id",
    candidate: "candidates.id",
    job: "jobs.id",
  } as const;
  return Boolean(
    one<{ c: number }>(
      `SELECT COUNT(*) c FROM ${joins[kind]} WHERE ${columns[kind]}=? AND episodes.project_id=?`,
      id,
      projectId,
    )?.c,
  );
}

export function getStudioData(
  projectId?: number,
  episodeId?: number,
): StudioData {
  const projects =
    all<any>(`SELECT projects.id,projects.title,COUNT(episodes.id) episode_count,
    COALESCE(MAX(episodes.id),projects.id) updated_at
    FROM projects LEFT JOIN episodes ON episodes.project_id=projects.id
    GROUP BY projects.id ORDER BY updated_at DESC`).map((row) => ({
      id: row.id,
      title: row.title,
      episodeCount: row.episode_count,
      updatedAt: String(row.updated_at),
    }));
  const requested =
    projectId && projects.some((item) => item.id === projectId)
      ? projectId
      : projects[0]?.id;
  const project = one<{ id: number; title: string }>(
    "SELECT id,title FROM projects WHERE id=?",
    requested ?? 1,
  );
  const episodes = all<any>(
    "SELECT id,title,kind,created_at FROM episodes WHERE project_id=? ORDER BY id DESC",
    project.id,
  ).map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    createdAt: row.created_at,
  }));
  const episodeRow = one<any>(
    "SELECT * FROM episodes WHERE project_id=? AND id=COALESCE(?,(SELECT MAX(id) FROM episodes WHERE project_id=?))",
    project.id,
    episodeId || (null as any),
    project.id,
  );
  const pageRows = all<any>(
    "SELECT * FROM pages WHERE episode_id=? ORDER BY number",
    episodeRow.id,
  );
  const pages: ComicPage[] = pageRows.map((page) => {
    const shotRows = all<any>(
      "SELECT * FROM shots WHERE page_id=? ORDER BY position",
      page.id,
    );
    const shots: Shot[] = shotRows.map((shot) => {
      const candidates = all<any>(
        "SELECT * FROM candidates WHERE shot_id=? ORDER BY version",
        shot.id,
      ).map((candidate): Candidate => ({
        id: candidate.id,
        shotId: candidate.shot_id,
        imagePath: candidate.image_path,
        label: candidate.label,
        version: candidate.version,
        selected: Boolean(candidate.selected),
      }));
      return {
        id: shot.id,
        pageId: shot.page_id,
        position: shot.position,
        title: shot.title,
        description: shot.description,
        dialogue: shot.dialogue,
        camera: shot.camera,
        characterIds: json<string[]>(shot.character_ids),
        scene: shot.scene,
        timeOfDay: shot.time_of_day,
        outfitId: shot.outfit_id,
        shoeId: shot.shoe_id,
        locked: Boolean(shot.locked),
        expressionEn: shot.expression_en,
        actionEn: shot.action_en || "natural storytelling action",
        sceneEn: shot.scene_en || "coherent story environment",
        cameraEn: shot.camera_en,
        lightingEn: shot.lighting_en,
        compositionEn: shot.composition_en,
        negativePromptEn: shot.negative_prompt_en,
        environment: safeJson(shot.environment_json, emptyEnvironment),
        characterLooks: safeJson(shot.character_looks_json, {}),
        visualSpec: safeJson(shot.visual_spec_json, null),
        visualSpecSource: shot.visual_spec_source || "rules",
        visualSpecVersion: shot.visual_spec_version || 0,
        visualSpecConfirmed: Boolean(shot.visual_spec_confirmed),
        visualSpecDependencyHash: shot.visual_spec_dependency_hash || "",
        generationWidth: shot.generation_width || 512,
        generationHeight: shot.generation_height || 512,
        cropX: shot.crop_x,
        cropY: shot.crop_y,
        cropScale: shot.crop_scale,
        layoutColSpan: shot.layout_col_span,
        layoutRowSpan: shot.layout_row_span,
        status: shot.status,
        candidates,
      };
    });
    const textLayers = all<any>(
      "SELECT * FROM text_layers WHERE page_id=? ORDER BY z_index,id",
      page.id,
    ).map((layer): TextLayer => ({
      id: layer.id,
      pageId: layer.page_id,
      shotId: layer.shot_id,
      type: layer.type,
      text: layer.text,
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      fontFamily: layer.font_family,
      fontSize: layer.font_size,
      color: layer.color,
      background: layer.background,
      borderColor: layer.border_color,
      rotation: layer.rotation,
      zIndex: layer.z_index,
      hidden: Boolean(layer.hidden),
      locked: Boolean(layer.locked),
    }));
    let layoutConfig = defaultLayout(page.layout);
    try {
      layoutConfig = {
        ...layoutConfig,
        ...json<Partial<PageLayout>>(page.layout_json || "{}"),
      };
    } catch {}
    return {
      id: page.id,
      episodeId: page.episode_id,
      number: page.number,
      title: page.title,
      layout: page.layout,
      layoutConfig,
      shots,
      textLayers,
    };
  });
  const assets = all<any>("SELECT * FROM assets ORDER BY type,id").map(
    (asset): Asset => ({
      id: asset.id,
      type: asset.type,
      name: asset.name,
      path: asset.path,
      tags: json(asset.tags),
      characterId: asset.character_id,
      visualDescriptionEn: asset.visual_description_en,
      defaultShoeId: asset.default_shoe_id,
      confirmed: Boolean(asset.confirmed),
      qualityStatus: asset.quality_status,
    }),
  );
  const characters = all<any>(
    "SELECT * FROM characters ORDER BY status DESC,name",
  ).map((row): Character => ({
    id: row.id,
    name: row.name,
    descriptionCn: row.description_cn,
    appearanceEn: row.appearance_en,
    invariantsEn: json(row.invariants_en),
    status: row.status,
    visualTraits: safeJson(row.visual_traits_json, emptyTraits),
    conceptCn: row.concept_cn || "",
    notes: row.notes || "",
    profile: safeJson(row.profile_json, emptyCharacterProfile),
    profileStatus: row.profile_status || "draft",
    profileVersion: row.profile_version || 1,
    identityMasterReferenceId: row.identity_master_reference_id ?? null,
    assetJobs: all<any>("SELECT id,asset_type,provider,status,stage,error,created_at,updated_at FROM character_asset_jobs WHERE character_id=? ORDER BY id DESC", row.id).map((job) => ({ id: job.id, type: job.asset_type, provider: job.provider, status: job.status, stage: job.stage, error: job.error, createdAt: job.created_at, updatedAt: job.updated_at })),
    assetCandidates: all<any>("SELECT id,job_id,asset_type,path,selected,created_at FROM character_asset_candidates WHERE character_id=? ORDER BY id DESC", row.id).map((candidate) => ({ id: candidate.id, jobId: candidate.job_id, type: candidate.asset_type, path: candidate.path, selected: Boolean(candidate.selected), createdAt: candidate.created_at })),
    references: all<any>(
      "SELECT id,type,path,confirmed FROM character_references WHERE character_id=? ORDER BY id",
      row.id,
    ).map((reference) => ({
      ...reference,
      confirmed: Boolean(reference.confirmed),
    })),
  }));
  const timeline = all<any>(
    "SELECT * FROM timeline WHERE episode_id=? ORDER BY sequence",
    episodeRow.id,
  ).map((row): Timeline => ({
    id: row.id,
    episodeId: row.episode_id,
    sequence: row.sequence,
    label: row.label,
    timeOfDay: row.time_of_day,
    outfitId: row.outfit_id,
    shoeId: row.shoe_id,
    note: row.note,
  }));
  const jobs = all<any>(
    `SELECT jobs.*,pages.number page_number,shots.position shot_position,shots.title shot_title,
    projects.title project_title,episodes.id episode_id,episodes.title episode_title
    FROM jobs JOIN shots ON shots.id=jobs.shot_id JOIN pages ON pages.id=shots.page_id
    JOIN episodes ON episodes.id=pages.episode_id JOIN projects ON projects.id=episodes.project_id
    WHERE episodes.project_id=? ORDER BY jobs.id DESC LIMIT 100`,
    project.id,
  ).map((row): GenerationJob => ({
    id: row.id,
    shotId: row.shot_id,
    provider: row.provider,
    status: row.status,
    payload: row.payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    progress: row.progress,
    error: row.error,
    stage: row.stage,
    pageNumber: row.page_number,
    shotPosition: row.shot_position,
    shotTitle: row.shot_title,
    projectTitle: row.project_title,
    episodeId: row.episode_id,
    episodeTitle: row.episode_title,
  }));
  const materials = all<any>(
    "SELECT * FROM story_materials WHERE project_id=? ORDER BY id DESC",
    project.id,
  ).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    content: row.content,
    analysis: json<Record<string, unknown>>(row.analysis_json),
    createdAt: row.created_at,
  }));
  const seriesMemory =
    one<{ content: string }>(
      "SELECT content FROM series_memory WHERE project_id=?",
      project.id,
    )?.content || "";
  return {
    project,
    projects,
    episodes,
    materials,
    seriesMemory,
    episode: {
      id: episodeRow.id,
      projectId: episodeRow.project_id,
      title: episodeRow.title,
      kind: episodeRow.kind,
      synopsis: episodeRow.synopsis,
      rawMaterial: episodeRow.raw_material ?? "",
      analysis: json(episodeRow.analysis_json ?? "{}"),
      outline: json(episodeRow.outline_json ?? "[]"),
      script: json(episodeRow.script_json ?? "[]"),
      visualPlan: safeJson(episodeRow.visual_plan_json, null),
      visualPlanVersion: episodeRow.visual_plan_version || 0,
      visualPlanConfirmed: Boolean(episodeRow.visual_plan_confirmed),
      visualPlanMeta: safeJson(episodeRow.visual_plan_meta_json, {}),
      pages,
    },
    assets,
    characters,
    timeline,
    jobs,
  };
}

export function saveChapterVisualPlan(episodeId: number, plan: unknown, meta: unknown) {
  const result = db.prepare(`UPDATE episodes SET visual_plan_json=?,visual_plan_version=visual_plan_version+1,
    visual_plan_confirmed=0,visual_plan_meta_json=? WHERE id=?`).run(JSON.stringify(plan),JSON.stringify(meta),episodeId);
  return Number(result.changes)>0;
}

export function confirmChapterVisualPlan(episodeId: number) {
  return Number(db.prepare("UPDATE episodes SET visual_plan_confirmed=1 WHERE id=? AND visual_plan_json<>'null'").run(episodeId).changes)>0;
}

export function saveShotVisualSpec(shotId: number, spec: unknown, source: string, dependencyHash: string, meta: unknown) {
  const result=db.prepare(`UPDATE shots SET visual_spec_json=?,visual_spec_source=?,visual_spec_version=visual_spec_version+1,
    visual_spec_confirmed=0,visual_spec_dependency_hash=?,visual_spec_meta_json=? WHERE id=?`).run(JSON.stringify(spec),source,dependencyHash,JSON.stringify(meta),shotId);
  return Number(result.changes)>0;
}

export function confirmShotVisualSpec(shotId: number) {
  return Number(db.prepare("UPDATE shots SET visual_spec_confirmed=1 WHERE id=? AND visual_spec_json<>'null'").run(shotId).changes)>0;
}

export function confirmAllShotVisualSpecs(episodeId: number) {
  const result=db.prepare(`UPDATE shots SET visual_spec_confirmed=1 WHERE visual_spec_json<>'null' AND page_id IN (SELECT id FROM pages WHERE episode_id=?)`).run(episodeId);
  return Number(result.changes);
}

export function updateShotVisualSpec(shotId:number,spec:unknown,dependencyHash:string) {
  const result=db.prepare(`UPDATE shots SET visual_spec_json=?,visual_spec_source='manual',visual_spec_confirmed=1,
    visual_spec_version=visual_spec_version+1,visual_spec_dependency_hash=? WHERE id=?`).run(JSON.stringify(spec),dependencyHash,shotId);
  return Number(result.changes)>0;
}

export function recordVisualPlanningFailure(episodeId:number,shotId:number|null,action:string,error:unknown) {
  const summary=(error instanceof Error?error.message:String(error||"未知错误")).replace(/sk-[A-Za-z0-9_-]+/g,"[REDACTED]").slice(0,600);
  const code=/401|Key 无效/i.test(summary)?"AUTH":/402|余额/i.test(summary)?"BALANCE":/429|频率/i.test(summary)?"RATE_LIMIT":/JSON|字段|结构/i.test(summary)?"SCHEMA":"UPSTREAM";
  db.prepare("INSERT INTO visual_planning_failures(episode_id,shot_id,action,error_code,error_summary) VALUES(?,?,?,?,?)").run(episodeId,shotId,action,code,summary);
}

export function createStoryMaterial(
  projectId: number,
  text: string,
  analysis: unknown,
) {
  const title = text.split(/[。！？!?\n]/)[0]?.slice(0, 28) || "长篇素材";
  db.prepare(
    "INSERT INTO story_materials(project_id,title,content,analysis_json) VALUES(?,?,?,?)",
  ).run(projectId, title, text, JSON.stringify(analysis));
}

export function updateSeriesMemory(projectId: number, episodeId: number) {
  const rows = all<{
    time_of_day: string;
    outfit_id: string;
    shoe_id: string;
    label: string;
    note: string;
  }>(
    "SELECT time_of_day,outfit_id,shoe_id,label,note FROM timeline WHERE episode_id=? ORDER BY sequence",
    episodeId,
  );
  const episode = one<{ title: string }>(
    "SELECT title FROM episodes WHERE id=? AND project_id=?",
    episodeId,
    projectId,
  );
  if (!episode) return false;
  const content = [
    `最近完成章节：${episode.title}`,
    ...rows.map(
      (row) =>
        `${row.time_of_day}｜${row.label}｜${row.outfit_id}｜${row.shoe_id}｜${row.note}`,
    ),
  ].join("\n");
  db.prepare(
    "INSERT INTO series_memory(project_id,content) VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET content=excluded.content,updated_at=CURRENT_TIMESTAMP",
  ).run(projectId, content);
  return true;
}

export function createPersistentGenerationJob(
  shotId: number,
  provider: string,
  payload: unknown,
  initialStatus = "queued",
) {
  const result = db
    .prepare(
      "INSERT INTO jobs(shot_id,provider,status,payload,progress) VALUES(?,?,?,?,0)",
    )
    .run(shotId, provider, initialStatus, JSON.stringify(payload));
  db.prepare("UPDATE shots SET status=? WHERE id=?").run(initialStatus, shotId);
  return Number(result.lastInsertRowid);
}

export function updatePersistentGenerationJob(
  id: number,
  status: string,
  progress = 0,
  error = "",
  stage = "",
) {
  const current = one<{ status: string }>(
    "SELECT status FROM jobs WHERE id=?",
    id,
  );
  if (current?.status === "cancelled" && status !== "cancelled") return;
  db.prepare(
    "UPDATE jobs SET status=?,progress=?,error=?,stage=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(status, progress, error, stage, id);
}

export function updateGenerationJobPayload(id: number, payload: unknown) {
  db.prepare(
    "UPDATE jobs SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(JSON.stringify(payload), id);
}

export function getLatestRunningSdJob() {
  return one<{ id: number; status: string; updated_at: string }>(
    "SELECT id,status,updated_at FROM jobs WHERE provider='sd-webui' AND status IN ('running','draft_running','final_running') ORDER BY id DESC LIMIT 1",
  );
}

export function cancelRunningGenerationJobs() {
  db.prepare(
    "UPDATE jobs SET status='cancelled',error='用户取消',updated_at=CURRENT_TIMESTAMP WHERE provider='sd-webui' AND status IN ('queued','running','draft_queued','draft_running','final_queued','final_running')",
  ).run();
}

export function getGenerationJobById(id: number) {
  return one<{
    id: number;
    provider: string;
    status: string;
    progress: number;
    error: string;
    stage: string;
  }>("SELECT id,provider,status,progress,error,stage FROM jobs WHERE id=?", id);
}

export function getGenerationJobRecord(id: number) {
  return one<{
    id: number;
    shot_id: number;
    provider: string;
    status: string;
    payload: string;
    progress: number;
    error: string;
    stage: string;
  }>("SELECT * FROM jobs WHERE id=?", id);
}

export function getPaginatedJobs(projectId: number, page = 1, pageSize = 20) {
  const safeSize = Math.min(50, Math.max(5, pageSize || 20));
  const total =
    one<{ count: number }>(
      `SELECT COUNT(*) count FROM jobs JOIN shots ON shots.id=jobs.shot_id JOIN pages ON pages.id=shots.page_id JOIN episodes ON episodes.id=pages.episode_id WHERE episodes.project_id=?`,
      projectId,
    )?.count || 0;
  const pages = Math.max(1, Math.ceil(total / safeSize));
  const safePage = Math.min(pages, Math.max(1, page || 1));
  const rows = all<any>(
    `SELECT jobs.*,shots.position shot_position,shots.title shot_title,pages.number page_number,episodes.id episode_id,episodes.title episode_title,projects.title project_title
    FROM jobs JOIN shots ON shots.id=jobs.shot_id JOIN pages ON pages.id=shots.page_id JOIN episodes ON episodes.id=pages.episode_id JOIN projects ON projects.id=episodes.project_id
    WHERE projects.id=? ORDER BY jobs.id DESC LIMIT ? OFFSET ?`,
    projectId,
    safeSize,
    (safePage - 1) * safeSize,
  );
  const items = rows.map((row): GenerationJob => ({
    id: row.id,
    shotId: row.shot_id,
    provider: row.provider,
    status: row.status,
    payload: row.payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    progress: row.progress,
    error: row.error,
    stage: row.stage,
    pageNumber: row.page_number,
    shotPosition: row.shot_position,
    shotTitle: row.shot_title,
    projectTitle: row.project_title,
    episodeId: row.episode_id,
    episodeTitle: row.episode_title,
  }));
  const statuses = all<{ status: string; count: number }>(
    `SELECT jobs.status,COUNT(*) count FROM jobs JOIN shots ON shots.id=jobs.shot_id JOIN pages ON pages.id=shots.page_id JOIN episodes ON episodes.id=pages.episode_id WHERE episodes.project_id=? GROUP BY jobs.status`,
    projectId,
  );
  return {
    items,
    page: safePage,
    pageSize: safeSize,
    total,
    pages,
    summary: Object.fromEntries(statuses.map((row) => [row.status, row.count])),
  };
}

export function getCandidateExport(candidateId: number, projectId: number) {
  return one<any>(
    `SELECT candidates.*,shots.position shot_position,pages.number page_number,episodes.title episode_title,projects.title project_title
    FROM candidates JOIN shots ON shots.id=candidates.shot_id JOIN pages ON pages.id=shots.page_id JOIN episodes ON episodes.id=pages.episode_id JOIN projects ON projects.id=episodes.project_id
    WHERE candidates.id=? AND projects.id=?`,
    candidateId,
    projectId,
  );
}

export function approveSdDraft(projectId: number, jobId: number) {
  if (!recordBelongsToProject("job", jobId, projectId)) return null;
  const row = getGenerationJobRecord(jobId);
  if (
    !row ||
    row.provider !== "sd-webui" ||
    row.status !== "awaiting_draft_approval"
  )
    return null;
  const payload = JSON.parse(row.payload);
  if (payload.recipe?.postprocessWarnings?.length)
    return null;
  if (payload.recipe?.pixelQa?.status === "blocked")
    return null;
  if (
    !payload.draftImagePath ||
    !fs.existsSync(path.resolve(process.cwd(), payload.draftImagePath))
  )
    return null;
  payload.phase = "final";
  payload.recipe = {
    ...payload.recipe,
    phase: "final",
    endpoint: String(payload.recipe.endpoint).replace(/\/txt2img$/, "/img2img"),
    width: payload.recipe.targetWidth || 512,
    height: payload.recipe.targetHeight || 512,
    steps: 18,
    cfgScale: 6,
    batchSize: 1,
    denoisingStrength: 0.35,
    approvedDraftPath: payload.draftImagePath,
    references: payload.recipe.finalReferences || payload.recipe.references,
  };
  db.prepare(
    "UPDATE jobs SET status='final_queued',payload=?,progress=0,error='',stage='成品任务已排队',updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(JSON.stringify(payload), jobId);
  db.prepare("UPDATE shots SET status='final_queued' WHERE id=?").run(
    row.shot_id,
  );
  return row;
}

export function rejectSdDraft(projectId: number, jobId: number) {
  if (!recordBelongsToProject("job", jobId, projectId)) return false;
  const row = getGenerationJobRecord(jobId);
  if (
    !row ||
    row.provider !== "sd-webui" ||
    row.status !== "awaiting_draft_approval"
  )
    return false;
  db.prepare(
    "UPDATE jobs SET status='draft_rejected',stage='草稿已放弃',updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(jobId);
  db.prepare(
    "UPDATE shots SET status=CASE WHEN EXISTS(SELECT 1 FROM candidates WHERE shot_id=?) THEN 'review' ELSE 'draft' END WHERE id=?",
  ).run(row.shot_id, row.shot_id);
  return true;
}

export function cancelGenerationJobById(id: number) {
  const job = one<{ shot_id: number }>(
    "SELECT shot_id FROM jobs WHERE id=?",
    id,
  );
  db.prepare(
    "UPDATE jobs SET status='cancelled',error='用户取消',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('queued','running','draft_queued','draft_running','final_queued','final_running','awaiting_codex','codex_queued','running_codex')",
  ).run(id);
  if (job)
    db.prepare(
      "UPDATE shots SET status=CASE WHEN EXISTS(SELECT 1 FROM candidates WHERE shot_id=?) THEN 'review' ELSE 'draft' END WHERE id=?",
    ).run(job.shot_id, job.shot_id);
}

export function prepareCodexJobsForExecution(
  projectId: number,
  jobIds: number[],
) {
  const prepared: number[] = [];
  for (const id of jobIds) {
    const row = one<{ id: number }>(
      `SELECT jobs.id FROM jobs JOIN shots ON shots.id=jobs.shot_id
      JOIN pages ON pages.id=shots.page_id JOIN episodes ON episodes.id=pages.episode_id
      WHERE jobs.id=? AND jobs.provider='codex' AND jobs.status='awaiting_codex' AND episodes.project_id=?`,
      id,
      projectId,
    );
    if (!row) continue;
    db.prepare(
      "UPDATE jobs SET status='codex_queued',error='',progress=0,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(id);
    prepared.push(id);
  }
  return prepared;
}

export function retryFailedCodexJob(projectId: number, jobId: number) {
  const row = one<{ shot_id: number; payload: string }>(
    `SELECT jobs.shot_id,jobs.payload FROM jobs
    JOIN shots ON shots.id=jobs.shot_id JOIN pages ON pages.id=shots.page_id
    JOIN episodes ON episodes.id=pages.episode_id
    WHERE jobs.id=? AND jobs.provider='codex' AND jobs.status='failed' AND episodes.project_id=?`,
    jobId,
    projectId,
  );
  if (!row) return false;
  db.prepare(
    "INSERT INTO jobs(shot_id,provider,status,payload,progress,error,stage) VALUES(?,'codex','awaiting_codex',?,0,'','')",
  ).run(row.shot_id, row.payload);
  db.prepare(
    "UPDATE shots SET status='awaiting_codex' WHERE id=? AND locked=0",
  ).run(row.shot_id);
  return true;
}

export function cloneFailedGenerationJob(projectId: number, jobId: number) {
  const row = one<{ shot_id: number; provider: string; payload: string }>(
    `SELECT jobs.shot_id,jobs.provider,jobs.payload FROM jobs
    JOIN shots ON shots.id=jobs.shot_id JOIN pages ON pages.id=shots.page_id JOIN episodes ON episodes.id=pages.episode_id
    WHERE jobs.id=? AND jobs.status='failed' AND episodes.project_id=?`,
    jobId,
    projectId,
  );
  if (!row) return null;
  const phase =
    row.provider === "sd-webui"
      ? JSON.parse(row.payload).recipe?.phase || JSON.parse(row.payload).phase
      : null;
  const status =
    row.provider === "codex"
      ? "awaiting_codex"
      : phase === "draft"
        ? "draft_queued"
        : phase === "final"
          ? "final_queued"
          : "queued";
  const result = db
    .prepare(
      "INSERT INTO jobs(shot_id,provider,status,payload,progress,error,stage) VALUES(?,?,?,?,0,'','')",
    )
    .run(row.shot_id, row.provider, status, row.payload);
  db.prepare("UPDATE shots SET status=? WHERE id=? AND locked=0").run(
    status,
    row.shot_id,
  );
  return { id: Number(result.lastInsertRowid), provider: row.provider };
}

export function pauseGenerationJob(projectId: number, jobId: number) {
  if (!recordBelongsToProject("job", jobId, projectId)) return false;
  const result = db
    .prepare(
      "UPDATE jobs SET status='paused',stage='用户暂停',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('queued','running','draft_queued','draft_running','final_queued','final_running','awaiting_codex','codex_queued','running_codex')",
    )
    .run(jobId);
  return result.changes > 0;
}

export function resumeGenerationJob(projectId: number, jobId: number) {
  if (!recordBelongsToProject("job", jobId, projectId)) return null;
  const row = one<{ provider: string; payload: string }>(
    "SELECT provider,payload FROM jobs WHERE id=? AND status='paused'",
    jobId,
  );
  if (!row) return null;
  const phase =
    row.provider === "sd-webui"
      ? JSON.parse(row.payload).recipe?.phase || JSON.parse(row.payload).phase
      : null;
  const next =
    row.provider === "codex"
      ? "awaiting_codex"
      : phase === "draft"
        ? "draft_queued"
        : phase === "final"
          ? "final_queued"
          : "queued";
  db.prepare(
    "UPDATE jobs SET status=?,error='',stage='已恢复',updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(next, jobId);
  return { id: jobId, provider: row.provider };
}

export function createCharacter(input: {
  name: string;
  descriptionCn: string;
  appearanceEn: string;
  invariantsEn: string[];
  visualTraits: {
    hairColorEn: string;
    hairStyleEn: string;
    eyeColorEn: string;
  };
  conceptCn?: string;
  notes?: string;
  profile?: Record<string, string>;
  profileStatus?: "draft" | "confirmed";
}) {
  const base =
    input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || `character_${Date.now()}`;
  let id = base.startsWith("character_") ? base : `character_${base}`;
  if (one<{ c: number }>("SELECT COUNT(*) c FROM characters WHERE id=?", id).c)
    id = `${id}_${Date.now()}`;
  db.prepare(
    "INSERT INTO characters(id,name,description_cn,appearance_en,invariants_en,visual_traits_json,status,concept_cn,notes,profile_json,profile_status) VALUES(?,?,?,?,?,?,'draft',?,?,?,?)",
  ).run(
    id,
    input.name,
    input.descriptionCn,
    input.appearanceEn,
    JSON.stringify(input.invariantsEn),
    JSON.stringify(input.visualTraits),
    input.conceptCn || input.descriptionCn,
    input.notes || "",
    JSON.stringify(input.profile || {}),
    input.profileStatus || "draft",
  );
  return id;
}

const characterAssetTypes = ["face", "turnaround", "expressions", "outfit", "shoes"] as const;
export type CharacterAssetType = (typeof characterAssetTypes)[number];

export function updateCharacterProfile(characterId: string, input: {
  name: string; descriptionCn: string; conceptCn: string; notes: string;
  appearanceEn: string; invariantsEn: string[]; visualTraits: Record<string, string>;
  profile: Record<string, string>; confirm?: boolean;
}) {
  const current = one<any>("SELECT appearance_en,invariants_en,visual_traits_json FROM characters WHERE id=?", characterId);
  if (!current) return false;
  const identityChanged = current.appearance_en !== input.appearanceEn || current.invariants_en !== JSON.stringify(input.invariantsEn) || current.visual_traits_json !== JSON.stringify(input.visualTraits);
  db.prepare(`UPDATE characters SET name=?,description_cn=?,concept_cn=?,notes=?,appearance_en=?,invariants_en=?,visual_traits_json=?,profile_json=?,profile_status=?,profile_version=profile_version+1 WHERE id=?`).run(
    input.name, input.descriptionCn, input.conceptCn, input.notes, input.appearanceEn,
    JSON.stringify(input.invariantsEn), JSON.stringify(input.visualTraits), JSON.stringify(input.profile),
    input.confirm ? "confirmed" : "draft", characterId,
  );
  if (identityChanged) {
    db.prepare("UPDATE character_references SET confirmed=0 WHERE character_id=?").run(characterId);
    db.prepare("UPDATE assets SET confirmed=0,quality_status='unknown' WHERE character_id=?").run(characterId);
    db.prepare("UPDATE characters SET status='draft',identity_master_reference_id=NULL WHERE id=?").run(characterId);
  }
  return true;
}

export function updateCharacterOutfitPrompt(characterId: string, input: {
  baseOutfitEn: string;
  baseShoesEn: string;
  outfitNegativeEn: string;
}) {
  const row = one<{ profile_json: string }>("SELECT profile_json FROM characters WHERE id=?", characterId);
  if (!row) return false;
  const profile = safeJson<Record<string, string>>(row.profile_json, {});
  profile.baseOutfitEn = input.baseOutfitEn;
  profile.baseShoesEn = input.baseShoesEn;
  profile.outfitNegativeEn = input.outfitNegativeEn;
  db.prepare("UPDATE characters SET profile_json=?,profile_version=profile_version+1 WHERE id=?").run(JSON.stringify(profile), characterId);
  return true;
}

export function buildCharacterAssetPrompt(characterId: string, type: CharacterAssetType) {
  const character = one<any>("SELECT * FROM characters WHERE id=?", characterId);
  if (!character || !characterAssetTypes.includes(type)) return null;
  const profile = safeJson<Record<string, string>>(character.profile_json, {});
  const common = `polished soft Japanese anime character design, ${character.appearance_en}, ${profile.temperamentEn || "natural calm presence"}, consistent canonical identity, clean light neutral background, text-free, no watermark`;
  const instructions: Record<CharacterAssetType, string> = {
    face: "single head-and-shoulders canonical identity portrait, front-facing, neutral gentle expression, even soft studio lighting, unobstructed face, exactly one adult person",
    turnaround: "professional full-body three-view turnaround sheet showing front view, exact side view and back view of the same adult person, identical face, hair, body proportions and outfit in every view",
    expressions: "professional facial expression sheet of the same adult person showing neutral, smile, surprise, worry, anger and shy expression, consistent face and hairstyle",
    outfit: `single full-body fashion reference of the same adult person, front three-quarter standing pose, complete outfit fully visible: ${profile.baseOutfitEn || "coherent complete base outfit"}`,
    shoes: `footwear design reference for the same character, complete pair shown clearly from useful angles: ${profile.baseShoesEn || "coherent base footwear"}`,
  };
  return {
    prompt: `${common}, ${instructions[type]}`,
    negativePrompt: `child, chibi, identity drift, inconsistent face, inconsistent hairstyle, wrong eye color, duplicate person, fused body, cropped clothing, cropped shoes, text, letters, logo, watermark${type === "outfit" && profile.outfitNegativeEn ? `, ${profile.outfitNegativeEn}` : ""}`,
  };
}

export function createCharacterAssetJob(characterId: string, type: CharacterAssetType) {
  const character = one<any>("SELECT * FROM characters WHERE id=?", characterId);
  if (!character || !characterAssetTypes.includes(type)) return { error: "人物或资产类型无效" };
  if (character.profile_status !== "confirmed") return { error: "请先确认人物档案" };
  const active = one<{ id: number; asset_type: string; stage: string }>("SELECT id,asset_type,stage FROM character_asset_jobs WHERE character_id=? AND asset_type=? AND status IN ('queued','running') ORDER BY id DESC LIMIT 1", characterId, type);
  if (active) return { error: `该类资产已有任务正在处理：${active.stage || "等待生成"}` };
  const face = one<any>("SELECT id,path FROM character_references WHERE character_id=? AND type='face' AND confirmed=1 ORDER BY id DESC LIMIT 1", characterId);
  if (type !== "face" && !face) return { error: "请先生成并确认标准正脸" };
  const built = buildCharacterAssetPrompt(characterId, type)!;
  const result = db.prepare(`INSERT INTO character_asset_jobs(character_id,asset_type,provider,status,prompt,negative_prompt,master_reference_id,stage) VALUES(?,?,'codex-imagegen','queued',?,?,?,'等待生成')`).run(characterId, type, built.prompt, built.negativePrompt, type === "face" ? null : face.id);
  return { id: Number(result.lastInsertRowid) };
}

export function getCharacterAssetJob(jobId: number) {
  return one<any>("SELECT * FROM character_asset_jobs WHERE id=?", jobId);
}

export function confirmCharacterAssetCandidate(characterId: string, candidateId: number) {
  const candidate = one<any>("SELECT * FROM character_asset_candidates WHERE id=? AND character_id=?", candidateId, characterId);
  if (!candidate) return { error: "候选图不存在" };
  if (candidate.asset_type !== "face") {
    const job = one<any>("SELECT master_reference_id FROM character_asset_jobs WHERE id=?", candidate.job_id);
    const currentFace = one<any>("SELECT id FROM character_references WHERE character_id=? AND type='face' AND confirmed=1 ORDER BY id DESC LIMIT 1", characterId);
    if (!currentFace || job?.master_reference_id !== currentFace.id) return { error: "身份母版已改变，请重新生成该资产" };
  }
  db.prepare("UPDATE character_asset_candidates SET selected=0 WHERE character_id=? AND asset_type=?").run(characterId, candidate.asset_type);
  db.prepare("UPDATE character_asset_candidates SET selected=1 WHERE id=?").run(candidateId);
  if (candidate.asset_type === "face") {
    const previous = one<any>("SELECT path FROM character_references WHERE character_id=? AND type='face' AND confirmed=1", characterId);
    if (previous && previous.path !== candidate.path)
      db.prepare("UPDATE character_references SET confirmed=0 WHERE character_id=? AND type<>'face'").run(characterId);
  }
  addCharacterReference(characterId, candidate.asset_type, candidate.path);
  if (candidate.asset_type === "face") {
    const reference = one<any>("SELECT id FROM character_references WHERE character_id=? AND type='face' AND confirmed=1", characterId);
    db.prepare("UPDATE characters SET identity_master_reference_id=? WHERE id=?").run(reference?.id ?? null, characterId);
  }
  return { ok: true };
}

export function updateShot(id: number, patch: Record<string, unknown>) {
  const cameraTranslations: Record<string, string> = {
    远景: "wide shot",
    全景: "full shot",
    中景: "medium shot",
    近景: "medium close-up",
    特写: "close-up",
  };
  if (typeof patch.camera === "string" && !("cameraEn" in patch)) {
    const translated = cameraTranslations[patch.camera.trim()];
    if (translated) patch = { ...patch, cameraEn: translated };
  }
  const allowed: Record<string, string> = {
    title: "title",
    description: "description",
    dialogue: "dialogue",
    camera: "camera",
    scene: "scene",
    timeOfDay: "time_of_day",
    outfitId: "outfit_id",
    shoeId: "shoe_id",
    locked: "locked",
    status: "status",
    expressionEn: "expression_en",
    actionEn: "action_en",
    sceneEn: "scene_en",
    cameraEn: "camera_en",
    lightingEn: "lighting_en",
    compositionEn: "composition_en",
    negativePromptEn: "negative_prompt_en",
    cropX: "crop_x",
    cropY: "crop_y",
    cropScale: "crop_scale",
    characterIds: "character_ids",
    layoutColSpan: "layout_col_span",
    layoutRowSpan: "layout_row_span",
    environment: "environment_json",
    characterLooks: "character_looks_json",
    generationWidth: "generation_width",
    generationHeight: "generation_height",
  };
  for (const [key, column] of Object.entries(allowed))
    if (key in patch) {
      const numeric = Number(patch[key]);
      const value =
        key === "locked"
          ? Number(Boolean(patch[key]))
          : key === "characterIds"
            ? JSON.stringify(Array.isArray(patch[key]) ? patch[key] : [])
            : key === "environment" || key === "characterLooks"
              ? JSON.stringify(
                  patch[key] && typeof patch[key] === "object"
                    ? patch[key]
                    : {},
                )
              : key === "generationWidth" || key === "generationHeight"
                ? Math.min(
                    1024,
                    Math.max(384, Math.round(numeric / 64) * 64 || 512),
                  )
                : key === "cropX" || key === "cropY"
                  ? Math.min(
                      100,
                      Math.max(0, Number.isFinite(numeric) ? numeric : 50),
                    )
                  : key === "cropScale"
                    ? Math.min(
                        3,
                        Math.max(0.5, Number.isFinite(numeric) ? numeric : 1),
                      )
                    : key === "layoutColSpan" || key === "layoutRowSpan"
                      ? Math.min(2, Math.max(1, Math.round(numeric) || 1))
                      : String(patch[key] ?? "");
      db.prepare(`UPDATE shots SET ${column}=? WHERE id=?`).run(value, id);
    }
  if ("dialogue" in patch) {
    const shot = one<{ page_id: number }>(
      "SELECT page_id FROM shots WHERE id=?",
      id,
    );
    const existing = db
      .prepare(
        "SELECT id FROM text_layers WHERE shot_id=? AND type='speech' ORDER BY id LIMIT 1",
      )
      .get(id) as { id: number } | undefined;
    const text = String(patch.dialogue ?? "");
    if (existing)
      db.prepare("UPDATE text_layers SET text=? WHERE id=?").run(
        text,
        existing.id,
      );
    else if (text)
      db.prepare(
        "INSERT INTO text_layers(page_id,shot_id,type,text) VALUES(?,?,?,?)",
      ).run(shot.page_id, id, "speech", text);
  }
}

export function updatePageLayout(pageId: number, patch: Partial<PageLayout>) {
  const page = one<{ layout: string; layout_json: string }>(
    "SELECT layout,layout_json FROM pages WHERE id=?",
    pageId,
  );
  let current = defaultLayout(page.layout);
  try {
    current = {
      ...current,
      ...json<Partial<PageLayout>>(page.layout_json || "{}"),
    };
  } catch {}
  const ratios = ["a4", "strip", "square", "custom"],
    templates = ["dynamic", "grid-4", "rhythm-5", "grid-6", "grid-8"];
  const next = { ...current, ...patch };
  next.ratio = ratios.includes(next.ratio) ? next.ratio : "a4";
  next.template = templates.includes(next.template) ? next.template : "dynamic";
  next.width = Math.min(4000, Math.max(320, Number(next.width) || 900));
  next.height = Math.min(8000, Math.max(320, Number(next.height) || 1273));
  next.gap = Math.min(80, Math.max(0, Number(next.gap) || 0));
  next.padding = Math.min(160, Math.max(0, Number(next.padding) || 0));
  db.prepare("UPDATE pages SET layout=?,layout_json=? WHERE id=?").run(
    next.template,
    JSON.stringify(next),
    pageId,
  );
}

export function addTextLayer(
  pageId: number,
  type: TextLayer["type"],
  shotId?: number,
) {
  const labels = { speech: "输入对白", narration: "输入旁白", sfx: "拟声词" };
  const result = db
    .prepare(
      "INSERT INTO text_layers(page_id,shot_id,type,text,x,y,width,height,font_size,background,border_color) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      pageId,
      shotId || null,
      type,
      labels[type],
      type === "narration" ? 5 : 62,
      type === "narration" ? 5 : 8,
      type === "sfx" ? 24 : 32,
      type === "sfx" ? 12 : 16,
      type === "sfx" ? 30 : 18,
      type === "sfx" ? "transparent" : "#ffffff",
      type === "sfx" ? "transparent" : "#222222",
    );
  return Number(result.lastInsertRowid);
}

export function updateTextLayer(id: number, patch: Record<string, unknown>) {
  const allowed: Record<string, string> = {
    text: "text",
    x: "x",
    y: "y",
    width: "width",
    height: "height",
    fontFamily: "font_family",
    fontSize: "font_size",
    color: "color",
    background: "background",
    borderColor: "border_color",
    rotation: "rotation",
    zIndex: "z_index",
    hidden: "hidden",
    locked: "locked",
    shotId: "shot_id",
  };
  for (const [key, column] of Object.entries(allowed))
    if (key in patch) {
      let value: string | number | null = ["hidden", "locked"].includes(key)
        ? Number(Boolean(patch[key]))
        : patch[key] === null
          ? null
          : [
                "text",
                "fontFamily",
                "color",
                "background",
                "borderColor",
              ].includes(key)
            ? String(patch[key])
            : Number(patch[key]);
      if (typeof value === "number") {
        if (["x", "y"].includes(key))
          value = Math.min(100, Math.max(-20, value || 0));
        if (["width", "height"].includes(key))
          value = Math.min(120, Math.max(4, value || 4));
        if (key === "fontSize") value = Math.min(120, Math.max(8, value || 18));
        if (key === "rotation")
          value = Math.min(180, Math.max(-180, value || 0));
      }
      db.prepare(`UPDATE text_layers SET ${column}=? WHERE id=?`).run(
        value,
        id,
      );
    }
}
export function deleteTextLayer(id: number) {
  db.prepare("DELETE FROM text_layers WHERE id=?").run(id);
}
export function duplicateTextLayer(id: number) {
  const layer = one<any>("SELECT * FROM text_layers WHERE id=?", id);
  db.prepare(
    "INSERT INTO text_layers(page_id,shot_id,type,text,x,y,width,height,font_family,font_size,color,background,border_color,rotation,z_index,hidden,locked) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    layer.page_id,
    layer.shot_id,
    layer.type,
    layer.text,
    layer.x + 3,
    layer.y + 3,
    layer.width,
    layer.height,
    layer.font_family,
    layer.font_size,
    layer.color,
    layer.background,
    layer.border_color,
    layer.rotation,
    layer.z_index + 1,
    0,
    0,
  );
}

export function updateEpisodeContent(
  id: number,
  patch: Record<string, unknown>,
) {
  const allowed: Record<string, string> = {
    title: "title",
    synopsis: "synopsis",
    rawMaterial: "raw_material",
  };
  for (const [key, column] of Object.entries(allowed))
    if (key in patch)
      db.prepare(`UPDATE episodes SET ${column}=? WHERE id=?`).run(
        String(patch[key] ?? ""),
        id,
      );
  if ("outline" in patch)
    db.prepare("UPDATE episodes SET outline_json=? WHERE id=?").run(
      JSON.stringify(patch.outline ?? []),
      id,
    );
  if ("script" in patch)
    db.prepare("UPDATE episodes SET script_json=? WHERE id=?").run(
      JSON.stringify(patch.script ?? []),
      id,
    );
}

export function addShotToPage(pageId: number) {
  const position = one<{ v: number }>(
    "SELECT COALESCE(MAX(position),0)+1 v FROM shots WHERE page_id=?",
    pageId,
  ).v;
  const previous = db
    .prepare(
      "SELECT * FROM shots WHERE page_id=? ORDER BY position DESC LIMIT 1",
    )
    .get(pageId) as any;
  db.prepare(
    "INSERT INTO shots(page_id,position,title,description,dialogue,camera,character_ids,scene,time_of_day,outfit_id,shoe_id,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    pageId,
    position,
    `新增分格 ${position}`,
    "请补充这一格的动作、构图和情绪",
    "",
    previous?.camera ?? "中景",
    previous?.character_ids ?? JSON.stringify(["character_xiaofen"]),
    previous?.scene ?? "",
    previous?.time_of_day ?? "",
    previous?.outfit_id ?? "XF-CASUAL-01",
    previous?.shoe_id ?? "XF-SHOE-10",
    "draft",
  );
}

export function deleteShot(shotId: number) {
  const shot = one<{ page_id: number; position: number }>(
    "SELECT page_id,position FROM shots WHERE id=?",
    shotId,
  );
  db.prepare("DELETE FROM candidates WHERE shot_id=?").run(shotId);
  db.prepare("DELETE FROM jobs WHERE shot_id=?").run(shotId);
  db.prepare("DELETE FROM shots WHERE id=?").run(shotId);
  const remaining = all<{ id: number }>(
    "SELECT id FROM shots WHERE page_id=? ORDER BY position",
    shot.page_id,
  );
  remaining.forEach((row, index) =>
    db.prepare("UPDATE shots SET position=? WHERE id=?").run(index + 1, row.id),
  );
}

export function moveShot(shotId: number, direction: -1 | 1) {
  const current = one<{ page_id: number; position: number }>(
    "SELECT page_id,position FROM shots WHERE id=?",
    shotId,
  );
  const targetPosition = current.position + direction;
  const target = db
    .prepare("SELECT id FROM shots WHERE page_id=? AND position=?")
    .get(current.page_id, targetPosition) as { id: number } | undefined;
  if (!target) return;
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE shots SET position=0 WHERE id=?").run(shotId);
    db.prepare("UPDATE shots SET position=? WHERE id=?").run(
      current.position,
      target.id,
    );
    db.prepare("UPDATE shots SET position=? WHERE id=?").run(
      targetPosition,
      shotId,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function addPageToEpisode(episodeId: number) {
  const count = one<{ c: number }>(
    "SELECT COUNT(*) c FROM pages WHERE episode_id=?",
    episodeId,
  ).c;
  if (count >= 7) return;
  const number = one<{ v: number }>(
    "SELECT COALESCE(MAX(number),0)+1 v FROM pages WHERE episode_id=?",
    episodeId,
  ).v;
  const pageResult = db
    .prepare(
      "INSERT INTO pages(episode_id,number,title,layout) VALUES(?,?,?,?)",
    )
    .run(episodeId, number, `第 ${number} 页`, "dynamic");
  const pageId = Number(pageResult.lastInsertRowid);
  for (let position = 1; position <= 6; position++)
    db.prepare(
      "INSERT INTO shots(page_id,position,title,description,dialogue,camera,character_ids,scene,time_of_day,outfit_id,shoe_id,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      pageId,
      position,
      `新增场景 · ${position}`,
      "请补充这一格的动作、构图和情绪",
      "",
      position % 3 === 1 ? "远景" : position % 3 === 2 ? "中景" : "近景",
      JSON.stringify(["character_xiaofen"]),
      "",
      "",
      "XF-CASUAL-01",
      "XF-SHOE-10",
      "draft",
    );
}

export function deletePage(pageId: number) {
  const page = one<{ episode_id: number }>(
    "SELECT episode_id FROM pages WHERE id=?",
    pageId,
  );
  const count = one<{ c: number }>(
    "SELECT COUNT(*) c FROM pages WHERE episode_id=?",
    page.episode_id,
  ).c;
  if (count <= 5) return;
  const shots = all<{ id: number }>(
    "SELECT id FROM shots WHERE page_id=?",
    pageId,
  );
  shots.forEach((shot) => {
    db.prepare("DELETE FROM candidates WHERE shot_id=?").run(shot.id);
    db.prepare("DELETE FROM jobs WHERE shot_id=?").run(shot.id);
  });
  db.prepare("DELETE FROM shots WHERE page_id=?").run(pageId);
  db.prepare("DELETE FROM pages WHERE id=?").run(pageId);
  const remaining = all<{ id: number }>(
    "SELECT id FROM pages WHERE episode_id=? ORDER BY number",
    page.episode_id,
  );
  remaining.forEach((item, index) =>
    db.prepare("UPDATE pages SET number=? WHERE id=?").run(index + 1, item.id),
  );
}

export function selectCandidate(shotId: number, candidateId: number) {
  db.prepare("UPDATE candidates SET selected=0 WHERE shot_id=?").run(shotId);
  db.prepare("UPDATE candidates SET selected=1 WHERE id=? AND shot_id=?").run(
    candidateId,
    shotId,
  );
}

export function createGenerationJob(shotId: number) {
  const shot = one<any>("SELECT * FROM shots WHERE id=?", shotId);
  const provider = process.env.IMAGE_PROVIDER;
  if (!provider) return { status: "needs_configuration" as const };
  const result = db.prepare(
    "INSERT INTO jobs(shot_id,provider,status,payload) VALUES(?,?,?,?)",
  );
  result.run(
    shotId,
    provider,
    "queued",
    JSON.stringify({ prompt: shot.description }),
  );
  db.prepare("UPDATE shots SET status='queued' WHERE id=?").run(shotId);
  return { status: "queued" as const };
}

export function addCandidate(shotId: number, imagePath: string, label: string) {
  const next = one<{ v: number }>(
    "SELECT COALESCE(MAX(version),0)+1 v FROM candidates WHERE shot_id=?",
    shotId,
  ).v;
  const existing = one<{ c: number }>(
    "SELECT COUNT(*) c FROM candidates WHERE shot_id=?",
    shotId,
  ).c;
  const result = db
    .prepare(
      "INSERT INTO candidates(shot_id,image_path,label,version,selected) VALUES(?,?,?,?,?)",
    )
    .run(
      shotId,
      imagePath,
      label || `导入候选 ${next}`,
      next,
      existing === 0 ? 1 : 0,
    );
  db.prepare("UPDATE shots SET status='review' WHERE id=?").run(shotId);
  return Number(result.lastInsertRowid);
}

export function getShotGenerationInput(shotId: number) {
  const shot = one<any>("SELECT * FROM shots WHERE id=?", shotId);
  return {
    id: shot.id,
    pageId: shot.page_id,
    position: shot.position,
    title: shot.title,
    description: shot.description,
    dialogue: shot.dialogue,
    camera: shot.camera,
    characterIds: json<string[]>(shot.character_ids),
    scene: shot.scene,
    timeOfDay: shot.time_of_day,
    outfitId: shot.outfit_id,
    shoeId: shot.shoe_id,
    expressionEn: shot.expression_en,
    actionEn: shot.action_en || "natural storytelling action",
    sceneEn: shot.scene_en || "coherent story environment",
    cameraEn: shot.camera_en,
    lightingEn: shot.lighting_en,
    compositionEn: shot.composition_en,
    negativePromptEn: shot.negative_prompt_en,
    cropX: shot.crop_x,
    cropY: shot.crop_y,
    environment: safeJson(shot.environment_json, emptyEnvironment),
    characterLooks: safeJson(shot.character_looks_json, {}),
    visualSpec: safeJson(shot.visual_spec_json, null),
    visualSpecSource: shot.visual_spec_source || "rules",
    visualSpecVersion: shot.visual_spec_version || 0,
    visualSpecConfirmed: Boolean(shot.visual_spec_confirmed),
    visualSpecDependencyHash: shot.visual_spec_dependency_hash || "",
    generationWidth: shot.generation_width || 512,
    generationHeight: shot.generation_height || 512,
    cropScale: shot.crop_scale,
    layoutColSpan: shot.layout_col_span,
    layoutRowSpan: shot.layout_row_span,
    locked: Boolean(shot.locked),
    status: shot.status,
    candidates: [],
  } as Shot;
}
export function getAssets() {
  return all<any>(
    "SELECT * FROM assets WHERE confirmed=1 AND quality_status<>'not_generation_ready' ORDER BY type,id",
  ).map((asset): Asset => ({
    id: asset.id,
    type: asset.type,
    name: asset.name,
    path: asset.path,
    tags: json(asset.tags),
    characterId: asset.character_id,
    visualDescriptionEn: asset.visual_description_en,
    defaultShoeId: asset.default_shoe_id,
    confirmed: Boolean(asset.confirmed),
    qualityStatus: asset.quality_status,
  }));
}
export function getCharacters() {
  return all<any>("SELECT * FROM characters ORDER BY status DESC,name").map(
    (row): Character => ({
      id: row.id,
      name: row.name,
      descriptionCn: row.description_cn,
      appearanceEn: row.appearance_en,
      invariantsEn: json(row.invariants_en),
      status: row.status,
      visualTraits: safeJson(row.visual_traits_json, emptyTraits),
      conceptCn: row.concept_cn || "",
      notes: row.notes || "",
      profile: safeJson(row.profile_json, emptyCharacterProfile),
      profileStatus: row.profile_status || "draft",
      profileVersion: row.profile_version || 1,
      identityMasterReferenceId: row.identity_master_reference_id ?? null,
      assetJobs: all<any>("SELECT id,asset_type,provider,status,stage,error,created_at,updated_at FROM character_asset_jobs WHERE character_id=? ORDER BY id DESC", row.id).map((job) => ({ id: job.id, type: job.asset_type, provider: job.provider, status: job.status, stage: job.stage, error: job.error, createdAt: job.created_at, updatedAt: job.updated_at })),
      assetCandidates: all<any>("SELECT id,job_id,asset_type,path,selected,created_at FROM character_asset_candidates WHERE character_id=? ORDER BY id DESC", row.id).map((candidate) => ({ id: candidate.id, jobId: candidate.job_id, type: candidate.asset_type, path: candidate.path, selected: Boolean(candidate.selected), createdAt: candidate.created_at })),
      references: all<any>(
        "SELECT id,type,path,confirmed FROM character_references WHERE character_id=? ORDER BY id",
        row.id,
      ).map((reference) => ({
        ...reference,
        confirmed: Boolean(reference.confirmed),
      })),
    }),
  );
}

export function addCharacterReference(
  characterId: string,
  type: string,
  filePath: string,
) {
  const character = one<{ id: string; name: string; appearance_en: string }>(
    "SELECT id,name,appearance_en FROM characters WHERE id=?",
    characterId,
  );
  if (!character) return false;
  const allowed = ["face", "turnaround", "expressions", "outfit", "shoes"];
  if (!allowed.includes(type)) return false;
  const previousFace = type === "face" ? one<{ path: string }>("SELECT path FROM character_references WHERE character_id=? AND type='face' AND confirmed=1", characterId) : null;
  if (previousFace && previousFace.path !== filePath) {
    db.prepare("UPDATE character_references SET confirmed=0 WHERE character_id=? AND type<>'face'").run(characterId);
    db.prepare("UPDATE assets SET confirmed=0,quality_status='unknown' WHERE id IN (?,?)").run(`${characterId}_base_outfit`, `${characterId}_base_shoes`);
  }
  db.prepare(
    "DELETE FROM character_references WHERE character_id=? AND type=?",
  ).run(characterId, type);
  db.prepare(
    "INSERT INTO character_references(character_id,type,path,confirmed) VALUES(?,?,?,1)",
  ).run(characterId, type, filePath);
  if (type === "face") {
    const reference = one<{ id: number }>("SELECT id FROM character_references WHERE character_id=? AND type='face' AND confirmed=1", characterId);
    db.prepare("UPDATE characters SET identity_master_reference_id=? WHERE id=?").run(reference?.id ?? null, characterId);
  }
  if (type === "face")
    db.prepare(
      `INSERT INTO assets(id,type,name,path,tags,character_id,visual_description_en,confirmed,quality_status)
    VALUES(?,'character',?,?,?, ?,?,1,'complete_identity') ON CONFLICT(id) DO UPDATE SET path=excluded.path,confirmed=1,quality_status='complete_identity'`,
    ).run(
      characterId,
      `${character.name}身份参考`,
      filePath,
      JSON.stringify([character.name, "身份"]),
      characterId,
      character.appearance_en,
    );
  if (type === "outfit")
    db.prepare(
      `INSERT INTO assets(id,type,name,path,tags,character_id,visual_description_en,confirmed,quality_status)
    VALUES(?,'outfit',?,?,?, ?,?,1,'complete_outfit') ON CONFLICT(id) DO UPDATE SET path=excluded.path,confirmed=1,quality_status='complete_outfit'`,
    ).run(
      `${characterId}_base_outfit`,
      `${character.name}基础服装`,
      filePath,
      JSON.stringify([character.name, "基础服装"]),
      characterId,
      "character-specific complete base outfit",
    );
  if (type === "shoes")
    db.prepare(
      `INSERT INTO assets(id,type,name,path,tags,character_id,visual_description_en,confirmed,quality_status)
    VALUES(?,'shoes',?,?,?, ?,?,1,'partial_footwear') ON CONFLICT(id) DO UPDATE SET path=excluded.path,confirmed=1,quality_status='partial_footwear'`,
    ).run(
      `${characterId}_base_shoes`,
      `${character.name}基础鞋履`,
      filePath,
      JSON.stringify([character.name, "基础鞋履"]),
      characterId,
      "character-specific base footwear",
    );
  const count = one<{ c: number }>(
    "SELECT COUNT(DISTINCT type) c FROM character_references WHERE character_id=? AND confirmed=1",
    characterId,
  ).c;
  const profileConfirmed = one<{ profile_status: string }>("SELECT profile_status FROM characters WHERE id=?", characterId)?.profile_status === "confirmed";
  if (count >= 5 && profileConfirmed)
    db.prepare("UPDATE characters SET status='ready' WHERE id=?").run(
      characterId,
    );
  else db.prepare("UPDATE characters SET status='draft' WHERE id=?").run(characterId);
  return true;
}

export function queueCodexPage(pageId: number) {
  const shots = all<{ id: number }>(
    "SELECT id FROM shots WHERE page_id=? ORDER BY position",
    pageId,
  );
  const assets = getAssets();
  const characters = getCharacters();
  db.prepare(
    "DELETE FROM jobs WHERE status='awaiting_codex' AND shot_id IN (SELECT id FROM shots WHERE page_id=?)",
  ).run(pageId);
  for (const item of shots) {
    const shot = getShotGenerationInput(item.id);
    if (shot.locked) continue;
    const built = buildGenerationPrompt(shot, assets, characters);
    const payload = {
      shotId: shot.id,
      pageId,
      prompt: built.prompt,
      negativePrompt: built.negativePrompt,
      candidateCount: 1,
      references: assets
        .filter(
          (asset) =>
            (asset.type === "character" &&
              (shot.characterIds.includes(asset.characterId) ||
                shot.characterIds.includes(asset.id))) ||
            asset.id === shot.outfitId ||
            asset.id === shot.shoeId,
        )
        .map((asset) => ({
          id: asset.id,
          path: asset.path,
          description: asset.visualDescriptionEn,
        })),
    };
    db.prepare(
      "INSERT INTO jobs(shot_id,provider,status,payload) VALUES(?,?,?,?)",
    ).run(shot.id, "codex", "awaiting_codex", JSON.stringify(payload));
    db.prepare(
      "UPDATE shots SET status='awaiting_codex' WHERE id=? AND locked=0",
    ).run(shot.id);
  }
}

export function clearGeneratedReferenceCandidates(episodeId: number) {
  db.prepare(
    "DELETE FROM candidates WHERE shot_id IN (SELECT shots.id FROM shots JOIN pages ON pages.id=shots.page_id WHERE pages.episode_id=?)",
  ).run(episodeId);
  db.prepare(
    "UPDATE shots SET status='draft' WHERE page_id IN (SELECT id FROM pages WHERE episode_id=?)",
  ).run(episodeId);
}

type CreationAnalysis = {
  kind: string;
  theme: string;
  emotion: string[];
  characters: string[];
  scenes: string[];
  recommendedPages: number;
  outfitId: string;
  shoeId: string;
  affectsMainline: boolean;
  analysisSource?: "deepseek" | "rules";
  outline?: Array<{ title: string; description: string; emotion: string }>;
  script?: Array<{ scene: string; timeOfDay: string; summary: string; dialogue: string }>;
  panels?: Array<{
    pageNumber: number; title: string; description: string; actionEn: string;
    expressionEn: string; gazeEn: string; handsEn: string; dialogue: string;
    camera: "远景" | "全景" | "中景" | "近景" | "特写";
    scene: string; timeOfDay: string; characterNames: string[];
  }>;
};

function splitStory(text: string) {
  return text
    .split(/[。！？!?；;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}
const cameraEnglish: Record<string, string> = {
  远景: "wide shot",
  全景: "full shot",
  中景: "medium shot",
  近景: "close shot",
  特写: "close-up",
};
const sceneEnglish = (value: string) =>
  /公司/.test(value)
    ? "modern office"
    : /街道|通勤/.test(value)
      ? "city street"
      : /厨房/.test(value)
        ? "home kitchen"
        : /餐厅/.test(value)
          ? "bright dining room"
          : /客厅|室内/.test(value)
            ? "cozy home interior"
            : "coherent everyday environment";

const panelNarrativePhases = [
  {
    label: "建立状态",
    describe: (beat: string, scene: string) => `起始状态：${beat}。画面明确交代人物在“${scene}”中的位置、彼此距离、朝向以及此刻要完成的目标。`,
    en: "establish the exact starting positions, distance, facing directions, and immediate goal",
  },
  {
    label: "动作启动",
    describe: (beat: string) => `事件推进：围绕“${beat}”，主动人物开始一个能够改变局面的具体动作；动作尚未完成，并与上一格姿态明显不同。`,
    en: "show the active character beginning one concrete story-changing action, clearly different from the previous pose",
  },
  {
    label: "即时反应",
    describe: (beat: string) => `人物反应：针对“${beat}”刚发生的动作，另一人物通过视线、表情、手部和身体距离作出即时可见反应。`,
    en: "show the other character's immediate visible reaction through gaze, expression, hands, and body distance",
  },
  {
    label: "关键信息",
    describe: (beat: string, scene: string) => `信息镜头：用“${scene}”中的关键物件、接触点或环境变化具体说明“${beat}”如何发生，避免人物静止摆拍。`,
    en: "reveal the key prop, contact point, or environmental change that explains how the event happens",
  },
  {
    label: "结果承接",
    describe: (beat: string, _scene: string, nextBeat: string) => `结果状态：“${beat}”已经造成可见结果，人物、道具归属或空间关系发生变化；画面方向承接下一节点“${nextBeat || "本段收束"}”。`,
    en: "show the visible result with changed character, prop, or spatial state and establish direction into the next panel",
  },
] as const;

const inferPanelGaze=(action:string)=>/phone|smartphone|screen|texting|message/i.test(action)
  ? "head tilted slightly down, eyes focused on the smartphone screen, pupils directed downward, no eye contact with camera"
  : /book|page|reading|document|letter/i.test(action)
    ? "eyes focused on the book or document, pupils directed toward the page, no eye contact with camera"
    : /walk|run|move|leave|enter/i.test(action)
      ? "looking toward the direction of movement, no eye contact with camera"
      : "eyes focused on the current action target, no eye contact with camera";

function migrateDefaultCameraGaze() {
  if(db.prepare("SELECT value FROM app_meta WHERE key='action_target_gaze_v2'").get())return;
  const rows=db.prepare("SELECT id,action_en,expression_en,character_looks_json FROM shots").all() as Array<{id:number;action_en:string;expression_en:string;character_looks_json:string}>;
  const update=db.prepare("UPDATE shots SET expression_en=?,character_looks_json=? WHERE id=?");
  for(const row of rows){let looks:Record<string,any>={};try{looks=JSON.parse(row.character_looks_json||"{}");}catch{}for(const look of Object.values(looks)){if(!look.gazeEn||/^(looking toward the story focus|looking slightly toward the viewer)$/i.test(look.gazeEn))look.gazeEn=inferPanelGaze(look.actionEn||row.action_en);if(typeof look.expressionEn==="string")look.expressionEn=look.expressionEn.replace(/,?\s*looking slightly toward the viewer/ig,"").trim();}update.run(row.expression_en.replace(/,?\s*looking slightly toward the viewer/ig,"").trim(),JSON.stringify(looks),row.id);}
  db.prepare("INSERT INTO app_meta(key,value) VALUES('action_target_gaze_v2',CURRENT_TIMESTAMP)").run();
}

function migrateGenericPanelNarratives() {
  if (db.prepare("SELECT value FROM app_meta WHERE key='panel_narrative_states_v2'").get()) return;
  const rows = db.prepare(
    `SELECT shots.id,shots.description,shots.scene,pages.episode_id,pages.number,shots.position
     FROM shots JOIN pages ON pages.id=shots.page_id
     WHERE shots.description LIKE '%本格任务：%'
     ORDER BY pages.episode_id,pages.number,shots.position`,
  ).all() as Array<{id:number;description:string;scene:string;episode_id:number;number:number;position:number}>;
  const update = db.prepare("UPDATE shots SET title=?,description=?,action_en=? WHERE id=?");
  let currentEpisode = -1;
  let episodeIndex = 0;
  for (const row of rows) {
    if (row.episode_id !== currentEpisode) { currentEpisode = row.episode_id; episodeIndex = 0; }
    const beat = row.description.split("。本格任务：")[0].trim() || "当前剧情继续发展";
    const phase = panelNarrativePhases[episodeIndex % panelNarrativePhases.length];
    const scene = row.scene || "当前场景";
    update.run(`${phase.label} · ${episodeIndex + 1}`, phase.describe(beat, scene, "下一剧情节点"), phase.en, row.id);
    episodeIndex += 1;
  }
  db.prepare("INSERT INTO app_meta(key,value) VALUES('panel_narrative_states_v2',CURRENT_TIMESTAMP)").run();
}

migrateGenericPanelNarratives();
migrateDefaultCameraGaze();

export function createEpisodeFromStory(
  text: string,
  analysis: CreationAnalysis,
  target: "new_project" | "current_series" = "new_project",
  currentProjectId?: number,
) {
  const sentences = splitStory(text);
  const titleSeed =
    sentences[0]?.replace(/[，,].*$/, "").slice(0, 16) || "小粉的新故事";
  const title = titleSeed.includes("小粉") ? titleSeed : `小粉 · ${titleSeed}`;
  const kind = analysis.kind === "日常短篇" ? "short" : "long";
  const emotions = analysis.emotion?.length
    ? analysis.emotion
    : ["平静", "变化", "温暖"];
  const baseBeats =
    sentences.length >= 3
      ? sentences
      : [
          sentences[0] || "小粉开始了普通的一天",
          "意外情况打破了原本的节奏",
          "小粉做出了自己的选择",
          "故事在温柔的余韵中结束",
        ];
  const ruleOutline = baseBeats.map((description, index) => ({
    order: index + 1,
    title:
      index === 0
        ? "开场"
        : index === baseBeats.length - 1
          ? "收束"
          : `发展 ${index}`,
    description,
    emotion:
      emotions[
        Math.min(
          emotions.length - 1,
          Math.floor((index * emotions.length) / baseBeats.length),
        )
      ],
  }));
  const outline = analysis.outline?.length ? analysis.outline : ruleOutline;
  const sceneList = analysis.scenes?.length ? analysis.scenes : ["日常场景"];
  const times = /下班|傍晚/.test(text)
    ? ["傍晚", "傍晚", "夜晚"]
    : ["上午", "中午", "下午"];
  const ruleScript = outline.map((beat, index) => ({
    order: index + 1,
    scene: sceneList[index % sceneList.length],
    timeOfDay: times[Math.min(index, times.length - 1)],
    summary: beat.description,
    dialogue:
      index === 0
        ? ""
        : index === outline.length - 1
          ? "今天，也没有那么糟。"
          : "",
  }));
  const script = analysis.script?.length ? analysis.script : ruleScript;
  const pageCount = Math.max(5, Math.min(7, analysis.recommendedPages || 5));
  const rulePanelsPerPage = Array.from({ length: pageCount }, (_, pageIndex) => {
    const storyIntensity = emotions.some((x) => /紧张|冲突|意外|高潮/.test(x))
      ? 1
      : 0;
    return 6 + ((baseBeats.length + pageIndex + storyIntensity) % 3);
  });
  const panelCount = rulePanelsPerPage.reduce((sum, count) => sum + count, 0);
  const rulePanels = Array.from({ length: panelCount }, (_, index) => {
    const progress = panelCount === 1 ? 0 : index / (panelCount - 1);
    const sourceIndex = Math.min(
      baseBeats.length - 1,
      Math.floor(progress * baseBeats.length),
    );
    const beat = baseBeats[sourceIndex];
    const positionInBeat =
      index - Math.floor((sourceIndex * panelCount) / baseBeats.length);
    const cameraCycle = ["远景", "中景", "近景", "特写"];
    const phase = panelNarrativePhases[positionInBeat % panelNarrativePhases.length];
    const scene = sceneList[sourceIndex % sceneList.length];
    const nextBeat = baseBeats[Math.min(baseBeats.length - 1, sourceIndex + 1)] || "";
    return {
      pageNumber: Math.min(pageCount, Math.floor(index / Math.max(1, Math.ceil(panelCount / pageCount))) + 1),
      title: `${outline[sourceIndex].title} · ${phase.label}`,
      description: phase.describe(beat, scene, nextBeat),
      actionEn: phase.en,
      expressionEn: "readable story-appropriate expression",
      gazeEn: "gaze follows the story action",
      handsEn: "hands follow the described action",
      characterNames: [] as string[],
      dialogue: index === panelCount - 1 ? "今天，也没有那么糟。" : "",
      camera: cameraCycle[index % cameraCycle.length],
      scene,
      timeOfDay: times[Math.min(sourceIndex, times.length - 1)],
    };
  });
  const plannedPanels = analysis.panels?.filter((panel)=>panel&&panel.title&&panel.description&&panel.actionEn) || [];
  const panels = plannedPanels.length ? plannedPanels : rulePanels;
  const panelsPerPage = plannedPanels.length
    ? Array.from({length:pageCount},(_,pageIndex)=>plannedPanels.filter((panel)=>Math.max(1,Math.min(pageCount,Number(panel.pageNumber)||1))===pageIndex+1).length)
    : rulePanelsPerPage;
  db.exec("BEGIN");
  try {
    const storyCharacters: string[] = (
      analysis.characters?.length ? analysis.characters : ["小粉"]
    )
      .map((name: string) => name.replace(/^待创建角色[：:]\s*/, "").trim())
      .filter(Boolean);
    if (!storyCharacters.includes("小粉")) storyCharacters.unshift("小粉");
    const characterIds = new Map<string, string>();
    for (const name of storyCharacters) {
      const existing = one<{ id: string }>(
        "SELECT id FROM characters WHERE name=?",
        name,
      );
      if (existing) {
        characterIds.set(name, existing.id);
        continue;
      }
      const id = `character_story_${Date.now()}_${characterIds.size}`;
      db.prepare(
        "INSERT INTO characters(id,name,description_cn,appearance_en,invariants_en,status) VALUES(?,?,?,?,?,'draft')",
      ).run(
        id,
        name,
        "由剧情分析创建，需补齐人物基准资产",
        "adult supporting character, visually distinct from Xiaofen, consistent face, hairstyle and body proportions",
        JSON.stringify([
          "distinct identity",
          "consistent face",
          "consistent hairstyle",
        ]),
      );
      characterIds.set(name, id);
    }
    let projectId = 1;
    if (target === "new_project") {
      const projectResult = db
        .prepare("INSERT INTO projects(title) VALUES(?)")
        .run(title);
      projectId = Number(projectResult.lastInsertRowid);
    } else {
      projectId =
        currentProjectId &&
        one<{ c: number }>(
          "SELECT COUNT(*) c FROM projects WHERE id=?",
          currentProjectId,
        ).c
          ? currentProjectId
          : one<{ id: number }>(
              "SELECT id FROM projects ORDER BY id DESC LIMIT 1",
            ).id;
    }
    const result = db
      .prepare(
        "INSERT INTO episodes(project_id,title,kind,synopsis,raw_material,analysis_json,outline_json,script_json) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        projectId,
        title,
        kind,
        analysis.theme,
        text,
        JSON.stringify(analysis),
        JSON.stringify(outline),
        JSON.stringify(script),
      );
    const episodeId = Number(result.lastInsertRowid);
    let panelOffset = 0;
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const pageResult = db
        .prepare(
          "INSERT INTO pages(episode_id,number,title,layout) VALUES(?,?,?,?)",
        )
        .run(
          episodeId,
          pageIndex + 1,
          `${title} · 第 ${pageIndex + 1} 页`,
          "five",
        );
      const pageId = Number(pageResult.lastInsertRowid);
      const countOnPage = panelsPerPage[pageIndex];
      panels
        .slice(panelOffset, panelOffset + countOnPage)
        .forEach((panel, localIndex) => {
          const panelCharacters = storyCharacters
            .filter((name) => panel.characterNames?.includes(name) || name === "小粉" || panel.description.includes(name))
            .map((name) => characterIds.get(name)!)
            .filter(Boolean);
          const panelCharacterLooks=plannedPanels.length?Object.fromEntries(panelCharacters.map((characterId,characterIndex)=>[characterId,{
            outfitId:characterIndex===0?analysis.outfitId:"",shoeId:characterIndex===0?analysis.shoeId:"",hairColorEn:"",hairStyleEn:"",eyeColorEn:"",
            positionEn:panelCharacters.length===1?"centered in the frame":characterIndex===0?"on the left side":"on the right side",
            actionEn:panel.actionEn,expressionEn:panel.expressionEn||"readable story-appropriate expression",
            gazeEn:panel.gazeEn||"eyes focused on the current action target, no eye contact with camera",handsEn:panel.handsEn||"hands follow the described action",
          }])):{};
          const shotResult = db
            .prepare(
              "INSERT INTO shots(page_id,position,title,description,dialogue,camera,character_ids,scene,time_of_day,outfit_id,shoe_id,status,expression_en,action_en,scene_en,camera_en,lighting_en,composition_en,character_looks_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .run(
              pageId,
              localIndex + 1,
              panel.title,
              panel.description,
              panel.dialogue,
              panel.camera,
              JSON.stringify(panelCharacters),
              panel.scene,
              panel.timeOfDay,
              analysis.outfitId,
              analysis.shoeId,
              "draft",
              panel.expressionEn || "readable story-appropriate expression",
              panel.actionEn,
              sceneEnglish(panel.scene),
              cameraEnglish[panel.camera] || "medium shot",
              "soft cinematic lighting",
              "clear manga panel composition with deliberate eye line and panel-to-panel continuity",
              JSON.stringify(panelCharacterLooks),
            );
          Number(shotResult.lastInsertRowid);
        });
      panelOffset += countOnPage;
    }
    script.forEach((scene, index) =>
      db
        .prepare(
          "INSERT INTO timeline(episode_id,sequence,label,time_of_day,outfit_id,shoe_id,note) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          episodeId,
          index + 1,
          scene.summary.slice(0, 24),
          scene.timeOfDay,
          analysis.outfitId,
          analysis.shoeId,
          scene.scene,
        ),
    );
    db.exec("COMMIT");
    return episodeId;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function separateRecentStoriesIntoProjects() {
  const rows = all<{ id: number; title: string; project_id: number }>(
    "SELECT id,title,project_id FROM episodes WHERE id>1 ORDER BY id",
  );
  for (const episode of rows) {
    const projectEpisodeCount = one<{ c: number }>(
      "SELECT COUNT(*) c FROM episodes WHERE project_id=?",
      episode.project_id,
    ).c;
    if (projectEpisodeCount <= 1) continue;
    const created = db
      .prepare("INSERT INTO projects(title) VALUES(?)")
      .run(episode.title);
    db.prepare("UPDATE episodes SET project_id=? WHERE id=?").run(
      Number(created.lastInsertRowid),
      episode.id,
    );
  }
}

function deleteEpisodeCascade(episodeId: number) {
  db.prepare(
    "DELETE FROM candidates WHERE shot_id IN (SELECT shots.id FROM shots JOIN pages ON pages.id=shots.page_id WHERE pages.episode_id=?)",
  ).run(episodeId);
  db.prepare(
    "DELETE FROM jobs WHERE shot_id IN (SELECT shots.id FROM shots JOIN pages ON pages.id=shots.page_id WHERE pages.episode_id=?)",
  ).run(episodeId);
  db.prepare(
    "DELETE FROM shots WHERE page_id IN (SELECT id FROM pages WHERE episode_id=?)",
  ).run(episodeId);
  db.prepare("DELETE FROM pages WHERE episode_id=?").run(episodeId);
  db.prepare("DELETE FROM timeline WHERE episode_id=?").run(episodeId);
  db.prepare("DELETE FROM episodes WHERE id=?").run(episodeId);
}

export function upgradeLatestStoryStructure() {
  const episode = one<any>("SELECT * FROM episodes ORDER BY id DESC LIMIT 1");
  const existingPages = one<{ c: number }>(
    "SELECT COUNT(*) c FROM pages WHERE episode_id=?",
    episode.id,
  ).c;
  if (existingPages >= 5) return;
  const oldProjectId = episode.project_id;
  const text = episode.raw_material || episode.synopsis;
  const automatic = (episode.analysis_json &&
    JSON.parse(episode.analysis_json)) as CreationAnalysis;
  const analysis = {
    ...automatic,
    recommendedPages: Math.max(5, Math.min(7, automatic.recommendedPages || 5)),
  };
  createEpisodeFromStory(text, analysis, "new_project");
  deleteEpisodeCascade(episode.id);
  const remains = one<{ c: number }>(
    "SELECT COUNT(*) c FROM episodes WHERE project_id=?",
    oldProjectId,
  ).c;
  if (remains === 0)
    db.prepare("DELETE FROM projects WHERE id=?").run(oldProjectId);
}

export function refreshLatestEpisodeAnalysis(
  text: string,
  analysis: CreationAnalysis,
) {
  const episode = one<{ id: number }>(
    "SELECT id FROM episodes WHERE project_id=1 ORDER BY id DESC LIMIT 1",
  );
  const kind = analysis.kind === "日常短篇" ? "short" : "long";
  db.prepare(
    "UPDATE episodes SET kind=?,synopsis=?,raw_material=?,analysis_json=? WHERE id=?",
  ).run(kind, analysis.theme, text, JSON.stringify(analysis), episode.id);
}

export type ProjectManagementItem = {
  id: number;
  title: string;
  description: string;
  coverPath: string;
  status: "active" | "completed" | "archived";
  notes: string;
  createdAt: string;
  updatedAt: string;
  episodeCount: number;
  completedEpisodes: number;
  pageCount: number;
  shotCount: number;
  selectedShots: number;
  pendingJobs: number;
  latestEpisode: string;
  latestEpisodeId: number | null;
  latestImagePath: string;
};

export function getProjectManagementData() {
  const projects = all<any>(`SELECT p.*, COUNT(DISTINCT e.id) episode_count,
    COUNT(DISTINCT CASE WHEN e.kind='completed' THEN e.id END) completed_episodes,
    COUNT(DISTINCT pg.id) page_count, COUNT(DISTINCT s.id) shot_count,
    COUNT(DISTINCT CASE WHEN c.selected=1 THEN s.id END) selected_shots,
    COUNT(DISTINCT CASE WHEN j.status IN ('queued','running','awaiting_codex','draft_queued') THEN j.id END) pending_jobs,
    MAX(e.id) latest_episode_id, MAX(e.title) latest_episode
    FROM projects p LEFT JOIN episodes e ON e.project_id=p.id
    LEFT JOIN pages pg ON pg.episode_id=e.id LEFT JOIN shots s ON s.page_id=pg.id
    LEFT JOIN candidates c ON c.shot_id=s.id LEFT JOIN jobs j ON j.shot_id=s.id
    GROUP BY p.id ORDER BY COALESCE(p.updated_at,p.created_at) DESC, p.id DESC`).map((row) => {
      const image = one<{ image_path: string }>(`SELECT c.image_path FROM candidates c
        JOIN shots s ON s.id=c.shot_id JOIN pages pg ON pg.id=s.page_id
        JOIN episodes e ON e.id=pg.episode_id WHERE e.project_id=? AND c.selected=1
        ORDER BY c.id DESC LIMIT 1`, row.id);
      return {
        id: row.id, title: row.title, description: row.description || "",
        coverPath: row.cover_path || "", status: row.status || "active", notes: row.notes || "",
        createdAt: row.created_at || "", updatedAt: row.updated_at || row.created_at || "",
        episodeCount: Number(row.episode_count || 0), completedEpisodes: Number(row.completed_episodes || 0),
        pageCount: Number(row.page_count || 0), shotCount: Number(row.shot_count || 0),
        selectedShots: Number(row.selected_shots || 0), pendingJobs: Number(row.pending_jobs || 0),
        latestEpisode: row.latest_episode || "尚未创建章节", latestEpisodeId: row.latest_episode_id || null,
        latestImagePath: image?.image_path || "",
      } as ProjectManagementItem;
    });
  const activities = all<any>(`SELECT e.project_id project_id, p.title project_title, e.title episode_title,
    e.created_at created_at FROM episodes e JOIN projects p ON p.id=e.project_id
    ORDER BY e.id DESC LIMIT 8`).map((row) => ({
    projectId: row.project_id, projectTitle: row.project_title, episodeTitle: row.episode_title, createdAt: row.created_at,
  }));
  return { projects, activities };
}

export function createProject(input: { title: string; description?: string; status?: string }) {
  const title = input.title.trim();
  if (!title) throw new Error("作品名称不能为空");
  const result = db.prepare("INSERT INTO projects(title,description,status,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)").run(
    title, input.description?.trim() || "", input.status === "completed" ? "completed" : "active",
  );
  const projectId = Number(result.lastInsertRowid);
  db.prepare("INSERT INTO episodes(project_id,title,kind,synopsis,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)").run(projectId, `${title} · 第 1 章`, "short", input.description?.trim() || "");
  return projectId;
}

export function updateProject(id: number, patch: Record<string, unknown>) {
  const allowed: Record<string, string> = { title: "title", description: "description", coverPath: "cover_path", status: "status", notes: "notes" };
  const values: (string | number)[] = [];
  const fields: string[] = [];
  for (const [key, column] of Object.entries(allowed)) if (patch[key] !== undefined) {
    if (key === "status" && !["active", "completed", "archived"].includes(String(patch[key]))) throw new Error("无效作品状态");
    if (key === "title" && !String(patch[key]).trim()) throw new Error("作品名称不能为空");
    fields.push(`${column}=?`); values.push(String(patch[key]).trim());
  }
  if (!fields.length) return;
  fields.push("updated_at=CURRENT_TIMESTAMP"); values.push(id);
  db.prepare(`UPDATE projects SET ${fields.join(",")} WHERE id=?`).run(...values);
}

export function duplicateProject(id: number) {
  const source = one<any>("SELECT title,description,status,notes FROM projects WHERE id=?", id);
  if (!source) throw new Error("作品不存在");
  const result = db.prepare("INSERT INTO projects(title,description,status,notes,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)").run(
    `${source.title} · 副本`, source.description, "active", source.notes,
  );
  const projectId = Number(result.lastInsertRowid);
  db.prepare("INSERT INTO episodes(project_id,title,kind,synopsis,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)").run(projectId, `${source.title} · 第 1 章`, "short", source.description || "");
  return projectId;
}

export function deleteProject(id: number) {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM candidates WHERE shot_id IN (SELECT s.id FROM shots s JOIN pages pg ON pg.id=s.page_id JOIN episodes e ON e.id=pg.episode_id WHERE e.project_id=?)").run(id);
    db.prepare("DELETE FROM jobs WHERE shot_id IN (SELECT s.id FROM shots s JOIN pages pg ON pg.id=s.page_id JOIN episodes e ON e.id=pg.episode_id WHERE e.project_id=?)").run(id);
    db.prepare("DELETE FROM text_layers WHERE page_id IN (SELECT pg.id FROM pages pg JOIN episodes e ON e.id=pg.episode_id WHERE e.project_id=?)").run(id);
    db.prepare("DELETE FROM shots WHERE page_id IN (SELECT pg.id FROM pages pg JOIN episodes e ON e.id=pg.episode_id WHERE e.project_id=?)").run(id);
    db.prepare("DELETE FROM pages WHERE episode_id IN (SELECT id FROM episodes WHERE project_id=?)").run(id);
    db.prepare("DELETE FROM timeline WHERE episode_id IN (SELECT id FROM episodes WHERE project_id=?)").run(id);
    db.prepare("DELETE FROM visual_planning_failures WHERE episode_id IN (SELECT id FROM episodes WHERE project_id=?)").run(id);
    db.prepare("DELETE FROM story_materials WHERE project_id=?").run(id);
    db.prepare("DELETE FROM series_memory WHERE project_id=?").run(id);
    db.prepare("DELETE FROM episodes WHERE project_id=?").run(id);
    db.prepare("DELETE FROM projects WHERE id=?").run(id);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
