import { createAsyncThunk, createSlice, Dispatch, PayloadAction } from "@reduxjs/toolkit";
import { dbService } from "../services/dbService";
import { Channel } from "../types";

// Channels you follow (#127), kept in the database's settings table.
const KEY = "channels";

interface ChannelState {
  channels: Channel[];
}

const initialState: ChannelState = { channels: [] };

export const loadChannels = createAsyncThunk("channels/load", async () => ((await dbService.getSetting(KEY)) as Channel[] | undefined) || []);

// Changes the stored list from its latest copy, so the poster adding a post
// and you reacting at once can't overwrite each other.
export const changeChannels = (change: (channels: Channel[]) => Channel[]) => async (dispatch: Dispatch) => {
  const current = ((await dbService.getSetting(KEY)) as Channel[] | undefined) || [];
  const next = change(current);
  await dbService.setSetting(KEY, next);
  dispatch(setChannels(next));
  return next;
};

const channelSlice = createSlice({
  name: "channels",
  initialState,
  reducers: {
    setChannels: (state, action: PayloadAction<Channel[]>) => {
      state.channels = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadChannels.fulfilled, (state, action) => {
      state.channels = action.payload;
    });
  },
});

export const { setChannels } = channelSlice.actions;
export default channelSlice.reducer;
