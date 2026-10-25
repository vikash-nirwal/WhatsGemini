import React, { useState } from "react";
import { useAppDispatch } from "src/store/hooks";
import { generateAvatarImage } from "src/features/aiSlice";
import { updateCharacter } from "src/features/characterSlice";
import { missingMoods, stickerHint } from "src/features/character/stickers";
import { Character } from "src/types";
import { Button } from "src/components/atoms/button";
import { DisplayImage } from "./DisplayImage";
import { CostMarker } from "./SettingRow";

// A character's sticker set (#137), in Contact info > Look: the stickers
// drawn so far, and a button that draws the missing moods one by one in
// their locked look (one image call each).
export const StickerSet = ({ character }: { character: Character }) => {
  const dispatch = useAppDispatch();
  const [drawing, setDrawing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stickers = character.stickers || [];
  const missing = missingMoods(stickers);

  const draw = async () => {
    setError(null);
    let current = character;
    for (const mood of missing) {
      setDrawing(mood);
      try {
        const drawn = await dispatch(generateAvatarImage({ name: character.name, appearance: character.appearance, visualTags: character.visualTags, appearanceImages: character.appearanceImages, artStyle: character.artStyle, emotion: mood, hint: stickerHint(mood), localImageSettings: character.localImageSettings })).unwrap();
        const image = drawn.images?.[0];
        if (!image) continue;
        current = { ...current, stickers: [...(current.stickers || []), { id: `stk-${Date.now().toString(36)}-${mood.replace(/\s/g, "")}`, mood, image }] };
        await dispatch(updateCharacter(current));
      } catch (err) {
        setError(typeof err === "string" ? err : (err as Error)?.message || "Couldn't draw that sticker.");
        break;
      }
    }
    setDrawing(null);
  };

  return (
    <div className="flex flex-col gap-2" data-slot="sticker-set">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">Stickers <CostMarker label="Drawing them makes image calls" /></div>
        <div className="text-[11px] text-subtle">Drawn once in {character.name}'s look; now and then they send one instead of an emoji.</div>
      </div>
      {stickers.length > 0 && (
        <ul aria-label={`${character.name}'s stickers`} className="grid grid-cols-3 gap-2">
          {stickers.map((st) => (
            <li key={st.id} className="flex flex-col items-center gap-1">
              <DisplayImage srcContext={st.image} alt={`Sticker: ${st.mood}`} className="h-20 w-20 object-contain" />
              <span className="text-[11px] capitalize text-subtle">{st.mood}</span>
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <Button type="button" variant="outline" size="sm" onClick={() => void draw()} disabled={Boolean(drawing)} className="self-start">
          {drawing ? `Drawing "${drawing}"…` : stickers.length > 0 ? `Draw the other ${missing.length}` : `Draw ${missing.length} stickers`}
        </Button>
      )}
      {error && <p role="alert" className="text-[12px] text-destructive">{error}</p>}
    </div>
  );
};

export default StickerSet;
