// Inter on every screen, as in the Figma designs (the web app uses the same font).
//
// Each Inter weight is its own font file, registered under its own name (Inter_600SemiBold ...). React Native can't
// pick a weight from one family name on Android, so these drop-in Text and TextInput components turn the style's
// fontWeight into the matching Inter file. Screens keep writing fontWeight: '600' as before.
// Text with its own fontFamily (code, passwords in monospace) is left as it is.
import {
  Inter_300Light, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, Inter_900Black,
} from '@expo-google-fonts/inter';
import * as Font from 'expo-font';
import { createContext, forwardRef, useContext, useEffect, useState, type ComponentProps, type ElementRef } from 'react';
import { Platform, StyleSheet, Text as RNText, TextInput as RNTextInput, type TextStyle } from 'react-native';

const FILES = {
  Inter_300Light, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, Inter_900Black,
};
const BY_WEIGHT: Record<string, keyof typeof FILES> = {
  '100': 'Inter_300Light', '200': 'Inter_300Light', '300': 'Inter_300Light',
  '400': 'Inter_400Regular', normal: 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold', bold: 'Inter_700Bold',
  '800': 'Inter_800ExtraBold',
  '900': 'Inter_900Black',
};
const FALLBACK_WEB = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

let loaded = false;
const waiting = new Set<() => void>();
// Starts loading as soon as the app starts. Text drawn before it finishes uses the system font for a moment.
const loading = Font.loadAsync(FILES)
  .then(() => { loaded = true; waiting.forEach(f => f()); waiting.clear(); })
  .catch(() => { /* no font files: keep the system font */ });

/** Call once in the top screen: it re-renders the app when Inter has loaded, so all text switches over. */
export function useInterFonts() {
  const [ready, setReady] = useState(loaded);
  useEffect(() => {
    if (loaded) { setReady(true); return; }
    const done = () => setReady(true);
    waiting.add(done);
    loading.finally(() => waiting.delete(done));
    return () => { waiting.delete(done); };
  }, []);
  return ready;
}

/** The Inter file for a weight, e.g. for react-native-svg text. */
export function interFamily(weight: TextStyle['fontWeight'] = '400') {
  const name = BY_WEIGHT[String(weight ?? '400')] ?? 'Inter_400Regular';
  return Platform.OS === 'web' ? `${name}, ${FALLBACK_WEB}` : name;
}

// Text inside Text takes its parent's weight unless it sets its own, as React Native does without Inter.
const ParentWeight = createContext<TextStyle['fontWeight'] | undefined>(undefined);

function resolve(style: ComponentProps<typeof RNText>['style'], parent: TextStyle['fontWeight'] | undefined) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const weight = flat?.fontWeight ?? parent;
  if (!loaded || flat?.fontFamily) return { style, weight };
  // The weight lives in the font file, so fontWeight is cleared (otherwise phones and browsers make it bolder again).
  return { style: [style, { fontFamily: interFamily(weight), fontWeight: 'normal' as const }], weight };
}

export const Text = forwardRef<ElementRef<typeof RNText>, ComponentProps<typeof RNText>>(function InterText(props, ref) {
  const { style, weight } = resolve(props.style, useContext(ParentWeight));
  return <ParentWeight.Provider value={weight}><RNText {...props} ref={ref} style={style} /></ParentWeight.Provider>;
});

export const TextInput = forwardRef<ElementRef<typeof RNTextInput>, ComponentProps<typeof RNTextInput>>(function InterTextInput(props, ref) {
  const { style } = resolve(props.style as ComponentProps<typeof RNText>['style'], undefined);
  return <RNTextInput {...props} ref={ref} style={style as ComponentProps<typeof RNTextInput>['style']} />;
});

// Same names work as types too (e.g. useRef<TextInput | null>), as with React Native's own components.
export type Text = ElementRef<typeof RNText>;
export type TextInput = ElementRef<typeof RNTextInput>;
