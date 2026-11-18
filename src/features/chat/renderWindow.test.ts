import { onShowMessage, renderWindowStart, showMessage } from "./renderWindow";

describe("renderWindowStart", () => {
  it("renders everything in a short chat", () => {
    expect(renderWindowStart(30, undefined, [], 150)).toBe(0);
    expect(renderWindowStart(0, undefined, [], 150)).toBe(0);
  });

  it("renders only the newest messages of a long chat", () => {
    expect(renderWindowStart(3000, undefined, [], 150)).toBe(2850);
  });

  it("keeps where the window started as new messages arrive", () => {
    expect(renderWindowStart(3010, 2850, [], 150)).toBe(2850);
  });

  it("still shows the newest messages when the chat gets shorter", () => {
    expect(renderWindowStart(1000, 2850, [], 150)).toBe(850);
  });

  it("widens to show a message that must be seen, with a few before it", () => {
    expect(renderWindowStart(3000, 2850, [100], 150)).toBe(97);
    expect(renderWindowStart(3000, 2850, [1], 150)).toBe(0);
    // Not found, or already in the window: nothing changes.
    expect(renderWindowStart(3000, 2850, [-1, 2900], 150)).toBe(2850);
  });
});

describe("showMessage", () => {
  it("reaches whoever listens, until they stop", () => {
    const seen: string[] = [];
    const stop = onShowMessage((id) => seen.push(id));
    showMessage("m-1");
    stop();
    showMessage("m-2");
    expect(seen).toEqual(["m-1"]);
  });
});
