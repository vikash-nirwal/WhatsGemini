import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { dbService } from "../services/dbService";
import { MyStatus } from "../types";
import { Dispatch } from "@reduxjs/toolkit";

// Your own statuses (#117), kept in the database's settings table: they
// last a day, so they're left out of backups on purpose.
const KEY = "my_statuses";

interface MyStatusState {
  statuses: MyStatus[];
}

const initialState: MyStatusState = { statuses: [] };

export const loadMyStatuses = createAsyncThunk("myStatus/load", async () => ((await dbService.getSetting(KEY)) as MyStatus[] | undefined) || []);

// Changes the stored list from its latest copy, so the watcher marking a
// reply sent and a post landing at once can't overwrite each other.
export const changeMyStatuses = (change: (statuses: MyStatus[]) => MyStatus[]) => async (dispatch: Dispatch) => {
  const current = ((await dbService.getSetting(KEY)) as MyStatus[] | undefined) || [];
  const next = change(current);
  await dbService.setSetting(KEY, next);
  dispatch(setMyStatuses(next));
  return next;
};

const myStatusSlice = createSlice({
  name: "myStatus",
  initialState,
  reducers: {
    setMyStatuses: (state, action: PayloadAction<MyStatus[]>) => {
      state.statuses = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadMyStatuses.fulfilled, (state, action) => {
      state.statuses = action.payload;
    });
  },
});

export const { setMyStatuses } = myStatusSlice.actions;
export default myStatusSlice.reducer;
