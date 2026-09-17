import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { dbService } from "../services/dbService";
import { Adventure, AdventureRules, AdventureStatus, ConversationTree, Message } from "../types";
import { addChildNode, flattenPath, generateNodeId } from "./chat/messageTree";

// Helper function for error handling
const handleDbError = (error: unknown, rejectWithValue: any) => {
  console.error("Database Error:", error);
  if (error instanceof Error) {
    return rejectWithValue(error.message);
  }
  return rejectWithValue("An error occurred while accessing the database.");
};

// Async Thunks
export const fetchAdventures = createAsyncThunk("adventure/fetchAll", async (_, { rejectWithValue }) => {
  try {
    return await dbService.getAllAdventures();
  } catch (error) {
    return handleDbError(error, rejectWithValue);
  }
});

export const fetchAdventureById = createAsyncThunk("adventure/fetchById", async (id: number, { rejectWithValue }) => {
  try {
    return await dbService.getAdventureById(id);
  } catch (error) {
    return handleDbError(error, rejectWithValue);
  }
});

export const addAdventure = createAsyncThunk(
  "adventure/add",
  async (
    { title, worldId, characterIds, personaId, premise, rules }: { title: string; worldId?: number; characterIds?: number[]; personaId?: string; premise?: string; rules?: AdventureRules },
    { rejectWithValue }
  ) => {
    try {
      const timestamp = Date.now();
      const newAdventure: Omit<Adventure, "id"> = {
        title,
        timestamp,
        worldId,
        characterIds: characterIds || [],
        personaId,
        premise,
        rules,
        status: "active",
        content: [],
      };
      const id = await dbService.addAdventure(newAdventure);
      return { id, ...newAdventure } as Adventure;
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

export const deleteAdventure = createAsyncThunk("adventure/delete", async (adventureId: number, { rejectWithValue }) => {
  try {
    await dbService.deleteAdventure(adventureId);
    return adventureId;
  } catch (error) {
    return handleDbError(error, rejectWithValue);
  }
});

// Appends one message (narrator turn or player action), extending from the
// active leaf when the adventure has branched at least once - same
// tree-vs-flat-array duality as Chat.content/Chat.tree. Refetches the whole
// list afterward instead of returning a delta, matching chatSlice's
// addMessage.
export const addAdventureMessage = createAsyncThunk(
  "adventure/addMessage",
  async ({ adventureId, message }: { adventureId: number; message: Omit<Message, "id" | "timestamp"> }, { dispatch, rejectWithValue }) => {
    try {
      const adventure = await dbService.getAdventureById(adventureId);
      const newMessage: Message = { ...message, id: generateNodeId(), timestamp: Date.now() };

      if (adventure.tree) {
        const { tree, nodeId } = addChildNode(adventure.tree, adventure.activeLeafId || null, newMessage);
        adventure.tree = tree;
        adventure.activeLeafId = nodeId;
        adventure.content = flattenPath(tree, nodeId);
      } else {
        adventure.content.push(newMessage);
      }

      await dbService.updateAdventure(adventure);
      dispatch(fetchAdventures());
      return adventure.content;
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Structured update for branching regenerate/edit/switch-branch - keeps
// Adventure.content and Adventure.tree in sync in a single write, mirroring
// chatSlice's updateChatTree.
export const updateAdventureTree = createAsyncThunk(
  "adventure/updateTree",
  async (
    { adventureId, content, tree, activeLeafId }: { adventureId: number; content: Message[]; tree: ConversationTree; activeLeafId: string | null },
    { rejectWithValue }
  ) => {
    try {
      const adventure = await dbService.getAdventureById(adventureId);
      adventure.content = content;
      adventure.tree = tree;
      adventure.activeLeafId = activeLeafId;
      await dbService.updateAdventure(adventure);
      return { adventureId, content, tree, activeLeafId };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Updates the cast pulled into this adventure (add/remove an NPC mid-story),
// leaving content and tree untouched.
export const updateAdventureCharacterIds = createAsyncThunk(
  "adventure/updateCharacterIds",
  async ({ adventureId, characterIds }: { adventureId: number; characterIds: number[] }, { rejectWithValue }) => {
    try {
      const adventure = await dbService.getAdventureById(adventureId);
      adventure.characterIds = characterIds;
      await dbService.updateAdventure(adventure);
      return { adventureId, characterIds };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Marks an adventure active/completed.
export const updateAdventureStatus = createAsyncThunk(
  "adventure/updateStatus",
  async ({ adventureId, status }: { adventureId: number; status: AdventureStatus }, { rejectWithValue }) => {
    try {
      const adventure = await dbService.getAdventureById(adventureId);
      adventure.status = status;
      await dbService.updateAdventure(adventure);
      return { adventureId, status };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Overrides which user persona this adventure uses, independent of the
// global active persona - mirrors chatSlice's updateChatPersona.
export const updateAdventurePersona = createAsyncThunk(
  "adventure/updatePersona",
  async ({ adventureId, personaId }: { adventureId: number; personaId?: string }, { rejectWithValue }) => {
    try {
      const adventure = await dbService.getAdventureById(adventureId);
      adventure.personaId = personaId;
      await dbService.updateAdventure(adventure);
      return { adventureId, personaId };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Updates the narrator's tone/choice-count/safety knobs (Adventure.rules).
export const updateAdventureRules = createAsyncThunk(
  "adventure/updateRules",
  async ({ adventureId, rules }: { adventureId: number; rules: AdventureRules }, { rejectWithValue }) => {
    try {
      const adventure = await dbService.getAdventureById(adventureId);
      adventure.rules = rules;
      await dbService.updateAdventure(adventure);
      return { adventureId, rules };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Adds to (never replaces) an adventure's running usage totals - mirrors
// chatSlice's incrementChatUsage.
export const incrementAdventureUsage = createAsyncThunk(
  "adventure/incrementUsage",
  async ({ adventureId, tokens, cost }: { adventureId: number; tokens: number; cost: number }, { rejectWithValue }) => {
    try {
      if (!tokens && !cost) return null;
      const adventure = await dbService.getAdventureById(adventureId);
      const totalTokensUsed = (adventure.totalTokensUsed || 0) + tokens;
      const totalCostEstimate = (adventure.totalCostEstimate || 0) + cost;
      adventure.totalTokensUsed = totalTokensUsed;
      adventure.totalCostEstimate = totalCostEstimate;
      await dbService.updateAdventure(adventure);
      return { adventureId, totalTokensUsed, totalCostEstimate };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

interface AdventureState {
  adventures: Adventure[];
  loading: boolean;
  error: string | null;
}

const initialState: AdventureState = {
  adventures: [],
  loading: false,
  error: null,
};

const adventureSlice = createSlice({
  name: "adventure",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAdventures.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAdventures.fulfilled, (state, action) => {
        state.loading = false;
        state.adventures = action.payload;
      })
      .addCase(fetchAdventures.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchAdventureById.fulfilled, (state, action) => {
        const idx = state.adventures.findIndex((a) => a.id === action.payload.id);
        if (idx !== -1) state.adventures[idx] = action.payload;
        else state.adventures.push(action.payload);
      })
      .addCase(fetchAdventureById.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(addAdventure.fulfilled, (state, action) => {
        state.adventures.push(action.payload);
      })
      .addCase(addAdventure.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(deleteAdventure.fulfilled, (state, action) => {
        state.adventures = state.adventures.filter((adventure) => adventure.id !== action.payload);
      })
      .addCase(deleteAdventure.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateAdventureTree.fulfilled, (state, action) => {
        const adventure = state.adventures.find((a) => a.id === action.payload.adventureId);
        if (adventure) {
          adventure.content = action.payload.content;
          adventure.tree = action.payload.tree;
          adventure.activeLeafId = action.payload.activeLeafId;
        }
      })
      .addCase(updateAdventureTree.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateAdventureCharacterIds.fulfilled, (state, action) => {
        const adventure = state.adventures.find((a) => a.id === action.payload.adventureId);
        if (adventure) adventure.characterIds = action.payload.characterIds;
      })
      .addCase(updateAdventureCharacterIds.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateAdventureStatus.fulfilled, (state, action) => {
        const adventure = state.adventures.find((a) => a.id === action.payload.adventureId);
        if (adventure) adventure.status = action.payload.status;
      })
      .addCase(updateAdventureStatus.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateAdventurePersona.fulfilled, (state, action) => {
        const adventure = state.adventures.find((a) => a.id === action.payload.adventureId);
        if (adventure) adventure.personaId = action.payload.personaId;
      })
      .addCase(updateAdventurePersona.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateAdventureRules.fulfilled, (state, action) => {
        const adventure = state.adventures.find((a) => a.id === action.payload.adventureId);
        if (adventure) adventure.rules = action.payload.rules;
      })
      .addCase(updateAdventureRules.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(incrementAdventureUsage.fulfilled, (state, action) => {
        if (!action.payload) return;
        const adventure = state.adventures.find((a) => a.id === action.payload!.adventureId);
        if (adventure) {
          adventure.totalTokensUsed = action.payload!.totalTokensUsed;
          adventure.totalCostEstimate = action.payload!.totalCostEstimate;
        }
      })
      .addCase(incrementAdventureUsage.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

export default adventureSlice.reducer;
