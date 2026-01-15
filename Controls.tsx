import React from 'react';

interface ControlsProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playhead: number;
  onScrub: (value: number) => void;
  numFrames: number;
  currentIndex: number;
  onAddFrame: () => void;
  onDeleteFrame: () => void;
  onSelectFrame: (index: number) => void;
  isPhysicsEnabled: boolean;
  onTogglePhysics: () => void;
  selectedPartKey: string | null;
  onBindAsset: () => void;
  onExportPng: () => void;
  onExportJson: () => void;
}

const UndoIcon = () => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 18L5 13M5 13L10 8M5 13H16C18.7614 13 21 15.2386 21 18V20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> );
const RedoIcon = () => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 18L19 13M19 13L14 8M19 13H8C5.23858 13 3 15.2386 3 18V20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> );
const PlayIcon = () => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 5V19L19 12L8 5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> );
const PauseIcon = () => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 5V19M18 5V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> );
const AddIcon = () => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> );
const DeleteIcon = () => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 7H20M10 11V17M14 11V17M5 7L6 19C6 20.1046 6.89543 21 8 21H16C17.1046 21 18 20.1046 18 19L19 7M9 7V4C9 3.44772 9.44772 3 10 3H14C14.5523 3 15 3.44772 15 4V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> );
const PhysicsIcon = () => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/> <path d="M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" transform="rotate(60 12 12)"/> <path d="M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" transform="rotate(120 12 12)"/> <circle cx="12" cy="12" r="2" fill="currentColor"/> </svg> );
const ExportIcon = () => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 15L12 3M12 15L8 11M12 15L16 11M4 17L4 21L20 21L20 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> );


export function Controls({ onUndo, onRedo, canUndo, canRedo, isPlaying, onTogglePlay, playhead, onScrub, numFrames, currentIndex, onAddFrame, onDeleteFrame, onSelectFrame, isPhysicsEnabled, onTogglePhysics, selectedPartKey, onBindAsset, onExportPng, onExportJson }: ControlsProps) {
  const buttonClass = "p-2 rounded-md transition-colors text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed";

  return (
     <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-[90%] max-w-6xl bg-[#1a1a1a] border border-white/10 rounded-xl p-2 shadow-2xl flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <button onClick={onUndo} disabled={!canUndo} className={buttonClass} title="Undo" aria-label="Undo"><UndoIcon /></button>
        <button onClick={onRedo} disabled={!canRedo} className={buttonClass} title="Redo" aria-label="Redo"><RedoIcon /></button>
      </div>
      
      <div className="flex-1 flex items-center gap-4">
        <button onClick={onTogglePlay} className={buttonClass} title={isPlaying ? 'Pause' : 'Play'} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="relative w-full flex items-center h-4">
            <input type="range" min={0} max={numFrames > 1 ? numFrames - 1 : 0} step={0.01} value={playhead} onChange={(e) => onScrub(parseFloat(e.target.value))} className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer" title="Timeline"/>
            {Array.from({ length: numFrames }).map((_, i) => ( <button key={i} className={`absolute w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2 top-1/2 transition-transform ${currentIndex === i ? 'bg-red-500 scale-150' : 'bg-white/50 hover:bg-white'}`} style={{ left: `${(i / (numFrames - 1 || 1)) * 100}%` }} onClick={() => onSelectFrame(i)} title={`Frame ${i + 1}`} aria-label={`Select frame ${i + 1}`} /> ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={onAddFrame} className={buttonClass} title="Add Frame" aria-label="Add Frame"><AddIcon /></button>
        <button onClick={onDeleteFrame} disabled={numFrames <= 1} className={buttonClass} title="Delete Frame" aria-label="Delete Frame"><DeleteIcon /></button>
      </div>

      {selectedPartKey && (
        <div className="flex items-center gap-2 border-l border-white/10 pl-4 ml-2">
            <span className="text-white/50 text-sm font-mono uppercase">{selectedPartKey}</span>
            <button onClick={onBindAsset} className="px-3 py-1 rounded-md text-sm bg-white/10 text-white hover:bg-white/20" title="Bind a custom image to the selected part">Bind Image</button>
        </div>
      )}

      <div className="flex items-center gap-2 border-l border-white/10 pl-4 ml-2">
          <button onClick={onTogglePhysics} className={`relative p-2 rounded-md transition-colors text-white ${isPhysicsEnabled ? 'bg-blue-500' : 'bg-white/10 hover:bg-blue-500/50'}`} title="Toggle Physics Simulation" aria-label="Toggle Physics Simulation">
            <PhysicsIcon />
          </button>
      </div>

      <div className="flex items-center gap-2 border-l border-white/10 pl-4 ml-2">
         <div className="relative group">
            <button className={buttonClass} title="Export"><ExportIcon /></button>
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-32 bg-[#2a2a2a] border border-white/10 rounded-md shadow-xl p-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                <button onClick={onExportPng} className="w-full text-left text-sm text-white/70 hover:bg-white/10 hover:text-white rounded px-2 py-1">Save PNG</button>
                <button onClick={onExportJson} className="w-full text-left text-sm text-white/70 hover:bg-white/10 hover:text-white rounded px-2 py-1">Save JSON</button>
            </div>
        </div>
      </div>
     </div>
  );
}