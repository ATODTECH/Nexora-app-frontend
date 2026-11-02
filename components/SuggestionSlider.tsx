import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../lib/inter';

// Questions offered on an empty Brain chat (company feedback 2 Nov 2026). The web app uses the same list.
export const BRAIN_SUGGESTIONS = [
  'How are my sales this week?',
  'Which products sell best?',
  'Who hasn’t paid yet?',
  'What should I restock?',
  'Write a post for my best seller',
  'Which customers should I follow up?',
  'How many orders are waiting to ship?',
  'Give me 3 ideas to get more sales',
  'Summarise my week',
  'What did customers ask about most?',
];

const SPEED = 32; // pixels per second

/** A row of question tags that slides by on its own; it pauses while you hover or touch it. Tapping a tag asks it. */
export function SuggestionSlider({ items = BRAIN_SUGGESTIONS, onPick }: { items?: string[]; onPick: (q: string) => void }) {
  const x = useRef(new Animated.Value(0)).current;
  const pos = useRef(0);
  const [w, setW] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!w || paused) return;
    let alive = true;
    const run = (from: number) => {
      x.setValue(from);
      Animated.timing(x, { toValue: -w, duration: Math.max(1, ((w + from) / SPEED) * 1000), easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' })
        .start(({ finished }) => { if (finished && alive) run(0); });
    };
    run(pos.current > -w ? pos.current : 0);
    return () => { alive = false; x.stopAnimation(v => { pos.current = v; }); };
  }, [w, paused, x]);

  const chips = (copy: number) => items.map(q => (
    <Pressable key={`${copy}-${q}`} onPress={() => onPick(q)} onPressIn={() => setPaused(true)} onPressOut={() => setPaused(false)}
      accessibilityRole="button" accessibilityLabel={`Ask: ${q}`} accessibilityElementsHidden={copy === 1} importantForAccessibility={copy === 1 ? 'no-hide-descendants' : 'auto'}
      style={(st: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, marginRight: 8, borderRadius: 18, flexShrink: 0,
        backgroundColor: st.hovered || st.pressed ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' } as any)}>
      <Ionicons name="sparkles-outline" size={13} color="#9CC3FF" />
      <Text style={{ color: '#E6EEF8', fontSize: 13.5 }} numberOfLines={1}>{q}</Text>
    </Pressable>
  ));

  return (
    <Pressable onHoverIn={() => setPaused(true)} onHoverOut={() => setPaused(false)} accessible={false} style={{ overflow: 'hidden', marginBottom: 10 }}>
      <Animated.View style={{ flexDirection: 'row', alignSelf: 'flex-start', transform: [{ translateX: x }] }}>
        <View onLayout={e => setW(Math.round(e.nativeEvent.layout.width))} style={{ flexDirection: 'row', flexShrink: 0 }}>{chips(0)}</View>
        <View style={{ flexDirection: 'row', flexShrink: 0 }}>{chips(1)}</View>
      </Animated.View>
    </Pressable>
  );
}
