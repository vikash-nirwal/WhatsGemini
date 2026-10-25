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
// The rail (#157): every world as its own tile, the current one ringed, and
// "New world" under them, as on the canvas.
export const WorldRail = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { worlds, currentWorldId } = useCurrentWorld();
  const all = [{ id: null as number | null, name: MY_WORLD, cover: undefined as string | undefined }, ...worlds.map((w) => ({ id: w.id as number | null, name: w.name, cover: w.coverImage }))];
  const pick = (id: number | null) => {
    if (id === currentWorldId) return navigate("/worlds");
    dispatch(switchWorld(id));
    if (pathname.startsWith("/chat/")) navigate("/");
  };
  return (
    <div role="group" aria-label="Worlds" className="flex flex-col items-center gap-2">
      {all.slice(0, 6).map((w) => {
        const current = w.id === currentWorldId;
        return (
          <button key={w.id ?? "mine"} type="button" onClick={() => pick(w.id)} title={w.name}
            aria-label={current ? `World: ${w.name} (current). Open worlds` : `Go to ${w.name}`}
            className={cn("rounded-[14px] transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", current ? "shadow-[0_0_0_2px_rgb(var(--surface)),0_0_0_4px_rgb(var(--primary))]" : "opacity-80 hover:opacity-100")}>
            <CharacterAvatar name={w.name} imageSrc={w.cover} size={44} className="rounded-[14px]" />
          </button>
        );
      })}
      {all.length > 6 && <WorldSwitcher variant="rail" />}
      <button type="button" onClick={() => navigate("/worlds/wizard")} aria-label="New world" title="New world" className="grid h-11 w-11 place-items-center rounded-[14px] text-muted-foreground ring-1 ring-inset ring-border-strong hover:text-foreground">
        <FaPlus size={13} />
      </button>
    </div>
  );
};

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
