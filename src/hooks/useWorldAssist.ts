import { useAppDispatch } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { buildCastSuggestionsPrompt, buildWorldFieldPrompt, buildWorldFillPrompt, CastLite, cleanFieldSuggestion, parseCastSuggestions, parseWorldFill, WorldDraft, WorldField } from "src/features/world/worldAssist";

// The AI calls behind the world wizard's and editor's helpers (#144).
export const useWorldAssist = () => {
  const dispatch = useAppDispatch();
  const ask = (instruction: string) => dispatch(generateAssistText({ instruction })).unwrap();
  return {
    suggestField: async (field: WorldField, world: WorldDraft, cast: CastLite[] = []) => cleanFieldSuggestion(await ask(buildWorldFieldPrompt(field, world, cast))) || undefined,
    fillWorld: async (world: WorldDraft, cast: CastLite[] = []) => parseWorldFill(await ask(buildWorldFillPrompt(world, cast))),
    suggestCast: async (world: WorldDraft, cast: CastLite[], skip: string[] = []) => parseCastSuggestions(await ask(buildCastSuggestionsPrompt(world, cast, skip)), cast),
  };
};
