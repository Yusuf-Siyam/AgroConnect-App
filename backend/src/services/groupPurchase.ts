import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import type {
  GroupParticipant,
  GroupPurchase,
  GroupPurchaseJoinResponse,
  GroupPurchaseListResponse,
} from '../types/groupPurchase';
import type { CreateGroupPurchaseInput, GroupPurchaseQuery } from '../validators/groupPurchase';
import { notifyUser } from './notifications';

import { parseStoredProduct, requireOwnedProduct } from './product';

type TimestampLike = { toDate?: () => Date };

const groupSchema = z.object({
  id: z.string().min(1),
  creatorId: z.string().min(1),
  farmerId: z.string().min(1),
  productId: z.string().min(1),
  unit: z.string().min(1),
  targetQuantity: z.number().int().positive(),
  quantityPerParticipant: z.number().int().positive(),
  discountPercent: z.number().int(),
  maxParticipants: z.number().int().positive(),
  deadline: z.string(),
  status: z.enum(['open', 'successful', 'failed', 'cancelled']),
  participantCount: z.number().int().min(0),
  committedQuantity: z.number().int().min(0),
  failureReason: z.enum(['stock_unavailable']).optional(),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

const participantSchema = z.object({
  groupId: z.string().min(1),
  buyerId: z.string().min(1),
  quantity: z.number().int().positive(),
  joinedAt: z.string(),
  status: z.enum(['joined', 'cancelled']),
});

function toIso(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const ts = value as TimestampLike;
    if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  }
  throw new Error('Group purchase timestamp is missing or invalid');
}

function parseGroup(data: unknown): GroupPurchase {
  const raw = groupSchema.parse(data);
  return {
    ...raw,
    ...(raw.failureReason ? { failureReason: raw.failureReason } : {}),
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
  };
}

function parseParticipant(data: unknown): GroupParticipant {
  return participantSchema.parse(data);
}

function groups() {
  return getFirebaseAdmin().firestore.collection('groupPurchases');
}

function groupDoc(groupId: string) {
  return groups().doc(groupId);
}

function participants(groupId: string) {
  return groupDoc(groupId).collection('participants');
}

function orderIdFor(groupId: string, buyerId: string): string {
  return `gp_${groupId}_${buyerId}`;
}

function evaluateStatus(group: GroupPurchase, now = new Date()): GroupPurchase['status'] {
  if (group.status === 'cancelled' || group.status === 'successful' || group.status === 'failed') {
    return group.status;
  }
  if (group.committedQuantity >= group.targetQuantity) return 'successful';
  if (new Date(group.deadline).getTime() <= now.getTime()) return 'failed';
  return 'open';
}

async function notifyParticipants(group: GroupPurchase, type: 'group_successful' | 'group_failed'): Promise<void> {
  const snap = await participants(group.id).where('status', '==', 'joined').get();
  const targets = snap.docs.map((doc) => parseParticipant(doc.data()).buyerId);
  if (type === 'group_successful') targets.push(group.farmerId);
  const uniqueTargets = [...new Set(targets)];
  await Promise.all(
    uniqueTargets.map(async (userId) =>
      notifyUser(
        userId,
        type,
        { groupId: group.id, productId: group.productId },
        { productId: group.productId, url: `/buyer/groups/${group.id}` },
      ).catch(() => undefined),
    ),
  );
}

async function finalizeGroup(groupId: string): Promise<GroupPurchase> {
  const { firestore } = getFirebaseAdmin();
  const currentSnap = await groupDoc(groupId).get();
  if (!currentSnap.exists) throw new HttpError(404, 'GROUP_PURCHASE_NOT_FOUND', 'Group purchase not found.');
  let group = parseGroup(currentSnap.data());
  const next = evaluateStatus(group);
  if (next === group.status) return group;

  const joinedSnap = await participants(groupId).where('status', '==', 'joined').get();
  const joined = joinedSnap.docs.map((d) => parseParticipant(d.data()));

  if (next === 'successful') {
    // Re-check stock and create pending orders atomically per group; deterministic IDs prevent duplicates.
    const outcome = await firestore.runTransaction(async (tx) => {
      const gSnap = await tx.get(groupDoc(groupId));
      if (!gSnap.exists) throw new HttpError(404, 'GROUP_PURCHASE_NOT_FOUND', 'Group purchase not found.');
      const g = parseGroup(gSnap.data());
      if (g.status !== 'open') return { status: g.status as GroupPurchase['status'], reason: g.failureReason };
      const now = new Date();
      if (g.committedQuantity < g.targetQuantity && new Date(g.deadline).getTime() <= now.getTime()) {
        tx.set(groupDoc(groupId), { status: 'failed', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { status: 'failed' as const, reason: undefined };
      }
      if (g.committedQuantity < g.targetQuantity) return { status: 'open' as const, reason: undefined };

      const pSnap = await tx.get(participants(groupId).where('status', '==', 'joined'));
      const participantsJoined = pSnap.docs.map((d) => parseParticipant(d.data()));
      const productRef = firestore.collection('products').doc(g.productId);
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) {
        tx.set(groupDoc(groupId), { status: 'failed', failureReason: 'stock_unavailable', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { status: 'failed' as const, reason: 'stock_unavailable' as const };
      }
      let product: ReturnType<typeof parseStoredProduct>;
      try {
        product = parseStoredProduct(productSnap.data());
      } catch {
        tx.set(groupDoc(groupId), { status: 'failed', failureReason: 'stock_unavailable', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { status: 'failed' as const, reason: 'stock_unavailable' as const };
      }
      const required = participantsJoined.reduce((sum, p) => sum + p.quantity, 0);
      if (product.status !== 'active' || product.deleted || product.stock < required) {
        tx.set(groupDoc(groupId), { status: 'failed', failureReason: 'stock_unavailable', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { status: 'failed' as const, reason: 'stock_unavailable' as const };
      }

      const orderRefs = participantsJoined.map((p) => ({
        participant: p,
        oid: orderIdFor(groupId, p.buyerId),
        ref: firestore.collection('orders').doc(orderIdFor(groupId, p.buyerId)),
      }));
      const existingSnaps = await Promise.all(orderRefs.map((o) => tx.get(o.ref)));

      const ts = FieldValue.serverTimestamp();
      const nowIso = new Date().toISOString();
      for (let i = 0; i < orderRefs.length; i += 1) {
        if (existingSnaps[i].exists) continue; // idempotent
        const { participant: p, oid } = orderRefs[i];
        const baseUnitPrice = product.price;
        const unitPrice = Math.round(baseUnitPrice * (1 - g.discountPercent / 100) * 100) / 100;
        tx.set(orderRefs[i].ref, {
          id: oid,
          buyerId: p.buyerId,
          sellerIds: [g.farmerId],
          items: [{
            productId: g.productId,
            sellerId: g.farmerId,
            name: { bn: product.name.bn, en: product.name.en },
            quantity: p.quantity,
            unitPrice,
            baseUnitPrice,
            discountPercent: g.discountPercent,
            priceSource: 'group',
            unit: g.unit,
          }],
          status: 'pending',
          totalAmount: unitPrice * p.quantity,
          deliveryFee: null,
          statusHistory: [{
            id: oid + '_created',
            from: null,
            to: 'pending',
            actorId: 'system',
            actorRole: 'system',
            reason: `Group purchase ${groupId} success`,
            stockAdjusted: false,
            createdAt: nowIso,
            updatedAt: nowIso,
          }],
          source: 'group_purchase',
          groupId,
          stockAdjusted: false,
          stockRestored: false,
          createdAt: ts,
          updatedAt: ts,
        }, { merge: false });
      }
      tx.set(groupDoc(groupId), { status: 'successful', failureReason: FieldValue.delete(), updatedAt: ts }, { merge: true });
      return { status: 'successful' as const, reason: undefined };
    });

    group = parseGroup((await groupDoc(groupId).get()).data());
    if (outcome.status === 'successful' || outcome.status === 'failed') {
      await notifyParticipants(group, outcome.status === 'successful' ? 'group_successful' : 'group_failed');
    }
    return group;
  }

  if (next === 'failed') {
    await groupDoc(groupId).set({ status: 'failed', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    group = parseGroup((await groupDoc(groupId).get()).data());
    await notifyParticipants(group, 'group_failed');
    return group;
  }

  return group;
}

export async function getGroupPurchase(groupId: string): Promise<GroupPurchase> {
  const snap = await groupDoc(groupId).get();
  if (!snap.exists) throw new HttpError(404, 'GROUP_PURCHASE_NOT_FOUND', 'Group purchase not found.');
  const group = parseGroup(snap.data());
  const next = evaluateStatus(group);
  if (next !== group.status) return finalizeGroup(groupId);
  return group;
}

export async function listGroupPurchases(
  query: GroupPurchaseQuery,
  scope: { creatorId?: string } = {},
): Promise<GroupPurchaseListResponse> {
  const baseQuery = scope.creatorId
    ? groups().where('creatorId', '==', scope.creatorId).orderBy('createdAt', 'desc')
    : groups().orderBy('createdAt', 'desc');
  const snap = await baseQuery.get();
  const evaluated = await Promise.all(
    snap.docs.map(async (d) => {
      const g = parseGroup(d.data());
      const next = evaluateStatus(g);
      return next !== g.status ? finalizeGroup(g.id) : g;
    }),
  );
  const filtered = query.status ? evaluated.filter((g) => g.status === query.status) : evaluated;
  return {
    items: filtered.slice(query.offset, query.offset + query.limit),
    total: filtered.length,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function createGroupPurchase(farmerId: string, input: CreateGroupPurchaseInput): Promise<GroupPurchase> {
  const product = await requireOwnedProduct(farmerId, input.productId);
  if (product.status !== 'active' || product.deleted) {
    throw new HttpError(400, 'PRODUCT_UNAVAILABLE', 'Product is not available for group purchase.');
  }
  if (input.targetQuantity > product.stock) {
    throw new HttpError(400, 'INSUFFICIENT_STOCK', 'Target quantity exceeds product stock.');
  }

  const { firestore } = getFirebaseAdmin();
  const ref = groups().doc();
  const now = new Date();
  const deadline = new Date(now.getTime() + input.deadlineInDays * 24 * 60 * 60 * 1000).toISOString();
  const ts = FieldValue.serverTimestamp();
  await firestore.runTransaction(async (tx) => {
    tx.set(ref, {
      id: ref.id,
      creatorId: farmerId,
      farmerId,
      productId: product.id,
      unit: product.unit,
      targetQuantity: input.targetQuantity,
      quantityPerParticipant: input.quantityPerParticipant,
      discountPercent: input.discountPercent,
      maxParticipants: input.maxParticipants,
      deadline,
      status: 'open',
      participantCount: 0,
      committedQuantity: 0,
      createdAt: ts,
      updatedAt: ts,
    });
  });
  return getGroupPurchase(ref.id);
}

export async function joinGroupPurchase(
  groupId: string,
  buyerId: string,
  input?: { quantity?: number },
): Promise<GroupPurchaseJoinResponse> {
  const { firestore } = getFirebaseAdmin();
  const ref = groupDoc(groupId);
  const participantRef = participants(groupId).doc(buyerId);

  let result: GroupPurchaseJoinResponse | null = null;
  await firestore.runTransaction(async (tx) => {
    const [groupSnap, participantSnap] = await Promise.all([tx.get(ref), tx.get(participantRef)]);
    if (!groupSnap.exists) throw new HttpError(404, 'GROUP_PURCHASE_NOT_FOUND', 'Group purchase not found.');
    const group = parseGroup(groupSnap.data());
    const next = evaluateStatus(group);
    if (next !== 'open') throw new HttpError(409, 'GROUP_PURCHASE_NOT_OPEN', 'Group purchase is not open.');
    if (group.farmerId === buyerId) throw new HttpError(400, 'OWN_PRODUCT', 'You cannot join your own group purchase.');

    const requestedQty = input?.quantity ?? group.quantityPerParticipant;
    if (requestedQty < group.quantityPerParticipant) {
      throw new HttpError(400, 'GROUP_MIN_QTY_NOT_MET', 'Quantity is below the minimum per participant.');
    }

    if (participantSnap.exists) {
      const participant = parseParticipant(participantSnap.data());
      if (participant.status === 'joined') {
        // Idempotent: same quantity returns existing; different quantity rejected clearly.
        if (participant.quantity !== requestedQty) {
          throw new HttpError(409, 'ALREADY_JOINED', 'Already joined this group purchase.');
        }
        result = { group, participant };
        return;
      }
      // Re-join after cancel not supported in this phase; treat as duplicate/closed for simplicity.
      throw new HttpError(409, 'ALREADY_JOINED', 'Already joined this group purchase.');
    }

    if (group.participantCount >= group.maxParticipants) {
      throw new HttpError(409, 'GROUP_PURCHASE_FULL', 'Group purchase is full.');
    }

    const productSnap = await tx.get(firestore.collection('products').doc(group.productId));
    if (!productSnap.exists) throw new HttpError(409, 'PRODUCT_UNAVAILABLE', 'Product is not available.');
    const product = parseStoredProduct(productSnap.data());
    if (product.status !== 'active' || product.deleted) {
      throw new HttpError(409, 'PRODUCT_UNAVAILABLE', 'Product is not available.');
    }
    const newCommitted = group.committedQuantity + requestedQty;
    if (newCommitted > product.stock) {
      throw new HttpError(409, 'INSUFFICIENT_STOCK', 'Requested quantity exceeds available stock.');
    }

    const nowIso = new Date().toISOString();
    const participant: GroupParticipant = {
      groupId,
      buyerId,
      quantity: requestedQty,
      joinedAt: nowIso,
      status: 'joined',
    };
    tx.set(participantRef, participant);

    const nextCount = group.participantCount + 1;
    tx.set(ref, {
      participantCount: nextCount,
      committedQuantity: newCommitted,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    result = {
      group: { ...group, participantCount: nextCount, committedQuantity: newCommitted },
      participant,
    };
  });

  const evaluated = await getGroupPurchase(groupId);
  return { ...result!, group: evaluated };
}

export async function leaveGroupPurchase(groupId: string, buyerId: string): Promise<GroupPurchase> {
  const { firestore } = getFirebaseAdmin();
  const ref = groupDoc(groupId);
  const participantRef = participants(groupId).doc(buyerId);

  await firestore.runTransaction(async (tx) => {
    const [groupSnap, participantSnap] = await Promise.all([tx.get(ref), tx.get(participantRef)]);
    if (!groupSnap.exists) throw new HttpError(404, 'GROUP_PURCHASE_NOT_FOUND', 'Group purchase not found.');
    const group = parseGroup(groupSnap.data());
    const next = evaluateStatus(group);
    if (next !== 'open') {
      throw new HttpError(409, 'GROUP_PURCHASE_NOT_OPEN', 'Cannot leave a group purchase that is not open.');
    }
    if (!participantSnap.exists) throw new HttpError(404, 'PARTICIPANT_NOT_FOUND', 'Participant not found.');
    const participant = parseParticipant(participantSnap.data());
    if (participant.status !== 'joined') throw new HttpError(409, 'ALREADY_LEFT', 'Participant already left.');

    tx.set(participantRef, { status: 'cancelled' }, { merge: true });
    tx.set(ref, {
      participantCount: Math.max(0, group.participantCount - 1),
      committedQuantity: Math.max(0, group.committedQuantity - participant.quantity),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return getGroupPurchase(groupId);
}

export async function cancelGroupPurchase(groupId: string, actorId: string, isAdmin: boolean): Promise<GroupPurchase> {
  const group = await getGroupPurchase(groupId);
  if (!isAdmin && group.creatorId !== actorId) {
    throw new HttpError(403, 'FORBIDDEN', 'Only the creator or admin can cancel this group purchase.');
  }
  if (group.status !== 'open') {
    throw new HttpError(409, 'GROUP_PURCHASE_NOT_OPEN', 'Only open group purchases can be cancelled.');
  }

  await groupDoc(groupId).set({ status: 'cancelled', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const cancelled = parseGroup((await groupDoc(groupId).get()).data());
  await notifyParticipants(cancelled, 'group_failed');
  return cancelled;
}

export async function evaluateOpenGroupPurchases(): Promise<{ evaluated: number }> {
  const snap = await groups().where('status', '==', 'open').get();
  let evaluated = 0;
  for (const doc of snap.docs) {
    const before = parseGroup(doc.data());
    const after = await getGroupPurchase(before.id);
    if (after.status !== before.status) evaluated += 1;
  }
  return { evaluated };
}


export async function getGroupParticipation(groupId: string, buyerId: string): Promise<GroupParticipant | null> {
  const snap = await participants(groupId).doc(buyerId).get();
  if (!snap.exists) return null;
  const p = parseParticipant(snap.data());
  return p.status === 'joined' ? p : null;
}
