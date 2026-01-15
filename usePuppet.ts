import type { PoseData, Timeline, Frame } from '../core/types';
import { useHistory } from './useHistory';

export function usePuppet(initialTimeline: Timeline) {
  const { 
    state: timeline, 
    setState: setTimeline, 
    undo, 
    redo, 
    canUndo, 
    canRedo 
  } = useHistory<Timeline>(initialTimeline);

  const addFrame = (currentKeyframeIndex: number) => {
    const currentFrame = timeline.frames[currentKeyframeIndex] ?? timeline.frames[0];
    const newFrame: Frame = { 
      id: Date.now(), 
      pose: JSON.parse(JSON.stringify(currentFrame.pose)),
      assets: JSON.parse(JSON.stringify(currentFrame.assets ?? {})),
    };
    
    const newFrames = [
      ...timeline.frames.slice(0, currentKeyframeIndex + 1),
      newFrame,
      ...timeline.frames.slice(currentKeyframeIndex + 1)
    ];
    
    setTimeline({ ...timeline, frames: newFrames });
    return currentKeyframeIndex + 1; // Return new index
  };

  const deleteFrame = (currentKeyframeIndex: number) => {
    if (timeline.frames.length <= 1) return;
    const newFrames = timeline.frames.filter((_, i) => i !== currentKeyframeIndex);
    setTimeline({ ...timeline, frames: newFrames });
  };

  const commitPose = (newPose: PoseData, currentKeyframeIndex: number) => {
    const newFrames = [...timeline.frames];
    const frameToUpdate = newFrames[currentKeyframeIndex];
    if (!frameToUpdate) return;

    newFrames[currentKeyframeIndex] = { ...frameToUpdate, pose: newPose };
    setTimeline({ ...timeline, frames: newFrames });
  };

  const bindAsset = (partKey: string, assetDataUrl: string, currentKeyframeIndex: number) => {
    const newFrames = [...timeline.frames];
    const frameToUpdate = newFrames[currentKeyframeIndex];
    if (!frameToUpdate) return;
    
    const newAssets = { ...(frameToUpdate.assets || {}), [partKey]: assetDataUrl };
    newFrames[currentKeyframeIndex] = { ...frameToUpdate, assets: newAssets };
    setTimeline({ ...timeline, frames: newFrames });
  };

  return {
    timeline,
    addFrame,
    deleteFrame,
    commitPose,
    bindAsset,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
