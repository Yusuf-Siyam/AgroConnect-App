import { resolveDiseaseProvider } from '../config/photoAdvice';

/** Configuration-only check. It never calls Gemini or any external provider. */
function present(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

const provider = resolveDiseaseProvider();
let ok = true;

if (provider === 'none') {
  console.log('AI photo suggestions are disabled (DISEASE_PROVIDER=none). No API call was made.');
} else if (provider === 'gemini') {
  ok = present(process.env.GEMINI_API_KEY) && present(process.env.GEMINI_VISION_MODEL);
  console.log(
    ok
      ? 'Gemini photo advisor configuration is present. No API call was made.'
      : 'Missing GEMINI_API_KEY or GEMINI_VISION_MODEL. No API call was made.',
  );
} else {
  ok = present(process.env.DISEASE_MODEL_ENDPOINT) && present(process.env.DISEASE_MODEL_API_KEY);
  console.log(
    ok
      ? 'External photo advisor configuration is present. No API call was made.'
      : 'Missing DISEASE_MODEL_ENDPOINT or DISEASE_MODEL_API_KEY. No API call was made.',
  );
}

process.exitCode = ok ? 0 : 1;
