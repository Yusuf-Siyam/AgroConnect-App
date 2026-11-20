import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { deleteApp, getApps } from 'firebase-admin/app';
import { FieldValue } from 'firebase-admin/firestore';

import { getFirebaseAdmin } from '../config/firebase';
import { priceHistoryImportSchema } from '../validators/market';

/**
 * Loads real market observations from a trusted JSON file into priceHistory.
 * The file must be an array of { crop, district, date, price, unit, source }.
 * No sample data is bundled with the application.
 */
async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error('Usage: npm run market:import -- path/to/price-history.json');
  }

  const records = priceHistoryImportSchema.parse(JSON.parse(await readFile(filePath, 'utf8')));
  const { firestore } = getFirebaseAdmin();
  const batch = firestore.batch();

  for (const record of records) {
    const reference = firestore.collection('priceHistory').doc(randomUUID());
    batch.set(reference, {
      ...record,
      id: reference.id,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  console.log(`Imported ${records.length} price history record(s).`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const app of getApps()) await deleteApp(app);
  });
