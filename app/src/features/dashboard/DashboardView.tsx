import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { CalendarBlank, ChartLineUp, Sparkle, UsersThree, WarningCircle } from "@phosphor-icons/react";

type ParticipantRow = {
  id: string;
  display_name: string;
  score: number | null;
  is_mock: boolean;
  sessionTopic: string;
  sessionId: string;
  date: string;
};

function TiltRow({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const ref = useRef<HTMLTableRowElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseXSpring = useSpring(x, { stiffness: 260, damping: 28 });
  const mouseYSpring = useSpring(y, { stiffness: 260, damping: 28 });
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["1.4deg", "-1.4deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-1.4deg", "1.4deg"]);

  return (
    <motion.tr
      ref={ref}
      onMouseMove={(event) => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        x.set((event.clientX - rect.left) / rect.width - 0.5);
        y.set((event.clientY - rect.top) / rect.height - 0.5);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      onClick={onClick}
      style={{ rotateX, rotateY, transformPerspective: 1000 }}
      whileHover={{ scale: 1.006 }}
      className="rt-table-row"
    >
      {children}
    </motion.tr>
  );
}

function SessionGallery({ sessions, onSelect }: { sessions: any[]; onSelect: (id: string) => void }) {
  return (
    <div className="session-gallery" aria-label="Session browser">
      {sessions.map((session) => (
        <motion.button
          key={session.id}
          type="button"
          whileHover={{ y: -4, scale: 1.015 }}
          whileTap={{ scale: 0.985 }}
          onClick={() => onSelect(session.id)}
          className="session-card"
        >
          <span className="soft-icon"><Sparkle size={22} weight="duotone" /></span>
          <span className="session-date">{new Date(session.created_at).toLocaleDateString()}</span>
          <strong>{session.topic}</strong>
          <span className="session-meta">
            <span><UsersThree size={16} weight="duotone" /> {session.participant_count}</span>
            <span className={session.average_score === null ? "score-pill muted-pill" : "score-pill"}>
              {session.average_score === null ? "Not scored" : `${session.average_score} avg`}
            </span>
          </span>
          {session.transcription_source === "mock" && (
            <span className="notice-pill mock">Synthetic transcript</span>
          )}
        </motion.button>
      ))}
    </div>
  );
}

import { apiFetch } from "../../lib/api-client";

export function DashboardView({ onSelectSession }: { onSelectSession: (id: string) => void }) {
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    apiFetch("/api/scoring")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]));
  }, []);

  const allParticipants = useMemo<ParticipantRow[]>(() => {
    return sessions
      .flatMap((session) =>
        session.participants.map((participant: any) => ({
          ...participant,
          sessionTopic: session.topic,
          sessionId: session.id,
          date: session.created_at,
        }))
      )
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [sessions]);

  if (sessions.length === 0) {
    return (
      <section className="rt-page narrow">
        <div className="empty-state">
          <span className="soft-icon large"><ChartLineUp size={34} weight="duotone" /></span>
          <h2>No scored sessions yet</h2>
          <p>Completed scorecards will appear here after live or clearly labeled demo scoring runs.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rt-page">
      <div className="section-heading">
        <span className="eyebrow">Cohort dashboard</span>
        <h2>Session browser and leaderboard</h2>
        <p>Unscored participants are excluded from averages and shown explicitly.</p>
      </div>

      <SessionGallery sessions={sessions} onSelect={onSelectSession} />

      <div className="rt-card table-card">
        <div className="card-heading">
          <CalendarBlank size={22} weight="duotone" />
          <h3>Global leaderboard</h3>
        </div>
        <div className="table-wrap">
          <table className="rt-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Student</th>
                <th className="hidden-mobile-col">Discussion topic</th>
                <th>Score state</th>
              </tr>
            </thead>
            <tbody>
              {allParticipants.map((participant, index) => (
                <TiltRow key={participant.id} onClick={() => onSelectSession(participant.sessionId)}>
                  <td>{participant.score === null ? "--" : index + 1}</td>
                  <td><strong>{participant.display_name}</strong></td>
                  <td className="hidden-mobile-col">{participant.sessionTopic}</td>
                  <td>
                    {participant.score === null ? (
                      <span className="notice-pill neutral">Not yet scored</span>
                    ) : (
                      <span className="score-pill">{participant.score}</span>
                    )}
                    {participant.is_mock && (
                      <span className="notice-pill mock inline"><WarningCircle size={14} weight="fill" /> Mock score</span>
                    )}
                  </td>
                </TiltRow>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
