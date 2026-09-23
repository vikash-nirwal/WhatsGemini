// Heuristic detector for a model stepping out of character to refuse
// ("I'm sorry, but I can't continue with this roleplay."). Deliberately
// conservative: it only looks at the opening of a reply, and needs both a
// refusal opener and assistant-style wording, so in-character lines like
// "I can't believe you did that!" or "I can't help but smile" don't match.
// A miss just means a refusal stays in context as before; a false positive
// is visible and one click to undo.

const OPENERS = [
  /^i(?:'|’)?m (?:sorry|afraid|not (?:able|comfortable))/,
  /^i am (?:sorry|afraid|not (?:able|comfortable)|unable)/,
  /^(?:sorry|i apologi[sz]e)[,.!]/,
  /^i (?:can(?:'|’)?t|cannot|won(?:'|’)?t|will not|am unable to|must decline|need to (?:stop|decline))/,
  /^as an ai\b/,
  /^unfortunately,? i (?:can(?:'|’)?t|cannot|am unable)/,
];

const ASSISTANT_PHRASES = /\b(?:continue (?:with )?(?:this|the) (?:roleplay|role-play|story|scenario|conversation)|(?:help|assist) with (?:this|that)|fulfil+ (?:this|that|your) request|(?:create|write|generate|produce|provide) (?:this|that|explicit|sexual|such|the requested)|engage in (?:this|that|explicit|sexual)|content (?:policy|guidelines)|(?:against|violates?) (?:my|the|our) (?:guidelines|policies|policy|usage)|as an ai|language model|(?:sexually )?explicit content|keep (?:things|this|it) (?:respectful|appropriate|sfw))\b/;

export const looksLikeRefusal = (text: string | undefined): boolean => {
  if (!text) return false;
  const normalized = text.trim().replace(/^[*_"“\s]+/, "").toLowerCase();
  // Long replies that happen to open apologetically are almost always
  // in-character prose, not a refusal.
  if (!normalized || normalized.length > 1200) return false;
  const head = normalized.slice(0, 400);
  return OPENERS.some((re) => re.test(head)) && ASSISTANT_PHRASES.test(head);
};
