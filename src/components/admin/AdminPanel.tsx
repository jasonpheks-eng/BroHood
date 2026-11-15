import React, { useState } from 'react';
import {
  Plus,
  Minus,
  Edit2,
  Trash2,
  ArrowLeft,
  Save,
  Upload,
  Video,
  Check,
  Copy,
  AlertTriangle,
  X,
  SlidersHorizontal,
  Image as ImageIcon,
  MessageCircle,
  Link2,
  ClipboardPaste,
  Lock,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Terminal,
  RefreshCw,
  KeyRound,
  Eye,
  EyeOff,
  Database,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import {
  Product,
  Settings,
  ProductVariant,
  CreatorPost,
  GalleryLayoutMode,
  GalleryTitleLayout,
  GalleryTextAnimation,
  SocialLinkItem,
} from '../../types';
import { formatPrice, getDefaultSocialLinks, formatWhatsAppDigits, compressImageForCrossDevice } from '../../utils';
import {
  uploadMediaToSupabase,
  detectIsVideoFile,
  runSupabaseStorageDiagnostics,
  verifySupabaseApiConnection,
  traceUploadAttempt,
  resetSupabaseBucketCache,
  SupabaseStorageDiagnosticReport,
  SupabaseDiagnosticLogEntry,
  SupabaseConnectionVerification,
  UploadRequestTraceResult,
} from '../../supabaseSync';
import {
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_BUCKET,
  extractSupabaseProjectId,
  getSupabaseConfig,
  updateSupabaseConfig,
  sanitizePastedSupabaseUrl,
  sanitizePastedCredential,
  sanitizePastedBucketName,
  isSecretSupabaseKey,
} from '../../supabase';
import { ResolvedImage, ResolvedVideo } from '../common/ResolvedMedia';
import { StudioGalleryAdmin } from '../gallery/StudioGalleryAdmin';
import { useStudioGalleryState } from '../../hooks/useStudioGalleryState';
import { Helmet } from '../common/Helmet';

interface AdminPanelProps {
  products: Product[];
  settings: Settings;
  creatorPosts?: CreatorPost[];
  onSaveProduct: (product: Product) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
  onSaveSettings: (settings: Settings) => Promise<void>;
  onSaveWhatsappNumber?: (whatsappNumber: string) => Promise<void>;
  onSaveApiKeys?: (keys: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    supabaseBucket: string;
  }) => Promise<void>;
  onSaveCreatorPost?: (post: CreatorPost) => Promise<void>;
  onDeleteCreatorPost?: (postId: string) => Promise<void>;
  onBackToStore: () => void;
}

const ALL_SIZES: ProductVariant['size'][] = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'OS'];
const STANDARD_CATEGORIES = [
  'SHIRTS',
  'HOODIES',
  'CAPS',
  'LONG SLEEVES',
  'PANTS',
  'SHORTS',
  'JACKETS',
  'ACCESSORIES',
];

export const AdminPanel: React.FC<AdminPanelProps> = ({
  products,
  settings,
  creatorPosts = [],
  onSaveProduct,
  onDeleteProduct,
  onSaveSettings,
  onSaveWhatsappNumber,
  onSaveApiKeys,
  onSaveCreatorPost,
  onDeleteCreatorPost,
  onBackToStore,
}) => {
  const [activeTab, setActiveTab] = useState<'products' | 'gallery' | 'settings' | 'api-keys' | 'creators'>('products');
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [formProduct, setFormProduct] = useState<Partial<Product>>({});
  const [formSettings, setRawFormSettings] = useState<Settings>({ ...settings });
  const [isSettingsDirty, setIsSettingsDirty] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [uploadingHeroMedia, setUploadingHeroMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [heroUploadError, setHeroUploadError] = useState<string | null>(null);
  const [heroNeedsBucketSql, setHeroNeedsBucketSql] = useState(false);
  const initialSupabaseCfg = React.useMemo(() => getSupabaseConfig(), []);
  const [bucketNotFoundDetail, setBucketNotFoundDetail] = useState<string | null>(null);
  const [expectedProjectId, setExpectedProjectId] = useState<string>(initialSupabaseCfg.projectId);
  const [showSupabaseAnonKey, setShowSupabaseAnonKey] = useState(false);
  const [savingSupabaseKeys, setSavingSupabaseKeys] = useState(false);
  const [verifyingSupabaseKeys, setVerifyingSupabaseKeys] = useState(false);
  const [apiKeyProtectionError, setApiKeyProtectionError] = useState<string | null>(null);
  const [apiVerificationResult, setApiVerificationResult] = useState<SupabaseConnectionVerification | null>(null);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [storageDiagReport, setStorageDiagReport] = useState<SupabaseStorageDiagnosticReport | null>(null);
  const [storageDiagLogs, setStorageDiagLogs] = useState<SupabaseDiagnosticLogEntry[]>([]);
  const [tracingUpload, setTracingUpload] = useState(false);
  const [uploadTraces, setUploadTraces] = useState<UploadRequestTraceResult[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleTraceUpload = async () => {
    setTracingUpload(true);
    try {
      const traces = await traceUploadAttempt();
      setUploadTraces(traces);
      showToast(`Captured ${traces.length} upload request trace paths & response headers`);
    } catch (err) {
      console.error('Upload trace failed:', err);
      showToast('Failed to trace upload request paths');
    } finally {
      setTracingUpload(false);
    }
  };

  const setFormSettings = React.useCallback(
    (next: Settings | ((prev: Settings) => Settings)) => {
      setIsSettingsDirty(true);
      setRawFormSettings(next);
    },
    []
  );

  const settingsRef = React.useRef(settings);
  React.useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const lastSavedWhatsappRef = React.useRef((settings.whatsappNumber || '').trim());

  const { galleryState, onSave: saveGalleryState } = useStudioGalleryState('brotherhood_studio_gallery_v1', {
    cloudState: settings.studioGallery,
    onSave: async (nextGallery) => {
      const updatedSettings: Settings = { ...settingsRef.current, studioGallery: nextGallery };
      setRawFormSettings(updatedSettings);
      setIsSettingsDirty(false);
      await onSaveSettings(updatedSettings);
    },
  });

  // Creators Club Admin State
  const [isEditingCreatorPost, setIsEditingCreatorPost] = useState(false);
  const [formCreatorPost, setFormCreatorPost] = useState<Partial<CreatorPost>>({});
  const [savingCreatorPost, setSavingCreatorPost] = useState(false);
  const [creatorPostToDelete, setCreatorPostToDelete] = useState<CreatorPost | null>(null);

  // In-app Delete Confirmation State (No window.confirm!)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync formSettings when settings prop changes only when there are no pending unsaved edits
  React.useEffect(() => {
    if (!isSettingsDirty) {
      setRawFormSettings({ ...settings });
      lastSavedWhatsappRef.current = (settings.whatsappNumber || '').trim();
    }
  }, [settings, isSettingsDirty]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const persistWhatsappNumber = React.useCallback(
    async (rawNumber: string, showSuccessToast = false) => {
      const clean = (rawNumber || '').trim();
      setSavingWhatsapp(true);
      try {
        if (onSaveWhatsappNumber) {
          await onSaveWhatsappNumber(clean);
        } else {
          await onSaveSettings({ ...settingsRef.current, whatsappNumber: clean });
        }
        lastSavedWhatsappRef.current = clean;
        if (showSuccessToast) {
          showToast(
            clean
              ? 'WhatsApp checkout number saved & synced!'
              : 'WhatsApp checkout number cleared.'
          );
        }
      } catch (err) {
        console.error('Failed to persist WhatsApp number:', err);
        if (showSuccessToast) {
          showToast('Failed to save WhatsApp number.');
        }
      } finally {
        setSavingWhatsapp(false);
      }
    },
    [onSaveWhatsappNumber, onSaveSettings]
  );

  // Auto-save WhatsApp checkout number 500ms after typing stops so changing tabs or leaving Admin never loses it
  React.useEffect(() => {
    const cleanDraft = (formSettings.whatsappNumber || '').trim();
    if (cleanDraft === lastSavedWhatsappRef.current) return;
    const timer = setTimeout(() => {
      void persistWhatsappNumber(cleanDraft, false);
    }, 500);
    return () => clearTimeout(timer);
  }, [formSettings.whatsappNumber, persistWhatsappNumber]);

  const handleBackToStoreWithFlush = async () => {
    const cleanDraft = (formSettings.whatsappNumber || '').trim();
    if (cleanDraft !== lastSavedWhatsappRef.current) {
      await persistWhatsappNumber(cleanDraft, false);
    }
    onBackToStore();
  };

  // Product Add / Edit
  const handleOpenAddProduct = () => {
    setFormProduct({
      name: '',
      category: 'SHIRTS',
      price: 120,
      imageColor: '#F8F7F3',
      imageUrl: '',
      galleryImages: [],
      collection: 'legacy',
      variants: [
        { size: 'S', stock: 10 },
        { size: 'M', stock: 15 },
        { size: 'L', stock: 12 },
        { size: 'XL', stock: 6 },
      ],
      totalStock: 43,
    });
    setIsEditingProduct(true);
  };

  const handleOpenEditProduct = (p: Product) => {
    setFormProduct({
      ...p,
      galleryImages: p.galleryImages || [],
      variants:
        p.variants && p.variants.length > 0
          ? p.variants
          : [
              { size: 'S', stock: 10 },
              { size: 'M', stock: 15 },
              { size: 'L', stock: 12 },
              { size: 'XL', stock: 6 },
            ],
    });
    setIsEditingProduct(true);
  };

  // Duplicate product to quickly create new entries
  const handleDuplicateProduct = async (p: Product) => {
    const { id, ...data } = p;
    const duplicated: Product = {
      ...data,
      name: `${p.name} (Copy)`,
      totalStock: p.totalStock ?? 20,
    };
    try {
      await onSaveProduct(duplicated);
      showToast(`Duplicated "${p.name}" into catalog`);
    } catch (err) {
      console.error('Failed to duplicate product', err);
      showToast('Failed to duplicate garment.');
    }
  };

  // Execute in-app delete
  const handleConfirmDelete = async () => {
    if (!productToDelete || !productToDelete.id) return;
    setIsDeleting(true);
    try {
      const name = productToDelete.name;
      await onDeleteProduct(productToDelete.id);
      setProductToDelete(null);
      showToast(`Removed "${name}" from catalog`);
    } catch (err) {
      console.error('Failed to delete product', err);
      showToast('Failed to delete garment. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const appendDiagnosticLog = React.useCallback(
    (level: SupabaseDiagnosticLogEntry['level'], step: string, message: string) => {
      setStorageDiagLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toLocaleTimeString(),
          level,
          step,
          message,
        },
      ]);
    },
    []
  );

  const activeSupabaseCfg = getSupabaseConfig();
  const activeProjectId = activeSupabaseCfg.projectId;
  const activeBucketName = activeSupabaseCfg.bucket;
  const activeSupabaseUrl = activeSupabaseCfg.url;

  const handleRunStorageDiagnostics = React.useCallback(async (overrideExpectedProjectId?: string) => {
    setRunningDiagnostics(true);
    try {
      const targetExpectedId = (overrideExpectedProjectId ?? expectedProjectId).trim();
      const report = await runSupabaseStorageDiagnostics(targetExpectedId);
      setStorageDiagReport(report);
      setStorageDiagLogs(report.logs);
      if (report.bucketNotFound) {
        setBucketNotFoundDetail(
          report.errorMessage ||
            `Bucket Not Found: "${report.bucketName}" does not exist on Supabase project "${report.configuredProjectId}".`
        );
        setHeroNeedsBucketSql(true);
        showToast('Bucket Not Found on Supabase Storage');
      } else if (!report.projectIdMatches) {
        setBucketNotFoundDetail(null);
        showToast('Supabase Project ID mismatch detected');
      } else if (report.bucketExists) {
        setBucketNotFoundDetail(null);
        setHeroNeedsBucketSql(false);
        showToast(`Supabase bucket "${report.bucketName}" connected & verified`);
      } else {
        showToast('Diagnostics completed with warnings');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendDiagnosticLog('error', 'DIAGNOSTIC_ERROR', msg);
      showToast('Failed to run Supabase Storage diagnostics');
    } finally {
      setRunningDiagnostics(false);
    }
  }, [expectedProjectId, appendDiagnosticLog]);

  const handleVerifySupabaseKeys = async () => {
    const rawUrl = sanitizePastedSupabaseUrl(formSettings.supabaseUrl ?? activeSupabaseUrl);
    const rawKey = sanitizePastedCredential(formSettings.supabaseAnonKey ?? activeSupabaseCfg.anonKey);
    const rawBucket = sanitizePastedBucketName(formSettings.supabaseBucket ?? activeBucketName);

    const nextUrl = rawUrl || DEFAULT_SUPABASE_URL;
    const nextKey = rawKey || DEFAULT_SUPABASE_ANON_KEY;
    const nextBucket = rawBucket || DEFAULT_SUPABASE_BUCKET;

    const secretCheck = isSecretSupabaseKey(nextKey);
    if (secretCheck.isSecret) {
      setApiKeyProtectionError(secretCheck.reason || 'Secret Supabase key blocked.');
      showToast('Copy-paste protection: secret key blocked');
      return;
    }
    if (!/^https:\/\/[a-z0-9.-]+/i.test(nextUrl)) {
      setApiKeyProtectionError('Supabase Project URL must start with https:// (e.g. https://xyz.supabase.co).');
      showToast('Invalid Supabase Project URL');
      return;
    }

    setApiKeyProtectionError(null);
    setVerifyingSupabaseKeys(true);
    try {
      const updatedCfg = updateSupabaseConfig({
        url: nextUrl,
        anonKey: nextKey,
        bucket: nextBucket,
      });
      resetSupabaseBucketCache();
      setExpectedProjectId(updatedCfg.projectId);

      const verification = await verifySupabaseApiConnection(updatedCfg.projectId);
      setApiVerificationResult(verification);
      setStorageDiagReport(verification.diagnosticReport);
      setStorageDiagLogs(verification.diagnosticReport.logs);

      if (verification.bucketNotFound) {
        setBucketNotFoundDetail(
          verification.diagnosticReport.errorMessage ||
            `Bucket Not Found: "${verification.bucketName}" does not exist on Supabase project "${verification.projectId}".`
        );
        setHeroNeedsBucketSql(true);
      } else if (verification.bucketExists) {
        setBucketNotFoundDetail(null);
        setHeroNeedsBucketSql(false);
      }

      showToast(
        verification.ok
          ? `Verified connection to "${verification.projectId}"`
          : verification.restAuthorized
          ? `Key verified, bucket "${verification.bucketName}" needs attention`
          : 'Supabase connection verification failed'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setApiKeyProtectionError(`Verification error: ${msg}`);
      showToast('Failed to verify Supabase connection');
    } finally {
      setVerifyingSupabaseKeys(false);
    }
  };

  const handleSaveSupabaseKeys = async () => {
    const nextUrl = sanitizePastedSupabaseUrl(formSettings.supabaseUrl ?? activeSupabaseUrl) || DEFAULT_SUPABASE_URL;
    const nextKey = sanitizePastedCredential(formSettings.supabaseAnonKey ?? activeSupabaseCfg.anonKey) || DEFAULT_SUPABASE_ANON_KEY;
    const nextBucket = sanitizePastedBucketName(formSettings.supabaseBucket ?? activeBucketName) || DEFAULT_SUPABASE_BUCKET;

    const secretCheck = isSecretSupabaseKey(nextKey);
    if (secretCheck.isSecret) {
      setApiKeyProtectionError(secretCheck.reason || 'Secret Supabase key blocked.');
      showToast('Save blocked: do not save secret/service_role keys');
      return;
    }
    if (!/^https:\/\/[a-z0-9.-]+/i.test(nextUrl)) {
      setApiKeyProtectionError('Supabase Project URL must start with https:// (e.g. https://xyz.supabase.co).');
      showToast('Invalid Supabase Project URL');
      return;
    }

    setApiKeyProtectionError(null);
    setSavingSupabaseKeys(true);
    try {
      const updatedCfg = updateSupabaseConfig({
        url: nextUrl,
        anonKey: nextKey,
        bucket: nextBucket,
      });
      resetSupabaseBucketCache();
      setExpectedProjectId(updatedCfg.projectId);

      const mergedSettings: Settings = {
        ...settingsRef.current,
        ...formSettings,
        supabaseUrl: updatedCfg.url,
        supabaseAnonKey: updatedCfg.anonKey,
        supabaseBucket: updatedCfg.bucket,
      };
      setRawFormSettings(mergedSettings);
      setIsSettingsDirty(false);
      lastSavedWhatsappRef.current = (mergedSettings.whatsappNumber || '').trim();

      if (onSaveApiKeys) {
        await onSaveApiKeys({
          supabaseUrl: updatedCfg.url,
          supabaseAnonKey: updatedCfg.anonKey,
          supabaseBucket: updatedCfg.bucket,
        });
      } else {
        await onSaveSettings(mergedSettings);
      }

      showToast('API Keys saved to Firestore settings/global!');
      const verification = await verifySupabaseApiConnection(updatedCfg.projectId);
      setApiVerificationResult(verification);
      setStorageDiagReport(verification.diagnosticReport);
      setStorageDiagLogs(verification.diagnosticReport.logs);
    } catch (err) {
      console.error('Failed to save Supabase keys:', err);
      showToast('Failed to save Supabase keys to Firestore.');
    } finally {
      setSavingSupabaseKeys(false);
    }
  };

  const handleResetSupabaseKeys = async () => {
    setApiKeyProtectionError(null);
    setSavingSupabaseKeys(true);
    try {
      const updatedCfg = updateSupabaseConfig({
        url: DEFAULT_SUPABASE_URL,
        anonKey: DEFAULT_SUPABASE_ANON_KEY,
        bucket: DEFAULT_SUPABASE_BUCKET,
      });
      resetSupabaseBucketCache();
      setExpectedProjectId(updatedCfg.projectId);
      const mergedSettings: Settings = {
        ...settingsRef.current,
        ...formSettings,
        supabaseUrl: updatedCfg.url,
        supabaseAnonKey: updatedCfg.anonKey,
        supabaseBucket: updatedCfg.bucket,
      };
      setRawFormSettings(mergedSettings);
      setIsSettingsDirty(false);
      lastSavedWhatsappRef.current = (mergedSettings.whatsappNumber || '').trim();

      if (onSaveApiKeys) {
        await onSaveApiKeys({
          supabaseUrl: updatedCfg.url,
          supabaseAnonKey: updatedCfg.anonKey,
          supabaseBucket: updatedCfg.bucket,
        });
      } else {
        await onSaveSettings(mergedSettings);
      }
      showToast('Reset API Keys to default project in Firestore');
      const verification = await verifySupabaseApiConnection(updatedCfg.projectId);
      setApiVerificationResult(verification);
      setStorageDiagReport(verification.diagnosticReport);
      setStorageDiagLogs(verification.diagnosticReport.logs);
    } catch (err) {
      console.error('Failed to reset Supabase keys:', err);
      showToast('Failed to reset Supabase keys.');
    } finally {
      setSavingSupabaseKeys(false);
    }
  };

  // Cross-device media upload handler (Supabase Storage primary when configured + chunked server / compact image fallback)
  const handleFileUpload = async (file: File): Promise<string> => {
    const isVideo = detectIsVideoFile(file);
    const cfg = getSupabaseConfig();
    setHeroUploadError(null);
    setHeroNeedsBucketSql(false);
    setBucketNotFoundDetail(null);
    setUploadProgress(isVideo ? 1 : null);
    appendDiagnosticLog(
      'info',
      'HERO_UPLOAD',
      `Uploading "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB, type: ${
        file.type || 'unknown'
      }) -> Project "${cfg.projectId}", Bucket "${cfg.bucket}"`
    );
    showToast(isVideo ? 'Uploading video...' : 'Uploading photo...');
    const result = await uploadMediaToSupabase(file, file.name, {
      onProgress: (pct) => setUploadProgress(pct),
    });
    setUploadProgress(null);

    if (result.errorCode === 'BUCKET_NOT_FOUND') {
      const detail =
        result.bucketDiagnosticNote ||
        `Bucket Not Found: Supabase Storage bucket "${cfg.bucket}" was not found on project "${cfg.projectId}".`;
      setBucketNotFoundDetail(detail);
      setHeroNeedsBucketSql(true);
      appendDiagnosticLog('error', 'BUCKET_NOT_FOUND', detail);
    }

    if (!result.url) {
      const msg = result.error || 'Upload failed. Please try a smaller file or paste an HTTPS link.';
      setHeroUploadError(msg);
      setHeroNeedsBucketSql(Boolean(result.needsBucketSetup));
      appendDiagnosticLog('error', 'HERO_UPLOAD', msg);
      showToast(result.errorCode === 'BUCKET_NOT_FOUND' ? 'Bucket Not Found — see diagnostics' : msg);
      return '';
    }
    setHeroUploadError(null);
    setBucketNotFoundDetail(null);
    setHeroNeedsBucketSql(false);
    if (result.source === 'supabase') {
      appendDiagnosticLog('success', 'HERO_UPLOAD', `Uploaded to Supabase Storage: ${result.url}`);
      showToast(`${isVideo ? 'Video' : 'Photo'} synced to Supabase`);
    } else if (result.source === 'server') {
      appendDiagnosticLog(
        'info',
        'HERO_UPLOAD',
        `Stored via chunked app media server: ${result.url}${
          result.bucketDiagnosticNote ? ` (Supabase note: ${result.bucketDiagnosticNote})` : ''
        }`
      );
      showToast(`${isVideo ? 'Video' : 'Photo'} uploaded & ready!`);
    } else if (result.source === 'local') {
      appendDiagnosticLog(
        'warn',
        'HERO_UPLOAD',
        `Saved in browser media store (${result.url}) — run Supabase SQL for cross-device cloud sync`
      );
      showToast(`${isVideo ? 'Video' : 'Photo'} uploaded & ready on this device`);
    } else {
      appendDiagnosticLog('info', 'HERO_UPLOAD', `Stored inline/optimized (${result.source})`);
      showToast(`${isVideo ? 'Video' : 'Photo'} synced across devices`);
    }
    return result.url;
  };

  const applyAndSyncHeroSettings = async (patch: Partial<Settings>, successMsg: string) => {
    const merged: Settings = {
      ...settingsRef.current,
      ...formSettings,
      ...patch,
    };
    if (Array.isArray(merged.heroVideoUrls)) {
      const usable = merged.heroVideoUrls.filter((u) => Boolean(u && u.trim()));
      merged.heroVideoUrls = usable;
      merged.heroVideoUrl = usable[0] || '/assets/aistudio/brotherhood_hero_loop.mp4';
    }
    setRawFormSettings(merged);
    setIsSettingsDirty(false);
    await onSaveSettings(merged);
    lastSavedWhatsappRef.current = (merged.whatsappNumber || '').trim();
    showToast(successMsg);
  };

  const handleHeroMultiUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setHeroUploadError(null);
    setUploadingHeroMedia(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of Array.from(fileList)) {
        const res = await handleFileUpload(file);
        if (res) {
          uploadedUrls.push(res);
        }
      }
      if (uploadedUrls.length > 0) {
        const current = (formSettings.heroVideoUrls || []).filter((u) => Boolean(u && u.trim()));
        const hadOnlyDefault =
          current.length === 1 && current[0] === '/assets/aistudio/brotherhood_hero_loop.mp4';
        const nextList = hadOnlyDefault ? [...uploadedUrls] : [...current, ...uploadedUrls];
        await applyAndSyncHeroSettings(
          {
            heroVideoUrls: nextList,
            heroVideoUrl: nextList[0],
          },
          hadOnlyDefault
            ? 'Replaced default hero media & synced'
            : `Added & synced ${uploadedUrls.length} hero ${uploadedUrls.length === 1 ? 'item' : 'items'}`
        );
      }
    } catch (err) {
      console.error('Hero multi-upload failed:', err);
      setHeroUploadError('Error uploading hero media.');
      showToast('Error uploading hero media.');
    } finally {
      setUploadingHeroMedia(false);
    }
  };

  // Submit Product Form
  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProduct.name?.trim()) {
      showToast('Please enter a garment name');
      return;
    }
    if (formProduct.price === undefined || formProduct.price < 0) {
      showToast('Please enter a valid price');
      return;
    }
    setSavingProduct(true);

    try {
      const variants = formProduct.variants || [];
      const totalStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

      const productToSave: Product = {
        ...formProduct,
        name: formProduct.name.trim(),
        category: formProduct.category || 'SHIRTS',
        price: Number(formProduct.price) || 0,
        imageColor: formProduct.imageColor || '#F8F7F3',
        collection: (formProduct.collection as any) || 'legacy',
        variants,
        totalStock,
      };

      await onSaveProduct(productToSave);
      setIsEditingProduct(false);
      setFormProduct({});
      showToast(
        productToSave.id
          ? `Updated "${productToSave.name}" & synced to Supabase`
          : `Added "${productToSave.name}" & synced to Supabase`
      );
    } catch (err) {
      console.error('Failed to save product', err);
      showToast('Error saving product. Please try again.');
    } finally {
      setSavingProduct(false);
    }
  };

  const resolveCrossDeviceUrl = async (val: string, label: string): Promise<string> => {
    if (!val || !val.startsWith('data:')) return val;
    const uploaded = await uploadMediaToSupabase(val, label);
    if (uploaded.url) return uploaded.url;
    if (val.startsWith('data:image/')) {
      return await compressImageForCrossDevice(val, 155000);
    }
    return '';
  };

  // Submit Store Settings
  const handleSubmitSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingSettings(true);
    try {
      const sanitized: any = { ...formSettings };
      for (const key of Object.keys(sanitized)) {
        if (typeof sanitized[key] === 'string' && sanitized[key].startsWith('data:')) {
          sanitized[key] = await resolveCrossDeviceUrl(sanitized[key], `settings_${key}`);
        }
      }
      if (sanitized.heroVideoUrls && Array.isArray(sanitized.heroVideoUrls)) {
        const cleanedUrls = await Promise.all(
          sanitized.heroVideoUrls.map(async (url: string, i: number) => {
            if (!url) return '';
            if (url.startsWith('data:')) {
              return await resolveCrossDeviceUrl(url, `hero_vid_${i}`);
            }
            return url;
          })
        );
        const filtered = cleanedUrls.filter((u: string) => Boolean(u && u.trim()));
        sanitized.heroVideoUrls =
          filtered.length > 0 ? filtered : ['/assets/aistudio/brotherhood_hero_loop.mp4'];
        sanitized.heroVideoUrl = sanitized.heroVideoUrls[0];
      }

      if (sanitized.galleryImageUrls && Array.isArray(sanitized.galleryImageUrls)) {
        const cleanedGallery = await Promise.all(
          sanitized.galleryImageUrls.map(async (url: string, i: number) => {
            if (url && url.startsWith('data:')) {
              return await resolveCrossDeviceUrl(url, `gallery_img_${i}`);
            }
            return url;
          })
        );
        sanitized.galleryImageUrls = cleanedGallery.filter(Boolean);
      }

      sanitized.studioGallery = galleryState;

      if (
        sanitized.supabaseUrl !== undefined ||
        sanitized.supabaseAnonKey !== undefined ||
        sanitized.supabaseBucket !== undefined
      ) {
        const updatedCfg = updateSupabaseConfig({
          url: sanitized.supabaseUrl,
          anonKey: sanitized.supabaseAnonKey,
          bucket: sanitized.supabaseBucket,
        });
        sanitized.supabaseUrl = updatedCfg.url;
        sanitized.supabaseAnonKey = updatedCfg.anonKey;
        sanitized.supabaseBucket = updatedCfg.bucket;
        resetSupabaseBucketCache();
      }

      await onSaveSettings(sanitized);
      lastSavedWhatsappRef.current = (sanitized.whatsappNumber || '').trim();
      setRawFormSettings(sanitized);
      setIsSettingsDirty(false);
      showToast('Settings saved & synced across devices');
    } catch (err) {
      console.error('Failed to save settings', err);
      showToast('Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Creator Post Admin Handlers
  const handleOpenAddCreatorPost = () => {
    setFormCreatorPost({
      creatorName: '',
      handle: '@',
      mediaUrl: '',
      isVideo: false,
      socialLink: '',
      caption: '',
      taggedProductIds: [],
      featured: true,
    });
    setIsEditingCreatorPost(true);
  };

  const handleOpenEditCreatorPost = (post: CreatorPost) => {
    setFormCreatorPost({ ...post, taggedProductIds: post.taggedProductIds || [] });
    setIsEditingCreatorPost(true);
  };

  const handleSaveCreatorPostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCreatorPost.creatorName?.trim() || !formCreatorPost.mediaUrl?.trim() || !onSaveCreatorPost) return;
    setSavingCreatorPost(true);
    try {
      const rawHandle = (formCreatorPost.handle || '@brotherhood').trim();
      const normalizedHandle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
      const normalizedPost: CreatorPost = {
        ...(formCreatorPost.id ? { id: formCreatorPost.id } : {}),
        creatorName: formCreatorPost.creatorName.trim(),
        handle: normalizedHandle,
        mediaUrl: formCreatorPost.mediaUrl.trim(),
        isVideo: Boolean(formCreatorPost.isVideo),
        socialLink: formCreatorPost.socialLink?.trim() || '',
        caption: formCreatorPost.caption?.trim() || '',
        taggedProductIds: formCreatorPost.taggedProductIds || [],
        featured: formCreatorPost.featured ?? true,
      };
      await onSaveCreatorPost(normalizedPost);
      setIsEditingCreatorPost(false);
      setFormCreatorPost({});
      showToast('Creator fit saved & synced to Supabase!');
    } catch (err) {
      console.error('Failed to save creator post:', err);
      showToast('Error saving creator post.');
    } finally {
      setSavingCreatorPost(false);
    }
  };

  const handleConfirmDeleteCreatorPost = async () => {
    if (!creatorPostToDelete?.id || !onDeleteCreatorPost) return;
    setIsDeleting(true);
    try {
      await onDeleteCreatorPost(creatorPostToDelete.id);
      setCreatorPostToDelete(null);
      showToast('Creator post deleted.');
    } catch (err) {
      console.error('Failed to delete creator post:', err);
      showToast('Error deleting post.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full bg-[#FAFAFA] text-black min-h-screen py-6 md:py-10 relative overflow-x-hidden">
      <Helmet
        title={`Admin Console | ${settings.brandName || 'BROTHERHOOD'} Portal`}
        description="Secure catalog management, lookbook media, and storefront configuration console."
        noIndex={true}
      />
      {/* In-app Toast Banner */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[150] bg-black text-white px-4 sm:px-5 py-3 text-[11px] sm:text-xs font-black uppercase tracking-[0.18em] shadow-2xl flex items-center gap-3 border border-zinc-700 animate-in slide-in-from-bottom-3 duration-200">
          <Check size={16} className="text-emerald-400 shrink-0" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}

      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-12">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6 md:mb-8 pb-4 border-b border-zinc-200">
          <button
            onClick={handleBackToStoreWithFlush}
            className="flex items-center gap-2 text-[11px] sm:text-xs font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-black transition-colors py-1"
          >
            <ArrowLeft size={14} /> Exit Admin
          </button>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Admin · {settings.brandName || 'BROTHERHOOD'}
            </span>
            <button
              onClick={handleBackToStoreWithFlush}
              className="flex items-center gap-1.5 px-3 py-1 bg-zinc-100 hover:bg-black hover:text-white text-zinc-700 text-[10px] font-black uppercase tracking-wider transition-colors border border-zinc-200"
              title="Lock Admin Session"
            >
              <Lock size={12} /> Lock Admin
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-8 mb-8 md:mb-10 sm:border-b sm:border-zinc-200 text-[10px] sm:text-xs font-black uppercase tracking-[0.16em] sm:tracking-[0.2em]">
          <button
            onClick={() => setActiveTab('products')}
            className={`px-3 py-2.5 sm:px-0 sm:py-0 sm:pb-3 transition-colors relative text-center sm:text-left border sm:border-0 ${
              activeTab === 'products'
                ? 'bg-black text-white border-black sm:bg-transparent sm:text-black sm:border-b-2 sm:border-black'
                : 'bg-white text-zinc-500 border-zinc-200 sm:bg-transparent sm:text-zinc-400 hover:text-black'
            }`}
          >
            Products ({products.length})
          </button>
          <button
            onClick={() => setActiveTab('gallery')}
            className={`px-3 py-2.5 sm:px-0 sm:py-0 sm:pb-3 transition-colors relative text-center sm:text-left border sm:border-0 ${
              activeTab === 'gallery'
                ? 'bg-black text-white border-black sm:bg-transparent sm:text-black sm:border-b-2 sm:border-black'
                : 'bg-white text-zinc-500 border-zinc-200 sm:bg-transparent sm:text-zinc-400 hover:text-black'
            }`}
          >
            Studio Gallery ({galleryState.items.length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-2.5 sm:px-0 sm:py-0 sm:pb-3 transition-colors relative text-center sm:text-left border sm:border-0 ${
              activeTab === 'settings'
                ? 'bg-black text-white border-black sm:bg-transparent sm:text-black sm:border-b-2 sm:border-black'
                : 'bg-white text-zinc-500 border-zinc-200 sm:bg-transparent sm:text-zinc-400 hover:text-black'
            }`}
          >
            Settings & Visuals
          </button>
          <button
            onClick={() => setActiveTab('api-keys')}
            className={`px-3 py-2.5 sm:px-0 sm:py-0 sm:pb-3 transition-colors relative text-center sm:text-left border sm:border-0 flex items-center justify-center sm:justify-start gap-1.5 ${
              activeTab === 'api-keys'
                ? 'bg-black text-white border-black sm:bg-transparent sm:text-black sm:border-b-2 sm:border-black'
                : 'bg-white text-zinc-500 border-zinc-200 sm:bg-transparent sm:text-zinc-400 hover:text-black'
            }`}
          >
            <KeyRound size={12} /> API Keys
          </button>
          <button
            onClick={() => setActiveTab('creators')}
            className={`col-span-2 sm:col-span-1 px-3 py-2.5 sm:px-0 sm:py-0 sm:pb-3 transition-colors relative text-center sm:text-left border sm:border-0 ${
              activeTab === 'creators'
                ? 'bg-black text-white border-black sm:bg-transparent sm:text-black sm:border-b-2 sm:border-black'
                : 'bg-white text-zinc-500 border-zinc-200 sm:bg-transparent sm:text-zinc-400 hover:text-black'
            }`}
          >
            Creators Club ({creatorPosts.length})
          </button>
        </div>

        {/* Studio Gallery Admin Tab (kept mounted to preserve unsaved draft edits across tabs) */}
        <div className={activeTab === 'gallery' ? 'block' : 'hidden'}>
          <StudioGalleryAdmin
            state={galleryState}
            onSaveAndApply={saveGalleryState}
            onShowToast={showToast}
          />
        </div>

        {/* Tab 1: Products & Inventory */}
        {activeTab === 'products' && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">Catalog Management</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Add new garments, update pricing, upload multiple perspective angles, and remove items.
                </p>
              </div>
              <button
                onClick={handleOpenAddProduct}
                className="bg-black text-white px-6 py-3 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 shadow-md shrink-0 rounded-none"
              >
                <Plus size={16} /> Add New Garment
              </button>
            </div>

            {/* Empty State */}
            {products.length === 0 ? (
              <div className="bg-white border border-zinc-200 p-12 text-center space-y-4">
                <SlidersHorizontal size={40} className="mx-auto text-zinc-300" />
                <h3 className="text-sm font-black uppercase tracking-widest text-black">
                  No Garments in Catalog
                </h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Your store catalog is currently empty. Click below to add your first product.
                </p>
                <button
                  onClick={handleOpenAddProduct}
                  className="bg-black text-white px-6 py-3 text-xs font-black uppercase tracking-widest hover:bg-zinc-800 transition-colors inline-flex items-center gap-2"
                >
                  <Plus size={14} /> Add Product Now
                </button>
              </div>
            ) : (
              <>
                {/* Mobile Product Card List */}
                <div className="space-y-3 md:hidden">
                  {products.map((p) => {
                    const galleryCount = (p.galleryImages?.length || 0) + (p.imageUrl ? 1 : 0);
                    return (
                      <div key={p.id} className="bg-white border border-zinc-200 p-4 space-y-3 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-16 h-20 bg-zinc-100 border border-zinc-200 shrink-0 overflow-hidden">
                            {p.imageUrl ? (
                              <ResolvedImage
                                src={p.imageUrl}
                                alt={p.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div style={{ backgroundColor: p.imageColor }} className="w-full h-full" />
                            )}
                          </div>
                          <div className="min-w-0 flex-grow">
                            <h3 className="text-xs font-black uppercase tracking-wider text-black line-clamp-2">
                              {p.name}
                            </h3>
                            <div className="text-[10px] font-bold uppercase text-zinc-500 mt-1">
                              {p.category} · {p.collection === 'legacy' ? 'Capsule' : 'Featured'}
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-xs font-mono font-bold tabular-nums">
                              <span>{formatPrice(p.price)}</span>
                              <span className="text-zinc-300">·</span>
                              <span className={p.totalStock === 0 ? 'text-rose-600' : 'text-zinc-600'}>
                                {p.totalStock ?? 25} units
                              </span>
                              <span className="text-zinc-300">·</span>
                              <span className="text-[10px] text-zinc-400">
                                {galleryCount} img
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-zinc-100">
                          <button
                            onClick={() => handleDuplicateProduct(p)}
                            className="px-3 py-1.5 border border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-600 hover:text-black flex items-center gap-1"
                          >
                            <Copy size={13} /> Copy
                          </button>
                          <button
                            onClick={() => handleOpenEditProduct(p)}
                            className="px-3 py-1.5 border border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-700 hover:bg-black hover:text-white flex items-center gap-1"
                          >
                            <Edit2 size={13} /> Edit
                          </button>
                          <button
                            onClick={() => setProductToDelete(p)}
                            className="px-3 py-1.5 border border-rose-200 text-[10px] font-bold uppercase tracking-wider text-rose-600 hover:bg-rose-50 flex items-center gap-1"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Product Table */}
                <div className="hidden md:block bg-white border border-zinc-200 overflow-x-auto shadow-sm">
                  <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    <tr>
                      <th className="py-3.5 px-4">Garment</th>
                      <th className="py-3.5 px-4">Category</th>
                      <th className="py-3.5 px-4">Line</th>
                      <th className="py-3.5 px-4">Price</th>
                      <th className="py-3.5 px-4">Inventory</th>
                      <th className="py-3.5 px-4">Gallery</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {products.map((p) => {
                      const galleryCount = (p.galleryImages?.length || 0) + (p.imageUrl ? 1 : 0);
                      return (
                        <tr key={p.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="py-3.5 px-4 flex items-center gap-3">
                            <div className="w-12 h-14 bg-zinc-100 border border-zinc-200 shrink-0 overflow-hidden">
                              {p.imageUrl ? (
                                <ResolvedImage
                                  src={p.imageUrl}
                                  alt={p.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div style={{ backgroundColor: p.imageColor }} className="w-full h-full" />
                              )}
                            </div>
                            <div>
                              <span className="font-bold text-black uppercase tracking-wider block">
                                {p.name}
                              </span>
                              <span className="text-[9px] text-zinc-400 font-mono">ID: {p.id?.slice(0, 8)}...</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 uppercase text-zinc-600 font-bold">{p.category}</td>
                          <td className="py-3.5 px-4 uppercase text-zinc-600 font-bold">
                            {p.collection === 'legacy' ? 'The Capsule' : 'Featured'}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold tabular-nums">
                            {formatPrice(p.price)}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`font-mono font-bold tabular-nums ${
                                p.totalStock === 0 ? 'text-rose-600' : 'text-zinc-700'
                              }`}
                            >
                              {p.totalStock ?? 25} units
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-zinc-400 font-mono tabular-nums">
                            {galleryCount} image{galleryCount === 1 ? '' : 's'}
                          </td>
                          <td className="py-3.5 px-4 text-right space-x-1">
                            {/* Duplicate Button */}
                            <button
                              onClick={() => handleDuplicateProduct(p)}
                              className="p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 transition-colors"
                              title="Duplicate Garment"
                              aria-label="Duplicate Garment"
                            >
                              <Copy size={15} />
                            </button>
                            {/* Edit Button */}
                            <button
                              onClick={() => handleOpenEditProduct(p)}
                              className="p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 transition-colors"
                              title="Edit Garment"
                              aria-label="Edit Garment"
                            >
                              <Edit2 size={15} />
                            </button>
                            {/* Delete Button (Triggers in-app modal) */}
                            <button
                              onClick={() => setProductToDelete(p)}
                              className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Delete Garment"
                              aria-label="Delete Garment"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        )}

        {/* Tab 2: Store Settings & Visuals */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSubmitSettings} className="space-y-8 md:space-y-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
              <div>
                <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight">Visual & Store Settings</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Control hero media playlist, campaign visuals, and section color schemes.
                </p>
              </div>
              <button
                type="submit"
                disabled={savingSettings}
                className="w-full sm:w-auto justify-center bg-black text-white px-6 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-colors flex items-center gap-2 shadow-sm shrink-0"
              >
                <Save size={14} /> {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>

            {/* Brand & Section Colors */}
            <div className="bg-white p-4 sm:p-6 border border-zinc-200 space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest border-b border-zinc-100 pb-2">
                Brand & Color Tokens
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    value={formSettings.brandName || ''}
                    onChange={(e) => setFormSettings({ ...formSettings, brandName: e.target.value })}
                    className="w-full border border-zinc-200 p-2.5 text-xs uppercase font-bold focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Logo Image URL / Upload
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="https://... or upload image"
                      value={formSettings.logoUrl || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, logoUrl: e.target.value })}
                      className="flex-1 min-w-0 border border-zinc-200 p-2 text-xs font-mono focus:outline-none focus:border-black"
                    />
                    <label className="bg-black text-white hover:bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors flex items-center justify-center gap-1.5 shrink-0">
                      <Upload size={12} /> Upload Logo
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const res = await handleFileUpload(file);
                            if (res) {
                              setFormSettings({ ...formSettings, logoUrl: res });
                            }
                          }
                        }}
                      />
                    </label>
                  </div>
                  {formSettings.logoUrl && (
                    <div className="mt-2 p-3 bg-zinc-50 border border-zinc-200 flex items-center justify-between">
                      <div className="h-10 border border-zinc-200 bg-white p-1 flex items-center">
                        <ResolvedImage src={formSettings.logoUrl} alt="Logo preview" className="h-full object-contain" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormSettings({ ...formSettings, logoUrl: '' })}
                        className="text-[10px] text-zinc-400 hover:text-rose-600 font-bold uppercase tracking-widest transition-colors"
                      >
                        Remove Logo
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 pt-4 border-t border-zinc-100">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Primary Text Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formSettings.primaryColor || '#1A1815'}
                      onChange={(e) => setFormSettings({ ...formSettings, primaryColor: e.target.value })}
                      className="w-8 h-8 border border-zinc-200 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={formSettings.primaryColor || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, primaryColor: e.target.value })}
                      className="flex-1 min-w-0 border border-zinc-200 p-1.5 text-xs font-mono uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Site Background
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formSettings.backgroundColor || '#F8F7F3'}
                      onChange={(e) => setFormSettings({ ...formSettings, backgroundColor: e.target.value })}
                      className="w-8 h-8 border border-zinc-200 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={formSettings.backgroundColor || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, backgroundColor: e.target.value })}
                      className="flex-1 min-w-0 border border-zinc-200 p-1.5 text-xs font-mono uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Legacy Section Bg
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formSettings.legacySectionBgColor || '#FFFFFF'}
                      onChange={(e) => setFormSettings({ ...formSettings, legacySectionBgColor: e.target.value })}
                      className="w-8 h-8 border border-zinc-200 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      placeholder="Default"
                      value={formSettings.legacySectionBgColor || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, legacySectionBgColor: e.target.value })}
                      className="flex-1 min-w-0 border border-zinc-200 p-1.5 text-xs font-mono uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Legacy Section Text
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formSettings.legacySectionTextColor || '#000000'}
                      onChange={(e) => setFormSettings({ ...formSettings, legacySectionTextColor: e.target.value })}
                      className="w-8 h-8 border border-zinc-200 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      placeholder="Default"
                      value={formSettings.legacySectionTextColor || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, legacySectionTextColor: e.target.value })}
                      className="flex-1 min-w-0 border border-zinc-200 p-1.5 text-xs font-mono uppercase"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* WhatsApp Checkout & Social Media Tags */}
            <div className="bg-white p-4 sm:p-6 border border-zinc-200 space-y-6">
              <div className="border-b border-zinc-100 pb-3">
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <MessageCircle size={16} /> WhatsApp Checkout & Social Media Tags
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Set your store WhatsApp number for direct cart checkout, and add (+) or remove (-) social tags with pasted links.
                </p>
              </div>

              {/* WhatsApp Number */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block">
                  WhatsApp Checkout Number (Orders Text This Exact Number)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="tel"
                    placeholder="+265 999 123 456"
                    value={formSettings.whatsappNumber || ''}
                    onChange={(e) => setFormSettings({ ...formSettings, whatsappNumber: e.target.value })}
                    onBlur={() => {
                      const clean = (formSettings.whatsappNumber || '').trim();
                      if (clean !== lastSavedWhatsappRef.current) {
                        void persistWhatsappNumber(clean, false);
                      }
                    }}
                    className="flex-1 min-w-0 border border-zinc-200 p-2.5 text-xs font-mono font-bold focus:outline-none focus:border-black"
                  />
                  <button
                    type="button"
                    disabled={savingWhatsapp}
                    onClick={() => persistWhatsappNumber(formSettings.whatsappNumber || '', true)}
                    className="bg-[#25D366] hover:bg-[#20bd5a] text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shrink-0 transition-colors disabled:opacity-50"
                  >
                    <Check size={13} /> {savingWhatsapp ? 'Saving...' : 'Save Number'}
                  </button>
                  {formSettings.whatsappNumber && (
                    <button
                      type="button"
                      onClick={async () => {
                        const digits = formatWhatsAppDigits(formSettings.whatsappNumber);
                        const link = digits ? `https://api.whatsapp.com/send?phone=${digits}` : '';
                        if (link && navigator.clipboard?.writeText) {
                          try {
                            await navigator.clipboard.writeText(link);
                            showToast('Copied direct WhatsApp link');
                          } catch {
                            showToast('Select link to copy');
                          }
                        }
                      }}
                      className="border border-zinc-200 hover:border-black px-3 py-2 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                    >
                      <Copy size={12} /> Copy Link
                    </button>
                  )}
                </div>
                {(() => {
                  const digits = formatWhatsAppDigits(formSettings.whatsappNumber);
                  if (!digits) {
                    return (
                      <p className="text-[10px] font-mono text-zinc-400">
                        Enter the phone number with country code. Auto-saves as you type.
                      </p>
                    );
                  }
                  const isSynced =
                    (formSettings.whatsappNumber || '').trim() === lastSavedWhatsappRef.current &&
                    !savingWhatsapp;
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                      <span className="text-emerald-700 break-all tabular-nums">
                        Direct Checkout Target: https://api.whatsapp.com/send?phone={digits}
                      </span>
                      <span className="text-zinc-500 uppercase tracking-wider shrink-0">
                        {savingWhatsapp ? 'Syncing...' : isSynced ? 'Synced' : 'Pending save'}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Social Tags Manager (+ / - and Copy/Paste Links) */}
              <div className="space-y-3 pt-4 border-t border-zinc-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-700 flex items-center gap-1.5">
                      <Link2 size={13} /> Footer Social Tags & Links
                    </label>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Use + to add a social tag, - to remove one, and paste or copy profile URLs.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const current: SocialLinkItem[] =
                        formSettings.socialLinks !== undefined
                          ? formSettings.socialLinks
                          : getDefaultSocialLinks(formSettings.brandName);
                      const next: SocialLinkItem[] = [
                        ...current,
                        {
                          id: `social-${Date.now()}`,
                          platform: 'Instagram',
                          tag: '@',
                          url: '',
                        },
                      ];
                      setFormSettings({ ...formSettings, socialLinks: next });
                    }}
                    className="bg-black text-white hover:bg-zinc-800 px-3.5 py-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shrink-0 transition-colors"
                  >
                    <Plus size={13} /> Add Social Tag
                  </button>
                </div>

                {(() => {
                  const socialList: SocialLinkItem[] =
                    formSettings.socialLinks !== undefined
                      ? formSettings.socialLinks
                      : getDefaultSocialLinks(formSettings.brandName);

                  if (socialList.length === 0) {
                    return (
                      <div className="p-6 bg-zinc-50 border border-dashed border-zinc-200 text-center space-y-2">
                        <p className="text-xs text-zinc-500">
                          No social media tags added. Click "Add Social Tag" (+) to add one.
                        </p>
                      </div>
                    );
                  }

                  const updateSocialRow = (idx: number, patch: Partial<SocialLinkItem>) => {
                    const next = socialList.map((item, i) =>
                      i === idx ? { ...item, ...patch } : item
                    );
                    setFormSettings({ ...formSettings, socialLinks: next });
                  };

                  const removeSocialRow = (idx: number) => {
                    const next = socialList.filter((_, i) => i !== idx);
                    setFormSettings({ ...formSettings, socialLinks: next });
                  };

                  return (
                    <div className="space-y-3">
                      {socialList.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="p-3 sm:p-3.5 bg-zinc-50 border border-zinc-200 space-y-2.5"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                            <div className="sm:col-span-4">
                              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                                Platform
                              </label>
                              <input
                                type="text"
                                list={`social-platforms-${idx}`}
                                value={item.platform}
                                placeholder="Instagram, TikTok, X..."
                                onChange={(e) => updateSocialRow(idx, { platform: e.target.value })}
                                className="w-full border border-zinc-200 bg-white p-2 text-xs font-bold uppercase focus:outline-none focus:border-black"
                              />
                              <datalist id={`social-platforms-${idx}`}>
                                <option value="Instagram" />
                                <option value="TikTok" />
                                <option value="X" />
                                <option value="YouTube" />
                                <option value="Facebook" />
                                <option value="Threads" />
                                <option value="Snapchat" />
                                <option value="WhatsApp" />
                              </datalist>
                            </div>

                            <div className="sm:col-span-3">
                              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                                Tag / Handle
                              </label>
                              <input
                                type="text"
                                value={item.tag}
                                placeholder="@brotherhood"
                                onChange={(e) => updateSocialRow(idx, { tag: e.target.value })}
                                className="w-full border border-zinc-200 bg-white p-2 text-xs font-mono focus:outline-none focus:border-black"
                              />
                            </div>

                            <div className="sm:col-span-5">
                              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                                Profile Link (Paste URL)
                              </label>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={item.url}
                                  placeholder="https://instagram.com/..."
                                  onChange={(e) => updateSocialRow(idx, { url: e.target.value })}
                                  className="flex-1 min-w-0 border border-zinc-200 bg-white p-2 text-xs font-mono focus:outline-none focus:border-black"
                                />
                                <button
                                  type="button"
                                  title="Paste link from clipboard"
                                  aria-label="Paste link"
                                  onClick={async () => {
                                    try {
                                      const text = await navigator.clipboard.readText();
                                      if (text) {
                                        updateSocialRow(idx, { url: text.trim() });
                                        showToast('Pasted link from clipboard');
                                      }
                                    } catch {
                                      showToast('Paste directly into the link box (Ctrl/Cmd+V)');
                                    }
                                  }}
                                  className="border border-zinc-200 bg-white hover:border-black p-2 text-zinc-600 hover:text-black transition-colors shrink-0"
                                >
                                  <ClipboardPaste size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="Copy link"
                                  aria-label="Copy link"
                                  onClick={async () => {
                                    if (!item.url) return;
                                    try {
                                      await navigator.clipboard.writeText(item.url);
                                      showToast('Copied social link');
                                    } catch {
                                      showToast('Unable to copy link');
                                    }
                                  }}
                                  className="border border-zinc-200 bg-white hover:border-black p-2 text-zinc-600 hover:text-black transition-colors shrink-0"
                                >
                                  <Copy size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="Remove social tag (-)"
                                  aria-label="Remove social tag"
                                  onClick={() => removeSocialRow(idx)}
                                  className="border border-rose-200 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white p-2 transition-colors shrink-0"
                                >
                                  <Minus size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Hero Media Playlist (Videos & Images) */}
            <div className="bg-white p-4 sm:p-6 border border-zinc-200 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                    <Video size={16} /> Hero Media Playlist (Videos &amp; Images)
                  </h3>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Upload multiple photos and videos. They auto-cycle together on your landing hero and sync across phones.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <label className="bg-black text-white hover:bg-zinc-800 px-3.5 py-2 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap">
                    <Upload size={12} />{' '}
                    {uploadingHeroMedia
                      ? uploadProgress !== null
                        ? `Uploading ${uploadProgress}%`
                        : 'Uploading...'
                      : 'Upload Photos / Videos'}
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*,.mp4,.mov,.m4v,.webm,.3gp,.mkv,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                      className="hidden"
                      disabled={uploadingHeroMedia}
                      onChange={async (e) => {
                        const input = e.currentTarget;
                        await handleHeroMultiUpload(input.files);
                        input.value = '';
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const current = formSettings.heroVideoUrls || [];
                      setFormSettings({ ...formSettings, heroVideoUrls: [...current, ''] });
                    }}
                    className="border border-zinc-200 hover:border-black px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-700 hover:text-black flex items-center gap-1 whitespace-nowrap transition-colors"
                  >
                    <Plus size={12} /> Add Link
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyAndSyncHeroSettings(
                        {
                          heroVideoUrl: '/assets/aistudio/brotherhood_hero_loop.mp4',
                          heroVideoUrls: ['/assets/aistudio/brotherhood_hero_loop.mp4'],
                        },
                        'Default BrotherHood hero video applied & synced'
                      )
                    }
                    className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-black border border-zinc-200 px-2.5 py-2 transition-colors whitespace-nowrap"
                  >
                    Reset Default
                  </button>
                </div>
              </div>

              {bucketNotFoundDetail && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={16} className="text-amber-700 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-black uppercase tracking-wider text-amber-900">
                          Supabase Storage Error: Bucket Not Found (&quot;{activeBucketName}&quot;)
                        </div>
                        <p className="text-[11px] leading-relaxed">{bucketNotFoundDetail}</p>
                        <div className="text-[10px] font-mono text-amber-800">
                          Project ID: {activeProjectId} · Endpoint: {activeSupabaseUrl}/storage/v1
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBucketNotFoundDetail(null)}
                      className="text-amber-700 hover:text-amber-950 p-1 shrink-0"
                      aria-label="Dismiss Bucket Not Found alert"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-6">
                    <button
                      type="button"
                      onClick={async () => {
                        const sql = `insert into storage.buckets (id, name, public) values ('${activeBucketName}', '${activeBucketName}', true) on conflict (id) do update set public = true;\ndrop policy if exists "Public read media" on storage.objects;\ncreate policy "Public read media" on storage.objects for select using (bucket_id = '${activeBucketName}');\ndrop policy if exists "Public upload media" on storage.objects;\ncreate policy "Public upload media" on storage.objects for insert with check (bucket_id = '${activeBucketName}');\ndrop policy if exists "Public update media" on storage.objects;\ncreate policy "Public update media" on storage.objects for update using (bucket_id = '${activeBucketName}');`;
                        try {
                          await navigator.clipboard.writeText(sql);
                          showToast('Copied Supabase media bucket SQL!');
                        } catch {
                          showToast('See supabase_schema.sql in project');
                        }
                      }}
                      className="bg-amber-900 hover:bg-black text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                    >
                      <Copy size={12} /> Copy Supabase Media Bucket SQL
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRunStorageDiagnostics()}
                      disabled={runningDiagnostics}
                      className="border border-amber-400 bg-white hover:bg-amber-100 text-amber-950 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                    >
                      <RefreshCw size={12} className={runningDiagnostics ? 'animate-spin' : ''} />
                      Re-check Bucket
                    </button>
                  </div>
                </div>
              )}

              {heroUploadError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span>{heroUploadError}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setHeroUploadError(null);
                        setHeroNeedsBucketSql(false);
                      }}
                      className="text-rose-500 hover:text-rose-800 p-1 shrink-0"
                      aria-label="Dismiss error"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {heroNeedsBucketSql && !bucketNotFoundDetail && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={async () => {
                          const sql = `insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do update set public = true;\ndrop policy if exists "Public read media" on storage.objects;\ncreate policy "Public read media" on storage.objects for select using (bucket_id = 'media');\ndrop policy if exists "Public upload media" on storage.objects;\ncreate policy "Public upload media" on storage.objects for insert with check (bucket_id = 'media');\ndrop policy if exists "Public update media" on storage.objects;\ncreate policy "Public update media" on storage.objects for update using (bucket_id = 'media');`;
                          try {
                            await navigator.clipboard.writeText(sql);
                            showToast('Copied Supabase media bucket SQL!');
                          } catch {
                            showToast('See supabase_schema.sql in project');
                          }
                        }}
                        className="bg-rose-700 hover:bg-rose-800 text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                      >
                        <Copy size={12} /> Copy Supabase Media Bucket SQL
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {(formSettings.heroVideoUrls || ['/assets/aistudio/brotherhood_hero_loop.mp4']).map((url, i, arr) => {
                  const isImageTrack = Boolean(
                    url &&
                      (url.toLowerCase().startsWith('data:image/') ||
                        /\.(jpeg|jpg|gif|png|webp|svg|avif|bmp|heic|heif)($|\?|#)/i.test(url))
                  );
                  return (
                    <div key={i} className="p-3 sm:p-3.5 bg-zinc-50 border border-zinc-200 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center justify-between sm:justify-start gap-3">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                              0{i + 1} · {url ? (isImageTrack ? 'Photo' : 'Video') : 'Empty'}
                            </span>
                            {/* Image / Video Preview Thumbnail */}
                            <div className="w-14 h-12 bg-white border border-zinc-300 overflow-hidden shrink-0 flex items-center justify-center">
                              {url ? (
                                isImageTrack ? (
                                  <ResolvedImage src={url} alt={`Hero ${i + 1}`} className="w-full h-full object-cover" />
                                ) : (
                                  <ResolvedVideo src={url} muted playsInline autoPlay loop className="w-full h-full object-cover" />
                                )
                              ) : (
                                <span className="text-[9px] text-zinc-400 font-mono">Empty</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 sm:hidden">
                            <button
                              type="button"
                              disabled={i === 0}
                              onClick={() => {
                                const next = [...arr];
                                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                                setFormSettings({ ...formSettings, heroVideoUrls: next, heroVideoUrl: next[0] || '' });
                              }}
                              className="p-2 text-zinc-500 hover:text-black disabled:opacity-30"
                              aria-label="Move up"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              disabled={i === arr.length - 1}
                              onClick={() => {
                                const next = [...arr];
                                [next[i + 1], next[i]] = [next[i], next[i + 1]];
                                setFormSettings({ ...formSettings, heroVideoUrls: next, heroVideoUrl: next[0] || '' });
                              }}
                              className="p-2 text-zinc-500 hover:text-black disabled:opacity-30"
                              aria-label="Move down"
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = arr.filter((_, idx) => idx !== i);
                                setFormSettings({ ...formSettings, heroVideoUrls: next, heroVideoUrl: next[0] || '' });
                              }}
                              className="text-zinc-400 hover:text-rose-600 p-2"
                              title="Remove media"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        <input
                          type="text"
                          value={url}
                          placeholder="Media URL (MP4 video or JPG/PNG photo link)"
                          onChange={(e) => {
                            const next = [...arr];
                            next[i] = e.target.value;
                            setFormSettings({
                              ...formSettings,
                              heroVideoUrls: next,
                              ...(i === 0 ? { heroVideoUrl: e.target.value } : {}),
                            });
                          }}
                          className="flex-1 min-w-0 border border-zinc-200 p-2 text-xs font-mono focus:outline-none focus:border-black bg-white"
                        />

                        <div className="flex items-center gap-1.5 shrink-0">
                          <label className="flex-1 sm:flex-initial bg-black text-white hover:bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap">
                            <Upload size={12} /> Replace File
                            <input
                              type="file"
                              accept="image/*,video/*,.mp4,.mov,.m4v,.webm,.3gp,.mkv,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.currentTarget.value = '';
                                if (file) {
                                  const res = await handleFileUpload(file);
                                  if (res) {
                                    const next = [...arr];
                                    next[i] = res;
                                    await applyAndSyncHeroSettings(
                                      {
                                        heroVideoUrls: next,
                                        heroVideoUrl: next[0] || res,
                                      },
                                      'Hero media updated & synced'
                                    );
                                  }
                                }
                              }}
                            />
                          </label>

                          <button
                            type="button"
                            disabled={i === 0}
                            onClick={() => {
                              const next = [...arr];
                              [next[i - 1], next[i]] = [next[i], next[i - 1]];
                              setFormSettings({ ...formSettings, heroVideoUrls: next, heroVideoUrl: next[0] || '' });
                            }}
                            className="hidden sm:inline-flex p-2 text-zinc-400 hover:text-black disabled:opacity-30"
                            title="Move earlier"
                            aria-label="Move earlier"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={i === arr.length - 1}
                            onClick={() => {
                              const next = [...arr];
                              [next[i + 1], next[i]] = [next[i], next[i + 1]];
                              setFormSettings({ ...formSettings, heroVideoUrls: next, heroVideoUrl: next[0] || '' });
                            }}
                            className="hidden sm:inline-flex p-2 text-zinc-400 hover:text-black disabled:opacity-30"
                            title="Move later"
                            aria-label="Move later"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = arr.filter((_, idx) => idx !== i);
                              setFormSettings({ ...formSettings, heroVideoUrls: next, heroVideoUrl: next[0] || '' });
                            }}
                            className="hidden sm:inline-flex text-zinc-400 hover:text-rose-600 p-2"
                            title="Remove media"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Hero Media Fit Mode, Bidirectional Zoom Out/In & Anchor Position */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-zinc-100">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-2">
                    Hero Frame Fit
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 bg-zinc-100 p-1">
                    <button
                      type="button"
                      onClick={() => setFormSettings({ ...formSettings, heroMediaFit: 'contain' })}
                      className={`py-2 px-3 text-[10px] font-black uppercase tracking-widest transition-colors whitespace-nowrap ${
                        formSettings.heroMediaFit === 'contain'
                          ? 'bg-black text-white'
                          : 'text-zinc-600 hover:text-black'
                      }`}
                    >
                      Fit Whole
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormSettings({ ...formSettings, heroMediaFit: 'cover' })}
                      className={`py-2 px-3 text-[10px] font-black uppercase tracking-widest transition-colors whitespace-nowrap ${
                        (formSettings.heroMediaFit || 'cover') === 'cover'
                          ? 'bg-black text-white'
                          : 'text-zinc-600 hover:text-black'
                      }`}
                    >
                      Fill Frame
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                      Zoom Out / In:{' '}
                      <span className="font-mono text-black font-bold tabular-nums">
                        {(formSettings.heroVideoZoom ?? formSettings.heroImageZoom ?? 1).toFixed(2)}x
                      </span>
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const current = Number(formSettings.heroVideoZoom ?? formSettings.heroImageZoom ?? 1);
                          const next = Math.max(0.5, Math.round((current - 0.1) * 100) / 100);
                          setFormSettings({ ...formSettings, heroVideoZoom: next, heroImageZoom: next });
                        }}
                        className="border border-zinc-200 hover:border-black px-2 py-0.5 text-xs font-mono font-bold"
                        title="Zoom Out"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setFormSettings({ ...formSettings, heroVideoZoom: 1, heroImageZoom: 1 })
                        }
                        className="border border-zinc-200 hover:border-black px-2 py-0.5 text-[10px] font-mono font-bold flex items-center gap-1"
                        title="Reset to 1.00x"
                      >
                        <RotateCcw size={10} /> 1x
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const current = Number(formSettings.heroVideoZoom ?? formSettings.heroImageZoom ?? 1);
                          const next = Math.min(2.5, Math.round((current + 0.1) * 100) / 100);
                          setFormSettings({ ...formSettings, heroVideoZoom: next, heroImageZoom: next });
                        }}
                        className="border border-zinc-200 hover:border-black px-2 py-0.5 text-xs font-mono font-bold"
                        title="Zoom In"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.5"
                    step="0.05"
                    value={formSettings.heroVideoZoom ?? formSettings.heroImageZoom ?? 1}
                    onChange={(e) => {
                      const z = Number(e.target.value);
                      setFormSettings({ ...formSettings, heroVideoZoom: z, heroImageZoom: z });
                    }}
                    className="w-full accent-black cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] font-mono text-zinc-400 mt-1 tabular-nums">
                    <span>0.50x (Out)</span>
                    <span>1.00x</span>
                    <span>2.50x (In)</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-2">
                    Focal Alignment ({formSettings.heroVideoPosition || '50% 50%'})
                  </label>
                  <select
                    value={formSettings.heroVideoPosition || formSettings.heroImagePosition || '50% 50%'}
                    onChange={(e) =>
                      setFormSettings({
                        ...formSettings,
                        heroVideoPosition: e.target.value,
                        heroImagePosition: e.target.value,
                      })
                    }
                    className="w-full border border-zinc-200 p-2 text-xs uppercase font-bold bg-white"
                  >
                    <option value="50% 50%">Center (50% 50%)</option>
                    <option value="50% 20%">Top (50% 20%)</option>
                    <option value="50% 80%">Bottom (50% 80%)</option>
                    <option value="20% 50%">Left (20% 50%)</option>
                    <option value="80% 50%">Right (80% 50%)</option>
                  </select>
                </div>
              </div>

              {/* Hero Image Fallback */}
              <div className="pt-4 border-t border-zinc-100">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                  Hero Fallback Cover Image (Shown if browser pauses video)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="https://... or upload image"
                    value={formSettings.heroImageUrl || ''}
                    onChange={(e) => setFormSettings({ ...formSettings, heroImageUrl: e.target.value })}
                    className="flex-1 min-w-0 border border-zinc-200 p-2 text-xs font-mono focus:outline-none focus:border-black"
                  />
                  <label className="bg-zinc-100 hover:bg-zinc-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap">
                    <Upload size={12} /> Upload Fallback
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.currentTarget.value = '';
                        if (file) {
                          const res = await handleFileUpload(file);
                          if (res) {
                            await applyAndSyncHeroSettings(
                              { heroImageUrl: res },
                              'Hero fallback image updated & synced'
                            );
                          }
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* API Keys Quick Link inside Settings & Visuals */}
              <div className="pt-4 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50 border border-zinc-200 p-3.5">
                <div>
                  <h4 className="text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 text-zinc-900">
                    <KeyRound size={13} /> API Keys &amp; Supabase Credentials
                  </h4>
                  <p className="text-[11px] text-zinc-500 mt-0.5 font-mono">
                    Project: <span className="font-bold text-zinc-800">{activeProjectId}</span> · Bucket:{' '}
                    <span className="font-bold text-zinc-800">{activeBucketName}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('api-keys')}
                  className="bg-black hover:bg-zinc-800 text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors shrink-0 whitespace-nowrap"
                >
                  <KeyRound size={12} /> Open API Keys Section
                </button>
              </div>

              {/* Supabase Storage Connectivity & Bucket Diagnostic Logs */}
              <div className="pt-4 border-t border-zinc-100 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 text-zinc-800">
                      <Terminal size={13} /> Supabase Storage Diagnostics &amp; Bucket Validation
                    </h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Verify Supabase Storage connectivity, validate bucket &quot;{activeBucketName}&quot; against your Supabase Project ID, and print live diagnostic logs.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRunStorageDiagnostics()}
                      disabled={runningDiagnostics}
                      className="bg-zinc-900 hover:bg-black text-white px-3.5 py-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      <RefreshCw size={12} className={runningDiagnostics ? 'animate-spin' : ''} />
                      {runningDiagnostics ? 'Testing...' : 'Run Storage Diagnostics'}
                    </button>
                    {storageDiagLogs.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            const text = storageDiagLogs
                              .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.step}] ${l.message}`)
                              .join('\n');
                            try {
                              await navigator.clipboard.writeText(text);
                              showToast('Diagnostic logs copied!');
                            } catch {
                              showToast('Unable to copy logs');
                            }
                          }}
                          className="border border-zinc-200 hover:border-black px-2.5 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-700 flex items-center gap-1 whitespace-nowrap"
                        >
                          <Copy size={11} /> Copy Logs
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStorageDiagLogs([]);
                            setStorageDiagReport(null);
                          }}
                          className="border border-zinc-200 hover:border-black px-2.5 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-black whitespace-nowrap"
                        >
                          Clear
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-zinc-50 border border-zinc-200 p-3 text-xs">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Expected Supabase Project ID
                    </label>
                    <input
                      type="text"
                      value={expectedProjectId}
                      onChange={(e) => setExpectedProjectId(e.target.value)}
                      placeholder={activeProjectId}
                      className="w-full border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Active Storage Config
                    </span>
                    <div className="font-mono text-[11px] text-zinc-800 break-all">
                      project: <span className="font-bold">{activeProjectId}</span>
                      <br />
                      bucket: <span className="font-bold">{activeBucketName}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Validation Status
                    </span>
                    {storageDiagReport ? (
                      <div className="text-[11px] font-mono space-y-0.5">
                        <div
                          className={
                            storageDiagReport.projectIdMatches
                              ? 'text-emerald-700 font-bold'
                              : 'text-rose-600 font-bold'
                          }
                        >
                          Project Match: {storageDiagReport.projectIdMatches ? 'VALID' : 'MISMATCH'}
                        </div>
                        <div
                          className={
                            storageDiagReport.bucketExists
                              ? 'text-emerald-700 font-bold'
                              : 'text-amber-700 font-bold'
                          }
                        >
                          Bucket ({storageDiagReport.bucketName}):{' '}
                          {storageDiagReport.bucketExists
                            ? 'CONNECTED'
                            : storageDiagReport.bucketNotFound
                            ? 'BUCKET NOT FOUND'
                            : 'UNREACHABLE'}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] font-mono text-zinc-500">
                        {expectedProjectId.trim().toLowerCase() === activeProjectId.toLowerCase()
                          ? 'Project ID matches config · Click Run to probe bucket'
                          : 'Project ID mismatch with config'}
                      </div>
                    )}
                  </div>
                </div>

                {storageDiagLogs.length > 0 && (
                  <div className="bg-zinc-950 text-zinc-100 border border-zinc-800 p-3 font-mono text-[11px] max-h-56 overflow-y-auto space-y-1">
                    {storageDiagLogs.map((entry, idx) => (
                      <div
                        key={idx}
                        className={
                          entry.level === 'error'
                            ? 'text-rose-400'
                            : entry.level === 'warn'
                            ? 'text-amber-300'
                            : entry.level === 'success'
                            ? 'text-emerald-400'
                            : 'text-zinc-300'
                        }
                      >
                        <span className="text-zinc-500">[{entry.timestamp}]</span>{' '}
                        <span className="font-bold">[{entry.step}]</span> {entry.message}
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload Request & Response Header Tracer Tool */}
                <div className="pt-4 border-t border-zinc-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 text-zinc-900">
                        <Terminal size={13} /> Upload Request &amp; Response Header Tracer
                      </h4>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Test and record exact request paths, HTTP methods, and response headers during video upload attempts.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleTraceUpload}
                      disabled={tracingUpload}
                      className="bg-black hover:bg-zinc-800 text-white px-3.5 py-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      <RefreshCw size={12} className={tracingUpload ? 'animate-spin' : ''} />
                      {tracingUpload ? 'Tracing...' : 'Trace Upload Requests'}
                    </button>
                  </div>

                  {uploadTraces.length > 0 && (
                    <div className="bg-zinc-950 text-zinc-100 border border-zinc-800 p-3.5 font-mono text-[11px] max-h-80 overflow-y-auto space-y-3">
                      {uploadTraces.map((trace, idx) => (
                        <div key={idx} className="border-b border-zinc-800 pb-2.5 last:border-0 last:pb-0 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-amber-400">
                              {trace.method} <span className="text-zinc-200">{trace.requestUrl}</span>
                            </span>
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-bold ${
                                trace.responseStatus === 200 || trace.responseStatus === 201
                                  ? 'bg-emerald-900 text-emerald-200'
                                  : 'bg-rose-900 text-rose-200'
                              }`}
                            >
                              HTTP {trace.responseStatus} {trace.responseStatusText}
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            <span className="text-zinc-500">Response Headers:</span>{' '}
                            {Object.entries(trace.responseHeaders)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(' | ') || 'None'}
                          </div>
                          {trace.responseBody && (
                            <div className="text-[10px] text-zinc-300 bg-zinc-900 p-1.5 border border-zinc-800 rounded-none overflow-x-auto">
                              {trace.responseBody}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11px] text-zinc-500">
                  Zoom out to 0.50x or zoom in to 2.50x, then save to apply live on desktop and mobile.
                </span>
                <button
                  type="button"
                  disabled={savingSettings || uploadingHeroMedia}
                  onClick={() => applyAndSyncHeroSettings({}, 'Hero media & framing saved & synced')}
                  className="bg-black text-white hover:bg-zinc-800 px-4 py-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <Save size={12} /> {savingSettings ? 'Saving...' : 'Save Hero Settings'}
                </button>
              </div>
            </div>

            {/* Studio Gallery Quick Controls & Editor Link */}
            <div className="bg-[#141414] text-[#f5efe6] p-4 sm:p-6 border border-[#2a2628] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-[#d8a39d]">
                    <ImageIcon size={16} /> Studio Gallery Bento & Animations
                  </h3>
                  <p className="text-xs text-white/60 mt-1">
                    Pick Grid Layout Mode, Title Layout Mode, and Overlapping Text Animations directly here or manage tiles in the Studio Gallery tab.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('gallery')}
                  className="w-full sm:w-auto text-center bg-[#f5efe6] text-[#141414] hover:bg-[#d8a39d] px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] transition-colors shrink-0 rounded-none"
                >
                  Open Tile Editor ({galleryState.items.length})
                </button>
              </div>

              {/* Inline Grid Layout Mode, Title Layout Mode & Overlapping Text Animation Pickers */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-[#1a1a1a] border border-white/10 p-4 space-y-2.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#d8a39d] block">
                    Grid Layout Mode
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: 'all', label: 'All Tiles' },
                        { value: 'compact', label: 'Compact Grid' },
                        { value: 'large', label: 'Featured View' },
                        { value: 'minimal', label: 'Clean Tiles' },
                      ] as { value: GalleryLayoutMode; label: string }[]
                    ).map((mode) => {
                      const active = galleryState.layoutMode === mode.value;
                      return (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={async () => {
                            await saveGalleryState({ ...galleryState, layoutMode: mode.value });
                            showToast(`Grid Layout: ${mode.label}`);
                          }}
                          className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider border transition-colors rounded-none ${
                            active
                              ? 'bg-[#f5efe6] text-[#141414] border-[#f5efe6]'
                              : 'bg-[#141414] text-white/75 border-white/10 hover:border-white/30'
                          }`}
                        >
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-[#1a1a1a] border border-white/10 p-4 space-y-2.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#d8a39d] block">
                    Title Layout Mode
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: 'tile-corner', label: 'Tile Corner' },
                        { value: 'centered', label: 'Centered Hero' },
                        { value: 'top-band', label: 'Top Band' },
                        { value: 'editorial-serif', label: 'Editorial Serif' },
                      ] as { value: GalleryTitleLayout; label: string }[]
                    ).map((mode) => {
                      const active = (galleryState.titleLayout || 'tile-corner') === mode.value;
                      return (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={async () => {
                            await saveGalleryState({ ...galleryState, titleLayout: mode.value });
                            showToast(`Title Layout: ${mode.label}`);
                          }}
                          className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider border transition-colors rounded-none ${
                            active
                              ? 'bg-[#d8a39d] text-[#141414] border-[#d8a39d]'
                              : 'bg-[#141414] text-white/75 border-white/10 hover:border-white/30'
                          }`}
                        >
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-[#1a1a1a] border border-white/10 p-4 space-y-2.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#d8a39d] block">
                    Overlapping Text Animations
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(
                      [
                        { value: 'marquee', label: 'Marquee' },
                        { value: 'pulse', label: 'Pulse' },
                        { value: 'float', label: 'Float' },
                        { value: 'fadeUp', label: 'Rise Up' },
                        { value: 'none', label: 'Static' },
                      ] as { value: GalleryTextAnimation; label: string }[]
                    ).map((anim) => {
                      const active = galleryState.textAnimation === anim.value;
                      return (
                        <button
                          key={anim.value}
                          type="button"
                          onClick={async () => {
                            await saveGalleryState({ ...galleryState, textAnimation: anim.value });
                            showToast(`Text Animation: ${anim.label}`);
                          }}
                          className={`px-2.5 py-2 text-[10px] font-black uppercase tracking-wider border transition-colors rounded-none ${
                            active
                              ? 'bg-[#f5efe6] text-[#141414] border-[#f5efe6]'
                              : 'bg-[#141414] text-white/75 border-white/10 hover:border-white/30'
                          }`}
                        >
                          {anim.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* About Us Section Settings */}
            <div className="bg-white p-4 sm:p-6 border border-zinc-200 space-y-5">
              <div className="border-b border-zinc-100 pb-2">
                <h3 className="text-sm font-black uppercase tracking-widest">
                  About Us Section (What Our Merch Means)
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Customize the heading, brand story, and optional backdrop shown in the storefront About Us section.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Section Heading
                    </label>
                    <input
                      type="text"
                      placeholder="What Our Merch Means"
                      value={formSettings.aboutUsTitle || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, aboutUsTitle: e.target.value })}
                      className="w-full border border-zinc-200 p-2.5 text-xs font-bold focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Optional Background Image URL
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        placeholder="Image URL or upload (optional)"
                        value={formSettings.editorialImageUrl || ''}
                        onChange={(e) => setFormSettings({ ...formSettings, editorialImageUrl: e.target.value })}
                        className="flex-1 min-w-0 border border-zinc-200 p-2 text-xs focus:outline-none focus:border-black"
                      />
                      <label className="bg-zinc-100 hover:bg-zinc-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest cursor-pointer shrink-0 text-center">
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const res = await handleFileUpload(file);
                              if (res) {
                                setFormSettings({ ...formSettings, editorialImageUrl: res });
                              }
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Our Story / Meaning Copy
                  </label>
                  <textarea
                    rows={5}
                    placeholder="Write what your merch means and stands for..."
                    value={formSettings.aboutUsText || ''}
                    onChange={(e) => setFormSettings({ ...formSettings, aboutUsText: e.target.value })}
                    className="w-full border border-zinc-200 p-2.5 text-xs leading-relaxed focus:outline-none focus:border-black resize-y"
                  />
                </div>
              </div>
            </div>

            {/* Campaign Visuals */}
            <div className="bg-white p-4 sm:p-6 border border-zinc-200 space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest border-b border-zinc-100 pb-2">
                Campaign & Footer Visuals
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Featured Campaign Headline
                  </label>
                  <input
                    type="text"
                    value={formSettings.featuredHeadline || ''}
                    onChange={(e) => setFormSettings({ ...formSettings, featuredHeadline: e.target.value })}
                    className="w-full border border-zinc-200 p-2 text-xs uppercase font-bold"
                  />
                  <div className="mt-2 flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Featured image URL"
                      value={formSettings.featuredImageUrl || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, featuredImageUrl: e.target.value })}
                      className="flex-1 min-w-0 border border-zinc-200 p-2 text-xs"
                    />
                    <label className="bg-zinc-100 hover:bg-zinc-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest cursor-pointer text-center shrink-0">
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const res = await handleFileUpload(file);
                            if (res) {
                              setFormSettings({ ...formSettings, featuredImageUrl: res });
                            }
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                    Footer Full-Bleed Image
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Footer image URL or upload"
                      value={formSettings.footerImageUrl || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, footerImageUrl: e.target.value })}
                      className="flex-1 min-w-0 border border-zinc-200 p-2 text-xs"
                    />
                    <label className="bg-zinc-100 hover:bg-zinc-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest cursor-pointer text-center shrink-0">
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const res = await handleFileUpload(file);
                            if (res) {
                              setFormSettings({ ...formSettings, footerImageUrl: res });
                            }
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Save Action */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingSettings}
                className="w-full sm:w-auto justify-center bg-black text-white px-7 py-3 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-colors flex items-center gap-2 shadow-sm"
              >
                <Save size={14} /> {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: API Keys Section (Supabase URL, Anon Key & Bucket -> Firestore settings/global) */}
        {activeTab === 'api-keys' && (
          <section aria-label="API Keys" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
              <div>
                <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight flex items-center gap-2">
                  <KeyRound size={18} /> API Keys
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Configure your Supabase URL, Anon Key, and Storage Bucket name and save directly to the Firestore <code className="font-mono">settings/global</code> document.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleVerifySupabaseKeys}
                  disabled={verifyingSupabaseKeys || savingSupabaseKeys}
                  className="border border-black bg-white hover:bg-zinc-100 text-black px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw size={13} className={verifyingSupabaseKeys ? 'animate-spin' : ''} />
                  {verifyingSupabaseKeys ? 'Verifying...' : 'Verify'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveSupabaseKeys}
                  disabled={savingSupabaseKeys || verifyingSupabaseKeys}
                  className="bg-black hover:bg-zinc-800 text-white px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap shadow-sm"
                >
                  <Database size={13} />
                  {savingSupabaseKeys ? 'Saving...' : 'Save to Firestore'}
                </button>
                <button
                  type="button"
                  onClick={handleResetSupabaseKeys}
                  disabled={savingSupabaseKeys || verifyingSupabaseKeys}
                  className="border border-zinc-200 hover:border-black px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-black transition-colors whitespace-nowrap"
                >
                  Reset Defaults
                </button>
              </div>
            </div>

            {apiKeyProtectionError && (
              <div className="p-3.5 bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black uppercase tracking-wider text-[11px]">Copy-Paste Protection Blocked Input</p>
                    <p className="mt-0.5 text-rose-800">{apiKeyProtectionError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setApiKeyProtectionError(null)}
                  className="text-rose-500 hover:text-rose-900 p-1 shrink-0"
                  aria-label="Dismiss protection alert"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="bg-white border border-zinc-200 p-4 sm:p-6 space-y-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-zinc-800">
                  <ShieldCheck size={14} className="text-emerald-600" />
                  Copy-Paste Protected Supabase Credentials
                </div>
                <span className="text-[10px] font-mono text-zinc-500">
                  Masked copy/cut lock active · Secret <code className="text-zinc-700">service_role</code> keys rejected
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Supabase Project URL */}
                <div className="lg:col-span-5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">
                    Supabase Project URL
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="url"
                      autoComplete="off"
                      spellCheck={false}
                      value={formSettings.supabaseUrl ?? activeSupabaseUrl}
                      placeholder="https://your-project-id.supabase.co"
                      onPaste={(e) => {
                        e.preventDefault();
                        const raw = e.clipboardData.getData('text');
                        const cleaned = sanitizePastedSupabaseUrl(raw);
                        if (cleaned) {
                          setApiKeyProtectionError(null);
                          setFormSettings({ ...formSettings, supabaseUrl: cleaned });
                          const parsedId = extractSupabaseProjectId(cleaned);
                          if (parsedId) setExpectedProjectId(parsedId);
                          showToast('Sanitized & pasted Supabase URL');
                        }
                      }}
                      onChange={(e) => {
                        const nextUrl = e.target.value;
                        setApiKeyProtectionError(null);
                        setFormSettings({ ...formSettings, supabaseUrl: nextUrl });
                        const parsedId = extractSupabaseProjectId(nextUrl);
                        if (parsedId) setExpectedProjectId(parsedId);
                      }}
                      className="flex-1 min-w-0 border border-zinc-200 bg-zinc-50 focus:bg-white px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-black"
                    />
                    <button
                      type="button"
                      title="Paste & sanitize Supabase URL"
                      onClick={async () => {
                        try {
                          const text = sanitizePastedSupabaseUrl(await navigator.clipboard.readText());
                          if (text) {
                            setApiKeyProtectionError(null);
                            setFormSettings({ ...formSettings, supabaseUrl: text });
                            const parsedId = extractSupabaseProjectId(text);
                            if (parsedId) setExpectedProjectId(parsedId);
                            showToast('Pasted Supabase URL');
                          }
                        } catch {
                          showToast('Paste URL directly into the box');
                        }
                      }}
                      className="border border-zinc-200 bg-white hover:border-black p-2.5 text-zinc-600 hover:text-black shrink-0"
                    >
                      <ClipboardPaste size={14} />
                    </button>
                  </div>
                </div>

                {/* Supabase Anon Key with Copy-Paste Protection */}
                <div className="lg:col-span-5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 flex items-center justify-between gap-2 mb-1.5">
                    <span>Supabase Anon / Publishable Key</span>
                    <span className="text-[9px] font-mono text-zinc-400">
                      {showSupabaseAnonKey ? 'Visible' : 'Copy-Locked'}
                    </span>
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type={showSupabaseAnonKey ? 'text' : 'password'}
                      autoComplete="off"
                      spellCheck={false}
                      autoCorrect="off"
                      autoCapitalize="off"
                      data-lpignore="true"
                      value={formSettings.supabaseAnonKey ?? activeSupabaseCfg.anonKey}
                      placeholder="sb_publishable_... or eyJ..."
                      onCopy={(e) => {
                        if (!showSupabaseAnonKey) {
                          e.preventDefault();
                          showToast('Copy blocked while key is hidden — click Reveal to copy');
                        }
                      }}
                      onCut={(e) => {
                        if (!showSupabaseAnonKey) {
                          e.preventDefault();
                          showToast('Cut blocked while key is hidden');
                        }
                      }}
                      onDragStart={(e) => {
                        if (!showSupabaseAnonKey) e.preventDefault();
                      }}
                      onContextMenu={(e) => {
                        if (!showSupabaseAnonKey) e.preventDefault();
                      }}
                      onPaste={(e) => {
                        e.preventDefault();
                        const raw = e.clipboardData.getData('text');
                        const cleaned = sanitizePastedCredential(raw);
                        if (!cleaned) return;
                        const secretCheck = isSecretSupabaseKey(cleaned);
                        if (secretCheck.isSecret) {
                          setApiKeyProtectionError(secretCheck.reason || 'Blocked secret key.');
                          showToast('Copy-paste protection: secret key blocked');
                          return;
                        }
                        setApiKeyProtectionError(null);
                        setFormSettings({ ...formSettings, supabaseAnonKey: cleaned });
                        showToast('Sanitized & pasted public Anon Key');
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        const secretCheck = isSecretSupabaseKey(val);
                        if (secretCheck.isSecret) {
                          setApiKeyProtectionError(secretCheck.reason || 'Blocked secret key.');
                          return;
                        }
                        setApiKeyProtectionError(null);
                        setFormSettings({ ...formSettings, supabaseAnonKey: val });
                      }}
                      className={`flex-1 min-w-0 border border-zinc-200 bg-zinc-50 focus:bg-white px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-black ${
                        !showSupabaseAnonKey ? 'select-none' : ''
                      }`}
                    />
                    <button
                      type="button"
                      title={showSupabaseAnonKey ? 'Hide & lock copy' : 'Reveal key'}
                      onClick={() => setShowSupabaseAnonKey((v) => !v)}
                      className="border border-zinc-200 bg-white hover:border-black p-2.5 text-zinc-600 hover:text-black shrink-0"
                    >
                      {showSupabaseAnonKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      type="button"
                      title="Paste & validate Anon Key"
                      onClick={async () => {
                        try {
                          const text = sanitizePastedCredential(await navigator.clipboard.readText());
                          if (!text) return;
                          const secretCheck = isSecretSupabaseKey(text);
                          if (secretCheck.isSecret) {
                            setApiKeyProtectionError(secretCheck.reason || 'Blocked secret key.');
                            showToast('Copy-paste protection: secret key blocked');
                            return;
                          }
                          setApiKeyProtectionError(null);
                          setFormSettings({ ...formSettings, supabaseAnonKey: text });
                          showToast('Pasted Supabase Anon Key');
                        } catch {
                          showToast('Paste key directly into the box');
                        }
                      }}
                      className="border border-zinc-200 bg-white hover:border-black p-2.5 text-zinc-600 hover:text-black shrink-0"
                    >
                      <ClipboardPaste size={14} />
                    </button>
                  </div>
                </div>

                {/* Storage Bucket Name */}
                <div className="lg:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">
                    Storage Bucket
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={formSettings.supabaseBucket ?? activeBucketName}
                    placeholder="media"
                    onPaste={(e) => {
                      e.preventDefault();
                      const cleaned = sanitizePastedBucketName(e.clipboardData.getData('text'));
                      if (cleaned) {
                        setFormSettings({ ...formSettings, supabaseBucket: cleaned });
                        showToast('Sanitized & pasted bucket name');
                      }
                    }}
                    onChange={(e) =>
                      setFormSettings({ ...formSettings, supabaseBucket: e.target.value })
                    }
                    className="w-full border border-zinc-200 bg-zinc-50 focus:bg-white px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              {/* Verification Status Panel */}
              {apiVerificationResult && (
                <div
                  className={`p-3.5 border text-xs space-y-2 ${
                    apiVerificationResult.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                      : apiVerificationResult.bucketNotFound
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : 'bg-rose-50 border-rose-200 text-rose-950'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-black uppercase tracking-wider text-[11px]">
                      {apiVerificationResult.ok ? (
                        <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                      )}
                      <span>{apiVerificationResult.summary}</span>
                    </div>
                    <span className="font-mono text-[10px] uppercase">
                      REST Auth: {apiVerificationResult.restAuthorized ? 'OK' : 'FAILED'} · Bucket:{' '}
                      {apiVerificationResult.bucketExists
                        ? 'CONNECTED'
                        : apiVerificationResult.bucketNotFound
                        ? 'BUCKET NOT FOUND'
                        : 'ERROR'}
                    </span>
                  </div>
                </div>
              )}

              {/* Live Connection & Storage Logs */}
              {storageDiagLogs.length > 0 && (
                <div className="bg-zinc-950 text-zinc-100 border border-zinc-800 p-3 font-mono text-[11px] max-h-56 overflow-y-auto space-y-1">
                  {storageDiagLogs.map((entry, idx) => (
                    <div
                      key={idx}
                      className={
                        entry.level === 'error'
                          ? 'text-rose-400'
                          : entry.level === 'warn'
                          ? 'text-amber-300'
                          : entry.level === 'success'
                          ? 'text-emerald-400'
                          : 'text-zinc-300'
                      }
                    >
                      <span className="text-zinc-500">[{entry.timestamp}]</span>{' '}
                      <span className="font-bold">[{entry.step}]</span> {entry.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Product Add / Edit Modal */}
        {isEditingProduct && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="relative w-full max-w-3xl max-h-[90vh] bg-white border border-zinc-200 shadow-2xl overflow-y-auto p-4 sm:p-6 md:p-8 rounded-none">
              <div className="flex items-center justify-between mb-6 pb-2 border-b border-zinc-200">
                <h3 className="text-lg font-black uppercase tracking-tight">
                  {formProduct.id ? 'Edit Garment Details' : 'Add New Garment to Catalog'}
                </h3>
                <button
                  onClick={() => {
                    setIsEditingProduct(false);
                    setFormProduct({});
                  }}
                  className="p-1.5 text-zinc-400 hover:text-black transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitProduct} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Garment Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Heavyweight Boxy Tee"
                      value={formProduct.name || ''}
                      onChange={(e) => setFormProduct({ ...formProduct, name: e.target.value })}
                      className="w-full border border-zinc-200 p-2.5 text-xs font-bold uppercase focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Price (MK) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="1"
                      placeholder="e.g. 120"
                      value={formProduct.price ?? ''}
                      onChange={(e) => setFormProduct({ ...formProduct, price: Number(e.target.value) })}
                      className="w-full border border-zinc-200 p-2.5 text-xs font-mono font-bold focus:outline-none focus:border-black"
                    />
                  </div>
                </div>

                {/* Category Selection */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1.5">
                    Category Preset
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {STANDARD_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFormProduct({ ...formProduct, category: cat })}
                        className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest border transition-all ${
                          formProduct.category === cat
                            ? 'bg-black text-white border-black'
                            : 'bg-white text-zinc-600 border-zinc-200 hover:border-black'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Custom Category name..."
                    value={formProduct.category || ''}
                    onChange={(e) => setFormProduct({ ...formProduct, category: e.target.value.toUpperCase() })}
                    className="w-full border border-zinc-200 p-2 text-xs font-bold uppercase focus:outline-none focus:border-black"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Collection Line
                    </label>
                    <select
                      value={formProduct.collection || 'legacy'}
                      onChange={(e) => setFormProduct({ ...formProduct, collection: e.target.value as any })}
                      className="w-full border border-zinc-200 p-2.5 text-xs uppercase font-bold focus:outline-none focus:border-black"
                    >
                      <option value="legacy">BrotherHood Collection (Main Page)</option>
                      <option value="featured">Featured Collaboration</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Swatch / Fallback Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formProduct.imageColor || '#F8F7F3'}
                        onChange={(e) => setFormProduct({ ...formProduct, imageColor: e.target.value })}
                        className="w-9 h-9 border border-zinc-200 cursor-pointer shrink-0"
                      />
                      <input
                        type="text"
                        value={formProduct.imageColor || '#F8F7F3'}
                        onChange={(e) => setFormProduct({ ...formProduct, imageColor: e.target.value })}
                        className="flex-1 min-w-0 border border-zinc-200 p-2 text-xs font-mono uppercase"
                      />
                    </div>
                  </div>
                </div>

                {/* Primary Image & Multi-Angle Gallery */}
                <div className="space-y-4 pt-4 border-t border-zinc-100">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-700">
                      Product Photos & Gallery Angles
                    </label>
                    <label className="text-[10px] font-black uppercase tracking-widest bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 cursor-pointer flex items-center gap-1.5 transition-colors">
                      <Plus size={12} /> Upload Additional Angle
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const uri = await handleFileUpload(file);
                            if (uri) {
                              if (!formProduct.imageUrl) {
                                setFormProduct({ ...formProduct, imageUrl: uri });
                              } else {
                                const gallery = formProduct.galleryImages || [];
                                setFormProduct({ ...formProduct, galleryImages: [...gallery, uri] });
                              }
                            }
                          }
                        }}
                      />
                    </label>
                  </div>

                  {/* Primary Image Slot */}
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                      Primary Front Image (URL or Direct Upload)
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        placeholder="https://... or upload local image"
                        value={formProduct.imageUrl || ''}
                        onChange={(e) => setFormProduct({ ...formProduct, imageUrl: e.target.value })}
                        className="flex-1 min-w-0 border border-zinc-200 p-2 text-xs font-mono focus:outline-none focus:border-black"
                      />
                      <label className="bg-black text-white hover:bg-zinc-800 px-4 py-2 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors flex items-center justify-center gap-1.5 shrink-0">
                        <Upload size={12} /> Upload File
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const uri = await handleFileUpload(file);
                              if (uri) {
                                setFormProduct({ ...formProduct, imageUrl: uri });
                              }
                            }
                          }}
                        />
                      </label>
                    </div>

                    {formProduct.imageUrl && (
                      <div className="mt-3 p-3 bg-zinc-50 border border-zinc-200 flex items-center gap-4">
                        <div className="w-14 h-16 bg-white border border-zinc-200 overflow-hidden shrink-0">
                          <ResolvedImage src={formProduct.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                          Primary image attached
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Additional Gallery Thumbnails */}
                  {(formProduct.galleryImages || []).length > 0 && (
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block">
                        Additional Angles ({formProduct.galleryImages?.length})
                      </label>
                      <div className="flex flex-wrap gap-3">
                        {formProduct.galleryImages?.map((img, idx) => (
                          <div key={idx} className="relative w-16 h-20 bg-zinc-100 border border-zinc-200 group">
                            <ResolvedImage src={img} alt="Angle" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => {
                                const next = (formProduct.galleryImages || []).filter((_, i) => i !== idx);
                                setFormProduct({ ...formProduct, galleryImages: next });
                              }}
                              className="absolute top-0 right-0 bg-black text-white p-1 hover:bg-rose-600 transition-colors"
                              title="Remove angle"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Sizing Inventory Matrix */}
                <div className="space-y-3 pt-4 border-t border-zinc-100">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-700">
                      Size Inventory Tracking
                    </label>
                    <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
                      Total Units:{' '}
                      {(formProduct.variants || []).reduce((acc, v) => acc + (Number(v.stock) || 0), 0)}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {ALL_SIZES.map((size) => {
                      const v = (formProduct.variants || []).find((item) => item.size === size);
                      const currentStock = v ? v.stock : 0;
                      return (
                        <div key={size} className="border border-zinc-200 p-2 text-center bg-zinc-50">
                          <span className="text-[10px] font-black uppercase text-zinc-500 block mb-1">
                            {size}
                          </span>
                          <input
                            type="number"
                            min="0"
                            value={currentStock}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              const existingVariants = [...(formProduct.variants || [])];
                              const foundIdx = existingVariants.findIndex((it) => it.size === size);
                              if (foundIdx >= 0) {
                                existingVariants[foundIdx].stock = val;
                              } else {
                                existingVariants.push({ size, stock: val });
                              }
                              setFormProduct({ ...formProduct, variants: existingVariants });
                            }}
                            className="w-full text-center font-mono font-bold text-xs p-1 border border-zinc-200 bg-white focus:outline-none focus:border-black"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-6 border-t border-zinc-200">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingProduct(false);
                      setFormProduct({});
                    }}
                    className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-black"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingProduct}
                    className="bg-black text-white px-7 py-2.5 text-xs font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-colors flex items-center gap-2 shadow-md"
                  >
                    {savingProduct ? 'Saving...' : formProduct.id ? 'Save Changes' : 'Add Garment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Tab 3: Creators Club Management */}
        {activeTab === 'creators' && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">Creators Club & Model Archive</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Manage model photos, video clips, social handles (@handle), and tagged garments featured in the Creators Club gallery.
                </p>
              </div>
              <button
                onClick={handleOpenAddCreatorPost}
                className="bg-black text-white px-6 py-3 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 shadow-md shrink-0 rounded-none"
              >
                <Plus size={16} /> Add Creator Fit
              </button>
            </div>

            {/* Creators Table / Grid */}
            {creatorPosts.length === 0 ? (
              <div className="bg-white border border-zinc-200 p-12 text-center space-y-4">
                <ImageIcon size={40} className="mx-auto text-zinc-300" />
                <h3 className="text-sm font-black uppercase tracking-widest text-black">
                  No Creator Posts Archived
                </h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Click below to add model or community member fits to the Creators Club section.
                </p>
                <button
                  onClick={handleOpenAddCreatorPost}
                  className="bg-black text-white px-6 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-colors"
                >
                  Add Creator Fit
                </button>
              </div>
            ) : (
              <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-4 -mx-4 px-4 pb-3 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
                {creatorPosts.map((post) => (
                  <div
                    key={post.id}
                    className="w-[75vw] max-w-[300px] shrink-0 snap-start sm:w-auto sm:max-w-none bg-white border border-zinc-200 p-4 flex flex-col justify-between shadow-sm"
                  >
                    <div className="space-y-3">
                      <div className="relative aspect-[3/4] bg-zinc-900 border border-zinc-200 overflow-hidden">
                        {post.isVideo || post.mediaUrl.endsWith('.mp4') || post.mediaUrl.startsWith('idb://vid_') ? (
                          <ResolvedVideo src={post.mediaUrl} muted loop playsInline autoPlay className="w-full h-full object-cover" />
                        ) : (
                          <ResolvedImage src={post.mediaUrl} alt={post.creatorName} className="w-full h-full object-cover" />
                        )}
                        <div className="absolute top-2 left-2 bg-black/80 text-white text-[9px] font-mono px-2 py-0.5">
                          {post.handle}
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold uppercase tracking-wider text-black">{post.creatorName}</h4>
                        <p className="text-xs text-zinc-500 line-clamp-2 mt-0.5 font-light">"{post.caption || 'No caption'}"</p>
                      </div>

                      {post.taggedProductIds && post.taggedProductIds.length > 0 && (
                        <div className="text-[10px] font-bold uppercase text-zinc-400">
                          Tagged: {post.taggedProductIds.length} Garment(s)
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-100 mt-4">
                      <button
                        onClick={() => handleOpenEditCreatorPost(post)}
                        className="p-2 text-zinc-600 hover:text-black hover:bg-zinc-100 transition-colors"
                        title="Edit Fit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setCreatorPostToDelete(post)}
                        className="p-2 text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Delete Fit"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Creator Post Add/Edit Modal */}
        {isEditingCreatorPost && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="relative w-full max-w-lg bg-white border border-zinc-200 p-4 sm:p-6 md:p-8 shadow-2xl rounded-none text-black animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => {
                  setIsEditingCreatorPost(false);
                  setFormCreatorPost({});
                }}
                className="absolute top-4 right-4 text-zinc-400 hover:text-black"
              >
                <X size={20} />
              </button>

              <h3 className="text-xl font-black uppercase tracking-tight mb-4">
                {formCreatorPost.id ? 'Edit Creator Fit' : 'Add Creator Fit'}
              </h3>

              <form onSubmit={handleSaveCreatorPostSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-black uppercase tracking-widest text-[9px] text-zinc-500 mb-1">
                    Model / Creator Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Marcus Vance"
                    value={formCreatorPost.creatorName || ''}
                    onChange={(e) => setFormCreatorPost({ ...formCreatorPost, creatorName: e.target.value })}
                    className="w-full border border-zinc-300 p-2 text-xs uppercase tracking-wider focus:outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="block font-black uppercase tracking-widest text-[9px] text-zinc-500 mb-1">
                    Social Handle *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="@marcus_fitz"
                    value={formCreatorPost.handle || ''}
                    onChange={(e) => setFormCreatorPost({ ...formCreatorPost, handle: e.target.value })}
                    className="w-full border border-zinc-300 p-2 text-xs focus:outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="block font-black uppercase tracking-widest text-[9px] text-zinc-500 mb-1">
                    Media File / URL *
                  </label>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="cursor-pointer bg-zinc-100 hover:bg-zinc-200 text-black px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-zinc-300">
                      Upload File
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const url = await handleFileUpload(file);
                            if (url) {
                              setFormCreatorPost({
                                ...formCreatorPost,
                                mediaUrl: url,
                                isVideo: detectIsVideoFile(file),
                              });
                            }
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="https://... or data:..."
                    value={formCreatorPost.mediaUrl || ''}
                    onChange={(e) => setFormCreatorPost({ ...formCreatorPost, mediaUrl: e.target.value })}
                    className="w-full border border-zinc-300 p-2 text-xs focus:outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="block font-black uppercase tracking-widest text-[9px] text-zinc-500 mb-1">
                    Caption
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Fit description..."
                    value={formCreatorPost.caption || ''}
                    onChange={(e) => setFormCreatorPost({ ...formCreatorPost, caption: e.target.value })}
                    className="w-full border border-zinc-300 p-2 text-xs focus:outline-none focus:border-black resize-none"
                  />
                </div>

                <div>
                  <label className="block font-black uppercase tracking-widest text-[9px] text-zinc-500 mb-1">
                    Tagged Garment
                  </label>
                  <select
                    value={formCreatorPost.taggedProductIds?.[0] || ''}
                    onChange={(e) =>
                      setFormCreatorPost({
                        ...formCreatorPost,
                        taggedProductIds: e.target.value ? [e.target.value] : [],
                      })
                    }
                    className="w-full border border-zinc-300 p-2 text-xs uppercase focus:outline-none focus:border-black"
                  >
                    <option value="">No Tagged Garment</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingCreatorPost(false);
                      setFormCreatorPost({});
                    }}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-black"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingCreatorPost}
                    className="bg-black text-white px-6 py-2 text-xs font-black uppercase tracking-widest hover:bg-zinc-800 transition-colors"
                  >
                    {savingCreatorPost ? 'Saving...' : 'Save Creator Fit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Creator Post Delete Modal */}
        {creatorPostToDelete && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="relative w-full max-w-md bg-white border border-zinc-200 p-6 shadow-2xl rounded-none text-black">
              <h3 className="text-base font-black uppercase tracking-tight text-rose-600 mb-2">Delete Creator Fit</h3>
              <p className="text-xs text-zinc-600 mb-6">
                Delete creator fit by <strong className="text-black">{creatorPostToDelete.creatorName}</strong> ({creatorPostToDelete.handle})?
              </p>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setCreatorPostToDelete(null)}
                  className="px-4 py-2 text-xs font-bold uppercase text-zinc-500 hover:text-black"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDeleteCreatorPost}
                  className="bg-rose-600 text-white px-5 py-2 text-xs font-black uppercase tracking-widest hover:bg-rose-700"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* In-App Delete Confirmation Modal (Reliable in iFrame) */}
        {productToDelete && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div
              className="relative w-full max-w-md bg-white border border-zinc-200 p-6 md:p-8 shadow-2xl rounded-none text-black animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 text-rose-600 mb-4">
                <AlertTriangle size={24} />
                <h3 className="text-base font-black uppercase tracking-tight">Delete Garment</h3>
              </div>

              <p className="text-xs text-zinc-600 mb-6 leading-relaxed">
                Are you sure you want to permanently delete{' '}
                <strong className="text-black">"{productToDelete.name}"</strong>? This will remove it
                from the catalog, storefront, and search immediately.
              </p>

              {/* Garment Preview Card */}
              <div className="flex items-center gap-4 p-3 bg-zinc-50 border border-zinc-200 mb-6">
                <div className="w-12 h-14 bg-zinc-100 border border-zinc-200 shrink-0 overflow-hidden">
                  {productToDelete.imageUrl ? (
                    <ResolvedImage
                      src={productToDelete.imageUrl}
                      alt={productToDelete.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div style={{ backgroundColor: productToDelete.imageColor }} className="w-full h-full" />
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-black line-clamp-1">
                    {productToDelete.name}
                  </h4>
                  <div className="text-[10px] font-mono text-zinc-400 font-bold tabular-nums">
                    {formatPrice(productToDelete.price)} · {productToDelete.category}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setProductToDelete(null)}
                  className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-black transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-6 py-2.5 text-xs font-black uppercase tracking-[0.2em] transition-colors flex items-center gap-2 shadow-md"
                >
                  <Trash2 size={14} />
                  {isDeleting ? 'Deleting...' : 'Delete Garment'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
