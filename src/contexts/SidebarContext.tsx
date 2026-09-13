import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { LS_SIDEBAR_COLLAPSED } from "../utils/constants";

interface SidebarContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  // Desktop-only icon-rail collapse - independent of `isOpen`, which is the
  // mobile show/hide drawer. Persisted so a reload doesn't snap it back open.
  collapsed: boolean;
  toggleCollapsed: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  isOpen: false,
  open: () => {},
  close: () => {},
  collapsed: false,
  toggleCollapsed: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

export const SidebarProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(LS_SIDEBAR_COLLAPSED) === "true");
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(LS_SIDEBAR_COLLAPSED, String(next));
      return next;
    });
  }, []);

  return (
    <SidebarContext.Provider value={{ isOpen, open, close, collapsed, toggleCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
};
