import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { dbService } from "../services/dbService";
import { LS_INITIAL_MESSAGES, YOU, AI } from "../utils/constants";
import { Chat, Message, ConversationTree } from "../types";
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
export const fetchChats = createAsyncThunk("chat/fetchAll", async (_, { rejectWithValue }) => {
  try {
    return await dbService.getAllChats();
  } catch (error) {
    return handleDbError(error, rejectWithValue);
  }
});

export const fetchChatById = createAsyncThunk("chat/fetchById", async (id: number, { rejectWithValue }) => {
  try {
    return await dbService.getChatById(id);
  } catch (error) {
    return handleDbError(error, rejectWithValue);
  }
});

export const fetchChatByCharacterId = createAsyncThunk(
  "chat/fetchByCharacterId",
  async (characterId: number, { rejectWithValue }) => {
    try {
      return await dbService.getChatByCharacterId(characterId);
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

export const addChat = createAsyncThunk(
  "chat/add",
  async ({ title, characterId }: { title: string; characterId?: number }, { rejectWithValue }) => {
    try {
      const timestamp = Date.now();
      const newChat = { title, timestamp, content: [], characterId: characterId || null };
      const id = await dbService.addChat(newChat);
      return { id, ...newChat };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

export const addMessage = createAsyncThunk(
  "chat/addMessage",
  async ({ chatId, role, text, images, isImageRequest, isImpersonated, imagePrompt, imageParams }: { chatId: number; role: string; text: string; images?: string[], isImageRequest?: boolean, isImpersonated?: boolean, imagePrompt?: string, imageParams?: any }, { dispatch, rejectWithValue }) => {
    try {
      const chat = await dbService.getChatById(chatId);

      // If it's the first message, prepopulate with the character's own greeting
      // (if it has one) instead of the generic global initial messages.
      if (chat.content.length === 0) {
        const character = chat.characterId ? await dbService.getCharacterById(chat.characterId).catch(() => undefined) : undefined;
        if (character?.first_mes) {
          // Unlike the generic seed messages below, this is a real visible greeting
          // (not a hidden priming message), so it's left unflagged as `isSystem`.
          chat.content.push({ role: AI, txt: character.first_mes, id: generateNodeId(), timestamp: Date.now() });
        } else {
          const savedMessages = JSON.parse(localStorage.getItem(LS_INITIAL_MESSAGES) || "[]") as any[];
          savedMessages.forEach((msg) => {
            if (msg.role && msg.message) {
              chat.content.push({ role: msg.role, txt: msg.message, isSystem: true, id: generateNodeId(), timestamp: Date.now() });
            }
          });
        }
      }

      const newMessage: Message = { role, txt: text, images, isImageRequest, isImpersonated, imagePrompt, imageParams, id: generateNodeId(), timestamp: Date.now() };

      // A real reply from the user - or the user speaking as the character via
      // Impersonate mode - both mean the user is actively here, so any pending
      // auto-follow-up streak is over.
      if ((role === YOU || isImpersonated) && chat.autoReply) {
        chat.autoReply = { ...chat.autoReply, followupCount: 0 };
      }

      if (chat.tree) {
        // Tree-aware chat (has been branched at least once): extend from the active leaf.
        const { tree, nodeId } = addChildNode(chat.tree, chat.activeLeafId || null, newMessage);
        chat.tree = tree;
        chat.activeLeafId = nodeId;
        chat.content = flattenPath(tree, nodeId);
      } else {
        chat.content.push(newMessage);
      }

      await dbService.updateChat(chat);
      dispatch(fetchChats()); // Refresh state
      return chat.content;
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

export const deleteChat = createAsyncThunk("chat/delete", async (chatId: number, { rejectWithValue }) => {
  try {
    await dbService.deleteChat(chatId);
    return chatId;
  } catch (error) {
    return handleDbError(error, rejectWithValue);
  }
});

// Wholesale content replacement - used by chat compression. This intentionally
// discards any branch tree: compression is already a deliberate "throw away
// granular history" action, and a stale tree would otherwise silently
// resurrect the pre-compression messages the next time a branch is touched.
export const updateMessages = createAsyncThunk(
  "chat/updateMessages",
  async ({ chatId, newMessages }: { chatId: number; newMessages: Message[] }, { rejectWithValue }) => {
    try {
      const chat = await dbService.getChatById(chatId);
      chat.content = newMessages;
      chat.tree = undefined;
      chat.activeLeafId = undefined;
      await dbService.updateChat(chat);
      return { chatId, newMessages };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Structured update used by branching regenerate/edit/switch-branch - keeps
// Chat.content and Chat.tree in sync in a single write.
export const updateChatTree = createAsyncThunk(
  "chat/updateChatTree",
  async (
    { chatId, content, tree, activeLeafId }: { chatId: number; content: Message[]; tree: ConversationTree; activeLeafId: string | null },
    { rejectWithValue }
  ) => {
    try {
      const chat = await dbService.getChatById(chatId);
      chat.content = content;
      chat.tree = tree;
      chat.activeLeafId = activeLeafId;
      await dbService.updateChat(chat);
      return { chatId, content, tree, activeLeafId };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Updates just a chat's auto-follow-up settings (enabled/cooldown/max/count),
// leaving content and tree untouched.
export const updateChatAutoReply = createAsyncThunk(
  "chat/updateChatAutoReply",
  async ({ chatId, autoReply }: { chatId: number; autoReply: Chat["autoReply"] }, { rejectWithValue }) => {
    try {
      const chat = await dbService.getChatById(chatId);
      chat.autoReply = autoReply;
      await dbService.updateChat(chat);
      return { chatId, autoReply };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Updates just a chat's pinned flag, leaving content and tree untouched.
export const updateChatPinned = createAsyncThunk(
  "chat/updateChatPinned",
  async ({ chatId, pinned }: { chatId: number; pinned: boolean }, { rejectWithValue }) => {
    try {
      const chat = await dbService.getChatById(chatId);
      chat.pinned = pinned;
      await dbService.updateChat(chat);
      return { chatId, pinned };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Updates just a chat's author's note (Scene panel), leaving content and tree untouched.
export const updateChatAuthorNote = createAsyncThunk(
  "chat/updateChatAuthorNote",
  async ({ chatId, authorNote }: { chatId: number; authorNote: Chat["authorNote"] }, { rejectWithValue }) => {
    try {
      const chat = await dbService.getChatById(chatId);
      chat.authorNote = authorNote;
      await dbService.updateChat(chat);
      return { chatId, authorNote };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Updates just a chat's world tags (Scene panel), leaving content and tree untouched.
export const updateChatWorldTags = createAsyncThunk(
  "chat/updateChatWorldTags",
  async ({ chatId, worldTags }: { chatId: number; worldTags: Chat["worldTags"] }, { rejectWithValue }) => {
    try {
      const chat = await dbService.getChatById(chatId);
      chat.worldTags = worldTags;
      await dbService.updateChat(chat);
      return { chatId, worldTags };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Overrides which user persona this chat uses, independent of the global
// active persona (Settings > Personas). `personaId: undefined` clears the
// override so the chat falls back to whichever persona is globally active.
export const updateChatPersona = createAsyncThunk(
  "chat/updateChatPersona",
  async ({ chatId, personaId }: { chatId: number; personaId?: string }, { rejectWithValue }) => {
    try {
      const chat = await dbService.getChatById(chatId);
      chat.personaId = personaId;
      await dbService.updateChat(chat);
      return { chatId, personaId };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Adds to (never replaces) a chat's running usage totals - called after every
// real provider call (a normal reply, or a compression/summarization call),
// so the total reflects everything ever spent on this chat even after older
// messages get folded away by compression.
export const incrementChatUsage = createAsyncThunk(
  "chat/incrementChatUsage",
  async ({ chatId, tokens, cost }: { chatId: number; tokens: number; cost: number }, { rejectWithValue }) => {
    try {
      if (!tokens && !cost) return null;
      const chat = await dbService.getChatById(chatId);
      const totalTokensUsed = (chat.totalTokensUsed || 0) + tokens;
      const totalCostEstimate = (chat.totalCostEstimate || 0) + cost;
      chat.totalTokensUsed = totalTokensUsed;
      chat.totalCostEstimate = totalCostEstimate;
      await dbService.updateChat(chat);
      return { chatId, totalTokensUsed, totalCostEstimate };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

export const importChat = createAsyncThunk("chat/import", async (chatData: any, { rejectWithValue }) => {
  try {
    const isArray = Array.isArray(chatData);
    const content = isArray ? chatData : (chatData.content || chatData.messages);
    const title = !isArray && chatData.title ? chatData.title : "Imported Chat";
    const characterId = !isArray && chatData.characterId ? chatData.characterId : null;
    const timestamp = !isArray && chatData.timestamp ? chatData.timestamp : Date.now();

    if (!content || !Array.isArray(content)) {
      throw new Error("Invalid chat data format.");
    }

    const authorNote = !isArray && chatData.authorNote ? chatData.authorNote : undefined;
    const worldTags = !isArray && Array.isArray(chatData.worldTags) ? chatData.worldTags : undefined;

    const newChat = {
      title,
      content,
      characterId,
      timestamp,
      authorNote,
      worldTags,
    };

    const id = await dbService.addChat(newChat);
    return { ...newChat, id };
  } catch (error) {
    return handleDbError(error, rejectWithValue);
  }
});

interface ChatState {
  chats: Chat[];
  loading: boolean;
  error: string | null;
  // Ephemeral, not persisted: chatId -> the timestamp its next autonomous
  // follow-up is due to fire. Only ever set for the chat currently open in
  // this tab (see ChatPage's scheduling effect), but keyed by chatId in
  // Redux rather than component state so the Sidebar can render a "Typing..."
  // badge on that chat's row without needing its own timer.
  pendingFollowups: Record<number, number>;
}

const initialState: ChatState = {
  chats: [],
  loading: false,
  error: null,
  pendingFollowups: {},
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setPendingFollowupAt: (state, action: { payload: { chatId: number; dueAt: number | null } }) => {
      const { chatId, dueAt } = action.payload;
      if (dueAt === null) {
        delete state.pendingFollowups[chatId];
      } else {
        state.pendingFollowups[chatId] = dueAt;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchChats.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchChats.fulfilled, (state, action) => {
        state.loading = false;
        state.chats = action.payload;
      })
      .addCase(fetchChats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchChatById.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(addChat.fulfilled, (state, action) => {
        state.chats.push(action.payload as Chat);
      })
      .addCase(addChat.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(deleteChat.fulfilled, (state, action) => {
        state.chats = state.chats.filter((chat) => chat.id !== action.payload);
      })
      .addCase(deleteChat.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateMessages.fulfilled, (state, action) => {
        const chat = state.chats.find((c) => c.id === action.payload.chatId);
        if (chat) {
          chat.content = action.payload.newMessages;
          chat.tree = undefined;
          chat.activeLeafId = undefined;
        }
      })
      .addCase(updateChatTree.fulfilled, (state, action) => {
        const chat = state.chats.find((c) => c.id === action.payload.chatId);
        if (chat) {
          chat.content = action.payload.content;
          chat.tree = action.payload.tree;
          chat.activeLeafId = action.payload.activeLeafId;
        }
      })
      .addCase(updateChatTree.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateChatAutoReply.fulfilled, (state, action) => {
        const chat = state.chats.find((c) => c.id === action.payload.chatId);
        if (chat) {
          chat.autoReply = action.payload.autoReply;
        }
      })
      .addCase(updateChatAutoReply.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateChatPinned.fulfilled, (state, action) => {
        const chat = state.chats.find((c) => c.id === action.payload.chatId);
        if (chat) {
          chat.pinned = action.payload.pinned;
        }
      })
      .addCase(updateChatPinned.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateChatAuthorNote.fulfilled, (state, action) => {
        const chat = state.chats.find((c) => c.id === action.payload.chatId);
        if (chat) {
          chat.authorNote = action.payload.authorNote;
        }
      })
      .addCase(updateChatAuthorNote.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateChatWorldTags.fulfilled, (state, action) => {
        const chat = state.chats.find((c) => c.id === action.payload.chatId);
        if (chat) {
          chat.worldTags = action.payload.worldTags;
        }
      })
      .addCase(updateChatWorldTags.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateChatPersona.fulfilled, (state, action) => {
        const chat = state.chats.find((c) => c.id === action.payload.chatId);
        if (chat) {
          chat.personaId = action.payload.personaId;
        }
      })
      .addCase(updateChatPersona.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(incrementChatUsage.fulfilled, (state, action) => {
        if (!action.payload) return;
        const chat = state.chats.find((c) => c.id === action.payload!.chatId);
        if (chat) {
          chat.totalTokensUsed = action.payload!.totalTokensUsed;
          chat.totalCostEstimate = action.payload!.totalCostEstimate;
        }
      })
      .addCase(incrementChatUsage.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateMessages.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(importChat.fulfilled, (state, action) => {
        state.chats.push(action.payload as Chat);
      })
      .addCase(importChat.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

export const { setPendingFollowupAt } = chatSlice.actions;
export default chatSlice.reducer;
