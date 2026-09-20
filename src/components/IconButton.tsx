import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors } from '../theme';

type Props = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label?: string;
  onPress: () => void;
  size?: number;
  active?: boolean;
  disabled?: boolean;
  tone?: 'glass' | 'accent' | 'danger';
  style?: ViewStyle;
  accessibilityLabel?: string;
};

/** Round, glassy control used on top of the camera feed and in headers. */
export function IconButton({
  icon,
  label,
  onPress,
  size = 48,
  active,
  disabled,
  tone = 'glass',
  style,
  accessibilityLabel,
}: Props) {
  const bg = tone === 'accent' ? colors.accent : tone === 'danger' ? colors.danger : active ? colors.text : colors.glass;
  const fg = tone === 'accent' || active ? colors.accentText : colors.text;
  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        disabled={disabled}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        hitSlop={6}
        style={({ pressed }) => [
          styles.button,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
          tone === 'glass' && !active && styles.glassBorder,
        ]}
      >
        <Ionicons name={icon} size={Math.round(size * 0.46)} color={fg} />
      </Pressable>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  button: { alignItems: 'center', justifyContent: 'center' },
  glassBorder: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
  label: { fontSize: 11, fontWeight: '600', color: colors.text, letterSpacing: 0.2 },
});
