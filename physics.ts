import type { Point, PoseData, PhysicsBody, PhysicsParticle, Skeleton, PhysicsConstraint } from './types';
import { computeSkeleton, hierarchy, W, H, WAIST_HEIGHT, L_THIGH, L_SHIN } from './kinematics';

// --- Simulation Constants ---
const GRAVITY: Point = { x: 0, y: 9.8 * 100 }; // Scaled for pixels
const FRICTION = 0.99;
const GROUND_FRICTION = 0.85;
const SOLVER_ITERATIONS = 10;
const GROUND_PLANE_Y = H - 40;
const STIFFNESS = 0.6; // Proportional gain for the PD controller
const DAMPING = 0.4;    // Derivative gain for the PD controller

/**
 * Creates a physics body (particles and constraints) from a static pose.
 */
export function createPhysicsBodyFromPose(pose: PoseData): PhysicsBody {
    const skeleton = computeSkeleton(pose);
    const particles: PhysicsParticle[] = [];
    const constraints: PhysicsConstraint[] = [];
    const particleMap = new Map<string, number>();

    // Create particles from joints
    Object.entries(skeleton.joints).forEach(([key, point]) => {
        if (key === 'ground') return; // Don't create a physics particle for the visual ground base
        const particle: PhysicsParticle = {
            id: key,
            pos: { ...point },
            prevPos: { ...point },
            mass: 1.0, // Default mass
        };
        // Heavier torso/waist for stability
        if (key === 'root' || key === 'waist' || key === 'torso' || key === 'neck') {
            particle.mass = 3.0;
        }
        // Lighter extremities
        if (key.includes('hand') || key.includes('foot')) {
            particle.mass = 0.5;
        }
        particleMap.set(key, particles.length);
        particles.push(particle);
    });

    // Create constraints by walking the defined hierarchy
    Object.keys(hierarchy).forEach(parentKey => {
        if (parentKey === 'ground') return;
        const parentIndex = particleMap.get(parentKey);
        if (parentIndex === undefined) return;
        const parentParticle = particles[parentIndex];

        hierarchy[parentKey].children.forEach(childKey => {
            const childIndex = particleMap.get(childKey);
            if(childIndex === undefined) return;
            const childParticle = particles[childIndex];
            
            const restLength = Math.hypot(childParticle.pos.x - parentParticle.pos.x, childParticle.pos.y - parentParticle.pos.y);
            if (restLength > 0.1) {
                constraints.push({ particleAIndex: parentIndex, particleBIndex: childIndex, restLength });
            }
        });
    });


    return { particles, constraints, particleMap };
}

/**
 * Runs one step of the physics simulation.
 */
export function updatePhysicsBody(body: PhysicsBody, dt: number, targetSkeleton?: Skeleton): void {
    const dtSq = dt * dt;

    // 1. Apply forces (Gravity, Target Pose) and integrate
    body.particles.forEach((p) => {
        if (p.mass === 0) return;

        const velocity = { x: (p.pos.x - p.prevPos.x) * FRICTION, y: (p.pos.y - p.prevPos.y) * FRICTION };
        p.prevPos = { ...p.pos };

        let accel = { x: GRAVITY.x, y: GRAVITY.y };

        if (targetSkeleton) {
            const targetPos = targetSkeleton.joints[p.id];
            if (targetPos) {
                 // PD Controller to guide ragdoll to target pose
                // P (Proportional) force: a spring pulling the particle to the target
                const springForce = { x: (targetPos.x - p.pos.x) * STIFFNESS, y: (targetPos.y - p.pos.y) * STIFFNESS };
                
                // D (Derivative) force: damping to reduce oscillation and add weight
                const dampingForce = { x: -velocity.x * DAMPING, y: -velocity.y * DAMPING };

                const totalForce = { x: springForce.x + dampingForce.x, y: springForce.y + dampingForce.y };

                accel.x += totalForce.x / p.mass;
                accel.y += totalForce.y / p.mass;
            }
        }

        p.pos.x += velocity.x + accel.x * dtSq;
        p.pos.y += velocity.y + accel.y * dtSq;
    });

    // 2. Solve constraints
    for (let i = 0; i < SOLVER_ITERATIONS; i++) {
        body.constraints.forEach(c => {
            const pA = body.particles[c.particleAIndex];
            const pB = body.particles[c.particleBIndex];
            const delta = { x: pB.pos.x - pA.pos.x, y: pB.pos.y - pA.pos.y };
            const dist = Math.hypot(delta.x, delta.y);
            if (dist < 0.001) return;
            
            const diff = (dist - c.restLength) / dist;
            const totalMass = pA.mass + pB.mass;
            if (totalMass === 0) return;
            
            const pAShare = pA.mass > 0 ? pA.mass / totalMass : 1;
            const pBShare = pB.mass > 0 ? pB.mass / totalMass : 1;

            pA.pos.x += delta.x * diff * pBShare;
            pA.pos.y += delta.y * diff * pBShare;
            pB.pos.x -= delta.x * diff * pAShare;
            pB.pos.y -= delta.y * diff * pAShare;
        });
    }

    // 3. Handle collisions
    body.particles.forEach(p => {
        if (p.pos.y > GROUND_PLANE_Y) {
            const vel = { x: p.pos.x - p.prevPos.x, y: p.pos.y - p.prevPos.y };
            p.pos.y = GROUND_PLANE_Y;
            p.prevPos.y = p.pos.y + vel.y * 0.1;

            // Foot Pinning: If a foot is on the ground, stop its horizontal movement
            if (p.id.includes('foot')) {
                p.prevPos.x = p.pos.x; // Kills horizontal velocity
            } else {
                p.prevPos.x = p.pos.x - vel.x * GROUND_FRICTION;
            }
        }
        if (p.pos.x < 10) p.pos.x = 10;
        if (p.pos.x > W - 10) p.pos.x = W - 10;
    });
}


/**
 * Converts the physics body's particle positions back into a PoseData object.
 */
export function extractPoseFromPhysicsBody(body: PhysicsBody, initialPose: PoseData): PoseData {
    const newPose: PoseData = JSON.parse(JSON.stringify(initialPose));
    const worldAngles: Map<string, number> = new Map();

    const getParticlePos = (key: string): Point | undefined => {
        const index = body.particleMap.get(key);
        return index !== undefined ? body.particles[index].pos : undefined;
    };
    
    const calculateAngles = (parentKey: string, parentWorldAngle: number) => {
        hierarchy[parentKey].children.forEach(childKey => {
            const parentPos = getParticlePos(parentKey);
            const childPos = getParticlePos(childKey);

            if (parentPos && childPos) {
                const dx = childPos.x - parentPos.x;
                const dy = childPos.y - parentPos.y;
                const childWorldAngle = Math.atan2(dy, dx);
                
                worldAngles.set(childKey, childWorldAngle);

                let localAngle = childWorldAngle - parentWorldAngle;

                const parts = childKey.split('.');
                if (parts.length === 2) {
                    (newPose as any)[parts[0]][parts[1]] = localAngle;
                } else {
                    (newPose as any)[childKey] = localAngle;
                }
                
                calculateAngles(childKey, childWorldAngle);
            }
        });
    };

    const rootPos = getParticlePos('root');
    const torsoPos = getParticlePos('torso');
    const waistPos = getParticlePos('waist');
    
    if (rootPos && torsoPos && waistPos) {
        const avgCoreX = (torsoPos.x + waistPos.x) / 2;
        const avgCoreY = (torsoPos.y + waistPos.y) / 2;
        const groundAngle = Math.atan2(avgCoreY - rootPos.y, avgCoreX - rootPos.x) - (Math.PI / 2);
        
        newPose.groundTilt = groundAngle;
        worldAngles.set('root', groundAngle);
        
        newPose.offset.x = rootPos.x - (W / 2);
        
        // Recalculate offset.y based on the new relationship between root and ground base
        const groundBaseYOffset = WAIST_HEIGHT + L_THIGH + L_SHIN;
        newPose.offset.y = (rootPos.y + groundBaseYOffset) - 650;
        
        calculateAngles('root', groundAngle);
    }
    
    return newPose;
}