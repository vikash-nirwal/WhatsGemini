import React, { useCallback, useState } from "react";
import { useColorTheme } from "../../hooks/useColorTheme";
import { FaCopy, FaRedo, FaEdit, FaEllipsisV, FaChevronLeft, FaChevronRight, FaTrash, FaCompressArrowsAlt, FaForward, FaMask } from "react-icons/fa";
import { motion } from "framer-motion";
import { cn } from "../../utils/cn";
import { Message } from "../../types";
import { YOU } from "../../utils/constants";
import { stripImageContextTag } from "../../features/ai/utils/imageGeneration";
import MarkdownRenderer from "src/components/molecules/MarkdownRenderer";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "src/components/molecules/dropdown-menu";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Button } from "src/components/atoms/button";
import { Card, CardContent } from "src/components/atoms/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "src/components/atoms/tooltip";

interface SiblingInfo {
  index: number;
  total: number;
  siblingIds: string[];
}

interface ChatMessageProps {
  msg: Message;
  charInitials: string;
  accent?: [string, string];
  avatarImageSrc?: string;
  aiLoading: boolean;
  onCopy: (text: string) => void;
  onRegenerate: (msg: Message) => void;
  onContinue?: (msg: Message) => void;
  isLastMessage?: boolean;
  onStartEdit: (msg: Message) => void;
  setFullscreenImage: (src: string) => void;
  siblingInfo?: SiblingInfo;
  onSwitchBranch?: (nodeId: string) => void;
  onDeleteBranch?: (nodeId: string) => void;
}

const ChatMessage = React.memo(({
  msg,
  charInitials,
  accent,
  avatarImageSrc,
  aiLoading,
  onCopy,
  onRegenerate,
  onContinue,
  isLastMessage,
  onStartEdit,
  setFullscreenImage,
  siblingInfo,
  onSwitchBranch,
  onDeleteBranch,
}: ChatMessageProps) => {
  const isUser = msg.role === YOU;
  const { is } = useColorTheme();
  const neumorphic = is("neumorphic");
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  const handleCopy = useCallback(() => onCopy(stripImageContextTag(msg.txt || "")), [onCopy, msg.txt]);
  const handleRegenerate = useCallback(() => onRegenerate(msg), [onRegenerate, msg]);
  const handleContinue = useCallback(() => onContinue?.(msg), [onContinue, msg]);
  const handleEdit = useCallback(() => onStartEdit(msg), [onStartEdit, msg]);
  const handleDeleteBranch = useCallback(() => msg.id && onDeleteBranch?.(msg.id), [onDeleteBranch, msg.id]);

  if (msg.isRoomEvent) {
    return (
      <motion.div
        className="flex w-full mb-6 justify-center"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <span className="px-3 py-1 rounded-full bg-muted text-[11.5px] font-medium text-muted-foreground">
          {msg.txt}
        </span>
      </motion.div>
    );
  }

  if (msg.isCompressionSummary) {
    return (
      <motion.div
        className="flex w-full mb-6 justify-center"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <Card className="max-w-[90%] md:max-w-[70%] bg-muted text-center">
          <CardContent className="px-4 py-3">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-muted-foreground mb-1.5">
              <FaCompressArrowsAlt size={11} />
              Compressed history
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setIsSummaryExpanded((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsSummaryExpanded((v) => !v);
                }
              }}
              className="text-left text-xs text-ink-faint cursor-pointer"
              aria-expanded={isSummaryExpanded}
              title={isSummaryExpanded ? "Click to collapse" : "Click to show the full summary"}
            >
              <div className={cn(!isSummaryExpanded && "line-clamp-3")}>
                <MarkdownRenderer msgText={msg.txt || ""} isUser={false} />
              </div>
              <span className="mt-1 inline-block text-[11px] font-medium text-primary hover:underline">
                {isSummaryExpanded ? "Show less" : "Show more"}
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      className={cn("flex w-full mb-6", isUser ? "justify-end" : "justify-start")}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* AI Avatar */}
      {!isUser && (
        <CharacterAvatar name={charInitials} accent={accent} imageSrc={avatarImageSrc} size={32} className="mt-1 mr-3 shadow-md" />
      )}

      <div
        className={cn(
          "relative p-4 rounded-2xl max-w-[85%] md:max-w-[70%] min-w-0 group",
          // Canvas spec: "plain div. Incoming: bg-elevated surface-raised.
          // Outgoing: bg-accent-soft text-accent-ink." Cozy keeps its own
          // translucent-tint look untouched.
          isUser
            ? neumorphic
              ? "bg-accent-soft text-accent-ink rounded-br-[5px]"
              : "bg-primary/[0.16] text-foreground rounded-br-[5px]"
            : neumorphic
              ? "bg-elevated surface-raised text-foreground rounded-tl-[5px]"
              : "bg-card/[0.88] shadow-soft text-foreground rounded-tl-[5px]"
        )}
        style={{ fontSize: "var(--chat-font-size, 16px)" }}
      >
        {/* Floating sibling prev/next, anchored to the card's edges */}
        {siblingInfo && siblingInfo.index > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSwitchBranch?.(siblingInfo.siblingIds[siblingInfo.index - 1])}
            className="absolute -left-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-secondary border border-border/50 shadow-soft text-foreground hover:bg-muted z-10"
            aria-label="Previous variant"
            title="Previous variant"
          >
            <FaChevronLeft size={12} />
          </Button>
        )}
        {siblingInfo && siblingInfo.index < siblingInfo.total - 1 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSwitchBranch?.(siblingInfo.siblingIds[siblingInfo.index + 1])}
            className="absolute -right-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-secondary border border-border/50 shadow-soft text-foreground hover:bg-muted z-10"
            aria-label="Next variant"
            title="Next variant"
          >
            <FaChevronRight size={12} />
          </Button>
        )}

        {msg.isImpersonated && (
          <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-primary/80">
            <FaMask size={10} />
            You, in character
          </div>
        )}

        <div className="font-serif">
          <MarkdownRenderer msgText={stripImageContextTag(msg.txt || "")} isUser={isUser} />
        </div>

        {msg.images && msg.images.map((imgSrc, idx) => (
          <DisplayImage
            key={idx}
            srcContext={imgSrc}
            alt="Generated"
            onClick={() => setFullscreenImage(imgSrc)}
            className="mt-2 max-w-full rounded-lg shadow-sm cursor-zoom-in hover:opacity-90 transition-opacity"
          />
        ))}

        {/* User messages: dropdown is the only action surface (always visible so it's reachable on touch devices) */}
        {isUser && (
          <div className="flex items-center justify-end gap-1.5 mt-2 font-sans">
            {siblingInfo && (
              <span
                className="text-[11px] font-mono font-semibold text-subtle tabular-nums"
                title={`${siblingInfo.total} variants of this message`}
              >
                {siblingInfo.index + 1}/{siblingInfo.total}
              </span>
            )}
            {onDeleteBranch && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDeleteBranch}
                disabled={aiLoading}
                className="h-auto w-auto p-1 rounded-full text-subtle hover:bg-destructive/15 hover:text-destructive"
                aria-label={siblingInfo ? "Delete this variant" : "Delete message"}
                title={siblingInfo ? "Delete this variant" : "Delete message"}
              >
                <FaTrash size={9} />
              </Button>
            )}
          </div>
        )}

        {isUser && (
          <div className="absolute top-2 right-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-auto w-auto p-1.5 rounded-full text-foreground/70 hover:text-foreground hover:bg-primary/10"
                  title="More options"
                  aria-label="Message options"
                >
                  <FaEllipsisV size={12} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={handleCopy}>
                  <FaCopy className="mr-2 h-4 w-4" />
                  <span>Copy</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleEdit} disabled={aiLoading}>
                  <FaEdit className="mr-2 h-4 w-4" />
                  <span>Edit</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* AI messages: icon-only actions, hidden until the message is hovered
            or a button inside it has focus (keyboard/touch) - a permanently
            visible labeled row under every single reply added a lot of
            constant weight for something used occasionally. The outer
            bubble already carries the `group` class this reveal keys off. */}
        {!isUser && (
          <div className="flex items-center gap-1 mt-2 font-sans">
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleCopy} aria-label="Copy" className="h-auto w-auto p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <FaCopy size={12} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy</TooltipContent>
              </Tooltip>
              {!msg.isImpersonated && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleRegenerate} aria-label="Regenerate" className="h-auto w-auto p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
                      <FaRedo size={12} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Regenerate</TooltipContent>
                </Tooltip>
              )}
              {!msg.isImpersonated && isLastMessage && onContinue && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleContinue}
                      disabled={aiLoading}
                      aria-label="Continue"
                      className="h-auto w-auto p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <FaForward size={12} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Ask the model to keep writing from where this reply left off</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleEdit} aria-label="Edit" className="h-auto w-auto p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <FaEdit size={12} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit</TooltipContent>
              </Tooltip>
              {onDeleteBranch && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleDeleteBranch}
                      disabled={aiLoading}
                      className="h-auto w-auto p-1.5 rounded-md text-subtle hover:bg-destructive/15 hover:text-destructive"
                      aria-label={siblingInfo ? "Delete this variant" : "Delete message"}
                    >
                      <FaTrash size={10} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{siblingInfo ? "Delete this variant" : "Delete message"}</TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="flex-1" />
            {siblingInfo && (
              <span
                className="text-[11px] font-mono font-semibold text-subtle tabular-nums"
                title={`${siblingInfo.total} variants of this message`}
              >
                {siblingInfo.index + 1}/{siblingInfo.total}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
});

ChatMessage.displayName = "ChatMessage";

export default ChatMessage;
