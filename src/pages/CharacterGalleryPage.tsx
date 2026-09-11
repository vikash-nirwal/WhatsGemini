import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { fetchCharacterById } from "../features/characterSlice";
import { fetchChats } from "../features/chatSlice";
import { FaTimes, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "src/components/molecules/dialog";
import Header from "src/components/organisms/Header";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Button } from "src/components/atoms/button";

const CharacterGalleryPage = () => {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const characterIdNum = characterId ? Number(characterId) : null;

  const characters = useAppSelector((state) => state.character.characters);
  const character = characters.find(c => c.id === characterIdNum);
  const loading = useAppSelector((state) => state.character.loading);
  const chats = useAppSelector((state) => state.chat.chats);

  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    if (characterIdNum) {
      dispatch(fetchCharacterById(characterIdNum));
      dispatch(fetchChats());
    }
  }, [dispatch, characterIdNum]);

  const goBackInfo = () => {
    navigate(-1);
  };

  const images = useMemo(() => {
    if (!character) return [];

    // Get explicitly saved gallery images
    const galleryImages = character.gallery || [];

    // Also find any images generated in previous chats this character was part of
    const chatImages = chats
      .filter(chat => chat.characterIds?.includes(characterIdNum as number))
      .flatMap(chat => chat.content)
      .flatMap(msg => msg.images || []);

    // Combine and remove duplicates
    return Array.from(new Set([...galleryImages, ...chatImages]));
  }, [character, chats, characterIdNum]);

  const currentIndex = selectedImage ? images.indexOf(selectedImage) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex !== -1 && currentIndex < images.length - 1;

  const handlePrev = React.useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (hasPrev) setSelectedImage(images[currentIndex - 1]);
  }, [hasPrev, images, currentIndex]);

  const handleNext = React.useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (hasNext) setSelectedImage(images[currentIndex + 1]);
  }, [hasNext, images, currentIndex]);

  useEffect(() => {
    // Radix Dialog already handles Escape; only arrow-key nav needs a listener here.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedImage) return;
      if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    if (selectedImage) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedImage, handlePrev, handleNext]);

  if (loading && !character) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading gallery...</div>;
  }

  if (!character) {
    return (
      <div className="flex flex-col h-screen items-center justify-center text-foreground">
        <h2 className="text-2xl font-medium mb-4">Character not found</h2>
        <Button variant="link" onClick={() => navigate('/characters')} className="h-auto p-0 text-primary">Return to Characters</Button>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col relative">
      <Header
        title={`${character.name}'s Gallery`}
        avatar={<CharacterAvatar name={character.name} accent={character.accent} size={34} />}
        onBack={goBackInfo}
      />
      {/* Fullscreen Image Viewer */}
      <Dialog open={selectedImage !== null} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent size="full">
          <DialogTitle asChild>
            <span className="sr-only">{character.name}'s gallery image</span>
          </DialogTitle>
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 h-auto w-auto p-2 text-white hover:text-white bg-black/50 hover:bg-black/80 rounded-full z-10"
            >
              <FaTimes size={24} />
            </Button>
          </DialogClose>

          {hasPrev && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 md:left-8 h-auto w-auto p-3 text-white hover:text-white bg-black/50 hover:bg-black/80 rounded-full z-10"
              onClick={handlePrev}
              title="Previous (Left Arrow)"
            >
              <FaChevronLeft size={24} />
            </Button>
          )}

          {selectedImage && (
            <DisplayImage
              srcContext={selectedImage}
              alt="Fullscreen generated"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl"
            />
          )}

          {hasNext && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 md:right-8 h-auto w-auto p-3 text-white hover:text-white bg-black/50 hover:bg-black/80 rounded-full z-10"
              onClick={handleNext}
              title="Next (Right Arrow)"
            >
              <FaChevronRight size={24} />
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex-1 overflow-auto p-4 md:p-8">
      <div className="w-full max-w-5xl mx-auto bg-transparent">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {character.name}'s Gallery
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Images generated in conversation with {character.name}.</p>
        </div>

        {/* Gallery Grid */}
        {images.length === 0 ? (
          <div className="text-center mt-20 text-muted-foreground">
            <p>No images in gallery yet.</p>
            <p className="text-sm mt-2">Images generated by this character will appear here automatically.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pb-20">
            {images.map((src, idx) => (
              <div
                key={idx}
                className="relative aspect-square w-full rounded-lg overflow-hidden bg-muted border border-border shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setSelectedImage(src)}
              >
                <DisplayImage srcContext={src} alt={`${character.name} generated image ${idx + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default CharacterGalleryPage;
