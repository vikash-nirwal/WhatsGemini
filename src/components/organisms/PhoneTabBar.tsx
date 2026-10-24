import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { MdOutlineChat, MdOutlineDonutLarge, MdOutlinePeopleAlt, MdOutlineSettings } from "react-icons/md";
import { cn } from "src/utils/cn";
import { useAppSelector } from "src/store/hooks";
import { TAB_BAR_PATHS, usePhoneShell } from "src/hooks/usePhoneShell";
import { unreadCount } from "src/features/chat/chatList";
import { hasUnseenStatus } from "src/features/character/statusUpdates";

// The phone-style shell's tab bar (#114): Chats, Updates, Characters and
// Settings, like WhatsApp's bottom bar (no Calls). Chats counts the chats
// with unread replies (not muted or archived ones); Updates has a dot for
// unseen statuses.
export const PhoneTabBar = () => {
  const shell = usePhoneShell();
  const { pathname } = useLocation();
  const chats = useAppSelector((state) => state.chat.chats);
  const characters = useAppSelector((state) => state.character.characters);
  if (!shell || !TAB_BAR_PATHS.includes(pathname)) return null;

  const unreadChats = chats.filter((c) => !c.archived && !c.muted && unreadCount(c) > 0).length;
  const newStatuses = characters.some((c) => hasUnseenStatus(c, Date.now()));
  const tabs = [
    { to: "/", label: "Chats", Icon: MdOutlineChat, badge: unreadChats },
    { to: "/updates", label: "Updates", Icon: MdOutlineDonutLarge, dot: newStatuses },
    { to: "/characters", label: "Characters", Icon: MdOutlinePeopleAlt },
    { to: "/settings", label: "Settings", Icon: MdOutlineSettings },
  ];

  return (
    <nav aria-label="Main" data-slot="tab-bar" className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-card pb-[env(safe-area-inset-bottom)]">
      <ul className="flex h-16">
        {tabs.map(({ to, label, Icon, badge, dot }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end
              aria-label={badge ? `${label}, ${badge} unread` : dot ? `${label}, new` : label}
              className={({ isActive }) => cn("group flex h-full flex-col items-center justify-center gap-1 text-[12px] font-medium", isActive ? "text-foreground" : "text-muted-foreground")}
            >
              {({ isActive }) => (
                <>
                  <span className={cn("relative flex h-8 w-16 items-center justify-center rounded-full transition-colors", isActive && "bg-primary/15")}>
                    <Icon aria-hidden size={22} className={isActive ? "text-primary" : undefined} />
                    {badge ? (
                      <span aria-hidden data-slot="unread-badge" className="absolute -top-1 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10.5px] font-semibold flex items-center justify-center">
                        {badge}
                      </span>
                    ) : dot ? (
                      <span aria-hidden className="absolute top-0.5 right-4 h-2.5 w-2.5 rounded-full bg-primary" />
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
