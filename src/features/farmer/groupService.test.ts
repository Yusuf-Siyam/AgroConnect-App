import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { api } from '@/services/api';

import { cancelGroupPurchase, createGroupPurchase, listMyGroupPurchases } from './groupService';
import {
  getGroupPurchase,
  joinGroupPurchase,
  leaveGroupPurchase,
  listGroupPurchases,
} from '../buyer/groupService';

const originalGet = api.get;
const originalPost = api.post;

afterEach(() => {
  api.get = originalGet;
  api.post = originalPost;
});

function group(overrides: Record<string, unknown> = {}) {
  return {
    id: 'group-1',
    creatorId: 'farmer-1',
    farmerId: 'farmer-1',
    productId: 'product-1',
    unit: 'kg',
    targetQuantity: 20,
    quantityPerParticipant: 10,
    discountPercent: 10,
    maxParticipants: 5,
    deadline: '2026-12-01T00:00:00.000Z',
    status: 'open',
    participantCount: 1,
    committedQuantity: 10,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function list(items: unknown[] = [group()]) {
  return { items, total: 1, limit: 20, offset: 0 };
}

function stubGet(data: unknown, inspect?: (url: string, config?: unknown) => void) {
  api.get = (async (url: string, config?: unknown) => {
    inspect?.(url, config);
    return { data };
  }) as typeof api.get;
}

function stubPost(data: unknown, inspect?: (url: string, body?: unknown) => void) {
  api.post = (async (url: string, body?: unknown) => {
    inspect?.(url, body);
    return { data };
  }) as typeof api.post;
}

describe('group service response contracts', () => {
  it('farmer list unwraps the response and sends pagination to the scoped endpoint', async () => {
    stubGet(list(), (url, config) => {
      assert.equal(url, '/api/group-purchases/mine');
      assert.deepEqual(config, { params: { limit: 10, offset: 5 } });
    });

    const result = await listMyGroupPurchases({ limit: 10, offset: 5 });
    assert.equal(result.total, 1);
    assert.equal(result.items[0].id, 'group-1');
  });

  it('buyer list unwraps the response and sends status with pagination', async () => {
    stubGet(list(), (url, config) => {
      assert.equal(url, '/api/group-purchases');
      assert.deepEqual(config, { params: { status: 'open', limit: 10, offset: 5 } });
    });

    const result = await listGroupPurchases({ status: 'open', limit: 10, offset: 5 });
    assert.equal(result.items[0].status, 'open');
  });

  it('buyer detail unwraps the response', async () => {
    stubGet(group());

    const result = await getGroupPurchase('group-1');
    assert.equal(result.id, 'group-1');
  });

  it('farmer create unwraps the response', async () => {
    stubPost(group(), (url, body) => {
      assert.equal(url, '/api/group-purchases');
      assert.equal((body as { productId: string }).productId, 'product-1');
    });

    const result = await createGroupPurchase({
      productId: 'product-1',
      targetQuantity: 20,
      quantityPerParticipant: 10,
      discountPercent: 10,
      maxParticipants: 5,
      deadlineInDays: 3,
    });
    assert.equal(result.status, 'open');
  });

  it('farmer cancel unwraps the response', async () => {
    stubPost(group({ status: 'cancelled' }), (url) => {
      assert.equal(url, '/api/group-purchases/group-1/cancel');
    });

    const result = await cancelGroupPurchase('group-1');
    assert.equal(result.status, 'cancelled');
  });

  it('buyer join unwraps the response', async () => {
    stubPost({
      group: group(),
      participant: {
        groupId: 'group-1',
        buyerId: 'buyer-1',
        quantity: 10,
        joinedAt: '2026-11-01T00:00:00.000Z',
        status: 'joined',
      },
    });

    const result = await joinGroupPurchase('group-1', 10);
    assert.equal(result.participant.status, 'joined');
  });

  it('buyer leave unwraps the response', async () => {
    stubPost(group({ myParticipant: null }), (url) => {
      assert.equal(url, '/api/group-purchases/group-1/leave');
    });

    const result = await leaveGroupPurchase('group-1');
    assert.equal(result.myParticipant, null);
  });
});
