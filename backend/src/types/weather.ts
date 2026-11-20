export type WeatherCurrent = {
  temperature: number;
  humidity: number | null;
  windSpeed: number | null;
  weatherCode: number;
  time: string;
};

export type WeatherDay = {
  date: string;
  weatherCode: number;
  maxTemperature: number;
  minTemperature: number;
};

export type WeatherResponse = {
  latitude: number;
  longitude: number;
  locationLabel: string;
  locationSource: 'gps' | 'district';
  current: WeatherCurrent;
  daily: WeatherDay[];
  fetchedAt: string;
};
