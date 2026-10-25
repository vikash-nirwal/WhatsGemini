import React, { useState } from "react";
import { ChatSidePanelShell } from "src/components/molecules/ChatSidePanelShell";
import { cn } from "src/utils/cn";
import { ScenePanelTabProps } from "./scene-panel/types";
import SceneTab from "./scene-panel/SceneTab";
import StoryTab from "./scene-panel/StoryTab";
import MemoryTab from "./scene-panel/MemoryTab";
import ChatTab from "./scene-panel/ChatTab";

// #151: the chat panel holds only this chat - Scene, Story, Options, and
// Group in a group chat. What's about the character everywhere (their life,
// inner life, how you two are, memory, look) is in Contact info.
type SceneTabId = "scene" | "story" | "options" | "group";
const tabsFor = (isRoom?: boolean): { id: SceneTabId; label: string }[] => [
  { id: "scene", label: "Scene" },
  { id: "story", label: "Story" },
  { id: "options", label: "Options" },
  ...(isRoom ? [{ id: "group" as const, label: "Group" }] : []),
];
const LS_SCENE_TAB = "scene_panel_tab";
const readSceneTab = (isRoom?: boolean): SceneTabId => {
  try {
    const saved = localStorage.getItem(LS_SCENE_TAB);
    return tabsFor(isRoom).some((t) => t.id === saved) ? (saved as SceneTabId) : "scene";
  } catch {
    return "scene";
  }
};

// The "Scene & story" side panel. The last tab opened is remembered on
// this device.
const ScenePanel: React.FC<ScenePanelTabProps> = (props) => {
  const tabs = tabsFor(props.isRoom);
  const [tab, setTab] = useState<SceneTabId>(() => readSceneTab(props.isRoom));
  const current = tabs.some((t) => t.id === tab) ? tab : "scene";
  const selectTab = (next: SceneTabId) => {
    setTab(next);
    try {
      localStorage.setItem(LS_SCENE_TAB, next);
    } catch {
      // Only a convenience.
    }
  };

  return (
    <ChatSidePanelShell title="Scene & story" subtitle="This chat only" onClose={props.onClose} closeLabel="Close scene panel">
      <div role="tablist" aria-label="Scene panel sections" className="mx-4 mt-3 flex flex-shrink-0 gap-0.5 rounded-[10px] bg-sunken p-[3px]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`scene-tab-${t.id}`}
            aria-selected={current === t.id}
            aria-controls={`scene-tabpanel-${t.id}`}
            onClick={() => selectTab(t.id)}
            className={cn(
              "h-[30px] flex-1 rounded-lg px-2 text-[13px] font-semibold transition-colors",
              current === t.id ? "bg-raised text-foreground shadow-bubble ring-1 ring-inset ring-border" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`scene-tabpanel-${current}`} aria-labelledby={`scene-tab-${current}`} className="flex-1 overflow-y-auto px-[18px] py-[18px] flex flex-col gap-[22px]">
        {current === "scene" && <SceneTab {...props} />}
        {current === "story" && (
          <>
            <StoryTab {...props} />
            <ChatTab {...props} groups={["stage"]} />
          </>
        )}
        {current === "options" && <ChatTab {...props} groups={["messaging", "drama", "modes"]} />}
        {current === "group" && (
          <>
            <ChatTab {...props} groups={["room"]} />
            <MemoryTab {...props} />
          </>
        )}
      </div>
    </ChatSidePanelShell>
  );
};

export default ScenePanel;
