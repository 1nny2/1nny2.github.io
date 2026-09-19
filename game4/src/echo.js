// Shared by the observation instrument and the scene, so feedback matches the puzzle.
export function echoReading({ distance, azimuth = 0, polar = Math.PI / 2 }) {
  const angle = Math.abs(Math.atan2(Math.sin(azimuth - .8), Math.cos(azimuth - .8)));
  // A broad sweet spot tolerates hand tremor and small vertical drift.
  const alignment = Math.max(0, 1 - Math.max(0, angle - .30) / 1.1) * Math.max(0, 1 - Math.max(0, Math.abs(polar - Math.PI / 2) - .25) / .8);
  const focus = Math.max(0, 1 - Math.abs(distance - 270) / 160);
  const delta = Math.atan2(Math.sin(.8 - azimuth), Math.cos(.8 - azimuth));
  const guidance = distance < 245 ? '距离过近：点击远离，回到视距 245–295' : distance > 295 ? '距离过远：点击靠近，回到视距 245–295' : Math.abs(polar - Math.PI / 2) > .25 ? '俯仰偏离：点击绕核心观察，回到赤道高度' : angle > .30 ? `角度偏离：${delta > 0 ? '向左弯腕' : '向右弯腕'}旋转，或点击绕核心观察` : '距离与角度合适，保持姿势并扫描';
  return { clarity: alignment * focus, alignment, focus, guidance, distance, ready: alignment * focus >= .82 };
}
