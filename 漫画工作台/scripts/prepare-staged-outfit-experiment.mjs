// Explicit diagnostic only. Requires a reviewed, image-specific garment mask.
// Does not detect garments, call SD, change production policy or write jobs.
// node scripts/prepare-staged-outfit-experiment.mjs experiment-config.json new-out
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {outfitGarmentZones} from './sd-worker-logic.mjs';
import {prepareGenerationPromptRequest} from './prompt-compiler.mjs';

const [configFile, out] = process.argv.slice(2);
if (!configFile || !out) throw Error('Config file and new output directory required');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
assert.equal(config.maskSource, 'manual_experiment_annotation');
assert.ok(/^[a-z0-9_-]+$/i.test(config.name));
assert.ok(Number.isInteger(config.seed) && config.seed >= 0);
const payload = JSON.parse(fs.readFileSync(config.recipeFile, 'utf8'));
const recipe = payload.recipe || payload;
const references = recipe.references.filter(r => r.role === 'outfit' && r.characterId === config.characterId);
assert.equal(references.length, 1, 'Exactly one owned outfit reference required');
const reference = references[0];
const garment = outfitGarmentZones(reference.outfitPrompt || reference.name).find(g => g.zone === config.zone);
assert.ok(garment, 'Requested garment zone is absent from the recipe');
const source = fs.readFileSync(config.sourceImage);
const mask = fs.readFileSync(config.maskFile);
for (const buffer of [source, mask]) {
  const m = await sharp(buffer).metadata();
  assert.equal(m.width, recipe.width); assert.equal(m.height, recipe.height);
}
const pixels = await sharp(mask).removeAlpha().greyscale().raw().toBuffer();
assert.ok(pixels.some(v => v > 0), 'Mask is empty');
assert.ok(pixels.some(v => v === 0), 'Whole-image mask is not a local garment experiment');
const request = prepareGenerationPromptRequest(structuredClone(recipe), {
  prompt: ['masterpiece, best quality, anime illustration', `(${garment.prompt}:1.1)`,
    'preserve the established body pose, face, hair, hands and composition'].join(', '),
  negative_prompt: [recipe.negativePrompt, 'wrong outfit, wrong garment color, color assigned to the wrong garment, changed garment category, missing clothing layer, extra coat, extra accessories, changed face, changed hair, changed pose'].join(', '),
  init_images: [source.toString('base64')], mask: mask.toString('base64'),
  width: recipe.width, height: recipe.height, steps: 8, cfg_scale: 6.8,
  denoising_strength: .48, seed: config.seed, sampler_name: recipe.sampler, scheduler: recipe.scheduler,
  batch_size: 1, n_iter: 1, mask_blur: 8, inpainting_fill: 1, inpaint_full_res: true,
  inpaint_full_res_padding: 40, send_images: true, do_not_save_grid: true,
  alwayson_scripts: {ControlNet: {args: []}},
}, {stage: 'outfit', characterId: config.characterId, details: `(${garment.prompt}:1.1)`});
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const audit = {
  ...config, garment, sourceSha256: hash(source), maskSha256: hash(mask),
  maskNonzeroPixels: pixels.filter(v => v > 0).length,
  originalReferenceIsolated: Boolean(reference.isolatedGarmentReference),
  productionWouldSkipUnisolatedReference: !reference.isolatedGarmentReference,
  visualReferenceApplied: false, automaticLocalization: false,
  description: 'Counterfactual text-only local clothing experiment with manual mask. Production unisolated-reference guard remains unchanged.',
  prompt: request.prompt, negative: request.negative_prompt,
};
assert.ok(!fs.existsSync(out), 'Use a new output directory');
fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(path.join(out, 'cases.json'), JSON.stringify([{name: config.name, description: audit.description, request}]));
fs.writeFileSync(path.join(out, 'preparation-audit.json'), JSON.stringify(audit, null, 2));
console.log(JSON.stringify({name: config.name, garment, pixels: audit.maskNonzeroPixels, productionWouldSkip: audit.productionWouldSkipUnisolatedReference, prompt: request.prompt}));
