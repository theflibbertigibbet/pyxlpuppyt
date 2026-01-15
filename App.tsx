import React, { useState, useMemo, useRef } from 'react';
import { Canvas, type CanvasHandle } from './view/Canvas';
import { Controls } from './view/Controls';
import type { PoseData, Timeline } from './core/types';
import { getDefaultPose } from './core/kinematics';
import { usePuppet } from './hooks/usePuppet';
import { usePlayback } from './hooks/usePlayback';
import { usePhysics } from './hooks/usePhysics';
import { interpolatePose } from './core/interpolation';

const initialTimeline: Timeline = {
  frames: [{ id: Date.now(), pose: getDefaultPose() }],
};

export function App() {
  const { 
    timeline, 
    addFrame,
    deleteFrame,
    commitPose,
    bindAsset,
    undo, 
    redo, 
    canUndo, 
    canRedo 
  } = usePuppet(initialTimeline);

  const [selectedPartKey, setSelectedPartKey] = useState<string | null>(null);
  const [isPhysicsEnabled, setIsPhysicsEnabled] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const canvasRef = useRef<CanvasHandle>(null);
  
  const { isPlaying, playhead, togglePlay, scrubTo } = usePlayback({ numFrames: timeline.frames.length });
  const currentKeyframeIndex = Math.round(playhead);

  // --- Frame Management ---
  const handleAddFrame = () => {
    const newIndex = addFrame(currentKeyframeIndex);
    scrubTo(newIndex);
  };
  
  const handleDeleteFrame = () => {
    deleteFrame(currentKeyframeIndex);
    if (currentKeyframeIndex >= timeline.frames.length - 1) {
      scrubTo(Math.max(0, timeline.frames.length - 2));
    }
  };

  const handlePoseCommit = (newPose: PoseData) => {
    commitPose(newPose, currentKeyframeIndex);
  };

  const handleSelectPart = (key: string) => {
    setSelectedPartKey(key);
  };

  const handleBindAsset = () => {
    if (!selectedPartKey) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        if (typeof event.target?.result === 'string') {
          bindAsset(selectedPartKey, event.target.result, currentKeyframeIndex);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleExportJson = () => {
    const json = JSON.stringify(timeline, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pyxl-puppet-animation.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPng = () => {
    canvasRef.current?.exportAsPng();
  };

  // --- Pose Calculation for Rendering ---
  const floorIndex = Math.floor(playhead);
  const ceilIndex = Math.ceil(playhead);
  const t = playhead - floorIndex;
  
  const frameA = timeline.frames[floorIndex];
  const frameB = timeline.frames[ceilIndex];
  
  let targetPose = timeline.frames[currentKeyframeIndex]?.pose;
  let currentAssets = timeline.frames[currentKeyframeIndex]?.assets;
  
  if (frameA?.pose && frameB?.pose && t > 0.001) {
      targetPose = interpolatePose(frameA.pose, frameB.pose, t, 'sine');
      currentAssets = t < 0.5 ? frameA.assets : frameB.assets;
  }
  
  const prevFrame = timeline.frames[currentKeyframeIndex - 1];
  const nextFrame = timeline.frames[currentKeyframeIndex + 1];

  const physicalPose = usePhysics({ targetPose: targetPose, isEnabled: isPhysicsEnabled });
  
  const poseForCanvas = physicalPose;

  if (!poseForCanvas) {
    return <div className="flex h-screen w-screen items-center justify-center">Loading...</div>;
  }

  return (
    <div 
      className="flex h-screen w-screen bg-[#F4F1DE] overflow-hidden font-sans select-none relative items-center justify-center"
      onMouseDown={() => { if (showSplash) setShowSplash(false); }}
    >
      {showSplash && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <h1 className="text-8xl font-semibold text-[rgba(61,43,86,0.15)] select-none">
            Pyxl.Puppt
          </h1>
        </div>
      )}

      <Canvas 
        ref={canvasRef}
        pose={poseForCanvas} 
        onPoseCommit={handlePoseCommit} 
        prevPose={prevFrame?.pose} 
        nextPose={nextFrame?.pose} 
        assets={currentAssets}
        selectedPartKey={selectedPartKey}
        onSelectPart={handleSelectPart}
        onDeselect={() => setSelectedPartKey(null)}
      />
      <Controls 
        onUndo={undo} 
        onRedo={redo} 
        canUndo={canUndo} 
        canRedo={canRedo} 
        isPlaying={isPlaying} 
        onTogglePlay={togglePlay}
        playhead={playhead}
        onScrub={scrubTo}
        numFrames={timeline.frames.length}
        currentIndex={currentKeyframeIndex}
        onAddFrame={handleAddFrame}
        onDeleteFrame={handleDeleteFrame}
        onSelectFrame={scrubTo}
        isPhysicsEnabled={isPhysicsEnabled}
        onTogglePhysics={() => setIsPhysicsEnabled(p => !p)}
        selectedPartKey={selectedPartKey}
        onBindAsset={handleBindAsset}
        onExportPng={handleExportPng}
        onExportJson={handleExportJson}
      />
    </div>
  );
}