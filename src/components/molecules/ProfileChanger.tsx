import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText, generateAvatarImage } from "src/features/aiSlice";
import { updateCharacter } from "src/features/characterSlice";
import { addChatNotice } from "src/features/chatSlice";
import { buildAboutPrompt, cleanAbout, photoChangeDue, photoHint, profileChangeDue } from "src/features/character/profileChanges";
import { awakeAt } from "src/features/character/firstTexts";
import { dayMoodFor } from "src/features/character/badDays";
import { concernsLine } from "src/features/character/preoccupations";
import { dayLogText } from "src/features/character/dayLog";

const CHECK_EVERY_MS = 60 * 60 * 1000;
const FIRST_CHECK_MS = 25 * 1000;

// Profile changes (#125): while the app is open, a character with the
// switch on and a 1:1 chat with you changes their About line (helper model)
// every few days, and every other time their profile photo too (image
// provider); the chat gets a notice. One character per check.
const ProfileChanger = () => {
  const dispatch = useAppDispatch();
  const characters = useAppSelector((state) => state.character.characters);
  const chats = useAppSelector((state) => state.chat.chats);
  const latest = useRef({ characters, chats });
  latest.current = { characters, chats };
  const busy = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (busy.current) return;
      const now = Date.now();
      const { characters, chats } = latest.current;
      const chatFor = (id: number) => chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === id && !c.whatIf);
      const changer = characters.find((c) => profileChangeDue(c, now) && awakeAt(c, now) && chatFor(c.id));
      if (!changer) return;
      busy.current = true;
      try {
        const about = cleanAbout(await dispatch(generateAssistText({
          instruction: buildAboutPrompt(changer, { dayMood: dayMoodFor(changer, now)?.label, concerns: concernsLine(changer.concerns), dayLog: dayLogText(changer, now) }),
          background: true,
          activity: { kind: "profile", text: `${changer.name} changed their About`, characterId: changer.id, name: changer.name },
        })).unwrap());
        let photo: string | undefined;
        if (about && photoChangeDue(changer)) {
          try {
            const drawn = await dispatch(generateAvatarImage({ name: changer.name, appearance: changer.appearance, visualTags: changer.visualTags, appearanceImages: changer.appearanceImages, artStyle: changer.artStyle, hint: photoHint(about), localImageSettings: changer.localImageSettings })).unwrap();
            photo = drawn.images?.[0];
          } catch (err) {
            console.warn("Profile photo failed (non-fatal):", err);
          }
        }
        // Recorded even when nothing usable came back, so it isn't retried every hour.
        const fresh = latest.current.characters.find((c) => c.id === changer.id) || changer;
        await dispatch(updateCharacter({
          ...fresh,
          profileChangedAt: now,
          profileChangeCount: (fresh.profileChangeCount || 0) + 1,
          ...(about ? { about } : {}),
          ...(photo ? { profilePhoto: photo } : {}),
        }));
        const chat = chatFor(changer.id);
        if (chat?.id && about) await dispatch(addChatNotice({ chatId: chat.id, text: `${changer.name} changed their About to "${about}"` }));
        if (chat?.id && photo) await dispatch(addChatNotice({ chatId: chat.id, text: `${changer.name} changed their profile photo` }));
      } catch (err) {
        console.warn("Profile change failed (non-fatal):", err);
      } finally {
        busy.current = false;
      }
    };
    const first = window.setTimeout(check, FIRST_CHECK_MS);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [dispatch]);

  return null;
};

export default ProfileChanger;
