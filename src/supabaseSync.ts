import {
  getSupabaseClient,
  getSupabaseConfig,
  extractSupabaseProjectId,
} from './supabase';
import { Product, Settings, CreatorPost, StudioGalleryState } from './types';
import { compressImageForCrossDevice } from './utils';

export interface MediaUploadResult {
  url: string;
  source: 'supabase' | 'server' | 'inline' | 'external';
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
const CHUNK_UPLOAD_THRESHOLD = 3 * 1024 * 1024; // 3MB
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

    const bucketMissing =
      isBucketNotFoundError(bucketJson || bucketBody) ||
      isBucketNotFoundError(publicProbeJson || publicProbeBody);

    if (bucketMissing) {
      const handled = handleSupabaseStorageBucketError(
        bucketJson || publicProbeJson || 'Bucket not found',
        'Admin Settings Storage Diagnostics',
        activeBucket,
        configuredProjectId
      );
      bucketNotFound = true;
      bucketExists = false;
      cachedBucketStatus = { exists: false, checkedAt: Date.now(), lastError: handled.rawMessage };
      errorMessage = handled.detail;
      log('error', 'BUCKET_NOT_FOUND', handled.detail);
    } else {
      const { error: listError } = await getSupabaseClient().storage
        .from(activeBucket)
        .list('', { limit: 5 });

      if (listError && isBucketNotFoundError(listError)) {
        const handled = handleSupabaseStorageBucketError(
          listError,
          'Admin Settings Storage Diagnostics',
          activeBucket,
          configuredProjectId
        );
        bucketNotFound = true;
        bucketExists = false;
        cachedBucketStatus = { exists: false, checkedAt: Date.now(), lastError: handled.rawMessage };
        errorMessage = handled.detail;
        log('error', 'BUCKET_NOT_FOUND', handled.detail);
      } else {
        bucketExists = true;
        bucketNotFound = false;
        storageReachable = true;
        cachedBucketStatus = { exists: true, checkedAt: Date.now() };
        log(
          'success',
          'BUCKET_PROBE',
          `Bucket "${activeBucket}" exists and is reachable (public: ${
            bucketJson?.public ?? 'verified'
          }).`
        );
      }
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


async function hasSupabaseMediaBucket(): Promise<{ exists: boolean; bucketNotFound: boolean; lastError?: string }> {
  const now = Date.now();
  const cfg = getSupabaseConfig();
  if (cachedBucketStatus && (cachedBucketStatus.exists || now - cachedBucketStatus.checkedAt < 15_000)) {
    return {
      exists: cachedBucketStatus.exists,
      bucketNotFound: !cachedBucketStatus.exists && isBucketNotFoundError(cachedBucketStatus.lastError),
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
      return { exists: true, bucketNotFound: false };
    }
    const text = await resp.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep raw text
    }
    const handled = handleSupabaseStorageBucketError(parsed, 'Hero Media Upload Preflight');
    if (handled.isBucketNotFound) {
      cachedBucketStatus = { exists: false, checkedAt: now, lastError: handled.rawMessage };
      return {
        exists: false,
        bucketNotFound: true,
        lastError: handled.detail,
      };
    }
    const pubResp = await fetch(
      `${cfg.url}/storage/v1/object/public/${encodeURIComponent(cfg.bucket)}/__health_probe__.txt`
    );
    const pubText = await pubResp.text();
    const pubMissing = isBucketNotFoundError(pubText);
    if (!pubMissing) {
      cachedBucketStatus = { exists: true, checkedAt: now };
      return { exists: true, bucketNotFound: false };
    }
    const pubHandled = handleSupabaseStorageBucketError(pubText, 'Hero Media Upload Preflight');
    cachedBucketStatus = { exists: false, checkedAt: now, lastError: pubHandled.rawMessage };
    return {
      exists: false,
      bucketNotFound: pubHandled.isBucketNotFound,
      lastError: pubHandled.detail,
    };
  } catch (err) {
    const handled = handleSupabaseStorageBucketError(err, 'Hero Media Upload Preflight');
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

    // 1. Check if configured Supabase bucket exists (0-byte preflight check)
    const cfg = getSupabaseConfig();
    const bucketProbe =
      blob.size <= SUPABASE_MAX_OBJECT_BYTES
        ? await hasSupabaseMediaBucket()
        : { exists: false, bucketNotFound: false };

    let bucketNotFoundNote = bucketProbe.bucketNotFound ? bucketProbe.lastError : undefined;

    if (bucketProbe.exists) {
      options?.onProgress?.(30);
      const client = getSupabaseClient();
      const { data, error } = await client.storage
        .from(cfg.bucket)
        .upload(filePath, blob, {
          contentType,
          upsert: true,
        });

      if (!error && data?.path) {
        const { data: publicUrlData } = client.storage
          .from(cfg.bucket)
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

    // 2. For videos (or any file when Supabase bucket is not configured):
    // Upload via chunked app media server (/api/upload-media-init -> chunks -> complete)
    if (isVideo) {
      const serverAttempt = await uploadToLocalMediaServer(
        blob,
        safeName,
        contentType,
        options?.onProgress
      );
      if (serverAttempt.url) {
        return {
          url: serverAttempt.url,
          source: 'server',
          ...(bucketNotFoundNote
            ? {
                errorCode: 'BUCKET_NOT_FOUND',
                needsBucketSetup: true,
                bucketDiagnosticNote: bucketNotFoundNote,
              }
            : {}),
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
    // or fall back to app media server if still large.
    if (isImage) {
      const compressed = await compressImageForCrossDevice(fileOrDataUrl, 155000);
      if (compressed && compressed.length <= 195000) {
        options?.onProgress?.(100);
        return {
          url: compressed,
          source: 'inline',
          ...(bucketNotFoundNote
            ? {
                errorCode: 'BUCKET_NOT_FOUND',
                needsBucketSetup: true,
                bucketDiagnosticNote: bucketNotFoundNote,
              }
            : {}),
        };
      }
      const serverAttempt = await uploadToLocalMediaServer(
        blob,
        safeName,
        contentType,
        options?.onProgress
      );
      if (serverAttempt.url) {
        return {
          url: serverAttempt.url,
          source: 'server',
          ...(bucketNotFoundNote
            ? {
                errorCode: 'BUCKET_NOT_FOUND',
                needsBucketSetup: true,
                bucketDiagnosticNote: bucketNotFoundNote,
              }
            : {}),
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
      return {
        url: serverAttempt.url,
        source: 'server',
        ...(bucketNotFoundNote
          ? {
              errorCode: 'BUCKET_NOT_FOUND',
              needsBucketSetup: true,
              bucketDiagnosticNote: bucketNotFoundNote,
            }
          : {}),
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
    if (error) {
      console.warn('Supabase product sync warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase product sync error:', err);
    return false;
  }
}

export async function deleteProductFromSupabase(productId: string): Promise<boolean> {
  try {
    const { error } = await getSupabaseClient().from('products').delete().eq('id', productId);
    if (error) {
      console.warn('Supabase product delete warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase product delete error:', err);
    return false;
  }
}

export async function syncSettingsToSupabase(settings: Settings): Promise<boolean> {
  try {
    const { error } = await getSupabaseClient().from('settings').upsert({
      id: 'global',
      brand_name: settings.brandName,
      logo_url: settings.logoUrl || null,
      hero_image_url: settings.heroImageUrl || null,
      hero_video_url: settings.heroVideoUrl || null,
      hero_video_urls: settings.heroVideoUrls || [],
      about_us_title: settings.aboutUsTitle || null,
      about_us_text: settings.aboutUsText || null,
      whatsapp_number: settings.whatsappNumber || '',
      raw_settings: settings,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.warn('Supabase settings sync warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase settings sync error:', err);
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
    if (error) {
      console.warn('Supabase creator post sync warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase creator post sync error:', err);
    return false;
  }
}

export async function deleteCreatorPostFromSupabase(postId: string): Promise<boolean> {
  try {
    const { error } = await getSupabaseClient().from('creators_club').delete().eq('id', postId);
    if (error) {
      console.warn('Supabase creator post delete warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase creator post delete error:', err);
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
    if (error) {
      console.warn('Supabase studio gallery sync warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase studio gallery sync error:', err);
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
  if (row.raw_settings && typeof row.raw_settings === 'object') {
    return {
      ...row.raw_settings,
      whatsappNumber: row.whatsapp_number ?? row.raw_settings.whatsappNumber ?? '',
      heroVideoUrl: row.hero_video_url ?? row.raw_settings.heroVideoUrl,
      heroVideoUrls: row.hero_video_urls ?? row.raw_settings.heroVideoUrls,
    } as Settings;
  }
  return {
    brandName: row.brand_name || 'BROTHERHOOD',
    logoUrl: row.logo_url || undefined,
    heroImageUrl: row.hero_image_url || undefined,
    heroVideoUrl: row.hero_video_url || undefined,
    heroVideoUrls: Array.isArray(row.hero_video_urls) ? row.hero_video_urls : undefined,
    aboutUsTitle: row.about_us_title || undefined,
    aboutUsText: row.about_us_text || undefined,
    whatsappNumber: row.whatsapp_number || '',
    primaryColor: '#1A1815',
    backgroundColor: '#F8F7F3',
    heroHeadline: 'BrotherHood Collection',
    heroSubtitle: 'Full-Width Campaign Image / Video',
    featuredHeadline: 'Featured Collaboration',
    editorialHeadline: "Creator's Club Vol. 3",
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

export async function fetchSupabaseData(): Promise<{
  products: Product[] | null;
  settings: Settings | null;
  creatorPosts: CreatorPost[] | null;
  studioGallery: StudioGalleryState | null;
}> {
  try {
    const [productsRes, settingsRes, creatorsRes, galleryRes] = await Promise.all([
      getSupabaseClient().from('products').select('*'),
      getSupabaseClient().from('settings').select('*').eq('id', 'global').maybeSingle(),
      getSupabaseClient().from('creators_club').select('*'),
      getSupabaseClient().from('studio_gallery').select('*').eq('id', 'config').maybeSingle(),
    ]);

    return {
      products:
        !productsRes.error && Array.isArray(productsRes.data)
          ? productsRes.data.map(mapSupabaseProductRow)
          : null,
      settings:
        !settingsRes.error && settingsRes.data ? mapSupabaseSettingsRow(settingsRes.data) : null,
      creatorPosts:
        !creatorsRes.error && Array.isArray(creatorsRes.data)
          ? creatorsRes.data.map(mapSupabaseCreatorRow)
          : null,
      studioGallery:
        !galleryRes.error && galleryRes.data ? mapSupabaseGalleryRow(galleryRes.data) : null,
    };
  } catch (err) {
    console.warn('Supabase fetch notice:', err);
    return { products: null, settings: null, creatorPosts: null, studioGallery: null };
  }
}

export async function syncAllToSupabase(payload: {
  products?: Product[];
  settings?: Settings;
  creatorPosts?: CreatorPost[];
  studioGallery?: StudioGalleryState;
}) {
  const tasks: Promise<unknown>[] = [];
  if (payload.settings) tasks.push(syncSettingsToSupabase(payload.settings));
  if (payload.studioGallery) tasks.push(syncStudioGalleryToSupabase(payload.studioGallery));
  if (payload.products) {
    for (const p of payload.products) {
      if (p.id) tasks.push(syncProductToSupabase(p));
    }
  }
  if (payload.creatorPosts) {
    for (const cp of payload.creatorPosts) {
      if (cp.id) tasks.push(syncCreatorPostToSupabase(cp));
    }
  }
  await Promise.allSettled(tasks);
}
