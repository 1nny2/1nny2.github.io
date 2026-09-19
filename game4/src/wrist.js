// Palm-scale normalization keeps wrist steering independent of camera distance.
export function wristSteering(lm) {
  const dx = lm[9].x - lm[0].x, dy = lm[0].y - lm[9].y;
  const angle = Math.atan2(dx, dy);
  const magnitude = Math.abs(angle);
  if (magnitude < .18 || magnitude > 1.25) return 0;
  return -Math.sign(angle) * Math.min(1.6, (magnitude - .18) * 2.4);
}
