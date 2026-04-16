import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// On native iOS, use Capacitor Preferences for session storage (safer than
// localStorage under memory pressure). On web, fall back to localStorage.
const mobileStorage = Capacitor.isNativePlatform()
  ? {
      getItem: async (key: string) => {
        const { value } = await Preferences.get({ key });
        return value;
      },
      setItem: async (key: string, value: string) => {
        await Preferences.set({ key, value });
      },
      removeItem: async (key: string) => {
        await Preferences.remove({ key });
      },
    }
  : localStorage;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: mobileStorage,
    persistSession: true,
    autoRefreshToken: true,
    // PKCE required for OAuth + magic-link deep-link callbacks on iOS
    flowType: "pkce",
    detectSessionInUrl: false,
  }
});