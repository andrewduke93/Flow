import React from 'react';
import { Play, Pause, ArrowLeft, ArrowRight, ScanEye, AlignLeft } from 'lucide-react';
import { motion } from 'framer-motion';

interface ZuneControlsProps {
  mode: 'scroll' | 'rsvp';
  isPlaying: boolean;
  wpm: number;
  onTogglePlay: () => void;
  onToggleMode: () => void;
  onSpeedChange: (delta: number) => void;
}

/**
 * ZuneControls (The Soul)
 * Identity: Industrial Designer.
 * Mission: A perfectly balanced, centered control rod. 
 * The Play button is the nucleus.
 */
export const ZuneControls: React.FC<ZuneControlsProps> = ({ 
  mode, 
  isPlaying, 
  wpm, 
  onTogglePlay, 
  onToggleMode, 
  onSpeedChange 
}) => {
  return (
    <motion.div 
       initial={{ y: 100, opacity: 0 }}
       animate={{ y: 0, opacity: 1 }}
       transition={{ type: "spring", stiffness: 200, damping: 20 }}
       className="fixed bottom-12 left-0 right-0 flex justify-center z-50 pointer-events-none pb-safe"
    >
      <div className="pointer-events-auto bg-[#0a0a0a]/90 backdrop-blur-2xl border border-white/10 rounded-full py-2 px-3 flex items-center shadow-[0_20px_50px_rgba(0,0,0,0.8)] ring-1 ring-white/5 gap-4">
         
         {/* LEFT SATELLITE: Mode & Context */}
         <div className="flex items-center gap-1 pl-2">
             <button 
               onClick={onToggleMode}
               className="group relative flex items-center justify-center w-12 h-12 rounded-full hover:bg-white/10 transition-all active:scale-95"
               aria-label="Toggle Reading Mode"
             >
                {mode === 'rsvp' ? (
                    <AlignLeft size={20} className="text-white/70 group-hover:text-white transition-colors" />
                ) : (
                    <ScanEye size={20} className="text-white/70 group-hover:text-white transition-colors" />
                )}
             </button>
         </div>

         {/* DIVIDER */}
         <div className="w-px h-6 bg-white/10" />

         {/* CENTER NUCLEUS: The Play Button */}
         <button 
           onClick={onTogglePlay}
           className="w-20 h-20 -my-6 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)] group relative z-10"
         >
            {isPlaying ? (
                <Pause size={32} fill="currentColor" className="relative z-10" />
            ) : (
                <Play size={32} fill="currentColor" className="ml-1 relative z-10" />
            )}
         </button>

         {/* DIVIDER */}
         <div className="w-px h-6 bg-white/10" />

         {/* RIGHT SATELLITE: Speed Control */}
         <div className="flex items-center gap-2 pr-2">
             <button 
                onClick={() => onSpeedChange(-25)} 
                className="w-10 h-10 flex items-center justify-center text-white/40 hover:text-white transition-colors active:scale-90"
             >
                <ArrowLeft size={16} />
             </button>
             
             <div className="flex flex-col items-center w-12 cursor-default select-none">
                 <span className="text-base font-black text-white tabular-nums leading-none tracking-tight">{wpm}</span>
                 <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest leading-none mt-0.5">wpm</span>
             </div>
             
             <button 
                onClick={() => onSpeedChange(25)} 
                className="w-10 h-10 flex items-center justify-center text-white/40 hover:text-white transition-colors active:scale-90"
             >
                <ArrowRight size={16} />
             </button>
         </div>

      </div>
    </motion.div>
  );
};