import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { logToTimeline } from "./world/timeline";
import { dbService } from "../services/dbService";
import { CHARACTER } from "../utils/constants";
import { Character, World } from "../types";

// Helper function to handle database errors
const handleDbError = (error: unknown, rejectWithValue: any) => {
  console.error("Database Error:", error);
  if (error instanceof Error) {
    return rejectWithValue(error.message);
  }
  return rejectWithValue("An error occurred while accessing the database.");
};

// Async Thunks
export const fetchCharacters = createAsyncThunk(
  "character/fetchAll",
  async (_, { rejectWithValue }) => {
    try {
      return await dbService.getAllCharacters();
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

export const fetchCharacterById = createAsyncThunk(
  "character/fetchById",
  async (id: number, { rejectWithValue }) => {
    try {
      return await dbService.getCharacterById(id);
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

export const addCharacter = createAsyncThunk(
  "character/add",
  async (character: Omit<Character, "id">, { getState, rejectWithValue }) => {
    try {
      // A new character joins the world on screen (#143) unless they come
      // with one (a copy for another world).
      const currentWorldId = (getState() as { world?: { currentWorldId: number | null } }).world?.currentWorldId;
      if (character.worldId === undefined && currentWorldId) character = { ...character, worldId: currentWorldId };
      if (!character.name.trim() || !character.prompt.trim()) {
        throw new Error("Character name and prompt are required.");
      }
      // Every field is kept: this used to copy a fixed list of fields, so
      // anything added to Character later (alternate greetings, content
      // rating, locked look, voice, model...) was silently dropped when a
      // character was created or imported, and only survived an edit. An id
      // that came along (say, from an exported file) is dropped so the
      // database assigns a fresh one instead of overwriting another row.
      const { id: _ignoredId, ...newChar } = character as Character;
      const id = await dbService.addCharacter(newChar);
      // The world's timeline (#161): someone arrived.
      const worlds = (getState() as { world?: { worlds: World[] } }).world?.worlds || [];
      const world = worlds.find((w) => w.id === newChar.worldId);
      void logToTimeline(world ? world.id : null, { kind: "arrival", text: `${newChar.name} ${newChar.cardOf ? "came from another world" : "arrived"}`, characterIds: [id] }, world?.storyTime);
      return { id, ...newChar } as Character;
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

export const deleteCharacter = createAsyncThunk(
  "character/delete",
  async (characterId: number, { getState, rejectWithValue }) => {
    try {
      // The world's timeline (#161): someone left.
      const state = getState() as { character: CharacterState; world?: { worlds: World[] } };
      const leaving = state.character.characters.find((c) => c.id === characterId);
      const world = state.world?.worlds.find((w) => w.id === leaving?.worldId);
      if (leaving) void logToTimeline(world ? world.id : null, { kind: "departure", text: `${leaving.name} left`, characterIds: [characterId] }, world?.storyTime);
      await dbService.removeCharacterFromChats(characterId);
      await dbService.removeCharacterFromAdventures(characterId);
      await dbService.deleteCharacter(characterId);
      return characterId;
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

export const updateCharacter = createAsyncThunk(
  "character/update",
  async (character: Character, { rejectWithValue }) => {
    try {
      // Each world's copy of a character is its own (the user's call,
      // 2026-10-26): editing one never changes the others.
      await dbService.updateCharacter(character);
      return character;
    } catch (error) {
      return rejectWithValue("Failed to update character.");
    }
  }
);

interface CharacterState {
  characters: Character[];
  loading: boolean;
  error: string | null;
}

const initialState: CharacterState = {
  characters: [],
  loading: false,
  error: null,
};

// Character Slice
const characterSlice = createSlice({
  name: CHARACTER,
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCharacters.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCharacters.fulfilled, (state, action) => {
        state.loading = false;
        state.characters = action.payload;
      })
      .addCase(fetchCharacters.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchCharacterById.fulfilled, (state, action) => {
        // Refreshes one character in place - used when entering a chat to
        // pick up edits made elsewhere (Character Editor, an in-chat
        // generate/gallery action) without needing a full app reload.
        const idx = state.characters.findIndex((c) => c.id === action.payload.id);
        if (idx !== -1) state.characters[idx] = action.payload;
        else state.characters.push(action.payload);
      })
      .addCase(fetchCharacterById.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(addCharacter.fulfilled, (state, action) => {
        state.characters.push(action.payload);
      })
      .addCase(addCharacter.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateCharacter.fulfilled, (state, action) => {
        // Without this, an edit (Character Editor save, memory/gallery
        // updates from ScenePanel/ChatPage) persists to IndexedDB fine but
        // the rest of the running app keeps showing the pre-edit character
        // until something else happens to refetch it.
        const idx = state.characters.findIndex((c) => c.id === action.payload.id);
        if (idx !== -1) state.characters[idx] = action.payload;
      })
      .addCase(updateCharacter.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(deleteCharacter.fulfilled, (state, action) => {
        state.characters = state.characters.filter((char) => char.id !== action.payload);
      })
      .addCase(deleteCharacter.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

export default characterSlice.reducer;
