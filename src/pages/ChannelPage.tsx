import React, { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaCheck, FaRegSmile } from "react-icons/fa";
import Header from "src/components/organisms/Header";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "src/components/molecules/dropdown-menu";
import { Button } from "src/components/atoms/button";
import { cn } from "src/utils/cn";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { changeChannels } from "src/features/channelSlice";
import { CHANNEL_REACTIONS, channelName, crowdReactions } from "src/features/channels/channels";
import { avatarOf } from "src/features/character/profileChanges";
import { addChat } from "src/features/chatSlice";
import { Character } from "src/types";

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
  const chats = useAppSelector((state) => state.chat.chats);
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

  const followers = 40 + (Array.from(channel.id).reduce((n, ch) => n + ch.charCodeAt(0), 0) % 400);
  const dayOf = (at: number) => {
    const d = new Date(at);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);
    return d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === yesterday.toDateString() ? "Yesterday" : d.toLocaleDateString([], { month: "short", day: "numeric" });
  };
  const owner = channel.kind === "character" ? (subject as Character) : undefined;
  const messageOwner = async () => {
    if (!owner) return;
    const existing = chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === owner.id && !c.whatIf);
    const chat = existing || (await dispatch(addChat({ title: owner.name, characterIds: [owner.id] })).unwrap());
    if (chat?.id) navigate(`/chat/${chat.id}`);
  };

  return (
    <div className="flex h-dvh w-full flex-col">
      <Header
        title={name}
        subtitle={`Channel · ${followers} followers`}
        online={false}
        avatar={<CharacterAvatar name={subject.name} imageSrc={image} size={36} className="rounded-[11px]" />}
        onBack={() => navigate("/updates")}
        actionGroups={[[{ icon: FaCheck, label: "Unfollow", onClick: () => void unfollow(), danger: true }]]}
      />
      <div className="flex-1 overflow-y-auto" data-slot="chat-pane">
        <ol className="mx-auto flex max-w-[560px] flex-col gap-4 px-3 py-4 lg:px-6" aria-label="Posts">
          {channel.posts.length === 0 && <li className="py-10 text-center text-[13.5px] text-muted-foreground">No posts yet. The first one comes soon.</li>}
          {channel.posts.map((post, i) => {
            const counts = { ...crowdReactions(post.id) };
            if (post.yourReaction) counts[post.yourReaction] = (counts[post.yourReaction] || 0) + 1;
            const newDay = i === 0 || dayOf(channel.posts[i - 1].at) !== dayOf(post.at);
            return (
              <li key={post.id} className="flex flex-col gap-4" aria-label={post.text}>
                {newDay && <span className="mx-auto rounded-full bg-raised px-3 py-0.5 text-[12px] font-semibold text-muted-foreground shadow-soft">{dayOf(post.at)}</span>}
                <article data-slot="message-bubble" data-sender="ai" className="flex flex-col gap-2.5 rounded-[18px] bg-card px-4 py-3 shadow-soft">
                  <p className="whitespace-pre-line font-serif text-[15.5px] leading-6 text-foreground">{post.text}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {Object.entries(counts).map(([emoji, n]) => (
                      <span key={emoji} className={cn("flex h-7 items-center rounded-full border px-2.5 text-[12.5px]", post.yourReaction === emoji ? "border-primary bg-primary/10" : "border-border bg-raised")}>
                        {emoji} {n}
                      </span>
                    ))}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full border border-border" aria-label="React">
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
                    <span className="flex-1" />
                    <span data-slot="bubble-meta" className="text-[12px] text-subtle">{when(post.at)}</span>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="flex items-center justify-center gap-3 border-t border-border bg-surface px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <p className="min-w-0 flex-1 text-[12.5px] text-muted-foreground lg:flex-none">Only {subject.name} posts here. You can react{owner ? `, or talk to ${owner.name} in your chat` : ""}.</p>
        {owner && <Button type="button" variant="outline" size="sm" onClick={() => void messageOwner()}>Message {owner.name}</Button>}
      </div>
    </div>
  );
};

export default ChannelPage;
