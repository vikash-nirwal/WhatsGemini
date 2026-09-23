import { applyMacros, getGreetings } from "./macros";
import { Character } from "../../../types";

describe("applyMacros", () => {
  it("replaces {{char}}/{{user}} and the legacy <BOT>/<USER>, case-insensitively", () => {
    expect(applyMacros("{{char}} waves at {{User}}. <BOT> smiles at <user>.", { char: "Mira", user: "Arin" }))
      .toBe("Mira waves at Arin. Mira smiles at Arin.");
  });

  it("leaves a macro untouched when that name is unknown", () => {
    expect(applyMacros("{{char}} and {{user}}", { char: "Mira" })).toBe("Mira and {{user}}");
  });
});

describe("getGreetings", () => {
  it("lists first_mes then non-blank alternates", () => {
    const c = { id: 1, name: "M", description: "", prompt: "", first_mes: "Hi.", alternateGreetings: ["", "Yo."] } as Character;
    expect(getGreetings(c)).toEqual(["Hi.", "Yo."]);
  });

  it("still works when only alternates exist", () => {
    const c = { id: 1, name: "M", description: "", prompt: "", alternateGreetings: ["Yo."] } as Character;
    expect(getGreetings(c)).toEqual(["Yo."]);
  });
});
