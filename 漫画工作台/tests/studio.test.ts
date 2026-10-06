import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { analyzeStory } from "../lib/analysis";
import { assertVisualShape, inheritShotContinuity, normalizeShotSpec, rankInteractionPropCandidates, validateVisualIds } from "../lib/visual-planning";
import {
  analyzeGenerationPrompt,
  buildGenerationPrompt,
  buildRegionalPrompt,
  deriveInteractionContract,
  deriveInteractionContracts,
  expressionPrompt,
  inferGazeFromAction,
  inferHandsFromAction,
  validateShotHandVisibility,
  validateShotActionSpecificity,
  compactPrompt,
  sanitizeEnglishPrompt,
  suggestPromptFixes,
  buildSingleActionPoseSvg,
  classifyOutfitConditioning,
  buildCanonicalGenerationPrompt,
  buildCanonicalNegativePrompt,
  buildCanonicalNegativePromptTrace,
  derivePoseActionPlan,
  derivePoseFramingMode,
} from "../lib/prompts";
import { poseDisplayDetails } from "../lib/pose-display";
import {
  applyPoseControlOverride,
  buildPoseControlV2,
  derivePoseScenePlanV2,
  posePresetCatalog,
  validatePosePeople,
} from "../lib/pose-v2";

test("动作默认视线区分取物和交接，不从普通 hand 字样虚构交互人物", () => {
  for (const action of ["Reaching for a package on the shelf", "picking a cup up", "grabbing a bag"])
    assert.match(inferGazeFromAction(action), /object being reached for/);
  for (const action of ["hands at sides", "standing with a handbag", "reaching for a package"])
    assert.doesNotMatch(inferGazeFromAction(action), /other person|handover/);
  for (const action of ["offering an umbrella", "receiving a package", "handing over a cup"])
    assert.match(inferGazeFromAction(action), /handover target/);
  assert.match(inferGazeFromAction("reading a phone message"), /smartphone screen/);
  assert.match(inferGazeFromAction("reading a book"), /book pages/);
});

test("缺省手部遵循人物动作，伸手未接触时不强制提前接触", () => {
  for (const action of ["reaching for a package", "holding a cup", "pushing a door", "carrying a box"]) {
    assert.match(inferHandsFromAction(action), /hands visible/);
    assert.doesNotMatch(inferHandsFromAction(action), /contact|out of frame/);
  }
  assert.equal(inferHandsFromAction("portrait, hands out of frame"), "hands out of frame");
  assert.match(inferHandsFromAction("standing calmly"), /naturally positioned/);
});

test("人物局部动作驱动默认手部和视线，保留显式人工描述", () => {
  const data = getStudioData(1);
  const base = data.episode.pages[0].shots[0];
  const id = base.characterIds[0];
  const shot = {
    ...base, title: "取包裹", description: "独自从架子取包裹", scene: "室内架子旁",
    characterIds: [id], visualSpecConfirmed: false, visualSpec: undefined,
    actionEn: "standing calmly", cameraEn: "medium shot",
    characterLooks: { [id]: { ...base.characterLooks?.[id], actionEn: "Reaching for a package on the shelf", gazeEn: "", handsEn: "" } },
  };
  const fixed = suggestPromptFixes(shot as any, data.characters);
  assert.ok(fixed.characterLooks);
  assert.match(fixed.characterLooks[id].handsEn, /hands visible/);
  assert.match(fixed.characterLooks[id].gazeEn, /object being reached for/);
  const compiled = buildRegionalPrompt(shot as any, data.assets, data.characters);
  assert.doesNotMatch(compiled.prompt, /other person's hands|hands out of frame/);
  shot.characterLooks[id].gazeEn = "looking toward the window";
  shot.characterLooks[id].handsEn = "left hand relaxed beside the body";
  const explicit = suggestPromptFixes(shot as any, data.characters);
  assert.ok(explicit.characterLooks);
  assert.equal(explicit.characterLooks[id].gazeEn, "looking toward the window");
  assert.equal(explicit.characterLooks[id].handsEn, "left hand relaxed beside the body");
  shot.characterLooks[id].handsEn = "hands out of frame";
  assert.equal(validateShotHandVisibility(shot as any).length, 1);
  shot.characterLooks[id].handsEn = "one hand reaching for the package";
  assert.deepEqual(validateShotHandVisibility(shot as any), []);
  const otherId = "observer";
  const pair = {
    ...shot, description: "two people indoors", characterIds: [id, otherId],
    characterLooks: {
      ...shot.characterLooks,
      [otherId]: { actionEn: "standing calmly", handsEn: "hands out of frame", gazeEn: "looking toward the window" },
    },
  };
  assert.deepEqual(validateShotHandVisibility(pair as any), []);
  shot.characterLooks[id].handsEn = "hands out of frame";
  assert.equal(validateShotHandVisibility(pair as any).length, 1);
});

test("期待表情会编译为可见的笑容与眼神特征", () => {
  const cue = expressionPrompt("happy");
  assert.match(cue, /genuine happy anticipation/);
  assert.match(cue, /warm open smile/);
  assert.match(cue, /bright engaged eyes/);
});

test("近景动作骨骼不再强制生成全身且遵守左右位置", () => {
  const data = getStudioData(1);
  const base = data.episode.pages[0].shots[0];
  const shot = {
    ...base,
    camera: "近景",
    cameraEn: "close shot",
    visualSpecConfirmed: false,
    visualSpec: {
      ...(base.visualSpec || {}),
      camera: { shotSize: "close shot" },
      characters: [{ characterId: base.characterIds[0], position: "left side of the frame", region: { xStart: 0, xEnd: 1 }, action: "holding a smartphone", actionTarget: "phone notification", expression: "happy", gazeTarget: "phone screen", hands: "both hands holding the phone", occlusion: "none", appearanceState: { hair: "unchanged", bag: "none", accessories: [], glasses: "none", outerwearState: "none", condition: [] } }],
      visibleFacts: ["The phone screen shows a delivery notification."],
    },
    actionEn: "Looking at phone notification",
    description: "The phone screen shows a delivery notification.",
    characterLooks: { [base.characterIds[0]]: { ...base.characterLooks?.[base.characterIds[0]], positionEn: "left side of the frame", actionEn: "holding a smartphone with both hands", expressionEn: "happy", gazeEn: "eyes focused on the phone screen", handsEn: "both hands holding the smartphone" } },
  };
  const result = buildRegionalPrompt(shot as any, data.assets, data.characters);
  assert.ok(result.poseControl);
  assert.ok(result.poseControl!.people[0][10].y > 1);
  assert.match(result.prompt, /\bhappy\b/);
  assert.doesNotMatch(result.prompt, /warm open smile|bright engaged eyes/);
  assert.match(result.negativePrompt, /pointed ears/);
});

test("Regional 提示词自动移除混入的中文片段", () => {
  const cleaned = sanitizeEnglishPrompt("rainy street, 小粉抬手接伞, visible umbrella, 夜晚灯光");
  assert.equal(cleaned, "rainy street, visible umbrella");
  assert.doesNotMatch(cleaned, /[\u3400-\u9fff]/);
});
import {
  addCandidate,
  approveSdDraft,
  approveSdFinal,
  createEpisodeFromStory,
  createPersistentGenerationJob,
  createCharacter,
  buildCharacterAssetPrompt,
  characterAssetPromptMatches,
  createCharacterAssetJob,
  getCharacterAssetJob,
  addCharacterReference,
  updateCharacterProfile,
  updateCharacterOutfitPrompt,
  getGenerationJobRecord,
  getCandidateExport,
  getPaginatedJobs,
  getStudioData,
  queueCodexPage,
  recordBelongsToProject,
  updateGenerationJobPayload,
  updatePersistentGenerationJob,
  updateShot,
} from "../lib/db";

test("资产与Regional消费结构化身份档案而非强制成年模板", () => {
  const profile={agePresentationEn:"elderly man",faceShapeEn:"square face",skinToneEn:"deep brown skin",bodyTypeEn:"broad shoulders",distinguishingFeaturesEn:"small scar on left cheek",baseOutfitEn:"green coat",baseShoesEn:"brown boots"};
  const id=createCharacter({name:"Identity fixture",descriptionCn:"测试",appearanceEn:"gray-haired person",invariantsEn:["amber eyes"],visualTraits:{hairColorEn:"gray",hairStyleEn:"short hair",eyeColorEn:"amber eyes"},profile});
  for(const kind of ["face","turnaround","expressions","outfit","shoes"] as const) {
    const result=buildCharacterAssetPrompt(id,kind)!;
    for(const value of [...Object.values(profile).slice(0,5),"amber eyes"]) assert.ok(result.prompt.includes(value),`${kind}: ${value}`);
    assert.doesNotMatch(result.prompt,/same adult person|one adult person/);
    assert.doesNotMatch(result.negativePrompt,/\bchild\b/);
    for(const trait of ["gray","short hair","amber eyes"]) assert.ok(result.prompt.includes(trait));
    if(kind==="face" || kind==="expressions") assert.doesNotMatch(result.negativePrompt,/cropped clothing|cropped shoes/);
    if(kind==="turnaround" || kind==="expressions") assert.doesNotMatch(result.negativePrompt,/duplicate person|multiple people|multiple views/);
    if(kind==="outfit") assert.match(result.negativePrompt,/cropped clothing/);
    if(kind==="shoes") assert.match(result.negativePrompt,/cropped shoes/);
    if(kind==="turnaround" || kind==="outfit") {
      assert.match(result.prompt,/green coat/);
      assert.match(result.prompt,/brown boots/);
    }
    if(kind==="face" || kind==="expressions") {
      assert.match(result.prompt,/visible neckline/);
      assert.doesNotMatch(result.prompt,/brown boots/);
    }
  }
  const data=getStudioData();const character=data.characters.find(c=>c.id===id)!;
  const shot={...data.episode.pages[0].shots[0],characterIds:[id],characterLooks:{},visualSpecConfirmed:false};
  assert.match(buildRegionalPrompt(shot,data.assets,[character]).characterRegions[0].prompt,/elderly man/);
});

test("结构化身份变更失效旧母版，旧任务配方不匹配当前档案", () => {
  const input={name:"Version fixture",descriptionCn:"测试",conceptCn:"测试",notes:"",appearanceEn:"adult person",invariantsEn:["brown eyes"],visualTraits:{hairColorEn:"black",hairStyleEn:"short",eyeColorEn:"brown"},profile:{faceShapeEn:"oval face"},confirm:true};
  const id=createCharacter(input);
  updateCharacterProfile(id,input);
  addCharacterReference(id,"face","workspace/identity-version-test.png");
  const old=buildCharacterAssetPrompt(id,"face")!;
  const job={prompt:old.prompt,negative_prompt:old.negativePrompt};
  assert.equal(characterAssetPromptMatches(job,old),true);
  updateCharacterProfile(id,{...input,notes:"nonvisual note"});
  assert.equal(characterAssetPromptMatches(job,buildCharacterAssetPrompt(id,"face")),true);
  assert.ok("id" in createCharacterAssetJob(id,"outfit"));
  updateCharacterProfile(id,{...input,profile:{faceShapeEn:"square face"}});
  assert.equal(characterAssetPromptMatches(job,buildCharacterAssetPrompt(id,"face")),false);
  assert.ok("error" in createCharacterAssetJob(id,"shoes"));
  assert.equal(characterAssetPromptMatches(null,old),false);
});

test("两种档案入口使旧基础衣物失效且保留身份母版", () => {
  const input={name:"Wardrobe version fixture",descriptionCn:"测试",conceptCn:"测试",notes:"",appearanceEn:"adult person",invariantsEn:[],visualTraits:{hairColorEn:"black",hairStyleEn:"short",eyeColorEn:"brown"},profile:{baseOutfitEn:"green coat",baseShoesEn:"brown boots",outfitNegativeEn:""},confirm:true};
  const id=createCharacter(input); updateCharacterProfile(id,input);
  const seed=()=>{for(const type of ["face","turnaround","expressions","outfit","shoes"]) addCharacterReference(id,type,`workspace/wardrobe-${type}.png`);};
  const character=()=>getStudioData().characters.find(c=>c.id===id)!;
  const confirmed=(type:string)=>character().references.find(r=>r.type===type)?.confirmed;
  seed(); const master=character().identityMasterReferenceId;
  updateCharacterOutfitPrompt(id,input.profile);
  assert.equal(confirmed("outfit"),true);
  updateCharacterOutfitPrompt(id,{...input.profile,baseOutfitEn:"blue jacket"});
  assert.equal(confirmed("outfit"),false); assert.equal(confirmed("turnaround"),false);
  assert.equal(confirmed("shoes"),true); assert.equal(confirmed("face"),true);
  assert.equal(character().identityMasterReferenceId,master);
  assert.equal(getStudioData().assets.find(a=>a.id===`${id}_base_outfit`)?.confirmed,false);
  seed();
  updateCharacterProfile(id,{...input,profile:{...input.profile,baseOutfitEn:"blue jacket",baseShoesEn:"white sneakers"}});
  for(const type of ["outfit","turnaround","shoes"]) assert.equal(confirmed(type),false);
  assert.equal(confirmed("face"),true); assert.equal(confirmed("expressions"),true);
  assert.equal(character().status,"draft");
  assert.equal(getStudioData().assets.find(a=>a.id===`${id}_base_shoes`)?.confirmed,false);
});

test("通用人物使用稳定ID并在确认档案后开放正脸任务", () => {
  const id = createCharacter({
    name: "中文人物",
    descriptionCn: "测试人物",
    appearanceEn: "adult woman with short black hair and green eyes",
    invariantsEn: ["adult woman", "short black hair", "green eyes"],
    visualTraits: { hairColorEn: "black hair", hairStyleEn: "short hair", eyeColorEn: "green eyes" },
    conceptCn: "沉静的成年女性",
    profile: { baseOutfitEn: "navy office dress", baseShoesEn: "black low heels" },
  });
  assert.match(id, /^character_/);
  assert.doesNotMatch(id, /中文人物/);
  assert.equal("error" in createCharacterAssetJob(id, "face"), true);
  assert.equal(updateCharacterProfile(id, {
    name: "中文人物", descriptionCn: "测试人物", conceptCn: "沉静的成年女性", notes: "",
    appearanceEn: "adult woman with short black hair and green eyes",
    invariantsEn: ["adult woman", "short black hair", "green eyes"],
    visualTraits: { hairColorEn: "black hair", hairStyleEn: "short hair", eyeColorEn: "green eyes" },
    profile: { baseOutfitEn: "navy office dress", baseShoesEn: "black low heels" }, confirm: true,
  }), true);
  const faceJob = createCharacterAssetJob(id, "face");
  assert.ok("id" in faceJob);
  assert.equal(typeof faceJob.id, "number");
  assert.equal(getCharacterAssetJob(faceJob.id!).provider, "sd");
  assert.equal(getCharacterAssetJob(faceJob.id!).prompt,buildCharacterAssetPrompt(id,"face")!.prompt);
  assert.equal(getCharacterAssetJob(faceJob.id!).negative_prompt,buildCharacterAssetPrompt(id,"face")!.negativePrompt);
  assert.equal("error" in createCharacterAssetJob(id, "outfit"), true);
  assert.equal(addCharacterReference(id, "face", "workspace/test-face.png"), true);
  const outfitJob = createCharacterAssetJob(id, "outfit", "codex-imagegen");
  assert.ok("id" in outfitJob);
  assert.equal(typeof outfitJob.id, "number");
  assert.equal(getCharacterAssetJob(outfitJob.id!).provider, "codex-imagegen");
});

test("视觉规格保留人工选择并拒绝虚构资产", () => {
  const data = getStudioData();
  const shot = data.episode.pages[0].shots[0];
  const spec = normalizeShotSpec({
    characters: [{ characterId: shot.characterIds[0], outfitId: "invented", action: "walking", region: { xStart: 0.1, xEnd: 0.9 } }],
    scene: {}, camera: {}, visibleFacts: [], stateChanges: [], warnings: [],
  }, shot);
  assert.equal(spec.characters[0].outfitId, "invented");
  const validation = validateVisualIds(spec, data.characters, data.assets);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /未知服装/);
});

test("长篇灵感会被识别为素材", () => {
  assert.equal(
    analyzeStory("以后有一天也许小粉会发现家族秘密，这只是一个灵感。").kind,
    "长篇素材",
  );
});

test("多人物章节把配角绑定到相关分格", () => {
  const analysis = analyzeStory(
    "小粉在车站遇见陌生女孩。陌生女孩把雨伞递给小粉。两人一起回家。",
  );
  const episodeId = createEpisodeFromStory(
    "小粉在车站遇见陌生女孩。陌生女孩把雨伞递给小粉。两人一起回家。",
    analysis,
    "current_series",
    1,
  );
  const data = getStudioData(1, episodeId);
  const supporting = data.characters.find(
    (character) => character.name === "陌生女孩",
  );
  assert.ok(supporting);
  assert.ok(
    data.episode.pages
      .flatMap((page) => page.shots)
      .some((shot) => shot.characterIds.includes(supporting.id)),
  );
});

test("提示词包含全部绑定人物且不含中文", () => {
  const data = getStudioData(1);
  const shot = {
    ...data.episode.pages[0].shots[0],
    characterIds: ["character_xiaofen", "character_support"],
    actionEn:
      "Xiaofen stands on the left holding an umbrella while the second woman stands on the right",
    expressionEn: "both women look at each other with calm expressions",
    sceneEn: "rainy city street",
    compositionEn: "two women separated with clear space between them",
  };
  const characters = [
    ...data.characters,
    {
      id: "character_support",
      name: "配角",
      descriptionCn: "",
      appearanceEn: "adult woman with short black hair and green eyes",
      invariantsEn: [],
      status: "draft" as const,
      visualTraits: {
        hairColorEn: "black hair",
        hairStyleEn: "short hair",
        eyeColorEn: "green eyes",
      },
      references: [],
    },
  ];
  const result = buildGenerationPrompt(shot, data.assets, characters);
  assert.match(result.prompt, /exactly 2 .*foreground principal people/);
  assert.match(result.prompt, /short hair black hair|short black hair/);
  assert.doesNotMatch(result.prompt, /[\u3400-\u9fff]/);
});

test("Regional Prompter 公共区保留完整场景且人物属性只进入各自分区", () => {
  const data = getStudioData(1);
  const support = {
    id: "character_support_regional",
    name: "配角",
    descriptionCn: "",
    appearanceEn: "adult woman with oval face, short black hair and green eyes",
    invariantsEn: [],
    status: "draft" as const,
    visualTraits: {
      hairColorEn: "black hair",
      hairStyleEn: "short hair",
      eyeColorEn: "green eyes",
    },
    references: [],
  };
  const shot = {
    ...data.episode.pages[0].shots[0],
    description: "In active rain, the woman on the right offers an umbrella to the woman on the left",
    scene: "rainy city street",
    characterIds: ["character_xiaofen", support.id],
    camera: "中景",
    cameraEn: "medium shot",
    characterLooks: {
      character_xiaofen: {
        outfitId: "",
        shoeId: "",
        hairColorEn: "pink hair",
        hairStyleEn: "long hair",
        eyeColorEn: "blue eyes",
        positionEn: "on the left side",
        actionEn: "offering an umbrella to the woman on the right",
        expressionEn: "warm concerned expression",
        gazeEn: "looking at the woman on the right",
        handsEn: "right hand holding out an umbrella",
      },
      [support.id]: {
        outfitId: "",
        shoeId: "",
        hairColorEn: "black hair",
        hairStyleEn: "short hair",
        eyeColorEn: "green eyes",
        positionEn: "on the right side",
        actionEn: "reaching toward the offered umbrella",
        expressionEn: "grateful surprised expression",
        gazeEn: "looking at the woman on the left",
        handsEn: "left hand reaching toward the umbrella",
      },
    },
  };
  const result = buildRegionalPrompt(shot, data.assets, [
    ...data.characters,
    support,
  ]);
  assert.match(result.basePrompt, /exactly 2 clearly rendered foreground principal people/);
  assert.match(result.basePrompt, /foreground|pavement|door edge/i);
  assert.match(result.basePrompt, /sidewalk|street furniture|crosswalk|reception/i);
  assert.match(result.basePrompt, /background|storefronts|corridor/i);
  assert.doesNotMatch(result.basePrompt, /pink hair|blue eyes|black hair|green eyes/i);
  assert.match(result.regionPrompts[0], /pink hair/);
  assert.match(result.regionPrompts[0], /woman on the right/);
  assert.match(result.regionPrompts[1], /black hair/);
  assert.match(result.regionPrompts[1], /woman on the left/);
  assert.match(result.basePrompt, /umbrella handover/);
  assert.match(result.basePrompt, /fine diagonal rain streaks|active rain visibly falling/);
  assert.match(result.basePrompt, /sparse tiny blurred anonymous pedestrian/);
  assert.match(result.basePrompt, /strict waist-up framing/);
  assert.doesNotMatch(result.basePrompt, /knee-up narrative framing/);
  assert.match(result.negativePrompt, /fused hands/);
  assert.match(result.negativePrompt, /dry pavement/);
  assert.match(result.negativePrompt, /holding hands/);
  assert.ok(result.poseControl);
  assert.equal(result.poseControl!.people.length, 2);
  const receiverWrist = result.poseControl!.people[0][7];
  const giverWrist = result.poseControl!.people[1][4];
  assert.ok(Math.abs(receiverWrist.x - giverWrist.x) < 0.06);
  assert.ok(receiverWrist.x < giverWrist.x);
  assert.ok(result.assetWarnings.some((warning) => /服装资产/.test(warning)));
  for (const region of result.characterRegions)
    assert.ok(region.assetBindings.every((binding) => binding.characterId === region.characterId));
  assert.equal(result.prompt.split(" BREAK ").length, 3);
});

test("雨伞互动提示词保护面部可读性且不再要求中景显示全身", () => {
  const data = getStudioData(1);
  const supporting = data.characters.find((item) => item.id !== "character_xiaofen");
  assert.ok(supporting);
  const shot = {
    ...data.episode.pages[0].shots[0],
    title: "雨中递伞",
    description: "两人在雨夜街道交接雨伞",
    scene: "雨夜街道",
    camera: "中景",
    characterIds: ["character_xiaofen", supporting.id],
  };
  const result = buildRegionalPrompt(shot, data.assets, data.characters);
  assert.match(result.commonPrompt, /strict (?:waist-up framing|crop at the waist)/);
  assert.match(result.commonPrompt, /motivated directional key light|scene|bounce light/);
  assert.match(result.commonPrompt, /medium shot|close-up|wide shot/);
  assert.doesNotMatch(result.commonPrompt, /knees and five fingers/);
  assert.doesNotMatch(result.negativePrompt, /deep shadow across eyes|umbrella edge crossing a face/);
});

test("递伞剧情会把通用站姿修复为双方对应的交互动作", () => {
  const data = getStudioData(1);
  const supporting = data.characters.find((item) => item.id !== "character_xiaofen");
  assert.ok(supporting);
  const shot = {
    ...data.episode.pages[0].shots[0],
    description: "她正准备冒雨回家，一位陌生女孩把伞递给了她",
    scene: "雨中的街道",
    characterIds: ["character_xiaofen", supporting.id],
    characterLooks: {
      character_xiaofen: {
        ...data.episode.pages[0].shots[0].characterLooks.character_xiaofen,
        actionEn: "standing in a relaxed three-quarter pose, shoulders level, hands out of frame",
        expressionEn: "gentle, natural expression",
        gazeEn: "looking toward the story focus",
        handsEn: "hands out of frame",
      },
      [supporting.id]: {
        outfitId: "", shoeId: "", hairColorEn: "silver-gray hair", hairStyleEn: "long straight hair",
        eyeColorEn: "blue eyes", positionEn: "on the right side",
        actionEn: "standing in a relaxed three-quarter pose, shoulders level, hands out of frame",
        expressionEn: "gentle, natural expression", gazeEn: "looking toward the story focus",
        handsEn: "hands out of frame",
      },
    },
  };
  const fixed = suggestPromptFixes(shot, data.characters);
  assert.match(fixed.characterLooks!.character_xiaofen.actionEn, /accept the offered umbrella/);
  assert.match(fixed.characterLooks![supporting.id].actionEn, /offering the other person an open umbrella/);
  assert.match(fixed.characterLooks!.character_xiaofen.gazeEn, /person offering/);
  assert.match(fixed.characterLooks![supporting.id].handsEn, /extending the umbrella handle/);
  assert.match(fixed.characterLooks!.character_xiaofen.expressionEn, /surprised and grateful/);
  assert.match(fixed.characterLooks![supporting.id].expressionEn, /kind reassuring/);
});

test("人物未显式保存ID时自动采用自己的已确认基础服装与鞋履", () => {
  const data = getStudioData(1);
  const character = {
    ...data.characters[0],
    id: "character_auto_base",
    name: "基础款人物",
    profile: {
      ...data.characters[0].profile!,
      baseOutfitEn: "white tie-neck blouse and pale pink pencil skirt",
      baseShoesEn: "rose-pink pointed high heels",
    },
  };
  const assets = [
    ...data.assets,
    {
      id: `${character.id}_base_outfit`, type: "outfit", name: "基础服装", path: "workspace/base-outfit.png",
      tags: [], characterId: character.id, visualDescriptionEn: "character-specific complete base outfit",
      defaultShoeId: "", confirmed: true, qualityStatus: "complete_outfit" as const,
    },
    {
      id: `${character.id}_base_shoes`, type: "shoes", name: "基础鞋履", path: "workspace/base-shoes.png",
      tags: [], characterId: character.id, visualDescriptionEn: "character-specific base footwear",
      defaultShoeId: "", confirmed: true, qualityStatus: "partial_footwear" as const,
    },
  ];
  const shot = {
    ...data.episode.pages[0].shots[0],
    characterIds: [character.id],
    outfitId: "XF-WORK-01",
    shoeId: "XF-SHOE-05",
    characterLooks: {
      [character.id]: {
        outfitId: "", shoeId: "", hairColorEn: "black hair", hairStyleEn: "long hair",
        eyeColorEn: "brown eyes", positionEn: "centered", actionEn: "standing upright",
        expressionEn: "calm expression", gazeEn: "looking forward", handsEn: "hands visible",
      },
    },
  };
  const result = buildRegionalPrompt(shot, assets, [character]);
  const region = result.characterRegions[0];
  assert.equal(region.assetWarnings.length, 0);
  assert.ok(region.assetBindings.some((binding) => binding.assetId === `${character.id}_base_outfit`));
  assert.ok(region.assetBindings.some((binding) => binding.assetId === `${character.id}_base_shoes`));
  assert.match(region.prompt, /white tie-neck blouse and pale pink pencil skirt/);
  assert.match(region.prompt, /wearing white tie-neck blouse and pale pink pencil skirt/);
  assert.match(region.prompt, /rose-pink pointed high heels/);
  assert.doesNotMatch(region.prompt, /character-specific complete base outfit/);
});

test("单人提示词强制人数与拼贴负面约束", () => {
  const data = getStudioData(1);
  const shot = {
    ...data.episode.pages[0].shots[0],
    title: "小粉独自站在出口",
    description: "小粉独自在办公室出口等待雨停",
    dialogue: "",
    characterIds: ["character_xiaofen"],
    actionEn:
      "standing three-quarter view, right hand holding a closed umbrella",
    expressionEn: "gentle closed-mouth smile, looking toward the viewer",
    sceneEn: "office lobby near the exit",
    compositionEn: "single woman centered with clear space above her shoulders",
  };
  const result = buildGenerationPrompt(shot, data.assets, data.characters);
  assert.equal(result.quality.valid, true);
  assert.match(result.prompt, /exactly one foreground person, solo/);
  assert.match(result.negativePrompt, /extra person/);
  assert.match(result.negativePrompt, /character sheet/);
});

test("查看手机动作会约束头部瞳孔朝向并排除镜头眼神",()=>{
  const data=getStudioData(1),shot={...data.episode.pages[0].shots[0],characterIds:["character_xiaofen"],actionEn:"holding a smartphone and reading a new message",characterLooks:{}};
  const result=buildGenerationPrompt(shot,data.assets,data.characters);
  assert.match(result.prompt,/eyes focused on the smartphone screen/);
  assert.match(result.prompt,/pupils directed downward/);
  assert.match(result.negativePrompt,/eye contact with camera/);
  assert.doesNotMatch(result.prompt,/looking slightly toward the viewer/);
  assert.match(result.prompt,/one smartphone/);
  assert.match(result.negativePrompt,/folded hands/);
});

test("道具交互契约可泛化到阅读物且绑定手、物与视线",()=>{
  const data=getStudioData(1),shot={...data.episode.pages[0].shots[0],characterIds:["character_xiaofen"],actionEn:"reading an open book on the sofa",characterLooks:{}};
  const contract=deriveInteractionContract(shot,"character_xiaofen");
  assert.equal(contract.required,true);
  assert.equal(contract.object,"book");
  assert.equal(contract.shape,"landscape_rect");
  assert.equal(contract.characterId,"character_xiaofen");
  assert.ok(contract.objectCenter.y>.5);
  assert.deepEqual(contract.region,{xStart:0,xEnd:1});
  assert.match(contract.positive.join(" "),/supported by visible hands/);
  assert.match(contract.negative.join(" "),/hands resting together in lap/);
});

test("单人区域提示不混入双人交接模板",()=>{
  const data=getStudioData(1),shot={...data.episode.pages[0].shots[0],characterIds:["character_xiaofen"],actionEn:"holding a smartphone and reading a notification",characterLooks:{}};
  const result=buildRegionalPrompt(shot,data.assets,data.characters);
  assert.match(result.commonPrompt,/exactly one foreground person/);
  assert.doesNotMatch(result.commonPrompt,/both faces|handover centered|both people/);
  assert.doesNotMatch(result.regionPrompts[0],/other woman/);
  assert.equal(result.repairPasses.propInteraction?.object,"smartphone");
  assert.equal(result.repairPasses.propInteraction?.shape,"portrait_rect");
  assert.equal(result.repairPasses.propInteraction?.purpose,"read");
  assert.equal(result.repairPasses.propInteraction?.orientation,"portrait");
  assert.match(result.poseControl?.kind||"",/single_action/);
  const wrists=result.poseControl!.people[0];
  assert.ok(Math.abs(wrists[4].x-.5)<.1&&Math.abs(wrists[7].x-.5)<.1);
  assert.match(result.repairPasses.propInteraction?.gaze||"",/smartphone screen/);
  assert.match(result.repairPasses.propInteraction?.gaze||"",/pupils directed downward/);
  assert.match(result.repairPasses.propInteraction?.affordance||"",/portrait orientation/);
});

test("同一道具会按用途切换横竖、手数、朝向与视线",()=>{
  const data=getStudioData(1),base={...data.episode.pages[0].shots[0],characterIds:["character_xiaofen"],characterLooks:{}};
  const video=deriveInteractionContract({...base,actionEn:"watching a video on a smartphone in landscape mode"},"character_xiaofen");
  assert.equal(video.purpose,"watch");assert.equal(video.orientation,"landscape");assert.equal(video.handMode,"two");assert.equal(video.gazeMode,"object");
  const call=deriveInteractionContract({...base,actionEn:"making a phone call with the smartphone beside her ear"},"character_xiaofen");
  assert.equal(call.purpose,"call");assert.equal(call.handMode,"one");assert.equal(call.gazeMode,"independent");assert.equal(call.viewerSurface,"side");
  const capture=deriveInteractionContract({...base,actionEn:"using a smartphone to photograph a flower"},"character_xiaofen");
  assert.equal(capture.purpose,"capture");assert.equal(capture.orientation,"contextual");assert.equal(capture.viewerSurface,"screen");
});

test("任务304式通知阅读不会被 wearing 中的 ear 误判为通话",()=>{
  const data=getStudioData(1),base=data.episode.pages[0].shots[0];
  const shot={...base,characterIds:["character_xiaofen"],actionEn:"Looking at phone notification",description:"The phone screen shows a delivery notification. She is wearing a cream-yellow top.",characterLooks:{character_xiaofen:{outfitId:"XF-CASUAL-01",shoeId:"XF-SHOE-10",hairColorEn:"soft pink hair",hairStyleEn:"long hair",eyeColorEn:"pink-brown eyes",positionEn:"center",actionEn:"holding a smartphone with both hands in front of her chest",expressionEn:"happy",gazeEn:"eyes focused on the phone screen",handsEn:"both visible hands holding the smartphone"}}};
  const contract=deriveInteractionContract(shot,"character_xiaofen");
  assert.equal(contract.purpose,"read");
  assert.equal(contract.handMode,"two");
  assert.equal(contract.gazeMode,"object");
  assert.equal(contract.viewerSurface,"screen");
  assert.doesNotMatch(contract.positive.join(" "),/interaction purpose call|beside one ear/);
});

test("明确举到耳边的手机通话仍分类为 call",()=>{
  const data=getStudioData(1),base={...data.episode.pages[0].shots[0],characterIds:["character_xiaofen"],characterLooks:{}};
  const contract=deriveInteractionContract({...base,actionEn:"answering a phone call with the smartphone held beside her ear"},"character_xiaofen");
  assert.equal(contract.purpose,"call");
  assert.equal(contract.handMode,"one");
  assert.equal(contract.gazeMode,"independent");
});

test("道具契约只消费已确认且属于当前人物的关系，不把全局道具分配给旁观者", () => {
  const data = getStudioData(1);
  const base = data.episode.pages[0].shots[0];
  for (const propId of ["smartphone", "package", "umbrella"]) {
    const shot: any = {
      ...base, characterIds: ["actor", "observer"], actionEn: `actor holding a ${propId}`,
      description: `actor holding a ${propId}, observer standing nearby`,
      compositionEn: `${propId} visible in the scene`, visualSpecConfirmed: true,
      characterLooks: {
        actor: { actionEn: `holding a ${propId}`, handsEn: `both hands holding the ${propId}` },
        observer: { actionEn: "standing calmly", handsEn: "hands out of frame", gazeEn: "looking toward the window" },
      },
      visualSpec: { characters: [], visibleFacts: [`${propId} visible`], interactions: [],
        interaction: { actorCharacterId: "actor", propId, type: "prop_use", contactPoint: "both hands" } },
    };
    assert.equal(deriveInteractionContract(shot, "actor").required, true);
    assert.equal(deriveInteractionContract(shot, "observer").required, false);
    assert.deepEqual(validateShotHandVisibility(shot), []);
    shot.visualSpecConfirmed = false;
    shot.characterLooks.actor.actionEn = "standing calmly";
    shot.characterLooks.actor.handsEn = "hands at sides";
    assert.equal(deriveInteractionContract(shot, "actor").required, false);
    assert.equal(deriveInteractionContract(shot, "observer").required, false);
  }
});

test("缺省位置跟随最终区域而不是人物序号", () => {
  const base = getStudioData(1).episode.pages[0].shots[0];
  for (const regions of [
    [{ xStart: 0, xEnd: 1 }],
    [{ xStart: .6, xEnd: 1 }, { xStart: 0, xEnd: .4 }],
    [{ xStart: 0, xEnd: .3 }, { xStart: .3, xEnd: .7 }, { xStart: .7, xEnd: 1 }],
  ]) {
    const ids = regions.map((_, index) => `actor_${index}`);
    const shot = { ...base, characterIds: ids, characterLooks: {} };
    const spec = normalizeShotSpec({ characters: ids.map((id, index) => ({ characterId: id, region: regions[index] })) }, shot);
    spec.characters.forEach((character, index) => {
      const center = (regions[index].xStart + regions[index].xEnd) / 2;
      assert.match(character.position, center < .5 ? /left/ : center > .5 ? /right/ : /center/);
      assert.deepEqual(character.region, regions[index]);
    });
  }
});

test("规范化保留每个人物的动作和表情，不用整格描述覆盖人物规格", () => {
  const base = getStudioData(1).episode.pages[0].shots[0];
  const shot: any = { ...base, characterIds: ["giver", "receiver"], characterLooks: {},
    actionEn: "giving and receiving an umbrella", expressionEn: "happy" };
  const raw = { characters: [
    { characterId: "giver", action: "offering an umbrella", expression: "reassuring" },
    { characterId: "receiver", action: "reaching to accept the umbrella", expression: "surprised" },
  ] };
  const spec = normalizeShotSpec(raw, shot);
  assert.deepEqual(spec.characters.map(item => item.action), raw.characters.map(item => item.action));
  assert.deepEqual(spec.characters.map(item => item.expression), ["reassuring", "surprised"]);
  shot.characterLooks = { giver: { actionEn: "holding the umbrella steady", expressionEn: "concerned" } };
  const edited = normalizeShotSpec(raw, shot);
  assert.equal(edited.characters[0].action, "holding the umbrella steady");
  assert.equal(edited.characters[0].expression, "concerned");
  assert.equal(edited.characters[1].action, raw.characters[1].action);
  const single = normalizeShotSpec({ characters: [{ characterId: "giver" }] }, { ...shot, characterIds: ["giver"], characterLooks: {} });
  assert.equal(single.characters[0].action, shot.actionEn);
  const withObserver = normalizeShotSpec({
    visibleFacts: ["giver holding a smartphone"],
    characters: [
      { characterId: "giver", action: "holding a smartphone", hands: "both hands holding the smartphone" },
      { characterId: "receiver", action: "standing calmly", hands: "hands resting naturally" },
    ],
  }, { ...shot, characterLooks: {} });
  assert.deepEqual(withObserver.interactions.map(item => item.actorCharacterId), ["giver"]);
  const missing = normalizeShotSpec({ characters: [] }, { ...shot, characterLooks: {} });
  assert.ok(missing.characters.every(item => item.action !== shot.actionEn && item.expression !== shot.expressionEn));
});

test("分镜编排指令必须先变为具体人物动作，确认规格或人工动作可解除阻断", () => {
  const base = getStudioData(1).episode.pages[0].shots[0];
  const shot: any = { ...base, characterIds: ["actor"], characterLooks: {}, visualSpecConfirmed: false,
    actionEn: "show the active character beginning one concrete story-changing action, clearly different from the previous pose" };
  assert.equal(validateShotActionSpecificity(shot).length, 1);
  for (const action of [
    "establish the exact starting positions, distance, facing directions, and immediate goal",
    "show the other character's immediate visible reaction through gaze, expression, hands, and body distance",
    "reveal the key prop, contact point, or environmental change that explains how the event happens",
    "show the visible result with changed character, prop, or spatial state and establish direction into the next panel",
  ]) assert.equal(validateShotActionSpecificity({ ...shot, actionEn: action }).length, 1);
  shot.visualSpec = { characters: [{ characterId: "actor", action: "reaching for a package on the shelf" }] };
  assert.equal(validateShotActionSpecificity(shot).length, 1);
  shot.visualSpecConfirmed = true;
  assert.deepEqual(validateShotActionSpecificity(shot), []);
  shot.visualSpecConfirmed = false;
  shot.characterLooks = { actor: { actionEn: "walking along the sidewalk" } };
  assert.deepEqual(validateShotActionSpecificity(shot), []);
});

test("结构化视线事实源区分 object、work_point、target 与 independent",()=>{
  const data=getStudioData(1),original=data.episode.pages[0].shots[0],characterId="character_xiaofen";
  const shotFor=(id:number,actionEn:string)=>({...original,id,characterIds:[characterId],actionEn,description:"",camera:"远景",cameraEn:"wide shot",visualSpecConfirmed:false,characterLooks:{}});
  const cases=[
    {kind:"object" as const,shot:shotFor(2481,"reading an open book"),source:"interaction.object_center"},
    {kind:"work_point" as const,shot:shotFor(2482,"using a screwdriver to tighten a screw"),source:"interaction.surface_normal_work_point"},
    {kind:"target" as const,shot:shotFor(2483,"scanning a QR code with a smartphone"),source:"interaction.surface_normal_target"},
    {kind:"independent" as const,shot:shotFor(2484,"answering a phone call with the smartphone beside her ear"),source:"interaction.independent"},
  ];
  for(const item of cases){
    const contract=deriveInteractionContract(item.shot,characterId);
    assert.equal(contract.gazeTarget.kind,item.kind);
    assert.equal(contract.gazeTarget.source,item.source);
    assert.equal(contract.gazeMode,item.kind);
    if(item.kind==="independent"){
      assert.equal(contract.gazeTarget.point,null);
      assert.equal(contract.gazeTarget.targetId,null);
    }else{
      assert.ok(contract.gazeTarget.point);
      assert.ok(contract.gazeTarget.targetId);
      if(item.kind==="object") assert.deepEqual(contract.gazeTarget.point,contract.objectCenter);
      else assert.notDeepEqual(contract.gazeTarget.point,contract.objectCenter);
    }
    const pose=buildPoseControlV2(item.shot,[{
      relationId:contract.relationId,characterId,required:contract.required,object:contract.object,purpose:contract.purpose,
      handMode:contract.handMode,objectCenter:contract.objectCenter,region:contract.region,gazeMode:contract.gazeMode,gazeTarget:contract.gazeTarget,
      activeHand:contract.activeHand,objectInstanceId:contract.objectInstanceId,contactAnchors:contract.contactAnchors,
    }])!;
    assert.deepEqual(pose.scenePlan.people[0].gazeTarget,contract.gazeTarget);
    assert.deepEqual(pose.scenePlan.people[0].headDirection.target,contract.gazeTarget.point);
    const nose=pose.people[0][0],direction=pose.scenePlan.people[0].headDirection;
    if(contract.gazeTarget.point){
      assert.ok(Math.abs(direction.dx-(contract.gazeTarget.point.x-nose.x))<1e-9);
      assert.ok(Math.abs(direction.dy-(contract.gazeTarget.point.y-nose.y))<1e-9);
    }else{
      assert.equal(direction.dx,0);
      assert.equal(direction.dy,0);
      assert.equal(direction.mode,"camera");
    }
  }

  const noMode=derivePoseScenePlanV2(shotFor(2485,"holding a story object"),[{
    characterId,required:true,object:"story object",purpose:"carry",handMode:"one",objectCenter:{x:.18,y:.78},region:{xStart:0,xEnd:1},
  }])!;
  assert.equal(noMode.people[0].gazeTarget.kind,"independent");
  assert.equal(noMode.people[0].gazeTarget.point,null);
  assert.equal(noMode.people[0].headDirection.target,null);
  assert.notDeepEqual(noMode.people[0].headDirection.target,{x:.18,y:.78});

  const legacyMode=derivePoseScenePlanV2(shotFor(2486,"reading a legacy story object"),[{
    characterId,required:true,object:"legacy story object",purpose:"read",handMode:"two",objectCenter:{x:.44,y:.61},region:{xStart:0,xEnd:1},gazeMode:"object",
  }])!;
  assert.equal(legacyMode.people[0].gazeTarget.source,"legacy.interaction.gaze_mode_object_center");
  assert.deepEqual(legacyMode.people[0].gazeTarget.point,{x:.44,y:.61});
});

test("景别重排和人工方向覆盖后 headDirection 始终由最终结构化目标计算",()=>{
  const data=getStudioData(1),original=data.episode.pages[0].shots[0],characterId="character_xiaofen";
  const shot={...original,id:2487,characterIds:[characterId],actionEn:"holding a smartphone and reading a message",description:"",camera:"近景",cameraEn:"close shot",visualSpecConfirmed:false,characterLooks:{}};
  const rawContract=deriveInteractionContract(shot,characterId);
  const regional=buildRegionalPrompt(shot,data.assets,data.characters);
  const framedContract=regional.repairPasses.propInteraction!;
  const pose=regional.poseControl!;
  assert.equal(framedContract.gazeTarget.kind,"object");
  assert.ok(framedContract.gazeTarget.point && rawContract.gazeTarget.point);
  assert.ok(Math.abs(framedContract.gazeTarget.point!.y-.435)<1e-9);
  assert.deepEqual(framedContract.gazeTarget.point,framedContract.objectCenter);
  assert.ok(framedContract.contactAnchors.every((anchor)=>Math.abs(anchor.y-.47)<1e-9));
  assert.ok(framedContract.contactAnchors.every((anchor)=>anchor.y>framedContract.objectCenter.y));
  assert.ok(pose.scenePlan.people[0].relationTargets[0].wristAssignments?.every((assignment)=>Math.abs(assignment.y-.47)<1e-9));
  assert.deepEqual(pose.scenePlan.people[0].gazeTarget,framedContract.gazeTarget);
  const assertDirectionMatchesFinalPose=(value:typeof pose)=>{
    const personPlan=value.scenePlan.people[0],nose=value.people[0][0],target=personPlan.gazeTarget.point;
    assert.deepEqual(personPlan.headDirection.target,target);
    assert.ok(target);
    assert.ok(Math.abs(personPlan.headDirection.dx-(target!.x-nose.x))<1e-9);
    assert.ok(Math.abs(personPlan.headDirection.dy-(target!.y-nose.y))<1e-9);
  };
  assertDirectionMatchesFinalPose(pose);

  const overridden=applyPoseControlOverride(pose,{schemaVersion:"pose-override-v1",targetDirection:"right",mirror:true,editMode:"parameter_edit"});
  assert.equal(overridden.scenePlan.people[0].gazeTarget.kind,"target");
  assert.equal(overridden.scenePlan.people[0].gazeTarget.source,"pose_override.target_direction");
  assert.deepEqual(overridden.scenePlan.people[0].gazeTarget.point,overridden.scenePlan.people[0].target);
  assertDirectionMatchesFinalPose(overridden);
  assert.ok(overridden.scenePlan.people[0].headDirection.dx>0);

  const directions=[
    {mode:/left$/,point:{x:.08,y:.16}},
    {mode:/right$/,point:{x:.92,y:.16}},
    {mode:/^up/,point:{x:.5,y:.04}},
    {mode:/^down/,point:{x:.5,y:.9}},
  ];
  for(const [index,item] of directions.entries()){
    const controlled=buildPoseControlV2({...shot,id:2490+index},[{
      characterId,required:true,object:"direction target",purpose:"inspect",handMode:"one",objectCenter:{x:.5,y:.52},region:{xStart:0,xEnd:1},
      gazeMode:"target",gazeTarget:{kind:"target",point:item.point,targetId:`direction:${index}`,source:"test.structured_target"},
    }])!;
    assertDirectionMatchesFinalPose(controlled);
    assert.match(controlled.scenePlan.people[0].headDirection.mode,item.mode);
  }
});

test("近景坐姿 OpenPose 隐藏髋膝脚并保留上身手物几何", () => {
  const data=getStudioData(1), shot={...data.episode.pages[0].shots[0],camera:"中景",cameraEn:"medium shot",compositionEn:"upper body framing",characterIds:["character_xiaofen"],actionEn:"sitting on a sofa holding a smartphone",characterLooks:{},visualSpecConfirmed:false};
  const interaction=deriveInteractionContract(shot,"character_xiaofen");
  const pose=buildSingleActionPoseSvg(shot,interaction,512,512);
  assert.equal(pose.kind,"single_action_seated_v1");
  assert.equal(pose.framingMode,"upper_body");
  assert.doesNotMatch(pose.svg,/y2="542\.72"/);
  assert.ok([8,9,10,11,12,13].every((index)=>pose.people[0][index].y>1));
  const leftContact=interaction.contactAnchors.find((anchor)=>anchor.hand==="left")!;
  const rightContact=interaction.contactAnchors.find((anchor)=>anchor.hand==="right")!;
  assert.ok(Math.abs(pose.people[0][4].y-leftContact.y)<1e-9);
  assert.ok(Math.abs(pose.people[0][7].y-rightContact.y)<1e-9);
  assert.ok(pose.people[0][4].y>interaction.objectCenter.y);
  assert.ok(pose.people[0][7].y>interaction.objectCenter.y);
  assert.ok(pose.people[0][3].y>pose.people[0][4].y);
  assert.ok(pose.people[0][6].y>pose.people[0][7].y);
});

test("所有单人动作族在近景和中景保留髋部主轴并隐藏膝脚控制", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0],characterId=base.characterIds[0];
  const actions=[
    "sitting on a sofa holding a smartphone",
    "walking toward the door",
    "pointing toward the directory text",
    "rubbing her eyes",
    "turning off the bedside lamp",
    "reaching toward a high shelf",
    "lying down on the bed",
    "reclining against the sofa back",
    "turning around",
    "bending forward",
    "nodding gently",
  ];
  for(const cameraEn of ["close-up","medium close-up","medium shot"]){
    for(const actionEn of actions){
      const shot={...base,characterIds:[characterId],description:"",actionEn,camera:cameraEn==="medium shot"?"中景":"近景",cameraEn,compositionEn:"structured upper-body narrative framing",visualSpecConfirmed:false,characterLooks:{}};
      assert.equal(derivePoseFramingMode(shot),"upper_body",`${cameraEn}/${actionEn}`);
      const pose=buildSingleActionPoseSvg(shot,deriveInteractionContract(shot,characterId));
      assert.equal(pose.framingMode,"upper_body",`${cameraEn}/${actionEn}`);
      assert.deepEqual(pose.hiddenJointIndices,[8,9,10,11,12,13]);
      assert.ok([8,9,10,11,12,13].every((index)=>pose.people[0][index].y>1),`${cameraEn}/${actionEn}`);
      assert.equal((pose.svg.match(/<line /g)||[]).length,11,`${cameraEn}/${actionEn}`);
      const control=buildPoseControlV2(shot,[]);
      assert.ok(control,`${cameraEn}/${actionEn}`);
      assert.equal(control!.scenePlan.framingGeometry.scale,cameraEn === "close-up" ? 1.65 : cameraEn === "medium close-up" ? 1.36 : 1.22,`${cameraEn}/${actionEn}`);
      const target=control!.scenePlan.framingGeometry.visibleBoundsTarget;
      assert.ok(target.width > 0 && target.height > 0,`${cameraEn}/${actionEn}`);
    }
  }
});

test("无道具剧情动作共享 action plan 并稳定进入对应骨骼路径", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0],characterId=base.characterIds[0];
  const cases: Array<[string,string,string]> = [
    ["walking out through the door","locomotion","single_action_walk_v2"],
    ["pointing toward the directory text","point","single_action_point_v1"],
    ["rubbing her eyes","self_touch","single_action_self_touch_v1"],
    ["turning off the bedside lamp","operate_environment","single_action_operate_environment_v1"],
    ["lying down on the bed","lie","single_action_lie_v1"],
    ["reclining against the sofa back","recline","single_action_recline_v1"],
    ["reaching toward a high shelf","reach","single_action_reach_v1"],
  ];
  for (const [action,family,kind] of cases) {
    const shot={...base,characterIds:[characterId],description:"",actionEn:action,camera:"中景",cameraEn:"medium shot",compositionEn:"medium narrative composition",visualSpecConfirmed:false,characterLooks:{}};
    const plan=derivePoseActionPlan(shot,characterId);
    const regional=buildRegionalPrompt(shot,data.assets,data.characters);
    assert.equal(plan.family,family,action);
    assert.equal(plan.required,true,action);
    assert.equal(regional.repairPasses.risk.poseRequired,true,action);
    assert.equal(regional.poseControl?.kind,kind,action);
    assert.match(regional.poseControl?.selectorReason || "",/requires|require/i,action);
  }
});

test("动作骨骼在关键关节上表达指向、自触摸、环境操作、行走、坐姿与卧姿", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0],characterId=base.characterIds[0];
  const pose=(action:string,cameraEn="medium shot")=>{
    const shot={...base,characterIds:[characterId],description:"",actionEn:action,camera:cameraEn==="wide shot"?"远景":"中景",cameraEn,visualSpecConfirmed:false,characterLooks:{}};
    return buildSingleActionPoseSvg(shot,deriveInteractionContract(shot,characterId));
  };
  const pointing=pose("pointing toward the directory text").people[0];
  assert.ok(Math.max(Math.abs(pointing[4].x-pointing[1].x),Math.abs(pointing[7].x-pointing[1].x))>.24);
  const selfTouch=pose("rubbing her eyes").people[0];
  assert.ok(Math.hypot(selfTouch[4].x-selfTouch[0].x,selfTouch[4].y-selfTouch[0].y)<.06);
  const operate=pose("turning off the bedside lamp").people[0];
  assert.ok(operate[7].x-operate[5].x>.16);
  const movingPose=pose("walking toward the door","wide shot");
  assert.ok("scenePlan" in movingPose,"行走采用参数化场景计划");
  const moving=movingPose.people[0],gait=movingPose.scenePlan.people[0].locomotion!;
  const supportAnkle=gait.supportSide==="right"?10:13,swingAnkle=gait.swingSide==="right"?10:13;
  assert.ok(moving[supportAnkle].y>moving[swingAnkle].y,"行走支撑脚必须低于离地摆动脚");
  assert.notEqual(moving[4].y,moving[7].y,"行走两臂必须处于不同摆动阶段");
  const seated=pose("sitting on a sofa holding a smartphone","wide shot").people[0];
  assert.ok(Math.abs(seated[8].y-seated[9].y)<.08);
  assert.ok(Math.abs(seated[8].x-seated[9].x)>.1);
  assert.ok(Math.abs(seated[9].x-seated[10].x)<.03);
  const lying=pose("lying down on the bed","wide shot").people[0];
  const hip={x:(lying[8].x+lying[11].x)/2,y:(lying[8].y+lying[11].y)/2};
  assert.ok(Math.abs(hip.y-lying[1].y)<.1);
  assert.ok(Math.abs(hip.x-lying[1].x)>.18);
});

test("卧姿在近景只保留水平上身，宽景才发送完整下肢", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0],characterId=base.characterIds[0];
  const compile=(camera:string,cameraEn:string)=>{
    const shot={...base,characterIds:[characterId],description:"",actionEn:"lying down on the bed",camera,cameraEn,visualSpecConfirmed:false,characterLooks:{}};
    return buildSingleActionPoseSvg(shot,deriveInteractionContract(shot,characterId));
  };
  const close=compile("近景","close-up");
  assert.equal(close.kind,"single_action_lie_v1");
  assert.equal(close.framingMode,"upper_body");
  assert.ok(close.people[0].slice(8,14).every((point)=>point.y>1));
  assert.ok(Math.abs(close.people[0][0].x-close.people[0][1].x)>.08);
  const wide=compile("远景","wide shot");
  assert.equal(wide.framingMode,"full_body");
  assert.ok(wide.people[0].slice(8,14).every((point)=>point.y>=0&&point.y<=1));
  assert.equal((wide.svg.match(/<line /g)||[]).length,17);
});

test("当前结构化动作优先于描述中的后续姿态", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0],characterId=base.characterIds[0];
  const shot={...base,characterIds:[characterId],actionEn:"walking to the bed and pulling back the blanket",description:"she will be lying in bed afterward",camera:"中景",cameraEn:"medium shot",visualSpecConfirmed:false,characterLooks:{}};
  assert.equal(derivePoseActionPlan(shot,characterId).family,"locomotion");
  assert.equal(buildRegionalPrompt(shot,data.assets,data.characters).poseControl?.kind,"single_action_walk_v2");
});

test("宽景静态人物与坐姿道具动作仍使用非空专用骨骼", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0];
  const wide={...base,characterIds:[base.characterIds[0]],description:"",actionEn:"standing calmly",camera:"远景",cameraEn:"wide shot",compositionEn:"complete figure in environment",visualSpecConfirmed:false,characterLooks:{}};
  assert.equal(buildRegionalPrompt(wide,data.assets,data.characters).poseControl?.kind,"single_full_body_v1");
  const seated={...base,characterIds:[base.characterIds[0]],description:"reading a phone notification",actionEn:"sitting on a sofa holding a smartphone",camera:"中景",cameraEn:"medium shot",visualSpecConfirmed:false,characterLooks:{}};
  assert.equal(buildRegionalPrompt(seated,data.assets,data.characters).poseControl?.kind,"single_action_seated_v1");
});

test("OpenPose v2 覆盖剧情中的持物、拿取、开合、书写、工具和饮食动作", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0],characterId=base.characterIds[0];
  const cases: Array<[string,string]> = [
    ["Holding the package against her torso","hold_carry"],
    ["Taking out two books from the package","pick_place"],
    ["Turning pages and closing the notebook","open_close"],
    ["Writing a reading plan in a notebook","write_tool"],
    ["Cutting open the package with scissors","write_tool"],
    ["Drinking tea from a cup","drink_eat"],
    ["Reading a phone notification","read_phone"],
    ["Kneeling beside the shelf","crouch_kneel"],
  ];
  for (const [action,expected] of cases) {
    const shot={...base,id:base.id+action.length,characterIds:[characterId],description:"",actionEn:action,camera:"中景",cameraEn:"medium shot",visualSpecConfirmed:false,characterLooks:{}};
    const interaction=deriveInteractionContract(shot,characterId);
    const pose=buildPoseControlV2(shot,[{characterId,required:interaction.required,object:interaction.object,purpose:interaction.purpose,handMode:interaction.handMode,objectCenter:interaction.objectCenter,region:interaction.region}]);
    assert.ok(pose,action);
    assert.ok(pose!.scenePlan.people[0].actions.includes(expected as any),action);
    assert.notEqual(pose!.kind,"single_action_standing_v1",action);
  }
});

test("OpenPose v2 将复合动作拆成身体基座和上身动作叠加", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0],characterId=base.characterIds[0];
  const shot={...base,id:2201,characterIds:[characterId],description:"",actionEn:"walking toward the bed while carrying two books and pulling the blanket",camera:"远景",cameraEn:"wide shot",visualSpecConfirmed:false,characterLooks:{}};
  const interaction=deriveInteractionContract(shot,characterId);
  const pose=buildPoseControlV2(shot,[{characterId,required:interaction.required,object:interaction.object,purpose:interaction.purpose,handMode:interaction.handMode,objectCenter:interaction.objectCenter,region:interaction.region}]);
  assert.ok(pose);
  assert.equal(pose!.scenePlan.people[0].primaryAction,"locomotion");
  assert.ok(pose!.scenePlan.people[0].actions.includes("hold_carry"));
  assert.ok(pose!.scenePlan.people[0].actions.includes("push_pull"));
  const gait=pose!.scenePlan.people[0].locomotion!;
  const supportAnkle=gait.supportSide==="right"?10:13,swingAnkle=gait.swingSide==="right"?10:13;
  assert.ok(pose!.people[0][supportAnkle].y>pose!.people[0][swingAnkle].y,"携物行走保持支撑脚与摆动脚关系");
  assert.equal(pose!.controlProfile.id,"walk_full");
  assert.equal(pose!.controlProfile.weight,.88);
});

test("OpenPose v2 的变体稳定可复现且相邻镜头默认不同", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0],characterId=base.characterIds[0];
  const compile=(id:number)=>buildPoseControlV2({...base,id,characterIds:[characterId],description:"",actionEn:"walking through the door",camera:"远景",cameraEn:"wide shot",visualSpecConfirmed:false,characterLooks:{}},[]);
  const first=compile(2301),again=compile(2301),next=compile(2302);
  assert.deepEqual(first,again);
  assert.notEqual(first!.variantId,next!.variantId);
  assert.notDeepEqual(first!.people,next!.people);
});

test("通用双人模板覆盖交谈、递交、共享道具、接触、搀扶、引导、并行与对峙", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0];
  const characters=["character_xiaofen","character_friend"];
  const cases: Array<[string,string]> = [
    ["two women face each other and talk","conversation"],
    ["the other woman listens and reacts with surprise","reaction"],
    ["one woman hands a book to the other","handover"],
    ["both women look at and hold the shared book together","shared_prop"],
    ["the women shake hands","handshake_highfive"],
    ["one woman supports and helps the other up","embrace_support"],
    ["one woman guides and pulls the other forward","guide_pull"],
    ["the women walk together side by side","walk_together"],
    ["the two women confront each other","confrontation"],
  ];
  for(const [action,kind] of cases){
    const shot={...base,id:2400+action.length,characterIds:characters,description:"",actionEn:action,camera:"中景",cameraEn:"medium shot",visualSpecConfirmed:false,characterLooks:{}};
    const pose=buildPoseControlV2(shot,[]);
    assert.ok(pose,action);
    assert.equal(pose!.scenePlan.interactionKind,kind,action);
    assert.equal(pose!.people.length,2);
    assert.equal(pose!.controlProfile.id,"multi_contact");
    assert.equal(pose!.controlProfile.weight,.9);
    assert.ok(pose!.people.every((person)=>person.slice(8,14).every((point)=>point.y>1)),action);
    assert.equal(pose!.safety.valid,true,action);
  }
  assert.equal(posePresetCatalog.filter((preset)=>preset.peopleCount===2).length,9);
});

test("双人递交和握手的腕部接触点闭合", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0];
  for(const action of ["one woman hands an umbrella to the other","the women shake hands"]){
    const pose=buildPoseControlV2({...base,id:2500+action.length,characterIds:["character_xiaofen","character_friend"],description:"",actionEn:action,camera:"远景",cameraEn:"wide shot",visualSpecConfirmed:false,characterLooks:{}},[]);
    assert.ok(pose);
    const contactDistance = Math.hypot(pose!.people[0][7].x-pose!.people[1][4].x,pose!.people[0][7].y-pose!.people[1][4].y);
    if (/umbrella/i.test(action)) {
      assert.ok(contactDistance > 0 && contactDistance < .06);
      assert.ok((pose!.safety.contactError || 0) > 0 && (pose!.safety.contactError || 0) <= .08);
    } else {
      assert.ok(contactDistance < .001);
      assert.equal(pose!.safety.contactError,0);
    }
  }
});

test("OpenPose v2 结构化覆盖可重建模板参数并保存关节点编辑", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0],characterId=base.characterIds[0];
  const automatic=buildPoseControlV2({...base,id:2601,characterIds:[characterId],description:"",actionEn:"pointing at the sign",camera:"中景",cameraEn:"medium shot",visualSpecConfirmed:false,characterLooks:{}},[])!;
  const parameterized=applyPoseControlOverride(automatic,{schemaVersion:"pose-override-v1",templateId:"single_write_tool_v2",phase:"anticipation",intensity:"dynamic",handedness:"left",targetDirection:"up",mirror:true,editMode:"parameter_edit"});
  assert.equal(parameterized.source,"user_override");
  assert.equal(parameterized.scenePlan.people[0].primaryAction,"write_tool");
  assert.equal(parameterized.scenePlan.people[0].phase,"anticipation");
  assert.equal(parameterized.scenePlan.people[0].intensity,"dynamic");
  const edited=parameterized.people.map((person)=>person.map((point)=>({...point})));
  edited[0][4]={x:.2,y:.2};
  const jointEdited=applyPoseControlOverride(automatic,{schemaVersion:"pose-override-v1",people:edited,editMode:"joint_edit"});
  assert.deepEqual(jointEdited.people[0][4],{x:.2,y:.2});
  assert.equal(jointEdited.override?.editMode,"joint_edit");
});

test("人工模板覆盖坐姿时阻断互斥 sofa support，而不是继续发送两套几何", () => {
  const data = getStudioData(1), base = data.episode.pages[0].shots[0];
  const characterId = base.characterIds[0];
  const automatic = buildPoseControlV2({ ...base, id: 2602, characterIds: [characterId], description: "seated on a sofa reading a smartphone", actionEn: "seated on a sofa reading a smartphone", camera: "近景", cameraEn: "close shot", visualSpecConfirmed: true, visualSpec: { characters: [{ characterId, action: "seated on a sofa reading a smartphone", hands: "both hands holding a smartphone", position: "center", region: { xStart: 0, xEnd: 1 } }], camera: { shotSize: "close shot" }, interactions: [], visibleFacts: [], scene: {} } as any, characterLooks: {} }, [])!;
  assert.equal(automatic.scenePlan.people[0].supportRelation.supportKind, "sofa");
  const overridden = applyPoseControlOverride(automatic, { schemaVersion: "pose-override-v1", templateId: "single_point_v2", editMode: "parameter_edit" });
  assert.equal(overridden.source, "user_override");
  assert.equal(overridden.scenePlan.people[0].basePose, "standing");
  assert.equal(overridden.scenePlan.people[0].supportRelation.supportKind, "floor");
  assert.equal(overridden.safety.valid, false);
  assert.match(overridden.safety.errors.join(" "), /支持姿态|支持面|互斥/);
  assert.match(overridden.scenePlan.warnings.join(" "), /sofa/);
});

test("人工模板改变 seated/recline/kneel/standing 基础姿态时统一阻断支持面冲突", () => {
  const data = getStudioData(1), base = data.episode.pages[0].shots[0], characterId = base.characterIds[0];
  const cases: Array<[string, string, string]> = [
    ["seated on a sofa reading a smartphone", "single_point_v2", "seated"],
    ["standing and pointing toward the sign", "single_sit_rise_v2", "standing"],
    ["reclining on a bed", "single_point_v2", "recline"],
    ["kneeling on the floor", "single_point_v2", "crouch_kneel"],
  ];
  for (const [actionEn, templateId, previousBasePose] of cases) {
    const automatic = buildPoseControlV2({ ...base, id: 2610 + actionEn.length, characterIds: [characterId], description: actionEn, actionEn, camera: "中景", cameraEn: "medium shot", visualSpecConfirmed: true, visualSpec: { characters: [{ characterId, action: actionEn, position: "center", region: { xStart: 0, xEnd: 1 } }], camera: { shotSize: "medium shot" }, interactions: [], visibleFacts: [], scene: {} } as any, characterLooks: {} }, [])!;
    assert.equal(automatic.scenePlan.people[0].basePose, previousBasePose, actionEn);
    const overridden = applyPoseControlOverride(automatic, { schemaVersion: "pose-override-v1", templateId, editMode: "parameter_edit" });
    assert.equal(overridden.safety.valid, false, actionEn);
    assert.match(overridden.safety.errors.join(" "), /P0|基础姿态|支持面/, actionEn);
    assert.ok(overridden.scenePlan.overrideConflicts.length > 0, actionEn);
  }
  const inferred = buildPoseControlV2({ ...base, id: 2620, characterIds: [characterId], description: "standing and pointing toward the sign", actionEn: "standing and pointing toward the sign", camera: "中景", cameraEn: "medium shot", visualSpecConfirmed: false, characterLooks: {} }, [])!;
  const inferredOverride = applyPoseControlOverride(inferred, { schemaVersion: "pose-override-v1", templateId: "single_sit_rise_v2", editMode: "parameter_edit" });
  assert.equal(inferredOverride.safety.valid, true);
  assert.equal(inferredOverride.scenePlan.overrideConflicts.length, 0);
  const confirmedOverride = applyPoseControlOverride(inferredOverride, { schemaVersion: "pose-override-v1", templateId: "single_point_v2", confirmPoseContract: true, editMode: "parameter_edit" });
  assert.equal(confirmedOverride.safety.valid, true);
  assert.match(confirmedOverride.scenePlan.warnings.join(" "), /已确认覆盖/);
});

test("locomotion 区分走跑与步态阶段，并在上身裁切下同步覆盖状态", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0],characterId=base.characterIds[0];
  const wide=(id:number,actionEn:string)=>buildPoseControlV2({...base,id,characterIds:[characterId],description:"",actionEn,camera:"远景",cameraEn:"wide shot",visualSpecConfirmed:false,characterLooks:{}},[])!;
  const walk=wide(2700,"walking through the doorway");
  const run=wide(2700,"running through the doorway");
  assert.equal(walk.scenePlan.people[0].locomotion?.mode,"walk");
  assert.equal(run.scenePlan.people[0].locomotion?.mode,"run");
  assert.equal(walk.presetId,"single_walk_v2");
  assert.equal(run.presetId,"single_run_v2");
  assert.ok((run.scenePlan.people[0].locomotion?.stride || 0)>(walk.scenePlan.people[0].locomotion?.stride || 0));
  assert.notDeepEqual(run.people[0].slice(0,14),walk.people[0].slice(0,14));
  assert.equal(walk.lowerBodyControl,"full");
  assert.equal(walk.controlProfile.id,"walk_full");
  assert.equal(run.controlProfile.id,"run_full");
  assert.deepEqual(walk.framingWarnings,[]);

  const phaseGeometry=["anticipation","contact","follow_through"].map((phase)=>{
    const pose=applyPoseControlOverride(walk,{schemaVersion:"pose-override-v1",templateId:"single_walk_v2",phase:phase as "anticipation"|"contact"|"follow_through",editMode:"parameter_edit"});
    return {
      gaitPhase:pose.scenePlan.people[0].locomotion?.gaitPhase,
      joints:[0,1,2,4,5,7,8,9,10,11,12,13].map((index)=>pose.people[0][index]),
    };
  });
  assert.deepEqual(phaseGeometry.map((item)=>item.gaitPhase),["heel_strike","mid_stance","toe_off"]);
  assert.equal(new Set(phaseGeometry.map((item)=>JSON.stringify(item.joints))).size,3);

  const upperBase=buildPoseControlV2({...base,id:2701,characterIds:[characterId],description:"",actionEn:"holding a bag",camera:"中景",cameraEn:"medium shot",visualSpecConfirmed:false,characterLooks:{}},[])!;
  const upperWalk=applyPoseControlOverride(upperBase,{schemaVersion:"pose-override-v1",templateId:"single_walk_v2",phase:"contact",editMode:"parameter_edit"});
  assert.equal(upperWalk.kind,"single_action_walk_v2");
  assert.deepEqual(upperWalk.scenePlan.people[0].actions,["locomotion"]);
  assert.equal(upperWalk.scenePlan.people[0].basePose,"standing");
  assert.equal(upperWalk.scenePlan.people[0].locomotion?.lowerBodyControl,"hidden_by_framing");
  assert.equal(upperWalk.lowerBodyControl,"hidden_by_framing");
  assert.equal(upperWalk.controlProfile.id,"walk_upper");
  assert.ok(upperWalk.people[0].slice(8,14).every((point)=>point.y>1));
  assert.ok(Math.hypot(upperWalk.people[0][4].x-upperWalk.people[0][7].x,upperWalk.people[0][4].y-upperWalk.people[0][7].y)>.18);
  assert.match(upperWalk.selectorReason,/user selected .*行走/i);
  assert.doesNotMatch(upperWalk.selectorReason,/hold_carry/i);
  assert.ok(upperWalk.framingWarnings.some((warning)=>/下肢髋膝踝未进入控制图/.test(warning)));

  const upperRun=applyPoseControlOverride(upperBase,{schemaVersion:"pose-override-v1",templateId:"single_run_v2",phase:"follow_through",intensity:"dynamic",editMode:"parameter_edit"});
  assert.equal(upperRun.scenePlan.people[0].locomotion?.mode,"run");
  assert.equal(upperRun.kind,"single_action_run_v2");
  assert.equal(upperRun.presetId,"single_run_v2");
  assert.equal(upperRun.controlProfile.id,"run_upper");
  assert.notDeepEqual(upperRun.people[0].slice(0,8),upperWalk.people[0].slice(0,8));

  const legacy=applyPoseControlOverride(upperBase,{schemaVersion:"pose-override-v1",templateId:"single_walk_run_v2",editMode:"parameter_edit"});
  assert.equal(legacy.scenePlan.people[0].locomotion?.mode,"walk");
  assert.equal(legacy.presetId,"single_walk_v2");
});

test("OpenPose v2 对三人以上和非法骨架执行安全降级", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0];
  assert.equal(derivePoseScenePlanV2({...base,characterIds:["a","b","c"],actionEn:"three people embrace",visualSpecConfirmed:false,characterLooks:{}},[]),null);
  const invalid=validatePosePeople([[{x:Number.NaN,y:0}]])
  assert.equal(invalid.valid,false);
  assert.match(invalid.errors.join(" "),/18|坐标无效/);
});

test("OpenPose UI 显示真实 kind、来源、选择原因和未知类型", () => {
  const labels=[
    ["single_action_seated_v1","单人·坐姿动作"],
    ["single_action_moving_v1","单人·移动"],
    ["single_action_walk_v2","单人·行走／快走"],
    ["single_action_run_v2","单人·跑动／冲刺"],
    ["single_action_point_v1","单人·指向"],
    ["single_action_lie_v1","单人·卧姿"],
    ["single_full_body_v1","单人·全身"],
    ["umbrella_handover_v1","双人·雨伞交接"],
  ];
  for (const [kind,label] of labels) assert.equal(poseDisplayDetails(kind,"automatic_action_plan","test reason","upper_body").kindLabel,label);
  assert.equal(poseDisplayDetails("single_action_lie_v1","automatic_action_plan","test reason","upper_body").framingLabel,"上身裁切骨骼");
  assert.equal(poseDisplayDetails("single_full_body_v1","automatic_action_plan","test reason","full_body").framingLabel,"完整全身骨骼");
  assert.match(poseDisplayDetails("future_pose_v9","custom_source","").kindLabel,/future_pose_v9/);
  assert.match(poseDisplayDetails("future_pose_v9","custom_source","").sourceLabel,/custom_source/);
});

test("服装 conditioning 状态与景别、纯服装标签和 adapter 一致", () => {
  for (const camera of ["close-up", "medium shot", "wide shot"]) {
    for (const isolated of [false, true]) {
      const result=classifyOutfitConditioning(camera, isolated, true);
      assert.equal(result.status, camera === "wide shot" && isolated ? "control_applied" : "text_only");
    }
  }
  const unavailable=classifyOutfitConditioning("wide shot", true, false);
  assert.equal(unavailable.status,"text_only");
  assert.equal(unavailable.controlApplied,false);
  assert.equal([unavailable].filter((decision)=>decision.controlApplied).length,0);
});

test("最终请求统一使用结构化 prompt 契约并保留可追溯编辑层", () => {
  const data=getStudioData(1),base={...data.episode.pages[0].shots[0],characterLooks:{}};
  const sources=[
    {mode:"structured",override:""},
    {mode:"manual_override",override:"cinematic full body portrait, dramatic rim light"},
    {mode:"auto_repaired",override:"full-length figure, polished color design"},
  ];
  for (const cameraEn of ["close-up","medium shot","wide shot"]) {
    for (const count of [1,2]) {
      const ids=data.characters.slice(0,count).map((character)=>character.id);
      const shot={...base,camera:cameraEn==="wide shot"?"远景":cameraEn==="medium shot"?"中景":"特写",cameraEn,characterIds:ids};
      const regional=buildRegionalPrompt(shot,data.assets,data.characters);
      for (const source of sources) {
        const plan=buildCanonicalGenerationPrompt(shot,regional.prompt,source.override,count);
        assert.equal(plan.validation.valid,true,`${source.mode}/${cameraEn}/${count}`);
        assert.match(plan.prompt,/anime illustration/);
        if(cameraEn!=="wide shot") assert.match(plan.prompt,/waist-up|head-and-shoulders|chest-up/);
        if(source.override) assert.equal(plan.overrideApplied,true);
        if(cameraEn!=="wide shot") assert.equal(plan.prompt.includes("editorial visual details, cinematic full body portrait"),false);
        const negative=buildCanonicalNegativePrompt(shot,regional.negativePrompt,"soft focus");
        assert.match(negative,cameraEn==="wide shot"?/cropped feet/:/visible legs/);
      }
    }
  }
});

test("Regional override 内部的景别冲突也会在 canonical 层清除", () => {
  const data=getStudioData(1),shot={...data.episode.pages[0].shots[0],camera:"近景",cameraEn:"medium close-up",characterIds:[data.characters[0].id],characterLooks:{}};
  const regional=buildRegionalPrompt(shot,data.assets,data.characters);
  const polluted=`${regional.prompt}, cinematic full body portrait, both feet fully visible`;
  const plan=buildCanonicalGenerationPrompt(shot,polluted,"",1);
  assert.equal(plan.validation.valid,true);
  assert.doesNotMatch(plan.prompt,/full body portrait|both feet fully visible/);
  assert.ok(plan.repairs.some((repair)=>repair.includes("regional contract")));
});

test("wide/full canonical 会清除反向的 no legs 近景契约", () => {
  const data=getStudioData(1),shot={...data.episode.pages[0].shots[0],camera:"远景",cameraEn:"wide shot",characterIds:[data.characters[0].id],characterLooks:{}};
  const regional=buildRegionalPrompt(shot,data.assets,data.characters);
  const polluted=`${regional.prompt}, strict crop at the waist, no legs or full bodies`;
  const plan=buildCanonicalGenerationPrompt(shot,polluted,"",1);
  assert.equal(plan.validation.valid,true);
  assert.doesNotMatch(plan.prompt,/strict crop at the waist|no legs or full bodies/);
  assert.match(plan.prompt,/complete figures visible/);
  assert.ok(plan.repairs.some((repair)=>repair.includes("regional contract")));
});

test("视觉规格把显式手机和未知道具动作规范化为完整 interactions", () => {
  const data=getStudioData(1),base={...data.episode.pages[0].shots[0],actionEn:"natural storytelling action",characterLooks:{},characterIds:[data.characters[0].id]};
  for (const target of ["smartphone","prototype scanner"]) {
    const raw={visibleFacts:[`the character reads the ${target}`],scene:{},characters:[{characterId:base.characterIds[0],action:`holding and inspecting the ${target}`,actionTarget:target,gazeTarget:`the ${target} surface`,hands:`both hands holding the ${target}`}],interactions:[],camera:{},stateChanges:[],warnings:[]};
    assertVisualShape("shot",raw);
    const spec=normalizeShotSpec(raw,base);
    assert.equal(spec.interactions.length,1);
    assert.equal(spec.interactions[0].actorCharacterId,base.characterIds[0]);
    assert.equal(spec.interactions[0].propId,target==="smartphone"?"smartphone":"prototype_scanner");
    assert.ok(spec.interactions[0].contactPoints.length);
    assert.ok(spec.interactions[0].gazeTarget);
    const validation = validateVisualIds(spec,data.characters,data.assets);
    assert.equal(validation.valid,true,JSON.stringify(validation));
  }
});

test("通用 actionTarget 不会遮蔽 action、gaze 和 visibleFacts 中的 smartphone", () => {
  const data=getStudioData(1),base={...data.episode.pages[0].shots[0],actionEn:"natural storytelling action",characterLooks:{},characterIds:[data.characters[0].id]};
  const spec=normalizeShotSpec({visibleFacts:["the character sits on a sofa holding a smartphone with both hands","the phone screen displays a delivery notification"],scene:{},characters:[{characterId:base.characterIds[0],action:"looking at a phone notification",actionTarget:"the current story focus",gazeTarget:"phone screen",hands:"both hands holding the smartphone"}],interactions:[],camera:{},stateChanges:[],warnings:[]},base);
  assert.equal(spec.interactions[0].propId,"smartphone");
  const contract=deriveInteractionContract({...base,visualSpecConfirmed:true,visualSpec:spec},base.characterIds[0]);
  assert.equal(contract.object,"smartphone");
  assert.equal(contract.required,true);
});

test("主道具按动作、工具介词和接触证据排序而不是按名词表顺序", () => {
  const cutting = rankInteractionPropCandidates({
    target: "package",
    action: "cutting open the package with scissors",
    contact: "both hands follow the cutting action",
    gaze: "the cutting work point",
    facts: "one package and one pair of scissors are visible",
  });
  assert.equal(cutting[0].propId, "scissors");
  assert.ok(cutting[0].score > (cutting.find((item) => item.propId === "package")?.score || 0));

  const carrying = rankInteractionPropCandidates({
    target: "package",
    action: "holding the package against her torso",
    contact: "both hands supporting the package",
  });
  assert.equal(carrying[0].propId, "package");

  const repairing = rankInteractionPropCandidates({
    target: "cabinet hinge",
    action: "tightening the cabinet hinge using a screwdriver beside a parcel",
    contact: "right hand gripping the screwdriver",
  });
  assert.equal(repairing[0].propId, "screwdriver");
});

test("剪刀与包裹的独立手部关系不会被合并，缺少分手描述时仍选择主动工具", () => {
  const data=getStudioData(1),base={...data.episode.pages[0].shots[0],actionEn:"natural storytelling action",description:"",characterLooks:{},characterIds:[data.characters[0].id]};
  const rawBase={visibleFacts:["one package and one pair of scissors are visible"],scene:{},camera:{},stateChanges:[],warnings:[]};
  const multi=normalizeShotSpec({...rawBase,characters:[{
    characterId:base.characterIds[0],
    action:"cutting open the package with scissors",
    actionTarget:"package",
    gazeTarget:"the scissors contact point on the package",
    hands:"right hand gripping the scissors while the left hand steadies the package",
  }],interactions:[]},base);
  assert.deepEqual(multi.interactions.map((item)=>item.propId),["scissors","package"]);
  assert.match(multi.interactions[0].contactPoints.join(" "),/right hand.*scissors/i);
  assert.match(multi.interactions[1].contactPoints.join(" "),/left hand.*package/i);

  const primaryOnly=normalizeShotSpec({...rawBase,characters:[{
    characterId:base.characterIds[0],
    action:"cutting open the package with scissors",
    actionTarget:"package",
    gazeTarget:"the cutting work point",
    hands:"both hands follow the described action",
  }],interactions:[]},base);
  assert.equal(primaryOnly.interactions.length,1);
  assert.equal(primaryOnly.interactions[0].propId,"scissors");
});

test("未确认镜头与已确认多关系都把主动工具作为执行主道具且不丢目标物", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0],characterId=data.characters[0].id;
  const unconfirmed={...base,characterIds:[characterId],actionEn:"Cutting open the package with scissors",description:"小粉坐在书桌前，用剪刀小心地拆开快递包裹。",compositionEn:"at the package, using scissors",visualSpecConfirmed:false,visualSpec:null,characterLooks:{}};
  const fallbackContract=deriveInteractionContract(unconfirmed,characterId);
  const fallbackRegional=buildRegionalPrompt(unconfirmed,data.assets,data.characters);
  assert.equal(fallbackContract.object,"scissors");
  assert.equal(fallbackContract.purpose,"operate");
  assert.equal(fallbackContract.handMode,"one");
  assert.equal(fallbackRegional.repairPasses.propInteraction?.object,"scissors");
  assert.match(fallbackRegional.prompt,/one scissors/i);

  const visualSpec=normalizeShotSpec({
    visibleFacts:["one package and one pair of scissors are visible"],scene:{},characters:[{
      characterId,action:"cutting open the package with scissors",actionTarget:"package",gazeTarget:"the scissors contact point on the package",hands:"right hand gripping the scissors while the left hand steadies the package",
    }],interactions:[
      {type:"support",actorCharacterId:characterId,targetCharacterId:"",propId:"package",action:"steady the package",phase:"contact",contactPoints:["left hand steadying the package"],gazeTarget:"package edge",ownershipBefore:characterId,ownershipAfter:characterId},
      {type:"use",actorCharacterId:characterId,targetCharacterId:"",propId:"scissors",action:"cut the package with scissors",phase:"contact",contactPoints:["right hand gripping the scissors"],gazeTarget:"scissors contact point",ownershipBefore:characterId,ownershipAfter:characterId},
    ],camera:{shotSize:"medium shot"},stateChanges:[],warnings:[],
  },{...base,characterIds:[characterId],actionEn:"natural storytelling action",characterLooks:{}});
  assert.deepEqual(visualSpec.interactions.map((item)=>item.propId),["package","scissors"]);
  const regional=buildRegionalPrompt({...base,characterIds:[characterId],actionEn:"Cutting open the package with scissors",visualSpecConfirmed:true,visualSpec,characterLooks:{}},data.assets,data.characters);
  assert.deepEqual(regional.repairPasses.propInteractions.map((item)=>item.object),["scissors","package"]);
  assert.equal(regional.repairPasses.passGraph.length,2);
  assert.match(regional.characterRegions[0].prompt,/one scissors/i);
  assert.match(regional.characterRegions[0].prompt,/one package/i);
});

test("多关系、legacy 单数迁移、残缺关系和静态镜头走各自校验路径", () => {
  const data=getStudioData(1),ids=data.characters.slice(0,2).map((character)=>character.id),base={...data.episode.pages[0].shots[0],actionEn:"natural storytelling action",characterLooks:{},characterIds:ids,outfitId:"",shoeId:""};
  const characters=ids.map((id,index)=>({characterId:id,action:index?"receiving the umbrella":"passing the umbrella",actionTarget:"umbrella",gazeTarget:"umbrella handle",hands:index?"left hand receiving the handle":"right hand holding the handle"}));
  const relations=characters.map((character,index)=>({type:"object_transfer",actorCharacterId:character.characterId,targetCharacterId:ids[1-index],propId:"umbrella",action:character.action,phase:index?"receiving":"releasing",contactPoints:[character.hands],gazeTarget:character.gazeTarget,ownershipBefore:index?null:ids[0],ownershipAfter:ids[1]}));
  const multi=normalizeShotSpec({visibleFacts:["an umbrella changes hands"],scene:{},characters,interactions:relations,camera:{},stateChanges:[],warnings:[]},base);
  assert.equal(multi.interactions.length,2);
  assert.equal(validateVisualIds(multi,data.characters,data.assets).valid,true);

  const legacy=normalizeShotSpec({visibleFacts:["a phone is held"],scene:{},characters:[characters[0]],interaction:{type:"use",actorCharacterId:ids[0],targetCharacterId:"",propId:"legacy_phone",action:"read",phase:"in progress",contactPoint:"both hands",gazeTarget:"screen"},camera:{},stateChanges:[],warnings:[]},{...base,characterIds:[ids[0]]});
  assert.equal(legacy.interactions[0].propId,"legacy_phone");
  assert.deepEqual(legacy.interactions[0].contactPoints,["both hands"]);

  const partial=normalizeShotSpec({visibleFacts:["a device is used"],scene:{},characters:[characters[0]],interactions:[{type:"use",actorCharacterId:ids[0],propId:"device",action:"use",phase:"in progress",contactPoints:["right hand"],gazeTarget:""}],camera:{},stateChanges:[],warnings:[]},{...base,characterIds:[ids[0]]});
  assert.equal(validateVisualIds(partial,data.characters,data.assets).blocked,true);

  const staticSpec=normalizeShotSpec({visibleFacts:["the character stands beside a window"],scene:{},characters:[{characterId:ids[0],action:"standing beside a window",actionTarget:"window",gazeTarget:"outside",hands:"hands out of frame"}],interactions:[],camera:{},stateChanges:[],warnings:[]},{...base,characterIds:[ids[0]],actionEn:"standing beside a window"});
  assert.equal(staticSpec.interactions.length,0);
  assert.equal(validateVisualIds(staticSpec,data.characters,data.assets).valid,true);
});

test("同一人物的多关系保留实例、独立腕点和 pass graph", () => {
  const data = getStudioData(1), base = data.episode.pages[0].shots[0];
  const visualSpec = normalizeShotSpec({
    visibleFacts: ["the character reads a smartphone and operates a screwdriver"], scene: {},
    characters: [{ characterId: "character_xiaofen", action: "reading a smartphone while operating a screwdriver", actionTarget: "smartphone and screwdriver", gazeTarget: "smartphone screen", hands: "left hand holding the smartphone, right hand operating the screwdriver" }],
    interactions: [
      { type: "use", actorCharacterId: "character_xiaofen", targetCharacterId: "", propId: "smartphone", action: "read the smartphone", phase: "contact", contactPoints: ["left hand"], gazeTarget: "smartphone screen", ownershipBefore: null, ownershipAfter: "character_xiaofen" },
      { type: "use", actorCharacterId: "character_xiaofen", targetCharacterId: "", propId: "screwdriver", action: "operate the screwdriver", phase: "contact", contactPoints: ["right hand"], gazeTarget: "screwdriver work point", ownershipBefore: null, ownershipAfter: "character_xiaofen" },
    ], camera: { shotSize: "medium shot" }, stateChanges: [], warnings: [],
  }, { ...base, characterIds: ["character_xiaofen"] });
  const shot = { ...base, characterIds: ["character_xiaofen"], visualSpecConfirmed: true, visualSpec, characterLooks: {} };
  const contracts = deriveInteractionContracts(shot, "character_xiaofen");
  const regional = buildRegionalPrompt(shot, data.assets, data.characters);
  assert.equal(contracts.length, 2);
  assert.notEqual(contracts[0].relationId, contracts[1].relationId);
  assert.notEqual(contracts[0].objectInstanceId, contracts[1].objectInstanceId);
  assert.equal(contracts[0].activeHand, "left");
  assert.equal(contracts[1].activeHand, "right");
  assert.equal(regional.repairPasses.propInteractions.length, 2);
  assert.equal(regional.poseControl?.scenePlan.people[0].relationTargets.length, 2);
  assert.ok(regional.poseControl?.scenePlan.people[0].relationTargets[0].target.x !== regional.poseControl?.scenePlan.people[0].relationTargets[1].target.x);
  assert.equal(regional.repairPasses.passGraph.length, 2);
});

test("confirmed visualSpec 的景别覆盖旧 shot camera 并生成景别级上身尺度", () => {
  const data = getStudioData(1), base = data.episode.pages[0].shots[0];
  const raw = { visibleFacts: ["the character is seated on a sofa"], scene: { anchors: ["sofa"] }, characters: [{ characterId: "character_xiaofen", action: "seated on a sofa", actionTarget: "sofa", gazeTarget: "the story focus", hands: "hands at rest", region: { xStart: 0, xEnd: 1 } }], interactions: [], camera: { shotSize: "medium shot" }, stateChanges: [], warnings: [] };
  const visualSpec = normalizeShotSpec(raw, { ...base, camera: "远景", cameraEn: "wide shot", characterIds: ["character_xiaofen"], characterLooks: {} });
  const result = buildRegionalPrompt({ ...base, camera: "远景", cameraEn: "wide shot", characterIds: ["character_xiaofen"], characterLooks: {}, visualSpecConfirmed: true, visualSpec }, data.assets, data.characters);
  assert.equal(visualSpec.camera.shotSize, "medium shot");
  assert.equal(result.poseControl?.scenePlan.framingMode, "upper_body");
  assert.ok((result.poseControl?.scenePlan.framingGeometry.scale || 0) > 1);
  assert.equal(result.poseControl?.scenePlan.framingGeometry.source, "visualSpec.camera.shotSize");
});

test("看手机目标生成非对称头部方向与支持面控制摘要", () => {
  const data = getStudioData(1), base = data.episode.pages[0].shots[0];
  const visualSpec = normalizeShotSpec({ visibleFacts: ["the character is seated on a sofa reading a smartphone"], scene: { anchors: ["sofa"] }, characters: [{ characterId: "character_xiaofen", action: "seated on a sofa reading a smartphone", actionTarget: "smartphone", gazeTarget: "smartphone screen", hands: "both hands holding the smartphone", position: "left", region: { xStart: 0, xEnd: .5 } }], interactions: [{ type: "use", actorCharacterId: "character_xiaofen", targetCharacterId: "", propId: "smartphone", action: "read the smartphone", phase: "contact", contactPoints: ["both hands"], gazeTarget: "smartphone screen", ownershipBefore: null, ownershipAfter: "character_xiaofen" }], camera: { shotSize: "medium shot" }, stateChanges: [], warnings: [] }, { ...base, characterIds: ["character_xiaofen"] });
  const result = buildRegionalPrompt({ ...base, characterIds: ["character_xiaofen"], visualSpecConfirmed: true, visualSpec, characterLooks: {} }, data.assets, data.characters);
  const person = result.poseControl?.people[0] || [];
  assert.ok(result.poseControl?.scenePlan.people[0].headDirection.mode.startsWith("down"));
  assert.notEqual(person[14].x, person[15].x);
  assert.equal(result.poseControl?.scenePlan.supportRelations[0].supportKind, "sofa");
  assert.equal(result.poseControl?.scenePlan.framingMode, "upper_body");
});

test("上身景别统一审计所有姿态的隐藏下肢", () => {
  const data = getStudioData(1), base = data.episode.pages[0].shots[0];
  for (const action of ["seated on a sofa", "standing and reading", "reclining on a bed", "lying on a bed", "kneeling"] ) {
    const visualSpec = normalizeShotSpec({ visibleFacts: [action], scene: {}, characters: [{ characterId: "character_xiaofen", action, actionTarget: "the story focus", gazeTarget: "the story focus", hands: "hands visible", region: { xStart: 0, xEnd: 1 } }], interactions: [], camera: { shotSize: "medium shot" }, stateChanges: [], warnings: [] }, { ...base, characterIds: ["character_xiaofen"] });
    const result = buildRegionalPrompt({ ...base, characterIds: ["character_xiaofen"], visualSpecConfirmed: true, visualSpec, characterLooks: {} }, data.assets, data.characters);
    assert.equal(result.poseControl?.lowerBodyControl, "hidden_by_framing", action);
    assert.deepEqual(result.poseControl?.hiddenJointIndices, [8, 9, 10, 11, 12, 13], action);
    assert.ok(result.poseControl?.framingWarnings.some((warning) => /下肢|髋膝踝/.test(warning)), action);
  }
});

test("position and region contradictions are P0 blocked", () => {
  const data = getStudioData(1), base = data.episode.pages[0].shots[0];
  const spec = normalizeShotSpec({ visibleFacts: ["a character stands"], scene: {}, characters: [{ characterId: "character_xiaofen", position: "left side of the frame", action: "standing", actionTarget: "the story focus", gazeTarget: "the story focus", hands: "hands out of frame", region: { xStart: 0, xEnd: 1 } }], interactions: [], camera: {}, stateChanges: [], warnings: [] }, { ...base, characterIds: ["character_xiaofen"] });
  const validation = validateVisualIds(spec, data.characters, data.assets);
  assert.equal(validation.blocked, true);
  assert.ok(validation.conflicts.some((conflict) => /position=.*left.*region=0-1/.test(conflict)));
});

test("负向编辑超过词项上限时必须显式拒绝而不是静默截断", () => {
  const data = getStudioData(1), shot = data.episode.pages[0].shots[0];
  const edited = Array.from({ length: 100 }, (_, index) => `editorial-negative-term-${index}`).join(", ");
  const trace = buildCanonicalNegativePromptTrace(shot, "bad anatomy", edited);
  assert.equal(trace.accepted, false);
  assert.equal(trace.droppedTerms.length, 4);
  assert.match(trace.requested, /editorial-negative-term-99/);
  assert.doesNotMatch(trace.applied, /editorial-negative-term-99/);
});

test("结构化 propId 和中文动作会强制建立道具契约",()=>{
  const data=getStudioData(1),base=data.episode.pages[0].shots[0];
  const visualSpec=normalizeShotSpec({visibleFacts:["人物看手机"],scene:{location:"room",timeOfDay:"day",weather:"dry",anchors:[],lighting:"soft"},characters:[{characterId:"character_xiaofen",action:"查看消息",actionTarget:"手机",gazeTarget:"手机屏幕",hands:"双手持手机",position:"center",region:{xStart:0,xEnd:1}}],interaction:{type:"use",propId:"parcel_notification_device",actorCharacterId:"character_xiaofen",targetCharacterId:"",contactPoint:"hands",phase:"in progress"},camera:{shotSize:"close-up"},stateChanges:[],warnings:[]},base);
  const contract=deriveInteractionContract({...base,characterIds:["character_xiaofen"],visualSpecConfirmed:true,visualSpec,characterLooks:{}},"character_xiaofen");
  assert.equal(contract.required,true); assert.equal(contract.object,"parcel_notification_device");
  assert.match(contract.negative.join(" "),/missing parcel_notification_device/);
});

test("通用手持工具生成单手接触契约与动作骨架",()=>{
  const data=getStudioData(1),shot={...data.episode.pages[0].shots[0],characterIds:["character_xiaofen"],actionEn:"using a screwdriver to tighten a cabinet hinge",characterLooks:{}};
  const contract=deriveInteractionContract(shot,"character_xiaofen"),result=buildRegionalPrompt(shot,data.assets,data.characters);
  assert.equal(contract.object,"screwdriver");assert.equal(contract.handMode,"one");assert.equal(contract.shape,"elongated");
  assert.deepEqual(contract.contactAnchors.map(a=>({x:a.x,y:a.y})),[contract.actionPlan!.geometry.gripPoint]);
  assert.equal(result.poseControl?.posePlanVersion,"3.0");
  assert.equal(result.poseControl?.safety.valid,true);
});

test("不同用途的单手道具从源头共享物体与腕部接触高度",()=>{
  const data=getStudioData(1),base=data.episode.pages[0].shots[0];
  for(const actionEn of ["answering a phone call with the smartphone beside her ear","drinking tea from a cup","using a screwdriver on a cabinet hinge"]){
    const contract=deriveInteractionContract({...base,characterIds:["character_xiaofen"],description:"",actionEn,characterLooks:{},visualSpecConfirmed:false},"character_xiaofen");
    assert.equal(contract.handMode,"one",actionEn);
    if(contract.actionPlan)assert.deepEqual(contract.contactAnchors.map(a=>({x:a.x,y:a.y})),[contract.actionPlan.geometry.gripPoint]);
    else assert.ok(contract.contactAnchors.every((anchor)=>anchor.y===contract.objectCenter.y),actionEn);
  }
});

test("已确认的沙发坐姿事实会生成坐姿交互骨架",()=>{
  const data=getStudioData(1),base=data.episode.pages[0].shots[0];
  const prepared={...base,characterIds:["character_xiaofen"],actionEn:"holding a smartphone",characterLooks:{}};
  const visualSpec=normalizeShotSpec({visibleFacts:["Xiaofen is seated on a sofa holding a smartphone with both hands"],scene:{location:"living room",timeOfDay:"afternoon",weather:"dry",anchors:["sofa","window"],lighting:"window light"},characters:[{characterId:"character_xiaofen",action:"holding a smartphone",actionTarget:"smartphone",gazeTarget:"phone screen",hands:"both hands holding the phone",position:"seated on the sofa",region:{xStart:0,xEnd:1}}],camera:{shotSize:"medium shot"},stateChanges:[],warnings:[]},prepared);
  const shot={...prepared,visualSpecConfirmed:true,visualSpec};
  const result=buildRegionalPrompt(shot,data.assets,data.characters);
  assert.match(result.poseControl?.kind||"",/single_action_seated/);
});

test("单人全景启用完整四肢 OpenPose 模板", () => {
  const data=getStudioData(1),shot={...data.episode.pages[0].shots[0],camera:"全景",cameraEn:"full shot",description:"A static full-body character standing in the room",actionEn:"natural storytelling action",characterIds:["character_xiaofen"],characterLooks:{},visualSpecConfirmed:false};
  const result=buildRegionalPrompt(shot,data.assets,data.characters);
  assert.equal(result.poseControl?.kind,"single_full_body_v1");
  assert.equal(result.poseControl?.people.length,1);
  assert.equal(result.poseControl?.people[0].length,18);
});

test("多人剧情漏绑配角时禁止伪装成1girl生成", () => {
  const data = getStudioData(1);
  const supporting = data.characters.find((item) => item.name !== "小粉");
  assert.ok(supporting);
  const shot = {
    ...data.episode.pages[0].shots[0],
    title: "陌生女孩递伞",
    description: `小粉准备冒雨回家，${supporting.name}把伞递给了她`,
    dialogue: "",
    characterIds: ["character_xiaofen"],
    actionEn: "Xiaofen reaches toward an offered umbrella",
    expressionEn: "surprised but grateful expression",
  };
  const result = buildGenerationPrompt(shot, data.assets, data.characters);
  assert.equal(result.quality.valid, false);
  assert.ok(result.quality.blockingErrors.length > 0);
  assert.match(result.quality.blockingErrors.join(" "), /多人|绑定/);
});

test("空泛动作和矛盾镜头会被提示词门禁拦截", () => {
  const data = getStudioData(1);
  const original = data.episode.pages[0].shots[0];
  const quality = analyzeGenerationPrompt(
    {
      ...original,
      actionEn: "natural storytelling action",
      expressionEn: "gentle, natural expression",
      sceneEn: "coherent story environment",
      cameraEn: "close-up",
      compositionEn: "full body, head to toe",
    },
    data.characters,
  );
  assert.equal(quality.valid, false);
  assert.ok(quality.errors.length >= 4);
});

test("具体地点已知时系统可补全空泛单人提示词", () => {
  const data = getStudioData(1);
  const original = data.episode.pages[0].shots[0];
  const broken = {
    ...original,
    scene: "客厅",
    actionEn: "natural storytelling action",
    expressionEn: "gentle, natural expression",
    sceneEn: "coherent story environment",
    compositionEn: "clear storytelling composition",
    cameraEn: "medium shot",
  };
  const repaired = { ...broken, ...suggestPromptFixes(broken) };
  const result = buildGenerationPrompt(repaired, data.assets, data.characters);
  assert.equal(result.quality.valid, true, JSON.stringify({ scene: repaired.scene, environment: result.environment, errors: result.quality.errors }));
  assert.match(result.prompt, /standing upright in three-quarter view/);
  assert.doesNotMatch(result.prompt, /hands naturally positioned for the described action/);
  assert.doesNotMatch(
    result.prompt,
    /natural storytelling action|coherent story environment/,
  );
});

test("批准草稿会把同一任务转换为单张512方形成品配方", () => {
  const data = getStudioData(1);
  const shot = data.episode.pages[0].shots[0];
  const payload = {
    phase: "draft",
    draftImagePath: "../角色资产/小粉/00-原始参考图.png",
    recipe: {
      phase: "draft",
      endpoint: "http://127.0.0.1:7860/sdapi/v1/txt2img",
      width: 384,
      height: 384,
      steps: 12,
      cfgScale: 5.5,
      batchSize: 1,
      references: [],
      finalReferences: [],
    },
  };
  const id = createPersistentGenerationJob(shot.id, "sd-webui", payload);
  updateGenerationJobPayload(id, payload);
  updatePersistentGenerationJob(
    id,
    "awaiting_draft_approval",
    100,
    "",
    "等待确认",
  );
  assert.ok(approveSdDraft(1, id));
  const converted = getGenerationJobRecord(id);
  const next = JSON.parse(converted.payload);
  assert.equal(converted.status, "final_queued");
  assert.equal(next.recipe.phase, "final");
  assert.equal(next.recipe.endpoint.endsWith("/img2img"), true);
  assert.equal(next.recipe.width, 512);
  assert.equal(next.recipe.height, 512);
  assert.equal(next.recipe.batchSize, 1);
  assert.equal(next.recipe.denoisingStrength, 0.35);
});

test("远景不会同时要求双手入镜和 hands out of frame", () => {
  const data = getStudioData(1);
  const original = data.episode.pages[0].shots[0];
  const characterId = original.characterIds[0];
  const shot = {
    ...original,
    camera: "远景",
    cameraEn: "wide shot",
    characterIds: [characterId],
    characterLooks: {
      [characterId]: {
        ...(original.characterLooks?.[characterId] || {}),
        actionEn: "entering the office with a clear forward step",
        handsEn: "hands out of frame",
      },
    },
  };
  const result = buildGenerationPrompt(shot, data.assets, data.characters);
  assert.match(result.prompt, /arms naturally counter-swinging with the movement/);
  assert.doesNotMatch(result.prompt, /hands out of frame/);
});

test("含语义检查项的草稿必须逐项通过并保存审核证据", () => {
  const data=getStudioData(1),shot=data.episode.pages[0].shots[0];
  const items=[
    {id:"interaction_review_required",label:"关键交互",priority:"P0",required:true,expectation:"双手正确持手机",sources:["propInteraction"]},
    {id:"outfit_review_required",label:"服装一致性",priority:"P1",required:true,expectation:"服装符合当前规格",sources:["outfitConditioning"]},
  ];
  const payload={phase:"draft",draftImagePath:"../角色资产/小粉/00-原始参考图.png",recipe:{phase:"draft",endpoint:"http://127.0.0.1:7860/sdapi/v1/txt2img",postprocessWarnings:[],pixelQa:{status:"passed"},semanticQa:{version:"semantic-review-v1",status:"manual_required",items,labels:items.map((item)=>item.id)},references:[],finalReferences:[]}};
  const id=createPersistentGenerationJob(shot.id,"sd-webui",payload);
  updateGenerationJobPayload(id,payload);
  updatePersistentGenerationJob(id,"awaiting_draft_approval",100,"","等待确认");
  assert.equal(approveSdDraft(1,id),null);
  assert.equal(approveSdDraft(1,id,{version:"semantic-review-v1",verdicts:{interaction_review_required:"pass",outfit_review_required:"fail"}}),null);
  assert.equal(approveSdDraft(1,id,{version:"semantic-review-v1",verdicts:{interaction_review_required:"pass"}}),null);
  assert.ok(approveSdDraft(1,id,{version:"semantic-review-v1",verdicts:{interaction_review_required:"pass",outfit_review_required:"pass"},notes:"逐项检查完成"}));
  const recipe=JSON.parse(getGenerationJobRecord(id).payload).recipe;
  assert.equal(recipe.semanticApproval.version,"semantic-review-v1");
  assert.equal(recipe.semanticApproval.verdicts.outfit_review_required,"pass");
  assert.equal(recipe.semanticApproval.reviewedItems.length,2);
  assert.equal(recipe.semanticApproval.notes,"逐项检查完成");
});

test("草稿整体确认无需逐项点击且保留检查契约快照", () => {
  const data=getStudioData(1),shot=data.episode.pages[0].shots[0];
  const items=[{id:"character_count_review_required",label:"人物数量",priority:"P0",required:true,expectation:"恰好一人",sources:["generationSpec"]}];
  const payload={phase:"draft",draftImagePath:"../角色资产/小粉/00-原始参考图.png",recipe:{phase:"draft",endpoint:"http://127.0.0.1:7860/sdapi/v1/txt2img",postprocessWarnings:[],pixelQa:{status:"passed"},semanticQa:{version:"semantic-review-v1",status:"manual_required",items,labels:[items[0].id]},references:[],finalReferences:[]}};
  const id=createPersistentGenerationJob(shot.id,"sd-webui",payload);
  updateGenerationJobPayload(id,payload);
  updatePersistentGenerationJob(id,"awaiting_draft_approval",100,"","等待整体确认");
  assert.ok(approveSdDraft(1,id,{version:"semantic-review-v1",verdicts:{},overallConfirmed:true,notes:"用户已整体确认草稿。"}));
  const stored=JSON.parse(getGenerationJobRecord(id).payload);
  assert.equal(getGenerationJobRecord(id).status,"final_queued");
  assert.equal(stored.recipe.semanticApproval.reviewMode,"overall_confirmation");
  assert.equal(stored.recipe.semanticApproval.reviewedItems.length,0);
  assert.equal(stored.recipe.semanticApproval.reviewContractSnapshot[0].id,"character_count_review_required");
});

test("最终图片必须按当前哈希重新逐项复核后才写入候选", () => {
  const data=getStudioData(1),shot=data.episode.pages[0].shots[0];
  const finalReviewImagePath="../角色资产/小粉/00-原始参考图.png";
  const absolute=path.resolve(process.cwd(),finalReviewImagePath);
  const imageSha256=createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
  const items=[{id:"identity_review_required",label:"身份与发型",priority:"P1",required:true,expectation:"身份与参考一致",sources:["identity reference"]}];
  const payload={phase:"final",finalReviewImagePath,recipe:{phase:"final",postprocessWarnings:[],pixelQa:{status:"passed"},semanticQa:{version:"semantic-review-v1",status:"manual_required",items,labels:[items[0].id]},generationSpec:{visualSpec:{characters:[{characterId:"character_xiaofen"}]}},requestTrace:{prompt:"test"},passTraces:[],finalReview:{status:"manual_required",stage:"final",imageSha256}}};
  const id=createPersistentGenerationJob(shot.id,"sd-webui",payload,"final_queued");
  updateGenerationJobPayload(id,payload);
  updatePersistentGenerationJob(id,"awaiting_final_approval",100,"","等待最终复核");
  assert.equal(approveSdFinal(1,id),null);
  const approved=approveSdFinal(1,id,{version:"semantic-review-v1",verdicts:{identity_review_required:"pass"},notes:"最终图复核通过"});
  assert.ok(approved);
  const row=getGenerationJobRecord(id);
  assert.equal(row.status,"completed");
  const stored=JSON.parse(row.payload);
  assert.equal(stored.recipe.finalApproval.stage,"final");
  assert.equal(stored.recipe.finalApproval.imageSha256,imageSha256);
  const candidate=getStudioData(1).episode.pages.flatMap((page)=>page.shots).find((item)=>item.id===shot.id)?.candidates.find((item)=>item.sourceJobId===id);
  assert.equal(candidate?.qualityStatus,"approved");
  assert.equal(candidate?.imageSha256,imageSha256);
});

test("旧章节迁移后至少包含五页", () => {
  assert.ok(getStudioData(1).episode.pages.length >= 5);
});

test("自动分镜使用叙事任务而非重复占位句", () => {
  const analysis = analyzeStory(
    "小粉走进办公室。她收到一封意外来信。她决定马上寻找寄信人。",
  );
  const episodeId = createEpisodeFromStory(
    "小粉走进办公室。她收到一封意外来信。她决定马上寻找寄信人。",
    analysis,
    "current_series",
    1,
  );
  const descriptions = getStudioData(1, episodeId).episode.pages.flatMap(
    (page) => page.shots.map((shot) => shot.description),
  );
  assert.ok(
    descriptions.every(
      (description) => !description.includes("补充人物反应和环境细节"),
    ),
  );
  assert.ok(new Set(descriptions.slice(0, 5)).size > 1);
});

test("分格数值输入会限制在安全范围且记录受项目归属保护", () => {
  const data = getStudioData(1);
  const shot = data.episode.pages[0].shots[0];
  assert.equal(recordBelongsToProject("shot", shot.id, 1), true);
  assert.equal(recordBelongsToProject("shot", shot.id, 99999), false);
  updateShot(shot.id, { cropX: 999, cropY: -10, cropScale: 20 });
  const updated = getStudioData(1, data.episode.id).episode.pages[0].shots[0];
  assert.equal(updated.cropX, 100);
  assert.equal(updated.cropY, 0);
  assert.equal(updated.cropScale, 3);
});

test("Codex 每格只附带绑定人物、当前服装和当前鞋履", () => {
  const data = getStudioData(1);
  const page = data.episode.pages[0];
  const shot = page.shots[0];
  queueCodexPage(page.id);
  const queued = getStudioData(1, data.episode.id).jobs.find(
    (job) =>
      job.shotId === shot.id &&
      job.provider === "codex" &&
      job.status === "awaiting_codex",
  );
  assert.ok(queued);
  const payload = JSON.parse(queued.payload) as {
    candidateCount: number;
    references: Array<{ assetId: string; characterId: string; role: string }>;
  };
  assert.ok(payload.references.length > 0);
  for (const reference of payload.references) {
    assert.ok(reference.assetId);
    assert.ok(shot.characterIds.includes(reference.characterId));
    if (reference.role === "outfit" && !reference.assetId.startsWith("character-reference:"))
      assert.equal(reference.assetId, shot.characterLooks[reference.characterId]?.outfitId || shot.outfitId);
    if (reference.role === "shoes" && !reference.assetId.startsWith("character-reference:"))
      assert.equal(reference.assetId, shot.characterLooks[reference.characterId]?.shoeId || shot.shoeId);
  }
  assert.ok(payload.references.some(reference => reference.role === "identity_face"));
  assert.equal(payload.candidateCount, 2);
});

test("动作人物先于背景且夜晚保留时段并服从场景光源", () => {
  const data = getStudioData(1);
  const source = data.episode.pages[0].shots[0];
  const shot = {
    ...source,
    timeOfDay: "夜晚",
    cameraEn: "wide shot",
    environment: {
      ...source.environment,
      location: "rainy city street",
      foreground: "wet pavement",
      midground: "puddle reflections",
      background: "illuminated office windows",
      keyLight: "cool light from office windows",
      depth: "clear foreground midground and background separation",
    },
  };
  const result = buildGenerationPrompt(shot, data.assets, data.characters);
  assert.ok(
    result.prompt.indexOf("rainy city street") >
      result.prompt.indexOf("soft pink"),
  );
  assert.match(result.prompt, /night/);
  assert.match(result.prompt, /cool light from office windows/);
  assert.match(result.negativePrompt, /plain background/);
});

test("特写保留环境线索但不强制排除浅景深", () => {
  const data = getStudioData(1);
  const shot = {
    ...data.episode.pages[0].shots[0],
    camera: "特写",
    cameraEn: "close-up",
    actionEn: "upper body turned toward camera, hands out of frame",
    expressionEn: "calm smile, looking at viewer",
    compositionEn: "face framed with office context",
  };
  const result = buildGenerationPrompt(shot, data.assets, data.characters);
  assert.match(result.prompt, /head-and-shoulders framing/);
  assert.ok(result.prompt.includes(result.environment.location));
  assert.doesNotMatch(result.negativePrompt, /excessive background blur/);
});

test("成品继承目标尺寸且任务查询支持分页剧情标识", () => {
  const data = getStudioData(1);
  const shot = data.episode.pages[0].shots[0];
  const payload = {
    phase: "draft",
    draftImagePath: "../角色资产/小粉/00-原始参考图.png",
    recipe: {
      phase: "draft",
      endpoint: "http://127.0.0.1:7860/sdapi/v1/txt2img",
      width: 256,
      height: 384,
      targetWidth: 512,
      targetHeight: 768,
      steps: 12,
      cfgScale: 5.5,
      batchSize: 1,
      references: [],
      finalReferences: [],
    },
  };
  const id = createPersistentGenerationJob(shot.id, "sd-webui", payload);
  updateGenerationJobPayload(id, payload);
  updatePersistentGenerationJob(
    id,
    "awaiting_draft_approval",
    100,
    "",
    "等待确认",
  );
  assert.ok(approveSdDraft(1, id));
  const recipe = JSON.parse(getGenerationJobRecord(id).payload).recipe;
  assert.equal(recipe.width, 512);
  assert.equal(recipe.height, 768);
  const page = getPaginatedJobs(1, 1, 5);
  assert.ok(page.total >= 1);
  assert.ok(page.items[0].episodeTitle);
  assert.ok(page.items[0].projectTitle);
  const candidateId = addCandidate(
    shot.id,
    "workspace/generated/test-export.png",
    "测试导出",
  );
  assert.ok(getCandidateExport(candidateId, 1));
  assert.equal(getCandidateExport(candidateId, 99999), undefined);
});

test("AI 镜头动作替换旧占位词并继承上一格环境", () => {
  const data=getStudioData();const source=data.episode.pages[0].shots[0];
  const shot={...source,actionEn:"natural storytelling action",expressionEn:"gentle, natural expression",characterLooks:{}};
  const spec=normalizeShotSpec({visibleFacts:["an umbrella changes hands"],scene:{sceneId:"rain",location:"unknown",timeOfDay:"unknown",weather:"unknown",anchors:[],lighting:"unknown"},characters:[{characterId:shot.characterIds[0],action:"reaching toward the umbrella",expression:"surprised",gazeTarget:"umbrella handle",hands:"right hand reaching",position:"left",region:{xStart:0,xEnd:.5}}],interaction:null,camera:{},stateChanges:[],warnings:[]},shot);
  assert.equal(spec.characters[0].action,"reaching toward the umbrella");
  const previous={...spec,scene:{...spec.scene,location:"office exit",timeOfDay:"evening",weather:"steady rain",anchors:["glass doors"],lighting:"warm lobby light"}};
  // This case exercises missing environment inheritance, not an explicit
  // lighting/time change from the stored shot's fallback values.
  const inherited=inheritShotContinuity({...spec,scene:{...spec.scene,timeOfDay:"unknown",lighting:"unknown"}},previous,null);
  assert.equal(inherited.scene.location,"office exit");
  assert.equal(inherited.scene.weather,"steady rain");
});

test("提示词压缩遵守片段预算并移除明显语义重复",()=>{
  const value=Array.from({length:100},(_,index)=>`detail ${index}`).join(", ");
  assert.equal(compactPrompt(value,20).split(", ").length,20);
  assert.equal(compactPrompt("consistent canonical face, canonical face, blue eyes").match(/face/g)?.length,1);
});

test("人物持物左右遵守骨架手侧且不随关系顺序漂移", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0],id="character_xiaofen";
  for(const region of [{xStart:0,xEnd:1},{xStart:0,xEnd:.5},{xStart:.5,xEnd:1}]) {
    const spec=normalizeShotSpec({visibleFacts:["walking while carrying props"],scene:{},characters:[{characterId:id,region,action:"walking with objects at her side",gazeTarget:"looking forward along the path",hands:"left hand carrying a smartphone at her side; right hand carrying a cup at her side"}],interactions:[
      {type:"prop_interaction",actorCharacterId:id,propId:"smartphone",action:"carrying a smartphone",contactPoints:["left hand holding smartphone at her side"]},
      {type:"prop_interaction",actorCharacterId:id,propId:"cup",action:"carrying a cup",contactPoints:["right hand holding cup at her side"]},
    ],camera:{shotSize:"wide shot"},stateChanges:[],warnings:[]},{...base,characterIds:[id]});
    const shot={...base,characterIds:[id],characterLooks:{},visualSpecConfirmed:true,visualSpec:spec};
    const contracts=deriveInteractionContracts(shot,id), center=(region.xStart+region.xEnd)/2;
    const twoHandShot={...shot,visualSpec:{...spec,characters:spec.characters.map(c=>({...c,action:"reading smartphone",hands:"both hands holding smartphone in front of torso"})),interactions:[{...spec.interactions[0],action:"reading smartphone with both hands",contactPoints:["both hands holding smartphone in front of torso"]}]}};
    const singleContract=deriveInteractionContract(twoHandShot,id);
    const wrappedContract=deriveInteractionContracts(twoHandShot,id)[0];
    assert.equal(wrappedContract.handMode,"two");
    assert.deepEqual(wrappedContract.objectCenter,singleContract.objectCenter);
    assert.deepEqual(wrappedContract.contactAnchors,singleContract.contactAnchors);
    const compiled=buildRegionalPrompt(shot,data.assets,data.characters,{posePlannerVersion:"3.0"});
    const actor=compiled.poseControl!.people[0];
    assert.ok(actor[7].x>actor[1].x,"anatomical left carry stays on the left shoulder side after projection");
    assert.ok(actor[4].x<actor[1].x,"anatomical right carry stays on the right shoulder side after projection");
    assert.ok(contracts[0].objectCenter.x>center);
    assert.ok(contracts[1].objectCenter.x<center);
    const reversed=deriveInteractionContracts({...shot,visualSpec:{...spec,interactions:[...spec.interactions].reverse()}},id);
    for(const c of contracts) {
      const other=reversed.find(r=>r.object===c.object)!;
      assert.deepEqual(other.objectCenter,c.objectCenter);
      assert.deepEqual(other.contactAnchors,c.contactAnchors);
      assert.doesNotMatch(c.positive.join(" "),/physically contact and operate/);
      assert.equal(c.contactAnchors[0].x,c.objectCenter.x);
    }
  }
});

test("雨伞交接不强制正面补光或双眼可见", () => {
  const data=getStudioData(1), base=data.episode.pages[0].shots[0];
  for(const lighting of ["dim blue moonlight", "warm backlight from sunset"]) {
    const shot={...base,actionEn:"giving and receiving an umbrella",characterLooks:{},visualSpecConfirmed:true,visualSpec:normalizeShotSpec({visibleFacts:["umbrella handover in profile"],scene:{location:"quiet road",timeOfDay:"night",weather:"light rain",lighting,anchors:[]},characters:base.characterIds.map(characterId=>({characterId,action:"offering an umbrella",gazeTarget:"umbrella handle",occlusion:"umbrella canopy partially obscures the face"})),interactions:[],camera:{angle:"side view"},stateChanges:[],warnings:[]},base)};
    const result=buildRegionalPrompt(shot,data.assets,data.characters);
    assert.ok(result.basePrompt.includes(lighting));
    assert.doesNotMatch(result.basePrompt,/frontal fill|both eyes fully visible|no deep umbrella shadow|above and behind the heads/);
    assert.ok(result.promptPlan.facts.common.some(field=>field.group==="lighting" && field.text.includes(lighting)));
  }
});

test("确认天气不被旧雨景或递伞负向推翻", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0];
  for(const weather of ["sunny dry weather", "overcast with no rain", "light rain"]) {
    const shot={...base,scene:"雨夜街道",description:"两人在雨中交接雨伞",actionEn:"giving and receiving an umbrella",visualSpecConfirmed:true,visualSpec:normalizeShotSpec({visibleFacts:["umbrella handover"],scene:{location:"quiet road",timeOfDay:"afternoon",weather,lighting:"natural ambient light",anchors:[]},characters:base.characterIds.map(characterId=>({characterId,action:"offering an umbrella"})),interactions:[],camera:{},stateChanges:[],warnings:[]},base)};
    const result=buildRegionalPrompt(shot,data.assets,data.characters);
    assert.ok(result.basePrompt.includes(weather.replace("with no rain", "" ).trim()));
    if(weather.includes("no rain")) assert.match(result.negativePrompt,/rain/);
    assert.doesNotMatch(result.negativePrompt,/dry pavement|no falling rain|sunny weather/);
    if(weather!=="light rain") assert.doesNotMatch(result.basePrompt,/active rain visibly falling/);
  }
});

test("儿童与老人档案不被通用负向排除", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0];
  for(const age of ["child", "elderly person"]) {
    const id=createCharacter({name:`Age fixture ${age}`,descriptionCn:"测试",appearanceEn:age,invariantsEn:[],visualTraits:{hairColorEn:"brown",hairStyleEn:"short",eyeColorEn:"brown"},profile:{agePresentationEn:age}});
    const character=getStudioData().characters.find(c=>c.id===id)!;
    for(const ids of [[id],[id,"character_xiaofen"]]) {
      const shot={...base,characterIds:ids,characterLooks:{},negativePromptEn:"",visualSpecConfirmed:false};
      const characters=[character,...data.characters.map(c=>({...c,profile:c.profile?{...c.profile,outfitNegativeEn:""}:undefined}))];
      const ordinary=buildGenerationPrompt(shot,data.assets,characters);
      const regional=buildRegionalPrompt(shot,data.assets,characters);
      assert.ok(ordinary.prompt.includes(age));
      assert.ok(regional.characterRegions[0].prompt.includes(age));
      for(const result of [ordinary,regional]) {
        assert.doesNotMatch(result.negativePrompt,/\bchild\b|\belderly\b/);
        assert.match(result.negativePrompt,/bad anatomy|deformed limbs/);
      }
    }
  }
});

test("多人公共负向不能禁止其中一人的显式镜头视线", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0],ids=data.characters.slice(0,2).map(c=>c.id);
  assert.equal(ids.length,2);
  for(const cameraIndex of [0,1,-1]) {
    const shot={...base,characterIds:ids,negativePromptEn:"",characterLooks:{},visualSpecConfirmed:true,visualSpec:normalizeShotSpec({visibleFacts:["two people walking"],scene:{},characters:ids.map((characterId,index)=>({characterId,action:"walking",gazeTarget:index===cameraIndex?"looking at the camera":"looking forward along the path"})),interactions:[],camera:{},stateChanges:[],warnings:[]},{...base,characterIds:ids})};
    const ordinary=buildGenerationPrompt(shot,data.assets,data.characters),regional=buildRegionalPrompt(shot,data.assets,data.characters);
    for(const result of [ordinary,regional]) {
      if(cameraIndex>=0) assert.doesNotMatch(result.negativePrompt,/looking at viewer|eye contact with camera|front-facing portrait gaze/);
      else assert.match(result.negativePrompt,/looking at viewer/);
    }
    if(cameraIndex>=0) assert.match(regional.characterRegions[cameraIndex].prompt,/looking at the camera/);
    assert.match(regional.characterRegions[cameraIndex===0?1:0].prompt,/looking forward along the path/);
  }
});

test("基础镜头视线识别与身份阶段支持相同肯定和否定表达", () => {
  const data=getStudioData(1),base=data.episode.pages[0].shots[0],id=base.characterIds[0];
  for(const [gaze,allowed] of [["looking directly at the camera",true],["gazing towards the viewer",true],["eye contact with viewer",true],["not looking at the camera",false],["avoid gazing directly towards the viewer",false],["without eye contact with viewer",false]] as const) {
    const shot={...base,characterIds:[id],negativePromptEn:"",characterLooks:{},visualSpecConfirmed:true,visualSpec:normalizeShotSpec({visibleFacts:["a person walking"],scene:{},characters:[{characterId:id,action:"walking",gazeTarget:gaze}],interactions:[],camera:{},stateChanges:[],warnings:[]},{...base,characterIds:[id]})};
    for(const result of [buildGenerationPrompt(shot,data.assets,data.characters),buildRegionalPrompt(shot,data.assets,data.characters)]) {
      assert.equal(/looking at viewer/.test(result.negativePrompt),!allowed,gaze);
    }
  }
});

test("复杂表情保留否定与混合情绪，不被关键词改写",()=>{
  for(const value of ["unhappy", "not happy", "sad but smiling", "happy but worried", "不高兴", "悲喜交加", "surprised but not afraid"]) {
    assert.equal(expressionPrompt(value),`${value}, clearly readable facial expression`);
  }
  assert.match(expressionPrompt("happy"),/warm open smile/);
  assert.match(expressionPrompt("surprised"),/raised brows/);
});

test("历史手部无轮廓草稿可以整体确认并保留未应用警告", () => {
  const data=getStudioData(1),shot=data.episode.pages[0].shots[0];
  const items=[{id:"character_count_review_required",label:"人物数量",priority:"P0",required:true,expectation:"恰好一人",sources:["generationSpec"]}];
  const payload={phase:"draft",draftImagePath:"../角色资产/小粉/00-原始参考图.png",recipe:{phase:"draft",endpoint:"http://127.0.0.1:7860/sdapi/v1/txt2img",postprocessWarnings:["手部深度修复未应用，已保留道具阶段图片：所有可用手部检测器均未返回可用轮廓"],pixelQa:{status:"passed"},semanticQa:{version:"semantic-review-v1",status:"manual_required",items,labels:[items[0].id]},references:[],finalReferences:[]}};
  const id=createPersistentGenerationJob(shot.id,"sd-webui",payload);
  updateGenerationJobPayload(id,payload);
  updatePersistentGenerationJob(id,"draft_blocked",100,"","等待整体确认");
  updateGenerationJobPayload(id,{...payload,recipe:{...payload.recipe,pixelQa:{status:"blocked"}}});
  assert.equal(approveSdDraft(1,id,{version:"semantic-review-v1",verdicts:{},overallConfirmed:true}),null);
  updateGenerationJobPayload(id,{...payload,recipe:{...payload.recipe,postprocessWarnings:["视线校正失败"]}});
  assert.equal(approveSdDraft(1,id,{version:"semantic-review-v1",verdicts:{},overallConfirmed:true}),null);
  updateGenerationJobPayload(id,payload);
  assert.ok(approveSdDraft(1,id,{version:"semantic-review-v1",verdicts:{},overallConfirmed:true,notes:"用户已整体确认草稿。"}));
  const stored=JSON.parse(getGenerationJobRecord(id).payload);
  assert.equal(getGenerationJobRecord(id).status,"final_queued");
  assert.deepEqual(stored.recipe.postprocessWarnings,payload.recipe.postprocessWarnings);
  assert.equal(stored.recipe.semanticApproval.reviewMode,"overall_confirmation");
  assert.equal(stored.recipe.semanticApproval.reviewedItems.length,0);
  assert.equal(stored.recipe.semanticApproval.reviewContractSnapshot[0].id,"character_count_review_required");
});

