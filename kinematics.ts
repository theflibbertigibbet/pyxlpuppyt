import type { PoseData, Point, BoneSegment, Skeleton } from './types';

// --- Constants ---
export const W = 800;
export const H = 800;

// --- 8-Head Proportions ---
// The puppet is scaled to fit within the 800px canvas height.
const HEAD_UNIT = 64; // Base unit for proportions
export const HEAD_SIZE = 51; // Visual size of the head shape

export const TORSO_HEIGHT = HEAD_UNIT * 2.25; // 144px
export const WAIST_HEIGHT = HEAD_UNIT * 1.25; // 80px
const NECK_LENGTH = 0; // Neck is integrated

// Limb length constants
export const L_ARM = HEAD_UNIT * 1.5;     // 96px
export const L_FOREARM = HEAD_UNIT * 1.5;   // 96px
export const L_HAND = HEAD_UNIT * 0.75;   // 48px
export const L_THIGH = HEAD_UNIT * 1.75;  // 112px
export const L_SHIN = HEAD_UNIT * 1.75;   // 112px
export const L_FOOT = HEAD_UNIT * 0.75;   // 48px


// --- Hierarchy Definition for Compensation Logic ---
export const hierarchy: { [key: string]: { parent: string | null; children: string[] } } = {
  'ground': { parent: null, children: ['root'] },
  'root': { parent: 'ground', children: ['torso', 'waist'] },
  'torso': { parent: 'root', children: ['head', 'left.shoulder', 'right.shoulder'] },
  'waist': { parent: 'root', children: ['left.hip', 'right.hip'] },
  'head': { parent: 'torso', children: [] },
  'left.shoulder': { parent: 'torso', children: ['left.elbow'] },
  'left.elbow': { parent: 'left.shoulder', children: ['left.hand'] },
  'left.hand': { parent: 'left.elbow', children: [] },
  'right.shoulder': { parent: 'torso', children: ['right.elbow'] },
  'right.elbow': { parent: 'right.shoulder', children: ['right.hand'] },
  'right.hand': { parent: 'right.elbow', children: [] },
  'left.hip': { parent: 'waist', children: ['left.knee'] },
  'left.knee': { parent: 'left.hip', children: ['left.foot'] },
  'left.foot': { parent: 'left.knee', children: [] },
  'right.hip': { parent: 'waist', children: ['right.knee'] },
  'right.knee': { parent: 'right.hip', children: ['right.foot'] },
  'right.foot': { parent: 'right.knee', children: [] }
};

// --- Joint Constraints ---
export const jointConstraints: { [key: string]: { min: number; max: number } } = {
  // All joint constraints have been removed to allow for full 360-degree rotation.
};

/**
 * Clamps an angle to a specified min/max range.
 * Normalizes the angle to be within -PI to PI before clamping.
 */
export function clampAngle(angle: number, min: number, max: number): number {
  let normAngle = angle;
  while (normAngle > Math.PI) normAngle -= 2 * Math.PI;
  while (normAngle < -Math.PI) normAngle += 2 * Math.PI;
  return Math.max(min, Math.min(max, normAngle));
}


const rad = (deg: number): number => (deg * Math.PI) / 180;

export function getDefaultPose(): PoseData {
  return {
    groundTilt: 0,
    offset: { x: 0, y: 0 }, // Center the character on load
    torso: 0,
    waist: 0,
    head: 0,
    // Vitruvian-style T-Pose with splayed legs
    left: { shoulder: rad(180), elbow: 0, hand: 0, hip: rad(100), knee: 0, foot: 0 },
    right: { shoulder: rad(0), elbow: 0, hand: 0, hip: rad(80), knee: 0, foot: 0 }
  };
}

const rotatePoint = (x: number, y: number, angle: number): Point => ({
  x: x * Math.cos(angle) - y * Math.sin(angle),
  y: x * Math.sin(angle) + y * Math.cos(angle)
});

const getEndPoint = (start: Point, angle: number, length: number): Point => ({
  x: start.x + Math.cos(angle) * length,
  y: start.y + Math.sin(angle) * length
});

export function computeSkeleton(pose: PoseData): Skeleton {
  const jointCache: { [key: string]: Point } = {};
  const boneCache: BoneSegment[] = [];

  // The ground base is the visual/interactive center, now positioned at ankle level.
  const groundBaseYOffset = WAIST_HEIGHT + L_THIGH + L_SHIN; // Vertical distance from navel to ankles
  const groundBasePos = {
    x: W / 2, // Locked to the canvas's horizontal center.
    y: 650 + pose.offset.y
  };
  
  // The puppet's anatomical root (navel) is offset above this new ground base.
  // The puppet's x-offset is respected here, allowing it to move side-to-side.
  const rootPos = {
    x: W / 2 + pose.offset.x,
    y: groundBasePos.y - groundBaseYOffset
  };

  const storeJoint = (key: string, p: Point) => jointCache[key] = p;
  const storeBone = (key: string, start: Point, end: Point, width: number, angle: number) => boneCache.push({ key, start, end, width, angle, shape: 'custom' });

  const groundAngle = pose.groundTilt;
  const torsoAngle = groundAngle + pose.torso;
  const waistAngle = groundAngle + pose.waist;

  storeJoint('root', rootPos);
  storeJoint('ground', groundBasePos);
  
  // --- Ground Base ---
  storeBone('ground', groundBasePos, groundBasePos, 100, groundAngle);

  // --- Torso & Waist Shapes ---
  const neckAttachOffset = TORSO_HEIGHT; 
  const neckPos = getEndPoint(rootPos, torsoAngle - Math.PI / 2, neckAttachOffset);
  storeJoint('torso', neckPos); // Use 'torso' key to match hierarchy for the neck joint
  storeBone('torso', rootPos, neckPos, 100, torsoAngle);
  
  const waistEnd = getEndPoint(rootPos, waistAngle + Math.PI / 2, WAIST_HEIGHT);
  storeJoint('waist', waistEnd); // Store the waist joint for physics
  storeBone('waist', rootPos, waistEnd, 60, waistAngle);

  // --- Head & Neck ---
  const neckEndPos = getEndPoint(neckPos, torsoAngle - Math.PI / 2, NECK_LENGTH);
  storeBone('neck', neckPos, neckEndPos, 13, torsoAngle);
  const headAngle = torsoAngle + pose.head;
  const headEnd = getEndPoint(neckPos, headAngle, 1);
  storeBone('head', neckPos, headEnd, HEAD_SIZE, headAngle);
  storeJoint('head', neckPos);

  // --- Arms & Shoulder Joints ---
  const shoulderWidth = 48;
  (['left', 'right'] as const).forEach(side => {
    const shoulderX = side === 'left' ? -shoulderWidth : shoulderWidth;
    const sOffset = rotatePoint(shoulderX, 0, torsoAngle);
    const sPos = { x: neckPos.x + sOffset.x, y: neckPos.y + sOffset.y };
    const sKey = `${side}.shoulder`;
    storeJoint(sKey, sPos);

    const sAngle = torsoAngle + pose[side].shoulder;
    const ePos = getEndPoint(sPos, sAngle, L_ARM);
    storeBone(sKey, sPos, ePos, 36, sAngle);

    const eKey = `${side}.elbow`;
    storeJoint(eKey, ePos);
    const eAngle = sAngle + pose[side].elbow;
    const hPos = getEndPoint(ePos, eAngle, L_FOREARM);
    storeBone(eKey, ePos, hPos, 28, eAngle);

    const hKey = `${side}.hand`;
    storeJoint(hKey, hPos);
    const hAngle = eAngle + pose[side].hand;
    const handEnd = getEndPoint(hPos, hAngle, L_HAND);
    storeBone(hKey, hPos, handEnd, 16, hAngle);
  });

  // --- Lower Body & Hip Joints ---
  const hipWidth = 29;
  (['left', 'right'] as const).forEach(side => {
    const hipX = side === 'left' ? -hipWidth : hipWidth;
    // Hips are attached to the end of the waist segment ('waist' joint)
    const hipAttachPoint = waistEnd;
    // The offset is rotated by the waist's world angle to align the hips correctly
    const hOffset = rotatePoint(hipX, 0, waistAngle);
    const hPos = { x: hipAttachPoint.x + hOffset.x, y: hipAttachPoint.y + hOffset.y };
    const hKey = `${side}.hip`;
    storeJoint(hKey, hPos);

    const hAngle = waistAngle + pose[side].hip;
    const kPos = getEndPoint(hPos, hAngle, L_THIGH);
    storeBone(hKey, hPos, kPos, 44, hAngle - Math.PI / 2);

    const kKey = `${side}.knee`;
    storeJoint(kKey, kPos);
    const kAngle = hAngle + pose[side].knee;
    const fPos = getEndPoint(kPos, kAngle, L_SHIN);
    storeBone(kKey, kPos, fPos, 32, kAngle - Math.PI / 2);

    const fKey = `${side}.foot`;
    storeJoint(fKey, fPos);
    const fAngle = kAngle + pose[side].foot;
    const footEnd = getEndPoint(fPos, fAngle, L_FOOT);
    storeBone(fKey, fPos, footEnd, 18, fAngle - Math.PI / 2);
  });

  return { joints: jointCache, bones: boneCache };
}

// --- Inverse Kinematics (IK) ---

export const getParentWorldAngle = (key: string, pose: PoseData): number | null => {
    const parentKey = hierarchy[key]?.parent;
    if (!parentKey) return 0;
    if (parentKey === 'ground') return pose.groundTilt;
    if (parentKey === 'torso') return pose.groundTilt + pose.torso;
    if (parentKey === 'waist') return pose.groundTilt + pose.waist;
    if (parentKey === 'root') return pose.groundTilt;
    const [side, jointName] = parentKey.split('.') as ['left' | 'right', string];
    if (jointName === 'shoulder') return pose.groundTilt + pose.torso + pose[side].shoulder;
    if (jointName === 'elbow') return pose.groundTilt + pose.torso + pose[side].shoulder + pose[side].elbow;
    if (jointName === 'hip') return pose.groundTilt + pose.waist + pose[side].hip;
    if (jointName === 'knee') return pose.groundTilt + pose.waist + pose[side].hip + pose[side].knee;
    return null;
}

export const solveIK = (rootPos: Point, targetPos: Point, l1: number, l2: number): { angle1: number, angle2: number } | null => {
    const dx = targetPos.x - rootPos.x, dy = targetPos.y - rootPos.y;
    const distSq = dx * dx + dy * dy, dist = Math.sqrt(distSq);
    if (dist > l1 + l2) return { angle1: Math.atan2(dy, dx), angle2: 0 };
    if (dist < Math.abs(l1 - l2)) return null;
    const a1 = Math.acos((distSq + l1 * l1 - l2 * l2) / (2 * dist * l1));
    const a2 = Math.acos((l1 * l1 + l2 * l2 - distSq) / (2 * l1 * l2));
    return { angle1: Math.atan2(dy, dx) - a1, angle2: Math.PI - a2 };
};