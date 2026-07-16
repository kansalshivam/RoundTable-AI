import React, { useEffect, useRef, useState } from "react";
import anime from "animejs";
import { motion, useScroll, useSpring } from "motion/react";
import { ChevronDown, AlertTriangle } from "lucide-react";

// Motion Primitives ScrollProgress component
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <motion.div
      style={{ scaleX }}
      className="fixed top-0 left-0 right-0 h-1.5 bg-teal-500 origin-left z-50 shadow-[0_0_10px_rgba(20,184,166,0.5)]"
    />
  );
}

// Animate UI Accordion (React+Framer Motion pattern)
function AnimatedAccordion({ title, children, score }: { title: string, children: React.ReactNode, score: number }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="border border-slate-800 rounded-lg mb-2 overflow-hidden bg-slate-900">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-slate-950/40 hover:bg-slate-950/70 transition-colors text-left"
      >
        <span className="font-semibold text-slate-200">{title}</span>
        <div className="flex items-center gap-4">
          <span className="font-bold text-teal-400">{score}/100</span>
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
            <ChevronDown className="w-5 h-5 text-slate-400" />
          </motion.div>
        </div>
      </button>
      <motion.div
        initial={false}
        animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
        className="overflow-hidden"
      >
        <div className="p-4 text-sm text-slate-300 bg-slate-950/20 border-t border-slate-800/60">
          {children}
        </div>
      </motion.div>
    </div>
  );
}

export function ScorecardView({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/scoring/${sessionId}`)
      .then(res => res.json())
      .then(d => setData(d));
  }, [sessionId]);

  // anime.js synchronized timeline entrance for sub-scores
  useEffect(() => {
    if (data && containerRef.current) {
      const timeline = anime.timeline({
        easing: 'easeOutExpo',
        duration: 800
      });

      // Target all elements with class rubric-card inside the container
      timeline.add({
        targets: containerRef.current.querySelectorAll('.rubric-card'),
        opacity: [0, 1],
        translateY: [20, 0],
        delay: anime.stagger(150, {start: 300})
      });
    }
  }, [data]);

  if (!data) return <div className="p-8 text-center text-slate-400 font-medium">Loading scorecard...</div>;

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 text-white" ref={containerRef}>
      <ScrollProgress />
      
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Session Scorecard</h1>
        <p className="text-slate-400">Topic: {data.topic}</p>
      </div>

      <div className="space-y-12">
        {data.participants.map((participant: any) => {
          const score = participant.scores?.[0];
          const metrics = participant.speech_metrics?.[0];
          
          if (!score) return null;

          return (
            <div key={participant.id} className="bg-slate-900 rounded-xl shadow-2xl border border-slate-800 overflow-hidden">
              {/* Header */}
              <div className="p-6 border-b border-slate-800 flex items-start justify-between bg-slate-950/40">
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    {participant.display_name} 
                    {score.flagged_low_data && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded-full border border-amber-500/20">
                        <AlertTriangle className="w-3.5 h-3.5" /> Low Data
                      </span>
                    )}
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">Speaker {participant.speaker_label}</p>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-black text-teal-400 shadow-teal-500/20">{score.aggregate_score}</div>
                  <div className="text-xs text-slate-400 font-medium uppercase tracking-wider mt-1">Aggregate</div>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* Left Col: Rubric & Summary */}
                <div>
                  <h3 className="text-lg font-bold text-slate-200 mb-4">Competency Rubric</h3>
                  <div className="space-y-2">
                    <div className="rubric-card opacity-0">
                      <AnimatedAccordion title="Topic Relevance" score={score.topic_relevance_score}>
                        {score.topic_relevance_rationale}
                      </AnimatedAccordion>
                    </div>
                    <div className="rubric-card opacity-0">
                      <AnimatedAccordion title="Initiative & Engagement" score={score.initiative_engagement_score}>
                        {score.initiative_engagement_rationale}
                      </AnimatedAccordion>
                    </div>
                    <div className="rubric-card opacity-0">
                      <AnimatedAccordion title="Coherence & Structure" score={score.coherence_structure_score}>
                        {score.coherence_structure_rationale}
                      </AnimatedAccordion>
                    </div>
                    <div className="rubric-card opacity-0">
                      <AnimatedAccordion title="Responsiveness" score={score.responsiveness_score}>
                        {score.responsiveness_rationale}
                      </AnimatedAccordion>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-slate-200 mt-8 mb-4">Communication Summary</h3>
                  <div className="bg-slate-950/40 rounded-lg p-4 border border-slate-800 space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">Strengths</h4>
                      <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
                        {score.communication_summary_strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">Areas for Improvement</h4>
                      <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
                        {score.communication_summary_improvements.map((s: string, i: number) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Right Col: Analytics */}
                <div>
                   <h3 className="text-lg font-bold text-slate-200 mb-4">Acoustic & Transcript Analytics</h3>
                   <div className="grid grid-cols-2 gap-3">
                     <StatCard label="Speaking Time" value={metrics ? `${Math.round(metrics.speaking_time_ms / 1000)}s` : 'N/A'} />
                     <StatCard label="Participation" value={metrics ? `${Number(metrics.participation_pct).toFixed(1)}%` : 'N/A'} />
                     <StatCard label="WPM" value={metrics?.wpm ? Number(metrics.wpm).toFixed(0) : 'N/A'} />
                     <StatCard label="Filler Rate" value={metrics ? `${Number(metrics.filler_rate).toFixed(1)}%` : 'N/A'} />
                     <StatCard label="Turns Taken" value={metrics?.turns_count || 'N/A'} />
                     <StatCard label="Vocab (MTLD)" value={metrics?.vocab_mtld_score ? Number(metrics.vocab_mtld_score).toFixed(1) : 'N/A'} />
                     <StatCard label="Avg Pitch" value={metrics?.pitch_mean_hz ? `${Math.round(metrics.pitch_mean_hz)} Hz` : 'N/A'} />
                     <StatCard label="Avg Pause" value={metrics?.avg_pause_ms ? `${Math.round(metrics.avg_pause_ms)} ms` : 'N/A'} />
                   </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>
      
      {/* Transcript Panel */}
      <div className="mt-12 bg-slate-900 rounded-xl shadow-2xl border border-slate-800 overflow-hidden">
        <div className="p-4 bg-slate-950/40 border-b border-slate-800">
           <h3 className="font-bold text-slate-200">Synchronized Transcript</h3>
        </div>
        <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
          {data.utterances.map((u: any) => {
             const participant = data.participants.find((p: any) => p.speaker_label === u.speaker_label);
             const isTarget = participant ? true : false;
             return (
               <div key={u.id} className="flex gap-4 hover:bg-slate-800/30 p-2 rounded transition-colors">
                 <div className="w-16 text-right text-xs text-slate-500 font-mono shrink-0 pt-1">
                   {Math.floor(u.start_ms / 60000)}:{(Math.floor((u.start_ms % 60000) / 1000)).toString().padStart(2, '0')}
                 </div>
                 <div>
                   <span className={`font-bold text-sm ${isTarget ? 'text-teal-400' : 'text-slate-400'}`}>
                     {participant ? participant.display_name : `Speaker ${u.speaker_label}`}
                   </span>
                   <p className="text-slate-300 text-sm mt-0.5">{u.text}</p>
                 </div>
               </div>
             )
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="bg-slate-950/30 border border-slate-800/80 rounded-lg p-3">
      <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</div>
      <div className="text-lg font-bold text-white">{value}</div>
    </div>
  );
}
