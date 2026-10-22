import React from "react";
import { useAppDispatch } from "src/store/hooks";
import { updateChatOptions } from "src/features/chatSlice";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { Slider } from "src/components/molecules/form-controls";
import { AMBIENT_SOUNDS, ambientFor, ambientLabel, ambientSceneTexts, DEFAULT_AMBIENT_VOLUME } from "src/features/chat/ambientSound";
import { Character, Chat } from "src/types";

// Ambient sound (#89) in the Chat tab: on or off, what plays (the scene's
// own sound, or a pick) and how loud.
export const AmbientSection: React.FC<{ chat: Chat; character?: Character }> = ({ chat, character }) => {
  const dispatch = useAppDispatch();
  const ambient = chat.ambient || {};
  const save = (patch: Partial<NonNullable<Chat["ambient"]>>) => dispatch(updateChatOptions({ chatId: chat.id!, patch: { ambient: { ...ambient, ...patch } } }));
  const playing = ambientFor(ambient, ...ambientSceneTexts(chat, character));
  const auto = !ambient.sound || ambient.sound === "auto";

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium text-foreground">Ambient sound</div>
          <div className="text-[11px] text-subtle">Soft background sound for the scene, made in your browser: rain, a café, a fireplace, the sea or a city at night.</div>
        </div>
        <ToggleSwitch checked={Boolean(ambient.on)} onChange={(on) => save({ on: on || undefined })} label={<span className="sr-only">Ambient sound</span>} />
      </div>
      {ambient.on && (
        <>
          <SegmentedControl
            value={ambient.sound || "auto"}
            onChange={(v) => save({ sound: v as NonNullable<Chat["ambient"]>["sound"] })}
            options={[{ value: "auto", label: "From the scene" }, ...AMBIENT_SOUNDS]}
          />
          <div role="group" aria-label="Ambient volume" className="flex items-center gap-3">
            <span className="text-[11px] text-subtle">Volume</span>
            <div className="flex-1">
              <Slider value={ambient.volume ?? DEFAULT_AMBIENT_VOLUME} min={0} max={1} step={0.05} onChange={(volume) => save({ volume })} />
            </div>
          </div>
          <p className="text-[11px] text-subtle" role="status">
            {playing
              ? `Playing: ${ambientLabel(playing)}${auto ? " (from the scene)" : ""}`
              : "Nothing in the scene suggests a sound yet. Turn on the scene tracker so the place is known, or pick one."}
          </p>
        </>
      )}
    </div>
  );
};
