import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { dbService } from "../services/dbService";
import { WORLD } from "../utils/constants";
import { World } from "../types";

// Helper function to handle database errors
const handleDbError = (error: unknown, rejectWithValue: any) => {
  console.error("Database Error:", error);
  if (error instanceof Error) {
    return rejectWithValue(error.message);
  }
  return rejectWithValue("An error occurred while accessing the database.");
};

// Async Thunks
export const fetchWorlds = createAsyncThunk(
  "world/fetchAll",
  async (_, { rejectWithValue }) => {
    try {
      return await dbService.getAllWorlds();
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

export const fetchWorldById = createAsyncThunk(
  "world/fetchById",
  async (id: number, { rejectWithValue }) => {
    try {
      return await dbService.getWorldById(id);
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

export const addWorld = createAsyncThunk(
  "world/add",
  async ({ name, premise, settingDetails, tone, loreEntries, coverImage, tags }: Omit<World, "id">, { rejectWithValue }) => {
    try {
      if (!name.trim() || !premise.trim()) {
        throw new Error("World name and premise are required.");
      }
      const newWorld = { name, premise, settingDetails, tone, loreEntries, coverImage, tags };
      const id = await dbService.addWorld(newWorld);
      return { id, ...newWorld } as World;
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

export const updateWorld = createAsyncThunk(
  "world/update",
  async (world: World, { rejectWithValue }) => {
    try {
      await dbService.updateWorld(world);
      return world;
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

export const deleteWorld = createAsyncThunk(
  "world/delete",
  async (worldId: number, { rejectWithValue }) => {
    try {
      await dbService.clearWorldFromAdventures(worldId);
      await dbService.deleteWorld(worldId);
      return worldId;
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

interface WorldState {
  worlds: World[];
  loading: boolean;
  error: string | null;
}

const initialState: WorldState = {
  worlds: [],
  loading: false,
  error: null,
};

const worldSlice = createSlice({
  name: WORLD,
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchWorlds.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWorlds.fulfilled, (state, action) => {
        state.loading = false;
        state.worlds = action.payload;
      })
      .addCase(fetchWorlds.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchWorldById.fulfilled, (state, action) => {
        const idx = state.worlds.findIndex((w) => w.id === action.payload.id);
        if (idx !== -1) state.worlds[idx] = action.payload;
        else state.worlds.push(action.payload);
      })
      .addCase(fetchWorldById.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(addWorld.fulfilled, (state, action) => {
        state.worlds.push(action.payload);
      })
      .addCase(addWorld.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateWorld.fulfilled, (state, action) => {
        const idx = state.worlds.findIndex((w) => w.id === action.payload.id);
        if (idx !== -1) state.worlds[idx] = action.payload;
      })
      .addCase(updateWorld.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(deleteWorld.fulfilled, (state, action) => {
        state.worlds = state.worlds.filter((world) => world.id !== action.payload);
      })
      .addCase(deleteWorld.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

export default worldSlice.reducer;
