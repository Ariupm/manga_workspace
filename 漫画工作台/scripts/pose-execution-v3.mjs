import {mechanismPromptTerms} from "./action-mechanism.mjs";
import {phaseInteractionTerms,synchronizedActionTerms,relationActionState} from "./action-stage-policy.mjs";
import {upperTorsoFramingFailures} from "./pose-framing-guard.mjs";
import {overlayGeometryFailures} from "./pose-overlay-guard.mjs";
// Keep the editable full-pose plan intact. All pixel consumers use this separate
// canvas-space snapshot, compiled from the same projection as the OpenPose SVG.
import { propBodySizePlan } from "./sd-worker-logic.mjs";
export function compilePoseExecutionV3(control, repairPasses = {}, options = {}) {
  if (control?.posePlanVersion !== "3.0") return null;
  const source = control.scenePlan;
  const warnings = [];
  const conflict = message => { if (options.advisory) warnings.push(message); else throw new Error(message); };
  const overlayErrors=overlayGeometryFailures(control.fullPeople||source?.fullPeople,source?.people);
  if(overlayErrors.length)conflict(`V3 overlay conflict: ${overlayErrors.join("; ")}`);
  const projection = source?.projection;
  if (!projection || !Number.isFinite(projection.scale) || projection.scale <= 0
    || !Number.isFinite(projection.translate?.x) || !Number.isFinite(projection.translate?.y)) {
    throw new Error("V3 execution requires a finite positive projection");
  }
  const scale = projection.scale;
  const point = (p) => {
    if (p == null) return p;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error("V3 execution contains a non-finite point");
    return { ...p, x: (p.x - .5) * scale + .5 + projection.translate.x, y: (p.y - .5) * scale + .5 + projection.translate.y };
  };
  const region = (r) => r && ({ ...r,
    xStart: point({ x: r.xStart, y: .5 }).x,
    xEnd: point({ x: r.xEnd, y: .5 }).x,
    ...(Number.isFinite(r.yStart) ? { yStart: point({ x: .5, y: r.yStart }).y } : {}),
    ...(Number.isFinite(r.yEnd) ? { yEnd: point({ x: .5, y: r.yEnd }).y } : {}),
  });
  const gaze = (g) => g && ({ ...g, point: point(g.point) });
  const support = (s) => s && ({ ...s, region: region(s.region), pelvisAnchor: point(s.pelvisAnchor), torsoAnchor: point(s.torsoAnchor),
    backEdge: s.backEdge && { x: point({x:s.backEdge.x,y:.5}).x, yStart:point({x:.5,y:s.backEdge.yStart}).y, yEnd:point({x:.5,y:s.backEdge.yEnd}).y },
    contactPlaneY: point({ x: .5, y: s.contactPlaneY }).y,
    visibleEdge: { ...s.visibleEdge, xStart: point({ x: s.visibleEdge.xStart, y: s.visibleEdge.y }).x,
      xEnd: point({ x: s.visibleEdge.xEnd, y: s.visibleEdge.y }).x, y: point({ x: .5, y: s.visibleEdge.y }).y },
  });
  const fullPeople = control.fullPeople || source.fullPeople;
  if (!Array.isArray(fullPeople) || fullPeople.length !== source.people.length) throw new Error("V3 execution character topology mismatch");
  const projected = fullPeople.map(person => person.map(point));
  const framingErrors=upperTorsoFramingFailures(projected,projection.composition);
  if(framingErrors.length)conflict(`V3 framing conflict: ${framingErrors.join("; ")}`);
  const wrist = (characterId, hand) => {
    const index = source.people.findIndex(person => person.characterId === characterId);
    const joint = hand === "left" ? 7 : 4;
    const p = projected[index]?.[joint];
    if (!p) throw new Error(`V3 execution missing ${characterId} ${hand} wrist`);
    return p;
  };
  const anchors = (items, characterId, audit) => items?.map(a => ({ ...a, ...(audit ? point(a) : wrist(characterId,a.hand)) }));
  const actionGeometry = g=>g&&{...g,...Object.fromEntries(['baseCenter','pivot','gripPoint','objectCenter','workPoint','toolEnd','mouthContact'].map(key=>[key,point(g[key])])),extent:g.extent&&{width:g.extent.width*scale,height:g.extent.height*scale},travel:g.travel==null?undefined:g.travel*scale,outline:g.outline?.map(p=>({...p,points:p.points.map(point)})),supportY:g.supportY==null?undefined:point({x:.5,y:g.supportY}).y,axis:g.axis&&{x:g.axis.x*scale,y:g.axis.y*scale}};
  const actionAudit = a=>a&&({...a,handTargets:a.handTargets.map(point),geometry:actionGeometry(a.geometry)});
  const surface = (s) => s && ({ ...s, exclusionRegions: s.exclusionRegions?.map(region) });
  const contract = r => {
    if(!r)return r;
    const candidate=source.relations?.find(x=>x.relationId===r.relationId);
    const audit=candidate?.actionRelationAudit||r.actionRelationAudit||(source.people?.find(p=>p.characterId===r.characterId)?.relationTargets?.length===1?source.people?.find(p=>p.characterId===r.characterId)?.actionRelationAudit:undefined);
    const authored=audit?candidate:undefined;
    const center=authored?.objectCenter||r.objectCenter,contacts=authored?.contactAnchors||r.contactAnchors;
    const result={...r,objectCenter:point(center),region:region(r.region),gazeTarget:gaze(authored?.gazeTarget||r.gazeTarget),contactAnchors:anchors(contacts,r.characterId,audit),surfacePlan:surface(r.surfacePlan),actionRelationAudit:actionAudit(audit),actionPlan:r.actionPlan&&{...r.actionPlan,actionId:audit?.geometry?.actionId||r.actionPlan.actionId,phase:audit?.phase||r.actionPlan.phase,geometry:actionGeometry(audit?.geometry||r.actionPlan.geometry)}};
    if(['pick','place'].includes(result.actionPlan?.actionId))result.purpose=result.actionPlan.actionId;
    const state=relationActionState(result);
    if(result.visualFacts&&state&&(state.phase!==result.visualFacts.phase||state.actionId!==result.visualFacts.actionId)){
      result.visualFacts={...result.visualFacts,actionId:state.actionId,phase:state.phase,contact:{...result.visualFacts.contact,state:state.contactState},support:{...result.visualFacts.support,state:['held','on_support'].includes(state.objectState)?state.objectState:result.visualFacts.support.state},provenance:{...result.visualFacts.provenance,phase:{source:'manual',evidence:'effective Pose action/phase override'},contact:{source:'manual',evidence:'derived from effective Pose action/phase'},support:{source:'manual',evidence:'derived from effective Pose action/phase'}}};
    }
    result.positive=[...new Set([...synchronizedActionTerms(result),...mechanismPromptTerms(result.actionRelationAudit?.geometry)])];return result;
  };
  const scenePlan = { ...structuredClone(source), coordinateSpace: "projected_canvas",
    interactionTarget: point(source.interactionTarget),
    relations: source.relations?.map(contract),
    supportRelations: source.supportRelations?.map(support),
    people: source.people.map(person => ({ ...structuredClone(person), anchor: point(person.anchor), scale: person.scale * scale,
      actionRelationAudit:actionAudit(person.actionRelationAudit),actionGeometryInput:actionGeometry(person.actionGeometryInput),
      loadSupport:person.loadSupport&&{...person.loadSupport,pelvis:point(person.loadSupport.pelvis),torso:point(person.loadSupport.torso),footContacts:person.loadSupport.footContacts.map(c=>({...c,point:point(c.point)}))},
      forceSupport:person.forceSupport&&{...person.forceSupport,lean:{x:person.forceSupport.lean.x*scale,y:person.forceSupport.lean.y*scale},footContacts:person.forceSupport.footContacts.map(c=>({...c,point:point(c.point)}))},
      actionContacts: person.actionContacts?.map(c=>({...c,target:point(c.target)})),
      target: point(person.target), gazeTarget: gaze(person.gazeTarget), supportRelation: support(person.supportRelation),
      overlayAudit: person.overlayAudit && {...person.overlayAudit, arms:person.overlayAudit.arms.map(a=>({...a,target:point(a.target),upperLength:a.upperLength*scale,foreLength:a.foreLength*scale,upperBoneLength:a.upperBoneLength==null?undefined:a.upperBoneLength*scale,foreBoneLength:a.foreBoneLength==null?undefined:a.foreBoneLength*scale,depthOffsets:a.depthOffsets&&{elbow:a.depthOffsets.elbow*scale,wrist:a.depthOffsets.wrist*scale}}))},
      basicGeometry:person.basicGeometry && {...person.basicGeometry,contacts:person.basicGeometry.contacts.map(c=>({...c,point:point(c.point),surfaceOffset:c.surfaceOffset*scale}))},
      headDirection: person.headDirection && { ...person.headDirection, target: point(person.headDirection.target), dx: person.headDirection.dx * scale, dy: person.headDirection.dy * scale },
      relationTargets: person.relationTargets.map(r => ({ ...r, target: point(r.target), gazeTarget: gaze(r.gazeTarget),
        contactAnchors: anchors(r.contactAnchors, person.characterId,r.actionRelationAudit),actionRelationAudit:actionAudit(r.actionRelationAudit),actionPlan:r.actionPlan&&{...r.actionPlan,geometry:actionGeometry(r.actionRelationAudit?.geometry||r.actionPlan.geometry)},
        wristAssignments: r.wristAssignments?.map(a => ({ ...a, ...wrist(person.characterId, a.hand) })),
      })),
    })),
  };
  const passes = { ...structuredClone(repairPasses), propInteraction: contract(repairPasses.propInteraction),
    propInteractions: repairPasses.propInteractions?.map(contract),
    propInstancePlan: repairPasses.propInstancePlan?.map(p => ({ ...p, surfacePlan: surface(p.surfacePlan), exclusionRegions: p.exclusionRegions?.map(region) })),
  };
  for(const relation of passes.propInteractions||[]){
    const binding=relation.visualFacts?.workTarget,g=relation.actionPlan?.geometry;
    if(!binding||!['tool','write'].includes(relation.actionPlan?.actionId))continue;
    const target=passes.propInteractions.find(r=>r.objectInstanceId===binding.instanceId&&r.characterId===relation.characterId),tg=target?.actionPlan?.geometry;
    if(!tg?.extent||!g?.workPoint){conflict('Bound work target geometry missing: '+relation.relationId);continue;}
    const expected={x:target.objectCenter.x+(binding.u-.5)*tg.extent.width,y:target.objectCenter.y+(binding.v-.5)*tg.extent.height};
    if(Math.hypot(expected.x-g.workPoint.x,expected.y-g.workPoint.y)>1e-6)conflict('Tool work point detached from target surface: '+relation.relationId);
  }
  for (const relation of passes.propInteractions || (passes.propInteraction ? [passes.propInteraction] : [])) {
    if (!relation.required) continue;
    for (const p of [relation.objectCenter, ...(relation.contactAnchors || [])]) {
      if (!p || p.x < .02 || p.x > .98 || p.y < .02 || p.y > .98) {
        conflict(`V3 required prop/contact outside canvas: ${relation.relationId || relation.characterId}`);
      }
    }
    const outlinePoints=(relation.actionRelationAudit?.geometry||relation.actionPlan?.geometry)?.outline?.flatMap(p=>p.points)||[];
    if(outlinePoints.some(p=>p.x<.02||p.x>.98||p.y<.02||p.y>.98))conflict(`V3 required action outline outside canvas: ${relation.relationId || relation.characterId}`);
    if (relation.shape && relation.shape !== "umbrella" && !outlinePoints.length) {
      const contacts = relation.contactAnchors || [];
      const { envelope } = propBodySizePlan({ shape: relation.shape, orientation: relation.orientation,
        contactSpan: contacts.length ? Math.max(...contacts.map(p=>p.x))-Math.min(...contacts.map(p=>p.x)) : 0,
        hasPoseContact: contacts.length > 0, regionWidth: relation.region.xEnd-relation.region.xStart });
      const center = relation.objectCenter;
      if (center.x-envelope.width/2 < .02-1e-8 || center.x+envelope.width/2 > .98+1e-8 || center.y-envelope.height/2 < .02-1e-8 || center.y+envelope.height/2 > .98+1e-8) {
        conflict(`V3 required prop envelope outside canvas: ${relation.relationId || relation.characterId}`);
      }
    }
  }
  const upperComposition = ["head_shoulders", "chest_action", "waist_up"].includes(projection.composition);
  const lowerOutside = projected.every(person => [9, 10, 12, 13].every(i => person[i].x < .02 || person[i].x > .98 || person[i].y < .02 || person[i].y > .98));
  return { coordinateSpace: "projected_canvas", framingMode: upperComposition && lowerOutside ? "upper_body" : "full_body", projectionHash: control.audit?.projectionHash || source.projectionHash,
    warnings, sourceRepairPasses: structuredClone(repairPasses), scenePlan, repairPasses: passes };
}

// Both the API and worker use this entry point. Replaying a final-stage recipe
// recompiles from the saved source, never from already projected coordinates.
export function preparePoseExecutionV3(recipe) {
  if (recipe.poseControl?.posePlanVersion !== "3.0") return recipe;
  const source = recipe.poseExecution?.sourceRepairPasses || recipe.generationSpec?.repairPasses || {};
  const execution = compilePoseExecutionV3(recipe.poseControl, source, { advisory: recipe.posePreflightPolicy === "advisory" });
  const bindings = recipe.poseExecution?.sourceBindings || structuredClone({
    characterRegions: recipe.generationSpec?.characterRegions,
    references: recipe.references, finalReferences: recipe.finalReferences,
    regionalPrompter: recipe.regionalPrompter,
    requiredPropInteractions: recipe.automaticVisualGate?.requiredPropInteractions,
  });
  execution.sourceBindings = bindings;
  const projection = recipe.poseControl.scenePlan.projection;
  const projectX = x => (x - .5) * projection.scale + .5 + projection.translate.x;
  const clippedX = x => Math.max(0, Math.min(1, projectX(x)));
  const sourceRegions = bindings.characterRegions || [];
  // Regional Prompter partitions span the canvas. Transform internal boundaries
  // and let the first/last partitions retain the outer background margins.
  const regions = sourceRegions.map((entry, index) => ({ ...structuredClone(recipe.generationSpec?.characterRegions?.find(current => current.characterId === entry.characterId) || entry), region: {
    ...entry.region, xStart: index === 0 ? 0 : clippedX(entry.region.xStart),
    xEnd: index === sourceRegions.length - 1 ? 1 : clippedX(entry.region.xEnd),
  } }));
  if (regions.some(entry => entry.region.xEnd <= entry.region.xStart)) throw new Error("V3 projection collapses a character conditioning region");
  if (recipe.generationSpec && bindings.characterRegions) recipe.generationSpec.characterRegions = regions;
  for (const key of ["references", "finalReferences"]) {
    if (!bindings[key]) continue;
    recipe[key] = (recipe[key] || bindings[key]).map(reference => {
      const match = regions.find(entry => entry.characterId === reference.characterId);
      const original = bindings[key].find(item => item.characterId === reference.characterId && item.role === reference.role && item.path === reference.path) || reference;
      return { ...reference, region: original.region
        ? match?.region || { ...original.region, xStart: clippedX(original.region.xStart), xEnd: clippedX(original.region.xEnd) }
        : original.region };
    });
  }
  if (bindings.regionalPrompter) {
    recipe.regionalPrompter = { ...(recipe.regionalPrompter || bindings.regionalPrompter) };
    if (recipe.regionalPrompter.enabled && regions.length > 1) {
      if (recipe.regionalPrompter.orientation === "Vertical") throw new Error("V3 execution requires horizontal character partitions");
      recipe.regionalPrompter.ratios = regions.map(entry => entry.region.xEnd - entry.region.xStart).join(",");
    }
  }
  if (recipe.automaticVisualGate && bindings.requiredPropInteractions) {
    // Reuse the same projected contract as the prop pass whenever it exists.
    recipe.automaticVisualGate.requiredPropInteractions = bindings.requiredPropInteractions.map(item =>
      execution.repairPasses.propInteractions?.find(r => r.relationId === item.relationId && r.characterId === item.characterId) || item);
  }
  recipe.poseExecution = execution;
  if (recipe.generationSpec) recipe.generationSpec.repairPasses = execution.repairPasses;
  return recipe;
}
