import { useEffect } from "react";
import { toast } from "sonner";
import { useAppDispatch } from "src/store/hooks";
import store from "src/store/store";
import { fetchChats } from "src/features/chatSlice";
import { fetchCharacters } from "src/features/characterSlice";
import { fetchWorlds } from "src/features/worldSlice";
import { fetchAdventures } from "src/features/adventureSlice";
import { loadChannels } from "src/features/channelSlice";
import { loadMyStatuses } from "src/features/myStatusSlice";
import { setActivePersonaId, setPersonas } from "src/features/settingsSlice";
import { resumeSync, startSync, syncStatus } from "src/features/sync/syncService";

// Sync between computers (#274) while the app is open: starts it on
// opening, and reloads whatever another computer changed.
const SyncRunner = () => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    void startSync({
      prefs: {
        read: () => {
          const { personas, activePersonaId } = store.getState().settings;
          return { personas, activePersonaId };
        },
        apply: (prefs) => {
          if (Array.isArray(prefs.personas) && prefs.personas.length) dispatch(setPersonas(prefs.personas));
          if (prefs.activePersonaId) dispatch(setActivePersonaId(prefs.activePersonaId));
        },
      },
      onApplied: (keys) => {
        const has = (prefix: string) => Array.from(keys).some((k) => k.startsWith(prefix));
        if (has("chats:")) dispatch(fetchChats());
        if (has("characters:")) dispatch(fetchCharacters());
        if (has("worlds:")) dispatch(fetchWorlds());
        if (has("adventures:")) dispatch(fetchAdventures());
        if (has("settings:channels")) dispatch(loadChannels());
        if (has("settings:my_statuses")) dispatch(loadMyStatuses());
      },
    }).then(() => {
      // The browser asks again for the folder after a reload, from a click.
      if (syncStatus().phase === "needs-permission") {
        toast("Sync is paused", {
          description: "Allow the sync folder again to keep this computer in step.",
          duration: 20000,
          action: { label: "Allow", onClick: () => void resumeSync() },
        });
      }
    });
  }, [dispatch]);

  return null;
};

export default SyncRunner;
