import {
  getSupabaseClient,
  getSupabaseConfig,
  extractSupabaseProjectId,
  onSupabaseConfigChange,
} from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Product, Settings, CreatorPost, StudioGalleryState } from './types';
import { compressImageForCrossDevice } from './utils';
import { saveMedia, saveServerMediaMirror } from './mediaStore';
import { normalizeHeroMediaList, normalizeMediaUrlInput } from './mediaUrlUtils';

const REALTIME_TAB_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export interface MediaUploadResult {
  url: string;
  source: 'supabase' | 'server' | 'inline' | 'local' | 'external';
  error?: string;
  errorCode?: 'BUCKET_NOT_FOUND' | 'UPLOAD_FAILED';
  needsBucketSetup?: boolean;
  bucketDiagnosticNote?: string;
}

export interface MediaUploadOptions {
  onProgress?: (percent: number) => void;
}

export interface SupabaseDiagnosticLogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  step: string;
  message: string;
}

export interface SupabaseStorageDiagnosticReport {
  checkedAt: string;
  supabaseUrl: string;
  configuredProjectId: string;
  expectedProjectId: string;
  projectIdMatches: boolean;
  bucketName: string;
  bucketExists: boolean;
  bucketNotFound: boolean;
  storageReachable: boolean;
  serverFallbackReachable: boolean;
  statusSummary: 'OK' | 'BUCKET_NOT_FOUND' | 'PROJECT_MISMATCH' | 'ERROR';
  errorMessage?: string;
  logs: SupabaseDiagnosticLogEntry[];
}

const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|ogv|ogg|3gp|3g2|mkv|avi)$/i;
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|svg|avif|bmp|heic|heif)$/i;
const SUPABASE_MAX_OBJECT_BYTES = 48 * 1024 * 1024; // Supabase Free tier limit is 50MB
const CHUNK_UPLOAD_THRESHOLD = 25 * 1024 * 1024; // 25MB single-request fast path (under Cloud Run 32MB limit)
const DEFAULT_CHUNK_BYTES = 2 * 1024 * 1024; // 2MB chunks stay safely under Cloud Run's 32MiB limit

let cachedBucketStatus: { exists: boolean; checkedAt: number; lastError?: string } | null = null;

export function resetSupabaseBucketCache(): void {
  cachedBucketStatus = null;
}

export function detectIsVideoFile(fileOrName: File | string, mimeType?: string): boolean {
  const mime = (typeof fileOrName === 'string' ? mimeType || '' : fileOrName.type || mimeType || '').toLowerCase();
  if (mime.startsWith('video/')) return true;
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName.name || '';
  return VIDEO_EXT_RE.test(name);
}

export function detectIsImageFile(fileOrName: File | string, mimeType?: string): boolean {
  const mime = (typeof fileOrName === 'string' ? mimeType || '' : fileOrName.type || mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName.name || '';
  return IMAGE_EXT_RE.test(name);
}

export function isBucketNotFoundError(err: unknown): boolean {
  if (!err) return false;
  const msg =
    typeof err === 'string'
      ? err
      : typeof (err as { message?: unknown }).message === 'string'
      ? String((err as { message: string }).message)
      : JSON.stringify(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes('bucket not found') ||
    lower.includes('nosuchbucket') ||
    lower.includes('the resource was not found') ||
    (lower.includes('bucket') && lower.includes('not found'))
  );
}

export function handleSupabaseStorageBucketError(
  err: unknown,
  context: string,
  bucketName?: string,
  projectId?: string
): {
  isBucketNotFound: boolean;
  code: 'BUCKET_NOT_FOUND' | 'STORAGE_ERROR';
  title: string;
  detail: string;
  rawMessage: string;
} {
  const cfg = getSupabaseConfig();
  const activeBucket = bucketName || cfg.bucket;
  const activeProjectId = projectId || cfg.projectId;
  const rawMessage =
    typeof err === 'string'
      ? err
      : err instanceof Error
      ? err.message
      : typeof (err as { message?: unknown })?.message === 'string'
      ? String((err as { message: string }).message)
      : String(err || 'Unknown Supabase Storage error');

  const bucketMissing = isBucketNotFoundError(err);
  if (bucketMissing) {
    const detail = `Bucket Not Found: Supabase Storage bucket "${activeBucket}" does not exist on project "${activeProjectId}" (${cfg.url}). Context: ${context}.`;
    console.error(`[Supabase Storage Handler][BUCKET_NOT_FOUND] ${detail} (raw: ${rawMessage})`);
    return {
      isBucketNotFound: true,
      code: 'BUCKET_NOT_FOUND',
      title: `Bucket Not Found ("${activeBucket}")`,
      detail,
      rawMessage,
    };
  }

  const detail = `Supabase Storage error in ${context} (project "${activeProjectId}", bucket "${activeBucket}"): ${rawMessage}`;
  console.warn(`[Supabase Storage Handler][STORAGE_ERROR] ${detail}`);
  return {
    isBucketNotFound: false,
    code: 'STORAGE_ERROR',
    title: 'Supabase Storage Error',
    detail,
    rawMessage,
  };
}

export async function runSupabaseStorageDiagnostics(
  expectedProjectIdInput?: string
): Promise<SupabaseStorageDiagnosticReport> {
  const nowIso = new Date().toISOString();
  const logs: SupabaseDiagnosticLogEntry[] = [];
  const log = (level: SupabaseDiagnosticLogEntry['level'], step: string, message: string) => {
    const entry: SupabaseDiagnosticLogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      step,
      message,
    };
    logs.push(entry);
    const prefix = `[Supabase Diagnostics][${step}]`;
    if (level === 'error') console.error(prefix, message);
    else if (level === 'warn') console.warn(prefix, message);
    else console.log(prefix, message);
  };

  const cfg = getSupabaseConfig();
  const activeUrl = cfg.url;
  const activeKey = cfg.anonKey;
  const activeBucket = cfg.bucket;
  const configuredProjectId = extractSupabaseProjectId(activeUrl) || cfg.projectId;
  const expectedProjectId = (expectedProjectIdInput || configuredProjectId).trim();
  const projectIdMatches =
    Boolean(configuredProjectId) &&
    Boolean(expectedProjectId) &&
    configuredProjectId.toLowerCase() === expectedProjectId.toLowerCase();

  log('info', 'INIT', `Supabase URL: ${activeUrl}`);
  log('info', 'BUCKET_CONFIG', `Target storage bucket: "${activeBucket}"`);

  if (projectIdMatches) {
    log(
      'success',
      'PROJECT_ID',
      `Project ID validated: "${configuredProjectId}" matches expected "${expectedProjectId}".`
    );
  } else {
    log(
      'error',
      'PROJECT_ID',
      `Project ID mismatch! Active Supabase URL project is "${configuredProjectId}", expected "${expectedProjectId}".`
    );
  }

  let storageReachable = false;
  let bucketExists = false;
  let bucketNotFound = false;
  let errorMessage: string | undefined;

  // 1. Query Supabase Storage REST /storage/v1/bucket to verify connectivity and list buckets
  try {
    log('info', 'CONNECTIVITY', `Checking ${activeUrl}/storage/v1/bucket ...`);
    const resp = await fetch(`${activeUrl}/storage/v1/bucket`, {
      headers: {
        apikey: activeKey,
        Authorization: `Bearer ${activeKey}`,
      },
    });
    storageReachable = resp.ok;
    const bodyText = await resp.text();
    if (resp.ok) {
      let parsed: Array<{ id?: string; name?: string; public?: boolean }> = [];
      try {
        const json = JSON.parse(bodyText);
        if (Array.isArray(json)) parsed = json;
      } catch {
        // ignore parse error
      }
      const names = parsed.map((b) => b.name || b.id).filter(Boolean);
      log(
        'info',
        'BUCKETS_LIST',
        `Storage API responded HTTP ${resp.status}. Visible buckets (${names.length}): ${
          names.length > 0 ? names.join(', ') : 'none'
        }.`
      );
    } else {
      log('warn', 'CONNECTIVITY', `Storage bucket list returned HTTP ${resp.status}: ${bodyText}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', 'CONNECTIVITY', `Failed to reach Supabase Storage API: ${msg}`);
    errorMessage = msg;
  }

  // 2. Directly probe the configured bucket existence via /storage/v1/bucket/:bucket & public object probe
  try {
    log('info', 'BUCKET_PROBE', `Verifying bucket "${activeBucket}" existence on ${configuredProjectId}...`);
    const [bucketRes, publicProbeRes] = await Promise.all([
      fetch(`${activeUrl}/storage/v1/bucket/${encodeURIComponent(activeBucket)}`, {
        headers: {
          apikey: activeKey,
          Authorization: `Bearer ${activeKey}`,
        },
      }),
      fetch(`${activeUrl}/storage/v1/object/public/${encodeURIComponent(activeBucket)}/__health_probe__.txt`),
    ]);

    const bucketBody = await bucketRes.text();
    const publicProbeBody = await publicProbeRes.text();

    let bucketJson: { error?: string; message?: string; code?: string; public?: boolean; name?: string } | null = null;
    try {
      bucketJson = JSON.parse(bucketBody);
    } catch {
      bucketJson = null;
    }

    let publicProbeJson: { error?: string; message?: string; code?: string } | null = null;
    try {
      publicProbeJson = JSON.parse(publicProbeBody);
    } catch {
      publicProbeJson = null;
    }

    const metadataMissing = isBucketNotFoundError(bucketJson || bucketBody);
    const publicProbeMissing = isBucketNotFoundError(publicProbeJson || publicProbeBody);
    const publicBucketReachable =
      publicProbeRes.ok ||
      (!publicProbeMissing && (publicProbeRes.status === 400 || publicProbeRes.status === 404));

    if (bucketRes.ok) {
      bucketExists = true;
      bucketNotFound = false;
      storageReachable = true;
      cachedBucketStatus = { exists: true, checkedAt: Date.now() };
      log(
        'success',
        'BUCKET_PROBE',
        `Bucket "${activeBucket}" exists and is reachable (public: ${bucketJson?.public ?? 'verified'}).`
      );
    } else if (publicBucketReachable) {
      bucketExists = true;
      bucketNotFound = false;
      storageReachable = true;
      cachedBucketStatus = { exists: true, checkedAt: Date.now() };
      log(
        'success',
        'BUCKET_PROBE',
        `Bucket "${activeBucket}" is publicly reachable (object probe returned non-bucket-missing HTTP ${publicProbeRes.status}; metadata endpoint hidden by anon RLS).`
      );
    } else if (metadataMissing || publicProbeMissing) {
      const { error: listError } = await getSupabaseClient().storage
        .from(activeBucket)
        .list('', { limit: 1 });

      if (listError && !isBucketNotFoundError(listError)) {
        bucketExists = true;
        bucketNotFound = false;
        storageReachable = true;
        cachedBucketStatus = { exists: true, checkedAt: Date.now() };
        log(
          'success',
          'BUCKET_PROBE',
          `Bucket "${activeBucket}" verified via Storage SDK.`
        );
      } else {
        const handled = handleSupabaseStorageBucketError(
          listError || bucketJson || publicProbeJson || 'Bucket not found',
          'Admin Settings Storage Diagnostics',
          activeBucket,
          configuredProjectId
        );
        bucketNotFound = true;
        bucketExists = false;
        cachedBucketStatus = { exists: false, checkedAt: Date.now(), lastError: handled.rawMessage };
        errorMessage = handled.detail;
        log('error', 'BUCKET_NOT_FOUND', handled.detail);
      }
    } else {
      bucketExists = true;
      bucketNotFound = false;
      storageReachable = true;
      cachedBucketStatus = { exists: true, checkedAt: Date.now() };
      log(
        'success',
        'BUCKET_PROBE',
        `Bucket "${activeBucket}" responded with HTTP ${bucketRes.status} / public probe HTTP ${publicProbeRes.status}.`
      );
    }
  } catch (err) {
    const handled = handleSupabaseStorageBucketError(
      err,
      'Admin Settings Storage Diagnostics Exception',
      activeBucket,
      configuredProjectId
    );
    bucketNotFound = handled.isBucketNotFound;
    errorMessage = handled.detail;
    log('error', handled.code, handled.detail);
  }

  // 3. Probe App Media Server fallback (/api/upload-media-health)
  let serverFallbackReachable = false;
  try {
    const probeResp = await fetch('/api/upload-media-health');
    if (probeResp.ok) {
      serverFallbackReachable = true;
      log(
        'success',
        'SERVER_FALLBACK',
        'Chunked Express media server (/api/upload-media-health) is online on this host.'
      );
    } else {
      log(
        'warn',
        'SERVER_FALLBACK',
        `Chunked Express media server returned HTTP ${probeResp.status} on this host.`
      );
    }
  } catch (err) {
    log(
      'warn',
      'SERVER_FALLBACK',
      `Chunked Express media server unreachable: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const statusSummary: SupabaseStorageDiagnosticReport['statusSummary'] = !projectIdMatches
    ? 'PROJECT_MISMATCH'
    : bucketNotFound
    ? 'BUCKET_NOT_FOUND'
    : bucketExists
    ? 'OK'
    : 'ERROR';

  log('info', 'SUMMARY', `Diagnostics complete -> Status: ${statusSummary}`);

  return {
    checkedAt: nowIso,
    supabaseUrl: activeUrl,
    configuredProjectId,
    expectedProjectId,
    projectIdMatches,
    bucketName: activeBucket,
    bucketExists,
    bucketNotFound,
    storageReachable,
    serverFallbackReachable,
    statusSummary,
    errorMessage,
    logs,
  };
}

export interface SupabaseConnectionVerification {
  ok: boolean;
  restAuthorized: boolean;
  bucketExists: boolean;
  bucketNotFound: boolean;
  projectId: string;
  bucketName: string;
  statusCode?: number;
  summary: string;
  diagnosticReport: SupabaseStorageDiagnosticReport;
}

export async function verifySupabaseApiConnection(
  expectedProjectIdInput?: string
): Promise<SupabaseConnectionVerification> {
  const cfg = getSupabaseConfig();
  let restAuthorized = false;
  let statusCode: number | undefined;
  let authErrorMsg = '';

  try {
    const restResp = await fetch(`${cfg.url}/rest/v1/`, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
      },
    });
    statusCode = restResp.status;
    if (restResp.ok || restResp.status === 404) {
      restAuthorized = true;
    } else if (restResp.status === 401 || restResp.status === 403) {
      const body = await restResp.text().catch(() => '');
      authErrorMsg = body || `Invalid Supabase Anon Key (HTTP ${restResp.status})`;
    } else {
      const body = await restResp.text().catch(() => '');
      authErrorMsg = body || `REST API returned HTTP ${restResp.status}`;
    }
  } catch (err) {
    authErrorMsg = err instanceof Error ? err.message : 'Network error connecting to Supabase URL';
  }

  const diagnosticReport = await runSupabaseStorageDiagnostics(
    expectedProjectIdInput || cfg.projectId
  );

  if (!restAuthorized) {
    diagnosticReport.logs.push({
      timestamp: new Date().toLocaleTimeString(),
      level: 'error',
      step: 'API_KEY_AUTH',
      message: authErrorMsg || 'Supabase Anon Key verification failed.',
    });
  } else {
    diagnosticReport.logs.push({
      timestamp: new Date().toLocaleTimeString(),
      level: 'success',
      step: 'API_KEY_AUTH',
      message: `REST API key verified (HTTP ${statusCode ?? 200}).`,
    });
  }

  const ok = restAuthorized && diagnosticReport.bucketExists;
  const summary = !restAuthorized
    ? `API Key / URL verification failed: ${authErrorMsg || `HTTP ${statusCode}`}`
    : diagnosticReport.bucketNotFound
    ? `API Key valid, but Storage Bucket "${cfg.bucket}" was not found on project "${cfg.projectId}".`
    : diagnosticReport.bucketExists
    ? `Verified! Connected to Supabase project "${cfg.projectId}" and bucket "${cfg.bucket}".`
    : `API Key verified, but storage bucket "${cfg.bucket}" check returned warnings.`;

  return {
    ok,
    restAuthorized,
    bucketExists: diagnosticReport.bucketExists,
    bucketNotFound: diagnosticReport.bucketNotFound,
    projectId: cfg.projectId,
    bucketName: cfg.bucket,
    statusCode,
    summary,
    diagnosticReport,
  };
}

export interface UploadRequestTraceResult {
  requestUrl: string;
  method: string;
  requestHeaders: Record<string, string>;
  responseStatus: number;
  responseStatusText: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
  bucketExists: boolean;
  isBucketNotFound: boolean;
  timestamp: string;
}

export async function traceUploadAttempt(): Promise<UploadRequestTraceResult[]> {
  const cfg = getSupabaseConfig();
  const traces: UploadRequestTraceResult[] = [];
  const timestamp = new Date().toLocaleTimeString();

  const urlsToTrace = [
    { method: 'GET', url: '/api/upload-media-health', isLocalServer: true },
    { method: 'GET', url: `${cfg.url}/storage/v1/bucket/${encodeURIComponent(cfg.bucket)}`, isLocalServer: false },
    { method: 'GET', url: `${cfg.url}/storage/v1/bucket`, isLocalServer: false },
    { method: 'GET', url: `${cfg.url}/storage/v1/object/public/${encodeURIComponent(cfg.bucket)}/__health_probe__.txt`, isLocalServer: false },
    { method: 'POST', url: `${cfg.url}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/uploads/__trace_probe__.txt`, isLocalServer: false },
  ];

  for (const item of urlsToTrace) {
    const reqHeaders: Record<string, string> = item.isLocalServer
      ? {}
      : {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${cfg.anonKey}`,
        };
    if (item.method === 'POST') {
      reqHeaders['Content-Type'] = 'text/plain';
    }

    try {
      const resp = await fetch(item.url, {
        method: item.method,
        headers: reqHeaders,
        body: item.method === 'POST' ? 'upload trace probe' : undefined,
      });

      const respHeaders: Record<string, string> = {};
      resp.headers.forEach((val, key) => {
        respHeaders[key] = val;
      });

      const bodyText = await resp.text();
      const bucketMissing = !item.isLocalServer && isBucketNotFoundError(bodyText);
      const bucketConfirmedPresent =
        item.isLocalServer
          ? resp.ok
          : resp.ok ||
            (!bucketMissing &&
              item.url.includes('/object/public/') &&
              (resp.status === 400 || resp.status === 404));

      traces.push({
        requestUrl: item.url,
        method: item.method,
        requestHeaders: item.isLocalServer
          ? { Host: 'App Express Media Server' }
          : { apikey: cfg.anonKey.slice(0, 10) + '...', Authorization: 'Bearer ...' },
        responseStatus: resp.status,
        responseStatusText: resp.statusText,
        responseHeaders: respHeaders,
        responseBody: bodyText.slice(0, 500),
        bucketExists: bucketConfirmedPresent,
        isBucketNotFound: bucketMissing,
        timestamp,
      });
    } catch (err) {
      traces.push({
        requestUrl: item.url,
        method: item.method,
        requestHeaders: { apikey: cfg.anonKey.slice(0, 10) + '...' },
        responseStatus: 0,
        responseStatusText: err instanceof Error ? err.message : 'Network Error',
        responseHeaders: {},
        responseBody: String(err),
        bucketExists: false,
        isBucketNotFound: true,
        timestamp,
      });
    }
  }

  return traces;
}



async function hasSupabaseMediaBucket(): Promise<{
  exists: boolean;
  bucketNotFound: boolean;
  resolvedBucket?: string;
  lastError?: string;
}> {
  const now = Date.now();
  const cfg = getSupabaseConfig();
  if (cachedBucketStatus && (cachedBucketStatus.exists || now - cachedBucketStatus.checkedAt < 3_000)) {
    return {
      exists: cachedBucketStatus.exists,
      bucketNotFound: !cachedBucketStatus.exists && isBucketNotFoundError(cachedBucketStatus.lastError),
      resolvedBucket: cfg.bucket,
      lastError: cachedBucketStatus.lastError,
    };
  }
  try {
    const resp = await fetch(
      `${cfg.url}/storage/v1/bucket/${encodeURIComponent(cfg.bucket)}`,
      {
        headers: {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${cfg.anonKey}`,
        },
      }
    );
    if (resp.ok) {
      cachedBucketStatus = { exists: true, checkedAt: now };
      return { exists: true, bucketNotFound: false, resolvedBucket: cfg.bucket };
    }
    const text = await resp.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep raw text
    }
    const handled = handleSupabaseStorageBucketError(parsed, 'Media Upload Preflight');

    // Also check public object endpoint directly (anon RLS often hides /bucket/:id even when public bucket exists)
    const pubResp = await fetch(
      `${cfg.url}/storage/v1/object/public/${encodeURIComponent(cfg.bucket)}/__health_probe__.txt`
    );
    const pubText = await pubResp.text();
    const pubMissing = isBucketNotFoundError(pubText);
    if (!pubMissing) {
      cachedBucketStatus = { exists: true, checkedAt: now };
      return { exists: true, bucketNotFound: false, resolvedBucket: cfg.bucket };
    }

    // Also check if another public bucket exists on this Supabase project
    try {
      const listResp = await fetch(`${cfg.url}/storage/v1/bucket`, {
        headers: {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${cfg.anonKey}`,
        },
      });
      if (listResp.ok) {
        const buckets = (await listResp.json()) as Array<{ id?: string; name?: string; public?: boolean }>;
        if (Array.isArray(buckets) && buckets.length > 0) {
          const matching =
            buckets.find((b) => (b.name || b.id) === cfg.bucket) ||
            buckets.find((b) => b.public) ||
            buckets[0];
          const fallbackBucketName = matching?.name || matching?.id;
          if (fallbackBucketName) {
            cachedBucketStatus = { exists: true, checkedAt: now };
            return { exists: true, bucketNotFound: false, resolvedBucket: fallbackBucketName };
          }
        }
      }
    } catch {
      // ignore bucket list probe failure
    }

    const finalErrorSource = handled.isBucketNotFound ? handled : handleSupabaseStorageBucketError(pubText, 'Media Upload Preflight');
    cachedBucketStatus = { exists: false, checkedAt: now, lastError: finalErrorSource.rawMessage };
    return {
      exists: false,
      bucketNotFound: true,
      lastError: finalErrorSource.detail,
    };
  } catch (err) {
    const handled = handleSupabaseStorageBucketError(err, 'Media Upload Preflight');
    cachedBucketStatus = { exists: false, checkedAt: now, lastError: handled.rawMessage };
    return {
      exists: false,
      bucketNotFound: handled.isBucketNotFound,
      lastError: handled.detail,
    };
  }
}

interface ServerUploadAttempt {
  url: string;
  unavailable?: boolean;
  error?: string;
}

async function uploadToLocalMediaServer(
  blob: Blob,
  fileName: string,
  contentType: string,
  onProgress?: (percent: number) => void
): Promise<ServerUploadAttempt> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'media';

  // Fast single-request path for files <= 3MB
  if (blob.size <= CHUNK_UPLOAD_THRESHOLD) {
    try {
      onProgress?.(20);
      const resp = await fetch('/api/upload-media', {
        method: 'POST',
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(safeName),
        },
        body: blob,
      });
      if (resp.status === 404 || resp.status === 405) {
        return { url: '', unavailable: true, error: `Server route unavailable (${resp.status})` };
      }
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return { url: '', error: errText || `Upload failed (${resp.status})` };
      }
      const data = (await resp.json()) as { url?: string };
      onProgress?.(100);
      return { url: data?.url || '' };
    } catch (err) {
      return {
        url: '',
        unavailable: true,
        error: err instanceof Error ? err.message : 'Network error reaching media server',
      };
    }
  }

  // Chunked upload path for larger videos (prevents Cloud Run 413 Payload Too Large)
  try {
    onProgress?.(2);
    const initResp = await fetch('/api/upload-media-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: safeName,
        contentType: contentType || 'video/mp4',
        totalBytes: blob.size,
      }),
    });

    if (initResp.status === 404 || initResp.status === 405) {
      return { url: '', unavailable: true, error: `Chunk upload route unavailable (${initResp.status})` };
    }
    if (!initResp.ok) {
      const errBody = await initResp.json().catch(() => ({}));
      return {
        url: '',
        error: (errBody as { error?: string }).error || `Upload init failed (${initResp.status})`,
      };
    }

    const initData = (await initResp.json()) as { uploadId?: string; chunkBytes?: number };
    const uploadId = initData.uploadId;
    if (!uploadId) {
      return { url: '', error: 'Invalid upload session returned by server.' };
    }

    const chunkSize = Math.min(initData.chunkBytes || DEFAULT_CHUNK_BYTES, 4 * 1024 * 1024);
    let offset = 0;

    while (offset < blob.size) {
      const end = Math.min(offset + chunkSize, blob.size);
      const slice = blob.slice(offset, end);

      let sent = false;
      let lastChunkErr = '';
      for (let attempt = 0; attempt < 3 && !sent; attempt++) {
        try {
          const chunkResp = await fetch('/api/upload-media-chunk', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'X-Upload-Id': uploadId,
              'X-Chunk-Offset': String(offset),
            },
            body: slice,
          });
          if (chunkResp.ok) {
            sent = true;
          } else {
            lastChunkErr = `Chunk upload failed (${chunkResp.status})`;
          }
        } catch (err) {
          lastChunkErr = err instanceof Error ? err.message : 'Chunk network error';
        }
        if (!sent && attempt < 2) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }

      if (!sent) {
        return { url: '', error: lastChunkErr || 'Chunked upload interrupted.' };
      }

      offset = end;
      const pct = Math.min(96, Math.round((offset / blob.size) * 95));
      onProgress?.(pct);
    }

    const completeResp = await fetch('/api/upload-media-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId }),
    });

    if (!completeResp.ok) {
      const errBody = await completeResp.json().catch(() => ({}));
      return {
        url: '',
        error: (errBody as { error?: string }).error || `Failed to finalize upload (${completeResp.status})`,
      };
    }

    const completeData = (await completeResp.json()) as { url?: string };
    onProgress?.(100);
    return { url: completeData?.url || '' };
  } catch (err) {
    return {
      url: '',
      unavailable: true,
      error: err instanceof Error ? err.message : 'Chunked upload error',
    };
  }
}

export async function uploadMediaToSupabase(
  fileOrDataUrl: string | File,
  fileName: string = 'media',
  options?: MediaUploadOptions
): Promise<MediaUploadResult> {
  try {
    let blob: Blob;
    let resolvedName = fileName;
    let isImage = false;
    let isVideo = false;

    if (typeof fileOrDataUrl === 'string') {
      if (!fileOrDataUrl.startsWith('data:')) {
        return { url: fileOrDataUrl, source: 'external' };
      }
      isImage = fileOrDataUrl.startsWith('data:image/') || detectIsImageFile(fileName);
      isVideo = fileOrDataUrl.startsWith('data:video/') || detectIsVideoFile(fileName);
      const res = await fetch(fileOrDataUrl);
      blob = await res.blob();
    } else {
      blob = fileOrDataUrl;
      resolvedName = fileOrDataUrl.name || fileName;
      isImage = detectIsImageFile(fileOrDataUrl);
      isVideo = detectIsVideoFile(fileOrDataUrl);
    }

    const safeName = resolvedName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'media';
    const filePath = `uploads/${Date.now()}_${safeName}`;
    const contentType =
      blob.type && blob.type !== 'application/octet-stream'
        ? blob.type
        : isVideo
        ? 'video/mp4'
        : isImage
        ? 'image/jpeg'
        : 'application/octet-stream';

    // 1. Check if configured Supabase bucket exists (or any available public bucket)
    const cfg = getSupabaseConfig();
    const bucketProbe =
      blob.size <= SUPABASE_MAX_OBJECT_BYTES
        ? await hasSupabaseMediaBucket()
        : { exists: false, bucketNotFound: false, resolvedBucket: undefined, lastError: undefined };

    let bucketNotFoundNote = bucketProbe.bucketNotFound ? bucketProbe.lastError : undefined;

    if (bucketProbe.exists) {
      const targetBucket = bucketProbe.resolvedBucket || cfg.bucket;
      options?.onProgress?.(30);
      const client = getSupabaseClient();
      const { data, error } = await client.storage
        .from(targetBucket)
        .upload(filePath, blob, {
          contentType,
          upsert: true,
        });

      if (!error && data?.path) {
        const { data: publicUrlData } = client.storage
          .from(targetBucket)
          .getPublicUrl(data.path);
        if (publicUrlData?.publicUrl) {
          options?.onProgress?.(100);
          return { url: publicUrlData.publicUrl, source: 'supabase' };
        }
      }

      if (error) {
        const handled = handleSupabaseStorageBucketError(error, `Upload ${safeName}`);
        if (handled.isBucketNotFound) {
          cachedBucketStatus = { exists: false, checkedAt: Date.now(), lastError: handled.rawMessage };
          bucketNotFoundNote = handled.detail;
        }
      }
    }

    // 2. For videos (when Supabase bucket is missing or file > 48MB):
    // Try chunked app media server (/api/upload-media-init -> chunks -> complete),
    // then compact inline data URL (<= 650KB), then IndexedDB binary Blob storage (idb://).
    if (isVideo) {
      const serverAttempt = await uploadToLocalMediaServer(
        blob,
        safeName,
        contentType,
        options?.onProgress
      );
      if (serverAttempt.url) {
        await saveServerMediaMirror(serverAttempt.url, blob);
        return {
          url: serverAttempt.url,
          source: 'server',
          ...(bucketNotFoundNote ? { bucketDiagnosticNote: bucketNotFoundNote } : {}),
        };
      }

      if (blob.size <= 150 * 1024) {
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          if (dataUrl && dataUrl.length <= 220_000) {
            options?.onProgress?.(100);
            return {
              url: dataUrl,
              source: 'inline',
              ...(bucketNotFoundNote ? { bucketDiagnosticNote: bucketNotFoundNote } : {}),
            };
          }
        } catch {
          // fall through to IndexedDB Blob fallback
        }
      }

      const idbKey = `vid_${Date.now()}_${safeName}`;
      const idbUri = await saveMedia(idbKey, blob);
      if (idbUri && idbUri.startsWith('idb://')) {
        options?.onProgress?.(100);
        return {
          url: idbUri,
          source: 'local',
          ...(bucketNotFoundNote ? { bucketDiagnosticNote: bucketNotFoundNote } : {}),
        };
      }

      const needsBucketSetup = Boolean(
        serverAttempt.unavailable || !bucketProbe.exists || bucketProbe.bucketNotFound
      );
      const friendlyError = bucketNotFoundNote
        ? `Bucket Not Found ("${cfg.bucket}") on Supabase project "${cfg.projectId}", and app media server is unavailable (${serverAttempt.error || '404'}). Run the Supabase Storage SQL setup or paste an HTTPS .mp4 link.`
        : serverAttempt.unavailable
        ? `Supabase Storage bucket "${cfg.bucket}" is not created yet and the media server route is unavailable on this host. Run the Supabase Storage SQL setup or paste an HTTPS .mp4 link.`
        : serverAttempt.error ||
          'Video upload failed. Please try an MP4/MOV under 150MB or paste an HTTPS .mp4 link.';

      return {
        url: '',
        source: 'server',
        error: friendlyError,
        errorCode: bucketNotFoundNote || bucketProbe.bucketNotFound ? 'BUCKET_NOT_FOUND' : 'UPLOAD_FAILED',
        needsBucketSetup,
        bucketDiagnosticNote: bucketNotFoundNote,
      };
    }

    // 3. For images: compress into a compact JPEG data URL for instant cross-device Firestore sync,
    // or fall back to app media server / IndexedDB if still large.
    if (isImage) {
      const compressed = await compressImageForCrossDevice(fileOrDataUrl, 155000);
      if (compressed && compressed.length <= 195000) {
        options?.onProgress?.(100);
        return {
          url: compressed,
          source: 'inline',
          ...(bucketNotFoundNote ? { bucketDiagnosticNote: bucketNotFoundNote } : {}),
        };
      }
      const serverAttempt = await uploadToLocalMediaServer(
        blob,
        safeName,
        contentType,
        options?.onProgress
      );
      if (serverAttempt.url) {
        await saveServerMediaMirror(serverAttempt.url, blob);
        return {
          url: serverAttempt.url,
          source: 'server',
          ...(bucketNotFoundNote ? { bucketDiagnosticNote: bucketNotFoundNote } : {}),
        };
      }
      const idbUri = await saveMedia(`img_${Date.now()}_${safeName}`, blob);
      if (idbUri && idbUri.startsWith('idb://')) {
        options?.onProgress?.(100);
        return {
          url: idbUri,
          source: 'local',
          ...(bucketNotFoundNote ? { bucketDiagnosticNote: bucketNotFoundNote } : {}),
        };
      }
      return {
        url: '',
        source: 'inline',
        error:
          bucketNotFoundNote ||
          'Image is too large after compression. Please upload a smaller image or set up the "media" bucket in Supabase.',
        errorCode: bucketNotFoundNote ? 'BUCKET_NOT_FOUND' : 'UPLOAD_FAILED',
        needsBucketSetup: !bucketProbe.exists,
        bucketDiagnosticNote: bucketNotFoundNote,
      };
    }

    // 4. Generic fallback for unknown extensions
    const serverAttempt = await uploadToLocalMediaServer(
      blob,
      safeName,
      contentType,
      options?.onProgress
    );
    if (serverAttempt.url) {
      await saveServerMediaMirror(serverAttempt.url, blob);
      return {
        url: serverAttempt.url,
        source: 'server',
        ...(bucketNotFoundNote ? { bucketDiagnosticNote: bucketNotFoundNote } : {}),
      };
    }

    const idbUri = await saveMedia(`media_${Date.now()}_${safeName}`, blob);
    if (idbUri && idbUri.startsWith('idb://')) {
      options?.onProgress?.(100);
      return {
        url: idbUri,
        source: 'local',
        ...(bucketNotFoundNote ? { bucketDiagnosticNote: bucketNotFoundNote } : {}),
      };
    }

    return {
      url: typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '',
      source: 'inline',
      error:
        bucketNotFoundNote ||
        serverAttempt.error ||
        'Could not upload file. Set up the Supabase "media" bucket or paste a direct HTTPS media URL.',
      errorCode: bucketNotFoundNote ? 'BUCKET_NOT_FOUND' : 'UPLOAD_FAILED',
      needsBucketSetup: !bucketProbe.exists,
      bucketDiagnosticNote: bucketNotFoundNote,
    };
  } catch (err) {
    const handled = handleSupabaseStorageBucketError(err, 'uploadMediaToSupabase');
    if (
      fileOrDataUrl instanceof File
        ? detectIsImageFile(fileOrDataUrl)
        : typeof fileOrDataUrl === 'string' && fileOrDataUrl.startsWith('data:image/')
    ) {
      try {
        const compressed = await compressImageForCrossDevice(fileOrDataUrl, 155000);
        if (compressed && compressed.length <= 195000) {
          return { url: compressed, source: 'inline' };
        }
      } catch {
        // fall through
      }
    }
    return {
      url: typeof fileOrDataUrl === 'string' && !fileOrDataUrl.startsWith('idb://') ? fileOrDataUrl : '',
      source: 'inline',
      error: handled.detail,
      errorCode: handled.isBucketNotFound ? 'BUCKET_NOT_FOUND' : 'UPLOAD_FAILED',
      needsBucketSetup: handled.isBucketNotFound,
      bucketDiagnosticNote: handled.isBucketNotFound ? handled.detail : undefined,
    };
  }
}

type BroadcastTopic = 'settings_sync' | 'products_sync' | 'creators_sync' | 'studio_gallery_sync' | 'full_sync';

let activeLiveChannel: RealtimeChannel | null = null;
let activeLiveClientRef: unknown = null;
const galleryUpdateSubscribers = new Set<(gallery: StudioGalleryState) => void>();
const BROWSER_CHANNEL_NAME = 'brotherhood-live-sync';

function postLocalBrowserSync(topic: BroadcastTopic, payloadObj: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(BROWSER_CHANNEL_NAME);
      bc.postMessage({ topic, payload: payloadObj });
      bc.close();
    }
  } catch {
    // Ignore BroadcastChannel restriction
  }
}

export async function emitRealtimeBroadcast(topic: BroadcastTopic, data?: unknown): Promise<boolean> {
  const payloadObj: Record<string, unknown> = {
    originId: REALTIME_TAB_ID,
    updatedAt: Date.now(),
  };
  if (data !== undefined) {
    try {
      const serialized = JSON.stringify(data);
      // Stay safely under Supabase Realtime Broadcast payload limits (~64KB)
      if (serialized.length < 55000) {
        payloadObj.data = data;
      } else {
        payloadObj.refetch = true;
      }
    } catch {
      payloadObj.refetch = true;
    }
  } else {
    payloadObj.refetch = true;
  }

  postLocalBrowserSync(topic, payloadObj);

  try {
    const client = getSupabaseClient();
    if (activeLiveChannel && activeLiveClientRef === client) {
      const res = await activeLiveChannel.send({
        type: 'broadcast',
        event: topic,
        payload: payloadObj,
      });
      return res === 'ok';
    }

    // Fallback: open temporary channel only if main subscription is not mounted yet
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const tempChannel = client.channel('brotherhood-live-sync', {
        config: { broadcast: { self: false } },
      });
      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          if (activeLiveChannel !== tempChannel) {
            client.removeChannel(tempChannel).catch(() => {});
          }
          resolve(false);
        }
      }, 4500);

      tempChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !settled) {
          try {
            const res = await tempChannel.send({
              type: 'broadcast',
              event: topic,
              payload: payloadObj,
            });
            settled = true;
            clearTimeout(timeoutId);
            resolve(res === 'ok');
          } catch {
            settled = true;
            clearTimeout(timeoutId);
            resolve(false);
          } finally {
            if (activeLiveChannel !== tempChannel) {
              client.removeChannel(tempChannel).catch(() => {});
            }
          }
        } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !settled) {
          settled = true;
          clearTimeout(timeoutId);
          if (activeLiveChannel !== tempChannel) {
            client.removeChannel(tempChannel).catch(() => {});
          }
          resolve(false);
        }
      });
    });
  } catch (err) {
    console.warn('[Supabase Realtime] Broadcast send notice:', err);
    return false;
  }
}

export async function syncProductToSupabase(product: Product): Promise<boolean> {
  if (!product.id) return false;
  try {
    const { error } = await getSupabaseClient().from('products').upsert({
      id: product.id,
      name: product.name,
      price: Number(product.price) || 0,
      category: product.category,
      collection: product.collection,
      image_url: product.imageUrl || null,
      gallery_images: product.galleryImages || [],
      image_color: product.imageColor || '#F8F7F3',
      variants: product.variants || [],
      total_stock: product.totalStock ?? null,
      description: product.description || null,
      details: product.details || null,
      updated_at: new Date().toISOString(),
    });
    void emitRealtimeBroadcast('products_sync');
    if (error) {
      console.warn('Supabase product sync warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase product sync error:', err);
    void emitRealtimeBroadcast('products_sync');
    return false;
  }
}

export async function deleteProductFromSupabase(productId: string): Promise<boolean> {
  try {
    const { error } = await getSupabaseClient().from('products').delete().eq('id', productId);
    void emitRealtimeBroadcast('products_sync');
    if (error) {
      console.warn('Supabase product delete warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase product delete error:', err);
    void emitRealtimeBroadcast('products_sync');
    return false;
  }
}

export async function syncSettingsToSupabase(settings: Settings): Promise<boolean> {
  const updatedAtMs = settings.settingsUpdatedAt || Date.now();
  const { studioGallery: _omittedGallery, ...settingsPayload } = settings;
  const normalizedUrls = Array.isArray(settingsPayload.heroVideoUrls)
    ? normalizeHeroMediaList(settingsPayload.heroVideoUrls)
    : settingsPayload.heroVideoUrl
    ? normalizeHeroMediaList([settingsPayload.heroVideoUrl])
    : [];
  const primaryHero = normalizedUrls[0] || normalizeMediaUrlInput(settingsPayload.heroVideoUrl) || undefined;

  const cleanSettingsRecord: Settings = {
    ...settingsPayload,
    heroVideoUrls: normalizedUrls.length > 0 ? normalizedUrls : settingsPayload.heroVideoUrls,
    heroVideoUrl: primaryHero ?? settingsPayload.heroVideoUrl,
    settingsUpdatedAt: updatedAtMs,
  };

  try {
    const { error } = await getSupabaseClient().from('settings').upsert({
      id: 'global',
      brand_name: cleanSettingsRecord.brandName,
      logo_url: cleanSettingsRecord.logoUrl || null,
      hero_image_url: cleanSettingsRecord.heroImageUrl || null,
      hero_video_url: cleanSettingsRecord.heroVideoUrl || null,
      hero_video_urls: cleanSettingsRecord.heroVideoUrls || [],
      about_us_title: cleanSettingsRecord.aboutUsTitle || null,
      about_us_text: cleanSettingsRecord.aboutUsText || null,
      whatsapp_number: cleanSettingsRecord.whatsappNumber || '',
      raw_settings: cleanSettingsRecord,
      updated_at: new Date(updatedAtMs).toISOString(),
    });
    void emitRealtimeBroadcast('settings_sync', cleanSettingsRecord);
    if (error) {
      console.warn('Supabase settings sync warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase settings sync error:', err);
    void emitRealtimeBroadcast('settings_sync', cleanSettingsRecord);
    return false;
  }
}

export async function syncCreatorPostToSupabase(post: CreatorPost): Promise<boolean> {
  if (!post.id) return false;
  try {
    const { error } = await getSupabaseClient().from('creators_club').upsert({
      id: post.id,
      creator_name: post.creatorName,
      handle: post.handle,
      avatar_url: post.avatarUrl || null,
      media_url: post.mediaUrl,
      is_video: Boolean(post.isVideo),
      social_link: post.socialLink || null,
      caption: post.caption || null,
      tagged_product_ids: post.taggedProductIds || [],
      featured: post.featured ?? true,
      updated_at: new Date().toISOString(),
    });
    void emitRealtimeBroadcast('creators_sync');
    if (error) {
      console.warn('Supabase creator post sync warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase creator post sync error:', err);
    void emitRealtimeBroadcast('creators_sync');
    return false;
  }
}

export async function deleteCreatorPostFromSupabase(postId: string): Promise<boolean> {
  try {
    const { error } = await getSupabaseClient().from('creators_club').delete().eq('id', postId);
    void emitRealtimeBroadcast('creators_sync');
    if (error) {
      console.warn('Supabase creator post delete warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase creator post delete error:', err);
    void emitRealtimeBroadcast('creators_sync');
    return false;
  }
}

export async function syncStudioGalleryToSupabase(gallery: StudioGalleryState): Promise<boolean> {
  try {
    const { error } = await getSupabaseClient().from('studio_gallery').upsert({
      id: 'config',
      layout_mode: gallery.layoutMode,
      title_layout: gallery.titleLayout || 'tile-corner',
      text_animation: gallery.textAnimation,
      kicker: gallery.kicker || '',
      header_title: gallery.headerTitle || '',
      header_description: gallery.headerDescription || '',
      items: gallery.items || [],
      raw_gallery: gallery,
      updated_at: new Date().toISOString(),
    });
    void emitRealtimeBroadcast('studio_gallery_sync', gallery);
    if (error) {
      console.warn('Supabase studio gallery sync warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase studio gallery sync error:', err);
    void emitRealtimeBroadcast('studio_gallery_sync', gallery);
    return false;
  }
}

function mapSupabaseProductRow(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category || 'SHIRTS',
    price: Number(row.price) || 0,
    imageColor: row.image_color || '#F8F7F3',
    imageUrl: row.image_url || undefined,
    galleryImages: Array.isArray(row.gallery_images) ? row.gallery_images : [],
    description: row.description || undefined,
    details: Array.isArray(row.details) ? row.details : undefined,
    variants: Array.isArray(row.variants) ? row.variants : [],
    totalStock: typeof row.total_stock === 'number' ? row.total_stock : undefined,
    collection: row.collection === 'featured' ? 'featured' : 'legacy',
  };
}

function mapSupabaseSettingsRow(row: any): Settings | null {
  if (!row) return null;
  const parsedRowTime = row.updated_at ? Date.parse(row.updated_at) : 0;
  const rowUpdatedAt = Number.isFinite(parsedRowTime) ? parsedRowTime : 0;

  if (row.raw_settings && typeof row.raw_settings === 'object') {
    const rawUrls = row.hero_video_urls ?? row.raw_settings.heroVideoUrls;
    const normalizedUrls = Array.isArray(rawUrls) ? normalizeHeroMediaList(rawUrls) : undefined;
    const rawSingle = row.hero_video_url ?? row.raw_settings.heroVideoUrl;
    const normalizedSingle = typeof rawSingle === 'string' ? normalizeMediaUrlInput(rawSingle) : rawSingle;
    const rawTimestamp = Number(row.raw_settings.settingsUpdatedAt) || 0;

    return {
      ...row.raw_settings,
      whatsappNumber: row.whatsapp_number ?? row.raw_settings.whatsappNumber ?? '',
      heroVideoUrl: normalizedUrls?.[0] || normalizedSingle,
      heroVideoUrls: normalizedUrls && normalizedUrls.length > 0 ? normalizedUrls : row.raw_settings.heroVideoUrls,
      settingsUpdatedAt: Math.max(rawTimestamp, rowUpdatedAt),
    } as Settings;
  }

  const normalizedUrls = Array.isArray(row.hero_video_urls)
    ? normalizeHeroMediaList(row.hero_video_urls)
    : undefined;
  const normalizedSingle = row.hero_video_url ? normalizeMediaUrlInput(row.hero_video_url) : undefined;

  return {
    brandName: row.brand_name || 'BROTHERHOOD',
    logoUrl: row.logo_url || undefined,
    heroImageUrl: row.hero_image_url || undefined,
    heroVideoUrl: normalizedUrls?.[0] || normalizedSingle || undefined,
    heroVideoUrls: normalizedUrls && normalizedUrls.length > 0 ? normalizedUrls : undefined,
    aboutUsTitle: row.about_us_title || undefined,
    aboutUsText: row.about_us_text || undefined,
    whatsappNumber: row.whatsapp_number || '',
    primaryColor: '#1A1815',
    backgroundColor: '#F8F7F3',
    heroHeadline: 'BrotherHood Collection',
    heroSubtitle: 'Full-Width Campaign Image / Video',
    featuredHeadline: 'Featured Collaboration',
    editorialHeadline: "Creator's Club Vol. 3",
    settingsUpdatedAt: rowUpdatedAt,
  };
}

function mapSupabaseCreatorRow(row: any): CreatorPost {
  return {
    id: row.id,
    creatorName: row.creator_name || '',
    handle: row.handle || '@brotherhood',
    avatarUrl: row.avatar_url || undefined,
    mediaUrl: row.media_url || '',
    isVideo: Boolean(row.is_video),
    socialLink: row.social_link || undefined,
    caption: row.caption || undefined,
    taggedProductIds: Array.isArray(row.tagged_product_ids) ? row.tagged_product_ids : [],
    featured: row.featured ?? true,
  };
}

function mapSupabaseGalleryRow(row: any): StudioGalleryState | null {
  if (!row) return null;
  if (row.raw_gallery && typeof row.raw_gallery === 'object') {
    return row.raw_gallery as StudioGalleryState;
  }
  return {
    layoutMode: row.layout_mode || 'all',
    titleLayout: row.title_layout || 'tile-corner',
    textAnimation: row.text_animation || 'fadeUp',
    kicker: row.kicker || '',
    headerTitle: row.header_title || '',
    headerDescription: row.header_description || '',
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function fetchSupabaseSettings(): Promise<Settings | null> {
  try {
    const { data, error } = await getSupabaseClient()
      .from('settings')
      .select('*')
      .eq('id', 'global')
      .maybeSingle();
    if (error || !data) return null;
    return mapSupabaseSettingsRow(data);
  } catch {
    return null;
  }
}

export async function fetchSupabaseProducts(): Promise<Product[] | null> {
  try {
    const { data, error } = await getSupabaseClient().from('products').select('*');
    if (error || !Array.isArray(data)) return null;
    return data.map(mapSupabaseProductRow);
  } catch {
    return null;
  }
}

export async function fetchSupabaseCreatorPosts(): Promise<CreatorPost[] | null> {
  try {
    const { data, error } = await getSupabaseClient().from('creators_club').select('*');
    if (error || !Array.isArray(data)) return null;
    return data.map(mapSupabaseCreatorRow);
  } catch {
    return null;
  }
}

export async function fetchSupabaseStudioGallery(): Promise<StudioGalleryState | null> {
  try {
    const { data, error } = await getSupabaseClient()
      .from('studio_gallery')
      .select('*')
      .eq('id', 'config')
      .maybeSingle();
    if (error || !data) return null;
    return mapSupabaseGalleryRow(data);
  } catch {
    return null;
  }
}

export async function fetchSupabaseData(): Promise<{
  products: Product[] | null;
  settings: Settings | null;
  creatorPosts: CreatorPost[] | null;
  studioGallery: StudioGalleryState | null;
}> {
  try {
    const [products, settings, creatorPosts, studioGallery] = await Promise.all([
      fetchSupabaseProducts(),
      fetchSupabaseSettings(),
      fetchSupabaseCreatorPosts(),
      fetchSupabaseStudioGallery(),
    ]);

    return {
      products,
      settings,
      creatorPosts,
      studioGallery,
    };
  } catch (err) {
    console.warn('Supabase fetch notice:', err);
    return { products: null, settings: null, creatorPosts: null, studioGallery: null };
  }
}

export function subscribeStudioGalleryRealtime(
  listener: (gallery: StudioGalleryState) => void
): () => void {
  galleryUpdateSubscribers.add(listener);
  return () => {
    galleryUpdateSubscribers.delete(listener);
  };
}

export interface SupabaseRealtimeCallbacks {
  onSettings: (settings: Settings) => void;
  onProducts: (products: Product[]) => void;
  onCreators: (posts: CreatorPost[]) => void;
  onGallery?: (gallery: StudioGalleryState) => void;
  onReconnected?: () => void;
}

/**
 * Establishes persistent dual-mode Supabase Realtime sync (Broadcast + postgres_changes),
 * automatically reconnecting on Supabase config changes, network recovery, or tab wakeups.
 */
export function subscribeToSupabaseRealtime(callbacks: SupabaseRealtimeCallbacks): () => void {
  let disposed = false;
  let currentChannel: RealtimeChannel | null = null;
  let currentClient = getSupabaseClient();
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const notifyGalleryListeners = (gallery: StudioGalleryState) => {
    callbacks.onGallery?.(gallery);
    galleryUpdateSubscribers.forEach((fn) => {
      try {
        fn(gallery);
      } catch {
        // Ignore subscriber error
      }
    });
  };

  const pullFreshAll = async () => {
    if (disposed) return;
    const supa = await fetchSupabaseData();
    if (disposed) return;
    if (supa.settings) callbacks.onSettings(supa.settings);
    if (supa.products) callbacks.onProducts(supa.products);
    if (supa.creatorPosts) callbacks.onCreators(supa.creatorPosts);
    if (supa.studioGallery) notifyGalleryListeners(supa.studioGallery);
  };

  const cleanupChannel = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (currentChannel) {
      if (activeLiveChannel === currentChannel) {
        activeLiveChannel = null;
        activeLiveClientRef = null;
      }
      currentClient.removeChannel(currentChannel).catch(() => {});
      currentChannel = null;
    }
  };

  const attachChannel = () => {
    if (disposed) return;
    cleanupChannel();
    currentClient = getSupabaseClient();

    const channel = currentClient
      .channel('brotherhood-live-sync', {
        config: {
          broadcast: { self: false },
        },
      })
      // 1. Instant Broadcast listeners (works on all Supabase projects even without publication SQL)
      .on('broadcast', { event: 'settings_sync' }, async ({ payload }) => {
        if (disposed || payload?.originId === REALTIME_TAB_ID) return;
        if (payload?.data && typeof payload.data === 'object') {
          callbacks.onSettings(payload.data as Settings);
          return;
        }
        const fresh = await fetchSupabaseSettings();
        if (!disposed && fresh) callbacks.onSettings(fresh);
      })
      .on('broadcast', { event: 'products_sync' }, async ({ payload }) => {
        if (disposed || payload?.originId === REALTIME_TAB_ID) return;
        if (Array.isArray(payload?.data)) {
          callbacks.onProducts(payload.data as Product[]);
          return;
        }
        const fresh = await fetchSupabaseProducts();
        if (!disposed && fresh) callbacks.onProducts(fresh);
      })
      .on('broadcast', { event: 'creators_sync' }, async ({ payload }) => {
        if (disposed || payload?.originId === REALTIME_TAB_ID) return;
        if (Array.isArray(payload?.data)) {
          callbacks.onCreators(payload.data as CreatorPost[]);
          return;
        }
        const fresh = await fetchSupabaseCreatorPosts();
        if (!disposed && fresh) callbacks.onCreators(fresh);
      })
      .on('broadcast', { event: 'studio_gallery_sync' }, async ({ payload }) => {
        if (disposed || payload?.originId === REALTIME_TAB_ID) return;
        if (payload?.data && typeof payload.data === 'object') {
          notifyGalleryListeners(payload.data as StudioGalleryState);
          return;
        }
        const fresh = await fetchSupabaseStudioGallery();
        if (!disposed && fresh) notifyGalleryListeners(fresh);
      })
      .on('broadcast', { event: 'full_sync' }, async ({ payload }) => {
        if (disposed || payload?.originId === REALTIME_TAB_ID) return;
        const bundle = payload?.data as
          | {
              settings?: Settings;
              studioGallery?: StudioGalleryState;
              products?: Product[];
              creatorPosts?: CreatorPost[];
            }
          | undefined;
        if (bundle && typeof bundle === 'object') {
          if (bundle.settings) callbacks.onSettings(bundle.settings);
          if (bundle.studioGallery) notifyGalleryListeners(bundle.studioGallery);
          if (Array.isArray(bundle.products)) callbacks.onProducts(bundle.products);
          if (Array.isArray(bundle.creatorPosts)) callbacks.onCreators(bundle.creatorPosts);
        } else {
          await pullFreshAll();
        }
      })
      // 2. Database row-level postgres_changes listeners
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, async (payload) => {
        if (disposed) return;
        if (payload.new && typeof payload.new === 'object') {
          const mapped = mapSupabaseSettingsRow(payload.new);
          if (mapped) {
            callbacks.onSettings(mapped);
            return;
          }
        }
        const fresh = await fetchSupabaseSettings();
        if (!disposed && fresh) callbacks.onSettings(fresh);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async () => {
        if (disposed) return;
        const fresh = await fetchSupabaseProducts();
        if (!disposed && fresh) callbacks.onProducts(fresh);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'creators_club' }, async () => {
        if (disposed) return;
        const fresh = await fetchSupabaseCreatorPosts();
        if (!disposed && fresh) callbacks.onCreators(fresh);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'studio_gallery' }, async (payload) => {
        if (disposed) return;
        if (payload.new && typeof payload.new === 'object') {
          const mapped = mapSupabaseGalleryRow(payload.new);
          if (mapped) {
            notifyGalleryListeners(mapped);
            return;
          }
        }
        const fresh = await fetchSupabaseStudioGallery();
        if (!disposed && fresh) notifyGalleryListeners(fresh);
      })
      .subscribe((status) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          callbacks.onReconnected?.();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              if (!disposed) {
                attachChannel();
                void pullFreshAll();
              }
            }, 4000);
          }
        }
      });

    currentChannel = channel;
    activeLiveChannel = channel;
    activeLiveClientRef = currentClient;
  };

  attachChannel();

  // Instant cross-page / multi-tab synchronization in the same browser
  let localBroadcastChannel: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      localBroadcastChannel = new BroadcastChannel(BROWSER_CHANNEL_NAME);
      localBroadcastChannel.onmessage = (event) => {
        if (disposed) return;
        const { topic, payload } = (event.data || {}) as {
          topic?: BroadcastTopic;
          payload?: { originId?: string; data?: unknown };
        };
        if (!topic || !payload || payload.originId === REALTIME_TAB_ID) return;
        if (topic === 'settings_sync' && payload.data && typeof payload.data === 'object') {
          callbacks.onSettings(payload.data as Settings);
        } else if (topic === 'products_sync' && Array.isArray(payload.data)) {
          callbacks.onProducts(payload.data as Product[]);
        } else if (topic === 'creators_sync' && Array.isArray(payload.data)) {
          callbacks.onCreators(payload.data as CreatorPost[]);
        } else if (topic === 'studio_gallery_sync' && payload.data && typeof payload.data === 'object') {
          notifyGalleryListeners(payload.data as StudioGalleryState);
        } else if (topic === 'full_sync' && payload.data && typeof payload.data === 'object') {
          const bundle = payload.data as {
            settings?: Settings;
            studioGallery?: StudioGalleryState;
            products?: Product[];
            creatorPosts?: CreatorPost[];
          };
          if (bundle.settings) callbacks.onSettings(bundle.settings);
          if (bundle.studioGallery) notifyGalleryListeners(bundle.studioGallery);
          if (Array.isArray(bundle.products)) callbacks.onProducts(bundle.products);
          if (Array.isArray(bundle.creatorPosts)) callbacks.onCreators(bundle.creatorPosts);
        }
      };
    } catch {
      localBroadcastChannel = null;
    }
  }

  const unsubscribeConfig = onSupabaseConfigChange(() => {
    if (disposed) return;
    attachChannel();
    void pullFreshAll();
  });

  const handleVisibilityOrOnline = () => {
    if (disposed) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void pullFreshAll();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleVisibilityOrOnline);
    window.addEventListener('focus', handleVisibilityOrOnline);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityOrOnline);
  }

  return () => {
    disposed = true;
    unsubscribeConfig();
    if (localBroadcastChannel) {
      try {
        localBroadcastChannel.close();
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleVisibilityOrOnline);
      window.removeEventListener('focus', handleVisibilityOrOnline);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityOrOnline);
    }
    cleanupChannel();
  };
}

export interface ForceSyncResult {
  settingsSynced: boolean;
  gallerySynced: boolean;
  productsSynced: number;
  creatorsSynced: number;
  broadcastSent: boolean;
  missingTables: string[];
  errorMessage?: string;
}

export async function forceSyncAllToSupabase(payload: {
  products?: Product[];
  settings?: Settings;
  creatorPosts?: CreatorPost[];
  studioGallery?: StudioGalleryState;
}): Promise<ForceSyncResult> {
  const missingTables: string[] = [];
  let settingsSynced = false;
  let gallerySynced = false;
  let productsSynced = 0;
  let creatorsSynced = 0;
  let errorMessage: string | undefined;

  if (payload.settings) {
    settingsSynced = await syncSettingsToSupabase(payload.settings);
    if (!settingsSynced) missingTables.push('settings');
  }
  if (payload.studioGallery) {
    gallerySynced = await syncStudioGalleryToSupabase(payload.studioGallery);
    if (!gallerySynced) missingTables.push('studio_gallery');
  }
  if (payload.products && payload.products.length > 0) {
    const results = await Promise.all(
      payload.products.filter((p) => Boolean(p.id)).map((p) => syncProductToSupabase(p))
    );
    productsSynced = results.filter(Boolean).length;
    if (results.length > 0 && productsSynced === 0) missingTables.push('products');
  }
  if (payload.creatorPosts && payload.creatorPosts.length > 0) {
    const results = await Promise.all(
      payload.creatorPosts.filter((cp) => Boolean(cp.id)).map((cp) => syncCreatorPostToSupabase(cp))
    );
    creatorsSynced = results.filter(Boolean).length;
    if (results.length > 0 && creatorsSynced === 0) missingTables.push('creators_club');
  }

  // Emit full live sync packet across all connected devices & browser pages/tabs
  const [broadcastOk] = await Promise.all([
    emitRealtimeBroadcast('full_sync', {
      settings: payload.settings,
      studioGallery: payload.studioGallery,
      products: payload.products,
      creatorPosts: payload.creatorPosts,
    }),
    payload.products ? emitRealtimeBroadcast('products_sync', payload.products) : Promise.resolve(true),
    payload.creatorPosts ? emitRealtimeBroadcast('creators_sync', payload.creatorPosts) : Promise.resolve(true),
  ]);

  if (missingTables.length > 0) {
    errorMessage = `Supabase table(s) not initialized yet: ${missingTables.join(', ')}. Live Realtime Broadcast sent; run supabase_schema.sql in Supabase SQL Editor for database table persistence.`;
  }

  return {
    settingsSynced,
    gallerySynced,
    productsSynced,
    creatorsSynced,
    broadcastSent: broadcastOk,
    missingTables,
    errorMessage,
  };
}

export async function syncAllToSupabase(payload: {
  products?: Product[];
  settings?: Settings;
  creatorPosts?: CreatorPost[];
  studioGallery?: StudioGalleryState;
}) {
  await forceSyncAllToSupabase(payload);
}
