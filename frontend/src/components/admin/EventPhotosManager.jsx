import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { apiClient } from '../../lib/apiClient.js';
import { formatDate } from '../../utils/formatters.js';

export function EventPhotosManager({
  competitionId,
  competitionName = '',
  initialPhotos = [],
  onPhotosUpdated,
}) {
  const { accessToken } = useAuth();
  const fileInputRef = useRef(null);

  const [photos, setPhotos] = useState(initialPhotos || []);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  const [previewPhoto, setPreviewPhoto] = useState(null);

  // Sync photos when initialPhotos change or load fresh from API
  useEffect(() => {
    if (initialPhotos && initialPhotos.length > 0) {
      setPhotos(initialPhotos);
    } else if (competitionId && accessToken) {
      setLoadingPhotos(true);
      apiClient
        .fetchCompetitionPhotos(accessToken, competitionId)
        .then((res) => {
          setPhotos(res.photos || []);
        })
        .catch(() => {
          // Non-fatal initial fetch error
        })
        .finally(() => setLoadingPhotos(false));
    }
  }, [competitionId, initialPhotos, accessToken]);

  const handleDirectUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !competitionId || !accessToken) return;

    // Filter valid image types and size under 5MB
    const valid = files.filter((f) => {
      const isImg = ['image/jpeg', 'image/png', 'image/webp'].includes(f.type);
      const isSize = f.size <= 5 * 1024 * 1024;
      return isImg && isSize;
    });

    if (valid.length === 0) {
      setStatusMsg({
        type: 'error',
        text: 'Please select valid JPEG, PNG, or WebP images under 5 MB each.',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (valid.length < files.length) {
      setStatusMsg({
        type: 'error',
        text: 'Some files were skipped. Only JPEG, PNG, or WebP under 5 MB are allowed.',
      });
    }

    setUploading(true);
    setStatusMsg({ type: '', text: '' });
    try {
      const res = await apiClient.uploadCompetitionPhotos(
        accessToken,
        competitionId,
        valid,
        ''
      );
      const updatedList = res.photos || [];
      setPhotos(updatedList);
      setStatusMsg({
        type: 'success',
        text: `${valid.length} photo(s) uploaded successfully!`,
      });
      setTimeout(() => setStatusMsg({ type: '', text: '' }), 4000);
      if (onPhotosUpdated) {
        onPhotosUpdated(updatedList);
      }
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Failed to upload event photos.',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!competitionId || !accessToken || deletingId) return;

    setDeletingId(photoId);
    setStatusMsg({ type: '', text: '' });
    try {
      const res = await apiClient.deleteCompetitionPhoto(
        accessToken,
        competitionId,
        photoId
      );
      const updatedList = res.photos || [];
      setPhotos(updatedList);
      setStatusMsg({
        type: 'success',
        text: 'Photo deleted successfully.',
      });
      setTimeout(() => setStatusMsg({ type: '', text: '' }), 3000);
      if (onPhotosUpdated) {
        onPhotosUpdated(updatedList);
      }
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Failed to delete photo.',
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Box */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#1a1a1a] p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-white uppercase">
              Upload Event Photos
            </h3>
            <p className="text-xs text-[#A1A1AA]">
              Add photos of past competitions, stage moments, or advance posters
              {competitionName ? ` for "${competitionName}"` : ''}.
            </p>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-4 py-2 text-xs font-bold text-white uppercase shadow-md shadow-[#F15A24]/20 transition-all hover:brightness-110 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                <span>Upload Photos</span>
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={handleDirectUpload}
            className="hidden"
          />
        </div>

        {/* Status Alert Banner */}
        {statusMsg.text && (
          <div
            role="alert"
            className={`mt-4 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium ${
              statusMsg.type === 'error'
                ? 'border-red-500/40 bg-red-500/10 text-red-300'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
            }`}
          >
            {statusMsg.type === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}
      </div>

      {/* Gallery Photos Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-display text-sm font-bold tracking-wider text-white uppercase">
            Competition Photos ({photos.length})
          </h4>
          {loadingPhotos && (
            <Loader2 className="h-4 w-4 animate-spin text-[#F15A24]" />
          )}
        </div>

        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#141414] py-12 text-center">
            <ImageIcon className="h-8 w-8 text-zinc-600" />
            <p className="mt-2 text-xs font-semibold text-zinc-400">
              No event photos uploaded yet.
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Upload event stage photos, awards, and athlete highlights above.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F15A24] to-[#E94B16] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#F15A24]/20 hover:brightness-110 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload Photos</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {photos.map((p) => {
              const isDeleting = deletingId === p.id;
              return (
                <div
                  key={p.id}
                  className="group relative overflow-hidden rounded-xl border border-white/10 bg-[#171717] transition-all hover:border-[#F15A24]/50"
                >
                  <img
                    src={p.photoUrl}
                    alt={p.caption || 'Event photo'}
                    className="h-36 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />

                  {/* Overlay Controls */}
                  <div className="absolute inset-0 flex flex-col justify-between bg-black/60 p-2 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPreviewPhoto(p)}
                        className="rounded-lg bg-black/60 p-1.5 text-white hover:bg-[#F15A24]"
                        title="View Full Photo"
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDeletePhoto(p.id)}
                        className="rounded-lg bg-red-600/80 p-1.5 text-white hover:bg-red-600 disabled:opacity-50"
                        title="Delete Photo"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>

                    {p.caption && (
                      <p className="truncate rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {p.caption}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox / Fullscreen Modal */}
      {previewPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl border border-white/15 bg-[#171717] p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute top-4 right-4 z-10 rounded-full bg-black/70 p-2 text-white hover:bg-black"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={previewPhoto.photoUrl}
              alt={previewPhoto.caption || 'Event Photo Preview'}
              className="max-h-[80vh] w-auto rounded-xl object-contain mx-auto"
            />
            {previewPhoto.caption && (
              <p className="p-3 text-center text-xs font-semibold text-white">
                {previewPhoto.caption}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
