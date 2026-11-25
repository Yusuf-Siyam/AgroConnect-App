import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '../config/env';
import { assertPhotoAdviceConfigured, resolveDiseaseProvider } from '../config/photoAdvice';
import { createGeminiVisionAdvisor } from '../providers/geminiVision';
import type { PlantPhotoAdviceInput } from '../types/ai';

/** A valid 1x1 PNG, used when no larger sample image is supplied. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9kAAAAASUVORK5CYII=',
  'base64',
);

function present(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function mimeTypeFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return 'image/png';
}

async function loadCheckImage(): Promise<{ imageData: Buffer; mimeType: string; source: string }> {
  const configured = env.aiCheckImagePath.trim();
  if (!configured) {
    return { imageData: TINY_PNG, mimeType: 'image/png', source: 'built-in 1x1 png' };
  }
  return {
    imageData: await readFile(configured),
    mimeType: mimeTypeFor(configured),
    source: 'AI_CHECK_IMAGE_PATH',
  };
}

async function checkGemini(): Promise<boolean> {
  // Throws AI_NOT_CONFIGURED before any provider call if env is incomplete.
  assertPhotoAdviceConfigured();
  const image = await loadCheckImage();
  const input: PlantPhotoAdviceInput = {
    image: {
      provider: 'inline',
      mimeType: image.mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
      data: image.imageData.toString('base64'),
    },
    imageData: image.imageData,
    mimeType: image.mimeType,
    cropName: 'unspecified crop',
    language: 'en',
  };

  const started = Date.now();
  const advice = await createGeminiVisionAdvisor().suggest(input);

  // Print only operational metadata and a short preview; never the key or prompt.
  console.log(
    JSON.stringify({
      ok: true,
      provider: 'gemini',
      model: env.geminiVisionModel,
      imageSource: image.source,
      imageBytes: image.imageData.byteLength,
      elapsedMs: Date.now() - started,
      source: advice.source,
      verified: advice.verified,
      uncertainty: advice.uncertainty,
      possibleCauses: advice.possibleCauses.length,
      careSteps: advice.careSteps.length,
      observationPreview: advice.observation.slice(0, 160),
    }),
  );
  return true;
}

function checkExternal(): boolean {
  const ok = present(env.diseaseModelEndpoint) && present(env.diseaseModelApiKey);
  console.log(
    ok
      ? 'External photo advisor configuration is present. No API call was made.'
      : 'Missing DISEASE_MODEL_ENDPOINT or DISEASE_MODEL_API_KEY. No API call was made.',
  );
  return ok;
}

async function main(): Promise<void> {
  let provider = 'none';

  try {
    provider = resolveDiseaseProvider();
    if (provider === 'none') {
      console.log('AI photo suggestions are disabled (DISEASE_PROVIDER=none). No API call was made.');
      return;
    }

    const ok = provider === 'gemini' ? await checkGemini() : checkExternal();
    process.exitCode = ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        ok: false,
        provider,
        model: provider === 'gemini' ? env.geminiVisionModel : undefined,
        error: message,
      }),
    );
    process.exitCode = 1;
  }
}

void main();
