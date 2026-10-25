import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { MdOutlineChat, MdOutlineDonutLarge, MdOutlinePeopleAlt, MdOutlineExplore } from "react-icons/md";
import { cn } from "src/utils/cn";
import { TAB_BAR_PATHS, usePhoneShell } from "src/hooks/usePhoneShell";
import { unreadCount } from "src/features/chat/chatList";
import { hasUnseenStatus } from "src/features/character/statusUpdates";
import { useWorldChats, useWorldCharacters } from "src/hooks/useWorld";

// The phone shell's tab bar (#114, #150): the app's four sections - Chats,
// Updates, Characters and Adventures - as on the revamp canvas; Settings is
// your avatar on the chat list. Chats counts the chats with unread replies
// (not muted or archived ones); Updates has a dot for unseen statuses.
export const PhoneTabBar = () => {
  const shell = usePhoneShell();
  const { pathname } = useLocation();
  const chats = useWorldChats();
  const characters = useWorldCharacters();
  if (!shell || !TAB_BAR_PATHS.includes(pathname)) return null;

  const unreadChats = chats.filter((c) => !c.archived && !c.muted && unreadCount(c) > 0).length;
  const newStatuses = characters.some((c) => hasUnseenStatus(c, Date.now()));
  const tabs = [
    { to: "/", label: "Chats", Icon: MdOutlineChat, badge: unreadChats },
    { to: "/updates", label: "Updates", Icon: MdOutlineDonutLarge, dot: newStatuses },
    { to: "/characters", label: "Characters", Icon: MdOutlinePeopleAlt },
    { to: "/adventures", label: "Adventures", Icon: MdOutlineExplore },
  ];

  return (
    <nav aria-label="Main" data-slot="tab-bar" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="grid h-16 grid-cols-4 px-2">
        {tabs.map(({ to, label, Icon, badge, dot }) => (
          <li key={to}>
            <NavLink
              to={to}
              end
              aria-label={badge ? `${label}, ${badge} unread` : dot ? `${label}, new` : label}
              className={({ isActive }) => cn("group flex h-full flex-col items-center justify-center gap-1 text-[12px] font-semibold", isActive ? "text-foreground" : "text-muted-foreground")}
            >
              {({ isActive }) => (
                <>
                  <span className={cn("relative flex h-8 w-14 items-center justify-center rounded-full transition-colors", isActive && "bg-primary/[0.14] text-primary-text")}>
                    <Icon aria-hidden size={22} />
                    {badge ? (
                      <span aria-hidden data-slot="unread-badge" className="absolute -top-1 left-[calc(50%+6px)] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                        {badge}
                      </span>
                    ) : dot ? (
                      <span aria-hidden className="absolute right-3 top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-surface" />
                    ) : null}
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default PhoneTabBar;
