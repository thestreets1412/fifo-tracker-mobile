import { Tabs } from 'expo-router';
import { color, fontFamily } from '../../theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: color.navbarBg },
        headerTitleStyle: { color: color.textBody, fontFamily: fontFamily.sansSemibold },
        headerTintColor: color.textBody,
        tabBarStyle: { backgroundColor: color.navbarBg, borderTopColor: color.cardBorder },
        tabBarActiveTintColor: color.actionPrimary,
        tabBarInactiveTintColor: color.textMuted,
        tabBarLabelStyle: { fontFamily: fontFamily.sansMedium },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'ภาพรวม' }} />
      <Tabs.Screen name="lots" options={{ title: 'ซื้อ' }} />
      <Tabs.Screen name="sales" options={{ title: 'ขาย' }} />
      <Tabs.Screen name="more" options={{ title: 'เพิ่มเติม' }} />
    </Tabs>
  );
}
