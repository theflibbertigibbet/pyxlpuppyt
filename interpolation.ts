import type { PoseData } from './types';

/**
 * Recursively interpolates between two values (numbers or nested objects).
 */
function recursiveInterpolate(a: any, b: any, t: number, easingFn: (t: number) => number): any {
    if (typeof a === 'number' && typeof b === 'number') {
        const easedT = easingFn(t);
        return a * (1 - easedT) + b * easedT;
    }
    if (typeof a === 'object' && a !== null && b !== null) {
        const result: { [key: string]: any } = {};
        for (const key in a) {
            if (key in b) {
                result[key] = recursiveInterpolate(a[key], b[key], t, easingFn);
            }
        }
        return result;
    }
    // Fallback for non-interpolatable types (e.g., strings, booleans)
    return t < 0.5 ? a : b;
}

const linearEase = (t: number) => t;
const sineEase = (t: number) => 0.5 * (1 - Math.cos(t * Math.PI)); // easeInOutSine

/**
 * Computes the transitional pose between two keyframes.
 * @param poseA - The starting pose.
 * @param poseB - The ending pose.
 * @param t - The normalized time (0 to 1).
 * @param easing - The easing function to use ('linear' or 'sine').
 * @returns A new PoseData object representing the interpolated state.
 */
export function interpolatePose(
    poseA: PoseData,
    poseB: PoseData,
    t: number,
    easing: 'linear' | 'sine' = 'sine'
): PoseData {
    const easingFn = easing === 'linear' ? linearEase : sineEase;
    const clampedT = Math.max(0, Math.min(1, t));
    return recursiveInterpolate(poseA, poseB, clampedT, easingFn) as PoseData;
}
