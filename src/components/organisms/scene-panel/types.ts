import { Character, Intensity } from "src/types";

// What every Scene panel tab gets: the panel's own props.
export interface ScenePanelTabProps {
  chatId: number;
  character?: Character;
  // Whether this chat currently has 2+ characters. When true, Memory
  // reads/writes the room's own Chat.memory instead of the primary
  // character's Character.memory, and a Scenario editor for the room's own
  // Chat.scenario is shown - both scoped to just this room, so nothing here
  // ever touches any participant's own character record.
  isRoom?: boolean;
  chatMemory?: string[];
  chatPinnedMemory?: string[];
  chatScenario?: string;
  authorNote?: string;
  worldTags?: string[];
  hardLimits?: string[];
  intensity?: Intensity;
  isNsfwChat?: boolean; // intensity only matters (and is only shown) when the chat is effectively NSFW
  onClose: () => void;
  onEditStory?: () => void; // opens the story script editor (#57)
  hasStoryScript?: boolean;
}
