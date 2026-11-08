import { Character, Chat } from "../../../types";
import { generateAssistText, generateAvatarImage } from "../../aiSlice";
import { patchCharacter } from "../../characterSlice";
import { addChatNotice } from "../../chatSlice";
import { dayMoodFor } from "../badDays";
import { dayLogText } from "../dayLog";
import { awakeAt } from "../firstTexts";
import { concernsLine } from "../preoccupations";
import { buildAboutPrompt, cleanAbout, photoChangeDue, photoHint, profileChangeDue } from "../profileChanges";
import { GetState, PersonalDispatch, personalState } from "./state";

const mainChatOf = (chats: Chat[], id: number) => chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === id && !c.whatIf);

// The character who changes their profile this check: due, awake, and with
// a 1:1 chat with you to put the notice in.
export const pickProfileChanger = (characters: Character[], chats: Chat[], now: number): Character | undefined =>
  characters.find((c) => profileChangeDue(c, now) && awakeAt(c, now) && mainChatOf(chats, c.id));

// A check still under way when another starts is left alone (see dayLogJob).
let busy = false;

// Profile changes (#125): a character with the switch on and a 1:1 chat
// with you changes their About line (helper model) every few days, and
// every other time their profile photo too (image provider); the chat gets
// a notice. One character per check. `at`: a catch-up turn back in your
// absence (#130), stamped with it.
export const profileCheck = (at?: number) => async (dispatch: PersonalDispatch, getState: GetState) => {
  if (busy) return;
  const now = at ?? Date.now();
  const { characters, chats } = personalState(getState);
  const changer = pickProfileChanger(characters, chats, now);
  if (!changer) return;
  busy = true;
  try {
    const about = cleanAbout(await dispatch(generateAssistText({
      instruction: buildAboutPrompt(changer, { dayMood: dayMoodFor(changer, now)?.label, concerns: concernsLine(changer.concerns), dayLog: dayLogText(changer, now) }),
      background: true,
      activity: { at: now, kind: "profile", text: `${changer.name} changed their About`, characterId: changer.id, name: changer.name },
    })).unwrap());
    let photo: string | undefined;
    if (about && photoChangeDue(changer)) {
      try {
        const drawn = await dispatch(generateAvatarImage({ imagePresetId: changer.imagePresetId, name: changer.name, appearance: changer.appearance, visualTags: changer.visualTags, appearanceImages: changer.appearanceImages, artStyle: changer.artStyle, hint: photoHint(about), localImageSettings: changer.localImageSettings })).unwrap();
        photo = drawn.images?.[0];
      } catch (err) {
        console.warn("Profile photo failed (non-fatal):", err);
      }
    }
    // Recorded even when nothing usable came back, so it isn't retried every hour.
    await dispatch(patchCharacter(changer.id, (fresh) => ({
      profileChangedAt: now,
      profileChangeCount: (fresh.profileChangeCount || 0) + 1,
      ...(about ? { about } : {}),
      ...(photo ? { profilePhoto: photo } : {}),
    })));
    // The chat as it was when the check started, as before.
    const chat = mainChatOf(chats, changer.id);
    if (chat?.id && about) await dispatch(addChatNotice({ chatId: chat.id, text: `${changer.name} changed their About to "${about}"` }));
    if (chat?.id && photo) await dispatch(addChatNotice({ chatId: chat.id, text: `${changer.name} changed their profile photo` }));
  } catch (err) {
    console.warn("Profile change failed (non-fatal):", err);
  } finally {
    busy = false;
  }
};
