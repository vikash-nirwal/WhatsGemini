import { buildContactDirective, contactIdea, extractContact, stripStreamingContact } from "./sharedContacts";

describe("shared contacts (#128)", () => {
  it("reads a contact card at the end of a reply", () => {
    expect(extractContact("You two would get along.\n[Contact: Lena — my sister, a nurse]")).toEqual({ text: "You two would get along.", contact: { name: "Lena", about: "my sister, a nurse" } });
    expect(extractContact("[Contact: Marco | the mechanic I trust]").contact).toEqual({ name: "Marco", about: "the mechanic I trust" });
    expect(extractContact("No card")).toEqual({ text: "No card" });
    expect(stripStreamingContact("Here.\n[Contact: Le")).toBe("Here.");
  });

  it("drafts the contact from the card and the sender's world", () => {
    const idea = contactIdea({ name: "Lena", about: "my sister, a nurse" }, { name: "Aria", description: "A mechanic in Lisbon.", scenario: "" });
    expect(idea).toContain("Lena, my sister, a nurse. Someone from Aria's life");
    expect(buildContactDirective("Aria", "Sam")).toContain("[Contact: their name — who they are to Aria]");
  });
});
