import React from "react";
import { FaTimes } from "react-icons/fa";
import { cn } from "src/utils/cn";
import { Button } from "src/components/atoms/button";
import type { RecapView } from "src/features/chat/useChatRecap";

// "Previously on..." (#46): sits at the end of the chat, where the user
// picks up, until they dismiss it or the story moves on.
export const RecapCard = ({ recap, terminal = false }: { recap: RecapView; terminal?: boolean }) => (
  <section
    aria-label="Previously on"
    className={cn(
      "relative mb-6 mx-auto max-w-xl px-4 py-3 pr-10 font-sans text-sm",
      terminal ? "border border-border" : "rounded-2xl border border-border/60 bg-card/[0.88] shadow-soft"
    )}
  >
    <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-subtle mb-1">Previously on…</div>
    {recap.status === "ready" && <p className="text-foreground leading-relaxed">{recap.text}</p>}
    {recap.status === "loading" && (
      <div aria-busy="true" aria-label="Writing a recap" className="flex flex-col gap-1.5 py-1">
        <span className="h-3 w-full rounded bg-muted animate-pulse" />
        <span className="h-3 w-4/5 rounded bg-muted animate-pulse" />
      </div>
    )}
    {recap.status === "error" && (
      <p className="text-muted-foreground">
        Couldn't write a recap.{" "}
        <button type="button" onClick={recap.onRetry} className="font-medium text-primary hover:underline">
          Try again
        </button>
      </p>
    )}
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={recap.onDismiss}
      aria-label="Dismiss recap"
      className="absolute right-1.5 top-1.5 h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
    >
      <FaTimes size={11} />
    </Button>
  </section>
);
