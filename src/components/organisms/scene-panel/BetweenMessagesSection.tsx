import React from "react";
import { useAppDispatch } from "src/store/hooks";
import { updateCharacter } from "src/features/characterSlice";
import { updateChatOptions } from "src/features/chatSlice";
import { Select } from "src/components/molecules/form-controls";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { DAY_MOODS, dayKey, dayMoodFor } from "src/features/character/badDays";
import { firstTextLimitOf, MAX_UNANSWERED } from "src/features/character/firstTexts";
import { describeMood, fadedMood } from "src/features/chat/lingeringMood";
import { dayLogFor } from "src/features/character/dayLog";
import { writeDayLog } from "src/components/molecules/DayLogWriter";
import { writeConcerns } from "src/components/molecules/ConcernsWriter";
import { dropConcern, openConcerns } from "src/features/character/preoccupations";
import { Character, Chat } from "src/types";

// A labelled switch row, as elsewhere in the Chat tab.
export const SwitchRow: React.FC<{ title: string; hint: string; checked: boolean; onChange: (on: boolean) => void }> = ({ title, hint, checked, onChange }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="min-w-0">
      <div className="text-[12.5px] font-medium text-foreground">{title}</div>
      <div className="text-[11px] text-subtle">{hint}</div>
    </div>
    <ToggleSwitch checked={checked} onChange={onChange} label={<span className="sr-only">{title}</span>} />
  </div>
);

// Characters who feel alive between messages (#93-#95, #98, #107, #110):
// per-character switches, so they hold in every chat with them.
export const AliveSection: React.FC<{ character: Character }> = ({ character }) => {
  const dispatch = useAppDispatch();
  const name = character.name;
  const set = (patch: Partial<Character>) => dispatch(updateCharacter({ ...character, ...patch }));
  const today = dayKey(Date.now());
  const mood = dayMoodFor(character, Date.now());
  const picked = character.dayMood?.date === today ? character.dayMood.mood || "good" : "";
  const dayLog = dayLogFor(character, Date.now());
  const [writingDay, setWritingDay] = React.useState(false);
  const writeToday = async () => {
    setWritingDay(true);
    try {
      await writeDayLog(dispatch, character, () => undefined);
    } finally {
      setWritingDay(false);
    }
  };
  const concerns = openConcerns(character.concerns);
  const [writingConcerns, setWritingConcerns] = React.useState(false);
  const writeThisWeek = async () => {
    setWritingConcerns(true);
    try {
      await writeConcerns(dispatch, character, () => undefined);
    } finally {
      setWritingConcerns(false);
    }
  };
  return (
    <>
      <div className="flex flex-col gap-2">
        <SwitchRow
          title={`${name} texts first`}
          hint={`After a few quiet hours, a short text out of the blue, while the app is open. Never while ${name} is asleep, at most two a day.`}
          checked={Boolean(character.textsFirst)}
          onChange={(on) => set({ textsFirst: on || undefined })}
        />
        {character.textsFirst && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-subtle">
            <span>Texts in a row without an answer</span>
            <Select
              aria-label="Texts in a row without an answer"
              value={String(firstTextLimitOf(character))}
              onChange={(e) => set({ firstTextLimit: Number(e.target.value) > 1 ? Number(e.target.value) : undefined })}
              className="w-20"
            >
              {Array.from({ length: MAX_UNANSWERED }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </div>
        )}
      </div>
      <SwitchRow
        title={`${name} has dreams`}
        hint={`Now and then, the first reply of a morning opens with a dream ${name} had, made of what you've shared. At most every few days.`}
        checked={Boolean(character.dreams)}
        onChange={(on) => set({ dreams: on || undefined })}
      />
      <div className="flex flex-col gap-2">
        <SwitchRow
          title={`${name} has off days`}
          hint={`Some days ${name} is under the weather, tired, irritable or low, and it shows in replies and statuses all day.`}
          checked={Boolean(character.badDays)}
          onChange={(on) => set({ badDays: on || undefined, dayMood: undefined })}
        />
        {character.badDays && (
          <div className="flex flex-col gap-1.5 text-[11px] text-subtle">
            <span>Today: {mood ? mood.label : "a good day"}</span>
            <Select
              aria-label="Today's mood"
              value={picked}
              onChange={(e) => set({ dayMood: e.target.value ? { date: today, mood: e.target.value === "good" ? "" : e.target.value } : undefined })}
            >
              <option value="">Let the day decide</option>
              <option value="good">A good day</option>
              {DAY_MOODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </Select>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <SwitchRow
          title={`${name} has one consistent day`}
          hint={`Once a day, a short account of what ${name}'s day has been like, so replies, statuses and first texts all tell the same story.`}
          checked={Boolean(character.dayLogs)}
          onChange={(on) => set({ dayLogs: on || undefined })}
        />
        {character.dayLogs && (
          <div className="flex flex-col gap-1 text-[11px] text-subtle" data-testid="day-log">
            <span>{dayLog?.text || (dayLog ? "Nothing usable came back today." : "Not written yet today.")}</span>
            <button type="button" className="self-start text-primary hover:underline disabled:opacity-50" disabled={writingDay} onClick={() => void writeToday()}>
              {writingDay ? "Writing..." : dayLog ? "Write today again" : "Write today now"}
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <SwitchRow
          title={`${name} has their own preoccupations`}
          hint={`Once a week, two or three things going on in ${name}'s own life, brought up when they fit and moved on from over the weeks.`}
          checked={Boolean(character.preoccupations)}
          onChange={(on) => set({ preoccupations: on || undefined })}
        />
        {character.preoccupations && (
          <div className="flex flex-col gap-1 text-[11px] text-subtle" data-testid="preoccupations">
            {concerns.length === 0 && <span>Nothing written yet this week.</span>}
            {concerns.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-2">
                <span>{c.text}</span>
                <button type="button" className="shrink-0 text-primary hover:underline" aria-label={`Drop: ${c.text}`} onClick={() => set({ concerns: dropConcern(character.concerns, c.id) })}>
                  Drop
                </button>
              </div>
            ))}
            <button type="button" className="self-start text-primary hover:underline disabled:opacity-50" disabled={writingConcerns} onClick={() => void writeThisWeek()}>
              {writingConcerns ? "Writing..." : concerns.length > 0 ? "Write this week again" : "Write this week now"}
            </button>
          </div>
        )}
      </div>
      <SwitchRow
        title={`What you tell ${name} can get around`}
        hint={`Now and then something from this chat reaches a character who knows ${name} or shares a group with them, a little wrong, and they bring it up.`}
        checked={Boolean(character.spreadsRumors)}
        onChange={(on) => set({ spreadsRumors: on || undefined })}
      />
    </>
  );
};

// Texting imperfections (#108): how sloppily the character texts.
export const TextingSlipsRow: React.FC<{ character: Character }> = ({ character }) => {
  const dispatch = useAppDispatch();
  const name = character.name;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-foreground">How {name} texts</div>
        <div className="text-[11px] text-subtle">In texting mode: the odd typo and a correction, a message deleted and sent again, typing that stops and starts, a bare "?" when busy.</div>
      </div>
      <Select
        aria-label={`How ${name} texts`}
        className="w-auto shrink-0"
        value={String(character.textingSlips || 0)}
        onChange={(e) => dispatch(updateCharacter({ ...character, textingSlips: (Number(e.target.value) || undefined) as Character["textingSlips"] }))}
      >
        <option value="0">Clean</option>
        <option value="1">A few slips</option>
        <option value="2">Plenty of slips</option>
      </Select>
    </div>
  );
};

// Memory with time (#109): the misremembering switch.
export const MisremembersRow: React.FC<{ character: Character }> = ({ character }) => {
  const dispatch = useAppDispatch();
  const name = character.name;
  return (
    <SwitchRow
      title={`${name} sometimes misremembers`}
      hint={`Once in a long while ${name} gets a small detail wrong (a name, a number, a day) and corrects themselves, the way people do. Never anything that matters.`}
      checked={Boolean(character.misremembers)}
      onChange={(on) => dispatch(updateCharacter({ ...character, misremembers: on || undefined }))}
    />
  );
};

// Moods that carry over (#106): per chat, with what's hanging over now.
export const MoodCarryRows: React.FC<{ chat: Chat; character: Character }> = ({ chat, character }) => {
  const dispatch = useAppDispatch();
  const name = character.name;
  const set = (patch: Partial<Chat>) => dispatch(updateChatOptions({ chatId: chat.id, patch }));
  const mood = chat.moodCarry ? fadedMood(chat.mood, Date.now()) : undefined;
  return (
    <div className="flex flex-col gap-2">
      <SwitchRow
        title="Moods linger"
        hint={`What ${name} felt in a reply stays with them for a few hours and colours the next ones, fading as time passes and with warmth from you.`}
        checked={Boolean(chat.moodCarry)}
        onChange={(on) => set({ moodCarry: on || undefined, ...(on ? {} : { mood: undefined }) })}
      />
      {chat.moodCarry && (
        <div className="flex items-center justify-between gap-3 text-[11px] text-subtle" data-testid="lingering-mood">
          <span>{mood ? describeMood(mood, Date.now()) : "Nothing hanging over right now"}</span>
          {mood && (
            <button type="button" className="shrink-0 text-primary hover:underline" onClick={() => set({ mood: undefined })}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Drama and conflict (#97, #99, #100): per-chat switches.
export const DramaSection: React.FC<{ chat: Chat; character: Character }> = ({ chat, character }) => {
  const dispatch = useAppDispatch();
  const name = character.name;
  const set = (patch: Partial<Chat>) => dispatch(updateChatOptions({ chatId: chat.id, patch }));
  return (
    <>
      <div className="flex flex-col gap-2">
        <SwitchRow
          title="Fights that need making up"
          hint={`If you really hurt ${name}, they stay upset (cooler, slower to answer) until you make it right. A bare "sorry" may not do it.`}
          checked={Boolean(chat.conflicts)}
          onChange={(on) => set({ conflicts: on || undefined, ...(on ? {} : { conflict: undefined }) })}
        />
        {chat.conflict && (
          <button type="button" className="self-start text-[11px] text-primary hover:underline" onClick={() => set({ conflict: undefined })}>
            End the fight now
          </button>
        )}
      </div>
      <SwitchRow
        title={`${name} notices other chats`}
        hint={`Come back after talking a lot with other characters and ${name} may notice, tease or sulk, as they would. Names only the ones ${name} knows about.`}
        checked={Boolean(chat.jealousy)}
        onChange={(on) => set({ jealousy: on || undefined })}
      />
      <SwitchRow
        title={`${name} can lie`}
        hint={`Small lies when ${name} really would. The truth stays hidden (the Story tab can show it), and you can catch them out.`}
        checked={Boolean(chat.lies)}
        onChange={(on) => set({ lies: on || undefined })}
      />
    </>
  );
};
