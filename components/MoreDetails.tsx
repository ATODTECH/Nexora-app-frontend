import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../lib/inter';

/** Extra charts and numbers, folded away so a screen first shows only what most people need. Nothing is removed: one tap shows it all. */
export function MoreDetails({ label = 'Show charts and more numbers', children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 12 }}>
      <Pressable onPress={() => setOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C9D3DF', backgroundColor: '#FFF' }}>
        <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#1E56A0', textAlign: 'center', flexShrink: 1 }}>{open ? 'Hide charts and details' : label}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#1E56A0" />
      </Pressable>
      {open && children}
    </View>
  );
}
