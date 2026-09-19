import * as THREE from 'three';

export const ECHO_POSITION = new THREE.Vector3(72, 8, -42);
export const SHIP_POSITION = new THREE.Vector3(138, 115, -25);

export function observationTarget(context) {
    if (context.route === '观测星海' && context.discoveries.length) return ECHO_POSITION;
    if (context.route === '追寻回响' && context.scanned) return SHIP_POSITION;
    return null;
}

// Choose the larger unobstructed area beside or below the task panel.
export function observationViewport(width, height, hud) {
    const right = { x: hud.right + 20, y: 100, w: width - hud.right - 40, h: height - 200 };
    const below = { x: 20, y: hud.bottom + 20, w: width - 40, h: height - hud.bottom - 110 };
    const area = r => Math.max(0, r.w) * Math.max(0, r.h);
    const r = area(right) > area(below) ? right : below;
    return { x: Math.max(60, Math.min(width - 60, r.x + r.w / 2)), y: Math.max(80, Math.min(height - 100, r.y + r.h / 2)) };
}
