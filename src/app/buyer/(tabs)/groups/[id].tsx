import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Screen } from '@/components/common/Screen';
import { getGroupPurchase, joinGroupPurchase, leaveGroupPurchase, type GroupPurchase } from '@/features/buyer/groupService';
import { useTranslation } from '@/i18n';

export default function BuyerGroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useTranslation();
  const [group, setGroup] = useState<GroupPurchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!id) return;
      try {
        const next = await getGroupPurchase(id);
        if (active) setGroup(next);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  const onJoin = async () => {
    if (!id) return;
    setJoining(true);
    try {
      const res = await joinGroupPurchase(id);
      setGroup(res.group);
      Alert.alert(t('common.success'), t('buyer.groups.joined'));
    } catch {
      Alert.alert(t('common.error'), t('buyer.groups.joinError'));
    } finally {
      setJoining(false);
    }
  };

  const onLeave = async () => {
    if (!id) return;
    setLeaving(true);
    try {
      const next = await leaveGroupPurchase(id);
      setGroup(next);
      Alert.alert(t('common.success'), t('buyer.groups.left'));
    } catch {
      Alert.alert(t('common.error'), t('buyer.groups.leaveError'));
    } finally {
      setLeaving(false);
    }
  };

  if (loading) return <Screen><ActivityIndicator /></Screen>;
  if (!group) return <Screen><AppText>{t('buyer.groups.notFound')}</AppText></Screen>;

  const progress = group.targetQuantity > 0 ? Math.min(1, group.committedQuantity / group.targetQuantity) : 0;

  return (
    <Screen scroll>
      <AppText variant="title">{t('buyer.groups.detailTitle')}</AppText>
      <Card className="mt-4">
        <AppText className="font-semibold">{t('buyer.groups.status')}: {group.status}</AppText>
        <AppText className="text-sm text-gray-600 mt-2">{t('buyer.groups.discount', { percent: group.discountPercent })}</AppText>
        <AppText className="text-sm text-gray-600 mt-1">{t('buyer.groups.perParticipant', { qty: group.quantityPerParticipant, unit: group.unit })}</AppText>
        <AppText className="text-sm text-gray-600 mt-1">{t('buyer.groups.deadline', { date: new Date(group.deadline).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-GB') })}</AppText>
        <View className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
          <View className="h-2 bg-primary-600" style={{ width: `${progress * 100}%` }} />
        </View>
        <AppText className="text-xs text-gray-600 mt-2">
          {t('buyer.groups.progress', { committed: group.committedQuantity, target: group.targetQuantity, unit: group.unit })}
        </AppText>
        <AppText className="text-xs text-gray-600 mt-1">{t('buyer.groups.participants', { count: group.participantCount, max: group.maxParticipants })}</AppText>
        {group.myParticipant ? (
          <AppText className="text-xs text-green-700 mt-2">{t('buyer.groups.joinedQty', { qty: group.myParticipant.quantity, unit: group.unit })}</AppText>
        ) : null}
        {group.status === 'failed' && group.failureReason === 'stock_unavailable' ? (
          <AppText className="text-xs text-red-600 mt-2">{t('buyer.groups.failureStockUnavailable')}</AppText>
        ) : null}
      </Card>
      {group.status === 'open' && !group.myParticipant ? (
        <Button className="mt-4" label={joining ? t('common.loading') : t('buyer.groups.join')} onPress={() => void onJoin()} disabled={joining} />
      ) : null}
      {group.status === 'open' && group.myParticipant ? (
        <Button variant="outline" className="mt-3" label={leaving ? t('common.loading') : t('buyer.groups.leave')} onPress={() => void onLeave()} disabled={leaving} />
      ) : null}
    </Screen>
  );
}
