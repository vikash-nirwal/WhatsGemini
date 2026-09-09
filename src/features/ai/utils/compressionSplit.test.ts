import { splitForCompression } from "./compressionSplit";
import { YOU, AI } from "../../../utils/constants";
import { Message } from "../../../types";

const msg = (role: string, txt: string): Message => ({ role, txt });

const makeMessages = (count: number): Message[] =>
  Array.from({ length: count }, (_, i) => msg(i % 2 === 0 ? YOU : AI, "message " + i));

describe("splitForCompression", () => {
  it("collapses down to half the threshold, not right up against it", () => {
    const compressible = makeMessages(100);
    const splitIndex = splitForCompression(compressible, 50);
    expect(splitIndex).toBe(75); // tail = 25 = floor(50 / 2)
    expect(compressible.length - splitIndex).toBe(25);
  });

  it("always leaves at least 1 message in the tail, however small the threshold", () => {
    const compressible = makeMessages(10);
    const splitIndex = splitForCompression(compressible, 1);
    expect(splitIndex).toBe(compressible.length - 1);
  });

  it("never returns a negative index for a compressible list shorter than the tail size", () => {
    const compressible = makeMessages(3);
    const splitIndex = splitForCompression(compressible, 50);
    expect(splitIndex).toBe(0);
  });

  // Regression test for the reported bug: auto-compression re-triggering on
  // literally every message once the chat crossed the threshold once.
  //
  // Root cause (both in the original message-count implementation and in a
  // later token-based rewrite): the tail was sized to sit right AT the
  // threshold, so the moment one more message was sent, the count exceeded
  // the threshold again and compression fired again - on every single turn,
  // forever, instead of after a real new batch of conversation piled up.
  // Collapsing to half fixes this: after compression the count sits well
  // below the threshold, giving threshold/2 messages of real headroom.
  it("leaves enough headroom that a single new message does not immediately re-cross the threshold", () => {
    const threshold = 50;
    const compressible = makeMessages(60);
    const splitIndex = splitForCompression(compressible, threshold);
    const tailLength = compressible.length - splitIndex;

    // Simulate what buildAutoCompressedMessages splices in afterward: the
    // tail plus a 2-message summary+ack pair.
    const postCompressionLength = tailLength + 2;
    expect(postCompressionLength).toBeLessThan(threshold);

    // Sending one more message afterward must not immediately put the count
    // back over the threshold.
    expect(postCompressionLength + 1).toBeLessThanOrEqual(threshold);
  });
});
