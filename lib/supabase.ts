// lib/supabase.ts — one Supabase client for Android, iOS and the web version of Nexora.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL. Configure it in your EAS environment variables or local .env file.'
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_ANON_KEY. Configure it in your EAS environment variables or local .env file.'
  );
}

const isWeb = Platform.OS === 'web';
const isBrowser = isWeb && typeof window !== 'undefined';

// Phones keep the login in AsyncStorage. Browsers use localStorage; during a web build
// (no window yet) there is no storage, so nothing is saved until the page runs.
const storage = isWeb ? (isBrowser ? window.localStorage : undefined) : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    // On the web, password-reset and email links come back with the session in the URL.
    detectSessionInUrl: isBrowser,
  },
});

// On phones, only refresh the login while the app is open, and refresh straight away when it
// comes back to the foreground (recommended by Supabase for React Native). Browsers handle this themselves.
if (!isWeb) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
