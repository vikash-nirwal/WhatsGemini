import { addSecret, buildSecretsNote, parseSecret, pickGossip, pickSecretPair, secretsYouKnowAbout } from "./secrets";
import { Character, Chat } from "../../types";

const aria = { id: 1, name: "Aria", ties: [{ withId: 2, tie: "your brother" }] } as Character;
const bram = { id: 2, name: "Bram", ties: [{ withId: 1, tie: "your sister" }] } as Character;
const cleo = { id: 3, name: "Cleo", ties: [{ withId: 1, tie: "your friend" }] } as Character;

test("a secret is between two tied people; someone tied to the keeper you chat with may gossip", () => {
  expect(pickSecretPair([aria, bram, cleo], () => 0)).toEqual({ keeper: aria, from: bram });
  const chats = [{ id: 1, characterIds: [3], content: [] }] as unknown as Chat[];
  expect(pickGossip([aria, bram, cleo], chats, aria, bram)).toBe(cleo);
  expect(pickGossip([aria, bram, cleo], [], aria, bram)).toBeUndefined();
});

test("the reply is read leniently", () => {
  expect(parseSecret("SECRET: Aria sold the family boat.\nGOSSIP: ok don't tell anyone\nbut Aria sold the boat")).toEqual({ secret: "Aria sold the family boat.", gossip: "ok don't tell anyone\nbut Aria sold the boat" });
  expect(parseSecret("**SECRET:** Aria is leaving town.")).toEqual({ secret: "Aria is leaving town." });
  expect(parseSecret("nothing")).toBeUndefined();
});

test("the keeper's prompt knows; you see what you heard and haven't told", () => {
  const keeper = addSecret(aria, { id: "s1", fromId: 2, text: "Aria sold the boat.", at: 0, heardFrom: 3 });
  expect(buildSecretsNote(keeper, [keeper, bram], "Sam")).toContain("- From Bram: Aria sold the boat.");
  expect(secretsYouKnowAbout(bram, [keeper, bram])).toHaveLength(1);
  const told = { ...keeper, keptSecrets: keeper.keptSecrets!.map((s) => ({ ...s, toldAt: 5 })) };
  expect(secretsYouKnowAbout(bram, [told, bram])).toHaveLength(0);
  expect(buildSecretsNote(told, [told, bram], "Sam")).toBeUndefined();
});

test("an old secret can come out on its own, and both sides remember how (#184)", () => {
  const { secretReadyToSurface, surfacedFacts } = require("./secrets");
  const DAY = 86_400_000;
  const keeper = { id: 1, name: "Aria", keptSecrets: [{ id: "s", fromId: 2, text: "Aria sold the boat.", at: 0 }] };
  expect(secretReadyToSurface([keeper], 8 * DAY, 7 * DAY, () => 0)).toEqual({ keeper, secret: keeper.keptSecrets[0] });
  expect(secretReadyToSurface([keeper], 3 * DAY, 7 * DAY, () => 0)).toBeUndefined();
  expect(secretReadyToSurface([keeper], 8 * DAY, 7 * DAY, () => 0.9)).toBeUndefined();
  expect(secretReadyToSurface([{ ...keeper, keptSecrets: [{ ...keeper.keptSecrets[0], outAt: 1 }] }], 8 * DAY, 7 * DAY, () => 0)).toBeUndefined();
  const facts = surfacedFacts("Aria", "Kai", "Aria sold the boat.", "found out");
  expect(facts.forFrom).toBe("You found out what Aria had been hiding from you: Aria sold the boat.");
  expect(facts.timeline).toBe("Kai found out what Aria was hiding");
});
