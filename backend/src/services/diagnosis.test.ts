import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HttpError } from '../middleware/error';
import type { PlantPhotoAdvice, PlantPhotoAdvisor } from '../types/ai';
import { diagnoseSchema } from '../validators/ai';

import {
  createDiagnosis,
  decodeInlineImage,
  diagnosisIdForInlineImage,
  type DiagnosisWriteStore,
} from './diagnosis';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9kAAAAASUVORK5CYII=';

const inlineImage = { provider: 'inline' as const, mimeType: 'image/png' as const, data: PNG_BASE64 };

const advice: PlantPhotoAdvice = {
  source: 'gemini_vision',
  observation: 'Leaves look spotted',
  possibleCauses: ['Possible leaf spot'],
  careSteps: ['Remove affected leaves'],
  uncertainty: 'possible',
  verified: false,
  notice: 'Unverified AI photo suggestion - ask an extension officer.',
};

function fakeStore(): { store: DiagnosisWriteStore; docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>();
  return {
    docs,
    store: {
      collection() {
        return {
          doc(id: string) {
            return {
              async get() {
                return { exists: docs.has(id), data: () => docs.get(id) };
              },
              async set(data: Record<string, unknown>) {
                docs.set(id, data);
              },
            };
          },
        };
      },
    },
  };
}

function advisorDouble(calls: unknown[] = []): PlantPhotoAdvisor {
  return {
    async suggest(input) {
      calls.push(input);
      return advice;
    },
  };
}

describe('diagnosis request validation and image handling', () => {
  it('accepts the inline payload and keeps legacy Cloudinary history readable', () => {
    const inlineResult = diagnoseSchema.safeParse({
      image: inlineImage,
      language: 'bn',
      cropName: 'Tomato',
    });
    assert.equal(inlineResult.success, true);

    const cloudinaryResult = diagnoseSchema.safeParse({
      image: {
        provider: 'cloudinary',
        publicId: 'agroconnect/diagnoses/user-1/old-1/photo',
        resourceType: 'image',
        deliveryType: 'authenticated',
      },
      language: 'en',
    });
    assert.equal(cloudinaryResult.success, true);

    assert.equal(
      diagnoseSchema.safeParse({ image: { ...inlineImage, mimeType: 'application/pdf' } }).success,
      false,
    );
    assert.equal(diagnoseSchema.safeParse({ image: { ...inlineImage, data: 'not base64!' } }).success, false);
    assert.equal(diagnoseSchema.safeParse({ image: { ...inlineImage, publicId: 'extra' } }).success, false);
  });

  it('decodes inline bytes and rejects empty, mismatched and oversized images', () => {
    const decoded = decodeInlineImage(inlineImage);
    assert.equal(decoded.mimeType, 'image/png');
    assert.equal(decoded.imageData.toString('base64'), PNG_BASE64);

    assert.throws(
      () => decodeInlineImage({ ...inlineImage, data: '' }),
      (error: unknown) => error instanceof HttpError && error.code === 'INVALID_IMAGE_ASSET',
    );
    assert.throws(
      () => decodeInlineImage({ ...inlineImage, mimeType: 'image/jpeg' }),
      (error: unknown) => error instanceof HttpError && error.code === 'INVALID_IMAGE_FORMAT',
    );
    assert.throws(
      () => decodeInlineImage({ ...inlineImage, data: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') }),
      (error: unknown) => error instanceof HttpError && error.code === 'IMAGE_TOO_LARGE',
    );
  });

  it('derives a stable user-scoped id without storing image bytes', () => {
    assert.equal(diagnosisIdForInlineImage('user-1', inlineImage), diagnosisIdForInlineImage('user-1', inlineImage));
    assert.notEqual(diagnosisIdForInlineImage('user-1', inlineImage), diagnosisIdForInlineImage('user-2', inlineImage));
    assert.match(diagnosisIdForInlineImage('user-1', inlineImage), /^img_[a-f0-9]{32}$/);
  });

  it('creates an inline diagnosis without Cloudinary or persisted image data', async () => {
    const { store, docs } = fakeStore();
    const calls: unknown[] = [];
    const quotaCalls: string[] = [];
    const textProvider = {
      async generateText(): Promise<string> {
        assert.fail('Gemini text guidance must not run for a Gemini vision suggestion');
      },
    };

    const result = await createDiagnosis(
      'user-1',
      { image: inlineImage, language: 'en', cropName: 'Tomato' },
      advisorDouble(calls),
      textProvider,
      {
        store,
        consumeQuota: async (userId, kind) => {
          quotaCalls.push(`${userId}:${kind}`);
        },
        now: () => '2026-11-24T00:00:00.000Z',
      },
    );

    assert.equal(result.image.provider, 'inline');
    assert.equal(result.imageUrl, '');
    assert.equal(result.source, 'gemini_vision');
    assert.equal(result.status, 'possible');
    assert.match(result.guidance ?? '', /Unverified AI photo suggestion/);
    assert.deepEqual(quotaCalls, ['user-1:diagnose']);
    assert.equal(calls.length, 1);
    assert.equal((calls[0] as { imageData: Buffer }).imageData.toString('base64'), PNG_BASE64);
    assert.equal((calls[0] as { mimeType: string }).mimeType, 'image/png');

    const stored = docs.get(result.id);
    assert.ok(stored);
    assert.equal((stored.image as { provider: string }).provider, 'inline');
    assert.equal('data' in (stored.image as object), false);

    await assert.rejects(
      createDiagnosis('user-1', { image: inlineImage, language: 'en' }, advisorDouble(), textProvider, {
        store,
        consumeQuota: async () => undefined,
      }),
      (error: unknown) => error instanceof HttpError && error.code === 'DIAGNOSIS_DUPLICATE',
    );
  });

  it('rejects an invalid inline image before quota, advisor or storage writes', async () => {
    const { store, docs } = fakeStore();
    let quotaCalls = 0;
    const calls: unknown[] = [];

    await assert.rejects(
      createDiagnosis(
        'user-1',
        { image: { ...inlineImage, data: '%%%' }, language: 'en' },
        advisorDouble(calls),
        { async generateText(): Promise<string> { return ''; } },
        {
          store,
          consumeQuota: async () => {
            quotaCalls += 1;
          },
        },
      ),
      (error: unknown) => error instanceof HttpError && error.code === 'INVALID_IMAGE_ASSET',
    );

    assert.equal(quotaCalls, 0);
    assert.equal(calls.length, 0);
    assert.equal(docs.size, 0);
  });
});
