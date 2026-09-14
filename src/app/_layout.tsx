import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';
import { color, fontFamily, font, space } from '../theme/tokens';
import { initializeDatabase } from '../services/appDatabase';
import { useAppStore } from '../store/useAppStore';
import { LockGate } from '../lock/LockGate';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  const db = useAppStore((s) => s.db);
  const setDb = useAppStore((s) => s.setDb);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    if (db) return;
    try {
      setDb(initializeDatabase());
    } catch (e) {
      setDbError(e instanceof Error ? e.message : String(e));
    }
  }, [db, setDb]);

  if (dbError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errTitle}>เปิดฐานข้อมูลไม่สำเร็จ</Text>
        <Text style={styles.errBody}>{dbError}</Text>
      </View>
    );
  }

  if (!fontsLoaded || !db) return null;

  return (
    <>
      <StatusBar style="light" />
      <LockGate><Stack
        screenOptions={{
          headerStyle: { backgroundColor: color.navbarBg },
          headerTintColor: color.textBody,
          headerTitleStyle: { fontFamily: fontFamily.sansSemibold },
          contentStyle: { backgroundColor: color.pageBg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack></LockGate>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: color.pageBg, alignItems: 'center', justifyContent: 'center', padding: space[4] },
  errTitle: { color: color.loss, fontFamily: fontFamily.sansBold, fontSize: font.size.lg, marginBottom: space[2] },
  errBody: { color: color.textMuted, fontFamily: fontFamily.monoRegular, fontSize: font.size.sm, textAlign: 'center' },
});
