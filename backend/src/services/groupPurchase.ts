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
import { finalizeGroupOrder, getOrder, materializeGroupOrder, restoreGroupOrder } from './order';
import { requireOwnedProduct } from './product';

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
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

const participantSchema = z.object({
  groupId: z.string().min(1),
  buyerId: z.string().min(1),
  orderId: z.string().min(1),
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
  return { ...raw, createdAt: toIso(raw.createdAt), updatedAt: toIso(raw.updatedAt) };
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
  await Promise.all(
    snap.docs.map(async (doc) => {
      const participant = parseParticipant(doc.data());
      await notifyUser(
        participant.buyerId,
        type,
        { groupId: group.id, productId: group.productId },
        { productId: group.productId, url: `/buyer/groups/${group.id}` },
      ).catch(() => undefined);
    }),
  );
}

async function finalizeGroup(groupId: string): Promise<GroupPurchase> {
  const currentSnap = await groupDoc(groupId).get();
  if (!currentSnap.exists) throw new HttpError(404, 'GROUP_PURCHASE_NOT_FOUND', 'Group purchase not found.');
  let group = parseGroup(currentSnap.data());
  const next = evaluateStatus(group);
  if (next === group.status) return group;

  const joined = (await participants(groupId).where('status', '==', 'joined').get()).docs.map((d) => parseParticipant(d.data()));

  if (next === 'successful') {
    for (const participant of joined) {
      let order = await getOrder(participant.orderId);
      if (!order) {
        order = await materializeGroupOrder({
          orderId: participant.orderId,
          groupId,
          buyerId: participant.buyerId,
          productId: group.productId,
          quantity: participant.quantity,
          discountPercent: group.discountPercent,
        });
      }
      if (order.status === 'pending') {
        await finalizeGroupOrder(participant.orderId, participant.buyerId);
      }
    }
    const allAccepted = await Promise.all(
      joined.map(async (p) => {
        const o = await getOrder(p.orderId);
        return o?.status === 'accepted';
      }),
    );
    if (!allAccepted.every(Boolean)) {
      return parseGroup((await groupDoc(groupId).get()).data());
    }
  } else if (next === 'failed') {
    for (const participant of joined) {
      await restoreGroupOrder(participant.orderId, 'system', 'Group purchase target not met by deadline');
    }
  }

  await groupDoc(groupId).set(
    { status: next, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  group = parseGroup((await groupDoc(groupId).get()).data());
  if (next === 'successful' || next === 'failed') {
    await notifyParticipants(group, next === 'successful' ? 'group_successful' : 'group_failed');
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

export async function listGroupPurchases(query: GroupPurchaseQuery): Promise<GroupPurchaseListResponse> {
  const snap = await groups().orderBy('createdAt', 'desc').get();
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

export async function joinGroupPurchase(groupId: string, buyerId: string): Promise<GroupPurchaseJoinResponse> {
  const { firestore } = getFirebaseAdmin();
  const ref = groupDoc(groupId);
  const participantRef = participants(groupId).doc(buyerId);
  const orderId = orderIdFor(groupId, buyerId);

  let result: GroupPurchaseJoinResponse | null = null;
  await firestore.runTransaction(async (tx) => {
    const [groupSnap, participantSnap] = await Promise.all([tx.get(ref), tx.get(participantRef)]);
    if (!groupSnap.exists) throw new HttpError(404, 'GROUP_PURCHASE_NOT_FOUND', 'Group purchase not found.');
    const group = parseGroup(groupSnap.data());
    const next = evaluateStatus(group);
    if (next !== 'open') throw new HttpError(409, 'GROUP_PURCHASE_NOT_OPEN', 'Group purchase is not open.');
    if (group.farmerId === buyerId) throw new HttpError(400, 'OWN_PRODUCT', 'You cannot join your own group purchase.');

    if (participantSnap.exists) {
      const participant = parseParticipant(participantSnap.data());
      result = { group, participant, orderId: participant.orderId };
      return;
    }

    if (group.participantCount >= group.maxParticipants) {
      throw new HttpError(409, 'GROUP_PURCHASE_FULL', 'Group purchase is full.');
    }

    const nowIso = new Date().toISOString();
    const participant: GroupParticipant = {
      groupId,
      buyerId,
      orderId,
      quantity: group.quantityPerParticipant,
      joinedAt: nowIso,
      status: 'joined',
    };
    tx.set(participantRef, participant);

    const nextCommitted = group.committedQuantity + group.quantityPerParticipant;
    const nextCount = group.participantCount + 1;
    tx.set(ref, {
      participantCount: nextCount,
      committedQuantity: nextCommitted,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    result = {
      group: { ...group, participantCount: nextCount, committedQuantity: nextCommitted },
      participant,
      orderId,
    };
  });

  const finalResult = result!;
  await materializeGroupOrder({
    orderId: finalResult.orderId,
    groupId,
    buyerId,
    productId: (await getGroupPurchase(groupId)).productId,
    quantity: finalResult.participant.quantity,
    discountPercent: finalResult.group.discountPercent,
  });

  const evaluated = await getGroupPurchase(groupId);
  return { ...finalResult, group: evaluated };
}

export async function cancelGroupPurchase(groupId: string, actorId: string, isAdmin: boolean): Promise<GroupPurchase> {
  const group = await getGroupPurchase(groupId);
  if (!isAdmin && group.creatorId !== actorId) {
    throw new HttpError(403, 'FORBIDDEN', 'Only the creator or admin can cancel this group purchase.');
  }
  if (group.status !== 'open') {
    throw new HttpError(409, 'GROUP_PURCHASE_NOT_OPEN', 'Only open group purchases can be cancelled.');
  }

  const joined = (await participants(groupId).where('status', '==', 'joined').get()).docs.map((d) => parseParticipant(d.data()));
  for (const p of joined) {
    await restoreGroupOrder(p.orderId, isAdmin ? 'admin' : 'system', 'Group purchase cancelled');
  }
  await groupDoc(groupId).set({ status: 'cancelled', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const cancelled = await getGroupPurchase(groupId);
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
