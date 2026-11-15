import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Upload,
  Check,
  RotateCcw,
  Image as ImageIcon,
  Video as VideoIcon,
  LayoutGrid,
  Sparkles,
} from 'lucide-react';
import {
  GalleryLayoutMode,
  GalleryTextAnimation,
  GalleryTextPosition,
  GalleryTileSize,
  GalleryTitleLayout,
  StudioGalleryItem,
  StudioGalleryState,
} from '../../types';
import { ResolvedImage, ResolvedVideo } from '../common/ResolvedMedia';
import { inferMediaType } from '../../hooks/useStudioGalleryState';
import { uploadMediaToSupabase, detectIsVideoFile } from '../../supabaseSync';
import { compressImageForCrossDevice } from '../../utils';

interface StudioGalleryAdminProps {
  state: StudioGalleryState;
  onSaveAndApply: (nextState: StudioGalleryState) => Promise<void> | void;
  onShowToast?: (msg: string) => void;
}

const LAYOUT_MODES: { value: GalleryLayoutMode; label: string; hint: string }[] = [
  { value: 'all', label: 'All Tiles', hint: 'Asymmetric 4-col bento' },
  { value: 'compact', label: 'Compact Grid', hint: 'Uniform 1x1 matrix' },
  { value: 'large', label: 'Featured View', hint: 'Large 2-col showcase' },
  { value: 'minimal', label: 'Clean Tiles', hint: 'Text reveals on hover' },
];

const TITLE_LAYOUT_MODES: { value: GalleryTitleLayout; label: string; hint: string }[] = [
  { value: 'tile-corner', label: 'Tile Corner', hint: 'Uses per-tile corner' },
  { value: 'centered', label: 'Centered Hero', hint: 'Dead-center dramatic' },
  { value: 'top-band', label: 'Top Band', hint: 'Upper editorial edge' },
  { value: 'editorial-serif', label: 'Editorial Serif', hint: 'Italic serif signature' },
];

const TEXT_ANIMATIONS: { value: GalleryTextAnimation; label: string }[] = [
  { value: 'marquee', label: 'Hero Marquee' },
  { value: 'pulse', label: 'Pulse Glow' },
  { value: 'float', label: 'Float Drift' },
  { value: 'fadeUp', label: 'Rise Up' },
  { value: 'none', label: 'Static' },
];

const TILE_SIZES: { value: GalleryTileSize; label: string }[] = [
  { value: '1x1', label: '1×1 Square' },
  { value: '2x1', label: '2×1 Wide' },
  { value: '1x2', label: '1×2 Tall' },
  { value: '2x2', label: '2×2 Hero' },
];

const TEXT_POSITIONS: { value: GalleryTextPosition; label: string }[] = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-center', label: 'Top Center' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-center', label: 'Bottom Center' },
  { value: 'bottom-right', label: 'Bottom Right' },
];

export const StudioGalleryAdmin: React.FC<StudioGalleryAdminProps> = ({
  state,
  onSaveAndApply,
  onShowToast,
}) => {
  const [draft, setDraft] = useState<StudioGalleryState>(state);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sync external persistent state into draft when there are no pending unsaved edits
  useEffect(() => {
    if (!isDirty) {
      setDraft(state);
    }
  }, [state, isDirty]);

  const updateDraft = (updater: (prev: StudioGalleryState) => StudioGalleryState) => {
    setIsDirty(true);
    setDraft((prev) => updater(prev));
  };

  const handleAddTile = () => {
    const newItem: StudioGalleryItem = {
      id: `tile-${Date.now()}`,
      title: 'New Studio Frame',
      subtitle: 'Capsule Look',
      image: '',
      mediaType: 'image',
      size: '1x1',
      textPosition: 'bottom-left',
    };
    updateDraft((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
  };

  const handleRemoveTile = (id: string) => {
    updateDraft((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== id),
    }));
  };

  const handleTileChange = <K extends keyof StudioGalleryItem>(
    id: string,
    field: K,
    value: StudioGalleryItem[K]
  ) => {
    updateDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== id) return item;
        const nextItem: StudioGalleryItem = { ...item, [field]: value };
        if (field === 'image' && typeof value === 'string') {
          nextItem.mediaType = inferMediaType(value);
          if (!value.startsWith('idb://') && !value.startsWith('data:')) {
            nextItem.mediaMetadata = {
              source: 'url',
            };
          }
        }
        return nextItem;
      }),
    }));
  };

  const handleUploadTileMedia = async (id: string, file: File) => {
    try {
      const isVideoFile = detectIsVideoFile(file);
      const metadata: StudioGalleryItem['mediaMetadata'] = {
        mimeType: file.type || (isVideoFile ? 'video/mp4' : 'image/jpeg'),
        fileName: file.name,
        sizeBytes: file.size,
        source: 'upload',
      };

      onShowToast?.(isVideoFile ? 'Uploading video...' : 'Uploading photo...');

      const uploadRes = await uploadMediaToSupabase(file, file.name);
      if (!uploadRes.url) {
        onShowToast?.(uploadRes.error || 'Could not upload media.');
        return;
      }

      updateDraft((prev) => ({
        ...prev,
        items: prev.items.map((item) =>
          item.id === id
            ? {
                ...item,
                image: uploadRes.url,
                mediaType: isVideoFile ? 'video' : 'image',
                mediaMetadata: metadata,
              }
            : item
        ),
      }));
      onShowToast?.(
        uploadRes.source === 'supabase'
          ? `${isVideoFile ? 'Video' : 'Photo'} synced to Supabase — click Save & Apply`
          : uploadRes.source === 'server'
          ? `${isVideoFile ? 'Video' : 'Photo'} uploaded — click Save & Apply`
          : uploadRes.source === 'local'
          ? `${isVideoFile ? 'Video' : 'Photo'} uploaded — click Save & Apply`
          : 'Media optimized for all devices — click Save & Apply'
      );
    } catch (err) {
      console.error('Failed to process uploaded media:', err);
      onShowToast?.('Failed to read media file');
    }
  };

  const handleDiscardDraft = () => {
    setDraft(state);
    setIsDirty(false);
    onShowToast?.('Reverted draft changes');
  };

  const handleCommitSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      const sanitizedItems = await Promise.all(
        draft.items.map(async (item, idx) => {
          let mediaSrc = item.image || '';
          const mediaType = inferMediaType(mediaSrc, item.mediaType);
          if (mediaSrc.startsWith('data:')) {
            const uploaded = await uploadMediaToSupabase(
              mediaSrc,
              item.mediaMetadata?.fileName || `studio_tile_${item.id || idx}`
            );
            if (uploaded.url) {
              mediaSrc = uploaded.url;
            } else if (mediaType === 'image') {
              mediaSrc = await compressImageForCrossDevice(mediaSrc, 155000);
            }
          }
          return {
            id: item.id || `tile-${idx + 1}`,
            title: item.title || '',
            subtitle: item.subtitle || '',
            image: mediaSrc,
            mediaType,
            ...(item.mediaMetadata ? { mediaMetadata: item.mediaMetadata } : {}),
            size: item.size || '1x1',
            textPosition: item.textPosition || 'bottom-left',
          };
        })
      );

      const cleanDraft: StudioGalleryState = {
        layoutMode: draft.layoutMode || 'all',
        titleLayout: draft.titleLayout || 'tile-corner',
        textAnimation: draft.textAnimation || 'fadeUp',
        kicker: draft.kicker ?? '',
        headerTitle: draft.headerTitle ?? '',
        headerDescription: draft.headerDescription ?? '',
        items: sanitizedItems,
      };

      await onSaveAndApply(cleanDraft);
      setDraft(cleanDraft);
      setIsDirty(false);
      onShowToast?.('Studio Gallery saved & synced across devices!');
    } catch (err) {
      console.error('Failed to save Studio Gallery:', err);
      onShowToast?.('Error saving Studio Gallery. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleCommitSave}
      className="bg-[#141414] text-[#f5efe6] border border-[#2a2628] p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8 rounded-none shadow-2xl"
    >
      {/* Top Action Header (Sticky on desktop only so mobile scrolling stays unobstructed) */}
      <div className="lg:sticky lg:top-20 z-30 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 md:-mx-8 md:-mt-8 px-4 sm:px-6 md:px-8 py-4 sm:py-5 bg-[#141414]/95 backdrop-blur-md border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-[#d8a39d] mb-1">
            <span>Studio Gallery Editor</span>
            <span aria-hidden="true">·</span>
            {isDirty ? (
              <span className="text-amber-300">Unsaved Changes</span>
            ) : (
              <span className="text-emerald-400">Saved & Live</span>
            )}
          </div>
          <h2 className="text-lg sm:text-xl md:text-2xl font-extrabold uppercase tracking-tight font-sans">
            Bento Grid, Video & Motion Controls
          </h2>
          <p className="text-xs text-white/60 mt-1">
            Stage modes, upload photos or looping videos, and click Save & Apply to sync with Firestore.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
          {isDirty && (
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="border border-white/20 text-white/80 hover:text-white hover:border-white px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5 transition-colors rounded-none"
            >
              <RotateCcw size={13} /> Discard Draft
            </button>
          )}
          <button
            type="button"
            onClick={handleAddTile}
            className="border border-[#d8a39d]/50 text-[#d8a39d] hover:bg-[#d8a39d] hover:text-[#141414] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5 transition-colors rounded-none"
          >
            <Plus size={14} /> Add Tile
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className={`px-6 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 transition-colors rounded-none shadow-lg disabled:opacity-50 ${
              isDirty
                ? 'bg-[#d8a39d] text-[#141414] hover:bg-[#f5efe6]'
                : 'bg-[#f5efe6] text-[#141414] hover:bg-[#d8a39d]'
            }`}
          >
            <Check size={14} />
            {isSaving ? 'Saving...' : isDirty ? 'Save & Apply Changes' : 'Save & Apply'}
          </button>
        </div>
      </div>

      {/* Global Mode Pickers */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
        {/* Grid Layout Mode Selector */}
        <div className="bg-[#1a1a1a] border border-white/10 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-[#d8a39d]">
            <LayoutGrid size={13} />
            <span>Grid Layout Mode</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {LAYOUT_MODES.map((mode) => {
              const active = draft.layoutMode === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => updateDraft((prev) => ({ ...prev, layoutMode: mode.value }))}
                  className={`p-3 text-left border transition-colors rounded-none ${
                    active
                      ? 'bg-[#f5efe6] text-[#141414] border-[#f5efe6]'
                      : 'bg-[#141414] text-white/75 border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className="text-[11px] font-black uppercase tracking-wider">{mode.label}</div>
                  <div
                    className={`text-[9px] mt-0.5 ${
                      active ? 'text-[#141414]/75' : 'text-white/40'
                    }`}
                  >
                    {mode.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Title Layout Mode Selector */}
        <div className="bg-[#1a1a1a] border border-white/10 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-[#d8a39d]">
            <LayoutGrid size={13} />
            <span>Title Layout Mode</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {TITLE_LAYOUT_MODES.map((mode) => {
              const active = (draft.titleLayout || 'tile-corner') === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => updateDraft((prev) => ({ ...prev, titleLayout: mode.value }))}
                  className={`p-3 text-left border transition-colors rounded-none ${
                    active
                      ? 'bg-[#d8a39d] text-[#141414] border-[#d8a39d]'
                      : 'bg-[#141414] text-white/75 border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className="text-[11px] font-black uppercase tracking-wider">{mode.label}</div>
                  <div
                    className={`text-[9px] mt-0.5 ${
                      active ? 'text-[#141414]/75' : 'text-white/40'
                    }`}
                  >
                    {mode.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Overlapping Text Animation Selector */}
        <div className="bg-[#1a1a1a] border border-white/10 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-[#d8a39d]">
            <Sparkles size={13} />
            <span>Overlapping Text Animation</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TEXT_ANIMATIONS.map((anim) => {
              const active = draft.textAnimation === anim.value;
              return (
                <button
                  key={anim.value}
                  type="button"
                  onClick={() => updateDraft((prev) => ({ ...prev, textAnimation: anim.value }))}
                  className={`px-3 py-3 text-center border text-[10px] font-black uppercase tracking-wider transition-colors rounded-none ${
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

      {/* Editorial Section Copy */}
      <div className="bg-[#1a1a1a] border border-white/10 p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-[9px] font-black uppercase tracking-[0.25em] text-white/50 mb-1.5">
            Section Kicker
          </label>
          <input
            type="text"
            value={draft.kicker || ''}
            onChange={(e) => updateDraft((prev) => ({ ...prev, kicker: e.target.value }))}
            placeholder="Editorial Archive"
            className="w-full bg-[#141414] border border-white/15 px-3 py-2 text-xs text-[#f5efe6] focus:outline-none focus:border-[#d8a39d]"
          />
        </div>
        <div>
          <label className="block text-[9px] font-black uppercase tracking-[0.25em] text-white/50 mb-1.5">
            Display Title
          </label>
          <input
            type="text"
            value={draft.headerTitle || ''}
            onChange={(e) => updateDraft((prev) => ({ ...prev, headerTitle: e.target.value }))}
            placeholder="Studio Gallery"
            className="w-full bg-[#141414] border border-white/15 px-3 py-2 text-xs font-bold uppercase text-[#f5efe6] focus:outline-none focus:border-[#d8a39d]"
          />
        </div>
        <div>
          <label className="block text-[9px] font-black uppercase tracking-[0.25em] text-white/50 mb-1.5">
            Lead Description
          </label>
          <input
            type="text"
            value={draft.headerDescription || ''}
            onChange={(e) =>
              updateDraft((prev) => ({ ...prev, headerDescription: e.target.value }))
            }
            placeholder="Brief editorial lead..."
            className="w-full bg-[#141414] border border-white/15 px-3 py-2 text-xs text-[#f5efe6] focus:outline-none focus:border-[#d8a39d]"
          />
        </div>
      </div>

      {/* Tile Cards Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/60">
            Bento Tiles ({draft.items.length})
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {draft.items.map((item, idx) => {
            const hasMedia = Boolean(item.image && item.image.trim().length > 0);
            const mediaType = inferMediaType(item.image, item.mediaType);

            return (
              <div
                key={item.id}
                className="bg-[#1a1a1a] border border-white/10 p-4 flex flex-col gap-4 rounded-none"
              >
                {/* Thumbnail / Video Preview + Delete */}
                <div className="relative aspect-[16/10] w-full bg-[#100e0f] border border-white/10 overflow-hidden">
                  {hasMedia ? (
                    mediaType === 'video' ? (
                      <ResolvedVideo
                        src={item.image}
                        autoPlay
                        loop
                        muted
                        playsInline
                        controls
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ResolvedImage
                        src={item.image}
                        alt={item.title || `Tile ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    )
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-white/25 gap-1.5">
                      <ImageIcon size={22} />
                      <span className="text-[9px] font-bold uppercase tracking-[0.2em]">
                        No Photo or Video Selected
                      </span>
                    </div>
                  )}

                  <div className="absolute top-2 left-2 bg-black/80 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-[#d8a39d] border border-white/10 pointer-events-none">
                    #{idx + 1} · {item.size} · {mediaType}
                    {item.mediaMetadata?.mimeType
                      ? ` (${item.mediaMetadata.mimeType.split('/')[1]?.toUpperCase() || ''})`
                      : ''}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveTile(item.id)}
                    title="Remove Tile"
                    aria-label="Remove Tile"
                    className="absolute top-2 right-2 bg-black/80 hover:bg-rose-600 text-white p-1.5 border border-white/10 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Title & Subtitle */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-white/45 mb-1">
                      Tile Title
                    </label>
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => handleTileChange(item.id, 'title', e.target.value)}
                      placeholder="Headline"
                      className="w-full bg-[#141414] border border-white/15 px-2.5 py-2 text-xs font-bold text-[#f5efe6] focus:outline-none focus:border-[#d8a39d]"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-white/45 mb-1">
                      Kicker / Subtitle
                    </label>
                    <input
                      type="text"
                      value={item.subtitle}
                      onChange={(e) => handleTileChange(item.id, 'subtitle', e.target.value)}
                      placeholder="Capsule Subtitle"
                      className="w-full bg-[#141414] border border-white/15 px-2.5 py-2 text-xs text-[#f5efe6] focus:outline-none focus:border-[#d8a39d]"
                    />
                  </div>
                </div>

                {/* Dimensions & 6-Corner Position */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-white/45 mb-1">
                      Tile Span
                    </label>
                    <select
                      value={item.size}
                      onChange={(e) =>
                        handleTileChange(item.id, 'size', e.target.value as GalleryTileSize)
                      }
                      className="w-full bg-[#141414] border border-white/15 px-2.5 py-2 text-xs font-bold text-[#f5efe6] focus:outline-none focus:border-[#d8a39d]"
                    >
                      {TILE_SIZES.map((sz) => (
                        <option key={sz.value} value={sz.value}>
                          {sz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-white/45 mb-1">
                      Text Corner
                    </label>
                    <select
                      value={item.textPosition}
                      onChange={(e) =>
                        handleTileChange(
                          item.id,
                          'textPosition',
                          e.target.value as GalleryTextPosition
                        )
                      }
                      className="w-full bg-[#141414] border border-white/15 px-2.5 py-2 text-xs font-bold text-[#f5efe6] focus:outline-none focus:border-[#d8a39d]"
                    >
                      {TEXT_POSITIONS.map((pos) => (
                        <option key={pos.value} value={pos.value}>
                          {pos.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Media Type Toggle + URL + Device Upload (Photo or Video) */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-[9px] font-black uppercase tracking-widest text-white/45">
                      Media URL or Upload (Photo / Video)
                    </label>
                    <div className="flex border border-white/15">
                      <button
                        type="button"
                        onClick={() => handleTileChange(item.id, 'mediaType', 'image')}
                        className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                          mediaType === 'image'
                            ? 'bg-[#f5efe6] text-[#141414]'
                            : 'text-white/55 hover:text-white'
                        }`}
                      >
                        <ImageIcon size={10} /> Photo
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTileChange(item.id, 'mediaType', 'video')}
                        className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 border-l border-white/15 ${
                          mediaType === 'video'
                            ? 'bg-[#d8a39d] text-[#141414]'
                            : 'text-white/55 hover:text-white'
                        }`}
                      >
                        <VideoIcon size={10} /> Video
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={item.image}
                      onChange={(e) => handleTileChange(item.id, 'image', e.target.value)}
                      placeholder="https://... (.jpg, .mp4) or upload"
                      className="flex-1 min-w-0 bg-[#141414] border border-white/15 px-2.5 py-2 text-[11px] font-mono text-[#f5efe6] focus:outline-none focus:border-[#d8a39d]"
                    />
                    <label className="bg-[#252023] hover:bg-[#d8a39d] hover:text-[#141414] text-[#f5efe6] border border-white/15 px-3 py-2 text-[10px] font-black uppercase tracking-wider cursor-pointer transition-colors flex items-center justify-center gap-1.5 shrink-0">
                      <Upload size={12} />
                      <span>Upload</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleUploadTileMedia(item.id, file);
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Save Footer */}
      <div className="pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
          {isDirty ? 'You have unsaved Studio Gallery edits' : 'All changes are saved and live'}
        </span>
        <div className="flex items-center gap-3">
          {isDirty && (
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="border border-white/20 text-white/80 hover:text-white px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-none"
            >
              Discard Draft
            </button>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="bg-[#f5efe6] text-[#141414] hover:bg-[#d8a39d] px-6 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 transition-colors rounded-none shadow-lg disabled:opacity-50"
          >
            <Check size={14} />
            {isSaving ? 'Saving...' : 'Save & Apply'}
          </button>
        </div>
      </div>
    </form>
  );
};
