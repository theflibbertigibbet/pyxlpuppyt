import { useState, useEffect, useRef, useCallback } from 'react';
import type { PoseData, PhysicsBody } from '../core/types';
import { createPhysicsBodyFromPose, updatePhysicsBody, extractPoseFromPhysicsBody } from '../core/physics';
import { computeSkeleton } from '../core/kinematics';

interface PhysicsOptions {
  targetPose: PoseData;
  isEnabled: boolean;
}

export function usePhysics({ targetPose, isEnabled }: PhysicsOptions): PoseData {
    const [physicalPose, setPhysicalPose] = useState<PoseData>(targetPose);
    const physicsBodyRef = useRef<PhysicsBody | null>(null);
    const animationFrameId = useRef<number>();
    const lastTimeRef = useRef<number>();

    // Initialize the physics body once
    useEffect(() => {
        physicsBodyRef.current = createPhysicsBodyFromPose(targetPose);
        setPhysicalPose(targetPose);
    }, []);

    // FIX: The `animate` function must accept a `time` parameter from `requestAnimationFrame`.
    const animate = useCallback((time: number) => {
        if (!physicsBodyRef.current) {
            animationFrameId.current = requestAnimationFrame(animate);
            return;
        };
        
        // FIX: Safely calculate time delta by providing a fallback for the first frame, preventing NaN errors.
        const lastTime = lastTimeRef.current ?? time;
        const dt = (time - lastTime) / 1000;
        lastTimeRef.current = time;

        if (dt > 0) {
          const targetSkeleton = computeSkeleton(targetPose);
          // Cap delta time to prevent physics explosions on long frames
          updatePhysicsBody(physicsBodyRef.current, Math.min(dt, 1/30), targetSkeleton);
          // FIX: Use a functional state update for `setPhysicalPose` to remove an unnecessary dependency and prevent re-renders.
          setPhysicalPose(currentPose => 
            extractPoseFromPhysicsBody(physicsBodyRef.current!, currentPose)
          );
        }
        
        animationFrameId.current = requestAnimationFrame(animate);
    }, [targetPose]);

    useEffect(() => {
        if (isEnabled) {
            lastTimeRef.current = performance.now();
            animationFrameId.current = requestAnimationFrame(animate);
        } else {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = undefined;
            }
            // When physics is disabled, snap the rendered pose to the target pose
            setPhysicalPose(targetPose);
            // Also reset the underlying physics particles to match the target pose,
            // so it doesn't "spring" from its old position when re-enabled.
            physicsBodyRef.current = createPhysicsBodyFromPose(targetPose);
            // FIX: Reset lastTimeRef when physics is disabled to prevent a large time jump on re-enable.
            lastTimeRef.current = undefined;
        }
        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = undefined;
            }
        };
    }, [isEnabled, animate, targetPose]);

    return physicalPose;
}
