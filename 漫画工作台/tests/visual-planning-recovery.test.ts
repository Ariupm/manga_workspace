import assert from "node:assert/strict";
import test from "node:test";
import { normalizeShotSpec, inheritShotContinuity, characterContinuityMemory } from "../lib/visual-planning";
import { buildGenerationPrompt, buildRegionalPrompt, buildSingleActionPoseSvg, deriveInteractionContract, derivePoseActionPlan, validateShotActionSpecificity } from "../lib/prompts";
import { buildPoseControlV3 } from "../lib/pose-v3";
import { buildPoseControlFromPlan, derivePoseScenePlanV2 } from "../lib/pose-v2";
import type { Asset, Character, CharacterLook, ChapterVisualPlan, Shot } from "../lib/types";

const look = (patch: Partial<CharacterLook>): CharacterLook => ({
  outfitId: "", shoeId: "", hairColorEn: "", hairStyleEn: "", eyeColorEn: "", positionEn: "", actionEn: "", expressionEn: "", gazeEn: "", handsEn: "", ...patch,
});

const instructions = [
  "establish the exact starting positions, distance, facing directions, and immediate goal",
  "show the active character beginning one concrete story-changing action, clearly different from the previous pose",
  "show the other character's immediate visible reaction through gaze, expression, hands, and body distance",
  "reveal the key prop, contact point, or environmental change that explains how the event happens",
  "show the visible result with changed character, prop, or spatial state and establish direction into the next panel",
];
const actor = { id: "actor", name: "Actor", appearanceEn: "adult woman with brown hair", invariantsEn: [], references: [] } as unknown as Character;
const base = {
  id: 1, characterIds: [actor.id], title: "Along the road", description: "Walking along the sidewalk",
  scene: "street", sceneEn: "residential street", timeOfDay: "daytime", actionEn: "walking along the sidewalk",
  camera: "全景", cameraEn: "wide shot", expressionEn: "attentive", compositionEn: "", lightingEn: "",
  characterLooks: {}, outfitId: "", shoeId: "", visualSpecConfirmed: false,
} as Shot;
const rawSpec = (action = "walking along the sidewalk") => ({
  visibleFacts: [action], scene: { sceneId: "street", location: "residential street" },
  characters: [{ characterId: actor.id, action, actionTarget: "path ahead", hands: "arms swinging naturally", gazeTarget: "path ahead" }],
  interactions: [], camera: { shotSize: "wide shot" }, stateChanges: [], warnings: [],
});

test("携物时显式道路视线不能被手机或书本默认阅读覆盖", () => {
  for (const object of ["smartphone", "book"]) {
    for (const gaze of ["looking forward along the path", "looking toward the window", "looking at her companion"]) {
      const shot = {...base, description:"", characterLooks:{actor:look({actionEn:`walking while carrying a ${object}`,handsEn:`left hand holding a ${object} at her side`,gazeEn:gaze})}};
      const relation = deriveInteractionContract(shot,"actor");
      assert.equal(relation.purpose,"carry");
      assert.equal(relation.gaze,gaze);
      assert.equal(relation.gazeMode,"independent");
      assert.equal(relation.gazeTarget.point,null);
    }
  }
});

test("双人各自携物和阅读的视线及通话保持独立", () => {
  const shot={...base,description:"",characterIds:["reader","walker"],characterLooks:{
    reader:look({actionEn:"reading messages on a smartphone",handsEn:"both hands holding the phone in front of the chest",gazeEn:"looking down at the phone screen"}),
    walker:look({actionEn:"walking while carrying a smartphone",handsEn:"left hand holding a phone at her side",gazeEn:"looking forward along the road"}),
  }};
  for(const ids of [shot.characterIds,[...shot.characterIds].reverse()]) {
    const source={...shot,characterIds:ids};
    const read=deriveInteractionContract(source,"reader"),carry=deriveInteractionContract(source,"walker");
    assert.equal(read.purpose,"read");assert.equal(read.gazeTarget.kind,"object");assert.ok(read.gazeTarget.point);
    assert.equal(carry.purpose,"carry");assert.equal(carry.gazeTarget.kind,"independent");assert.equal(carry.gazeTarget.point,null);
  }
  const call=deriveInteractionContract({...base,description:"",characterLooks:{actor:look({actionEn:"talking on a phone call",handsEn:"right hand holding smartphone beside her ear",gazeEn:"looking through the window"})}},"actor");
  assert.equal(call.purpose,"call");assert.equal(call.gazeTarget.kind,"independent");
});

test("揉眼自动骨架在头部朝向修正后仍保持手脸接触", () => {
  for (const camera of ["close shot", "medium shot", "wide shot"]) {
    const shot = { ...base, scene: "", description: "", camera, cameraEn: camera, actionEn: "rubbing her eyes" };
    const v2 = buildSingleActionPoseSvg(shot, deriveInteractionContract(shot, actor.id));
    const p = v2.people[0];
    assert.ok(Math.hypot(p[4].x - p[0].x, p[4].y - p[0].y) < .06, `${camera}: wrist detached from face`);
    const v3 = buildPoseControlV3(shot);
    assert.ok(v3, "V3 self-touch must have a pose");
    const full = v3.fullPeople[0];
    assert.ok(Math.hypot(full[4].x - full[0].x, full[4].y - full[0].y) < .06, `${camera}: V3 full-space contact`);
  }
  const source = { ...base, scene: "", description: "", actionEn: "rubbing her eyes", camera: "中景", cameraEn: "medium shot" };
  for (const handedness of ["left", "right"] as const) {
    const plan = derivePoseScenePlanV2(source)!;
    plan.people[0].handedness = handedness;
    const p = buildPoseControlFromPlan(plan).people[0];
    const wrist = p[handedness === "left" ? 7 : 4];
    assert.ok(Math.hypot(wrist.x - p[0].x, wrist.y - p[0].y) < .06, `${handedness}: automatic contact follows head`);
  }
  const plan = derivePoseScenePlanV2(source)!;
  plan.people[0].relationTargets.push({ relationId: "explicit", activeHand: "right", handMode: "one", wristAssignments: [{ joint: 4, hand: "right", x: .3, y: .6 }] } as any);
  const protectedPose = buildPoseControlFromPlan(plan);
  assert.equal(protectedPose.people[0][4].x, .3);
  assert.equal(protectedPose.people[0][4].y, .6);
});

test("旧编排指令不能覆盖新人物动作，规范化、生成校验、prompt 和 Pose 使用具体动作", () => {
  for (const instruction of instructions) {
    const shot = { ...base, actionEn: instruction, characterLooks: { actor: look({ actionEn: instruction }) } };
    const normalized = normalizeShotSpec(rawSpec(), shot);
    assert.equal(normalized.characters[0].action, "walking along the sidewalk");
    const confirmed = { ...shot, visualSpec: normalized, visualSpecConfirmed: true };
    assert.deepEqual(validateShotActionSpecificity(confirmed), []);
    assert.equal(buildGenerationPrompt(confirmed, [], [actor]).characterLooks.actor.actionEn, "walking along the sidewalk");
    const regional = buildRegionalPrompt(confirmed, [], [actor]);
    assert.doesNotMatch(regional.prompt, /establish the exact|show the active|show the other|reveal the key|show the visible/);
    assert.equal(derivePoseActionPlan(confirmed).family, "locomotion");
    assert.equal(regional.poseControl?.scenePlan?.people[0].primaryAction, "locomotion");
    assert.doesNotMatch(regional.poseControl?.scenePlan?.people[0].sourceText || "", /establish the exact|show the active|show the other|reveal the key|show the visible/);
    assert.equal(validateShotActionSpecificity({ ...confirmed, visualSpecConfirmed: false }).length, 1);
  }
});

test("具体人工动作保持优先；只有编排指令时继续阻断，不伪造替代动作", () => {
  const shot = { ...base, actionEn: instructions[1], characterLooks: { actor: look({ actionEn: "running along the sidewalk" }) } };
  assert.equal(normalizeShotSpec(rawSpec(), shot).characters[0].action, "running along the sidewalk");
  const missing = { ...shot, characterLooks: { actor: look({ actionEn: instructions[1] }) } };
  const spec = normalizeShotSpec({ ...rawSpec(), characters: [{ characterId: actor.id }] }, missing);
  assert.equal(validateShotActionSpecificity({ ...missing, visualSpec: spec, visualSpecConfirmed: true }).length, 1);
});

test("场景切换使用当前章计划，不从上格室内继承家具、天气和光照", () => {
  const previous = normalizeShotSpec({ ...rawSpec(), scene: { sceneId: "home", location: "living room", timeOfDay: "evening", weather: "rain", anchors: ["sofa"], lighting: "warm floor lamp" } }, base);
  const current = normalizeShotSpec({ ...rawSpec(), scene: { sceneId: "street", anchors: [] } }, { ...base, sceneEn: "" });
  const plan = { schemaVersion: "1.0", scenes: [{ id: "street", location: "road to courier station", timeOfDay: "morning", weather: "overcast", anchors: ["sidewalk", "crosswalk"], lighting: "diffuse morning light" }], timeline: [], warnings: [] } as ChapterVisualPlan;
  const result = inheritShotContinuity(current, previous, plan);
  assert.equal(result.scene.location, plan.scenes[0].location);
  assert.deepEqual(result.scene.anchors, plan.scenes[0].anchors);
  assert.equal(result.scene.lighting, plan.scenes[0].lighting);
  const noPlan = inheritShotContinuity(current, previous, null);
  assert.deepEqual(noPlan.scene.anchors, []);
  assert.notEqual(noPlan.scene.location, previous.scene.location);
  assert.deepEqual(current.scene.anchors, []);
});

test("人数模板不改变男性或混合人物身份", () => {
  const man={...actor,id:"man",appearanceEn:"adult man with short black hair"};
  for(const characters of [[man],[man,actor]]) {
    const shot={...base,characterIds:characters.map(c=>c.id)};
    const plain=buildGenerationPrompt(shot,[],characters);
    assert.doesNotMatch(plain.negativePrompt,/asymmetrical eyes/);
    const regional=buildRegionalPrompt(shot,[],characters);
    assert.match(plain.prompt,/adult man/);
    assert.doesNotMatch(regional.basePrompt,/\bgirls?\b|\bwom[ae]n\b/);
    assert.match(regional.characterRegions[0].prompt,/adult man/);
    assert.doesNotMatch(regional.characterRegions[0].prompt,/\bwom[ae]n\b|\b1girl\b/);
    assert.equal(regional.characterRegions.length,characters.length);
    if(characters.length===1) assert.doesNotMatch(plain.prompt,/\bwom[ae]n\b|\b1girl\b/);
    else assert.match(regional.characterRegions[1].prompt,/adult woman/);
  }
});

test("确认场景排除旧环境并在近中全景保留当前锚点", () => {
  for(const camera of ["close-up","medium shot","wide shot"]) {
    const shot={...base,scene:"rainy office",description:"leaving the office in rain",sceneEn:"old office corridor",camera,cameraEn:camera,environment:{locationType:"old workplace",foreground:"old reception counter",background:"illuminated office windows",ambientLight:"bright overhead lights",atmosphere:"rainy office atmosphere"}} as Shot;
    const spec=normalizeShotSpec({...rawSpec(),scene:{sceneId:"bedroom",location:"bedroom",timeOfDay:"night",weather:"dry",lighting:"moonlight only; all lamps off",anchors:["unlit bedside lamp","bed"]},camera:{shotSize:camera}},shot);
    const confirmed={...shot,visualSpec:spec,visualSpecConfirmed:true};
    for(const prompt of [buildGenerationPrompt(confirmed,[],[actor]).prompt,buildRegionalPrompt(confirmed,[],[actor]).prompt]) {
      assert.doesNotMatch(prompt,/old workplace|old reception|office corridor|illuminated office windows|bright overhead|rainy office|active rain visibly falling|puddle ripples/);
      assert.match(prompt,/bedroom/);assert.match(prompt,/unlit bedside lamp/);assert.match(prompt,/all lamps off/);
    }
    assert.match(buildGenerationPrompt({...confirmed,visualSpecConfirmed:false},[],[actor]).prompt,/illuminated office windows/);
  }
});

test("中英文剧情时间保留时段且不覆盖明确视觉时间", () => {
  for(const [values,expected] of [
    [["night","nighttime","深夜","晚上","凌晨","雨夜","入夜","半夜","夜"],"night"],
    [["midnight","午夜"],"midnight"],[["dawn","日出"],"dawn"],
    [["dusk","黄昏"],"dusk"],[["evening","傍晚"],"evening"],
    [["morning","上午","晨"],"morning"],[["noon","中午"],"noon"],
    [["afternoon","下午"],"afternoon"],[["daytime","白天",""],"daytime"],
  ] as Array<[string[],string]>) for(const timeOfDay of values) {
    const shot={...base,timeOfDay};const spec=normalizeShotSpec(rawSpec(),shot);
    assert.equal(spec.scene.timeOfDay,expected,timeOfDay);
    assert.equal(spec.scene.fallbackValues?.timeOfDay,expected);
    assert.equal(normalizeShotSpec({...rawSpec(),scene:{...rawSpec().scene,timeOfDay:"late evening"}},shot).scene.timeOfDay,"late evening");
    const prompt=buildRegionalPrompt({...shot,visualSpec:spec,visualSpecConfirmed:true},[],[actor]).prompt;
    assert.ok(prompt.includes(expected));
    assert.doesNotMatch(prompt,/first practical lights turning on|illuminated windows and practical lights/);
  }
});

test("人物离场后返回使用最近本人历史，排除未来与未确认状态", () => {
  const first=normalizeShotSpec(rawSpec(),base);
  first.characters[0].appearanceState.bag="blue backpack";
  const changed=structuredClone(first);changed.characters[0].appearanceState.bag="red backpack";
  const absent=normalizeShotSpec({...rawSpec(),characters:[]},{...base,characterIds:["other"]});
  const shots=[
    {...base,id:10,visualSpec:first,visualSpecConfirmed:true},
    {...base,id:11,visualSpec:changed,visualSpecConfirmed:false},
    {...base,id:12,characterIds:["other"],visualSpec:absent,visualSpecConfirmed:true},
    {...base,id:13},
    {...base,id:14,visualSpec:changed,visualSpecConfirmed:true},
  ];
  const confirmed=characterContinuityMemory(shots,3);
  assert.equal(confirmed[0].shotId,10);
  assert.equal(confirmed[0].confirmed,true);
  const pending=characterContinuityMemory(shots,3,true);
  assert.equal(pending[0].shotId,11);
  assert.equal(pending[0].confirmed,false);
  const current=normalizeShotSpec(rawSpec(),base);
  const result=inheritShotContinuity(current,absent,null,confirmed.map(x=>x.character));
  assert.equal(result.characters[0].appearanceState.bag,"blue backpack");
  const explicit=structuredClone(current);explicit.characters[0].appearanceState.bag="no bag after putting it down";
  assert.equal(inheritShotContinuity(explicit,absent,null,confirmed.map(x=>x.character)).characters[0].appearanceState.bag,"no bag after putting it down");
  assert.deepEqual(characterContinuityMemory(shots,0),[]);
  confirmed[0].character.appearanceState.bag="mutated";
  assert.equal(first.characters[0].appearanceState.bag,"blue backpack");
});

test("外观字符串缺省继承本人状态，明确摘除与人工确认不被覆盖", () => {
  const previous=normalizeShotSpec(rawSpec(),base);
  Object.assign(previous.characters[0].appearanceState,{hair:"high ponytail",bag:"blue shoulder bag",glasses:"round spectacles",outerwearState:"open jacket"});
  const missing=normalizeShotSpec(rawSpec(),base);
  for(const current of [missing,normalizeShotSpec(missing,base)]) {
    const inherited=inheritShotContinuity(current,previous,null);
    for(const key of ["hair","bag","glasses","outerwearState"] as const) assert.equal(inherited.characters[0].appearanceState[key],previous.characters[0].appearanceState[key]);
    const prompt=buildRegionalPrompt({...base,visualSpec:inherited,visualSpecConfirmed:true},[],[actor]).prompt;
    for(const value of ["high ponytail","blue shoulder bag","round spectacles","open jacket"]) assert.ok(prompt.includes(value));
  }
  const manual=normalizeShotSpec(missing,base,{manualAppearance:true});
  const removed=inheritShotContinuity(manual,previous,null);
  assert.equal(removed.characters[0].appearanceState.bag,"no visible bag");
  assert.equal(removed.characters[0].appearanceState.glasses,"no glasses");
  const explicit=normalizeShotSpec({...rawSpec(),characters:rawSpec().characters.map(c=>({...c,appearanceState:{hair:"loose hair",bag:"no visible bag",glasses:"no glasses",outerwearState:"jacket removed"}}))},base);
  assert.equal(inheritShotContinuity(explicit,previous,null).characters[0].appearanceState.outerwearState,"jacket removed");
});

test("明确空配饰与状态不复活，遗漏才按本人继承", () => {
  const previous=normalizeShotSpec(rawSpec(),base);
  previous.characters[0].appearanceState.accessories=["scarf"];
  previous.characters[0].appearanceState.condition=["mud stains"];
  const missing=normalizeShotSpec(rawSpec(),base);
  const explicit=normalizeShotSpec({...rawSpec(),characters:rawSpec().characters.map(c=>({...c,appearanceState:{accessories:[],condition:[]}}))},base);
  for(const current of [explicit,normalizeShotSpec(explicit,base),normalizeShotSpec(missing,base,{manualAppearance:true})]) {
    const inherited=inheritShotContinuity(current,previous,null);
    assert.deepEqual(inherited.characters[0].appearanceState.accessories,[]);
    assert.deepEqual(inherited.characters[0].appearanceState.condition,[]);
  }
  const inherited=inheritShotContinuity(normalizeShotSpec(missing,base),previous,null);
  assert.deepEqual(inherited.characters[0].appearanceState.accessories,["scarf"]);
  assert.deepEqual(inherited.characters[0].appearanceState.condition,["mud stains"]);
  const stranger={...previous,characters:previous.characters.map(c=>({...c,characterId:"someone-else"}))};
  assert.deepEqual(inheritShotContinuity(missing,stranger,null).characters[0].appearanceState.accessories,[]);
});

test("明确白天晴天不被默认值规则覆盖，真正缺省及再规范化保留来源", () => {
  const previous=normalizeShotSpec({...rawSpec(),scene:{sceneId:"street",location:"residential street",timeOfDay:"evening",weather:"rain",lighting:"street lamps",anchors:["wet sidewalk"]}},base);
  const current=normalizeShotSpec({...rawSpec(),scene:{sceneId:"street",timeOfDay:"daytime",weather:"calm dry weather"}},{...base,timeOfDay:"晚上"});
  for(const spec of [current,normalizeShotSpec(current,base)]) {
    const inherited=inheritShotContinuity(spec,previous,null);
    assert.equal(inherited.scene.timeOfDay,"daytime");
    assert.equal(inherited.scene.weather,"calm dry weather");
    assert.deepEqual(inherited.scene.anchors,[]);
  }
  const missing=normalizeShotSpec(rawSpec(),base);
  const manual=normalizeShotSpec(missing,base,{manualEnvironment:true});
  assert.deepEqual(manual.scene.fallbackValues,{});
  assert.equal(inheritShotContinuity(manual,previous,null).scene.timeOfDay,"daytime");
  const daylightPlan:ChapterVisualPlan={schemaVersion:"1.0",scenes:[{id:"street",location:"residential street",timeOfDay:"daytime",weather:"calm dry weather",lighting:"sunlight",anchors:["sunlit pavement"]}],timeline:[],warnings:[]};
  assert.deepEqual(inheritShotContinuity({...previous,scene:{...previous.scene,anchors:[]}},null,daylightPlan).scene.anchors,[]);
  for(const spec of [missing,normalizeShotSpec(missing,base)]) {
    const inherited=inheritShotContinuity(spec,previous,null);
    assert.equal(inherited.scene.timeOfDay,"evening");
    assert.equal(inherited.scene.weather,"rain");
    assert.equal(inherited.scene.fallbackValues?.timeOfDay,undefined);
  }
});

test("同地点变化光照天气或时间不恢复旧环境状态锚点", () => {
  const previous=normalizeShotSpec({...rawSpec(),scene:{sceneId:"room",location:"study",timeOfDay:"evening",weather:"rain",lighting:"warm desk lamp",anchors:["glowing desk lamp"]}},base);
  for(const change of [{lighting:"moonlight only; desk lamp off"},{timeOfDay:"morning"},{weather:"clear sky"}]) {
    const current={...previous,scene:{...previous.scene,...change,anchors:[]}};
    const plan:ChapterVisualPlan={schemaVersion:"1.0",scenes:[{id:"room",...previous.scene}],timeline:[],warnings:[]};
    const inherited=inheritShotContinuity(current,previous,plan);
    assert.deepEqual(inherited.scene.anchors,[]);
    assert.equal(inherited.scene.location,"study");
    assert.deepEqual(inherited.characters,current.characters);
    for(const [key,value] of Object.entries(change)) assert.equal(inherited.scene[key as keyof typeof change],value);
    const compiled=buildRegionalPrompt({...base,visualSpec:inherited,visualSpecConfirmed:true},[],[actor]);
    assert.doesNotMatch(compiled.prompt,/glowing desk lamp/);
  }
  const dark={...previous,scene:{...previous.scene,lighting:"moonlight only; desk lamp off",anchors:[]}};
  const matching:ChapterVisualPlan={schemaVersion:"1.0",scenes:[{...dark.scene,id:"room",anchors:["unlit desk lamp"]}],timeline:[],warnings:[]};
  assert.deepEqual(inheritShotContinuity(dark,previous,matching).scene.anchors,["unlit desk lamp"]);
  assert.deepEqual(inheritShotContinuity({...previous,scene:{...previous.scene,anchors:[]}},previous,null).scene.anchors,["glowing desk lamp"]);
});

test("旧 current_scene 占位 ID 不证明同一地点；明确同场景仍继承环境", () => {
  const previous = normalizeShotSpec({ ...rawSpec(), scene: { location: "living room", anchors: ["sofa"] } }, base);
  const street = normalizeShotSpec(rawSpec(), base);
  street.scene.sceneId = "current_scene";
  assert.deepEqual(inheritShotContinuity(street, previous, null).scene.anchors, []);
  const same = { ...street, scene: { ...street.scene, location: "living room" } };
  assert.deepEqual(inheritShotContinuity(same, previous, null).scene.anchors, ["sofa"]);
  previous.scene.sceneId = "home";
  same.scene.sceneId = "home";
  same.scene.location = "unknown";
  assert.equal(inheritShotContinuity(same, previous, null).scene.location, "living room");
});

test("已确认服装与鞋履规格贯通 prompt 和 Regional 资产绑定，未确认规格不生效", () => {
  const assets = [
    { id: "old", type: "outfit", visualDescriptionEn: "yellow shirt" },
    { id: "new", type: "outfit", visualDescriptionEn: "blue pajamas" },
    { id: "old-shoes", type: "shoes", visualDescriptionEn: "white sneakers" },
    { id: "new-shoes", type: "shoes", visualDescriptionEn: "blue slippers" },
  ].map(asset => ({ ...asset, characterId: actor.id, name: asset.id, confirmed: true, path: `workspace/${asset.id}.png` })) as Asset[];
  const spec = normalizeShotSpec(rawSpec(), base);
  spec.characters[0].outfitId = "new";
  spec.characters[0].shoeId = "new-shoes";
  const shot = { ...base, outfitId: "old", shoeId: "old-shoes", visualSpec: spec, visualSpecConfirmed: true };
  const compiled = buildGenerationPrompt(shot, assets, [actor]);
  assert.equal(compiled.characterLooks.actor.outfitId, "new");
  assert.equal(compiled.characterLooks.actor.shoeId, "new-shoes");
  const bindings = buildRegionalPrompt(shot, assets, [actor]).characterRegions[0].assetBindings;
  assert.equal(bindings.find(b => b.role === "outfit")?.assetId, "new");
  assert.equal(bindings.find(b => b.role === "shoes")?.assetId, "new-shoes");
  assert.equal(buildGenerationPrompt({ ...shot, visualSpecConfirmed: false }, assets, [actor]).characterLooks.actor.outfitId, "old");
  const manual = { ...shot, characterLooks: { actor: look({ outfitId: "old", shoeId: "old-shoes" }) } };
  const normalized = normalizeShotSpec(spec, manual);
  assert.equal(normalized.characters[0].outfitId, "old");
  assert.equal(normalized.characters[0].shoeId, "old-shoes");
  assert.equal(buildGenerationPrompt({ ...manual, visualSpec: normalized }, assets, [actor]).characterLooks.actor.outfitId, "old");
});

test("多人不同区域与景别使用本人的规格动作和衣物，不借用首人的旧资产", () => {
  const other = { ...actor, id: "other", name: "Other" };
  const assets = [actor, other].flatMap(character => ["outfit", "shoes"].map(type => ({
    id: `${character.id}-${type}`, characterId: character.id, type, name: type, confirmed: true,
    path: `workspace/${character.id}-${type}.png`, visualDescriptionEn: type === "outfit" ? "blue shirt" : "brown shoes", tags: [], defaultShoeId: "", qualityStatus: "unknown" as const,
  }))) as Asset[];
  for (const camera of ["close shot", "medium shot", "wide shot"]) {
    for (const ids of [[actor.id, other.id], [other.id, actor.id]]) {
      const shot = { ...base, camera, cameraEn: camera, characterIds: ids, actionEn: instructions[3], outfitId: "actor-outfit", shoeId: "actor-shoes",
        characterLooks: Object.fromEntries(ids.map(id => [id, look({ actionEn: instructions[3] })])) };
      const spec = normalizeShotSpec({ ...rawSpec(), camera: { shotSize: camera }, characters: ids.map((id, i) => ({
        characterId: id, action: "walking along the sidewalk", actionTarget: "path ahead", gazeTarget: "path ahead", hands: "arms swinging naturally",
        region: { xStart: i / 2, xEnd: (i + 1) / 2 }, outfitId: `${id}-outfit`, shoeId: `${id}-shoes`,
      })) }, shot);
      const confirmed = { ...shot, visualSpec: spec, visualSpecConfirmed: true };
      assert.deepEqual(validateShotActionSpecificity(confirmed), []);
      const regional = buildRegionalPrompt(confirmed, assets, [actor, other]);
      for (const region of regional.characterRegions) {
        assert.equal(region.assetBindings.find(b => b.role === "outfit")?.assetId, `${region.characterId}-outfit`);
        assert.equal(region.assetBindings.find(b => b.role === "shoes")?.assetId, `${region.characterId}-shoes`);
        assert.equal(derivePoseActionPlan(confirmed, region.characterId).family, "locomotion");
      }
      const missing = normalizeShotSpec({ ...rawSpec(), characters: [] }, shot);
      assert.equal(missing.characters[1].outfitId, "");
      assert.equal(missing.characters[1].shoeId, "");
    }
  }
  const invalidSpec = normalizeShotSpec(rawSpec(), base);
  for (const invalid of ["other-outfit", "actor-shoes", "missing"]) {
    invalidSpec.characters[0].outfitId = invalid;
    assert.equal(buildGenerationPrompt({ ...base, visualSpec: invalidSpec, visualSpecConfirmed: true }, assets, [actor]).characterLooks.actor.outfitId, "");
  }
});
