import React from "react";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { updateChatOptions } from "src/features/chatSlice";
import { Select } from "src/components/molecules/form-controls";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { updateCharacter } from "src/features/characterSlice";
import { setEmotionPanelEnabled, setEmotionPopupEnabled, setEmotionPopupDuration } from "src/features/settingsSlice";
import { Character } from "src/types";
import { Input } from "src/components/atoms/input";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { DIARY_INTERVAL } from "src/utils/constants";
import { cn } from "src/utils/cn";
import { browserLanguageName, PRACTICE_LANGUAGES } from "src/features/chat/languagePractice";
import { BOLDNESS_LABELS, STAGE_LABELS, STAGES } from "src/features/character/relationshipStages";
import { ScenePanelTabProps } from "./types";

// The Chat tab: per-chat switches (texting, room turns, stages, co-writing,
// language practice, suggestions...), per-character ones (statuses,
// letters, diary, thoughts, outfit) and the app-wide mood display.
const ChatTab: React.FC<ScenePanelTabProps> = ({ chatId, character, isRoom, intensity }) => {
  const dispatch = useAppDispatch();

  // App-wide display preferences, not per-chat data like everything else in
  // this panel - surfaced here anyway (rather than the global Settings page)
  // since they're about how the chat you're actually looking at right now
  // renders, and this is the panel already open while you're looking at it.
  const emotionPanelEnabled = useAppSelector((state) => state.settings.emotionPanelEnabled);
  const emotionPopupEnabled = useAppSelector((state) => state.settings.emotionPopupEnabled);
  const emotionPopupDuration = useAppSelector((state) => state.settings.emotionPopupDuration);

  // Memory - a room reads/writes its own Chat.memory; a 1:1 chat reuses
  // Character.memory, the same data the Character Editor manages.
  // Pinned facts are a separate list: always injected, never evicted by the
  // MAX_MEMORY_ENTRIES cap that trims the least recently mentioned ones.
  // Read straight from the store, so new chat fields don't have to be
  // threaded through ChatWindow.
  const chat = useAppSelector((state) => state.chat.chats.find((c) => c.id === chatId));
  // A 1:1 chat can keep its own memory too (Chat.memoryScope), like a room.
  const chatScoped = Boolean(isRoom || chat?.memoryScope === "chat");

  const appTextingMode = useAppSelector((state) => state.settings.textingMode);

  // Room members (#24), for the relationships editor.
  const allCharacters = useAppSelector((state) => state.character.characters);

  // Other characters you have a 1:1 chat with, for #74.
  const allChats = useAppSelector((state) => state.chat.chats);
  const otherBonds = allCharacters.filter((c) => c.id !== character?.id && allChats.some((x) => x.characterIds?.length === 1 && x.characterIds[0] === c.id));

  const members = (chat?.characterIds || []).map((id) => allCharacters.find((c) => c.id === id)).filter((c): c is Character => Boolean(c));

  return (
          <div role="tabpanel" id="scene-tabpanel-chat" aria-labelledby="scene-tab-chat" className="flex flex-col gap-[22px]">
          {/* Texting mode (#6), per chat: this chat's own choice or the app's */}
          <div className="flex flex-col gap-2">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-foreground">Texting mode</div>
              <div className="text-[11px] text-subtle">Replies as separate texts with typing pauses, and read ticks on yours.</div>
            </div>
            <SegmentedControl
              value={chat?.textingMode === undefined ? "app" : chat.textingMode ? "on" : "off"}
              onChange={(v) => dispatch(updateChatOptions({ chatId, patch: { textingMode: v === "app" ? undefined : v === "on" } }))}
              options={[
                { value: "app", label: `App setting (${appTextingMode ? "on" : "off"})` },
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </div>

          {/* Members talk among themselves while you're away (#58) */}
          {isRoom && (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-foreground">Members talk while you're away</div>
                <div className="text-[11px] text-subtle">After you've been gone a few hours, two of them have a short chat of their own, shaped by how they feel about each other. You can read it, and they may bring it up. About one a day, on the helper model.</div>
              </div>
              <ToggleSwitch
                checked={Boolean(chat?.offscreenTalk)}
                onChange={(val) => dispatch(updateChatOptions({ chatId, patch: { offscreenTalk: val || undefined } }))}
                label={<span className="sr-only">Members talk while you're away</span>}
              />
            </div>
          )}

          {/* Group chats: inner thoughts for everyone (#10), and who keeps a diary (#5) */}
          {isRoom && (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-foreground">Show everyone's inner thoughts</div>
                <div className="text-[11px] text-subtle">Each reply also carries the speaker's private thought, hidden until you tap it. Nobody here hears it.</div>
              </div>
              <ToggleSwitch
                checked={Boolean(chat?.innerThoughts)}
                onChange={(val) => dispatch(updateChatOptions({ chatId, patch: { innerThoughts: val || undefined } }))}
                label={<span className="sr-only">Show everyone's inner thoughts</span>}
              />
            </div>
          )}
          {isRoom && members.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-foreground">Diaries</div>
                <div className="text-[11px] text-subtle">Every {DIARY_INTERVAL} messages, each member who keeps a diary writes an entry about the group, as they saw it. One small call per member.</div>
              </div>
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3">
                  <span className="text-[12.5px] text-foreground">{m.name} keeps a diary</span>
                  <ToggleSwitch
                    checked={Boolean(m.diaryEnabled)}
                    onChange={(val) => dispatch(updateCharacter({ ...m, diaryEnabled: val || undefined }))}
                    label={<span className="sr-only">{m.name} keeps a diary</span>}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Group chats (#22, #23): who answers, and an optional narrator */}
          {isRoom && (
            <div className="flex flex-col gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-foreground">Who replies</div>
                <div className="text-[11px] text-subtle">
                  {chat?.turnMode === "natural"
                    ? "Whoever would naturally answer, maybe two of them, maybe nobody."
                    : chat?.turnMode === "everyone"
                      ? "Everyone answers each message in turn (up to three)."
                      : "One member at a time, taking turns."}
                </div>
              </div>
              <SegmentedControl
                value={chat?.turnMode || "round-robin"}
                onChange={(v) => dispatch(updateChatOptions({ chatId, patch: { turnMode: v === "round-robin" ? undefined : (v as "natural" | "everyone") } }))}
                options={[
                  { value: "round-robin", label: "Taking turns" },
                  { value: "natural", label: "Natural" },
                  { value: "everyone", label: "Everyone" },
                ]}
              />
            </div>
          )}
          {isRoom && (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-foreground">Narrator</div>
                <div className="text-[11px] text-subtle">After each round, a line of narration about the setting and what's happening around them.</div>
              </div>
              <ToggleSwitch
                checked={Boolean(chat?.narrator)}
                onChange={(val) => dispatch(updateChatOptions({ chatId, patch: { narrator: val || undefined } }))}
                label={<span className="sr-only">Narrator</span>}
              />
            </div>
          )}

          {/* Relationship stages (#70) - 1:1 chats, opt-in */}
          {!isRoom && character && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium text-foreground">Relationship stage</div>
                  <div className="text-[11px] text-subtle">A ladder that sets how forward {character.name} is, so things build up. Every 20 messages a quick check may suggest the next step; you decide.</div>
                </div>
                <ToggleSwitch
                  checked={Boolean(chat?.stage)}
                  onChange={(val) => dispatch(updateChatOptions({ chatId, patch: { stage: val ? "strangers" : undefined, stageSuggestion: undefined } }))}
                  label={<span className="sr-only">Relationship stage</span>}
                />
              </div>
              {chat?.stage && (
                <ol aria-label="Relationship stages" className="flex flex-wrap items-center gap-1.5">
                  {STAGES.map((s, i) => {
                    const current = STAGES.indexOf(chat.stage!);
                    return (
                      <li key={s}>
                        <button
                          type="button"
                          aria-current={i === current ? "step" : undefined}
                          onClick={() => dispatch(updateChatOptions({ chatId, patch: { stage: s, stageSuggestion: undefined } }))}
                          className={cn(
                            "h-7 px-2.5 rounded-full border text-[12px]",
                            i === current ? "border-primary bg-primary text-primary-foreground" : i < current ? "border-primary/40 bg-primary/[0.12] text-foreground" : "border-input text-muted-foreground"
                          )}
                        >
                          {STAGE_LABELS[s]}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}

          {/* Characters know about each other (#74) - 1:1 chats */}
          {!isRoom && character && otherBonds.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-foreground">Who {character.name} knows about</div>
                <div className="text-[11px] text-subtle">{character.name} can know you're also close to these characters: how you are with them and how much you've talked lately, never your actual chats.</div>
              </div>
              {otherBonds.map((other) => {
                const knows = (character.knowsAbout || []).includes(other.id);
                return (
                  <div key={other.id} className="flex items-center justify-between gap-3">
                    <span className="text-[12.5px] text-foreground">Knows about {other.name}</span>
                    <ToggleSwitch
                      checked={knows}
                      onChange={(val) => {
                        const next = val ? [...(character.knowsAbout || []), other.id] : (character.knowsAbout || []).filter((id) => id !== other.id);
                        dispatch(updateCharacter({ ...character, knowsAbout: next.length > 0 ? next : undefined }));
                      }}
                      label={<span className="sr-only">{character.name} knows about {other.name}</span>}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Boldness (#72) - 1:1 chats */}
          {!isRoom && character && (
            <div className="flex flex-col gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-foreground">How forward {character.name} is</div>
                <div className="text-[11px] text-subtle">From shy and needing to be coaxed to bold and making the first move. Separate from intensity, which is how much gets described.</div>
              </div>
              <Select
                aria-label="Boldness"
                value={chat?.boldness ? String(chat.boldness) : ""}
                onChange={(e) => dispatch(updateChatOptions({ chatId, patch: { boldness: e.target.value ? (Number(e.target.value) as 1 | 2 | 3 | 4 | 5) : undefined } }))}
              >
                <option value="">As written</option>
                {([1, 2, 3, 4, 5] as const).map((n) => <option key={n} value={String(n)}>{BOLDNESS_LABELS[n]}</option>)}
              </Select>
            </div>
          )}

          {/* Co-writing mode (#68) - 1:1 chats */}
          {!isRoom && character && (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-foreground">Co-writing mode</div>
                <div className="text-[11px] text-subtle">Write one story together instead of chatting: the chat shows as a document, and {character.name} adds the next paragraphs as a co-author. "What happens next?" offers ideas.</div>
              </div>
              <ToggleSwitch
                checked={Boolean(chat?.coWriting)}
                onChange={(val) => dispatch(updateChatOptions({ chatId, patch: { coWriting: val || undefined } }))}
                label={<span className="sr-only">Co-writing mode</span>}
              />
            </div>
          )}

          {/* Language practice (#67) - per chat */}
          <div className="flex flex-col gap-2">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-foreground">Language practice</div>
              <div className="text-[11px] text-subtle">Replies come in the language you're learning, mistakes in your messages get a gentle correction under them, and any reply can be translated.</div>
            </div>
            <Select
              aria-label="Practice language"
              value={chat?.language?.target || ""}
              onChange={(e) => dispatch(updateChatOptions({ chatId, patch: { language: e.target.value ? { level: "beginner", ...chat?.language, target: e.target.value } : undefined } }))}
            >
              <option value="">Off</option>
              {PRACTICE_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
            {chat?.language && (
              <>
                <SegmentedControl
                  value={chat.language.level}
                  onChange={(v) => dispatch(updateChatOptions({ chatId, patch: { language: { ...chat.language!, level: v as "beginner" | "intermediate" | "advanced" } } }))}
                  options={[
                    { value: "beginner", label: "Beginner" },
                    { value: "intermediate", label: "Intermediate" },
                    { value: "advanced", label: "Advanced" },
                  ]}
                />
                <label className="flex flex-col gap-1 text-[11px] text-subtle">
                  Translate replies into
                  <Input
                    value={chat.language.translateInto || ""}
                    placeholder={browserLanguageName()}
                    onChange={(e) => dispatch(updateChatOptions({ chatId, patch: { language: { ...chat.language!, translateInto: e.target.value || undefined } } }))}
                    className="h-8 text-[12.5px] px-2.5 rounded-lg"
                  />
                </label>
              </>
            )}
          </div>

          {/* Choice moments (#87) - per chat */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-foreground">Choice moments</div>
              <div className="text-[11px] text-subtle">At a real turning point, a reply now and then offers two or three directions to tap, like an adventure. You can always write your own.</div>
            </div>
            <ToggleSwitch
              checked={Boolean(chat?.choiceMoments)}
              onChange={(val) => dispatch(updateChatOptions({ chatId, patch: { choiceMoments: val || undefined } }))}
              label={<span className="sr-only">Choice moments</span>}
            />
          </div>

          {/* Reply suggestions (#16) - per chat */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-foreground">Suggest replies</div>
              <div className="text-[11px] text-subtle">After each reply, three short ideas for what you could say. Tap one to edit it in the box.</div>
            </div>
            <ToggleSwitch
              checked={Boolean(chat?.replySuggestions)}
              onChange={(val) => dispatch(updateChatOptions({ chatId, patch: { replySuggestions: val || undefined } }))}
              label={<span className="sr-only">Suggest replies</span>}
            />
          </div>

          {/* Status updates (#8) - per character */}
        {!isRoom && character && (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-foreground">{character.name} posts statuses</div>
              <div className="text-[11px] text-subtle">Now and then, a short status about their day, shown in the sidebar for a day. At most one every ten hours.</div>
            </div>
            <ToggleSwitch
              checked={Boolean(character.postsStatuses)}
              onChange={(val) => dispatch(updateCharacter({ ...character, postsStatuses: val || undefined }))}
              label={<span className="sr-only">{character.name} posts statuses</span>}
            />
          </div>
        )}

        {/* Letters (#61) - per character */}
        {!isRoom && character && (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-foreground">{character.name} writes letters</div>
              <div className="text-[11px] text-subtle">When you haven't written for a few days, {character.name} writes you a longer letter, once per absence. It shows here in the chat, and you can reply.</div>
            </div>
            <ToggleSwitch
              checked={Boolean(character.writesLetters)}
              onChange={(val) => dispatch(updateCharacter({ ...character, writesLetters: val || undefined }))}
              label={<span className="sr-only">{character.name} writes letters</span>}
            />
          </div>
        )}

        {/* Relationship that evolves (#30) */}
        {!isRoom && character && (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-foreground">Suggest relationship updates</div>
              <div className="text-[11px] text-subtle">Every 20 messages, a cheap check whether you and {character.name} have grown closer or apart. You approve each change.</div>
            </div>
            <ToggleSwitch
              checked={chat?.relationshipSuggestions !== false}
              onChange={(val) => dispatch(updateChatOptions({ chatId, patch: { relationshipSuggestions: val ? undefined : false } }))}
              label={<span className="sr-only">Suggest relationship updates</span>}
            />
          </div>
        )}

        {/* Inner thoughts (#10) - also per character */}
          {!isRoom && character && (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-foreground">Show {character.name}'s inner thoughts</div>
                <div className="text-[11px] text-subtle">
                  Each reply also carries a private thought, hidden until you tap it. {character.name} never hears it back.
                </div>
              </div>
              <ToggleSwitch
                checked={Boolean(character.innerThoughts)}
                onChange={(val) => dispatch(updateCharacter({ ...character, innerThoughts: val || undefined }))}
                label={<span className="sr-only">Show {character.name}'s inner thoughts</span>}
              />
            </div>
          )}

          {/* Diary (#5) - a per-character switch, so it's set here in context */}
          {!isRoom && character && (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-foreground">{character.name} keeps a diary</div>
                <div className="text-[11px] text-subtle">
                  {chatScoped
                    ? `Paused in this chat: entries only come from chats that share ${character.name}'s memory.`
                    : `Every ${DIARY_INTERVAL} messages, a short private entry about you. The latest one shapes how ${character.name} acts. Read it from the Characters page.`}
                </div>
              </div>
              <ToggleSwitch
                checked={Boolean(character.diaryEnabled)}
                onChange={(val) => dispatch(updateCharacter({ ...character, diaryEnabled: val }))}
                label={<span className="sr-only">{character.name} keeps a diary</span>}
              />
            </div>
          )}

          {/* Wardrobe (#50): what the character is wearing in this story */}
          {!isRoom && character && character.wardrobe && character.wardrobe.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-foreground">{character.name} is wearing</div>
                <div className="text-[11px] text-subtle">Used in pictures and in how they describe themselves.</div>
              </div>
              <div className="w-40 flex-shrink-0">
                <Select
                  aria-label={`${character.name}'s outfit`}
                  value={character.currentOutfitId || ""}
                  onChange={(e) => dispatch(updateCharacter({ ...character, currentOutfitId: e.target.value || undefined }))}
                >
                  <option value="">Their usual look</option>
                  {character.wardrobe.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name || "Unnamed outfit"}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          {/* Mood-tinted chat (#90) - per chat */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-foreground">Tint the chat with the mood</div>
              <div className="text-[11px] text-subtle">The background takes a soft colour from the character's latest mood: warmer when happy, blue when sad, red when angry. Text stays as it is.</div>
            </div>
            <ToggleSwitch
              checked={Boolean(chat?.moodTint)}
              onChange={(val) => dispatch(updateChatOptions({ chatId, patch: { moodTint: val || undefined } }))}
              label={<span className="sr-only">Tint the chat with the mood</span>}
            />
          </div>

          {/* Display - app-wide preferences for the docked mood panel/popup, see note above */}
          <div>
            <div data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold mb-2">Display</div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium text-foreground">Mood panel</div>
                  <div className="text-[11px] text-subtle">Docks each character's current mood portrait beside the chat</div>
                </div>
                <ToggleSwitch checked={emotionPanelEnabled} onChange={(val) => dispatch(setEmotionPanelEnabled(val))} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium text-foreground">Pop up on mood change</div>
                  <div className="text-[11px] text-subtle">Briefly shows a portrait centered on screen when a mood changes</div>
                </div>
                <ToggleSwitch checked={emotionPopupEnabled} onChange={(val) => dispatch(setEmotionPopupEnabled(val))} />
              </div>
              {emotionPopupEnabled && (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12.5px] font-medium text-foreground">Popup duration (ms)</div>
                  <Input
                    type="number"
                    value={emotionPopupDuration}
                    onChange={(e) => dispatch(setEmotionPopupDuration(Math.max(300, Number(e.target.value))))}
                    min="300"
                    step="100"
                    className="h-8 w-24 text-[12.5px] px-2.5 rounded-lg"
                  />
                </div>
              )}
            </div>
          </div>
          </div>
  );
};

export default ChatTab;
