import { Character, World } from "../../types";
import { AppDispatch } from "../../store/store";
import { generateAssistText } from "../aiSlice";
import { addCharacter, updateCharacter } from "../characterSlice";
import { buildCharacterDraftPrompt, parseCharacterDraft } from "../character/characterDraft";
import { withTie } from "../character/ties";
import { CHARACTER_SWATCHES } from "../../utils/constants";
import { castIdea } from "./worldWizard";
import { withDefaultLife } from "../character/lifePresets";
import { CastSuggestion, mirrorTie } from "./worldAssist";

// Someone suggested for a world (#144, #164), drafted in full to fit it and
// tied to the resident they were suggested with.
export const addSuggestedPerson = (world: World, sg: CastSuggestion, residents: Character[]) => async (dispatch: AppDispatch) => {
  const other = residents.find((c) => c.name === sg.tieWith);
  const connection = other && sg.tie ? { name: other.name, description: other.description, tie: sg.tie } : undefined;
  const draft = parseCharacterDraft(await dispatch(generateAssistText({ instruction: buildCharacterDraftPrompt({ idea: castIdea(`${sg.name}: ${sg.idea}`, world, connection) }) })).unwrap());
  const made = await dispatch(addCharacter(withDefaultLife({ ...draft, name: sg.name, first_mes: draft.first_mes || undefined, accent: CHARACTER_SWATCHES[Math.floor(Math.random() * CHARACTER_SWATCHES.length)], worldId: world.id }) as Omit<Character, "id">)).unwrap();
  if (other && sg.tie) {
    const [na, nb] = withTie(other, made, sg.tie, mirrorTie(sg.tie));
    await dispatch(updateCharacter(na));
    await dispatch(updateCharacter(nb));
  }
  return made;
};
