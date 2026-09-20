import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModelCard } from '../components/ModelCard';
import { useLibrary } from '../hooks/useLibrary';
import { colors, font, radius, space } from '../theme';
import type { LibraryModel } from '../types';

type Props = {
  onOpen: (model: LibraryModel) => void;
};

export function LibraryScreen({ onOpen }: Props) {
  const insets = useSafeAreaInsets();
  const { models, importing, addFromDevice, remove } = useLibrary();
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string) => {
      setToast(message);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      Animated.timing(toastOpacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      toastTimer.current = setTimeout(() => {
        Animated.timing(toastOpacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() =>
          setToast(null),
        );
      }, 2400);
    },
    [toastOpacity],
  );

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const onAdd = useCallback(async () => {
    const result = await addFromDevice();
    if (result.status === 'added') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast(`Added ${result.model.name}`);
    } else if (result.status === 'error') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      showToast(result.message);
    }
  }, [addFromDevice, showToast]);

  const onLongPress = useCallback(
    (model: LibraryModel) => {
      if (model.origin !== 'imported') return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      Alert.alert(model.name, 'Remove this model from your library?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            remove(model);
            showToast(`Removed ${model.name}`);
          },
        },
      ]);
    },
    [remove, showToast],
  );

  const imported = models.filter((m) => m.origin === 'imported').length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <FlatList
        data={models}
        keyExtractor={(m) => m.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 110 }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={font.title}>Library</Text>
            <Text style={styles.subtitle}>
              {models.length} {models.length === 1 ? 'model' : 'models'}
              {imported > 0 ? ` · ${imported} imported` : ''}
            </Text>
            <Text style={styles.hint}>Tap a model to view it in AR. Hold an imported model to remove it.</Text>
          </View>
        }
        renderItem={({ item }) => <ModelCard model={item} onPress={onOpen} onLongPress={onLongPress} />}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={8}
        windowSize={5}
      />

      {toast && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity, bottom: insets.bottom + 100 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a .glb model from your device"
        onPress={onAdd}
        disabled={importing}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + space.xl },
          pressed && styles.fabPressed,
          importing && styles.fabBusy,
        ]}
      >
        {importing ? (
          <ActivityIndicator color={colors.accentText} />
        ) : (
          <Ionicons name="add" size={30} color={colors.accentText} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: space.lg },
  row: { gap: space.md, marginBottom: space.md },
  header: { paddingTop: space.lg, paddingBottom: space.xl, gap: 4 },
  subtitle: { ...font.small, marginTop: 2 },
  hint: { ...font.small, color: colors.textDim, marginTop: space.sm },
  fab: {
    position: 'absolute',
    right: space.xl,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabPressed: { transform: [{ scale: 0.94 }] },
  fabBusy: { opacity: 0.8 },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '85%',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  toastText: { ...font.body, fontSize: 14, textAlign: 'center' },
});
