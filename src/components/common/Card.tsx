import { View, type ViewProps } from 'react-native';

export function Card({ className = '', children, ...props }: ViewProps) {
  return (
    <View {...props} className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>
      {children}
    </View>
  );
}
