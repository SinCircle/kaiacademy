import type { PlaygroundPostCard } from "./playground";
import type { ProblemCard } from "./types";

export const NEW_MEMBER_PIN_WINDOW_MS = 60 * 60 * 1_000;

export type HomeFeedItem =
  | { kind: "problem"; item: ProblemCard }
  | { kind: "playground"; item: PlaygroundPostCard };

export function buildHomeFeed(
  problems: ProblemCard[],
  playground: PlaygroundPostCard[],
  memberCreatedAt?: string | null,
  now = Date.now(),
) {
  const joinedAt = memberCreatedAt ? Date.parse(memberCreatedAt) : Number.NaN;
  const hidePinned = Number.isFinite(joinedAt) && now - joinedAt > NEW_MEMBER_PIN_WINDOW_MS;
  return [
    ...problems.map((item): HomeFeedItem => ({ kind: "problem", item })),
    ...playground.map((item): HomeFeedItem => ({ kind: "playground", item })),
  ]
    .filter(({ item }) => !hidePinned || !item.isPinned)
    .sort((left, right) => {
      if (!hidePinned) {
        const pinOrder = Number(right.item.isPinned) - Number(left.item.isPinned);
        if (pinOrder) return pinOrder;
      }
      return right.item.updatedAt.localeCompare(left.item.updatedAt);
    })
    .slice(0, 3);
}
