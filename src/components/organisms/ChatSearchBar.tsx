import React, { useEffect, useRef } from "react";
import { FaChevronDown, FaChevronUp, FaSearch, FaTimes } from "react-icons/fa";
import { Button } from "src/components/atoms/button";
import { ChatSearchMatch } from "src/features/chat/chatSearch";

// Search inside a chat (#247): the field under the header, how many messages
// match, and older/newer to step through them. A match on another branch
// switches the conversation to that branch when it's chosen, and the bar
// says so, as the messages around it change.
interface ChatSearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  matches: ChatSearchMatch[];
  current: number;
  onStep: (step: 1 | -1) => void;
  onClose: () => void;
  switchedBranch?: boolean; // the current match was on another branch
}

const ChatSearchBar: React.FC<ChatSearchBarProps> = ({ query, onQueryChange, matches, current, onStep, onClose, switchedBranch }) => {
  const fieldRef = useRef<HTMLInputElement>(null);
  // The chat menu that opened search hands the focus back to its button as
  // it closes, which can land just after the field took it (now and then on
  // a phone). Take it back once the menu has gone, unless the reader has
  // already moved on to another field.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const field = fieldRef.current;
      const active = document.activeElement;
      if (field && active !== field && !(active instanceof HTMLInputElement) && !(active instanceof HTMLTextAreaElement)) field.focus();
    }, 250);
    return () => window.clearTimeout(timer);
  }, []);
  const match = current >= 0 ? matches[current] : undefined;
  const count = !query.trim()
    ? ""
    : matches.length === 0
      ? "No matches"
      : current < 0
        ? `${matches.length} ${matches.length === 1 ? "match" : "matches"}`
        : `${current + 1} of ${matches.length}`;
  return (
    <div role="search" aria-label="Search this chat" className="border-b border-border bg-raised px-3 py-1.5 text-[13px]">
      <div className="flex items-center gap-1.5">
        <FaSearch size={12} className="ml-1 flex-shrink-0 text-subtle" aria-hidden />
        <input
          // The field is the point of opening search, so it takes the focus.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          ref={fieldRef}
          type="search"
          aria-label="Search messages"
          placeholder="Search messages"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter goes up to older messages, as the search starts at the
            // newest; Shift+Enter comes back down.
            if (e.key === "Enter") {
              e.preventDefault();
              onStep(e.shiftKey ? 1 : -1);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-1.5 py-1.5 text-[15px] text-foreground outline-none placeholder:text-subtle md:text-[13.5px]"
        />
        <span aria-live="polite" data-slot="search-count" className="flex-shrink-0 whitespace-nowrap text-[12px] text-muted-foreground">{count}</span>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" aria-label="Older match" disabled={matches.length === 0 || (matches.length === 1 && current === 0)} onClick={() => onStep(-1)}>
          <FaChevronUp size={12} />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" aria-label="Newer match" disabled={matches.length === 0 || (matches.length === 1 && current === 0)} onClick={() => onStep(1)}>
          <FaChevronDown size={12} />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" aria-label="Close search" onClick={onClose}>
          <FaTimes size={12} />
        </Button>
      </div>
      {match && switchedBranch && (
        <p data-slot="search-branch" className="truncate px-1 pb-0.5 text-[12px] text-muted-foreground">Switched to the branch with this message</p>
      )}
    </div>
  );
};

export default ChatSearchBar;
