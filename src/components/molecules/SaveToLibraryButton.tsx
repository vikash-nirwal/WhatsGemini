import React, { useState } from "react";
import { FaFolderPlus } from "react-icons/fa";
import { toast } from "sonner";
import { cn } from "src/utils/cn";
import { hostBridge, SaveImageSettings } from "src/features/embed/hostBridge";
import { pngBase64For } from "src/features/embed/pngForHost";

interface SaveToLibraryButtonProps {
  src: string;
  prompt: string;
  negative?: string;
  settings?: SaveImageSettings;
  name?: string;
  className?: string;
}

// "Save to library" on generated pictures (#264), only inside a host app: the
// picture goes to the host as PNG with its prompt and settings, and the
// host's answer shows as a toast.
const SaveToLibraryButton: React.FC<SaveToLibraryButtonProps> = ({ src, prompt, negative, settings, name, className }) => {
  const [saving, setSaving] = useState(false);
  if (!hostBridge.active) return null;

  const save = async () => {
    setSaving(true);
    try {
      const png = await pngBase64For(src);
      const result = await hostBridge.saveImage({ png, prompt, negative, settings, name });
      if (result.ok) toast.success("Saved to library");
      else toast.error(result.error || "Couldn't save it.");
    } catch (err: any) {
      toast.error(err?.message || "Couldn't save it.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <button type="button" onClick={() => void save()} disabled={saving} data-slot="save-to-library" className={cn("inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-text hover:underline disabled:opacity-40", className)}>
      <FaFolderPlus size={11} /> {saving ? "Saving..." : "Save to library"}
    </button>
  );
};

export default SaveToLibraryButton;
