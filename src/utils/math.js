/**
 * Frame-rate-independent damping. Pulls `current` toward `target` by an
 * exponential factor based on `lambda` (higher = faster). Pass dt in
 * seconds for stable behavior across varying frame rates.
 */
export function damp(current, target, lambda, dt) {
	return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/**
 * Linear interpolation between `a` and `b` by factor `t` in [0, 1].
 */
export function lerp(a, b, t) {
	return a + (b - a) * t;
}

/**
 * Constrain `v` to the range [min, max].
 */
export function clamp(v, min, max) {
	return Math.max(min, Math.min(max, v));
}

/**
 * Remap `v` from input range [inMin, inMax] to output range [outMin, outMax].
 * Does not clamp; pair with `clamp()` if needed.
 */
export function map(v, inMin, inMax, outMin, outMax) {
	return ((v - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}
