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

export const addChat = createAsyncThunk(
  "chat/add",
  async ({ title, characterIds, authorNote }: { title: string; characterIds?: number[]; authorNote?: string }, { rejectWithValue }) => {
    try {
      const timestamp = Date.now();
      const newChat = { title, timestamp, content: [], characterIds: characterIds || [], authorNote };
      const id = await dbService.addChat(newChat);
      return { id, ...newChat };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

export const addMessage = createAsyncThunk(
  "chat/addMessage",
  async ({ chatId, role, text, images, isImageRequest, isImpersonated, emotion, imagePrompt, imageParams, speakerId }: { chatId: number; role: string; text: string; images?: string[], isImageRequest?: boolean, isImpersonated?: boolean, emotion?: string, imagePrompt?: string, imageParams?: any, speakerId?: number }, { dispatch, rejectWithValue }) => {
    try {
      const chat = await dbService.getChatById(chatId);

      // If it's the first message, prepopulate with the primary character's
      // own greeting (if it has one) instead of the generic global initial
      // messages. For a room with several characters, only the first one
      // (characterIds[0]) greets - Phase 12's room creation flow decides
      // who that is.
      if (chat.content.length === 0) {
        const primaryCharacterId = chat.characterIds?.[0];
        const character = primaryCharacterId ? await dbService.getCharacterById(primaryCharacterId).catch(() => undefined) : undefined;
        if (character?.first_mes) {
          // Unlike the generic seed messages below, this is a real visible greeting
          // (not a hidden priming message), so it's left unflagged as `isSystem`.
          chat.content.push({ role: AI, txt: character.first_mes, speakerId: character.id, id: generateNodeId(), timestamp: Date.now() });
        } else {
          const savedMessages = JSON.parse(localStorage.getItem(LS_INITIAL_MESSAGES) || "[]") as any[];
          savedMessages.forEach((msg) => {
            if (msg.role && msg.message) {
              chat.content.push({ role: msg.role, txt: msg.message, isSystem: true, id: generateNodeId(), timestamp: Date.now() });
            }
          });
        }
      }

      const newMessage: Message = { role, txt: text, images, isImageRequest, isImpersonated, emotion, imagePrompt, imageParams, speakerId, id: generateNodeId(), timestamp: Date.now() };

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

// Updates which of a room's participants are muted (Phase 12's Participants
// panel) - leaves content and tree untouched. Meaningless for a 1:1 chat.
export const updateChatMutedParticipants = createAsyncThunk(
  "chat/updateChatMutedParticipants",
  async ({ chatId, mutedParticipantIds }: { chatId: number; mutedParticipantIds: Chat["mutedParticipantIds"] }, { rejectWithValue }) => {
    try {
      const chat = await dbService.getChatById(chatId);
      chat.mutedParticipantIds = mutedParticipantIds;
      await dbService.updateChat(chat);
      return { chatId, mutedParticipantIds };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Invites a character into an already-multi-character room, adding another
// member in place. NOT used for turning a 1:1 chat into its first room - see
// branchChatWithParticipant below for that; this only ever runs when the
// chat already has 2+ members, so there's no single-character identity here
// to protect. Drops a visible "{Name} joined the chat." notice, plus that
// character's own `first_mes` greeting when they have one - mirrors how a
// brand-new chat already seeds itself from `first_mes` in `addMessage`
// above, so joining mid-conversation feels the same as starting fresh with
// them.
export const addChatParticipant = createAsyncThunk(
  "chat/addChatParticipant",
  async ({ chatId, characterId }: { chatId: number; characterId: number }, { dispatch, rejectWithValue }) => {
    try {
      const chat = await dbService.getChatById(chatId);
      if (chat.characterIds?.includes(characterId)) {
        return { chatId, characterIds: chat.characterIds, content: chat.content, tree: chat.tree, activeLeafId: chat.activeLeafId };
      }
      chat.characterIds = [...(chat.characterIds || []), characterId];

      const character = await dbService.getCharacterById(characterId).catch(() => undefined);

      const pushMessage = (message: Message) => {
        if (chat.tree) {
          const { tree, nodeId } = addChildNode(chat.tree, chat.activeLeafId || null, message);
          chat.tree = tree;
          chat.activeLeafId = nodeId;
          chat.content = flattenPath(tree, nodeId);
        } else {
          chat.content.push(message);
        }
      };

      pushMessage({
        role: AI,
        txt: `${character?.name || "Someone"} joined the chat.`,
        isRoomEvent: true,
        id: generateNodeId(),
        timestamp: Date.now(),
      });

      if (character?.first_mes) {
        pushMessage({ role: AI, txt: character.first_mes, speakerId: character.id, id: generateNodeId(), timestamp: Date.now() });
      }

      await dbService.updateChat(chat);
      dispatch(fetchChats());
      return { chatId, characterIds: chat.characterIds, content: chat.content, tree: chat.tree, activeLeafId: chat.activeLeafId };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Invites a character into a 1:1 chat by branching into a brand-new group
// chat, instead of mutating the original - the source chat is left byte-for-
// byte untouched (own history, own primary character's own Character.memory/
// scenario keep accruing exactly as if nothing happened) and keeps running
// as its own independent 1:1 conversation. The new room gets a copy of the
// conversation so far, starts its own empty group-scoped memory/scenario
// (Chat.memory/Chat.scenario - never any participant's Character.memory/
// scenario), and drops the same "{Name} joined"/first_mes greeting
// addChatParticipant would, just onto the new chat instead of the old one.
export const branchChatWithParticipant = createAsyncThunk(
  "chat/branchChatWithParticipant",
  async ({ chatId, characterId }: { chatId: number; characterId: number }, { dispatch, rejectWithValue }) => {
    try {
      const original = await dbService.getChatById(chatId);
      if (original.characterIds?.includes(characterId)) {
        return rejectWithValue("That character is already in this chat.");
      }

      const character = await dbService.getCharacterById(characterId).catch(() => undefined);

      const branched: Omit<Chat, "id"> = {
        title: character?.name ? `${original.title} + ${character.name}` : original.title,
        timestamp: Date.now(),
        content: [...original.content],
        characterIds: [...(original.characterIds || []), characterId],
        mutedParticipantIds: original.mutedParticipantIds ? [...original.mutedParticipantIds] : undefined,
        tree: original.tree ? { nodes: { ...original.tree.nodes } } : undefined,
        activeLeafId: original.activeLeafId ?? null,
        authorNote: original.authorNote,
        worldTags: original.worldTags ? [...original.worldTags] : undefined,
        personaId: original.personaId,
        memory: [],
      };

      const pushMessage = (message: Message) => {
        if (branched.tree) {
          const { tree, nodeId } = addChildNode(branched.tree, branched.activeLeafId || null, message);
          branched.tree = tree;
          branched.activeLeafId = nodeId;
          branched.content = flattenPath(tree, nodeId);
        } else {
          branched.content.push(message);
        }
      };

      pushMessage({
        role: AI,
        txt: `${character?.name || "Someone"} joined the chat.`,
        isRoomEvent: true,
        id: generateNodeId(),
        timestamp: Date.now(),
      });

      if (character?.first_mes) {
        pushMessage({ role: AI, txt: character.first_mes, speakerId: character.id, id: generateNodeId(), timestamp: Date.now() });
      }

      const id = await dbService.addChat(branched);
      const newChat = { id, ...branched } as Chat;
      dispatch(fetchChats());
      return newChat;
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Updates just a room's own group-scoped memory (Scene panel, and the
// auto-extraction interval when the chat is a room) - see Chat.memory.
// Meaningless for a 1:1 chat, which reads/writes the character's own
// Character.memory instead and never touches this field.
export const updateChatMemory = createAsyncThunk(
  "chat/updateChatMemory",
  async ({ chatId, memory }: { chatId: number; memory: Chat["memory"] }, { rejectWithValue }) => {
    try {
      const chat = await dbService.getChatById(chatId);
      chat.memory = memory;
      await dbService.updateChat(chat);
      return { chatId, memory };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Updates just a room's own group-scoped scenario (Scene panel) - see
// Chat.scenario. Meaningless for a 1:1 chat, which uses the character's own
// Character.scenario instead and never touches this field.
export const updateChatScenario = createAsyncThunk(
  "chat/updateChatScenario",
  async ({ chatId, scenario }: { chatId: number; scenario: Chat["scenario"] }, { rejectWithValue }) => {
    try {
      const chat = await dbService.getChatById(chatId);
      chat.scenario = scenario;
      await dbService.updateChat(chat);
      return { chatId, scenario };
    } catch (error) {
      return handleDbError(error, rejectWithValue);
    }
  }
);

// Removes a member from a room outright (distinct from muting, which just
// sidelines them from the round-robin while keeping their history and
// membership intact). Leaves past content/tree untouched - only future
// turns stop including them.
export const removeChatParticipant = createAsyncThunk(
  "chat/removeChatParticipant",
  async ({ chatId, characterId }: { chatId: number; characterId: number }, { rejectWithValue }) => {
    try {
      const chat = await dbService.getChatById(chatId);
      chat.characterIds = (chat.characterIds || []).filter((id) => id !== characterId);
      chat.mutedParticipantIds = (chat.mutedParticipantIds || []).filter((id) => id !== characterId);
      await dbService.updateChat(chat);
      return { chatId, characterIds: chat.characterIds, mutedParticipantIds: chat.mutedParticipantIds };
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
    // Accepts a pre-migration export (`characterId` scalar) alongside the
    // current `characterIds` array shape, so an old exported chat JSON file
    // sitting on someone's disk still imports correctly.
    const characterIds = !isArray && Array.isArray(chatData.characterIds)
      ? chatData.characterIds
      : (!isArray && chatData.characterId ? [chatData.characterId] : []);
    const timestamp = !isArray && chatData.timestamp ? chatData.timestamp : Date.now();

    if (!content || !Array.isArray(content)) {
      throw new Error("Invalid chat data format.");
    }

    const authorNote = !isArray && chatData.authorNote ? chatData.authorNote : undefined;
    const worldTags = !isArray && Array.isArray(chatData.worldTags) ? chatData.worldTags : undefined;

    const newChat = {
      title,
      content,
      characterIds,
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
      .addCase(updateChatMutedParticipants.fulfilled, (state, action) => {
        const chat = state.chats.find((c) => c.id === action.payload.chatId);
        if (chat) {
          chat.mutedParticipantIds = action.payload.mutedParticipantIds;
        }
      })
      .addCase(updateChatMutedParticipants.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(addChatParticipant.fulfilled, (state, action) => {
        const chat = state.chats.find((c) => c.id === action.payload.chatId);
        if (chat) {
          chat.characterIds = action.payload.characterIds;
          chat.content = action.payload.content;
          chat.tree = action.payload.tree;
          chat.activeLeafId = action.payload.activeLeafId;
        }
      })
      .addCase(addChatParticipant.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(branchChatWithParticipant.fulfilled, (state, action) => {
        state.chats.push(action.payload as Chat);
      })
      .addCase(branchChatWithParticipant.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateChatMemory.fulfilled, (state, action) => {
        const chat = state.chats.find((c) => c.id === action.payload.chatId);
        if (chat) {
          chat.memory = action.payload.memory;
        }
      })
      .addCase(updateChatMemory.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateChatScenario.fulfilled, (state, action) => {
        const chat = state.chats.find((c) => c.id === action.payload.chatId);
        if (chat) {
          chat.scenario = action.payload.scenario;
        }
      })
      .addCase(updateChatScenario.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(removeChatParticipant.fulfilled, (state, action) => {
        const chat = state.chats.find((c) => c.id === action.payload.chatId);
        if (chat) {
          chat.characterIds = action.payload.characterIds;
          chat.mutedParticipantIds = action.payload.mutedParticipantIds;
        }
      })
      .addCase(removeChatParticipant.rejected, (state, action) => {
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
