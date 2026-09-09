import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { dbService } from "../services/dbService";
import { CHARACTER } from "../utils/constants";
import { Character } from "../types";

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
  async ({ name, description, prompt, scenario, first_mes, mes_example, relationship, appearance, appearanceImages, avatar, accent, voiceURI, autoSelfie }: Omit<Character, "id">, { rejectWithValue }) => {
    try {
      if (!name.trim() || !prompt.trim()) {
        throw new Error("Character name and prompt are required.");
      }
      const newChar = { name, description, prompt, scenario, first_mes, mes_example, relationship, appearance, appearanceImages, avatar, accent, voiceURI, autoSelfie };
      const id = await dbService.addCharacter(newChar);
      return { id, ...newChar } as Character;
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

export const deleteCharacter = createAsyncThunk(
  "character/delete",
  async (characterId: number, { rejectWithValue }) => {
    try {
      await dbService.deleteChatsByCharacterId(characterId);
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
      .addCase(fetchCharacterById.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(addCharacter.fulfilled, (state, action) => {
        state.characters.push(action.payload);
      })
      .addCase(addCharacter.rejected, (state, action) => {
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
