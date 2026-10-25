import React, { useMemo } from "react";
import { useAppSelector } from "src/store/hooks";
import { selectActivePersona } from "src/features/settingsSlice";
import { buildRelationshipMap, circleLayout } from "src/features/character/relationshipMap";
import { getInitials } from "src/components/molecules/CharacterAvatar";
import { useWorldChats, useWorldCharacters } from "src/hooks/useWorld";

// The relationship map (#138): you in the middle, your characters around
// you; lines between characters who know each other (thicker when they
// have feelings about each other in a group), and each bond with you named
// on the line to you. A list below says the same in words.
export const RelationshipMap = () => {
  const characters = useWorldCharacters();
  const chats = useWorldChats();
  const persona = useAppSelector(selectActivePersona);
  const { nodes, links } = useMemo(() => buildRelationshipMap(characters, chats), [characters, chats]);
  const size = 360;
  const c = size / 2;
  const points = circleLayout(nodes.length, c, c, nodes.length > 6 ? 140 : 120);
  const at = new Map(nodes.map((n, i) => [n.id, points[i]]));
  const you = persona?.name?.trim() || "You";

  if (nodes.length === 0) return <p className="text-[13px] text-muted-foreground">Start a chat and the people in your life show up here.</p>;

  return (
    <div className="flex flex-col gap-4" data-slot="relationship-map">
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[420px]" role="img" aria-label={`Relationship map: ${you} and ${nodes.map((n) => n.name).join(", ")}`}>
        {links.map((l) => {
          const a = at.get(l.a)!;
          const b = at.get(l.b)!;
          return <line key={`${l.a}-${l.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgb(var(--border-strong))" strokeWidth={l.feelings.length > 0 ? 2.5 : 1.25} />;
        })}
        {nodes.map((n) => {
          const p = at.get(n.id)!;
          return <line key={`you-${n.id}`} x1={c} y1={c} x2={p.x} y2={p.y} stroke="rgb(var(--primary))" strokeOpacity={n.blocked ? 0.25 : 0.55} strokeDasharray={n.blocked ? "4 4" : undefined} strokeWidth={1.75} />;
        })}
        <circle cx={c} cy={c} r={26} fill="rgb(var(--primary))" />
        <text x={c} y={c + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="rgb(var(--primary-foreground))">{getInitials(you)}</text>
        {nodes.map((n) => {
          const p = at.get(n.id)!;
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r={22} fill={n.accent?.[0] || "rgb(var(--raised))"} stroke="rgb(var(--surface))" strokeWidth={3} />
              <text x={p.x} y={p.y + 4.5} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#fff">{getInitials(n.name)}</text>
              <text x={p.x} y={p.y + 38} textAnchor="middle" fontSize="12" fontWeight="600" fill="rgb(var(--foreground))">{n.name}</text>
            </g>
          );
        })}
      </svg>
      <ul aria-label="Bonds" className="flex flex-col gap-1.5 text-[13.5px]">
        {nodes.map((n) => (
          <li key={n.id} className="rounded-xl bg-raised px-3 py-2 ring-1 ring-inset ring-border">
            <span className="font-semibold text-foreground">{n.name}</span>
            <span className="text-muted-foreground">
              {" · "}
              {n.blocked === "you" ? "you blocked them" : n.blocked === "them" ? "blocked you" : n.bond || "no label yet"}
              {n.stage && ` · ${n.stage}`}
              {n.was && ` · was ${n.was}`}
            </span>
          </li>
        ))}
        {links.flatMap((l) => l.feelings).map((f) => (
          <li key={f} className="px-3 text-[12.5px] text-subtle">{f}</li>
        ))}
      </ul>
    </div>
  );
};

export default RelationshipMap;
