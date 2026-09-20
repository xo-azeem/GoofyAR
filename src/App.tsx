import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { loadLibrary } from './lib/library';
import { ARScreen } from './screens/ARScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { colors } from './theme';
import type { LibraryModel } from './types';

/**
 * Two screens, no navigation library: the AR view is a full-screen takeover
 * and the library is unmounted underneath it so nothing competes with the
 * renderer for the JS thread.
 */
export default function App() {
  const [active, setActive] = useState<LibraryModel | null>(null);
  const [library, setLibrary] = useState<LibraryModel[]>([]);

  const open = useCallback((model: LibraryModel) => {
    setLibrary(loadLibrary());
    setActive(model);
  }, []);
  const close = useCallback(() => setActive(null), []);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="light" />
        {active ? (
          <ARScreen model={active} library={library} onClose={close} />
        ) : (
          <LibraryScreen onOpen={open} />
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
