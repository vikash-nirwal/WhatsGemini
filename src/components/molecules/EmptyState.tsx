import React from "react";

// An empty list or page, as on the revamp canvas (#149): one icon, one
// sentence of what goes here and how, and at most one action.
export const EmptyState = ({ icon, title, children, action }: { icon: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) => (
  <div data-slot="empty-state" className="flex flex-col items-center gap-2.5 px-6 py-7 text-center">
    <div aria-hidden className="grid h-14 w-14 place-items-center rounded-[18px] bg-primary/[0.14] text-primary-text">{icon}</div>
    <h3 className="text-[17px] font-semibold leading-[22px] text-foreground">{title}</h3>
    {children && <p className="max-w-[300px] text-[13px] leading-[18px] text-muted-foreground">{children}</p>}
    {action && <div className="mt-1">{action}</div>}
  </div>
);
