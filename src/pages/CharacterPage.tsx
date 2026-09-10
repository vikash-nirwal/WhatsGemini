import React, { useState, useMemo, useRef, useContext } from "react";
import { ThemeContext } from "../contexts/ThemeContext";
import { addCharacter, deleteCharacter } from "../features/characterSlice";
import { addChat, fetchChats } from "../features/chatSlice";
import { useNavigate } from "react-router-dom";
import { FaTrash, FaEdit, FaDownload, FaImages, FaPlus, FaComment, FaEllipsisV, FaSearch, FaCopy, FaFileImage, FaUpload } from "react-icons/fa";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { Character, Chat } from "../types";
import { cn } from "../utils/cn";
import { useModal } from "../contexts/ModalContext";
import { DisplayImage } from "../components/DisplayImage";
import { CharacterAvatar } from "../components/ui/CharacterAvatar";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import Header from "../components/Header";
import { CHARACTER_SWATCHES, SAMPLE_CHARACTER } from "../utils/constants";
import { characterToCardV2, parseCharacterCardJson, buildCharacterCardPng, extractCharacterCardFromPng } from "../features/character/characterCard";
import { parseSize, resolveImageSrcToUrl, autoCoverCropToBlob, generatePlaceholderPortraitBlob, blobToDataUrl } from "../features/ai/utils/portraitUtils";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const CharacterPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const characters = useAppSelector((state) => state.character.characters);
  const chats = useAppSelector((state) => state.chat.chats);
  const loading = useAppSelector((state) => state.character.loading);
  const { showConfirm, showAlert } = useModal();
  const { colorTheme } = useContext(ThemeContext);
  const neumorphic = colorTheme === "neumorphic";
  const portraitSaveSize = useAppSelector((state) => parseSize(state.settings.portraitSaveSize));

  const [gallerySearch, setGallerySearch] = useState("");
  const importCardInputRef = useRef<HTMLInputElement>(null);
  const [importingCard, setImportingCard] = useState(false);

  const handleTrySampleCharacter = async () => {
    const character = await dispatch(addCharacter(SAMPLE_CHARACTER)).unwrap();
    if (character) handleChatWithCharacter(character);
  };

  const handleDeleteCharacter = async (id: number) => {
    const confirmed = await showConfirm("Delete Character", "Are you sure you want to delete this character? Their 1:1 chat is deleted too; in a group chat they're just removed, and the rest of the conversation stays.");
    if (confirmed) {
      await dispatch(deleteCharacter(id));
      // deleteCharacter only updates Redux's character list - refresh chats
      // too, since deleting a character can delete (1:1) or shrink (a group
      // room's characterIds) a chat, and the sidebar reads directly off this
      // state rather than the DB.
      dispatch(fetchChats());
    }
  };

  const handleChatWithCharacter = async (char: Character) => {
    // The character's own 1:1 chat specifically - not just any room they
    // happen to be a member of.
    const existingChat = chats.find((chat: Chat) => chat.characterIds?.length === 1 && chat.characterIds[0] === char.id);
    if (existingChat) {
      navigate(`/chat/${existingChat.id}`);
      return;
    }
    const result = await dispatch(addChat({ title: char.name, characterIds: [char.id] }));
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

  // Community-standard "Character Card V2" export (TavernAI/SillyTavern) -
  // separate from handleExportCharacter's native format above, which stays
  // the full-fidelity round-trip option within WhatsGemini itself.
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportCharacterCardJson = (char: Character) => {
    const jsonString = JSON.stringify(characterToCardV2(char), null, 2);
    downloadBlob(new Blob([jsonString], { type: "application/json" }), `${char.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_card.json`);
  };

  const handleExportCharacterCardPng = async (char: Character) => {
    try {
      let basePng: Blob;
      if (char.appearanceImages?.[0]) {
        const url = await resolveImageSrcToUrl(char.appearanceImages[0]);
        basePng = await autoCoverCropToBlob(url, 400, 533);
      } else {
        basePng = await generatePlaceholderPortraitBlob(char.name, char.accent);
      }
      const cardPng = await buildCharacterCardPng(char, basePng);
      downloadBlob(cardPng, `${char.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_card.png`);
    } catch (err: any) {
      showAlert("Export failed", err?.message || "Failed to export character card.");
    }
  };

  // Import: JSON (WhatsGemini native, V2 card, or flat/legacy V1 card) or a
  // PNG card (a normal portrait PNG with the card JSON tucked into a tEXt
  // chunk). A PNG card's own image becomes the imported character's
  // reference portrait.
  const handleImportCardFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportingCard(true);
    try {
      const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
      const parsedChar = isPng
        ? await extractCharacterCardFromPng(file)
        : parseCharacterCardJson(JSON.parse(await file.text()));

      if (isPng && (!parsedChar.appearanceImages || parsedChar.appearanceImages.length === 0)) {
        const resized = await autoCoverCropToBlob(URL.createObjectURL(file), portraitSaveSize.width, portraitSaveSize.height);
        parsedChar.appearanceImages = [await blobToDataUrl(resized)];
      }

      const character = await dispatch(addCharacter(parsedChar)).unwrap();
      if (character) {
        showAlert("Imported", `Imported "${(character as Character).name}".`);
      }
    } catch (err: any) {
      showAlert("Import failed", err?.message || "Failed to import character card.");
    } finally {
      setImportingCard(false);
    }
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
    return characters.filter((c) => chats.some((chat) => chat.characterIds?.includes(c.id) && chat.timestamp >= cutoff)).length;
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
            <Button
              onClick={() => importCardInputRef.current?.click()}
              variant="outline"
              disabled={importingCard}
              title="Import a Character Card (V2 JSON or PNG) or a WhatsGemini export"
            >
              <FaUpload size={12} /> {importingCard ? "Importing..." : "Import Card"}
            </Button>
            <input
              type="file"
              ref={importCardInputRef}
              onChange={handleImportCardFileSelected}
              accept=".json,application/json,.png,image/png"
              style={{ display: "none" }}
            />
            <Button onClick={() => navigate("/characters/new")} variant="default">
              <FaPlus size={12} /> New character
            </Button>
          </div>
        </div>

        {!loading && characters.length === 0 ? (
          <Card className={cn("p-6 text-center flex flex-col items-center gap-3", neumorphic && "shadow-inset")}>
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
                className="relative overflow-hidden rounded-xl border border-transparent hover:border-primary/40 transition shadow-soft flex flex-col justify-end"
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
                        <DropdownMenuItem onSelect={() => handleExportCharacterCardJson(char)}>
                          <FaDownload className="mr-2 h-4 w-4" />
                          <span>Export Card (V2 JSON)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleExportCharacterCardPng(char)}>
                          <FaFileImage className="mr-2 h-4 w-4" />
                          <span>Export Card (V2 PNG)</span>
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
              className={cn(
                "rounded-xl flex flex-col items-center justify-center gap-3 text-subtle hover:text-primary transition-colors",
                neumorphic
                  ? "shadow-inset hover:shadow-inset"
                  : "border-[1.5px] border-dashed border-border hover:border-primary"
              )}
              style={{ aspectRatio: "3 / 3.9" }}
            >
              <span
                className={cn(
                  "w-[52px] h-[52px] rounded-full grid place-items-center",
                  neumorphic ? "shadow-raised" : "border-[1.5px] border-dashed border-current"
                )}
              >
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
