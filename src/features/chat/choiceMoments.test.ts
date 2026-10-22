import { CHOICE_MOMENT_DIRECTIVE, splitChoiceMoment } from "./choiceMoments";
import { stripStreamingTags } from "../ai/utils/messageTags";

describe("choice moments (#87)", () => {
  it("asks for options only at turning points", () => {
    expect(CHOICE_MOMENT_DIRECTIVE).toContain("only at a real turning point");
    expect(CHOICE_MOMENT_DIRECTIVE).toContain("<<<CHOICES");
  });

  it("takes the options off the reply, three at most", () => {
    const { text, choices } = splitChoiceMoment("The door creaks open.\n<<<CHOICES\n1. Go in\n2. Call out\n3. Leave\n4. Wait\nCHOICES>>>");
    expect(text).toBe("The door creaks open.");
    expect(choices?.map((c) => c.label)).toEqual(["Go in", "Call out", "Leave"]);
    expect(splitChoiceMoment("Just a reply.")).toEqual({ text: "Just a reply." });
  });

  it("hides the block while the reply streams", () => {
    expect(stripStreamingTags("The door creaks open.\n<<<CHOICES\n1. Go")).toBe("The door creaks open.");
    expect(stripStreamingTags("The door creaks open.\n<<")).toBe("The door creaks open.");
  });
});
