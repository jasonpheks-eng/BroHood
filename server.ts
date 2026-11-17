import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = process.cwd();
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // 150 MB
const CHUNK_LIMIT_BYTES = 4 * 1024 * 1024; // 4 MB chunks stay well under Cloud Run's 32 MiB limit

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Clean up abandoned partial uploads older than 2 hours
try {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const entry of fs.readdirSync(UPLOADS_DIR)) {
    if (entry.startsWith('.tmp_')) {
      const full = path.join(UPLOADS_DIR, entry);
      const st = fs.statSync(full);
      if (st.mtimeMs < cutoff) {
        fs.unlinkSync(full);
      }
    }
  }
} catch {
  // Ignore startup cleanup warnings
}

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.3gp': 'video/3gpp',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/x-m4v': '.m4v',
  'video/ogg': '.ogv',
  'video/3gpp': '.3gp',
  'video/x-matroska': '.mkv',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

function buildStoredFileName(rawName: string, contentType: string): string {
  const safeBase = path.basename(rawName || 'media').replace(/[^a-zA-Z0-9._-]/g, '_') || 'media';
  const normalizedType = String(contentType || '').split(';')[0].trim().toLowerCase();
  const existingExt = path.extname(safeBase).toLowerCase();
  const inferredExt = existingExt || EXT_BY_MIME[normalizedType] || '';
  const baseWithoutExt = existingExt ? safeBase.slice(0, -existingExt.length) : safeBase;
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${baseWithoutExt}${inferredExt}`;
}

function isSafeUploadId(uploadId: string): boolean {
  return /^[a-zA-Z0-9_-]{6,80}$/.test(uploadId);
}

async function startServer() {
  const app = express();

  // Universal CORS middleware for cross-origin iframes, preview domains, and mobile devices
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Single-request upload (fast path for files <= 4MB; also works up to 150MB locally)
  app.post(
    '/api/upload-media',
    express.raw({
      type: '*/*',
      limit: '150mb',
    }),
    (req: Request, res: Response) => {
      try {
        const body = req.body;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          res.status(400).json({ error: 'No media payload received.' });
          return;
        }

        const rawNameHeader = req.headers['x-file-name'];
        const rawName = typeof rawNameHeader === 'string' ? decodeURIComponent(rawNameHeader) : 'media';
        const contentType = String(req.headers['content-type'] || '');
        const fileName = buildStoredFileName(rawName, contentType);

        const targetPath = path.join(UPLOADS_DIR, fileName);
        fs.writeFileSync(targetPath, body);

        res.json({ url: `/uploads/${fileName}` });
      } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Failed to store uploaded media.' });
      }
    }
  );

  // Lightweight health endpoint for admin upload diagnostics
  app.get('/api/upload-media-health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      maxUploadBytes: MAX_UPLOAD_BYTES,
      chunkLimitBytes: CHUNK_LIMIT_BYTES,
    });
  });

  // Resolve an idb:// file name to an existing server upload file if present
  app.get('/api/resolve-idb', (req: Request, res: Response) => {
    try {
      const rawName = String(req.query.name || req.query.key || '').trim();
      if (!rawName) {
        res.status(400).json({ error: 'Missing name or key' });
        return;
      }
      const safeSearch = path.basename(rawName).replace(/^idb:\/\/(vid|img)_\d+_/, '').toLowerCase();
      if (!safeSearch) {
        res.status(404).json({ error: 'No matching file' });
        return;
      }
      const files = fs.readdirSync(UPLOADS_DIR);
      const matched = files.find((f) => !f.startsWith('.tmp_') && f.toLowerCase().includes(safeSearch));
      if (matched) {
        res.json({ url: `/uploads/${matched}` });
        return;
      }
      res.status(404).json({ error: 'Not found on server' });
    } catch {
      res.status(500).json({ error: 'Failed to search uploads' });
    }
  });

  // Chunked upload Step 1: Initialize session (bypasses Cloud Run 32 MiB single-request body limit)
  app.post('/api/upload-media-init', express.json({ limit: '32kb' }), (req: Request, res: Response) => {
    try {
      const rawName = typeof req.body?.fileName === 'string' ? req.body.fileName : 'media.mp4';
      const contentType = typeof req.body?.contentType === 'string' ? req.body.contentType : 'video/mp4';
      const totalBytes = Number(req.body?.totalBytes) || 0;

      if (totalBytes > MAX_UPLOAD_BYTES) {
        res.status(413).json({ error: 'File exceeds the 150MB maximum upload size.' });
        return;
      }

      const uploadId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const finalFileName = buildStoredFileName(rawName, contentType);
      const partPath = path.join(UPLOADS_DIR, `.tmp_${uploadId}.part`);
      const metaPath = path.join(UPLOADS_DIR, `.tmp_${uploadId}.meta.json`);

      fs.writeFileSync(partPath, Buffer.alloc(0));
      fs.writeFileSync(
        metaPath,
        JSON.stringify({ finalFileName, totalBytes, createdAt: Date.now() }),
        'utf8'
      );

      res.json({
        uploadId,
        chunkBytes: CHUNK_LIMIT_BYTES,
        maxUploadBytes: MAX_UPLOAD_BYTES,
      });
    } catch (err) {
      console.error('Chunk init error:', err);
      res.status(500).json({ error: 'Failed to initialize media upload.' });
    }
  });

  // Chunked upload Step 2: Receive binary slice at byte offset
  app.post(
    '/api/upload-media-chunk',
    express.raw({
      type: '*/*',
      limit: '10mb',
    }),
    async (req: Request, res: Response) => {
      try {
        const uploadId = String(req.headers['x-upload-id'] || '');
        const offsetHeader = req.headers['x-chunk-offset'];
        const offset = Number(offsetHeader);

        if (!isSafeUploadId(uploadId) || !Number.isFinite(offset) || offset < 0) {
          res.status(400).json({ error: 'Invalid upload session or chunk offset.' });
          return;
        }

        const body = req.body;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          res.status(400).json({ error: 'Empty media chunk received.' });
          return;
        }

        if (offset + body.length > MAX_UPLOAD_BYTES) {
          res.status(413).json({ error: 'Upload exceeds 150MB limit.' });
          return;
        }

        const partPath = path.join(UPLOADS_DIR, `.tmp_${uploadId}.part`);
        if (!fs.existsSync(partPath)) {
          res.status(404).json({ error: 'Upload session not found or expired.' });
          return;
        }

        const handle = await fs.promises.open(partPath, 'r+');
        try {
          await handle.write(body, 0, body.length, offset);
        } finally {
          await handle.close();
        }

        res.json({ ok: true, received: body.length, offset });
      } catch (err) {
        console.error('Chunk write error:', err);
        res.status(500).json({ error: 'Failed to write media chunk.' });
      }
    }
  );

  // Chunked upload Step 3: Finalize temp file into playable /uploads/:filename
  app.post('/api/upload-media-complete', express.json({ limit: '16kb' }), (req: Request, res: Response) => {
    try {
      const uploadId = String(req.body?.uploadId || '');
      if (!isSafeUploadId(uploadId)) {
        res.status(400).json({ error: 'Invalid uploadId.' });
        return;
      }

      const partPath = path.join(UPLOADS_DIR, `.tmp_${uploadId}.part`);
      const metaPath = path.join(UPLOADS_DIR, `.tmp_${uploadId}.meta.json`);
      if (!fs.existsSync(partPath) || !fs.existsSync(metaPath)) {
        res.status(404).json({ error: 'Upload session not found.' });
        return;
      }

      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { finalFileName: string };
      const finalName = path.basename(meta.finalFileName);
      const finalPath = path.join(UPLOADS_DIR, finalName);

      fs.renameSync(partPath, finalPath);
      fs.unlinkSync(metaPath);

      res.json({ url: `/uploads/${finalName}` });
    } catch (err) {
      console.error('Chunk complete error:', err);
      res.status(500).json({ error: 'Failed to finalize uploaded media.' });
    }
  });

  app.get('/uploads/:filename', (req: Request, res: Response) => {
    const safeName = path.basename(String(req.params.filename || ''));
    if (!safeName || safeName.startsWith('.tmp_')) {
      res.status(404).end('Media not found');
      return;
    }

    let filePath = path.join(UPLOADS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      // 1. Fallback: match by stripped base name in UPLOADS_DIR
      const stripped = safeName.replace(/^\d+_[a-z0-9]+_/, '').toLowerCase();
      const files = fs.readdirSync(UPLOADS_DIR);
      const matched = files.find(
        (f) => !f.startsWith('.tmp_') && f.toLowerCase().includes(stripped)
      );
      if (matched) {
        filePath = path.join(UPLOADS_DIR, matched);
      } else {
        // 2. Fallback: check public/assets/aistudio
        const publicMatch = path.join(ROOT_DIR, 'public', 'assets', 'aistudio', safeName);
        if (fs.existsSync(publicMatch)) {
          filePath = publicMatch;
        } else {
          res.status(404).end('Media not found');
          return;
        }
      }
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const ext = path.extname(safeName).toLowerCase();
    const ua = String(req.headers['user-agent'] || '');
    const isAppleSafari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|Android/i.test(ua);
    const contentType =
      ext === '.mov' && !isAppleSafari
        ? 'video/mp4'
        : MIME_BY_EXT[ext] || 'application/octet-stream';
    const range = req.headers.range;

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (Number.isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  });

  const isDev =
    process.argv.includes('--dev') ||
    (process.env.NODE_ENV !== 'production' && !fs.existsSync(path.join(DIST_DIR, 'index.html')));

  if (isDev) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(DIST_DIR));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
