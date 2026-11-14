import React, { useState } from 'react';
import { X, Upload, CheckCircle2, User, AtSign, MessageSquare, Tag, MessageCircle, ExternalLink } from 'lucide-react';
import { Product, CreatorPost, Settings } from '../../types';
import { resolveStoreWhatsAppDigits, buildWhatsAppDirectUrl } from '../../utils';
import { uploadMediaToSupabase } from '../../supabaseSync';

interface CreatorSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: Settings;
  onSubmitPost: (post: Omit<CreatorPost, 'id' | 'createdAt'>) => Promise<void>;
}

export const CreatorSubmissionModal: React.FC<CreatorSubmissionModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
}) => {
  const [creatorName, setCreatorName] = useState('');
  const [handle, setHandle] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedWhatsappUrl, setSubmittedWhatsappUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [uploadPercent, setUploadPercent] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);
    setIsUploadingMedia(true);
    setUploadPercent(0);
    try {
      const uploadRes = await uploadMediaToSupabase(file, file.name, {
        onProgress: (pct) => setUploadPercent(pct),
      });
      if (uploadRes.url) {
        setMediaUrl(uploadRes.url);
      } else {
        setErrorMessage(uploadRes.error || 'Could not process media file.');
      }
    } catch {
      setErrorMessage('Failed to upload media file.');
    } finally {
      setIsUploadingMedia(false);
      setUploadPercent(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creatorName.trim() || !handle.trim() || !mediaUrl.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    const formattedHandle = handle.startsWith('@') ? handle : `@${handle}`;
    const matchedProduct = products.find((p) => p.id === selectedProductId);

    const whatsappDigits = resolveStoreWhatsAppDigits(settings);
    const cleanMediaNote = mediaUrl.startsWith('data:')
      ? '[Uploaded photo attached in portal]'
      : mediaUrl.trim();
    const orderLines = [
      `*New Creator Fit Submission — ${settings.brandName || 'BROTHERHOOD'}*`,
      '',
      `Name: ${creatorName.trim()}`,
      `Handle: ${formattedHandle.trim()}`,
      `Caption: ${caption.trim() || 'None'}`,
      `Tagged Garment: ${matchedProduct ? matchedProduct.name : 'None'}`,
      `Media URL/File: ${cleanMediaNote}`,
      '',
      `_Please verify this fit and add it in the Admin panel._`,
    ];
    const whatsappText = orderLines.join('\n');
    const whatsappUrl = buildWhatsAppDirectUrl(whatsappDigits, whatsappText);

    if (!whatsappUrl) {
      setErrorMessage('Store WhatsApp number is not configured in Admin Settings yet.');
      setIsSubmitting(false);
      return;
    }

    try {
      setSubmittedWhatsappUrl(whatsappUrl);
      const linkEl = document.createElement('a');
      linkEl.href = whatsappUrl;
      linkEl.target = '_blank';
      linkEl.rel = 'noopener noreferrer';
      document.body.appendChild(linkEl);
      linkEl.click();
      document.body.removeChild(linkEl);

      setIsSuccess(true);
    } catch (err) {
      console.error('Failed to send creator submission to WhatsApp:', err);
      setErrorMessage('Could not open WhatsApp. Use the button below to send manually.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/20 p-6 sm:p-8 text-white shadow-2xl overflow-hidden rounded-none">
        <button
          onClick={() => {
            setIsSuccess(false);
            onClose();
          }}
          className="absolute top-4 right-4 p-2 text-white/60 hover:text-white transition-colors"
          aria-label="Close modal"
        >
          <X size={20} />
        </button>

        {isSuccess ? (
          <div className="py-10 text-center space-y-5">
            <CheckCircle2 size={56} className="mx-auto text-emerald-400" />
            <h3 className="text-2xl font-black uppercase tracking-tight">Ready for WhatsApp Review</h3>
            <p className="text-xs text-white/70 max-w-xs mx-auto uppercase tracking-wider">
              Your fit details are prepared for WhatsApp review before publishing.
            </p>
            {submittedWhatsappUrl && (
              <div className="flex flex-col items-center gap-3 pt-2">
                <a
                  href={submittedWhatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#25D366] hover:bg-[#20bd5a] text-white px-6 py-3 text-xs font-black uppercase tracking-[0.2em] inline-flex items-center gap-2 transition-colors"
                >
                  <MessageCircle size={15} />
                  <span>Open WhatsApp</span>
                  <ExternalLink size={13} />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setIsSuccess(false);
                    setCreatorName('');
                    setHandle('');
                    setMediaUrl('');
                    setCaption('');
                    setSelectedProductId('');
                    onClose();
                  }}
                  className="text-[10px] font-bold uppercase tracking-widest text-white/50 hover:text-white"
                >
                  Done & Close
                </button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-1">
                <span>Brotherhood</span>
                <span aria-hidden="true">·</span>
                <span>Creators Club</span>
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight">Submit Your Merch Fit</h3>
              <p className="text-xs text-white/60 mt-1">
                Post your photo or video wearing Brotherhood gear to be featured in our official community gallery.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/60 mb-1">
                  Model / Creator Name *
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    required
                    placeholder="Marcus Vance"
                    value={creatorName}
                    onChange={(e) => setCreatorName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 pl-9 pr-3 py-2 text-xs uppercase tracking-wider text-white focus:outline-none focus:border-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/60 mb-1">
                  Social Handle *
                </label>
                <div className="relative">
                  <AtSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    required
                    placeholder="@marcus_fitz"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/60 mb-1">
                Upload Photo or Video *
              </label>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer bg-white text-black px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 transition-colors flex items-center gap-2 shrink-0">
                    <Upload size={14} /> Choose File
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[10px] text-white/40 truncate">
                    {isUploadingMedia
                      ? uploadPercent !== null
                        ? `Uploading media... ${uploadPercent}%`
                        : 'Uploading & syncing media...'
                      : mediaUrl
                      ? 'Media Loaded Ready'
                      : 'PNG, JPG, MP4 supported'}
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="Or paste image/video URL (https://...)"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/60 mb-1">
                  Caption / Fit Details
                </label>
                <div className="relative">
                  <MessageSquare size={14} className="absolute left-3 top-3 text-white/40" />
                  <textarea
                    rows={2}
                    placeholder="Heavyweight hoodie styled with raw denim..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-white resize-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/60 mb-1">
                  Tagged Brotherhood Garment
                </label>
                <div className="relative">
                  <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full bg-zinc-800 border border-white/10 pl-9 pr-3 py-2 text-xs uppercase tracking-wider text-white focus:outline-none focus:border-white"
                  >
                    <option value="">None / Multiple Garments</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {errorMessage && (
              <p className="text-xs text-rose-400 font-medium">{errorMessage}</p>
            )}

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isUploadingMedia || !mediaUrl.trim()}
                className="bg-white text-black px-6 py-2.5 text-xs font-black uppercase tracking-[0.18em] hover:bg-zinc-200 transition-colors disabled:opacity-40"
              >
                {isSubmitting ? 'Publishing...' : 'Submit Fit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
