import { Message } from "../../types";

// Relationship timeline (#51): how the character's mood toward the user has
// moved over the chat, from the emotion tags their replies already carry.
// Each mood gets a warmth score from -3 (hostile) to +3 (warm); the chart
// plots it against a neutral baseline.

export const MOOD_SCORES: Record<string, number> = {
  flirty: 3,
  happy: 2,
  excited: 2,
  smug: 1,
  shy: 1,
  surprised: 0.5,
  neutral: 0,
  thinking: 0,
  embarrassed: -0.5,
  scared: -1.5,
  annoyed: -1.5,
  sad: -2,
  angry: -3,
};

export interface MoodPoint {
  id: string;
  time: number;
  emotion: string;
  score: number;
}

// One point per reply that reported a mood. A custom mood the scale doesn't
// know counts as neutral rather than being left out.
export const moodPoints = (messages: Message[], speakerId?: number): MoodPoint[] =>
  messages
    .filter((m) => m.role !== "you" && m.emotion && !m.isSystem && (speakerId == null || m.speakerId == null || m.speakerId === speakerId))
    .map((m, i) => ({
      id: m.id || `m${i}`,
      time: m.timestamp || 0,
      emotion: m.emotion!,
      score: MOOD_SCORES[m.emotion!.toLowerCase()] ?? 0,
    }));

export interface MoodSummary {
  topMood?: string;
  topShare: number; // 0-1
  trend: "warmer" | "cooler" | "steady" | undefined; // recent replies vs the ones before
}

const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export const summarizeMoods = (points: MoodPoint[]): MoodSummary => {
  if (points.length === 0) return { topShare: 0, trend: undefined };
  const counts = new Map<string, number>();
  for (const p of points) counts.set(p.emotion, (counts.get(p.emotion) || 0) + 1);
  const [topMood, topCount] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  let trend: MoodSummary["trend"];
  if (points.length >= 6) {
    const half = Math.min(10, Math.floor(points.length / 2));
    const delta = average(points.slice(-half).map((p) => p.score)) - average(points.slice(-2 * half, -half).map((p) => p.score));
    trend = delta > 0.5 ? "warmer" : delta < -0.5 ? "cooler" : "steady";
  }
  return { topMood, topShare: topCount / points.length, trend };
};
