import React, { useState, useMemo } from "react";
import { addCharacter, deleteCharacter } from "../features/characterSlice";
import { addChat } from "../features/chatSlice";
import { useNavigate } from "react-router-dom";
import { FaTrash, FaEdit, FaDownload, FaImages, FaPlus, FaComment, FaEllipsisV, FaSearch, FaCopy } from "react-icons/fa";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { Character, Chat } from "../types";
import { useModal } from "../contexts/ModalContext";
import { DisplayImage } from "../components/DisplayImage";
import { CharacterAvatar } from "../components/ui/CharacterAvatar";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import Header from "../components/Header";
import { CHARACTER_SWATCHES, SAMPLE_CHARACTER } from "../utils/constants";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const CharacterPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const characters = useAppSelector((state) => state.character.characters);
  const chats = useAppSelector((state) => state.chat.chats);
  const loading = useAppSelector((state) => state.character.loading);
  const { showConfirm } = useModal();

  const [gallerySearch, setGallerySearch] = useState("");

  const handleTrySampleCharacter = async () => {
    const character = await dispatch(addCharacter(SAMPLE_CHARACTER)).unwrap();
    if (character) handleChatWithCharacter(character);
  };

  const handleDeleteCharacter = async (id: number) => {
    const confirmed = await showConfirm("Delete Character", "Are you sure you want to delete this character and their chats?");
    if (confirmed) {
      dispatch(deleteCharacter(id));
    }
  };

  const handleChatWithCharacter = async (char: Character) => {
    const existingChat = chats.find((chat: Chat) => chat.characterId === char.id);
    if (existingChat) {
      navigate(`/chat/${existingChat.id}`);
      return;
    }
    const result = await dispatch(addChat({ title: char.name, characterId: char.id }));
    if (result.payload && (result.payload as Chat).id) {
      navigate(`/chat/${(result.payload as Chat).id}`);
    }
  };

  const handleExportCharacter = (char: Character) => {
    const dataToExport = {
      name: char.name,
      description: char.description,
      prompt: char.prompt,
      scenario: char.scenario || "",
      first_mes: char.first_mes || "",
      mes_example: char.mes_example || "",
      relationship: char.relationship || "",
      appearance: char.appearance || "",
      appearanceImages: char.appearanceImages || [],
      tags: char.tags || [],
      accent: char.accent,
      voiceURI: char.voiceURI,
      autoSelfie: char.autoSelfie,
    };

    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${char.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_character.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const truncateText = (text: string, maxLength = 100) => {
    return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
  };

  const goBackOrHome = () => {
    const idx = window.history.state?.idx;
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  };

  const filteredCharacters = useMemo(() => {
    const q = gallerySearch.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)
    );
  }, [characters, gallerySearch]);

  const chattedThisWeek = useMemo(() => {
    const cutoff = Date.now() - WEEK_MS;
    return characters.filter((c) => chats.some((chat) => chat.characterId === c.id && chat.timestamp >= cutoff)).length;
  }, [characters, chats]);

  return (
    <div className="w-full h-screen flex flex-col bg-background">
      <Header
        title="Characters"
        subtitle="Craft a persona to embody, or open one you've already made."
        onBack={goBackOrHome}
      />
      <div className="flex-1 overflow-auto p-4 md:p-8">
      <div className="w-full max-w-[1180px] mx-auto">

        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div>
            <h2 className="text-[26px] font-bold tracking-tight text-foreground">Your cast</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {loading
                ? "Loading..."
                : `${characters.length} character${characters.length === 1 ? "" : "s"}${chattedThisWeek > 0 ? ` · ${chattedThisWeek} chatted with this week` : ""}`}
            </p>
          </div>
          <div className="flex gap-2">
            {characters.length > 0 && (
              <div className="relative">
                <FaSearch size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <Input
                  value={gallerySearch}
                  onChange={(e) => setGallerySearch(e.target.value)}
                  placeholder="Search characters"
                  aria-label="Search characters"
                  className="pl-8 text-[13px] w-[220px] bg-card"
                />
              </div>
            )}
            <Button onClick={() => navigate("/characters/new")} variant="default">
              <FaPlus size={12} /> New character
            </Button>
          </div>
        </div>

        {!loading && characters.length === 0 ? (
          <Card className="p-6 text-center flex flex-col items-center gap-3">
            <p className="text-muted-foreground">No characters created yet.</p>
            <p className="text-sm text-muted-foreground">Create your own, or jump straight into a chat with a ready-made one.</p>
            <div className="flex gap-2.5">
              <Button onClick={() => navigate("/characters/new")} variant="outline" className="h-auto px-4 py-2.5 font-semibold text-sm">
                Create your own
              </Button>
              <Button onClick={handleTrySampleCharacter} variant="default" className="h-auto px-4 py-2.5 font-semibold text-sm">
                Try a sample character
              </Button>
            </div>
          </Card>
        ) : filteredCharacters.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground text-sm">No characters match "{gallerySearch}".</Card>
        ) : (
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
            {filteredCharacters.map((char) => {
              const charAccent = char.accent ?? CHARACTER_SWATCHES[0];
              return (
              <Card
                key={char.id}
                className="relative overflow-hidden rounded-xl border hover:border-primary/40 transition shadow-soft flex flex-col justify-end"
                style={{ aspectRatio: "3 / 3.9" }}
              >
                <div className="absolute inset-0">
                  {char.appearanceImages?.[0] ? (
                    <DisplayImage srcContext={char.appearanceImages[0]} alt={char.name} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${charAccent[0]}26, ${charAccent[1]}26)` }}
                    >
                      <CharacterAvatar name={char.name} accent={char.accent} size={72} />
                    </div>
                  )}
                </div>
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: "linear-gradient(180deg, transparent 20%, rgb(var(--background) / 0.7) 55%, rgb(var(--background) / 0.98) 100%)" }}
                />
                <div
                  className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full"
                  style={{ background: charAccent[0], boxShadow: `0 0 0 3px rgb(var(--background) / 0.6), 0 0 14px ${charAccent[0]}` }}
                />
                <div className="relative flex flex-col gap-1.5 p-4">
                  {char.relationship && (
                    <Badge variant="outline" className="self-start max-w-full truncate border-primary/20 bg-primary/10 font-medium text-primary text-[11px]">
                      {char.relationship}
                    </Badge>
                  )}
                  <h4 className="font-serif font-semibold text-xl text-foreground truncate leading-tight">{char.name}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {truncateText(char.description, 140)}
                  </p>
                  <div className="flex gap-1.5 mt-2">
                    <Button
                      onClick={() => handleChatWithCharacter(char)}
                      className="flex-1 h-9 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 shadow-none"
                    >
                      <FaComment size={11} /> Chat
                    </Button>
                    <Button
                      onClick={() => navigate(`/characters/${char.id}/edit`)}
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 bg-card/70 hover:border-primary hover:text-primary"
                      title="Edit Character"
                    >
                      <FaEdit size={13} />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 bg-card/70 hover:bg-hover hover:text-foreground"
                          title="More options"
                          aria-label="More options"
                        >
                          <FaEllipsisV size={13} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => navigate(`/characters/${char.id}/gallery`)}>
                          <FaImages className="mr-2 h-4 w-4" />
                          <span>View Gallery</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleExportCharacter(char)}>
                          <FaDownload className="mr-2 h-4 w-4" />
                          <span>Export</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => navigate("/characters/new", { state: { duplicateFrom: char } })}>
                          <FaCopy className="mr-2 h-4 w-4" />
                          <span>Duplicate</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => handleDeleteCharacter(char.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <FaTrash className="mr-2 h-4 w-4" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </Card>
            )})}
            <button
              type="button"
              onClick={() => navigate("/characters/new")}
              className="rounded-xl border-[1.5px] border-dashed border-border flex flex-col items-center justify-center gap-3 text-subtle hover:text-primary hover:border-primary transition-colors"
              style={{ aspectRatio: "3 / 3.9" }}
            >
              <span className="w-[52px] h-[52px] rounded-full border-[1.5px] border-dashed border-current grid place-items-center">
                <FaPlus size={18} />
              </span>
              <span className="font-semibold text-sm text-foreground">New character</span>
              <span className="text-xs text-center max-w-[160px] leading-relaxed">Define who Gemini becomes</span>
            </button>
          </div>
        )}

      </div>
      </div>
    </div>
  );
};

export default CharacterPage;
