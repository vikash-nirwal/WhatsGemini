import { Character, Chat, World } from "../../types";
import { AppDispatch } from "../../store/store";
import { generateAssistText } from "../aiSlice";
import { addChatNotice, updateChatOptions } from "../chatSlice";
import { patchCharacter } from "../characterSlice";
import { buildPlanOutcomePrompt, cleanOutcome, planMemory, withPlanMemory } from "./groupPlans";
import { logToTimeline } from "./timeline";
import { YOU } from "../../utils/constants";

// Writing up how a group plan went (#168, #184): from your line, or - when
// its day passes without you saying - from the chat alone. Every member
// remembers it. Throws when nothing usable came back.
export const writePlanOutcome = (chat: Chat, characters: Character[], world: World | undefined, userName: string, idea?: string, background = false) => async (dispatch: AppDispatch) => {
  const plan = chat.groupPlan!;
  const members = characters.filter((c) => plan.memberIds.includes(c.id));
  const transcript = (chat.content || []).slice(-30).map((m) => `${m.role === YOU ? userName : characters.find((c) => c.id === m.speakerId)?.name || "?"}: ${m.txt}`).join("\n");
  const outcome = cleanOutcome(await dispatch(generateAssistText({
    instruction: buildPlanOutcomePrompt(plan, members.map((c) => c.name), userName, transcript, idea),
    ...(background ? { background: true, activity: { kind: "other" as const, text: `${plan.title} happened`, name: plan.title }, ...(world ? { worldId: world.id } : {}) } : {}),
  })).unwrap());
  if (!outcome) throw new Error("Nothing usable came back.");
  const fact = planMemory(plan, outcome, userName);
  for (const m of members) await dispatch(patchCharacter(m.id, (fresh) => withPlanMemory(fresh, fact)));
  await dispatch(updateChatOptions({ chatId: chat.id!, patch: { groupPlan: { ...plan, outcome, doneAt: Date.now() } } }));
  await dispatch(addChatNotice({ chatId: chat.id!, text: `How it went: ${outcome}` }));
  void logToTimeline(world ? world.id : null, { kind: "you", text: `${plan.title}: ${outcome}`, characterIds: plan.memberIds }, world?.storyTime);
  return outcome;
};
