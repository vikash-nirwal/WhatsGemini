import React, { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaRegSmile } from "react-icons/fa";
import Header from "src/components/organisms/Header";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "src/components/molecules/dropdown-menu";
import { Button } from "src/components/atoms/button";
import { cn } from "src/utils/cn";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { changeChannels } from "src/features/channelSlice";
import { CHANNEL_REACTIONS, channelName, crowdReactions } from "src/features/channels/channels";
import { avatarOf } from "src/features/character/profileChanges";

const when = (at: number) => {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
};

// A channel (#127): its posts, newest at the bottom like a chat, each with
// the followers' reactions and yours. No composer: only the channel posts.
const ChannelPage = () => {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const channel = useAppSelector((state) => state.channels.channels.find((c) => c.id === channelId));
  const characters = useAppSelector((state) => state.character.characters);
  const worlds = useAppSelector((state) => state.world.worlds);
  const subject = channel ? (channel.kind === "character" ? characters.find((c) => c.id === channel.refId) : worlds.find((w) => w.id === channel.refId)) : undefined;
  const latestAt = channel?.posts[channel.posts.length - 1]?.at || 0;

  // What's on screen counts as read.
  useEffect(() => {
    if (!channel || latestAt <= (channel.lastReadAt || 0)) return;
    dispatch(changeChannels((list) => list.map((c) => (c.id === channel.id ? { ...c, lastReadAt: latestAt } : c))));
  }, [channel, latestAt, dispatch]);

  if (!channel || !subject) {
    return (
      <div className="flex h-dvh w-full flex-col">
        <Header title="Channel" onBack={() => navigate("/updates")} />
        <p className="p-6 text-muted-foreground">This channel isn't here any more.</p>
      </div>
    );
  }
  const name = channelName(channel.kind, subject);
  const react = (postId: string, emoji: string) =>
    dispatch(changeChannels((list) => list.map((c) => (c.id === channel.id ? { ...c, posts: c.posts.map((p) => (p.id === postId ? { ...p, yourReaction: p.yourReaction === emoji ? undefined : emoji } : p)) } : c))));
  const unfollow = async () => {
    await dispatch(changeChannels((list) => list.filter((c) => c.id !== channel.id)));
    navigate("/updates");
  };
  const image = channel.kind === "character" ? avatarOf(subject as never) : (subject as { coverImage?: string }).coverImage;

  return (
    <div className="flex h-dvh w-full flex-col">
      <Header
        title={name}
        subtitle="Channel"
        online={false}
        avatar={<CharacterAvatar name={subject.name} imageSrc={image} size={36} className="rounded-xl" />}
        onBack={() => navigate("/updates")}
        actionGroups={[[{ icon: FaRegSmile, label: "Unfollow", onClick: () => void unfollow(), danger: true }]]}
      />
      <div className="flex-1 overflow-y-auto" data-slot="chat-pane">
        <ol className="mx-auto flex max-w-2xl flex-col gap-3 p-4" aria-label="Posts">
          {channel.posts.length === 0 && <li className="py-10 text-center text-[13.5px] text-muted-foreground">No posts yet. The first one comes soon.</li>}
          {channel.posts.map((post) => {
            const counts = { ...crowdReactions(post.id) };
            if (post.yourReaction) counts[post.yourReaction] = (counts[post.yourReaction] || 0) + 1;
            return (
              <li key={post.id} className="max-w-[85%] self-start" aria-label={post.text}>
                <div data-slot="message-bubble" data-sender="ai" className="relative rounded-2xl rounded-tl-[5px] bg-card/[0.88] px-4 py-3 shadow-soft">
                  <p className="whitespace-pre-line text-[15px] text-foreground">{post.text}</p>
                  <div data-slot="bubble-meta" className="mt-1 text-right text-[11px] text-subtle">{when(post.at)}</div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {Object.entries(counts).map(([emoji, n]) => (
                    <span key={emoji} className={cn("rounded-full border px-2 py-0.5 text-[12px]", post.yourReaction === emoji ? "border-primary bg-primary/10" : "border-border bg-card")}>
                      {emoji} {n}
                    </span>
                  ))}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label="React">
                        <FaRegSmile size={13} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="flex min-w-0 gap-0.5 p-1">
                      {CHANNEL_REACTIONS.map((emoji) => (
                        <DropdownMenuItem key={emoji} onSelect={() => void react(post.id, emoji)} aria-label={post.yourReaction === emoji ? `Remove ${emoji}` : `React with ${emoji}`} className="text-lg">
                          {emoji}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="border-t border-border/50 px-4 py-3 text-center text-[12.5px] text-subtle">Only {subject.name} posts here. You can react.</div>
    </div>
  );
};

export default ChannelPage;
