import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic2, Play } from "lucide-react";

interface HoverAudioPreviewProps {
  participantName: string;
  speakerLabel: string;
  audioUrl?: string; // Optional audio URL for preview
}

export function HoverAudioPreview({ participantName, speakerLabel, audioUrl }: HoverAudioPreviewProps) {
  const [isHovered, setIsHovered] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto play/pause based on hover state
  useEffect(() => {
    if (!audioRef.current || !audioUrl) return;

    if (isHovered) {
      // Play and fade in
      audioRef.current.volume = 0;
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          let vol = 0;
          const fade = setInterval(() => {
            if (vol < 0.9) {
              vol += 0.1;
              if (audioRef.current) audioRef.current.volume = vol;
            } else {
              clearInterval(fade);
            }
          }, 50);
        }).catch(err => console.log("Audio play prevented:", err));
      }
    } else {
      // Fade out and pause
      let vol = audioRef.current.volume;
      const fade = setInterval(() => {
        if (vol > 0.1) {
          vol -= 0.1;
          if (audioRef.current) audioRef.current.volume = vol;
        } else {
          clearInterval(fade);
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
        }
      }, 50);
    }
  }, [isHovered, audioUrl]);

  return (
    <div 
      className="relative flex items-center justify-between p-4 bg-slate-800 rounded-lg border border-slate-700 overflow-hidden cursor-pointer group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}
      
      <div className="flex items-center space-x-3 z-10 relative">
        <div className="w-10 h-10 rounded-full bg-teal-900/50 text-teal-400 flex items-center justify-center font-bold shadow-[0_0_15px_rgba(45,212,191,0.2)] group-hover:shadow-[0_0_20px_rgba(45,212,191,0.5)] transition-shadow">
          {speakerLabel}
        </div>
        <div>
          <p className="font-semibold text-slate-200 group-hover:text-white transition-colors">{participantName}</p>
          <div className="flex items-center text-xs text-slate-400 mt-1">
            <Mic2 className="w-3 h-3 mr-1" />
            <span>Detected Voice</span>
          </div>
        </div>
      </div>
      
      <div className="z-10 relative">
        <AnimatePresence mode="wait">
          {isHovered ? (
            <motion.div
              key="playing"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center shadow-[0_0_15px_rgba(45,212,191,0.6)]"
            >
              {/* Simple EQ animation */}
              <div className="flex items-end space-x-0.5 h-4">
                <motion.div animate={{ height: ["40%", "100%", "40%"] }} transition={{ repeat: Infinity, duration: 0.5 }} className="w-1 bg-white rounded-t-sm" />
                <motion.div animate={{ height: ["80%", "30%", "80%"] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-1 bg-white rounded-t-sm" />
                <motion.div animate={{ height: ["30%", "90%", "30%"] }} transition={{ repeat: Infinity, duration: 0.4 }} className="w-1 bg-white rounded-t-sm" />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 group-hover:text-white transition-colors"
            >
              <Play className="w-4 h-4 ml-0.5" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hover Background Sweep Effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-teal-900/0 via-teal-900/20 to-teal-900/0 transform -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] pointer-events-none" />
    </div>
  );
}
