import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { farmerApiErrorKey } from '@/features/farmer/errorMessages';
import { getWeather } from '@/features/farmer/weatherService';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';

type WeatherRequest = { district?: string; useGps: boolean; nonce: number };

export default function WeatherScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [district, setDistrict] = useState(profile?.district ?? '');
  const [request, setRequest] = useState<WeatherRequest>({ useGps: true, nonce: 0 });

  const weather = useQuery({
    queryKey: ['farmer', 'weather', request],
    queryFn: () => getWeather({ district: request.district, useGps: request.useGps }),
  });

  const loadDistrict = () => {
    if (district.trim().length < 2) return;
    setRequest((current) => ({
      district: district.trim(),
      useGps: false,
      nonce: current.nonce + 1,
    }));
  };

  if (weather.isPending) {
    return (
      <FarmerPage title={t('farmer.weather.title')}>
        <StateView state="loading" />
      </FarmerPage>
    );
  }
  if (weather.isError) {
    const code = (weather.error as { code?: string }).code;
    return (
      <FarmerPage title={t('farmer.weather.title')} subtitle={t('farmer.weather.subtitle')}>
        <StateView
          state="error"
          title={t('farmer.weather.errorTitle')}
          message={t(code === 'LOCATION_REQUIRED' ? 'farmer.weather.locationRequired' : farmerApiErrorKey(code))}
          onRetry={() => void weather.refetch()}
        />
        <WeatherFallback
          district={district}
          setDistrict={setDistrict}
          onLoad={loadDistrict}
          canLoad={district.trim().length >= 2}
          t={t}
        />
      </FarmerPage>
    );
  }

  const data = weather.data;
  return (
    <FarmerPage title={t('farmer.weather.title')} subtitle={t('farmer.weather.subtitle')}>
      <Card className="gap-2">
        <AppText variant="label">{data.locationLabel}</AppText>
        <AppText variant="caption">
          {t(
            data.locationSource === 'gps'
              ? 'farmer.weather.sourceGps'
              : 'farmer.weather.sourceDistrict',
          )}
        </AppText>
        <AppText variant="title">{data.current.temperature}°C</AppText>
        <View className="flex-row flex-wrap gap-4">
          <AppText variant="caption">
            {t('farmer.weather.humidity')}: {data.current.humidity ?? t('common.notAvailable')}
          </AppText>
          <AppText variant="caption">
            {t('farmer.weather.wind')}: {data.current.windSpeed ?? t('common.notAvailable')}
          </AppText>
        </View>
      </Card>

      <Button
        label={t('farmer.weather.refreshGps')}
        variant="outline"
        onPress={() =>
          setRequest((current) => ({ useGps: true, nonce: current.nonce + 1 }))
        }
      />

      <AppText variant="subtitle">{t('farmer.weather.forecast')}</AppText>
      {data.daily.map((day) => (
        <Card key={day.date} className="flex-row items-center justify-between gap-3">
          <AppText>{day.date}</AppText>
          <AppText>
            {day.minTemperature}° / {day.maxTemperature}°
          </AppText>
        </Card>
      ))}

      <WeatherFallback
        district={district}
        setDistrict={setDistrict}
        onLoad={loadDistrict}
        canLoad={district.trim().length >= 2}
        t={t}
      />
    </FarmerPage>
  );
}

function WeatherFallback({
  district,
  setDistrict,
  onLoad,
  canLoad,
  t,
}: {
  district: string;
  setDistrict: (value: string) => void;
  onLoad: () => void;
  canLoad: boolean;
  t: (key: TranslationKey) => string;
}) {
  return (
    <Card className="gap-3">
      <TextField
        label={t('farmer.weather.manualDistrict')}
        value={district}
        onChangeText={setDistrict}
        placeholder="Dhaka"
      />
      <Button label={t('farmer.weather.loadDistrict')} variant="outline" disabled={!canLoad} onPress={onLoad} />
    </Card>
  );
}
