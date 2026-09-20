import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { formatBytes, formatTriangles } from '../lib/glb';
import { colors, font, radius, space, tintFor } from '../theme';
import type { LibraryModel } from '../types';

type Props = {
  model: LibraryModel;
  onPress: (model: LibraryModel) => void;
  onLongPress?: (model: LibraryModel) => void;
};

const HEAVY_TRIANGLES = 500_000;

function ModelCardInner({ model, onPress, onLongPress }: Props) {
  const tint = tintFor(model.name);
  const animated = model.stats.animations.length > 0;
  const heavy = model.stats.triangles >= HEAVY_TRIANGLES;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${model.name} in AR`}
      onPress={() => onPress(model)}
      onLongPress={onLongPress ? () => onLongPress(model) : undefined}
      delayLongPress={350}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.tile, { backgroundColor: tint }]}>
        <View style={styles.tileShade} />
        <Ionicons name="cube" size={44} color="rgba(255,255,255,0.92)" />
        <View style={styles.badges}>
          {animated && (
            <View style={styles.badge}>
              <Ionicons name="play" size={9} color={colors.text} />
              <Text style={styles.badgeText}>Animated</Text>
            </View>
          )}
          {heavy && (
            <View style={[styles.badge, styles.badgeWarn]}>
              <Text style={styles.badgeText}>Heavy</Text>
            </View>
          )}
        </View>
        {model.origin === 'bundled' && (
          <View style={styles.bundledMark}>
            <Ionicons name="sparkles" size={11} color="rgba(255,255,255,0.85)" />
          </View>
        )}
      </View>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>
          {model.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {formatBytes(model.size)} · {formatTriangles(model.stats.triangles)}
        </Text>
      </View>
    </Pressable>
  );
}

export const ModelCard = React.memo(ModelCardInner);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  tile: { aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  tileShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  badges: { position: 'absolute', left: space.sm, bottom: space.sm, flexDirection: 'row', gap: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(10,10,12,0.6)',
  },
  badgeWarn: { backgroundColor: 'rgba(255,92,92,0.75)' },
  badgeText: { ...font.micro, color: colors.text, fontSize: 10 },
  bundledMark: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,12,0.45)',
  },
  meta: { paddingHorizontal: space.md, paddingVertical: space.md, gap: 2 },
  name: { ...font.body, fontWeight: '600' },
  sub: { ...font.small, fontSize: 12 },
});
