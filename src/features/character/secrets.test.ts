import { Character, CharacterSecret, Chat } from "../../types";
import { buildSecretsSection, conditionMet, describeCondition, extractSecretTag, secretsInPlay, stripStreamingSecretTag } from "./secrets";

const secret = (id: string, extra: Partial<CharacterSecret>): CharacterSecret => ({ id, text: `Secret ${id}`, reveal: "asked", ...extra });
const aria = (secrets: CharacterSecret[]) => ({ id: 1, name: "Aria", secrets } as unknown as Character);
const chat = (extra: Partial<Chat> = {}) => ({ id: 1, content: [], ...extra } as unknown as Chat);

describe("secrets", () => {
  it("knows when a stage or trust secret's time has come", () => {
    const stage = secret("s", { reveal: "stage", stage: "dating" });
    expect(conditionMet(stage, chat({ stage: "flirting" }))).toBe(false);
    expect(conditionMet(stage, chat({ stage: "intimate" }))).toBe(true);
    expect(conditionMet(stage, chat())).toBe(false);
    const trust = secret("t", { reveal: "trust", trust: 60 });
    expect(conditionMet(trust, chat({ sceneState: { trust: 59 } }))).toBe(false);
    expect(conditionMet(trust, chat({ sceneState: { meters: { trust: 60 } } }))).toBe(true);
    expect(describeCondition(trust)).toBe("once trust reaches 60");
  });

  it("offers at most one ready secret, then the ask-only ones, and skips told ones", () => {
    const secrets = [secret("a", { reveal: "stage", stage: "strangers" }), secret("b", { reveal: "stage", stage: "strangers" }), secret("c", {}), secret("d", { reveal: "trust", trust: 90 })];
    const inPlay = secretsInPlay(aria(secrets), chat({ stage: "flirting", revealedSecrets: ["c"] }));
    expect(inPlay.revealable.map((s) => s.id)).toEqual(["a"]);
    expect(inPlay.hidden.map((s) => s.id)).toEqual(["b", "d"]);
  });

  it("tells the character to hint at hidden secrets and how to tag a told one", () => {
    const section = buildSecretsSection("Aria", "Sam", secretsInPlay(aria([secret("a", { text: "She sang in a band" }), secret("b", { reveal: "stage", stage: "dating", text: "She's afraid of the dark" })]), chat()))!;
    expect(section).toContain("- She's afraid of the dark");
    expect(section).toContain("1. She sang in a band (only if Sam asks you about it directly)");
    expect(section).toContain("[Secret revealed: 1]");
    expect(buildSecretsSection("Aria", "Sam", { hidden: [], revealable: [] })).toBeUndefined();
  });

  it("strips the tag wherever it is", () => {
    expect(extractSecretTag("Fine. I sang in a band.\n[Secret revealed: 2]")).toEqual({ text: "Fine. I sang in a band.", secretRevealed: 2 });
    expect(extractSecretTag("[Secret revealed] So, yes.")).toEqual({ text: "So, yes.", secretRevealed: 1 });
    expect(extractSecretTag("Nothing here.")).toEqual({ text: "Nothing here." });
    expect(stripStreamingSecretTag("I sang in a band.\n[Secr")).toBe("I sang in a band.");
  });
});
