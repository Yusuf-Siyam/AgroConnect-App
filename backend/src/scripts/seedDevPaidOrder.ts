/**
 * DEV-ONLY seed for Phase 08 manual QA. It refuses to run against production
 * or a non-emulator Firestore. It creates real emulator data only.
 */
import { randomUUID } from 'node:crypto';

import { FieldValue } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('seed:dev-paid-order requires FIRESTORE_EMULATOR_HOST to be set.');
}
if (process.env.NODE_ENV === 'production') {
  throw new Error('seed:dev-paid-order refuses to run with NODE_ENV=production.');
}

function arg(name: string, fallback: string): string {
  const marker = `--${name}`;
  const index = process.argv.indexOf(marker);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function flag(name: string, fallback = false): boolean {
  return process.argv.includes(`--${name}`) ? true : fallback;
}

async function main(): Promise<void> {
  const { getFirebaseAdmin } = await import('../config/firebase.js');
  const { calculateCommission, calculateDeliveryFee } = await import(
    '../config/deliveryPricing.js'
  );
  const { createDeliveryJobForOrder } = await import('../services/delivery.js');
  const {
    createTransporterProfile,
    getTransporterProfile,
    setTransporterVerification,
  } = await import('../services/transporter.js');
  const { ordersCollection } = await import('../services/order.js');

  const buyerEmail = arg('buyer-email', process.env.SEED_BUYER_EMAIL ?? 'buyer.demo@agroconnect.test');
  const farmerEmail = arg('farmer-email', process.env.SEED_FARMER_EMAIL ?? 'farmer.demo@agroconnect.test');
  const transporterEmail = arg(
    'transporter-email',
    process.env.SEED_TRANSPORTER_EMAIL ?? 'transporter.demo@agroconnect.test',
  );
  const password = arg('password', process.env.SEED_DEMO_PASSWORD ?? 'SeedDemo123!');
  const verifyTransporter = flag('verify-transporter', process.env.SEED_VERIFY_TRANSPORTER === '1');

  const { auth, firestore } = getFirebaseAdmin();

  async function ensureUser(email: string, role: 'buyer' | 'farmer' | 'transporter') {
    const existing = await auth.getUserByEmail(email).catch(() => undefined);
    const user = existing ?? (await auth.createUser({ email, password, displayName: `${role} demo` }));
    await auth.setCustomUserClaims(user.uid, { role });
    await firestore.collection('users').doc(user.uid).set(
      {
        uid: user.uid,
        email: user.email ?? email,
        displayName: user.displayName ?? `${role} demo`,
        role,
        isVerified: false,
        preferredLanguage: 'bn',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ...(role === 'transporter'
          ? { vehicle: { type: 'motorcycle', registrationNumber: 'DH-SEED-01' } }
          : {}),
      },
      { merge: true },
    );
    return user.uid;
  }

  const buyerId = await ensureUser(buyerEmail, 'buyer');
  const farmerId = await ensureUser(farmerEmail, 'farmer');
  const transporterId = await ensureUser(transporterEmail, 'transporter');

  if (!(await getTransporterProfile(transporterId))) {
    await createTransporterProfile(transporterId, {
      name: 'Transporter Demo',
      phone: '+8801700000000',
      district: 'Dhaka',
      vehicleType: 'motorcycle',
      plateNumber: 'DH-SEED-01',
      capacityKg: 50,
    });
  }
  if (verifyTransporter) {
    await setTransporterVerification(transporterId, 'verified');
  }

  const productId = randomUUID();
  const now = FieldValue.serverTimestamp();
  await firestore.collection('products').doc(productId).set({
    id: productId,
    sellerId: farmerId,
    name: { bn: 'সেড ধান', en: 'Seed rice' },
    category: 'crop',
    description: { bn: 'Phase 08 ডেলিভারি পরীক্ষার জন্য।', en: 'For Phase 08 delivery testing.' },
    price: 100,
    unit: 'kg',
    stock: 999,
    lowStockThreshold: 5,
    minOrderQty: 1,
    harvestDate: '2026-01-01',
    harvestInfo: { district: 'Dhaka', variety: 'demo' },
    images: [],
    status: 'active',
    ratingSummary: { average: 0, count: 0 },
    deleted: false,
    createdAt: now,
    updatedAt: now,
  });

  const orderId = randomUUID();
  const quantity = 5;
  const weightKg = quantity;
  const distanceKm = 0;
  const deliveryFee = calculateDeliveryFee(distanceKm, weightKg);
  const commission = calculateCommission(deliveryFee);
  const netAmount = Math.round((deliveryFee - commission + Number.EPSILON) * 100) / 100;
  const at = new Date().toISOString();
  const event = {
    id: randomUUID(),
    from: 'accepted',
    to: 'paid',
    actorId: 'seed-dev',
    actorRole: 'system',
    createdAt: at,
    updatedAt: at,
  };

  await ordersCollection().doc(orderId).set({
    id: orderId,
    buyerId,
    sellerIds: [farmerId],
    items: [
      {
        productId,
        sellerId: farmerId,
        name: { bn: 'সেড ধান', en: 'Seed rice' },
        quantity,
        unitPrice: 100,
        unit: 'kg',
      },
    ],
    status: 'paid',
    totalAmount: quantity * 100,
    deliveryFee,
    pickupAddress: {
      addressLine: '1 Farm Road, Savar',
      district: 'Dhaka',
      latitude: 23.8586,
      longitude: 90.2527,
    },
    deliveryAddress: {
      addressLine: '123 Demo Road, Dhaka',
      district: 'Dhaka',
      phoneNumber: '+8801700000000',
      latitude: 23.8103,
      longitude: 90.4125,
    },
    stockAdjusted: true,
    statusHistory: [event],
    createdAt: at,
    updatedAt: at,
  });
  await ordersCollection().doc(orderId).collection('statusHistory').doc(event.id).set(event);
  await firestore.collection('products').doc(productId).update({ stock: FieldValue.increment(-quantity) });

  const orderSnapshot = await ordersCollection().doc(orderId).get();
  const order = {
    ...orderSnapshot.data()!,
    createdAt: at,
    updatedAt: at,
  } as Parameters<typeof createDeliveryJobForOrder>[0];
  const job = await createDeliveryJobForOrder(order);

  console.log('Phase 08 dev seed complete (emulator only):');
  console.log(`  buyer:        ${buyerEmail} / ${password}`);
  console.log(`  farmer:       ${farmerEmail} / ${password}`);
  console.log(`  transporter:  ${transporterEmail} / ${password}${verifyTransporter ? ' (verified)' : ''}`);
  console.log(`  orderId:      ${orderId}`);
  console.log(`  productId:    ${productId}`);
  console.log(`  jobId:        ${job.id}`);
  console.log(`  deliveryFee:  ${deliveryFee} BDT`);
  console.log(`  commission:   ${commission} BDT`);
  console.log(`  netAmount:    ${netAmount} BDT`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
