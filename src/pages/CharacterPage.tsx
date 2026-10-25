import { FaProjectDiagram } from "react-icons/fa";
import RelationshipMap from "src/components/organisms/RelationshipMap";
import { JoinWorldDialog } from "src/components/organisms/JoinWorldDialog";
import { LIFE_PRESETS, lifeOf, presetOf } from "../features/character/lifePresets";
import { ResetDialog } from "src/components/organisms/ResetDialog";
import { resetCharacterLife } from "../features/life/reset";
import React, { useState, useMemo, useRef } from "react";
import { avatarOf } from "../features/character/profileChanges";
import { useColorTheme } from "../hooks/useColorTheme";
import { addCharacter, deleteCharacter } from "../features/characterSlice";
import { addChat, fetchChats } from "../features/chatSlice";
import { useNavigate } from "react-router-dom";
import { FaTrash, FaEdit, FaDownload, FaImages, FaPlus, FaEllipsisV, FaSearch, FaCopy, FaFileImage, FaUpload, FaBook, FaUndo } from "react-icons/fa";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "src/components/molecules/dropdown-menu";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setShowNsfwCharacters } from "../features/settingsSlice";
import { isNsfwCharacter } from "../features/character/contentRating";
import { NsfwBlur } from "src/components/molecules/NsfwBlur";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { Character, Chat } from "../types";
import { cn } from "../utils/cn";
import { useModal } from "../contexts/ModalContext";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { Input } from "src/components/atoms/input";
import { TermLink } from "src/components/atoms/TermLink";
import Header from "src/components/organisms/Header";
import { TAB_BAR_HEIGHT, usePhoneShell } from "src/hooks/usePhoneShell";
import { CHARACTER_SWATCHES, SAMPLE_CHARACTER, DIARY_INTERVAL } from "../utils/constants";
import { characterToCardV2, parseCharacterCardText, buildCharacterCardPng, extractCharacterCardFromPng, ParsedCharacterCard } from "../features/character/characterCard";
import ImportReviewDialog from "src/components/organisms/ImportReviewDialog";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "src/components/molecules/dialog";
import { parseSize, resolveImageSrcToUrl, autoCoverCropToBlob, generatePlaceholderPortraitBlob, blobToDataUrl } from "../features/ai/utils/portraitUtils";
import { useWorldCharacters } from "src/hooks/useWorld";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const CharacterPage = () => {
  // The phone-style shell's tab bar (#114) sits over the bottom of the page.
  const [mapOpen, setMapOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [resetting, setResetting] = useState<Character | null>(null); // Reset (#158)
  const worldCount = useAppSelector((state) => state.world.worlds.length);
  const shell = usePhoneShell();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  // #155: this world's people, or everyone across your worlds.
  const worldCharacters = useWorldCharacters();
  const everyone = useAppSelector((state) => state.character.characters);
  const worldTotal = useAppSelector((state) => state.world.worlds.length);
  const [scope, setScope] = useState<"world" | "all">("world");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const allCharacters = scope === "world" ? worldCharacters : everyone;
  const showNsfwCharacters = useAppSelector((state) => state.settings.showNsfwCharacters);
  const blurNsfwMedia = useAppSelector((state) => state.settings.privacy.blurNsfwMedia);
  const hasNsfwCharacters = useMemo(() => allCharacters.some(isNsfwCharacter), [allCharacters]);
  const characters = useMemo(
    () => (showNsfwCharacters ? allCharacters : allCharacters.filter((c) => !isNsfwCharacter(c))),
    [allCharacters, showNsfwCharacters]
  );
  const chats = useAppSelector((state) => state.chat.chats);
  const loading = useAppSelector((state) => state.character.loading);
  const { showConfirm, showAlert } = useModal();
  const { is } = useColorTheme();
  const neumorphic = is("neumorphic");
  const terminal = is("terminal");
  const portraitSaveSize = useAppSelector((state) => parseSize(state.settings.portraitSaveSize));
  const portraitResizeEnabled = useAppSelector((state) => state.settings.portraitResizeEnabled);
  // Read once here (not via useAvatarImageSrc per card) since these cards
  // hand-roll their own DisplayImage/CharacterAvatar branching instead of
  // going through CharacterAvatar's imageSrc prop - calling a hook inside
  // the character.map() below would break the Rules of Hooks.
  const alwaysShowInitials = useAppSelector((state) => state.settings.alwaysShowInitials);

  const [gallerySearch, setGallerySearch] = useState("");
  // Whose diary is open (#5), by id so it shows new entries as they arrive.
  const [diaryCharacterId, setDiaryCharacterId] = useState<number | null>(null);
  const diaryCharacter = characters.find((c) => c.id === diaryCharacterId);
  const importCardInputRef = useRef<HTMLInputElement>(null);
  const [importingCard, setImportingCard] = useState(false);
  const [importReviewData, setImportReviewData] = useState<ParsedCharacterCard | null>(null);

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
        : parseCharacterCardText(await file.text());

      if (isPng && (!parsedChar.appearanceImages || parsedChar.appearanceImages.length === 0)) {
        const resized = portraitResizeEnabled
          ? await autoCoverCropToBlob(URL.createObjectURL(file), portraitSaveSize.width, portraitSaveSize.height)
          : file;
        parsedChar.appearanceImages = [await blobToDataUrl(resized)];
      }

      // Hand off to the review dialog instead of saving straight away - lets
      // the user tweak the character (and any lorebook it brought in) by
      // hand or via an AI-assisted rewrite before it's actually added.
      setImportReviewData(parsedChar);
    } catch (err: any) {
      showAlert("Import failed", err?.message || "Failed to import character card.");
    } finally {
      setImportingCard(false);
    }
  };

  const handleConfirmImportReview = async (reviewedChar: ParsedCharacterCard) => {
    setImportReviewData(null);
    try {
      const character = await dispatch(addCharacter(reviewedChar)).unwrap();
      if (character) {
        showAlert("Imported", `Imported "${(character as Character).name}".`);
      }
    } catch (err: any) {
      showAlert("Import failed", err?.message || "Failed to import character card.");
    }
  };

  const filteredCharacters = useMemo(() => {
    const q = gallerySearch.trim().toLowerCase();
    const found = !q ? characters : characters.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q) || c.relationship?.toLowerCase().includes(q) || (c.tags || []).some((t) => t.toLowerCase().includes(q))
    );
    // Recently chatted first (the canvas's default), or by name.
    const lastChat = (id: number) => Math.max(0, ...chats.filter((c) => c.characterIds?.includes(id)).map((c) => c.content?.[c.content.length - 1]?.timestamp || c.timestamp || 0));
    return [...found].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : lastChat(b.id) - lastChat(a.id)));
  }, [characters, gallerySearch, sort, chats]);

  const chattedThisWeek = useMemo(() => {
    const cutoff = Date.now() - WEEK_MS;
    return characters.filter((c) => chats.some((chat) => chat.characterIds?.includes(c.id) && chat.timestamp >= cutoff)).length;
  }, [characters, chats]);

  const renderCharacterMenu = (char: Character) => (
    <DropdownMenuContent align="end">
      {(char.diaryEnabled || (char.diary && char.diary.length > 0)) && (
        <DropdownMenuItem onSelect={() => setDiaryCharacterId(char.id)}>
          <FaBook className="mr-2 h-4 w-4" />
          <span>Read diary</span>
        </DropdownMenuItem>
      )}
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
      <DropdownMenuItem onSelect={() => setResetting(char)}>
        <FaUndo className="mr-2 h-4 w-4" />
        <span>Reset...</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => handleDeleteCharacter(char.id)}
        className="text-destructive focus:text-destructive"
      >
        <FaTrash className="mr-2 h-4 w-4" />
        <span>Delete</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <div className="w-full h-dvh flex flex-col">
      {/* A section of its own (#150): reached from the rail or the tabs, so
          no back button. */}
      <Header
        title="Characters"
        subtitle="Craft a persona to embody, or open one you've already made."
      />
      <div className="flex-1 overflow-auto p-4 md:p-8" style={shell ? { paddingBottom: TAB_BAR_HEIGHT + 16 } : undefined}>
      <div className="w-full max-w-[1180px] mx-auto">

        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div>
            {terminal ? (
              <h2 className="text-[15px] font-bold text-foreground">$ ls -la ~/characters</h2>
            ) : (
              <h2 className="text-[26px] font-bold tracking-tight text-foreground">Your cast</h2>
            )}
            <p className={cn("text-sm text-muted-foreground mt-1", terminal && "text-[11px]")}>
              {terminal && "# "}
              {loading
                ? "Loading..."
                : `${characters.length} character${characters.length === 1 ? "" : "s"}${chattedThisWeek > 0 ? ` · ${chattedThisWeek} chatted with this week` : ""}`}
            </p>
          </div>
          {/* Wraps on a phone, so the toolbar never runs off the screen. */}
          <div className="flex flex-wrap gap-2">
            {characters.length > 0 && terminal && (
              <div className="flex items-center gap-1.5 border border-border px-3 w-[220px] text-[11px] focus-within:border-ring">
                <span className="text-muted-foreground flex-none">grep&gt;</span>
                <input
                  value={gallerySearch}
                  onChange={(e) => setGallerySearch(e.target.value)}
                  placeholder="search"
                  aria-label="Search characters"
                  className="flex-1 min-w-0 bg-transparent outline-none py-2 text-foreground placeholder:text-subtle"
                />
              </div>
            )}
            {characters.length > 0 && !terminal && (
              <div className="relative">
                <FaSearch size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <Input
                  value={gallerySearch}
                  onChange={(e) => setGallerySearch(e.target.value)}
                  placeholder="Search by name or tag"
                  aria-label="Search characters"
                  className="pl-8 text-[13px] w-[220px] bg-card"
                />
              </div>
            )}
            {hasNsfwCharacters && (
              <ToggleSwitch
                checked={showNsfwCharacters}
                onChange={(v) => dispatch(setShowNsfwCharacters(v))}
                label="Show NSFW"
                className="text-xs"
              />
            )}
            <Button
              onClick={() => importCardInputRef.current?.click()}
              variant="outline"
              disabled={importingCard}
              title="Import a Character Card (V2 JSON or PNG) or a WhatsGemini export"
            >
              <FaUpload size={12} /> {importingCard ? "Importing..." : "Import Card"}
            </Button>
            {/* The relationship map (#138): who knows whom, and each bond with you. */}
            <Button onClick={() => setMapOpen(true)} variant="outline">
              <FaProjectDiagram size={12} /> Relationship map
            </Button>
            {/* Worlds (#143): bring someone in from another world. */}
            {worldCount > 0 && (
              <Button onClick={() => setJoinOpen(true)} variant="outline">
                <FaPlus size={12} /> From another world
              </Button>
            )}
            <JoinWorldDialog open={joinOpen} onOpenChange={setJoinOpen} />
            <ResetDialog
              open={Boolean(resetting)}
              onOpenChange={(open) => !open && setResetting(null)}
              title={`Reset ${resetting?.name || ""}?`}
              description={`${resetting?.name || "They"} forget everything: memories and facts, statuses, letters, gifts, moods and diary. Their card (look, personality, prompt) stays.`}
              options={[{ id: "chats", label: `Also delete your chats with ${resetting?.name || "them"}` }]}
              onReset={async (choices) => {
                if (resetting) await dispatch(resetCharacterLife({ characterId: resetting.id, deleteChats: choices.chats }));
              }}
            />
            <Dialog open={mapOpen} onOpenChange={setMapOpen}>
              <DialogContent size="lg" className="overflow-y-auto">
                <DialogTitle>Relationship map</DialogTitle>
                <RelationshipMap />
              </DialogContent>
            </Dialog>
            <input
              type="file"
              ref={importCardInputRef}
              onChange={handleImportCardFileSelected}
              accept=".json,application/json,.png,image/png"
              style={{ display: "none" }}
            />
            {terminal ? (
              <Button onClick={() => navigate("/characters/new")} variant="outline" className="border-border-bright text-foreground">
                + new character
              </Button>
            ) : (
              <Button onClick={() => navigate("/characters/quick")} variant="default">
                <FaPlus size={12} /> New character
              </Button>
            )}
          </div>
        </div>

        {!terminal && (everyone.length > 0) && (
          <div className="-mt-2 mb-5 flex flex-wrap items-center gap-2">
            {worldTotal > 0 && (
              <div role="group" aria-label="Whose characters" className="flex gap-2">
                <button type="button" aria-pressed={scope === "world"} onClick={() => setScope("world")} className={cn("h-9 rounded-full px-3.5 text-[13px] font-semibold", scope === "world" ? "bg-primary/15 text-primary-text ring-1 ring-inset ring-primary" : "bg-raised text-foreground ring-1 ring-inset ring-border")}>In this world · {worldCharacters.length}</button>
                <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")} className={cn("h-9 rounded-full px-3.5 text-[13px] font-semibold", scope === "all" ? "bg-primary/15 text-primary-text ring-1 ring-inset ring-primary" : "bg-raised text-foreground ring-1 ring-inset ring-border")}>All worlds · {everyone.length}</button>
              </div>
            )}
            <span className="flex-1" />
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              Sort
              <select aria-label="Sort characters" value={sort} onChange={(e) => setSort(e.target.value as "recent" | "name")} className="h-9 rounded-lg bg-raised px-2 text-[13px] font-semibold text-foreground ring-1 ring-inset ring-border">
                <option value="recent">Recently chatted</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
        )}

        {!loading && characters.length === 0 ? (
          <Card className={cn("p-6 text-center flex flex-col items-center gap-3", neumorphic && "surface-sunken")}>
            <p className="text-muted-foreground">{allCharacters.length > 0 ? "Your characters are all NSFW and hidden. Turn on Show NSFW to see them." : "No characters created yet."}</p>
            <p className="text-sm text-muted-foreground">Create your own, or jump straight into a chat with a ready-made one.</p>
            <div className="flex flex-wrap justify-center gap-2.5">
              <Button onClick={() => navigate("/characters/new")} variant="outline" className="h-auto px-4 py-2.5 font-semibold text-sm">
                Create your own
              </Button>
              <Button onClick={() => navigate("/characters/new", { state: { fromIdea: true } })} variant="outline" className="h-auto px-4 py-2.5 font-semibold text-sm">
                Create from an idea
              </Button>
              <Button onClick={handleTrySampleCharacter} variant="default" className="h-auto px-4 py-2.5 font-semibold text-sm">
                Try a sample character
              </Button>
            </div>
          </Card>
        ) : filteredCharacters.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground text-sm">No characters match "{gallerySearch}".</Card>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${terminal ? 170 : 200}px, 1fr))` }}>
            {filteredCharacters.map((char) => {
              const charAccent = char.accent ?? CHARACTER_SWATCHES[0];
              const cardImageSrc = alwaysShowInitials ? undefined : avatarOf(char);
              if (terminal) {
                return (
                  <div key={char.id} className="border border-border hover:border-border-bright transition-colors flex flex-col min-w-0">
                    <div className="relative aspect-square m-2.5 border border-border-bright overflow-hidden flex items-center justify-center">
                      {cardImageSrc ? (
                        <NsfwBlur active={blurNsfwMedia && isNsfwCharacter(char)} className="w-full h-full"><DisplayImage srcContext={cardImageSrc} alt={char.name} className="w-full h-full object-cover" /></NsfwBlur>
                      ) : (
                        <CharacterAvatar name={char.name} accent={char.accent} size={72} />
                      )}
                    </div>
                    <div className="px-3 pb-3.5 flex flex-col gap-1.5 min-w-0">
                      {char.relationship && (
                        <span className="self-start max-w-full truncate text-[9px] font-bold px-2 py-0.5 bg-primary text-primary-foreground">
                          {char.relationship}
                        </span>
                      )}
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="text-[13px] font-bold text-foreground truncate">{char.name}</div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <TermLink label="..." aria-label={`More options for ${char.name}`} className="flex-none" />
                          </DropdownMenuTrigger>
                          {renderCharacterMenu(char)}
                        </DropdownMenu>
                      </div>
                      {char.description && <div className="text-[10px] text-muted-foreground truncate"># {char.description}</div>}
                      <div className="flex gap-1.5 mt-1.5">
                        <Button onClick={() => handleChatWithCharacter(char)} variant="outline" className="flex-1 h-auto py-1.5 px-1 text-[10px]">
                          chat
                        </Button>
                        <Button onClick={() => navigate(`/characters/${char.id}/edit`)} variant="outline" className="h-auto py-1.5 px-2.5 text-[10px]" title="Edit Character">
                          edit
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }
              // #155: the canvas's card - a colour (or their portrait) up top
              // with a status badge, then who they are, their life, and Message.
              const main = chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === char.id && !c.whatIf);
              const badge = !main ? "Not met" : main.archived ? "Archived" : main.muted ? "Muted" : undefined;
              const life = LIFE_PRESETS.find((p) => p.id === presetOf(lifeOf(char)))?.name || "Custom life";
              return (
              <article key={char.id} aria-label={char.name} className="flex flex-col overflow-hidden rounded-card bg-card shadow-soft ring-1 ring-inset ring-border transition hover:ring-primary/40">
                <div className="relative flex h-[120px] items-end p-3" style={{ background: charAccent[0] }}>
                  {cardImageSrc ? (
                    <NsfwBlur active={blurNsfwMedia && isNsfwCharacter(char)} className="absolute inset-0"><DisplayImage srcContext={cardImageSrc} alt={char.name} className="h-full w-full object-cover" /></NsfwBlur>
                  ) : (
                    <span aria-hidden className="text-[64px] font-bold leading-none tracking-[-0.03em] text-white/90">{char.name.trim().charAt(0).toUpperCase()}</span>
                  )}
                  {badge && <span className="absolute right-2.5 top-2.5 rounded-md bg-black/45 px-2 py-0.5 text-[11.5px] font-bold text-white">{badge}</span>}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 px-3.5 pb-3.5 pt-3">
                  <div className="flex min-w-0 flex-col">
                    <h4 className="truncate text-[15px] font-bold text-foreground">{char.name}</h4>
                    <span className="truncate text-[12.5px] text-muted-foreground">{[char.relationship, char.description].filter(Boolean).join(" · ")}</span>
                  </div>
                  <span className="truncate text-[12px] text-subtle">{life}</span>
                  <div className="mt-auto flex gap-1.5 pt-1">
                    <Button onClick={() => handleChatWithCharacter(char)} variant="secondary" size="sm" className="h-9 flex-1 font-semibold">
                      {main ? "Message" : "Start chat"}
                    </Button>
                    <Button onClick={() => navigate(`/characters/${char.id}/edit`)} variant="ghost" size="icon" className="h-9 w-9" title="Edit character" aria-label={`Edit ${char.name}`}>
                      <FaEdit size={13} />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9" title="More options" aria-label={`More options for ${char.name}`}>
                          <FaEllipsisV size={13} />
                        </Button>
                      </DropdownMenuTrigger>
                      {renderCharacterMenu(char)}
                    </DropdownMenu>
                  </div>
                </div>
              </article>
            )})}
            {terminal ? (
              <button
                type="button"
                onClick={() => navigate("/characters/new")}
                className="border border-dashed border-border hover:border-border-bright min-h-[190px] flex flex-col items-center justify-center gap-1 text-center transition-colors"
              >
                <span className="text-[12px] font-bold text-foreground">[+] new character</span>
                <span className="text-[10px] text-muted-foreground"># define who Gemini becomes</span>
              </button>
            ) : (
            <button
              type="button"
              onClick={() => navigate("/characters/quick")}
              className="flex min-h-[250px] flex-col items-center justify-center gap-2.5 rounded-card text-muted-foreground ring-[1.5px] ring-inset ring-border-strong transition-colors hover:ring-primary"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary-text"><FaPlus size={18} /></span>
              <span className="text-[15px] font-bold text-foreground">New character</span>
              <span className="max-w-[180px] text-center text-[12.5px] text-subtle">Describe them in a line, chat in a minute</span>
            </button>
            )}
          </div>
        )}

      </div>
      </div>
      {/* Character diary (#5), newest entry first */}
      <Dialog open={diaryCharacter != null} onOpenChange={(open) => { if (!open) setDiaryCharacterId(null); }}>
        <DialogContent aria-describedby={undefined}>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>{diaryCharacter?.name}'s diary</DialogTitle>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Close</Button>
            </DialogClose>
          </div>
          <div className="overflow-y-auto flex flex-col gap-4 pr-1">
            {!diaryCharacter?.diary?.length ? (
              <p className="text-sm text-muted-foreground">
                No entries yet. {diaryCharacter?.name} writes one every {DIARY_INTERVAL} messages in chats that share their memory.
              </p>
            ) : (
              [...diaryCharacter.diary].reverse().map((entry) => (
                <article key={entry.id} className="border-l-2 border-primary/40 pl-3">
                  <div className="text-[11px] uppercase tracking-wide text-subtle mb-1">
                    {new Date(entry.timestamp).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  </div>
                  <p className="font-serif text-[15px] leading-relaxed whitespace-pre-line">{entry.text}</p>
                </article>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ImportReviewDialog
        isOpen={importReviewData !== null}
        onClose={() => setImportReviewData(null)}
        data={importReviewData}
        onConfirm={handleConfirmImportReview}
      />
    </div>
  );
};

export default CharacterPage;
