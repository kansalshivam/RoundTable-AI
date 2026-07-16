import React, { useEffect, useState, useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { Play, Users, Calendar } from "lucide-react";

// Motion Primitives Tilt Component (simplified for rows)
function TiltRow({ children, onClick }: { children: React.ReactNode, onClick?: () => void }) {
  const ref = useRef<HTMLTableRowElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x, { stiffness: 300, damping: 30 });
  const mouseYSpring = useSpring(y, { stiffness: 300, damping: 30 });

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["2deg", "-2deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-2deg", "2deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLTableRowElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.tr
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={{ rotateX, rotateY, transformPerspective: 1000 }}
      className="border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer transition-colors bg-slate-900/60 relative z-10"
      whileHover={{ scale: 1.01, zIndex: 20, boxShadow: "0px 10px 30px -10px rgba(0,0,0,0.5)" }}
    >
      {children}
    </motion.tr>
  );
}

// React Bits Circular/Horizontal Gallery interpretation
function SessionGallery({ sessions, onSelect }: { sessions: any[], onSelect: (id: string) => void }) {
  return (
    <div className="w-full overflow-x-auto pb-8 pt-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      <div className="flex gap-6 px-4" style={{ width: 'max-content' }}>
        {sessions.map((session) => (
          <motion.div
            key={session.id}
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onSelect(session.id)}
            className="w-64 h-40 rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 shadow-2xl p-5 flex flex-col justify-between cursor-pointer border border-slate-800 relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Play className="w-16 h-16 text-teal-400" />
            </div>
            
            <div>
              <div className="text-teal-400 text-xs font-bold uppercase tracking-wider mb-2">
                {new Date(session.created_at).toLocaleDateString()}
              </div>
              <h3 className="text-white font-bold text-lg leading-tight line-clamp-2">
                {session.topic}
              </h3>
            </div>
            
            <div className="flex items-center justify-between text-slate-300 text-sm">
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-slate-400" />
                <span>{session.participants.length}</span>
              </div>
              <div className="font-bold text-teal-400 bg-teal-400/10 px-2 py-0.5 rounded">
                {session.participants.reduce((acc: number, curr: any) => acc + curr.score, 0) / (session.participants.length || 1)} Avg
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function DashboardView({ onSelectSession }: { onSelectSession: (id: string) => void }) {
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/scoring")
      .then(res => res.json())
      .then(d => setSessions(d));
  }, []);

  if (sessions.length === 0) {
    return <div className="p-12 text-center text-slate-400 font-medium">No completed sessions yet.</div>;
  }

  // Flatten all participants across sessions for the leaderboard
  const allParticipants = sessions.flatMap(s => 
    s.participants.map((p: any) => ({
      ...p,
      sessionTopic: s.topic,
      sessionId: s.id,
      date: s.created_at
    }))
  ).sort((a, b) => b.score - a.score);

  return (
    <div className="max-w-6xl mx-auto py-12 px-4 text-white">
      <div className="mb-8 px-4">
        <h1 className="text-3xl font-bold text-white mb-2">Cohort Leaderboard</h1>
        <p className="text-slate-400">Historical performance across all completed GD sessions.</p>
      </div>

      {/* React Bits Gallery */}
      <SessionGallery sessions={sessions} onSelect={onSelectSession} />

      {/* Motion Primitives Tilt Table */}
      <div className="mt-8 px-4">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-teal-400" />
          Global Leaderboard
        </h2>
        
        <div className="bg-slate-900 rounded-xl shadow-2xl border border-slate-800 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 text-sm font-semibold uppercase tracking-wider">
                <th className="p-4 rounded-tl-xl">Rank</th>
                <th className="p-4">Student Name</th>
                <th className="p-4 hidden md:table-cell">Discussion Topic</th>
                <th className="p-4 text-right rounded-tr-xl">Aggregate Score</th>
              </tr>
            </thead>
            <tbody>
              {allParticipants.map((p, index) => (
                <TiltRow key={p.id} onClick={() => onSelectSession(p.sessionId)}>
                  <td className="p-4 text-slate-400 font-medium">{index + 1}</td>
                  <td className="p-4 font-bold text-white">{p.display_name}</td>
                  <td className="p-4 text-slate-400 hidden md:table-cell">{p.sessionTopic}</td>
                  <td className="p-4 text-right">
                    <span className="inline-block bg-teal-500/10 text-teal-400 font-bold px-3 py-1 rounded-full">
                      {p.score}
                    </span>
                  </td>
                </TiltRow>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
