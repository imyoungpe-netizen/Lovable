export function getGameCountdownTone(seconds: number): string {
  if (seconds <= 3) return "tone-red is-urgent";
  if (seconds <= 5) return "tone-orange";
  if (seconds <= 7) return "tone-yellow";
  return "tone-green";
}
