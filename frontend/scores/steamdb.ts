// SteamDB's published rating formula: the positive ratio is pulled towards 50%
// the fewer reviews a game has.
// rating = avg - (avg - 0.5) * 2^(-log10(total + 1))
export function steamDbRating(positive: number, total: number): number | null {
  if (!(total > 0)) return null;
  const avg = positive / total;
  const rating = avg - (avg - 0.5) * Math.pow(2, -Math.log10(total + 1));
  return rating * 100;
}
