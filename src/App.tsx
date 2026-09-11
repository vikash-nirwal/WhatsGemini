import React, { useContext, useEffect, useState, lazy, Suspense } from "react";
import { HashRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Provider } from "react-redux";
import { AuthProvider, AuthContext } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ModalProvider } from "./contexts/ModalContext";
import { SidebarProvider, useSidebar } from "./contexts/SidebarContext";
import store from "./store/store";
import { useAppDispatch, useAppSelector } from "./store/hooks";
import { fetchChats, addChat } from "./features/chatSlice";
import { fetchCharacters, addCharacter } from "./features/characterSlice";
import { LS_FONT_SIZE, LS_FIRST_USED_AT, SAMPLE_CHARACTER } from "./utils/constants";

import Sidebar from "src/components/organisms/Sidebar";
import Header from "src/components/organisms/Header";
import ServiceWorkerUpdater from "src/components/molecules/ServiceWorkerUpdater";
import BackupReminderBanner from "src/components/molecules/BackupReminderBanner";
import Logo from "src/components/atoms/Logo";
import { TooltipProvider } from "src/components/atoms/tooltip";
import { Toaster } from "src/components/atoms/sonner";
import { Button } from "src/components/atoms/button";

const ChatPage = lazy(() => import("./pages/ChatPage"));
const Login = lazy(() => import("./pages/Login"));
const CharacterPage = lazy(() => import("./pages/CharacterPage"));
const CharacterEditorPage = lazy(() => import("./pages/CharacterEditorPage"));
const CharacterGalleryPage = lazy(() => import("./pages/CharacterGalleryPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));


const PageLoader = () => (
  <div className="flex items-center justify-center h-full">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

// Rendered at "/" (no chat selected). On mobile the sidebar is off-screen until
// opened via the hamburger, so this still needs its own Header - without it,
// there'd be no way to get back to the chat list on a phone.
//
// For a brand-new user (no characters yet) this doubles as the first-run
// screen, since there's nothing else to select from the sidebar - a bare
// "select a chat" message would just be a dead end.
const EmptyChatState = () => {
  const { open } = useSidebar();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const characters = useAppSelector((state) => state.character.characters);
  const charactersLoading = useAppSelector((state) => state.character.loading);
  const [creatingSample, setCreatingSample] = useState(false);
  const isFirstRun = !charactersLoading && characters.length === 0;

  const handleTrySample = async () => {
    setCreatingSample(true);
    try {
      const character = await dispatch(addCharacter(SAMPLE_CHARACTER)).unwrap();
      const chat = await dispatch(addChat({ title: character.name, characterIds: [character.id] })).unwrap();
      if (chat?.id) navigate(`/chat/${chat.id}`);
    } catch (err) {
      console.error("Failed to create sample character:", err);
      setCreatingSample(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-screen">
      <Header title="WhatsGemini" subtitle={isFirstRun ? "Welcome!" : "Select a chat to get started"} />
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground px-6 text-center">
        {isFirstRun ? (
          <>
            <Logo size={48} className="shadow-lg shadow-primary/30 rounded-[13px] mb-1" />
            <div>
              <h2 className="text-lg font-bold text-foreground mb-1.5">Welcome to WhatsGemini</h2>
              <p className="text-sm max-w-[360px]">
                Create a character - a persona for Gemini to embody - then start chatting. Not sure where to start?
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 mt-1">
              <Button
                variant="default"
                onClick={handleTrySample}
                disabled={creatingSample}
                className="px-4 py-2.5 h-auto"
              >
                {creatingSample ? "Creating..." : "Try a sample character"}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/characters/new")}
                className="px-4 py-2.5 h-auto bg-muted hover:border-primary hover:text-primary hover:bg-muted"
              >
                Create your own
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm">Select a chat from the sidebar to continue a conversation.</p>
            <Button
              variant="default"
              onClick={open}
              className="md:hidden px-4 py-2.5 h-auto"
            >
              Browse chats
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

const AppContent = () => {
  const { isConfigured, authChecked } = useContext(AuthContext);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        await dispatch(fetchChats()).unwrap();
        await dispatch(fetchCharacters()).unwrap();
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load chats and characters. Please try again.");
      }
    };

    fetchData();

    // Apply font size
    const fontSize = localStorage.getItem(LS_FONT_SIZE) || "16px";
    document.documentElement.style.setProperty('--chat-font-size', fontSize);

    // Marks when this browser first saw an authenticated user - the backup
    // reminder falls back to this when there's no backup yet, so a fresh
    // install doesn't get nagged on day one.
    if (!localStorage.getItem(LS_FIRST_USED_AT)) {
      localStorage.setItem(LS_FIRST_USED_AT, String(Date.now()));
    }
  }, [dispatch]);

  // Global Shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        try {
          const result = await dispatch(addChat({ title: "New Chat" })).unwrap();
          if (result && result.id) {
            navigate(`/chat/${result.id}`);
          }
        } catch (err) {
          console.error("Failed to create new chat:", err);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispatch, navigate]);

  // Wait for the stored API key to finish decrypting before deciding whether
  // to redirect - otherwise every reload would flash the login page first.
  if (!authChecked) {
    return <PageLoader />;
  }

  if (!isConfigured) {
    return <Navigate to="/login" />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen text-foreground font-sans">
      <div className="flex flex-col h-screen w-full">
        <BackupReminderBanner />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="app-main flex-1 bg-background relative z-1 min-w-0">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/chat/:chatId" element={<ChatPage />} />
                <Route path="/characters" element={<CharacterPage />} />
                <Route path="/characters/new" element={<CharacterEditorPage />} />
                <Route path="/characters/:characterId/edit" element={<CharacterEditorPage />} />
                <Route path="/characters/:characterId/gallery" element={<CharacterGalleryPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/" element={<EmptyChatState />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
};

const App = () => (
  <Provider store={store}>
    <ServiceWorkerUpdater />
    <AuthProvider>
      <ThemeProvider>
        <TooltipProvider delayDuration={300}>
          <ModalProvider>
            <SidebarProvider>
              <HashRouter>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="*" element={<AppContent />} />
                  </Routes>
                </Suspense>
              </HashRouter>
            </SidebarProvider>
          </ModalProvider>
        </TooltipProvider>
        <Toaster position="bottom-right" />
      </ThemeProvider>
    </AuthProvider>
  </Provider>
);

export default App;
