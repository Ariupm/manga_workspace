import assert from "node:assert/strict";
import test from "node:test";
import { analyzeStory } from "../lib/analysis";
import { inheritShotContinuity, normalizeShotSpec, validateVisualIds } from "../lib/visual-planning";
import {
  analyzeGenerationPrompt,
  buildGenerationPrompt,
  buildRegionalPrompt,
  deriveInteractionContract,
  compactPrompt,
  sanitizeEnglishPrompt,
  suggestPromptFixes,
} from "../lib/prompts";

test("Regional 提示词自动移除混入的中文片段", () => {
  const cleaned = sanitizeEnglishPrompt("rainy street, 小粉抬手接伞, visible umbrella, 夜晚灯光");
  assert.equal(cleaned, "rainy street, visible umbrella");
  assert.doesNotMatch(cleaned, /[\u3400-\u9fff]/);
});
import {
  addCandidate,
  approveSdDraft,
  createEpisodeFromStory,
  createPersistentGenerationJob,
  createCharacter,
  createCharacterAssetJob,
  addCharacterReference,
  updateCharacterProfile,
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
  assert.ok("id" in createCharacterAssetJob(id, "face"));
  assert.equal("error" in createCharacterAssetJob(id, "outfit"), true);
  assert.equal(addCharacterReference(id, "face", "workspace/test-face.png"), true);
  assert.ok("id" in createCharacterAssetJob(id, "outfit"));
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
  assert.match(result.prompt, /2girls, exactly 2 distinct adult women/);
  assert.match(result.prompt, /short black hair/);
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
  assert.match(result.basePrompt, /exactly 2 clearly rendered foreground principal adult women/);
  assert.match(result.basePrompt, /foreground|pavement|door edge/i);
  assert.match(result.basePrompt, /midground|crosswalk|reception/i);
  assert.match(result.basePrompt, /background|storefronts|corridor/i);
  assert.doesNotMatch(result.basePrompt, /pink hair|blue eyes|black hair|green eyes/i);
  assert.match(result.regionPrompts[0], /pink hair/);
  assert.match(result.regionPrompts[0], /woman on the right/);
  assert.match(result.regionPrompts[1], /black hair/);
  assert.match(result.regionPrompts[1], /woman on the left/);
  assert.match(result.basePrompt, /umbrella handover at the center/);
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
  assert.match(result.commonPrompt, /strict crop at the waist/);
  assert.match(result.commonPrompt, /soft frontal fill light on both faces/);
  assert.match(result.commonPrompt, /umbrella edges remain above and behind the heads/);
  assert.doesNotMatch(result.commonPrompt, /knees and five fingers/);
  assert.match(result.negativePrompt, /deep shadow across eyes/);
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
  assert.match(fixed.characterLooks![supporting.id].actionEn, /offering her an open umbrella/);
  assert.match(fixed.characterLooks!.character_xiaofen.gazeEn, /woman offering/);
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
  assert.match(region.prompt, /wearing exactly the selected outfit/);
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
  assert.match(result.prompt, /1girl, solo, single person/);
  assert.match(result.negativePrompt, /multiple girls/);
  assert.match(result.negativePrompt, /character sheet/);
});

test("查看手机动作会约束头部瞳孔朝向并排除镜头眼神",()=>{
  const data=getStudioData(1),shot={...data.episode.pages[0].shots[0],characterIds:["character_xiaofen"],actionEn:"holding a smartphone and reading a new message",characterLooks:{}};
  const result=buildGenerationPrompt(shot,data.assets,data.characters);
  assert.match(result.prompt,/eyes focused on the smartphone screen/);
  assert.match(result.prompt,/pupils directed downward/);
  assert.match(result.negativePrompt,/eye contact with camera/);
  assert.doesNotMatch(result.prompt,/looking slightly toward the viewer/);
  assert.match(result.prompt,/required story prop clearly visible: smartphone/);
  assert.match(result.negativePrompt,/folded hands/);
});

test("道具交互契约可泛化到阅读物且绑定手、物与视线",()=>{
  const data=getStudioData(1),shot={...data.episode.pages[0].shots[0],characterIds:["character_xiaofen"],actionEn:"reading an open book on the sofa",characterLooks:{}};
  const contract=deriveInteractionContract(shot,"character_xiaofen");
  assert.equal(contract.required,true);
  assert.equal(contract.object,"book or document");
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
  assert.match(result.commonPrompt,/single-character narrative composition/);
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
  assert.equal(contract.viewerSurface,"back");
  assert.doesNotMatch(contract.positive.join(" "),/interaction purpose call|beside one ear/);
});

test("明确举到耳边的手机通话仍分类为 call",()=>{
  const data=getStudioData(1),base={...data.episode.pages[0].shots[0],characterIds:["character_xiaofen"],characterLooks:{}};
  const contract=deriveInteractionContract({...base,actionEn:"answering a phone call with the smartphone held beside her ear"},"character_xiaofen");
  assert.equal(contract.purpose,"call");
  assert.equal(contract.handMode,"one");
  assert.equal(contract.gazeMode,"independent");
});

test("通用手持工具生成单手接触契约与动作骨架",()=>{
  const data=getStudioData(1),shot={...data.episode.pages[0].shots[0],characterIds:["character_xiaofen"],actionEn:"using a screwdriver to tighten a cabinet hinge",characterLooks:{}};
  const contract=deriveInteractionContract(shot,"character_xiaofen"),result=buildRegionalPrompt(shot,data.assets,data.characters);
  assert.equal(contract.object,"handheld tool");assert.equal(contract.handMode,"one");assert.equal(contract.shape,"elongated");
  assert.match(result.poseControl?.kind||"",/single_action/);
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
  const data=getStudioData(1),shot={...data.episode.pages[0].shots[0],camera:"全景",cameraEn:"full shot",characterIds:["character_xiaofen"]};
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

test("系统可把空泛单人提示词补全为可生成配方", () => {
  const data = getStudioData(1);
  const original = data.episode.pages[0].shots[0];
  const broken = {
    ...original,
    actionEn: "natural storytelling action",
    expressionEn: "gentle, natural expression",
    sceneEn: "coherent story environment",
    compositionEn: "clear storytelling composition",
    cameraEn: "medium shot",
  };
  const repaired = { ...broken, ...suggestPromptFixes(broken) };
  const result = buildGenerationPrompt(repaired, data.assets, data.characters);
  assert.equal(result.quality.valid, true);
  assert.match(result.prompt, /hands out of frame/);
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
    references: Array<{ id: string }>;
  };
  const ids = payload.references.map((reference) => reference.id);
  assert.deepEqual(
    new Set(ids),
    new Set(["character_xiaofen", shot.outfitId, shot.shoeId]),
  );
  assert.equal(ids.length, 3);
  assert.equal(payload.candidateCount, 1);
});

test("场景先于人物且夜晚被编译为可见光源", () => {
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
      depth: "clear foreground midground and background separation",
    },
  };
  const result = buildGenerationPrompt(shot, data.assets, data.characters);
  assert.ok(
    result.prompt.indexOf("rainy city street") <
      result.prompt.indexOf("soft pink"),
  );
  assert.match(result.prompt, /deep blue ambient sky/);
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
  assert.match(result.prompt, /recognizable environment context/);
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
  const inherited=inheritShotContinuity(spec,previous,null);
  assert.equal(inherited.scene.location,"office exit");
  assert.equal(inherited.scene.weather,"steady rain");
});

test("提示词压缩遵守片段预算并移除明显语义重复",()=>{
  const value=Array.from({length:100},(_,index)=>`detail ${index}`).join(", ");
  assert.equal(compactPrompt(value,20).split(", ").length,20);
  assert.equal(compactPrompt("consistent canonical face, canonical face, blue eyes").match(/face/g)?.length,1);
});
