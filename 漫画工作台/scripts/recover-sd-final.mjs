import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { evaluateCaptionForRequiredProps } from './sd-worker-logic.mjs';

// Recover a completed, retained final pass without calling SD or inventing approvals.
const jobId = Number(process.argv[2]);
if (!Number.isSafeInteger(jobId) || jobId < 1) throw new Error('Provide a job ID');
const db = new DatabaseSync('data/studio.db');
const row = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
if (!row || row.provider !== 'sd-webui' || row.status !== 'failed') throw new Error('Expected failed SD task');
const payload = JSON.parse(row.payload), recipe = payload.recipe;
if (payload.phase !== 'final' || !recipe?.approvedDraftPath || !recipe?.semanticApproval) throw new Error('Missing confirmed final lineage');
const originalGate = recipe.automaticVisualGateResult;
if (originalGate?.status !== 'blocked' || !originalGate.caption) throw new Error('Not a recoverable caption gate failure');
if (recipe.pixelQa?.status !== 'passed' || recipe.semanticQa?.status === 'blocked' || recipe.postprocessWarnings?.length) throw new Error('Other hard gate failed');
const stages = recipe.stageOutputs || [];
const outputStages = new Set(['initial','framing_post_crop','identity_refinement','outfit_refinement_skipped','generic_prop','gaze','structured_gaze','umbrella_handoff','final_framing_post_crop']);
const images = stages.filter(item => outputStages.has(item.stage) || /^(outfit_|contact_completion_|hand_refinement_)/.test(item.stage));
const last = images.at(-1);
if (!last?.output?.path || !last.output.sha256) throw new Error('No final artifact');
if (recipe.framingPostCrop?.status === 'applied' && last.stage !== 'final_framing_post_crop') throw new Error('Missing final framing artifact');
const source = path.resolve(last.output.path);
const generated = path.resolve('workspace/generated') + path.sep;
if (!source.startsWith(generated)) throw new Error('Artifact outside generated directory');
const buffer = fs.readFileSync(source);
const hash = createHash('sha256').update(buffer).digest('hex');
if (hash !== last.output.sha256) throw new Error('Artifact hash mismatch');
const meta = await sharp(buffer).metadata();
if (!meta.width || !meta.height || meta.width < 256 || meta.height < 256 || buffer.length < 20000) throw new Error('Invalid final pixels');
if (meta.width !== recipe.pixelQa.width || meta.height !== recipe.pixelQa.height) throw new Error('Artifact dimensions differ from checked final result');
const evaluated = evaluateCaptionForRequiredProps(originalGate.caption, recipe.automaticVisualGate.requiredPropInteractions);
const gate = { ...originalGate, ...evaluated, status: evaluated.missing.length ? 'blocked' : 'passed' };
const destination = `workspace/generated/sd-final-job-${jobId}-recovered-${hash.slice(0,12)}.png`;
if (fs.existsSync(destination)) {
  if (createHash('sha256').update(fs.readFileSync(destination)).digest('hex') !== hash) throw new Error('Destination differs');
} else fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
payload.finalReviewImagePath = destination;
recipe.finalRecovery = { sourceStage: last.stage, sourcePath: last.output.path, imageSha256: hash, recoveredAt: new Date().toISOString(), originalGate, originalError: row.error, method: 'retained_final_artifact_and_caption_alias_reevaluation' };
recipe.automaticVisualGateResult = gate;
db.exec('BEGIN IMMEDIATE');
try {
  const current = db.prepare('SELECT status,payload FROM jobs WHERE id=?').get(jobId);
  if (current.status !== row.status || current.payload !== row.payload) throw new Error('Task changed during recovery');
  if (gate.status === 'passed') {
    recipe.finalApproval = { version: 'semantic-review-v1', source: 'automatic_after_draft_confirmation', stage: 'final', approvedAt: new Date().toISOString(), imageSha256: hash, reviewMode: 'automatic_after_draft_confirmation', draftApproval: recipe.semanticApproval };
    recipe.finalReview = { status: 'automatically_added_to_candidates', stage: 'final', imageSha256: hash, generatedAt: row.updated_at, reviewMode: 'automatic_after_draft_confirmation', reviewItemIds: (recipe.semanticQa.items || []).map(item => item.id), automaticVisualGate: gate };
    if (!db.prepare('SELECT id FROM candidates WHERE source_job_id=?').get(jobId)) {
      const version = db.prepare('SELECT COALESCE(MAX(version),0)+1 AS value FROM candidates WHERE shot_id=?').get(row.shot_id).value;
      const selected = db.prepare('SELECT COUNT(*) AS value FROM candidates WHERE shot_id=?').get(row.shot_id).value === 0 ? 1 : 0;
      const report = { stage: 'final', imageSha256: hash, pixelQa: recipe.pixelQa, automaticVisualGate: gate, approval: recipe.finalApproval, semanticContractSnapshot: recipe.semanticQa.items || [], recovery: recipe.finalRecovery };
      db.prepare("INSERT INTO candidates(shot_id,image_path,label,version,selected,quality_status,quality_labels_json,quality_report_json,reviewed_by,reviewed_at,source_job_id,image_sha256) VALUES(?,?,?,?,?,'passed',?,?,?,CURRENT_TIMESTAMP,?,?)").run(row.shot_id,destination,'SD WebUI 成品（草稿确认后自动加入）',version,selected,JSON.stringify(recipe.semanticQa.labels || []),JSON.stringify(report),'automatic_after_draft_confirmation',jobId,hash);
    }
    db.prepare("UPDATE jobs SET status='completed',payload=?,progress=100,error='',stage='成品已自动加入候选图',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(JSON.stringify(payload),jobId);
    db.prepare("UPDATE shots SET status='review' WHERE id=?").run(row.shot_id);
  } else {
    db.prepare('UPDATE jobs SET payload=?,error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(JSON.stringify(payload),`自动质量门未通过：${gate.missing.map(item => item.object).join('、')}`,jobId);
  }
  db.exec('COMMIT');
} catch(error) { db.exec('ROLLBACK'); throw error; }
console.log(JSON.stringify({jobId,status:gate.status === 'passed' ? 'completed' : 'failed',imagePath:destination,sourceStage:last.stage,imageSha256:hash},null,2));
