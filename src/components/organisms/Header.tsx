import React, { useContext, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaBars, FaArrowLeft, FaSun, FaMoon, FaUserFriends, FaHatWizard, FaCog, FaEllipsisV, FaQuestionCircle, FaChevronDown } from "react-icons/fa";
import { useSidebar } from "../../contexts/SidebarContext";
import { ThemeContext } from "../../contexts/ThemeContext";
import { useColorTheme } from "../../hooks/useColorTheme";
import { DARK } from "../../utils/constants";
import { cn } from "../../utils/cn";
import { Tooltip, TooltipTrigger, TooltipContent } from "src/components/atoms/tooltip";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "src/components/molecules/dropdown-menu";
import { Button } from "src/components/atoms/button";
import KeyboardShortcutsModal from "src/components/molecules/KeyboardShortcutsModal";
import { TermLink } from "src/components/atoms/TermLink";
import { TAB_BAR_PATHS, usePhoneShell } from "src/hooks/usePhoneShell";

// A single header icon action, described once and rendered two ways: as a
// tooltipped icon button (desktop, `primary` actions only) and as a labeled
// row in a "more" dropdown (mobile always; desktop for everything not
// flagged `primary`) - so page-specific actions (e.g. ChatPage's Export/
// Compress/Follow-up) don't need to hand-build both layouts themselves.
export interface HeaderAction {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  // Terse `[label]` used by the terminal theme's text-link header; falls
  // back to `label`.
  shortLabel?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  // Stays as an always-visible icon button in the desktop row; everything
  // else (unflagged page actions, plus the built-in app/session groups)
  // collapses into the trailing "more" menu instead of a long flat row of
  // icons - same idea the mobile menu below already applies to everything.
  primary?: boolean;
  // #151: a primary action shown as an icon with its words ("Scene &
  // story"), not a bare icon.
  labelled?: boolean;
}

// A titled group is a section of the "more" menu that opens in place (the
// user's ask, 2026-10-30: a chat's menu had grown to some thirty items in
// one list). In place, not as a side submenu: on a phone that opened off
// the screen. Its primary actions still stand alone in the header.
export interface HeaderGroup {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  actions: HeaderAction[];
}

type AnyGroup = HeaderAction[] | HeaderGroup;
const actionsOf = (g: AnyGroup) => (Array.isArray(g) ? g : g.actions);
const withActions = (g: AnyGroup, actions: HeaderAction[]): AnyGroup => (Array.isArray(g) ? actions : { ...g, actions });

interface HeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  // The dot before the subtitle: green when online (the default), grey when
  // the character's schedule (#7) says they're away.
  online?: boolean;
  avatar?: React.ReactNode;
  onBack?: () => void;
  // #151: the avatar and title together open this (a chat's Contact info),
  // with this accessible name.
  onTitleClick?: () => void;
  titleLabel?: string;
  // Page-specific action groups (e.g. Chat's Export/Compress/Follow-up),
  // rendered before the built-in App/Session groups, each separated by a divider.
  actionGroups?: AnyGroup[];
}

// Circular per the canvas spec ("Header icon buttons: Button size='icon'
// variant='secondary', circular, surface-raised"). surface-raised itself is
// a no-op class outside the neumorphic theme (see tokens.css), so it's safe
// to always include - Button.tsx also auto-applies it for outline/secondary
// under neumorphic, this just makes it explicit and theme-independent here.
export const iconBtnClass = "flex items-center justify-center w-9 h-9 rounded-full border-0 shadow-none surface-raised bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground transition flex-shrink-0";
// No static `cta-surface` here (unlike iconBtnClass/iconBtnDangerClass's
// `surface-raised`): under aurora that class paints the brand gradient,
// which this "active" tint was never wired up to - only neumorphic's own
// .cta-surface accent-shadow treatment applied here historically, so it
// stays a conditional appended at the call site (see `is("neumorphic")`
// below) rather than a bare static class.
const iconBtnActiveClass = "flex items-center justify-center w-9 h-9 rounded-full border-0 shadow-none bg-primary/[0.14] text-primary hover:bg-primary/[0.2] transition flex-shrink-0";
const iconBtnDangerClass = "flex items-center justify-center w-9 h-9 rounded-full border-0 shadow-none surface-raised bg-transparent text-subtle hover:bg-destructive/10 hover:text-destructive transition flex-shrink-0";

const Header: React.FC<HeaderProps> = ({ title, subtitle, online = true, avatar, onBack, onTitleClick, titleLabel, actionGroups = [] }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { open } = useSidebar();
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { is } = useColorTheme();
  const isDark = theme === DARK;
  const isCharacters = location.pathname.startsWith("/characters");
  const isAdventures = location.pathname.startsWith("/adventures") || location.pathname.startsWith("/worlds");
  const isSettings = location.pathname.startsWith("/settings");
  // The phone-style shell (#114): a chat goes back to the chat list, and
  // the tab screens have the tab bar instead of the drawer.
  const shell = usePhoneShell();
  const [showShortcuts, setShowShortcuts] = useState(false);
  // The "more" menu's open section; every section starts closed.
  const [openSection, setOpenSection] = useState<string | null>(null);
  const menuOpenChange = (open: boolean) => {
    if (!open) setOpenSection(null);
  };

  // Global "?" shortcut to open the help overlay - guarded so it doesn't
  // fire while the user is actually typing "?" into a text field.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const isEditable = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isEditable) return;
      e.preventDefault();
      setShowShortcuts(true);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Built-in group, always appended after any page-specific ones: app-level
  // navigation. Flagged `primary` so these stay as always-visible circular
  // header icons on desktop (theme/shortcuts/characters/adventures/settings)
  // instead of collapsing into the "more" menu - only page-specific actions
  // overflow there. Logging out lives in Settings (Text Generation Model -
  // it clears that provider's own API key) rather than as a global header
  // action.
  // #150: outside the terminal theme the rail (desktop) and tabs (phones)
  // reach the sections, so these sit in the "more" menu there.
  const appPrimary = is("terminal");
  const appGroup: HeaderAction[] = [
    { icon: isDark ? FaSun : FaMoon, label: "Toggle theme", shortLabel: isDark ? "light" : "dark", onClick: toggleTheme, primary: appPrimary },
    { icon: FaQuestionCircle, label: "Keyboard shortcuts", shortLabel: "?", onClick: () => setShowShortcuts(true), primary: appPrimary },
    { icon: FaUserFriends, label: "Characters", onClick: () => navigate("/characters"), active: isCharacters, primary: appPrimary },
    { icon: FaHatWizard, label: "Adventures", onClick: () => navigate("/adventures"), active: isAdventures, primary: appPrimary },
    { icon: FaCog, label: "Settings", onClick: () => navigate("/settings/profile"), active: isSettings, primary: appPrimary },
  ];

  const groups = [...actionGroups, appGroup].filter((g) => actionsOf(g).length > 0);

  // Desktop only shows `primary`-flagged actions as standalone icons;
  // everything else (from every group, app/session groups included) moves
  // into one trailing "more" menu - the same collapsed shape the mobile
  // menu below already uses for the full set.
  const primaryActions = groups.flatMap((group) => actionsOf(group).filter((action) => action.primary));
  const overflowGroups = groups.map((group) => withActions(group, actionsOf(group).filter((action) => !action.primary))).filter((g) => actionsOf(g).length > 0);

  const renderItems = (actions: HeaderAction[]) =>
    actions.map((action, ai) => (
          <DropdownMenuItem
            key={ai}
            onSelect={action.onClick}
            disabled={action.disabled}
            className={cn(
              action.danger && "text-destructive focus:text-destructive",
              action.active && "text-primary focus:text-primary"
            )}
          >
            <action.icon className="mr-2 h-4 w-4" />
            <span>{action.label}</span>
          </DropdownMenuItem>
    ));

  // Untitled groups are listed as they are; titled ones follow each other
  // as sections, with a divider before and after the run of them.
  const renderMenuGroups = (groupsToRender: AnyGroup[]) =>
    groupsToRender.map((group, gi) => {
      const prev = groupsToRender[gi - 1];
      const divider = gi > 0 && (Array.isArray(group) || Array.isArray(prev));
      const open = !Array.isArray(group) && openSection === group.title;
      return (
        <React.Fragment key={gi}>
          {divider && <DropdownMenuSeparator />}
          {Array.isArray(group) ? (
            renderItems(group)
          ) : (
            <>
              <DropdownMenuItem
                // Opens the section, leaving the menu open.
                onSelect={(e) => {
                  e.preventDefault();
                  setOpenSection(open ? null : group.title);
                }}
                aria-expanded={open}
                className={cn(group.actions.some((a) => a.active) && "text-primary focus:text-primary")}
              >
                <group.icon className="mr-2 h-4 w-4" />
                <span className="flex-1">{group.title}</span>
                <FaChevronDown className={cn("ml-3 h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")} />
              </DropdownMenuItem>
              {open && (
                <div role="group" aria-label={group.title} className="ml-3 border-l border-border pl-1">
                  {renderItems(group.actions)}
                </div>
              )}
            </>
          )}
        </React.Fragment>
      );
    });

  if (is("terminal")) {
    // Chat pages pass an avatar; they read as `~/chats/ name.log`, every
    // other page as `~/title`.
    const isChatPage = Boolean(avatar);
    const moreMenu = (menuGroups: AnyGroup[]) => (
      <DropdownMenu onOpenChange={menuOpenChange}>
        <DropdownMenuTrigger asChild>
          <TermLink label="..." aria-label="More options" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[80vh] overflow-y-auto">{renderMenuGroups(menuGroups)}</DropdownMenuContent>
      </DropdownMenu>
    );
    return (
      <header className="h-[60px] flex-shrink-0 border-b border-border bg-background flex items-center gap-3.5 px-3 md:px-[22px] z-20">
        <TermLink label="≡" onClick={open} aria-label="Open menu" className="lg:hidden" />
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back" className="text-[12px] font-bold text-ring hover:underline underline-offset-2 flex-shrink-0">
            cd ..
          </button>
        )}
        <div className="flex items-center gap-2.5 min-w-0">
          {isChatPage && <span className="hidden sm:inline text-muted-foreground flex-shrink-0">~/chats/</span>}
          {avatar}
          <div className="min-w-0 leading-tight">
            <div className="text-[13px] font-bold truncate text-foreground">
              {isChatPage ? <>{title}.log</> : <span className="lowercase">~/{title}</span>}
            </div>
            {subtitle && <div className="text-[10px] text-muted-foreground truncate"># {subtitle}</div>}
          </div>
        </div>

        <div className="flex-1" />

        <div className="hidden lg:flex items-center gap-3.5">
          {primaryActions.map((action, ai) => (
            <TermLink
              key={ai}
              label={action.shortLabel ?? action.label}
              title={action.label}
              aria-label={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
              active={action.active}
              danger={action.danger}
            />
          ))}
          {overflowGroups.length > 0 && moreMenu(overflowGroups)}
        </div>
        <div className="lg:hidden">{moreMenu(groups)}</div>

        <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      </header>
    );
  }

  return (
    <header className="h-16 flex-shrink-0 border-b border-border bg-surface flex items-center gap-2.5 px-3 md:px-4 z-20">
      {shell && avatar && !onBack ? (
        <Button onClick={() => navigate("/")} variant="outline" size="icon" title="Chats" aria-label="Back to chats" className={cn(iconBtnClass, "lg:hidden")} data-slot="back-to-chats">
          <FaArrowLeft size={15} />
        </Button>
      ) : shell && (onBack || TAB_BAR_PATHS.includes(location.pathname)) ? null : (
        <Button onClick={open} variant="outline" size="icon" title="Menu" aria-label="Open menu" className={cn(iconBtnClass, "lg:hidden")}>
          <FaBars size={16} />
        </Button>
      )}

      {onBack && (
        <Button
          onClick={onBack}
          variant="outline"
          title="Back"
          aria-label="Back"
          className="h-9 px-3 rounded-lg border-0 shadow-none bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground text-[13px] font-medium flex-shrink-0"
        >
          <FaArrowLeft size={13} /> <span className="hidden sm:inline">Back</span>
        </Button>
      )}

      {(() => {
        const titleBlock = (
          <>
            {avatar}
            <span className="min-w-0 leading-tight text-left">
              <span className="block text-[16px] font-semibold truncate text-foreground">{title}</span>
              {subtitle && (
                <span className="text-[12px] text-muted-foreground truncate flex items-center gap-1.5">
                  {avatar && <span aria-hidden className={cn("w-[6px] h-[6px] rounded-full flex-shrink-0", online ? "bg-success" : "bg-subtle")} />}
                  <span className="truncate">{subtitle}</span>
                </span>
              )}
            </span>
          </>
        );
        return onTitleClick ? (
          <button type="button" onClick={onTitleClick} aria-label={titleLabel} data-slot="header-title" className="flex min-w-0 items-center gap-3 rounded-xl py-1 pr-2 hover:bg-raised">
            {titleBlock}
          </button>
        ) : (
          <div className="flex items-center gap-2.5 min-w-0">{titleBlock}</div>
        );
      })()}

      <div className="flex-1" />

      {/* Desktop (lg and up, where the sidebar is docked): primary actions
          stay as tooltipped icon buttons; everything else collapses into the
          trailing "more" menu. Tablets get the single menu below: next to a
          docked sidebar their icon row squeezed the title down to "A..", and
          now that the sidebar is a drawer there the menu keeps it roomy. */}
      <div className="hidden lg:flex items-center gap-1">
        {primaryActions.map((action, ai) => action.labelled ? (
          <Button
            key={ai}
            onClick={action.onClick}
            disabled={action.disabled}
            variant="ghost"
            aria-label={action.label}
            aria-pressed={action.active}
            className={cn("h-10 gap-2 rounded-[10px] px-3 text-[14px] font-semibold", action.active ? "bg-primary/[0.14] text-primary-text hover:bg-primary/[0.2]" : "text-muted-foreground hover:bg-raised hover:text-foreground")}
          >
            <action.icon size={15} />
            {action.label}
          </Button>
        ) : (
          <Tooltip key={ai}>
            <TooltipTrigger asChild>
              <Button
                onClick={action.onClick}
                disabled={action.disabled}
                variant="outline"
                size="icon"
                aria-label={action.label}
                className={cn(
                  action.danger ? iconBtnDangerClass : action.active ? iconBtnActiveClass : iconBtnClass,
                  action.active && !action.danger && is("neumorphic") && "cta-surface",
                  action.disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <action.icon size={15} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{action.label}</TooltipContent>
          </Tooltip>
        ))}
        {overflowGroups.length > 0 && (
          <DropdownMenu onOpenChange={menuOpenChange}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More options" className={iconBtnClass}>
                <FaEllipsisV size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[80vh] overflow-y-auto">{renderMenuGroups(overflowGroups)}</DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Phones and tablets: everything collapses into one menu so buttons stop crowding the header */}
      <div className="lg:hidden">
        <DropdownMenu onOpenChange={menuOpenChange}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More options" className={iconBtnClass}>
              <FaEllipsisV size={15} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[80vh] overflow-y-auto">{renderMenuGroups(groups)}</DropdownMenuContent>
        </DropdownMenu>
      </div>

      <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </header>
  );
};

export default Header;
