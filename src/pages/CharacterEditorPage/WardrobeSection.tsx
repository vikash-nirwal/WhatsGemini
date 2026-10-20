import React from "react";
import { FaChevronRight, FaPlus, FaTrash } from "react-icons/fa";
import { TextInput } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { cn } from "src/utils/cn";
import { Outfit } from "src/types";

interface WardrobeSectionProps {
  outfits: Outfit[];
  currentId?: string;
  onChange: (outfits: Outfit[], currentId?: string) => void;
}

const newOutfitId = () => `outfit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// "Wardrobe" (#50): a few named outfits. The one being worn is added to the
// locked look, so pictures change clothes without changing the face.
const WardrobeSection: React.FC<WardrobeSectionProps> = ({ outfits, currentId, onChange }) => {
  const update = (index: number, patch: Partial<Outfit>) => onChange(outfits.map((o, i) => (i === index ? { ...o, ...patch } : o)), currentId);
  const current = outfits.find((o) => o.id === currentId);
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <FaChevronRight aria-hidden size={10} className="text-muted-foreground transition-transform group-open:rotate-90" />
        Wardrobe
        <span className="text-xs font-normal text-muted-foreground">{current ? `wearing ${current.name || "an outfit"}` : outfits.length > 0 ? `${outfits.length} outfit${outfits.length === 1 ? "" : "s"}` : "none"}</span>
      </summary>

      <div className="mt-4 flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          Outfits to switch between. The one being worn goes into every picture after the locked look, and the character knows what they have on. Switch it any time from a chat's Scene panel.
        </p>
        {outfits.map((o, i) => {
          const wearing = o.id === currentId;
          return (
            <div key={o.id} role="group" aria-label={o.name || `Outfit ${i + 1}`} className={cn("flex flex-col gap-2 rounded-lg border p-3", wearing ? "border-primary/60" : "border-border")}>
              <div className="flex items-center gap-2">
                <TextInput aria-label="Outfit name" value={o.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="e.g. Work clothes" className="flex-1" />
                <Button
                  type="button"
                  variant={wearing ? "default" : "outline"}
                  size="sm"
                  aria-pressed={wearing}
                  onClick={() => onChange(outfits, wearing ? undefined : o.id)}
                >
                  {wearing ? "Wearing" : "Wear"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => onChange(outfits.filter((_, j) => j !== i), wearing ? undefined : currentId)}
                  aria-label={`Remove ${o.name || "outfit"}`}
                >
                  <FaTrash size={11} />
                </Button>
              </div>
              <TextInput aria-label="What it looks like" value={o.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="e.g. charcoal blazer, white shirt, silver pendant" />
            </div>
          );
        })}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...outfits, { id: newOutfitId(), name: "", description: "" }], currentId)}>
            <FaPlus size={10} /> Add an outfit
          </Button>
        </div>
      </div>
    </details>
  );
};

export default WardrobeSection;
