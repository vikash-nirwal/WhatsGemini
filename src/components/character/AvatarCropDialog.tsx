import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { FaCrop, FaTimes } from "react-icons/fa";
import { savePortraitBlob } from "../../features/ai/utils/portraitUtils";

interface AvatarCropDialogProps {
  open: boolean;
  onClose: () => void;
  /** The image to crop — can be a data: URL, blob: URL, or object URL. */
  imageSrc: string;
  /** Called with the local: reference after cropping and saving. */
  onCropped: (localRef: string) => void;
  /** The pixel size the crop is actually saved at (defaults to 300x400) -
   * independent of the interactive viewport below, which is sized to the
   * same aspect ratio but capped for comfortable dragging. */
  exportSize?: { width: number; height: number };
}

// A "pan & zoom inside a fixed-aspect viewport" crop dialog. The user drags
// the image within a frame shaped like `exportSize`'s aspect ratio (but
// capped to a comfortable on-screen size) and can scale it with a slider.
// Confirming re-renders the same crop at the exact configured exportSize
// (which can be smaller or larger than the interactive viewport - offset is
// tracked in image-space pixels, so it reproduces identically at any output
// resolution), saves it via the File System Access directory handle, and
// returns a local: ref.

const DISPLAY_MAX_H = 400;

const AvatarCropDialog: React.FC<AvatarCropDialogProps> = ({
  open,
  onClose,
  imageSrc,
  onCropped,
  exportSize = { width: 300, height: 400 },
}) => {
  const aspect = exportSize.width / exportSize.height;
  const CROP_H = DISPLAY_MAX_H;
  const CROP_W = Math.round(DISPLAY_MAX_H * aspect);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Image natural dimensions once loaded.
  const [imgNat, setImgNat] = useState<{ w: number; h: number } | null>(null);

  // Scale: 1 = "fit so the shorter axis fills the viewport".
  const [scale, setScale] = useState(1);
  // Pan offset in image-space pixels from the center.
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the source image.
  useEffect(() => {
    if (!open || !imageSrc) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setImgNat({ w: img.naturalWidth, h: img.naturalHeight });
      setScale(1);
      setOffset({ x: 0, y: 0 });
      setError(null);
    };
    img.onerror = () => setError("Failed to load image.");
    img.src = imageSrc;
  }, [open, imageSrc]);

  // Compute the base scale that makes the image just cover the viewport.
  const baseScale = imgNat
    ? Math.max(CROP_W / imgNat.w, CROP_H / imgNat.h)
    : 1;

  // Draw the image onto the preview canvas whenever state changes.
  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    const img = imgRef.current;
    if (!ctx || !img || !imgNat) return;

    ctx.clearRect(0, 0, CROP_W, CROP_H);
    const s = baseScale * scale;
    const drawW = imgNat.w * s;
    const drawH = imgNat.h * s;

    // Center the image, then apply the pan offset (scaled).
    const dx = (CROP_W - drawW) / 2 + offset.x * s;
    const dy = (CROP_H - drawH) / 2 + offset.y * s;

    ctx.drawImage(img, dx, dy, drawW, drawH);
  }, [imgNat, baseScale, scale, offset, CROP_W, CROP_H]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Pointer-based pan handling.
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const s = baseScale * scale;
    const dx = (e.clientX - dragStart.current.x) / s;
    const dy = (e.clientY - dragStart.current.y) / s;
    setOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
  };

  const handlePointerUp = () => setDragging(false);

  // Re-renders the same crop (same offset/scale, both image-space and thus
  // resolution-independent) onto an offscreen canvas at the configured
  // exportSize, rather than exporting the (possibly differently-sized)
  // interactive display canvas directly.
  const renderExportBlob = (): Promise<Blob | null> => {
    const img = imgRef.current;
    if (!img || !imgNat) return Promise.resolve(null);
    const canvas = document.createElement("canvas");
    canvas.width = exportSize.width;
    canvas.height = exportSize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);

    const exportBaseScale = Math.max(exportSize.width / imgNat.w, exportSize.height / imgNat.h);
    const s = exportBaseScale * scale;
    const drawW = imgNat.w * s;
    const drawH = imgNat.h * s;
    const dx = (exportSize.width - drawW) / 2 + offset.x * s;
    const dy = (exportSize.height - drawH) / 2 + offset.y * s;
    ctx.drawImage(img, dx, dy, drawW, drawH);

    return new Promise((res) => canvas.toBlob(res, "image/png"));
  };

  // Save the cropped image.
  const handleApply = async () => {
    setSaving(true);
    setError(null);

    try {
      const blob = await renderExportBlob();
      if (!blob) {
        setError("Failed to export cropped image.");
        setSaving(false);
        return;
      }

      const localRef = await savePortraitBlob(blob, "avatar");
      onCropped(localRef);
      onClose();
    } catch (err: any) {
      console.error("Crop save error:", err);
      setError(err.name === "NotAllowedError"
        ? "Permission denied. Re-select the directory in Settings."
        : err.message || "Failed to save cropped image.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="default" className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <FaCrop size={14} /> Crop Portrait
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          <p className="text-xs text-muted-foreground text-center">
            Drag to reposition. Use the slider to zoom.
          </p>

          {/* Crop viewport */}
          <div
            className="relative rounded-lg overflow-hidden border-2 border-primary/40 cursor-grab active:cursor-grabbing"
            style={{ width: CROP_W, height: CROP_H }}
          >
            <canvas
              ref={canvasRef}
              width={CROP_W}
              height={CROP_H}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="block touch-none"
            />
          </div>

          {/* Zoom slider */}
          <div className="w-full max-w-[280px] flex items-center gap-2 text-xs text-muted-foreground">
            <span>Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="font-mono w-8 text-right">{scale.toFixed(1)}×</span>
          </div>

          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" className="h-auto px-3 py-1.5 text-sm">
              <FaTimes size={11} /> Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleApply}
            disabled={saving || !imgNat}
            className="h-auto px-4 py-1.5 text-sm font-semibold"
          >
            {saving ? "Saving..." : "Apply Crop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AvatarCropDialog;
