export type Season = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export function seasonForDate(date = new Date()): { season: Season; year: number } {
  const month = date.getUTCMonth(); // 0-11
  const year = date.getUTCFullYear();
  if (month <= 1) return { season: "WINTER", year };
  if (month <= 4) return { season: "SPRING", year };
  if (month <= 7) return { season: "SUMMER", year };
  if (month <= 10) return { season: "FALL", year };
  return { season: "WINTER", year: year + 1 };
}
