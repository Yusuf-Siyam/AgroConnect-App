import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './chatService';

export const NOTIFICATION_PAGE_SIZE = 10;

/** Owner-only REST list/count/read mutations; notifications are never written from mobile. */
export function useNotificationCenter(uid: string) {
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);

  const list = useQuery({
    queryKey: ['notifications', uid, 'list', offset],
    queryFn: () => listNotifications({ limit: NOTIFICATION_PAGE_SIZE, offset }),
    enabled: Boolean(uid),
  });
  const unread = useQuery({
    queryKey: ['notifications', uid, 'unread-count'],
    queryFn: getUnreadNotificationCount,
    enabled: Boolean(uid),
  });

  async function refresh(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['notifications', uid] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
  }

  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: refresh,
  });
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: refresh,
  });

  return {
    list,
    unread,
    offset,
    setOffset,
    markOne,
    markAll,
    refresh,
  };
}
