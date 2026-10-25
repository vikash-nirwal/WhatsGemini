import React from "react";
import { Link, useLocation } from "react-router-dom";
import { MdOutlineChat, MdOutlineDonutLarge, MdOutlinePeopleAlt, MdOutlineExplore, MdOutlineSettings } from "react-icons/md";
import { cn } from "src/utils/cn";
import { useAppSelector } from "src/store/hooks";
import { selectActivePersona } from "src/features/settingsSlice";
import { useColorTheme } from "src/hooks/useColorTheme";
import { hasUnseenStatus } from "src/features/character/statusUpdates";
import { unreadCount } from "src/features/chat/chatList";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import Logo from "src/components/atoms/Logo";

// The app's sections, which part of the app a path belongs to (#150).
export type Section = "chats" | "updates" | "characters" | "adventures" | "settings" | "other";
export const sectionOf = (pathname: string): Section => {
  if (pathname === "/" || pathname.startsWith("/chat/")) return "chats";
  if (pathname.startsWith("/updates") || pathname.startsWith("/channels") || pathname.startsWith("/starred")) return "updates";
  if (pathname.startsWith("/characters")) return "characters";
  if (pathname.startsWith("/adventures") || pathname.startsWith("/worlds")) return "adventures";
  if (pathname.startsWith("/settings")) return "settings";
  return "other";
};

const SECTIONS: { section: Section; to: string; label: string; Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }> }[] = [
  { section: "chats", to: "/", label: "Chats", Icon: MdOutlineChat },
  { section: "updates", to: "/updates", label: "Updates", Icon: MdOutlineDonutLarge },
  { section: "characters", to: "/characters", label: "Characters", Icon: MdOutlinePeopleAlt },
  { section: "adventures", to: "/adventures", label: "Adventures", Icon: MdOutlineExplore },
];

// The desktop rail (#150), as on the revamp canvas: the sections, then
// Settings and your persona at the bottom. The top is where worlds go
// (#157); until then it's the app's mark, which goes home. Not in the
// terminal theme, whose sidebar is its own shell.
export const NavRail = () => {
  const { is } = useColorTheme();
  const { pathname } = useLocation();
  const chats = useAppSelector((state) => state.chat.chats);
  const characters = useAppSelector((state) => state.character.characters);
  const persona = useAppSelector(selectActivePersona);
  if (is("terminal")) return null;

  const current = sectionOf(pathname);
  const unreadChats = chats.filter((c) => !c.archived && !c.muted && unreadCount(c) > 0).length;
  const newStatuses = characters.some((c) => hasUnseenStatus(c, Date.now()));
  const personaName = persona?.name?.trim();

  return (
    <nav aria-label="Sections" data-slot="nav-rail" className="hidden lg:flex w-[72px] flex-none flex-col items-center gap-1 border-r border-border bg-surface py-3">
      <Link to="/" aria-label="WhatsGemini, home" title="WhatsGemini" className="mb-1 rounded-[14px]">
        <Logo size={44} className="rounded-[14px]" />
      </Link>
      <span aria-hidden className="my-2 h-px w-8 bg-border" />
      {SECTIONS.map(({ section, to, label, Icon }) => {
        const active = current === section;
        const badge = section === "chats" && unreadChats > 0 ? unreadChats : 0;
        const dot = section === "updates" && newStatuses;
        return (
          <Link
            key={section}
            to={to}
            aria-current={active ? "page" : undefined}
            aria-label={badge ? `${label}, ${badge} unread` : dot ? `${label}, new` : label}
            className={cn("group flex w-[66px] flex-col items-center gap-1 rounded-xl py-1.5 text-[11.5px] font-semibold", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <span className={cn("relative grid h-8 w-12 place-items-center rounded-full transition-colors", active ? "bg-primary/[0.14] text-primary-text" : "group-hover:bg-raised")}>
              <Icon aria-hidden size={22} />
              {badge ? (
                <span aria-hidden className="absolute -top-1 left-[calc(50%+6px)] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">{badge}</span>
              ) : dot ? (
                <span aria-hidden className="absolute right-2 top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-surface" />
              ) : null}
            </span>
            {label}
          </Link>
        );
      })}
      <span className="flex-1" />
      <Link
        to="/settings"
        aria-label="Settings"
        title="Settings"
        aria-current={current === "settings" ? "page" : undefined}
        className={cn("grid h-11 w-11 place-items-center rounded-xl", current === "settings" ? "bg-primary/[0.14] text-primary-text" : "text-muted-foreground hover:bg-raised hover:text-foreground")}
      >
        <MdOutlineSettings aria-hidden size={22} />
      </Link>
      <Link to="/settings/profile" aria-label={`You: ${personaName || "your persona"}`} title={personaName || "Your persona"} className="mt-1 rounded-full">
        <CharacterAvatar name={personaName || "You"} imageSrc={persona?.avatar} size={36} />
      </Link>
    </nav>
  );
};

export default NavRail;
