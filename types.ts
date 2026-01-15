// Data-only representation of a character's pose.
// All values are in radians.
export type PoseData = {
  groundTilt: number;
  offset: { x: number; y: number };
  torso: number;
  waist: number;
  head: number;
  left: {
    shoulder: number;
    elbow: number;
    hand: number;
    hip: number;
    knee: number;
    foot: number;
  };
  right: {
    shoulder: number;
    elbow: number;
    hand: number;
    hip: number;
    knee: number;
    foot: number;
  };
};

// A single, immutable frame in the animation.
export type Frame = {
  id: number;
  pose: PoseData;
  assets?: { [key: string]: string | null };
};

// The sequence of frames. This is the primary subject of the undo/redo history.
export type Timeline = {
  frames: Frame[];
};

// Ephemeral playback state. This is never saved or part of the undo history.
export type Playhead = {
  index: number;
  playing: boolean;
};

// The complete, top-level state for the application.
export type State = {
  timeline: Timeline;
  playhead: Playhead;
};

// --- Computed Types for Rendering ---

export type Point = {
    x: number;
    y: number;
};

export type BoneSegment = {
    key: string;
    start: Point; // The pivot point for custom shapes
    end: Point;   // The end point, used for length and hit-detection
    width: number; // Used for hit-detection and asset binding
    angle: number; // The world-space angle for rendering
    shape: 'line' | 'polygon' | 'curve' | 'circle' | 'custom';
    vertices?: Point[];
};

export type Skeleton = {
    joints: { [key: string]: Point };
    bones: BoneSegment[];
};

// --- Physics Engine Types ---

export type PhysicsParticle = {
  id: string;
  pos: Point;
  prevPos: Point;
  mass: number;
};

export type PhysicsConstraint = {
  particleAIndex: number;
  particleBIndex: number;
  restLength: number;
};

export type PhysicsBody = {
  particles: PhysicsParticle[];
  constraints: PhysicsConstraint[];
  particleMap: Map<string, number>;
};