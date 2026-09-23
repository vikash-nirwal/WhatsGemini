import React, { useState } from "react";
import { LS_AGE_CONFIRMED } from "src/utils/constants";
import { Button } from "src/components/atoms/button";
import Logo from "src/components/atoms/Logo";

const readConfirmed = () => {
  try {
    return localStorage.getItem(LS_AGE_CONFIRMED) === "true";
  } catch {
    return false;
  }
};

// One-time 18+ confirmation shown before anything else, since the app can be
// used for mature fiction. Declining shows a stop screen rather than the app.
const AgeGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [confirmed, setConfirmed] = useState(readConfirmed);
  const [declined, setDeclined] = useState(false);

  if (confirmed) return <>{children}</>;

  const confirm = () => {
    try {
      localStorage.setItem(LS_AGE_CONFIRMED, "true");
    } catch {
      // Storage blocked (private mode): confirm for this session only.
    }
    setConfirmed(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-[420px] flex flex-col items-center gap-4 text-center">
        <Logo />
        {declined ? (
          <p className="text-sm text-muted-foreground">This app is only for adults. You can close this tab.</p>
        ) : (
          <>
            <h1 className="text-lg font-bold">Adults only</h1>
            <p className="text-sm text-muted-foreground">
              WhatsGemini can be used for mature fiction, including sexual content between adult characters. Confirm you are 18 or older (or the age of majority where you live) to continue.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDeclined(true)}>I'm under 18</Button>
              <Button onClick={confirm}>I'm 18 or older</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AgeGate;
