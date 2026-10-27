import { Character, MyStatus } from "../../types";
import { AppDispatch } from "../../store/store";
import { generateAssistText } from "../aiSlice";
import { changeMyStatuses } from "../myStatusSlice";
import { cleanCommentReply } from "../character/statusFeed";
import { buildMyCommentReplyPrompt, withMyComment } from "./myStatuses";

// Your reply under a character's comment on your status, then their answer
// (2026-10-27). Resolves to whether they answered.
export const replyToStatusComment = (status: MyStatus, commentId: string, text: string, who: Character, userName: string) => async (dispatch: AppDispatch) => {
  const theirs = (status.comments || []).find((c) => c.id === commentId);
  if (!theirs || !text.trim()) return false;
  const now = Date.now();
  await dispatch(changeMyStatuses((list) => withMyComment(list, status.id, { id: `mc-you-${now.toString(36)}`, from: "you", text: text.trim(), at: now, replyTo: commentId })));
  const answer = cleanCommentReply(await dispatch(generateAssistText({ instruction: buildMyCommentReplyPrompt(who, userName, status, theirs.text, text.trim()) })).unwrap());
  if (!answer) return false;
  const at = Date.now();
  await dispatch(changeMyStatuses((list) => withMyComment(list, status.id, { id: `mc-${who.id}-${at.toString(36)}`, from: who.id, text: answer, at, replyTo: commentId })));
  return true;
};
