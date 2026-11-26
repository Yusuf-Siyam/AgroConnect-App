import { useMutation } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { BuyerPage } from '@/components/buyer/BuyerPage';
import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { ReputationBadge } from '@/components/buyer/ReputationBadge';
import { buyerApiErrorKey } from '@/features/buyer/errorMessages';
import { traceProductBatch } from '@/features/buyer/traceService';
import type { ProductBatchTrace } from '@/features/buyer/traceTypes';
import { useTranslation } from '@/i18n';

function TraceResult({ trace }: { trace: ProductBatchTrace }) {
  const { t, locale } = useTranslation();
  const name = locale === 'bn' ? trace.productName.bn : trace.productName.en;
  return (
    <Card className="gap-2">
      <AppText variant="subtitle">{name || trace.crop}</AppText>
      <AppText variant="caption">{t('buyer.trace.crop', { value: trace.crop })}</AppText>
      <AppText variant="caption">{t('buyer.trace.farmer', { value: trace.farmerDisplayName })}</AppText>
      <ReputationBadge
        reputation={{
          farmerId: '',
          score: trace.reputation.score,
          isNew: trace.reputation.isNew,
          reviewCount: trace.reputation.reviewCount,
          deliveredCount: 0,
          cancelledCount: 0,
          rejectedCount: 0,
          breakdown: {
            rating: { weight: 0, componentScore: 0, averageRating: 0 },
            delivered: { weight: 0, componentScore: 0, deliveredCount: 0, decisionCount: 0 },
            cancelReject: { weight: 0, componentScore: 0, cancelledCount: 0, rejectedCount: 0, decisionCount: 0 },
          },
          createdAt: '',
          updatedAt: '',
        }}
      />
      <AppText variant="caption">{t('buyer.trace.district', { value: trace.district })}</AppText>
      <AppText variant="caption">{t('buyer.trace.producedAt', { value: trace.producedAt })}</AppText>
      {trace.harvestDate ? (
        <AppText variant="caption">{t('buyer.trace.harvestDate', { value: trace.harvestDate })}</AppText>
      ) : null}
      <AppText variant="caption">
        {t('buyer.trace.quantity', { value: `${trace.quantity} ${t(`unit.${trace.unit}`)}` })}
      </AppText>
    </Card>
  );
}

export default function BuyerTraceScreen() {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const canScan = Platform.OS !== 'web';

  const trace = useMutation({
    mutationFn: traceProductBatch,
    onSuccess: () => {
      setScanning(false);
      setScanned(false);
    },
    onError: () => {
      // Allow the camera to scan again after a failed lookup instead of staying locked.
      setScanned(false);
    },
  });

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    trace.mutate(trimmed);
  };

  return (
    <BuyerPage title={t('buyer.trace.title')} subtitle={t('buyer.trace.subtitle')}>
      <Card className="gap-3">
        <TextField
          label={t('buyer.trace.codeLabel')}
          placeholder={t('buyer.trace.codePlaceholder')}
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
        />
        <Button
          label={t('buyer.trace.lookupAction')}
          onPress={() => submit(code)}
          loading={trace.isPending}
          disabled={!code.trim()}
        />
      </Card>

      {canScan ? (
        <Card className="gap-3">
          <AppText variant="label">{t('buyer.trace.cameraTitle')}</AppText>
          <AppText variant="caption">{t('buyer.trace.cameraPermission')}</AppText>
          {!permission?.granted ? (
            <Button label={t('buyer.trace.allowCamera')} onPress={() => void requestPermission()} variant="outline" />
          ) : (
            <Button
              label={scanning ? t('buyer.trace.stopScan') : t('buyer.trace.scanAction')}
              onPress={() => {
                setScanned(false);
                setScanning((value) => !value);
              }}
              variant="outline"
            />
          )}
          {scanning && permission?.granted ? (
            <View className="overflow-hidden rounded-xl border border-line" style={{ height: 260 }}>
              <CameraView
                style={{ flex: 1 }}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={
                  scanned
                    ? undefined
                    : ({ data }) => {
                        setScanned(true);
                        setCode(data);
                        submit(data);
                      }
                }
              />
            </View>
          ) : null}
        </Card>
      ) : (
        <Card className="gap-2">
          <AppText variant="label">{t('buyer.trace.cameraTitle')}</AppText>
          <AppText variant="caption">{t('buyer.trace.webManualOnly')}</AppText>
        </Card>
      )}

      {trace.isError ? (
        <StateView
          state="error"
          message={t(buyerApiErrorKey((trace.error as { code?: string }).code))}
          onRetry={() => submit(code)}
        />
      ) : null}
      {trace.data ? <TraceResult trace={trace.data} /> : null}
    </BuyerPage>
  );
}
