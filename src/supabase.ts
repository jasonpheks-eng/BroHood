import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://asxtpxmtaujnqyaftvab.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RYwPTgkMbsVtXXsMLKs4TA_V2Kp7YXj';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
