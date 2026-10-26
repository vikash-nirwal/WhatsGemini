import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Header from "src/components/organisms/Header";
import { Button } from "src/components/atoms/button";
import { TextInput } from "src/components/molecules/form-controls";
import { useAppDispatch } from "src/store/hooks";
import { decodeWorldLink, linkTarget, readWorldFile, WorldFile } from "src/features/world/worldFile";
import { importWorld } from "src/features/world/importWorld";

// Opening a shared world (#197): from a share link (the world is in it), or
// a pasted link to a world file hosted anywhere that allows it.
const WorldImportPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const location = useLocation();
  const [file, setFile] = useState<WorldFile | undefined>();
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const open = async (input: string) => {
    setError(undefined);
    const { code, url } = linkTarget(input);
    try {
      if (code) setFile(await decodeWorldLink(code));
      else if (url) setFile(readWorldFile(await (await fetch(url)).text()));
      else setError("That isn't a link to a world.");
    } catch {
      setError("Couldn't open that world. The link may be cut short, or the site doesn't allow it.");
    }
  };
  useEffect(() => {
    const code = new URLSearchParams(location.search).get("w");
    if (code) void open(`?w=${code}`);
  }, [location.search]);

  const bringIn = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const world = await dispatch(importWorld(file));
      toast.success(`${world.name} imported, with its people`);
      navigate("/worlds");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import that world.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-dvh w-full flex-col">
      <Header title="Open a shared world" onBack={() => navigate("/worlds")} />
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
          {!file && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void open(pasted); }}>
              <TextInput aria-label="World link" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste a world link" className="min-w-0 flex-1" />
              <Button type="submit" disabled={!pasted.trim()}>Open</Button>
            </form>
          )}
          {error && <p role="alert" className="text-[14px] text-destructive">{error}</p>}
          {file && (
            <section aria-label="Shared world" className="flex flex-col gap-2 rounded-card bg-raised p-4 ring-1 ring-inset ring-border">
              <h2 className="font-serif text-[22px] font-semibold text-foreground">{file.world.name}</h2>
              <p className="text-[14px] text-muted-foreground">{file.world.premise}</p>
              <p className="text-[13px] text-subtle">{file.cast.length} {file.cast.length === 1 ? "person" : "people"}: {file.cast.map((c) => c.name).join(", ")}</p>
              <Button type="button" disabled={busy} onClick={() => void bringIn()}>{busy ? "Importing..." : "Import this world"}</Button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorldImportPage;
