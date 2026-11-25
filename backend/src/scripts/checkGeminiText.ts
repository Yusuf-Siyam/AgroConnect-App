import { createGeminiTextProvider } from '../providers/gemini';
import { farmingSystemPrompt } from '../services/aiChat';

/**
 * Manual diagnostic only. It makes a real Gemini text request using the
 * configured backend key/model. Automated tests must use fetch doubles.
 * The provider logs status and redacted upstream errors; this script never
 * prints the API key, the prompt body or the raw upstream response.
 */
async function main(): Promise<void> {
  const provider = createGeminiTextProvider();
  try {
    const reply = await provider.generateText({
      messages: [
        {
          role: 'user',
          text: 'Reply with the single word OK. This is a connectivity check.',
          createdAt: new Date().toISOString(),
        },
      ],
      language: 'en',
      systemInstruction: farmingSystemPrompt('en'),
    });
    console.log(
      `[gemini] text diagnostic succeeded (${reply.length} characters). No key or prompt was printed.`,
    );
  } catch {
    console.error('[gemini] text diagnostic failed. See the redacted provider log above.');
    process.exitCode = 1;
  }
}

void main();
