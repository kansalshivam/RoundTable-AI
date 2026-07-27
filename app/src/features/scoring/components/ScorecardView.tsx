import { useEffect, useRef, useState } from "react";
import anime from "animejs";
import { motion, useScroll, useSpring } from "motion/react";
import { CaretDown, ChartBar, ShieldWarning, Sparkle, WarningCircle } from "@phosphor-icons/react";

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 32, restDelta: 0.001 });
  return <motion.div style={{ scaleX }} className="scroll-progress" />;
}

function AnimatedAccordion({ title, children, score }: { title: string; children: React.ReactNode; score: number }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="accordion">
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="accordion-trigger">
        <span>{title}</span>
        <span className="accordion-score">{score}/100</span>
        <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.18 }}>
          <CaretDown size={18} weight="bold" />
        </motion.span>
      </button>
      <motion.div initial={false} animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }} className="accordion-panel">
        <div>{children}</div>
      </motion.div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

import { apiFetch } from "../../../lib/api-client";

export function ScorecardView({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch(`/api/scoring/${sessionId}`)
      .then((res) => res.json())
      .then((payload) => setData(payload));
  }, [sessionId]);

  useEffect(() => {
    if (!data || !containerRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    anime.timeline({ easing: "easeOutExpo", duration: 620 }).add({
      targets: containerRef.current.querySelectorAll(".rubric-card"),
      opacity: [0, 1],
      translateY: [14, 0],
      delay: anime.stagger(120, { start: 160 }),
    });
  }, [data]);

  if (!data) {
    return (
      <section className="rt-page narrow">
        <div className="skeleton-card" />
        <div className="skeleton-card short" />
      </section>
    );
  }

  const hasMockTranscript = data.transcription_source === "mock";

  return (
    <section className="rt-page" ref={containerRef}>
      <ScrollProgress />
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-6 border-b border-slate-800 pb-4">
        <div className="section-heading mb-0">
          <span className="eyebrow">Session scorecard</span>
          <h2 className="text-xl sm:text-2xl md:text-3xl">{data.topic}</h2>
          <p>Rubric scores, transcript analytics, and synchronized transcript evidence.</p>
        </div>
        <button
          type="button"
          onClick={() => window.open(`/api/sessions/${data.id}/export`, "_blank")}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg transition-colors shadow-[0_0_15px_rgba(13,148,136,0.3)] text-sm w-full md:w-auto self-start md:self-end"
        >
          Export CSV
        </button>
      </div>

      {hasMockTranscript && (
        <div className="mock-banner">
          <ShieldWarning size={22} weight="fill" />
          <strong>Synthetic/demo transcript</strong>
          <span>This session was not transcribed by AssemblyAI. Treat all transcript-derived analytics as demo data.</span>
        </div>
      )}

      <div className="scorecard-stack">
        {data.participants.map((participant: any) => {
          const score = participant.scores?.[0];
          const metrics = participant.speech_metrics?.[0];
          if (!score) {
            return (
              <article key={participant.id} className="rt-card scorecard-card">
                <div className="scorecard-header">
                  <div>
                    <h3>{participant.display_name}</h3>
                    <p>Speaker {participant.speaker_label || "unmapped"}</p>
                  </div>
                  <span className="notice-pill neutral">Not yet scored</span>
                </div>
              </article>
            );
          }

          return (
            <article key={participant.id} className="rt-card scorecard-card">
              <div className="scorecard-header">
                <div>
                  <h3>
                    {participant.display_name}
                    {score.flagged_low_data && <span className="notice-pill warn"><WarningCircle size={14} weight="fill" /> Low data</span>}
                  </h3>
                  <p>Speaker {participant.speaker_label}</p>
                </div>
                <div className="aggregate-score">
                  <strong>{score.aggregate_score}</strong>
                  <span>Aggregate</span>
                </div>
              </div>

              {score.is_mock && (
                <div className="mock-banner compact">
                  <ShieldWarning size={20} weight="fill" />
                  <strong>Demo / Mock Score</strong>
                  <span>Not generated by a live Gemini or Groq model.</span>
                </div>
              )}

              <div className="scorecard-grid">
                <div>
                  <div className="card-heading"><Sparkle size={20} weight="duotone" /><h4>Competency rubric</h4></div>
                  <div className="rubric-list">
                    <div className="rubric-card"><AnimatedAccordion title="Topic Relevance" score={score.topic_relevance_score}>{score.topic_relevance_rationale}</AnimatedAccordion></div>
                    <div className="rubric-card"><AnimatedAccordion title="Initiative & Engagement" score={score.initiative_engagement_score}>{score.initiative_engagement_rationale}</AnimatedAccordion></div>
                    <div className="rubric-card"><AnimatedAccordion title="Coherence & Structure" score={score.coherence_structure_score}>{score.coherence_structure_rationale}</AnimatedAccordion></div>
                    <div className="rubric-card"><AnimatedAccordion title="Responsiveness" score={score.responsiveness_score}>{score.responsiveness_rationale}</AnimatedAccordion></div>
                  </div>
                </div>

                <div>
                  <div className="card-heading"><ChartBar size={20} weight="duotone" /><h4>Analytics</h4></div>
                  <div className="stat-grid">
                    <StatCard label="Speaking time" value={metrics ? `${Math.round(metrics.speaking_time_ms / 1000)}s` : "N/A"} />
                    <StatCard label="Participation" value={metrics ? `${Number(metrics.participation_pct).toFixed(1)}%` : "N/A"} />
                    <StatCard label="WPM" value={metrics?.wpm ? Number(metrics.wpm).toFixed(0) : "N/A"} />
                    <StatCard label="Filler rate" value={metrics ? `${Number(metrics.filler_rate).toFixed(1)}%` : "N/A"} />
                    <StatCard label="Turns" value={metrics?.turns_count || "N/A"} />
                    <StatCard label="MTLD" value={metrics?.vocab_mtld_score ? Number(metrics.vocab_mtld_score).toFixed(1) : "N/A"} />
                    <StatCard label="Pitch" value={metrics?.pitch_mean_hz ? `${Math.round(metrics.pitch_mean_hz)} Hz` : "N/A"} />
                    <StatCard label="Avg pause" value={metrics?.avg_pause_ms ? `${Math.round(metrics.avg_pause_ms)} ms` : "N/A"} />
                  </div>
                </div>
              </div>

              <div className="summary-grid">
                <div>
                  <h4>Strengths</h4>
                  <ul>{(Array.isArray(score.communication_summary_strengths) ? score.communication_summary_strengths : []).map((item: string, i: number) => <li key={i}>{item}</li>)}</ul>
                </div>
                <div>
                  <h4>Improvements</h4>
                  <ul>{(Array.isArray(score.communication_summary_improvements) ? score.communication_summary_improvements : []).map((item: string, i: number) => <li key={i}>{item}</li>)}</ul>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="rt-card transcript-card">
        <div className="card-heading"><h3>Synchronized transcript</h3></div>
        {hasMockTranscript && <span className="notice-pill mock">Synthetic/demo transcript</span>}
        <div className="transcript-list">
          {data.utterances.map((utterance: any) => {
            const participant = data.participants.find((p: any) => p.speaker_label === utterance.speaker_label);
            return (
              <div key={utterance.id} className="transcript-row">
                <span className="timecode">{Math.floor(utterance.start_ms / 60000)}:{Math.floor((utterance.start_ms % 60000) / 1000).toString().padStart(2, "0")}</span>
                <div>
                  <strong>{participant ? participant.display_name : `Speaker ${utterance.speaker_label}`}</strong>
                  <p>{utterance.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
