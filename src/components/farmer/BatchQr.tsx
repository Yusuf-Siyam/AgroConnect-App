import qrcodeGenerator from 'qrcode-generator';
import { useMemo } from 'react';
import { View } from 'react-native';

import { theme } from '@/theme';

type Props = { value: string; size?: number };

/** Renders a QR code from the server-generated batch code; no external image fetch. */
export function BatchQr({ value, size = 180 }: Props) {
  const colors = theme.colors;
  const matrix = useMemo(() => {
    const qr = qrcodeGenerator(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const rows: boolean[][] = [];
    for (let r = 0; r < count; r += 1) {
      const row: boolean[] = [];
      for (let c = 0; c < count; c += 1) row.push(qr.isDark(r, c));
      rows.push(row);
    }
    return { count, rows };
  }, [value]);

  const cell = size / matrix.count;
  return (
    <View
      accessibilityLabel={value}
      style={{ width: size, height: size, backgroundColor: colors.surface, padding: 8, borderRadius: 12 }}
    >
      <View style={{ flex: 1 }}>
        {matrix.rows.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', flex: 1 }}>
            {row.map((dark, c) => (
              <View
                key={c}
                style={{ width: cell - 16 / matrix.count, height: cell - 16 / matrix.count, backgroundColor: dark ? colors.ink : colors.surface }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
