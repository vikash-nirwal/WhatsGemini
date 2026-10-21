import React, { useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { cn } from "src/utils/cn";
import { ConversationTree } from "src/types";
import { BranchSegment, buildBranchMap, countStorylines, leafForSegment } from "src/features/chat/branchMap";

interface BranchMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tree: ConversationTree | undefined;
  activeLeafId: string | null | undefined;
  onJump: (leafId: string) => void;
}

// Branch map (#53): every storyline in the chat, as the tree of places it
// split. Picking a segment opens that branch where it was last left off.
const BranchMapDialog: React.FC<BranchMapDialogProps> = ({ open, onOpenChange, tree, activeLeafId, onJump }) => {
  const segments = useMemo(() => (tree && open ? buildBranchMap(tree, activeLeafId) : []), [tree, activeLeafId, open]);
  const storylines = countStorylines(segments);

  const renderSegment = (segment: BranchSegment, depth: number): React.ReactNode => (
    <li key={segment.startId} className={cn(depth > 0 && "ml-3 border-l border-border pl-3")}>
      <button
        type="button"
        onClick={() => {
          if (!tree) return;
          onJump(leafForSegment(tree, segment));
          onOpenChange(false);
        }}
        aria-current={segment.isActiveLeaf ? "true" : undefined}
        className={cn(
          "my-1 w-full rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
          segment.onActivePath ? "border-primary/50 bg-primary/[0.08]" : "border-border hover:bg-secondary"
        )}
      >
        <div className="flex items-center justify-between gap-2 text-[11px] text-subtle">
          <span>{segment.count} message{segment.count === 1 ? "" : "s"}</span>
          {segment.isActiveLeaf && <span className="font-semibold text-primary">You're here</span>}
        </div>
        <div className="text-foreground line-clamp-2">{segment.last || segment.first || "(empty)"}</div>
        {segment.count > 1 && segment.first && segment.first !== segment.last && (
          <div className="mt-0.5 text-[11.5px] text-muted-foreground line-clamp-1">From: {segment.first}</div>
        )}
      </button>
      {segment.children.length > 0 && (
        <ul aria-label={`${segment.children.length} ways the story went on`}>{segment.children.map((c) => renderSegment(c, depth + 1))}</ul>
      )}
    </li>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="gap-0 p-0">
        <div className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle>Branch map</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            {storylines} storyline{storylines === 1 ? "" : "s"}. Each box is a stretch of the chat until it split; pick one to go to that branch where you left off.
          </DialogDescription>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ul aria-label="Storylines">{segments.map((s) => renderSegment(s, 0))}</ul>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BranchMapDialog;
