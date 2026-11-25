import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { base64ByteLength, buildInlineImage, normalizeMimeType } from './diagnosisImage';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9kAAAAASUVORK5CYII=';

describe('diagnosis inline image payload', () => {
  it('normalizes MIME types and computes decoded byte length', () => {
    assert.equal(normalizeMimeType('IMAGE/JPEG; charset=binary'), 'image/jpeg');
    assert.equal(normalizeMimeType(null), undefined);
    assert.equal(base64ByteLength('AA=='), 1);
    assert.equal(base64ByteLength('AAA='), 2);
    assert.equal(base64ByteLength('AAAA'), 3);
  });

  it('builds a backend-compatible inline payload without a data URI', () => {
    assert.deepEqual(buildInlineImage(PNG_BASE64, 'image/png'), {
      provider: 'inline',
      mimeType: 'image/png',
      data: PNG_BASE64,
    });
    assert.equal(buildInlineImage('AAAA', 'image/jpeg').mimeType, 'image/jpeg');
  });

  it('rejects unsupported types, malformed base64 and oversized images', () => {
    const errorCode = (fn: () => unknown): string | undefined => {
      try {
        fn();
        return undefined;
      } catch (error) {
        return (error as { code?: string }).code;
      }
    };

    assert.equal(errorCode(() => buildInlineImage(PNG_BASE64, 'application/pdf')), 'INVALID_IMAGE_TYPE');
    assert.equal(errorCode(() => buildInlineImage('not base64!', 'image/png')), 'INVALID_IMAGE_DATA');
    assert.equal(errorCode(() => buildInlineImage('', 'image/png')), 'INVALID_IMAGE_DATA');
    assert.equal(
      errorCode(() => buildInlineImage('A'.repeat(6_991_065), 'image/jpeg')),
      'IMAGE_TOO_LARGE',
    );
  });
});
