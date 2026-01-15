import { useState, useEffect, useRef, useCallback } from 'react';

interface PlaybackOptions {
    numFrames: number;
    playbackSpeed?: number; // frames per second
}

export function usePlayback({ numFrames, playbackSpeed = 1 }: PlaybackOptions) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [playhead, setPlayhead] = useState(0); // Float for interpolation
    const direction = useRef(1);
    const animationFrameId = useRef<number>();
    const lastTimeRef = useRef<number>();

    // FIX: The `animate` function must accept a `time` parameter from `requestAnimationFrame`.
    const animate = useCallback((time: number) => {
        // FIX: Safely calculate time delta by providing a fallback for the first frame, preventing NaN errors.
        const lastTime = lastTimeRef.current ?? time;
        const delta = time - lastTime;
        lastTimeRef.current = time;

        setPlayhead(currentPlayhead => {
            const maxPlayhead = numFrames - 1;
            if (maxPlayhead <= 0) return 0;
            
            let nextPlayhead = currentPlayhead + direction.current * (delta / 1000) * playbackSpeed;

            if (nextPlayhead >= maxPlayhead) {
                nextPlayhead = maxPlayhead;
                direction.current = -1; // Ping-pong
            } else if (nextPlayhead <= 0) {
                nextPlayhead = 0;
                direction.current = 1; // Ping-pong
            }
            return nextPlayhead;
        });
        
        animationFrameId.current = requestAnimationFrame(animate);
    }, [numFrames, playbackSpeed]);

    useEffect(() => {
        if (isPlaying) {
            lastTimeRef.current = performance.now();
            animationFrameId.current = requestAnimationFrame(animate);
        } else {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = undefined;
            }
            // FIX: Reset lastTimeRef on pause to prevent a large time jump when resuming playback.
            lastTimeRef.current = undefined;
        }
        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = undefined;
            }
        };
    }, [isPlaying, animate]);
    
    // If frames are added/removed, cap the playhead to a valid index
    useEffect(() => {
        const maxPlayhead = numFrames > 0 ? numFrames - 1 : 0;
        if (playhead > maxPlayhead) {
            setPlayhead(maxPlayhead);
        }
    }, [numFrames, playhead]);

    const togglePlay = useCallback(() => setIsPlaying(p => !p), []);
    
    // Scrubbing always pauses playback to give the user control.
    const scrubTo = useCallback((newPosition: number) => {
        setIsPlaying(false);
        setPlayhead(newPosition);
    }, []);

    return {
        isPlaying,
        playhead,
        togglePlay,
        scrubTo,
    };
}
