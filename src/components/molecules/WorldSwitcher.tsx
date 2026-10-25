import { useLocation, useNavigate } from "react-router-dom";
import { FaChevronDown, FaPlus } from "react-icons/fa";
import { MdOutlinePublic } from "react-icons/md";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "src/components/molecules/dropdown-menu";
import { useAppDispatch } from "src/store/hooks";
import { switchWorld } from "src/features/worldSlice";
import { MY_WORLD } from "src/features/world/currentWorld";
import { useCurrentWorld } from "src/hooks/useWorld";
import { cn } from "src/utils/cn";

// The world switcher (#143): like switching accounts. "title" is the phone
// home's title row, "rail" the top of the desktop rail.
export const WorldSwitcher = ({ variant }: { variant: "title" | "rail" }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { worlds, currentWorldId, current, name } = useCurrentWorld();

  const pick = (value: string) => {
    const id = value === "mine" ? null : Number(value);
    if (id === currentWorldId) return;
    dispatch(switchWorld(id));
    // An open chat belongs to the world you just left.
    if (pathname.startsWith("/chat/")) navigate("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "rail" ? (
          <button type="button" aria-label={`World: ${name}. Switch world`} title={name} className="mb-1 rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <CharacterAvatar name={name} imageSrc={current?.coverImage} size={44} className="rounded-[14px]" />
          </button>
        ) : (
          <button type="button" aria-label={`World: ${name}. Switch world`} className="flex max-w-full items-center gap-1.5 rounded-lg text-left text-[22px] font-bold tracking-tight text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="truncate">{name}</span>
            <FaChevronDown aria-hidden size={13} className="flex-shrink-0 text-muted-foreground" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={variant === "rail" ? "right" : "bottom"} className="min-w-[220px]" aria-label="Worlds">
        <DropdownMenuRadioGroup value={currentWorldId ? String(currentWorldId) : "mine"} onValueChange={pick}>
          <DropdownMenuRadioItem value="mine">{MY_WORLD}</DropdownMenuRadioItem>
          {worlds.map((w) => (
            <DropdownMenuRadioItem key={w.id} value={String(w.id)} className={cn("truncate")}>{w.name}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/worlds/wizard")}>
          <FaPlus aria-hidden /> New world
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/worlds")}>
          <MdOutlinePublic aria-hidden /> Manage worlds
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
