import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle, useCallback, useLayoutEffect } from 'react';
import type { PoseData, Point, BoneSegment, Skeleton } from '../core/types';
import { computeSkeleton, getParentWorldAngle, W, H, jointConstraints, clampAngle } from '../core/kinematics';
import { solveFabrik } from '../core/ik';
import { drawPart, drawJoints } from './drawing';
import { constrainPoseToBounds } from '../utils';

export interface CanvasHandle {
  exportAsPng: () => void;
}

interface CanvasProps {
  pose: PoseData;
  onPoseCommit: (pose: PoseData) => void;
  prevPose?: PoseData;
  nextPose?: PoseData;
  assets?: { [key: string]: string | null };
  selectedPartKey: string | null;
  onSelectPart: (key: string) => void;
  onDeselect: () => void;
}

// --- Theme & constants ---
const PIN_COLOR = '#FF3B30';
const PAPER_COLOR = '#F4F1DE', GRID_COLOR = 'rgba(61, 43, 86, 0.1)';
const GRID_SNAP = 3.125;
const ANGLE_SNAP = (5 * Math.PI) / 180; // 5 degrees
const DAMPING_FACTOR = 0.15;

// --- Interaction ---
const boneToControlledAction: { [key: string]: { type: 'rotate'; joint: string; pivot?: string; } } = { 
    'torso': { type: 'rotate', joint: 'torso', pivot: 'root' }, 
    'waist': { type: 'rotate', joint: 'waist', pivot: 'root' }, 
    'head': { type: 'rotate', joint: 'head' }, 
    'left.shoulder': { type: 'rotate', joint: 'left.shoulder' }, 
    'left.elbow': { type: 'rotate', joint: 'left.elbow' }, 
    'left.hand': { type: 'rotate', joint: 'left.hand' }, 
    'right.shoulder': { type: 'rotate', joint: 'right.shoulder' }, 
    'right.elbow': { type: 'rotate', joint: 'right.elbow' }, 
    'right.hand': { type: 'rotate', joint: 'right.hand' }, 
    'left.hip': { type: 'rotate', joint: 'left.hip' }, 
    'left.knee': { type: 'rotate', joint: 'left.knee' }, 
    'left.foot': { type: 'rotate', joint: 'left.foot' }, 
    'right.hip': { type: 'rotate', joint: 'right.hip' }, 
    'right.knee': { type: 'rotate', joint: 'right.knee' }, 
    'right.foot': { type: 'rotate', joint: 'right.foot' } 
};
const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;
const recursiveLerp = (a: any, b: any, t: number): any => { if (typeof a === 'number' && typeof b === 'number') return lerp(a, b, t); if (typeof a === 'object' && a !== null && b !== null) { const result: { [key: string]: any } = {}; for (const key in a) if (key in b) result[key] = recursiveLerp(a[key], b[key], t); return result; } return b; };
const isClose = (a: any, b: any, threshold = 0.001): boolean => { if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < threshold; if (typeof a === 'object' && a !== null && b !== null) return Object.keys(a).every(key => isClose(a[key], b[key], threshold)); return a === b; }
function distToSegment(p: Point, v: Point, w: Point): number { const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2; if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y); let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2; t = Math.max(0, Math.min(1, t)); const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) }; return Math.hypot(p.x - proj.x, p.y - proj.y); }


export const Canvas = forwardRef<CanvasHandle, CanvasProps>(({ pose, onPoseCommit, prevPose, nextPose, assets, selectedPartKey, onSelectPart, onDeselect }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [localPose, setLocalPose] = useState<PoseData>(pose);
  const [draggedPartKey, setDraggedPartKey] = useState<string | null>(null);
  const [activePivot, setActivePivot] = useState<Point | null>(null);
  const [displayedPose, setDisplayedPose] = useState<PoseData>(pose);
  const animationFrameId = useRef<number>();
  const initialDragOffset = useRef<Point>({x:0, y:0});
  const dragModeRef = useRef<'pan' | 'rotate' | 'ik' | 'aim' | 'ground_drag' | null>(null);
  const controlledJointRef = useRef<string | null>(null);
  const initialPoseRef = useRef<PoseData | null>(null);
  const initialMousePosRef = useRef<Point>({x: 0, y: 0});

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        const padding = 80;
        const scaleX = (width - padding) / W;
        const scaleY = (height - padding) / H;
        setScale(Math.max(0, Math.min(scaleX, scaleY)));
      }
    });

    observer.observe(wrapper);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => { setLocalPose(pose); }, [pose]);
  useEffect(() => {
    // FIX: The `animate` function for `requestAnimationFrame` must accept a time parameter.
    const animate = (_time: number) => {
      setDisplayedPose(current => {
        if (isClose(current, localPose)) { animationFrameId.current = undefined; return localPose; }
        const nextPose = recursiveLerp(current, localPose, DAMPING_FACTOR) as PoseData;
        animationFrameId.current = requestAnimationFrame(animate);
        return nextPose;
      });
    };
    if (!animationFrameId.current && JSON.stringify(displayedPose) !== JSON.stringify(localPose)) {
        animationFrameId.current = requestAnimationFrame(animate);
    }
    return () => { if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current); animationFrameId.current = undefined; };
  }, [localPose, displayedPose]);

  const drawScene = useCallback((ctx: CanvasRenderingContext2D, isExport: boolean) => {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = isExport ? 'transparent' : PAPER_COLOR;
    ctx.fillRect(0, 0, W, H);

    if (!isExport) {
        ctx.strokeStyle = GRID_COLOR; ctx.lineWidth = 1;
        for (let x = 0; x <= W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y <= H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    }

    const drawSkeleton = (skel: Skeleton, currentAssets?: typeof assets, highlightKey?: string | null) => {
        const order = [
            'ground',
            'right.hip', 'right.knee', 'right.foot',
            'left.hip', 'left.knee', 'left.foot',
            'waist',
            'right.shoulder', 'right.elbow', 'right.hand',
            'left.shoulder', 'left.elbow', 'left.hand',
            'torso',
            'neck', 'head'
        ];
        order.forEach(key => {
            const bone = skel.bones.find(b => b.key === key);
            if (bone) drawPart(ctx, bone, bone.key === highlightKey, currentAssets?.[bone.key] ?? null);
        });
    };

    if (!isExport) {
        ctx.globalAlpha = 0.15;
        if (prevPose) drawSkeleton(computeSkeleton(prevPose), assets);
        if (nextPose) drawSkeleton(computeSkeleton(nextPose), assets);
        ctx.globalAlpha = 1.0;
    }

    const mainSkeleton = computeSkeleton(isExport ? pose : displayedPose);
    drawSkeleton(mainSkeleton, assets, isExport ? null : selectedPartKey);

    if (!isExport) {
        drawJoints(ctx, mainSkeleton.joints);
        if (activePivot) {
            ctx.fillStyle = PIN_COLOR; ctx.beginPath(); ctx.arc(activePivot.x, activePivot.y, 6, 0, 2 * Math.PI); ctx.fill();
        }
    }
  }, [displayedPose, pose, assets, selectedPartKey, activePivot, prevPose, nextPose]);

  useEffect(() => {
    const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!;
    drawScene(ctx, false);
  }, [drawScene]);

  useImperativeHandle(ref, () => ({
    exportAsPng: () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      
      drawScene(ctx, true);
      const dataURL = canvas.toDataURL('image/png');
      drawScene(ctx, false); // Redraw original scene after export

      const link = document.createElement('a');
      link.download = 'pyxl-puppet.png';
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }));

  const getMousePos = (e: React.MouseEvent): Point => { 
    const canvas = canvasRef.current;
    if (!canvas || scale === 0) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect(); 
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    return { x, y }; 
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const skeleton = computeSkeleton(localPose);
    const pos = getMousePos(e);
    let finalClickedKey: string | null = null;
    let minDistance = Infinity;

    skeleton.bones.forEach(bone => {
        const dist = bone.key === 'ground' 
            ? Math.hypot(pos.x - bone.start.x, pos.y - bone.start.y)
            : distToSegment(pos, bone.start, bone.end);
            
        if (dist < bone.width / 2 + 16 && dist < minDistance) {
            minDistance = dist;
            finalClickedKey = bone.key;
        }
    });

    if (finalClickedKey === 'ground') {
        onSelectPart(finalClickedKey);
        setDraggedPartKey(finalClickedKey);
        dragModeRef.current = 'ground_drag';
        initialPoseRef.current = localPose;
        initialMousePosRef.current = pos;
        setActivePivot(null);
        return;
    }

    if (e.shiftKey && finalClickedKey && !['torso', 'waist', 'head', 'neck'].includes(finalClickedKey)) {
        onSelectPart(finalClickedKey);
        setDraggedPartKey(finalClickedKey);
        dragModeRef.current = 'aim';

        const side = finalClickedKey.startsWith('left') ? 'left' : 'right';
        const isArmPart = ['shoulder', 'elbow', 'hand'].some(p => finalClickedKey.includes(p));
        const limbRootKey = isArmPart ? `${side}.shoulder` : `${side}.hip`;
        
        const pivot = skeleton.joints[limbRootKey];
        if (pivot) {
            setActivePivot(pivot);
        }
        controlledJointRef.current = null;
        return;
    }
    
    if (finalClickedKey) {
        onSelectPart(finalClickedKey);
        setDraggedPartKey(finalClickedKey);
        
        const isEndEffector = ['hand', 'foot'].some(part => finalClickedKey.includes(part));
        
        if (isEndEffector && e.altKey) {
            dragModeRef.current = 'ik';
            controlledJointRef.current = null;
            setActivePivot(null);
        } else {
            const action = boneToControlledAction[finalClickedKey];
            if (action?.type === 'rotate') {
                dragModeRef.current = 'rotate';
                controlledJointRef.current = action.joint;
                const pivotKey = action.pivot || action.joint;
                const pivot = skeleton.joints[pivotKey];
                setActivePivot(pivot);
            }
        }
    } else {
        onDeselect();
    }
  };
  
  const handleIk = (skeleton: Skeleton, snappedPos: Point, bypassConstraints: boolean) => {
    if (!draggedPartKey) return;
    
    const isHand = draggedPartKey.includes('hand');
    const isFoot = draggedPartKey.includes('foot');
    if (!isHand && !isFoot) return;
    
    const side = draggedPartKey.startsWith('left') ? 'left' : 'right' as 'left' | 'right';
    const isArm = isHand;
    
    const rootKey = isArm ? `${side}.shoulder` : `${side}.hip`;
    const midKey = isArm ? `${side}.elbow` : `${side}.knee`;
    const endKey = isArm ? `${side}.hand` : `${side}.foot`;
    
    const chainPoints = [skeleton.joints[rootKey], skeleton.joints[midKey], skeleton.joints[endKey]];
    if (chainPoints.some(p => !p)) return;

    const solvedChain = solveFabrik(chainPoints, snappedPos);
    
    const [newRootPos, newMidPos, newEndPos] = solvedChain;
    const parentAngle = getParentWorldAngle(rootKey, localPose);
    if (parentAngle === null) return;

    const newRootWorldAngle = Math.atan2(newMidPos.y - newRootPos.y, newMidPos.x - newRootPos.x);
    let newRootLocalAngle = newRootWorldAngle - parentAngle;

    const newMidWorldAngle = Math.atan2(newEndPos.y - newMidPos.y, newEndPos.x - newMidPos.x);
    let newMidLocalAngle = newMidWorldAngle - newRootWorldAngle;
    
    if (!bypassConstraints) {
        const rootConstraint = jointConstraints[rootKey];
        if (rootConstraint) newRootLocalAngle = clampAngle(newRootLocalAngle, rootConstraint.min, rootConstraint.max);
        
        const midConstraint = jointConstraints[midKey];
        if (midConstraint) newMidLocalAngle = clampAngle(newMidLocalAngle, midConstraint.min, midConstraint.max);
    }
    
    setLocalPose(p => {
        const newPose = JSON.parse(JSON.stringify(p));
        newPose[side][isArm ? 'shoulder' : 'hip'] = newRootLocalAngle;
        newPose[side][isArm ? 'elbow' : 'knee'] = newMidLocalAngle;
        return newPose;
    });
  };
  
  const handlePan = (pos: Point) => {
    const newOffset = { x: pos.x - initialDragOffset.current.x, y: pos.y - initialDragOffset.current.y };
    setLocalPose(p => constrainPoseToBounds({ ...p, offset: newOffset }));
  };

  const handleRotate = (skeleton: Skeleton, snappedPos: Point, useSnap: boolean, bypassConstraints: boolean) => {
    if (!controlledJointRef.current) return;
    const jointToRotate = controlledJointRef.current;
    
    const action = boneToControlledAction[jointToRotate as keyof typeof boneToControlledAction];
    const pivotKey = action?.pivot || jointToRotate;
    const pivot = skeleton.joints[pivotKey];

    if (!pivot) return;

    const parentAngle = getParentWorldAngle(jointToRotate, localPose);
    if (parentAngle === null) return;

    let newWorldAngle = Math.atan2(snappedPos.y - pivot.y, snappedPos.x - pivot.x);
    let newLocalAngle = newWorldAngle - parentAngle;
    if (useSnap) newLocalAngle = Math.round(newLocalAngle / ANGLE_SNAP) * ANGLE_SNAP;
    
    if (!bypassConstraints) {
        const constraint = jointConstraints[jointToRotate];
        if (constraint) {
            newLocalAngle = clampAngle(newLocalAngle, constraint.min, constraint.max);
        }
    }

    setLocalPose(p => {
        const newPose = JSON.parse(JSON.stringify(p));
        const parts = jointToRotate.split('.');
        if (parts.length === 2) (newPose as any)[parts[0]][parts[1]] = newLocalAngle; 
        else (newPose as any)[jointToRotate] = newLocalAngle;
        return newPose;
    });
  };

  const handleAim = (pos: Point) => {
    if (!draggedPartKey || !activePivot) return;

    const side = draggedPartKey.startsWith('left') ? 'left' : 'right' as 'left' | 'right';
    const isArm = ['shoulder', 'elbow', 'hand'].some(p => draggedPartKey.includes(p));
    const limbRootKey = isArm ? `${side}.shoulder` : `${side}.hip`;
    
    const parentAngle = getParentWorldAngle(limbRootKey, localPose);
    if (parentAngle === null) return;
    
    const newWorldAngle = Math.atan2(pos.y - activePivot.y, pos.x - activePivot.x);
    const newLocalAngle = newWorldAngle - parentAngle;

    setLocalPose(p => {
        const newPose = JSON.parse(JSON.stringify(p));
        if (isArm) {
            newPose[side].shoulder = newLocalAngle;
            if (!draggedPartKey.includes('shoulder')) {
                newPose[side].elbow = 0;
                newPose[side].hand = 0;
            }
        } else {
            newPose[side].hip = newLocalAngle;
            if (!draggedPartKey.includes('hip')) {
                newPose[side].knee = 0;
                newPose[side].foot = 0;
            }
        }
        return newPose;
    });
  };

  const handleGroundDrag = (pos: Point) => {
    if (!initialPoseRef.current) return;
    const initialPose = initialPoseRef.current;
    const initialMouse = initialMousePosRef.current;
    
    const deltaX = pos.x - initialMouse.x;
    const deltaY = pos.y - initialMouse.y;
    
    const ROTATION_SENSITIVITY = 0.005;
    
    const newGroundTilt = initialPose.groundTilt + deltaX * ROTATION_SENSITIVITY;
    const newOffsetY = initialPose.offset.y + deltaY;

    setLocalPose(p => ({
        ...p,
        groundTilt: newGroundTilt,
        offset: {
            x: initialPose.offset.x, // Do not change X offset
            y: newOffsetY
        }
    }));
  };

  const handleMouseMove = (e: React.MouseEvent) => { 
    if (!draggedPartKey) return;
    const skeleton = computeSkeleton(localPose);
    const pos = getMousePos(e);
    const snappedPos = { x: Math.round(pos.x / GRID_SNAP) * GRID_SNAP, y: Math.round(pos.y / GRID_SNAP) * GRID_SNAP };
    
    switch(dragModeRef.current) {
        case 'pan':
            handlePan(pos);
            break;
        case 'ik':
            handleIk(skeleton, snappedPos, e.altKey);
            break;
        case 'rotate':
            handleRotate(skeleton, snappedPos, e.ctrlKey, e.altKey);
            break;
        case 'aim':
            handleAim(pos);
            break;
        case 'ground_drag':
            handleGroundDrag(pos);
            break;
    }
  };

  const handleMouseUp = () => { 
    if (dragModeRef.current) { onPoseCommit(localPose); } 
    setDraggedPartKey(null); 
    setActivePivot(null); 
    dragModeRef.current = null; 
    controlledJointRef.current = null; 
    initialPoseRef.current = null;
  };

  return (
    <div ref={wrapperRef} className="flex-1 flex items-center justify-center relative w-full h-full cursor-crosshair" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      <canvas 
        ref={canvasRef} 
        className="block shadow-2xl rounded-sm" 
        style={{ 
          boxShadow: '0 0 50px rgba(0,0,0,0.2)',
          transform: `scale(${scale})`,
          transformOrigin: 'center'
        }} 
        width={W} 
        height={H} 
      />
    </div>
  );
});
