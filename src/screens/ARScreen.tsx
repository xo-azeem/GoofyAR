import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ViroARSceneNavigator } from '@reactvision/react-viro';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModelScene } from '../ar/ModelScene';
import { SceneBridge, initialSceneStatus, type SceneStatus } from '../ar/sceneBridge';
import { IconButton } from '../components/IconButton';
import { ensureCameraPermission } from '../lib/permissions';
import { colors, font, radius, space, tintFor } from '../theme';
import type { LibraryModel } from '../types';

type Props = {
  model: LibraryModel;
  library: LibraryModel[];
  onClose: () => void;
};

const GESTURE_HINT_MS = 3200;

type ARViewProps = { bridge: SceneBridge; initialModel: LibraryModel };

// Viro types the scene as a zero-arg component; it actually receives { arSceneNavigator }.
const INITIAL_SCENE = { scene: ModelScene as unknown as () => React.JSX.Element };

/**
 * Memoised so status updates in the overlay never re-render the navigator.
 * Everything dynamic reaches the scene through the bridge instead of props.
 */
const ARView = React.memo(function ARView({ bridge, initialModel }: ARViewProps) {
  const viroAppProps = useMemo(() => ({ bridge, initialModel }), [bridge, initialModel]);
  return (
    <ViroARSceneNavigator
      style={StyleSheet.absoluteFill}
      initialScene={INITIAL_SCENE}
      viroAppProps={viroAppProps}
      autofocus
      worldAlignment="Gravity"
      hdrEnabled
      pbrEnabled
      bloomEnabled={false}
      shadowsEnabled={false}
    />
  );
});

export function ARScreen({ model: initialModel, library, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [cameraGranted, setCameraGranted] = useState<boolean | null>(null);
  const [status, setStatus] = useState<SceneStatus>(initialSceneStatus);
  const [current, setCurrent] = useState<LibraryModel>(initialModel);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [gestureHint, setGestureHint] = useState(false);
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One bridge per AR session.
  const bridge = useMemo(() => new SceneBridge(), []);

  useEffect(() => {
    let alive = true;
    ensureCameraPermission().then((ok) => alive && setCameraGranted(ok));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => bridge.onStatus(setStatus), [bridge]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (switcherOpen) {
        setSwitcherOpen(false);
        return true;
      }
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose, switcherOpen]);

  // Brief "how to interact" hint the first moments after each placement.
  useEffect(() => {
    if (status.phase !== 'placed') return;
    setGestureHint(true);
    Animated.timing(hintOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => {
      Animated.timing(hintOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() =>
        setGestureHint(false),
      );
    }, GESTURE_HINT_MS);
    return () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, [hintOpacity, status.phase]);

  // Errors auto-clear so they never sit on top of the camera feed.
  useEffect(() => {
    if (!status.error) return;
    const t = setTimeout(() => bridge.publish({ error: null }), 2600);
    return () => clearTimeout(t);
  }, [bridge, status.error]);

  const place = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    bridge.send({ type: 'place' });
  }, [bridge]);

  const selectModel = useCallback(
    (next: LibraryModel) => {
      setSwitcherOpen(false);
      if (next.id === current.id) return;
      setCurrent(next);
      bridge.send({ type: 'setModel', model: next });
    },
    [bridge, current.id],
  );

  // ---------------------------------------------------------------------------
  // Permission gate
  // ---------------------------------------------------------------------------

  if (cameraGranted === false) {
    return (
      <View style={[styles.gate, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar style="light" />
        <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
        <Text style={styles.gateTitle}>Camera access needed</Text>
        <Text style={styles.gateBody}>AR needs the camera to see your surroundings and place models.</Text>
        <View style={styles.gateActions}>
          <Pressable style={styles.gateSecondary} onPress={onClose}>
            <Text style={styles.gateSecondaryText}>Back</Text>
          </Pressable>
          <Pressable style={styles.gatePrimary} onPress={() => ensureCameraPermission().then(setCameraGranted)}>
            <Text style={styles.gatePrimaryText}>Allow camera</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const scanning = status.phase === 'scanning';
  const coach = scanning
    ? status.tracking !== 'normal'
      ? status.trackingHint ?? 'Move your phone slowly'
      : status.surfaceFound
        ? status.loading
          ? 'Loading model…'
          : 'Tap the screen or press Place'
        : 'Point at the floor or a table'
    : null;

  return (
    <View style={styles.root}>
      <StatusBar style="light" hidden={false} />

      {cameraGranted ? (
        <ARView bridge={bridge} initialModel={initialModel} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {/* Top bar */}
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        <IconButton icon="chevron-back" onPress={onClose} accessibilityLabel="Back to library" />
        <View style={styles.titleChip}>
          <View
            style={[
              styles.trackingDot,
              { backgroundColor: status.tracking === 'normal' ? colors.accent : status.tracking === 'limited' ? '#FFB020' : colors.textDim },
            ]}
          />
          <Text style={styles.titleText} numberOfLines={1}>
            {current.name}
          </Text>
        </View>
        <IconButton
          icon="albums-outline"
          onPress={() => setSwitcherOpen((v) => !v)}
          active={switcherOpen}
          accessibilityLabel="Switch model"
        />
      </View>

      {/* Coach / hints */}
      <View style={styles.middle} pointerEvents="none">
        {coach && (
          <View style={styles.coach}>
            {status.loading && <ActivityIndicator size="small" color={colors.text} style={{ marginRight: 8 }} />}
            <Text style={styles.coachText}>{coach}</Text>
          </View>
        )}
        {!scanning && status.loading && (
          <View style={styles.coach}>
            <ActivityIndicator size="small" color={colors.text} style={{ marginRight: 8 }} />
            <Text style={styles.coachText}>Loading model…</Text>
          </View>
        )}
        {gestureHint && (
          <Animated.View style={[styles.gestureHint, { opacity: hintOpacity }]}>
            <Hint icon="move-outline" text="Drag" />
            <Hint icon="resize-outline" text="Pinch" />
            <Hint icon="sync-outline" text="Twist" />
          </Animated.View>
        )}
        {status.error && (
          <View style={[styles.coach, styles.errorCoach]}>
            <Text style={styles.coachText}>{status.error}</Text>
          </View>
        )}
      </View>

      {/* Bottom controls */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]} pointerEvents="box-none">
        {switcherOpen && (
          <FlatList
            horizontal
            data={library}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.switcherList}
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => selectModel(item)}
                style={({ pressed }) => [
                  styles.switcherItem,
                  item.id === current.id && styles.switcherItemActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.switcherSwatch, { backgroundColor: tintFor(item.name) }]}>
                  <Ionicons name="cube" size={16} color="rgba(255,255,255,0.9)" />
                </View>
                <Text
                  style={[styles.switcherText, item.id === current.id && styles.switcherTextActive]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
              </Pressable>
            )}
          />
        )}

        {scanning ? (
          <Pressable
            accessibilityRole="button"
            onPress={place}
            disabled={!status.surfaceFound || status.loading}
            style={({ pressed }) => [
              styles.placeButton,
              (!status.surfaceFound || status.loading) && styles.placeButtonDisabled,
              pressed && { transform: [{ scale: 0.97 }] },
            ]}
          >
            <Ionicons name="locate" size={20} color={colors.accentText} />
            <Text style={styles.placeText}>Place</Text>
          </Pressable>
        ) : (
          <View style={styles.controls}>
            <IconButton icon="move-outline" label="Move" onPress={() => bridge.send({ type: 'reposition' })} />
            <IconButton icon="refresh-outline" label="Rotate" onPress={() => bridge.send({ type: 'rotateBy', degrees: 45 })} />
            {status.hasAnimation && (
              <IconButton
                icon={status.animating ? 'pause' : 'play'}
                label={status.animating ? 'Pause' : 'Play'}
                onPress={() => bridge.send({ type: 'setAnimating', value: !status.animating })}
              />
            )}
            <IconButton
              icon="contract-outline"
              label={`${status.scalePercent}%`}
              onPress={() => bridge.send({ type: 'resetTransform' })}
              accessibilityLabel="Reset size and rotation"
            />
          </View>
        )}
      </View>
    </View>
  );
}

function Hint({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={styles.hintItem}>
      <Ionicons name={icon} size={16} color={colors.text} />
      <Text style={styles.hintText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  titleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: space.md,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  trackingDot: { width: 8, height: 8, borderRadius: 4 },
  titleText: { ...font.body, fontWeight: '600', fontSize: 14, flexShrink: 1 },
  middle: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.md,
    paddingHorizontal: space.xl,
    // Keep hints clear of the bottom controls and the model switcher strip.
    paddingBottom: 220,
  },
  coach: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  errorCoach: { backgroundColor: 'rgba(255,92,92,0.85)' },
  coachText: { ...font.body, fontSize: 14, fontWeight: '500', textAlign: 'center' },
  gestureHint: {
    flexDirection: 'row',
    gap: space.xl,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
  },
  hintItem: { alignItems: 'center', gap: 4 },
  hintText: { ...font.micro, color: colors.text },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: space.lg,
  },
  placeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 34,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  placeButtonDisabled: { backgroundColor: colors.glass, shadowOpacity: 0 },
  placeText: { ...font.heading, color: colors.accentText, fontSize: 16 },
  controls: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: space.xl,
    paddingHorizontal: space.lg,
  },
  switcherList: { paddingHorizontal: space.lg, gap: space.sm },
  switcherItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 6,
    paddingRight: space.md,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    maxWidth: 200,
  },
  switcherItemActive: { backgroundColor: colors.text, borderColor: colors.text },
  switcherSwatch: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  switcherText: { ...font.body, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  switcherTextActive: { color: colors.accentText },
  gate: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    gap: space.md,
  },
  gateTitle: { ...font.heading, fontSize: 20, marginTop: space.sm },
  gateBody: { ...font.small, textAlign: 'center', lineHeight: 20 },
  gateActions: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  gatePrimary: {
    paddingHorizontal: space.xl,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gatePrimaryText: { ...font.heading, color: colors.accentText, fontSize: 15 },
  gateSecondary: {
    paddingHorizontal: space.xl,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateSecondaryText: { ...font.heading, fontSize: 15 },
});
