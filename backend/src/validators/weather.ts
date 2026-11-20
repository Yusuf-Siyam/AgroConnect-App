import { z } from 'zod';

export const weatherQuerySchema = z
  .object({
    lat: z.coerce.number().finite().min(-90).max(90).optional(),
    lon: z.coerce.number().finite().min(-180).max(180).optional(),
    district: z.string().trim().min(2).max(80).optional(),
  })
  .strict()
  .refine((value) => (value.lat !== undefined && value.lon !== undefined) || Boolean(value.district), {
    message: 'Provide either lat and lon, or district',
  })
  .refine((value) => !(value.lat !== undefined) || value.lon !== undefined, {
    message: 'Both lat and lon are required',
  })
  .refine((value) => !(value.lon !== undefined) || value.lat !== undefined, {
    message: 'Both lat and lon are required',
  });

export type WeatherQuery = z.infer<typeof weatherQuerySchema>;
