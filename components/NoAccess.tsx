import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../lib/inter';

// Shown instead of a screen the person's team role doesn't include, or to a suspended team member (same as the website).
type Props = { suspended: boolean; business: string; role: string; topInset?: number; onHome: () => void };

export function NoAccess({ suspended, business, role, topInset = 0, onHome }: Props) {
  return (
    <View style={[s.screen, { paddingTop: topInset + 24 }]}>
      <View style={s.icon}><Ionicons name={suspended ? 'pause-circle-outline' : 'lock-closed-outline'} size={30} color="#1E56A0" /></View>
      <Text style={s.title}>{suspended ? 'Your access is paused' : 'Your role doesn’t include this'}</Text>
      <Text style={s.text}>{suspended
        ? `The owner of ${business || 'this business'} has paused your access. Ask them to reactivate you.`
        : `You're on the team as ${role}. Ask the owner of ${business || 'the business'} if you need access to this.`}</Text>
      <Pressable onPress={onHome} style={s.btn} accessibilityRole="button"><Text style={s.btnText}>{suspended ? 'Open my profile' : 'Go to Home'}</Text></Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F6F8', alignItems: 'center', justifyContent: 'center', padding: 32 },
  icon: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#EAF1FB', alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 16, fontSize: 20, fontWeight: '700', color: '#0B1220', textAlign: 'center' },
  text: { marginTop: 6, maxWidth: 320, fontSize: 14, color: '#5C6B7A', textAlign: 'center' },
  btn: { marginTop: 20, borderRadius: 999, backgroundColor: '#1E56A0', paddingHorizontal: 20, paddingVertical: 11 },
  btnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
