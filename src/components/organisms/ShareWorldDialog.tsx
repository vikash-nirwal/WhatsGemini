import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { TextInput } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { useAppSelector } from "src/store/hooks";
import { encodeWorldLink, exportWorld } from "src/features/world/worldFile";
import { World } from "src/types";

// A QR code holds about 2,900 characters at most; past that, the link only.
const QR_MAX = 2_300;

// Sharing a world (#197): a link that carries it (no pictures), and a QR
// code when it's small enough. Opening the link offers to import it.
export const ShareWorldDialog = ({ world, onOpenChange }: { world: World | null; onOpenChange: (open: boolean) => void }) => {
  const characters = useAppSelector((state) => state.character.characters);
  const [link, setLink] = useState("");
  const [qr, setQr] = useState<string | undefined>();
  useEffect(() => {
    setLink("");
    setQr(undefined);
    if (!world) return;
    void (async () => {
      const code = await encodeWorldLink(exportWorld(world, characters.filter((c) => c.worldId === world.id)));
      const url = `${window.location.origin}${window.location.pathname}#/worlds/import?w=${code}`;
      setLink(url);
      if (url.length <= QR_MAX) setQr(await QRCode.toDataURL(url, { errorCorrectionLevel: "L", margin: 1, width: 240 }));
    })();
  }, [world, characters]);
  if (!world) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.");
    }
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="sheet" className="px-4">
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pb-2">
          <DialogTitle className="pt-1">Share {world.name}</DialogTitle>
          <DialogDescription>Anyone with Kindred can open this link to get their own copy: the world, its people and how they're tied. Pictures and what they've lived through stay with you.</DialogDescription>
          <div className="flex gap-2">
            <TextInput aria-label="Share link" readOnly value={link || "Making the link..."} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1" />
            <Button type="button" disabled={!link} onClick={() => void copy()}>Copy</Button>
          </div>
          {qr ? <img src={qr} alt={`QR code for ${world.name}`} className="mx-auto h-[240px] w-[240px] rounded-lg bg-white p-2" /> : link && <p className="text-[12.5px] text-subtle">Too big for a QR code; share the link.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareWorldDialog;
