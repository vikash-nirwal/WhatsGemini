import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FaEye } from "react-icons/fa";
import Header from "src/components/organisms/Header";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { useAppSelector } from "src/store/hooks";
import { avatarOf } from "src/features/character/profileChanges";
import { worldThreads } from "src/features/world/worldTalk";
import { settingLabel } from "src/features/world/talkMedium";
import { useCurrentWorld, useWorldPrefs } from "src/hooks/useWorld";
import { formatRelativeTime } from "src/utils/formatRelativeTime";
import { cn } from "src/utils/cn";

// Peek (#145): the texts characters in this world send each other, read-only.
// /peek lists the threads; /peek/:a/:b opens one.
const PeekPage = () => {
  const navigate = useNavigate();
  const { a, b } = useParams();
  const characters = useAppSelector((state) => state.character.characters);
  const { worlds, currentWorldId, name } = useCurrentWorld();
  const [prefs] = useWorldPrefs(currentWorldId);
  const threads = useMemo(() => worldThreads(characters, worlds, currentWorldId), [characters, worlds, currentWorldId]);
  const open = a && b ? threads.find((t) => t.a.id === Number(a) && t.b.id === Number(b)) : undefined;

  if (open) {
    const names: Record<number, string> = { [open.a.id]: open.a.name, [open.b.id]: open.b.name };
    return (
      <div className="w-full h-dvh flex flex-col">
        <Header title={`${open.a.name} & ${open.b.name}`} subtitle={`Their own texts in ${name}`} onBack={() => navigate("/peek")} />
        <div role="note" className="mx-4 mt-3 w-[calc(100%-2rem)] max-w-[828px] self-center flex items-center gap-2 rounded-xl bg-raised px-3 py-2 text-[13px] text-muted-foreground">
          <FaEye aria-hidden /> You're reading, not in this chat. They don't know you can see it.
        </div>
        <div className="flex-1 overflow-y-auto">
        <ol aria-label="Their texts" className="w-full max-w-[860px] mx-auto px-4 py-4 flex flex-col gap-1.5">
          {open.talks.map((talk) => (
            <li key={talk.id} className="flex flex-col gap-1.5">
              <div className="self-center my-2 rounded-full bg-raised px-3 py-0.5 text-[11.5px] text-subtle">{formatRelativeTime(talk.at)}{settingLabel(talk) ? ` · ${settingLabel(talk)}` : ""}</div>
              {talk.lines.map((line, i) => {
                const right = line.speakerId === open.b.id;
                return (
                  <div key={i} className={cn("max-w-[78%] rounded-2xl px-3 py-1.5 text-[14.5px]", right ? "self-end bg-bubble-out" : "self-start bg-bubble-in")}>
                    <div className="text-[11.5px] font-semibold text-primary-text">{names[line.speakerId]}</div>
                    {line.text}
                  </div>
                );
              })}
            </li>
          ))}
        </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-dvh flex flex-col">
      <Header title="Peek" subtitle={`Their own texts in ${name}`} onBack={() => navigate("/")} />
      <div className="flex-1 overflow-y-auto p-2">
        {/* Centred like the other pages, instead of stretching across a wide screen. */}
        <div className="w-full max-w-[860px] mx-auto">
        {!prefs.peek ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Peek is off for {name}. Turn it on in <Link to="/worlds" className="text-primary-text underline">Worlds</Link>.</p>
        ) : threads.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nobody here has texted each other yet. People who know each other get in touch now and then.</p>
        ) : (
          <ul aria-label="Threads">
            {threads.map((t) => {
              const lastTalk = t.talks[t.talks.length - 1];
              const last = lastTalk.lines[lastTalk.lines.length - 1];
              return (
                <li key={`${t.a.id}-${t.b.id}`}>
                  <Link to={`/peek/${t.a.id}/${t.b.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-raised">
                    <span className="relative flex-shrink-0 w-12 h-12">
                      <CharacterAvatar name={t.a.name} accent={t.a.accent} imageSrc={avatarOf(t.a)} size={34} className="absolute left-0 top-0" />
                      <CharacterAvatar name={t.b.name} accent={t.b.accent} imageSrc={avatarOf(t.b)} size={34} className="absolute right-0 bottom-0 ring-2 ring-surface" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[15px] font-semibold text-foreground">{t.a.name} & {t.b.name}</span>
                        <span className="flex-shrink-0 text-[12px] text-subtle">{formatRelativeTime(t.lastAt)}</span>
                      </span>
                      {last && <span className="block truncate text-[13.5px] text-muted-foreground">{last.speakerId === t.a.id ? t.a.name : t.b.name}: {last.text}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        </div>
      </div>
    </div>
  );
};

export default PeekPage;
