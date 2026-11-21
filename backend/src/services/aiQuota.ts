import { env } from '../config/env';
import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';

export type AiQuotaKind = 'chat' | 'diagnose';

const WINDOW_MS = 60_000;

/** Per-user quota checked atomically in Firestore, not just per client IP. */
export async function consumeAiQuota(userId: string, kind: AiQuotaKind): Promise<void> {
  const { firestore } = getFirebaseAdmin();
  const ref = firestore.collection('aiUsage').doc(userId);
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const dailyLimit = kind === 'chat' ? env.aiDailyMessageLimit : env.aiDiagnosisDailyLimit;
  const windowLimit = kind === 'chat' ? env.aiMessagesPerMinute : env.aiDiagnosesPerMinute;
  const dailyField = kind === 'chat' ? 'messageDay' : 'diagnosisDay';
  const countField = kind === 'chat' ? 'messageCount' : 'diagnosisCount';
  const windowStartField = kind === 'chat' ? 'messageWindowStart' : 'diagnosisWindowStart';
  const windowCountField = kind === 'chat' ? 'messageWindowCount' : 'diagnosisWindowCount';

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? (snapshot.data() ?? {}) : {};
    const sameDay = data[dailyField] === day;
    const sameWindow =
      typeof data[windowStartField] === 'number' && now - Number(data[windowStartField]) < WINDOW_MS;

    const dailyCount = sameDay && typeof data[countField] === 'number' ? Number(data[countField]) : 0;
    const windowCount =
      sameWindow && typeof data[windowCountField] === 'number' ? Number(data[windowCountField]) : 0;

    if (dailyCount >= dailyLimit) {
      throw new HttpError(
        429,
        kind === 'chat' ? 'AI_DAILY_MESSAGE_LIMIT_REACHED' : 'AI_DAILY_DIAGNOSIS_LIMIT_REACHED',
        kind === 'chat'
          ? 'Daily AI message limit reached. Please try again tomorrow.'
          : 'Daily disease-check limit reached. Please try again tomorrow.',
      );
    }

    if (windowCount >= windowLimit) {
      throw new HttpError(429, 'AI_RATE_LIMITED', 'Too many AI requests. Please wait a moment.');
    }

    transaction.set(
      ref,
      {
        userId,
        [dailyField]: day,
        [countField]: dailyCount + 1,
        [windowStartField]: sameWindow ? data[windowStartField] : now,
        [windowCountField]: windowCount + 1,
        updatedAt: new Date(now).toISOString(),
      },
      { merge: true },
    );
  });
}
