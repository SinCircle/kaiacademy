export const attentionCountOptions = [
  { value: "2", label: "2 人" },
  { value: "3", label: "3 人" },
  { value: "4", label: "4 人" },
  { value: "5to20", label: "5–20 人" },
  { value: "20plus", label: "20 人以上" },
] as const;

export function matchesAttentionCount(count: number, range: string) {
  if (range === "2") return count === 2;
  if (range === "3") return count === 3;
  if (range === "4") return count === 4;
  if (range === "5to20") return count >= 5 && count < 20;
  if (range === "20plus") return count >= 20;
  return true;
}
