import React, { useState } from "react";
import { ChatSidePanelShell } from "src/components/molecules/ChatSidePanelShell";
import { cn } from "src/utils/cn";
import { ScenePanelTabProps } from "./scene-panel/types";
import SceneTab from "./scene-panel/SceneTab";
import StoryTab from "./scene-panel/StoryTab";
import MemoryTab from "./scene-panel/MemoryTab";
import ChatTab from "./scene-panel/ChatTab";

type SceneTabId = "scene" | "story" | "memory" | "chat";
const SCENE_TABS: { id: SceneTabId; label: string }[] = [
  { id: "scene", label: "Scene" },
  { id: "story", label: "Story" },
  { id: "memory", label: "Memory" },
  { id: "chat", label: "Chat" },
];
const LS_SCENE_TAB = "scene_panel_tab";
const readSceneTab = (): SceneTabId => {
  try {
    const saved = localStorage.getItem(LS_SCENE_TAB);
    return SCENE_TABS.some((t) => t.id === saved) ? (saved as SceneTabId) : "scene";
  } catch {
    return "scene";
  }
};

// The Scene & chat side panel: four tabs, each its own component under
// ./scene-panel. The last tab opened is remembered on this device.
const ScenePanel: React.FC<ScenePanelTabProps> = (props) => {
  const [tab, setTab] = useState<SceneTabId>(readSceneTab);
  const selectTab = (next: SceneTabId) => {
    setTab(next);
    try {
      localStorage.setItem(LS_SCENE_TAB, next);
    } catch {
      // Only a convenience.
    }
  };

  return (
    <ChatSidePanelShell title="Scene & chat" onClose={props.onClose} closeLabel="Close scene panel">
      <div role="tablist" aria-label="Scene panel sections" className="flex flex-shrink-0 gap-1 border-b border-border/40 px-[18px] pt-1.5">
        {SCENE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`scene-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`scene-tabpanel-${t.id}`}
            onClick={() => selectTab(t.id)}
            className={cn(
              "flex-1 -mb-px border-b-2 px-1 pb-2 pt-1 text-[12.5px] font-medium transition-colors",
              tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-[18px] py-[18px] flex flex-col gap-[22px]">
        {tab === "scene" && <SceneTab {...props} />}
        {tab === "story" && <StoryTab {...props} />}
        {tab === "memory" && <MemoryTab {...props} />}
        {tab === "chat" && <ChatTab {...props} />}
      </div>
    </ChatSidePanelShell>
  );
};

export default ScenePanel;
