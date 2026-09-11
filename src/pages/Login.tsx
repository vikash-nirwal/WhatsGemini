import React, { useState, useContext, useCallback } from "react";
import { useSelector } from "react-redux";
import { AuthContext } from "../contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { FaExternalLinkAlt, FaLock } from "react-icons/fa";
import Logo from "src/components/atoms/Logo";
import { TextInput, Select } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { useAppDispatch } from "../store/hooks";
import { RootState } from "../store/store";
import { setChatProvider, setOllamaBaseUrl } from "../features/settingsSlice";
import { CHAT_PROVIDER_META, CHAT_PROVIDERS } from "../features/ai/providers/registry";

const Login = () => {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { saveApiKey, isConfigured, authChecked, chatProvider } = useContext(AuthContext);
  const dispatch = useAppDispatch();
  const ollamaBaseUrl = useSelector((state: RootState) => state.settings.ollamaBaseUrl);
  const capabilities = CHAT_PROVIDERS[chatProvider]?.capabilities;

  const handleLogin = useCallback(async () => {
    setError(null);

    if (!key.trim()) {
      setError("API key is required.");
      return;
    }

    setLoading(true);

    try {
      await saveApiKey(key);
    } catch (err) {
      console.error("Error saving API key:", err);
      setError("Failed to save API key. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [key, saveApiKey]);

  if (!authChecked) {
    return null;
  }

  if (isConfigured) {
    return <Navigate to="/" />;
  }

  return (
    <div className="relative flex items-center justify-center h-screen bg-background overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(45% 55% at 20% 80%, rgb(var(--primary) / 0.16), transparent 70%), radial-gradient(40% 50% at 85% 15%, rgb(var(--secondary) / 0.5), transparent 70%)",
        }}
      />
      <Card className="relative p-9 w-96 max-w-[calc(100%-30px)] rounded-2xl shadow-strong">
        <Logo
          size={52}
          className="rounded-2xl shadow-[0_10px_26px_rgb(var(--primary)/0.4)] mx-auto mb-5 block"
        />
        <h2 className="text-xl font-bold text-center text-foreground mb-1.5">
          Welcome to WhatsGemini
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-4">
          Chat with characters powered by your choice of AI provider.
        </p>

        <label className="block text-xs text-muted-foreground mb-1.5">AI provider</label>
        <Select
          value={chatProvider}
          onChange={(e) => dispatch(setChatProvider(e.target.value))}
          className="mb-4"
        >
          {CHAT_PROVIDER_META.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>

        {error && <p className="text-red-500 text-sm text-center mb-4">{error}</p>}

        {capabilities?.requiresBaseUrl ? (
          <>
            <label className="block text-xs text-muted-foreground mb-1.5">Ollama server URL</label>
            <TextInput
              type="text"
              value={ollamaBaseUrl}
              onChange={(e) => dispatch(setOllamaBaseUrl(e.target.value))}
              placeholder="http://localhost:11434/v1"
              className="mb-2"
            />
            <p className="text-xs text-ink-faint mb-4">
              No API key needed for a local Ollama install - you'll be taken straight in.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted-foreground">API key</label>
              {chatProvider === "gemini" && (
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Get a free key <FaExternalLinkAlt size={9} />
                </a>
              )}
            </div>
            <TextInput
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste your API key here..."
              className="mb-2"
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />

            <p className="flex items-center gap-1.5 text-[11.5px] text-ink-faint mb-4">
              <FaLock size={9} className="flex-shrink-0" />
              Stored encrypted, only on this device - never sent anywhere but the provider's API.
            </p>

            <Button
              onClick={handleLogin}
              size="lg"
              className="w-full shadow-lg transition-all hover:scale-[1.02]"
              disabled={loading || !key.trim()}
            >
              {loading ? "Saving..." : "Save & Continue"}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
};

export default Login;
