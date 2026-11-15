import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL = 'https://asxtpxmtaujnqyaftvab.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_RYwPTgkMbsVtXXsMLKs4TA_V2Kp7YXj';
export const DEFAULT_SUPABASE_BUCKET = 'media';

const STORAGE_KEY = 'brotherhood_supabase_config_v1';

export interface SupabaseRuntimeConfig {
  url: string;
  anonKey: string;
  bucket: string;
  projectId: string;
}

export function extractSupabaseProjectId(url: string = DEFAULT_SUPABASE_URL): string {
  try {
    const host = new URL(url.trim()).hostname;
    return host.split('.')[0] || '';
  } catch {
    return '';
  }
}

function readStoredConfig(): { url: string; anonKey: string; bucket: string } {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<{ url: string; anonKey: string; bucket: string }>;
        return {
          url: (parsed.url || '').trim() || DEFAULT_SUPABASE_URL,
          anonKey: (parsed.anonKey || '').trim() || DEFAULT_SUPABASE_ANON_KEY,
          bucket: (parsed.bucket || '').trim() || DEFAULT_SUPABASE_BUCKET,
        };
      }
    }
  } catch {
    // Ignore storage errors
  }
  return {
    url: DEFAULT_SUPABASE_URL,
    anonKey: DEFAULT_SUPABASE_ANON_KEY,
    bucket: DEFAULT_SUPABASE_BUCKET,
  };
}

const initial = readStoredConfig();

export let SUPABASE_URL = initial.url;
export let SUPABASE_ANON_KEY = initial.anonKey;
export let SUPABASE_STORAGE_BUCKET = initial.bucket;
export let SUPABASE_PROJECT_ID = extractSupabaseProjectId(initial.url);

export let supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

type SupabaseConfigListener = (cfg: SupabaseRuntimeConfig) => void;
const configListeners = new Set<SupabaseConfigListener>();

export function onSupabaseConfigChange(listener: SupabaseConfigListener): () => void {
  configListeners.add(listener);
  return () => {
    configListeners.delete(listener);
  };
}

export function getSupabaseConfig(): SupabaseRuntimeConfig {
  return {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    bucket: SUPABASE_STORAGE_BUCKET,
    projectId: SUPABASE_PROJECT_ID,
  };
}

export function getSupabaseClient(): SupabaseClient {
  return supabase;
}

export function updateSupabaseConfig(next: {
  url?: string;
  anonKey?: string;
  bucket?: string;
}): SupabaseRuntimeConfig {
  const nextUrl = (next.url ?? '').trim() || DEFAULT_SUPABASE_URL;
  const nextKey = (next.anonKey ?? '').trim() || DEFAULT_SUPABASE_ANON_KEY;
  const nextBucket = (next.bucket ?? '').trim() || DEFAULT_SUPABASE_BUCKET;

  const credentialsChanged = nextUrl !== SUPABASE_URL || nextKey !== SUPABASE_ANON_KEY;
  const anyChanged = credentialsChanged || nextBucket !== SUPABASE_STORAGE_BUCKET;

  SUPABASE_URL = nextUrl;
  SUPABASE_ANON_KEY = nextKey;
  SUPABASE_STORAGE_BUCKET = nextBucket;
  SUPABASE_PROJECT_ID = extractSupabaseProjectId(nextUrl);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, bucket: SUPABASE_STORAGE_BUCKET })
      );
    }
  } catch {
    // Ignore storage errors
  }

  if (credentialsChanged) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  const cfg = getSupabaseConfig();
  if (anyChanged) {
    configListeners.forEach((listener) => {
      try {
        listener(cfg);
      } catch {
        // Ignore listener errors
      }
    });
  }

  return cfg;
}

export function sanitizePastedCredential(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '')
    .trim();
}

export function sanitizePastedSupabaseUrl(raw: string): string {
  return sanitizePastedCredential(raw).replace(/\/+$/, '');
}

export function sanitizePastedBucketName(raw: string): string {
  return sanitizePastedCredential(raw).replace(/^\/+|\/+$/g, '');
}

export function isSecretSupabaseKey(rawKey: string): { isSecret: boolean; reason?: string } {
  const key = sanitizePastedCredential(rawKey);
  if (!key) return { isSecret: false };

  if (key.startsWith('sb_secret_')) {
    return {
      isSecret: true,
      reason:
        'Blocked secret key (sb_secret_...). Only paste your public Supabase Anon or Publishable (sb_publishable_...) key.',
    };
  }

  const parts = key.split('.');
  if (parts.length === 3 && typeof atob === 'function') {
    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      const decoded = JSON.parse(atob(padded)) as { role?: string };
      if (decoded && decoded.role === 'service_role') {
        return {
          isSecret: true,
          reason:
            'Blocked Supabase service_role JWT! Never store service_role secrets in client settings — paste your public anon key instead.',
        };
      }
    } catch {
      // Not a decodable JWT; allow verification step to validate
    }
  }

  return { isSecret: false };
}

