import { useEffect, useState, useRef } from "react";
import type { FormEvent } from "react";
import { RecordingWidget } from "./components/RecordingWidget";
import { DashboardView } from "./features/dashboard/DashboardView";
import { ScorecardView } from "./features/scoring/components/ScorecardView";
import { InteractiveGrid } from "./components/ui/InteractiveGrid";
import { SpotlightCard } from "./components/ui/SpotlightCard";
import { StepTracker } from "./components/ui/StepTracker";
import { AnimatedCheckbox } from "./components/ui/AnimatedCheckbox";
import { HoverAudioPreview } from "./components/ui/HoverAudioPreview";
import { Check, Pause, Play, ShieldWarning } from "@phosphor-icons/react";
import { Tabs } from "@base-ui/react/tabs";
import { AuroraMesh, CommandDock, CursorHalo, FloatingSparkles, InsightRibbon, NoiseOverlay, SignalLattice } from "./components/ui/PremiumFX";
import "./App.css";
import { apiFetch } from "./lib/api-client";

type SessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; admin: { email: string; fullName: string; institutionName: string } };

interface Session {
  id: string;
  topic: string;
  expected_speaker_count: number;
  status: string;
  recording_source: string;
  duration_seconds: number | null;
  created_at: string;
  speaker_count_mismatch: boolean;
}

function App() {
  const [sessionState, setSessionState] = useState<SessionState>({ status: "loading" });
  const [email, setEmail] = useState("admin@roundtable.local");
  const [password, setPassword] = useState("roundtable-admin");
  const [error, setError] = useState("");

  // App routing state
  const [currentScreen, setCurrentScreen] = useState<"dashboard" | "cohort-dashboard" | "setup" | "record-upload" | "processing" | "signal-lab" | "scorecard">("dashboard");
  const [sessions, setSessions] = useState<Session[]>([]);

  // Screen 1: Session Setup state
  const [topic, setTopic] = useState("");
  const [expectedSpeakerCount, setExpectedSpeakerCount] = useState(3);
  const [participants, setParticipants] = useState<string[]>(["", "", ""]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  // Screen 2: Recording/Upload state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [uploadTab, setUploadTab] = useState<"record" | "upload">("record");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");

  // Screen 3: Processing & Mapping state
  const [sessionStatus, setSessionStatus] = useState<any>(null);
  const [speakerMappings, setSpeakerMappings] = useState<Record<string, string>>({});
  const [mappingError, setMappingError] = useState("");
  const [mappingSubmitting, setMappingSubmitting] = useState(false);

  // Screen 4: Signal Lab playback state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  async function loadSession() {
    const response = await apiFetch("/api/session");
    if (!response.ok) {
      setSessionState({ status: "anonymous" });
      return;
    }
    const data = await response.json();
    setSessionState({ status: "authenticated", admin: data.admin });
    loadSessionsList();
  }

  async function loadSessionsList() {
    const response = await apiFetch("/api/sessions");
    if (response.ok) {
      const data = await response.json();
      setSessions(data);
    }
  }

  useEffect(() => {
    loadSession();
  }, []);

  // Poll status when on Screen 3 or Screen 4
  useEffect(() => {
    if ((currentScreen !== "processing" && currentScreen !== "signal-lab") || !activeSessionId) return;

    const fetchStatus = async () => {
      const res = await apiFetch(`/api/sessions/${activeSessionId}/status`);
      if (res.ok) {
        const data = await res.json();
        setSessionStatus(data);
      }
    };

    fetchStatus();
    // Do not poll constantly on Signal Lab to conserve network, just fetch once or poll slowly
    const interval = setInterval(fetchStatus, currentScreen === "signal-lab" ? 10000 : 3000);
    return () => clearInterval(interval);
  }, [currentScreen, activeSessionId]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await apiFetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      setError("The admin email or password is incorrect.");
      return;
    }
    await loadSession();
  }

  async function handleLogout() {
    await apiFetch("/api/logout", { method: "POST" });
    setSessionState({ status: "anonymous" });
    setCurrentScreen("dashboard");
  }

  const handleSpeakerCountChange = (count: number) => {
    setExpectedSpeakerCount(count);
    setParticipants((prev) => {
      const next = [...prev];
      if (next.length < count) {
        while (next.length < count) next.push("");
      } else if (next.length > count) {
        next.splice(count);
      }
      return next;
    });
  };

  const handleParticipantNameChange = (index: number, val: string) => {
    setParticipants((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  async function handleSetupSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!topic) {
      setError("Topic is required.");
      return;
    }
    if (participants.some((name) => !name.trim())) {
      setError("Please specify names for all participants.");
      return;
    }
    if (!ageConfirmed) {
      setError("You must confirm all participants are 18 or older.");
      return;
    }

    const response = await apiFetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        expectedSpeakerCount,
        participants: participants.filter((p) => p.trim()),
        scheduledAt: scheduledAt || undefined,
      }),
    });

    if (!response.ok) {
      setError("Failed to create session setup.");
      return;
    }

    const data = await response.json();
    setActiveSessionId(data.id);
    setConsentConfirmed(false);
    setSelectedFile(null);
    setUploadError("");
    setUploadProgress(null);
    setCurrentScreen("record-upload");
  }

  async function handleConsentAndUpload(fileBlob: Blob | File, source: "live" | "uploaded", filename?: string) {
    if (!activeSessionId) return;
    setUploadError("");
    setUploadProgress("Recording consent...");

    const consentRes = await apiFetch(`/api/sessions/${activeSessionId}/consent`, {
      method: "POST",
    });
    if (!consentRes.ok) {
      setUploadError("Failed to verify/record student consent.");
      setUploadProgress(null);
      return;
    }

    setUploadProgress("Uploading audio file...");
    const formData = new FormData();
    formData.append("audio", fileBlob, filename || "live_recording.wav");

    const uploadRes = await apiFetch(`/api/sessions/${activeSessionId}/upload?source=${source}`, {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) {
      const errData = await uploadRes.json();
      if (errData.error === "duration_out_of_range") {
        setUploadError("Audio duration must be between 30 seconds and 90 minutes.");
      } else {
        setUploadError("Upload or audio transcoding failed.");
      }
      setUploadProgress(null);
      return;
    }

    setUploadProgress("Audio uploaded and queued for transcription!");
    setTimeout(() => {
      setUploadProgress(null);
      setSessionStatus(null);
      setSpeakerMappings({});
      setMappingError("");
      setCurrentScreen("processing");
    }, 1500);
  }

  async function handleWithdrawConsent() {
    if (!sessionStatus) return;
    if (!window.confirm("Are you sure you want to withdraw consent for this session? This will immediately stop processing, delete the audio recording, and reset the session status.")) {
      return;
    }
    try {
      const response = await apiFetch(`/api/sessions/${sessionStatus.session.id}/withdraw`, {
        method: "POST",
      });
      if (response.ok) {
        alert("Consent withdrawn successfully. The recording has been deleted.");
        setCurrentScreen("dashboard");
        loadSessionsList();
      } else {
        const data = await response.json();
        alert(`Error: ${data.error || "Failed to withdraw consent"}`);
      }
    } catch (e) {
      console.error(e);
      alert("An unexpected error occurred while withdrawing consent.");
    }
  }

  async function handleMappingSubmit(e: FormEvent) {
    e.preventDefault();
    setMappingError("");

    if (!sessionStatus) return;

    const labels = sessionStatus.speakerLabels || [];
    for (const label of labels) {
      if (!speakerMappings[label]) {
        setMappingError(`Please select a participant mapping for Speaker Label ${label}.`);
        return;
      }
    }

    const selectedIds = Object.values(speakerMappings);
    const uniqueIds = new Set(selectedIds);
    if (uniqueIds.size !== selectedIds.length) {
      setMappingError("Each speaker label must be mapped to a unique participant. Check for duplicate selections.");
      return;
    }

    setMappingSubmitting(true);
    const res = await apiFetch(`/api/sessions/${activeSessionId}/map-speakers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappings: speakerMappings }),
    });

    setMappingSubmitting(true); // Let it render the mapping loader
    if (!res.ok) {
      setMappingSubmitting(false);
      setMappingError("Failed to submit speaker mappings to database.");
      return;
    }

    // Refresh immediately to show processing status after mapping
    const statusRes = await apiFetch(`/api/sessions/${activeSessionId}/status`);
    if (statusRes.ok) {
      const data = await statusRes.json();
      setSessionStatus(data);
    }
    setMappingSubmitting(false);
    setSpeakerMappings({});
    setMappingError("");
  }

  const navigateToSessionStatus = (s: Session) => {
    setActiveSessionId(s.id);
    setSessionStatus(null);
    setSpeakerMappings({});
    setMappingError("");
    setCurrentScreen("processing");
  };

  const navigateToScorecard = (s: Session) => {
    setActiveSessionId(s.id);
    setCurrentScreen("scorecard");
  };

  const navigateToSignalLab = (s: Session) => {
    setActiveSessionId(s.id);
    setSessionStatus(null);
    setPlaybackTime(0);
    setPlaybackProgress(0);
    setIsPlaying(false);
    setCurrentScreen("signal-lab");
  };



  // Signal Lab playback handlers
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const current = audioRef.current.currentTime;
    const duration = audioRef.current.duration || 0;
    setPlaybackTime(current);
    setPlaybackDuration(duration);
    setPlaybackProgress(duration > 0 ? (current / duration) * 100 : 0);
  };

  const handleAudioPlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(e => console.error("Playback failed", e));
    }
  };

  const handleUtteranceClick = (startMs: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = startMs / 1000;
    audioRef.current.play().catch(e => console.error("Playback failed", e));
    setIsPlaying(true);
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !playbackDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    audioRef.current.currentTime = percentage * playbackDuration;
    setPlaybackProgress(percentage * 100);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatUtteranceTime = (ms: number) => {
    return formatTime(ms / 1000);
  };

  const getSpeakerBadgeStyle = (label: string) => {
    const colors: Record<string, { bg: string; color: string }> = {
      A: { bg: "rgba(79,168,255,0.15)", color: "#4FA8FF" },
      B: { bg: "rgba(150,120,227,0.15)", color: "#B49BEE" },
      C: { bg: "rgba(255,138,91,0.15)", color: "#FF8A5B" },
      D: { bg: "rgba(61,224,192,0.15)", color: "#3DE0C0" },
      E: { bg: "rgba(199,182,245,0.15)", color: "#C7B6F5" },
      F: { bg: "rgba(100,70,176,0.15)", color: "#6446B0" },
    };
    return colors[label] || { bg: "rgba(46,33,88,0.4)", color: "#A79FC4" };
  };

  const getSpeakerName = (label: string) => {
    if (!sessionStatus) return `Speaker ${label}`;
    const participant = sessionStatus.session.participants.find((p: any) => p.speaker_label === label);
    return participant ? participant.display_name : `Speaker ${label}`;
  };

  if (sessionState.status === "loading") {
    return <main className="app-shell">Loading RoundTable AI...</main>;
  }

  if (sessionState.status === "anonymous") {
    return (
      <main className="relative min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <AuroraMesh />
        <FloatingSparkles />
        <NoiseOverlay />
        <InteractiveGrid />
        <section className="relative z-10 w-full max-w-md p-6 sm:p-8 rounded-2xl" style={{ background: 'rgba(27,17,64,0.72)', backdropFilter: 'blur(20px) saturate(160%)', border: '1px solid rgba(46,33,88,0.6)', borderTopColor: 'rgba(150,120,227,0.18)', boxShadow: '0 12px 32px rgba(0,0,0,0.50), 0 4px 8px rgba(0,0,0,0.30)' }}>
          <div className="mb-8">
            <p className="font-semibold text-sm mb-2 tracking-wide uppercase" style={{ color: 'var(--color-lavender-600)' }}>RoundTable AI</p>
            <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-lavender-800)' }}>Admin login</h1>
            <p style={{ color: 'var(--muted)' }}>Sign in to open the local speech analytics dashboard.</p>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col space-y-4">
            <label className="flex flex-col space-y-1 text-sm font-medium" style={{ color: 'var(--text)' }}>
              Email
              <input 
                className="px-4 py-2 rounded-lg transition-all"
                style={{ background: 'rgba(18,11,41,0.7)', border: '1px solid var(--border)', color: 'var(--text)' }}
                value={email} 
                onChange={(event) => setEmail(event.target.value)} 
              />
            </label>
            <label className="flex flex-col space-y-1 text-sm font-medium" style={{ color: 'var(--text)' }}>
              Password
              <input
                className="px-4 py-2 rounded-lg transition-all"
                style={{ background: 'rgba(18,11,41,0.7)', border: '1px solid var(--border)', color: 'var(--text)' }}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? <p className="text-sm mt-2" style={{ color: 'var(--color-accent-peach)' }}>{error}</p> : null}
            <button 
              type="submit" 
              className="mt-6 w-full py-2.5 font-semibold rounded-lg transition-colors"
              style={{ background: 'linear-gradient(135deg, #9678E3, #6446B0)', color: '#FAF8FF', boxShadow: '0 0 25px rgba(150,120,227,0.40)' }}
            >
              Sign in
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <AuroraMesh />
      <NoiseOverlay />
      <CursorHalo />
      <header className="topbar">
        <div>
          <p className="eyebrow" style={{ cursor: "pointer" }} onClick={() => setCurrentScreen("dashboard")}>
            RoundTable AI
          </p>
          <h1>
            {currentScreen === "dashboard"
              ? "Dashboard"
              : currentScreen === "setup"
              ? "New Session Setup"
              : currentScreen === "record-upload"
              ? "Consent & Upload"
              : currentScreen === "signal-lab"
              ? "Speech Signal Lab"
              : currentScreen === "scorecard"
              ? "Session Scorecard"
               : currentScreen === "cohort-dashboard"
              ? "Cohort Dashboard"
              : "Session Processing Engine"}
          </h1>
        </div>
        <CommandDock
          onDashboard={() => setCurrentScreen("dashboard")}
          onCohort={() => setCurrentScreen("cohort-dashboard")}
          onNewSession={() => { setError(""); setTopic(""); setAgeConfirmed(false); setCurrentScreen("setup"); }}
        />
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {currentScreen === "dashboard" && (
            <>
              <button type="button" onClick={() => setCurrentScreen("cohort-dashboard")} className="secondary w-full sm:w-auto text-xs sm:text-sm" style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1" }}>
                Cohort Leaderboard
              </button>
              <button type="button" onClick={() => { setError(""); setTopic(""); setAgeConfirmed(false); setCurrentScreen("setup"); }} className="w-full sm:w-auto text-xs sm:text-sm">
                Schedule Session
              </button>
            </>
          )}
          {currentScreen === "cohort-dashboard" && (
            <button type="button" onClick={() => setCurrentScreen("dashboard")} className="secondary w-full sm:w-auto text-xs sm:text-sm">
              Active Sessions
            </button>
          )}
          <button type="button" onClick={handleLogout} className="secondary w-full sm:w-auto text-xs sm:text-sm">
            Sign out
          </button>
        </div>
      </header>

      {currentScreen === "dashboard" && (
        <section className="max-w-6xl mx-auto w-full mt-8 px-4 sm:px-6">
          <SpotlightCard className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">Active Assessment Sessions</h2>
                <p className="text-slate-400 text-xs sm:text-sm">Pipeline status and session scoring tracker.</p>
              </div>
              <button 
                type="button" 
                onClick={loadSessionsList} 
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors border border-slate-700 w-full sm:w-auto"
              >
                Refresh
              </button>
            </div>
            {sessions.length === 0 ? (
              <p className="text-slate-400 py-8 text-center font-medium">No sessions created yet. Click "Schedule Session" to get started.</p>
            ) : (
              <>
              <InsightRibbon
                items={[
                  { label: "Sessions", value: String(sessions.length), tone: "live" },
                  { label: "Complete", value: String(sessions.filter((s) => s.status === "complete").length), tone: "neutral" },
                  { label: "In flight", value: String(sessions.filter((s) => s.status !== "complete" && s.status !== "failed").length), tone: "mock" },
                ]}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-xs sm:text-sm font-semibold uppercase tracking-wider">
                      <th className="py-4 px-2">Topic</th>
                      <th className="py-4 px-2">Speakers</th>
                      <th className="py-4 px-2">Status</th>
                      <th className="py-4 px-2 hidden sm:table-cell">Source</th>
                      <th className="py-4 px-2 hidden sm:table-cell">Duration</th>
                      <th className="py-4 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.id} className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors text-slate-300 text-sm">
                        <td className="py-4 px-2 font-semibold text-white">{s.topic}</td>
                        <td className="py-4 px-2">{s.expected_speaker_count} participants</td>
                        <td className="py-4 px-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${
                            s.status === "complete" 
                              ? "bg-teal-500/10 text-teal-400 border-teal-500/20" 
                              : s.status === "failed" 
                              ? "bg-red-500/10 text-red-400 border-red-500/20" 
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="py-4 px-2 capitalize hidden sm:table-cell">{s.recording_source}</td>
                        <td className="py-4 px-2 hidden sm:table-cell">{s.duration_seconds ? `${s.duration_seconds}s` : "--"}</td>
                        <td className="py-4 px-2 text-right">
                          <div className="flex justify-end gap-2">
                            {s.status === "complete" || s.status === "scoring" ? (
                              <>
                                <button 
                                  type="button" 
                                  onClick={() => navigateToSignalLab(s)} 
                                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-md transition-colors border border-slate-700"
                                >
                                  Signal Lab
                                </button>
                                <button 
                                  type="button" 
                                  onClick={() => navigateToScorecard(s)} 
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md transition-colors shadow-[0_0_10px_rgba(37,99,235,0.3)]"
                                >
                                  Scorecard
                                </button>
                                <button 
                                  type="button" 
                                  onClick={() => navigateToSessionStatus(s)} 
                                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs font-semibold rounded-md transition-colors border border-slate-800"
                                >
                                  Logs
                                </button>
                              </>
                            ) : (
                              <button 
                                type="button" 
                                onClick={() => navigateToSessionStatus(s)} 
                                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-md transition-colors shadow-[0_0_10px_rgba(13,148,136,0.3)]"
                              >
                                Open Status
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </SpotlightCard>
        </section>
      )}

      {currentScreen === "setup" && (
        <section className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-[250px_1fr] gap-8 mt-8 px-4 sm:px-6">
          {/* Sidebar Tracker */}
          <div className="hidden md:block">
            <StepTracker 
              steps={[
                { id: "setup", label: "Session Setup" },
                { id: "consent", label: "Consent & Upload" },
                { id: "processing", label: "Processing" }
              ]} 
              currentStepId="setup" 
            />
          </div>

          {/* Main Form */}
          <SpotlightCard className="p-6 sm:p-8">
            <form onSubmit={handleSetupSubmit} className="flex flex-col space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Create Assessment Session</h2>
                <p className="text-slate-400 text-sm">Define the topic and participants for the upcoming group discussion.</p>
              </div>
              
              <label className="flex flex-col space-y-2 text-sm font-medium text-slate-300">
                Group Discussion Topic
                <input 
                  className="px-4 py-2 bg-slate-950/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                  value={topic} 
                  onChange={(e) => setTopic(e.target.value)} 
                  placeholder="e.g. Impact of AI on Placement Assessments" 
                />
              </label>

              <label className="flex flex-col space-y-2 text-sm font-medium text-slate-300">
                Expected Speaker Count (3 - 6)
                <input
                  className="px-4 py-2 bg-slate-950/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                  type="number"
                  min="3"
                  max="6"
                  value={expectedSpeakerCount}
                  onChange={(e) => handleSpeakerCountChange(parseInt(e.target.value) || 3)}
                />
              </label>

              <div className="flex flex-col space-y-3">
                <p className="font-bold text-sm text-slate-300">Participant Names</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {participants.map((name, idx) => (
                    <input
                      key={idx}
                      className="px-4 py-2 bg-slate-950/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                      value={name}
                      onChange={(e) => handleParticipantNameChange(idx, e.target.value)}
                      placeholder={`Participant ${idx + 1} Name`}
                    />
                  ))}
                </div>
              </div>

              <label className="flex flex-col space-y-2 text-sm font-medium text-slate-300">
                Scheduled Date/Time (Optional)
                <input 
                  className="px-4 py-2 bg-slate-950/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                  type="datetime-local" 
                  value={scheduledAt} 
                  onChange={(e) => setScheduledAt(e.target.value)} 
                />
              </label>

              <div className="pt-2 border-t border-slate-800">
                <AnimatedCheckbox 
                  checked={ageConfirmed}
                  onChange={setAgeConfirmed}
                  label="I confirm that all participants are 18 years of age or older"
                />
              </div>

              {error ? <p className="text-red-400 text-sm">{error}</p> : null}

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4">
                <button type="submit" className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg transition-colors shadow-[0_0_15px_rgba(13,148,136,0.3)] w-full">
                  Next: Consent & Recording
                </button>
                <button type="button" onClick={() => setCurrentScreen("dashboard")} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors w-full sm:w-auto">
                  Cancel
                </button>
              </div>
            </form>
          </SpotlightCard>
        </section>
      )}

      {currentScreen === "record-upload" && (
        <section className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-[250px_1fr] gap-8 mt-8 px-4 sm:px-6">
          <div className="hidden md:block">
            <StepTracker 
              steps={[
                { id: "setup", label: "Session Setup" },
                { id: "consent", label: "Consent & Upload" },
                { id: "processing", label: "Processing" }
              ]} 
              currentStepId="consent" 
            />
          </div>

          <SpotlightCard className="p-6 sm:p-8">
            <div className="flex flex-col space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Step 2: Consent and Recording</h2>
                <p className="text-slate-400 text-sm">Review consent requirements and provide the audio source.</p>
              </div>
              
                <div className="text-slate-400 text-sm leading-relaxed consent-copy space-y-3">
                  <p>By checking the box below, you certify that all participants in this group discussion have agreed to the following consent terms:</p>
                  <p className="pl-4 border-l-2 border-slate-700 italic">This group discussion will be audio-recorded for the purpose of academic/placement assessment. The recording will be processed using a third-party AI service, AssemblyAI, for transcription and speaker separation (on AssemblyAI's free tier, submitted audio may be used, after automated removal of personally identifying information, to help improve AssemblyAI's speech models, as AssemblyAI's free tier does not currently offer an opt-out from this). A second third-party service, Google Gemini (with Groq as a technical fallback), is used to generate a relevance-based scorecard and a plain-language communication summary from the anonymized transcript text only — student names are never sent to either LLM service. Separately, the platform analyzes acoustic properties of the recording itself (pitch, loudness, pauses) using software that runs locally and does not send audio to any third party for this specific analysis. These acoustic measurements describe vocal signal properties only — they are not used to infer emotion, confidence, or any psychological trait. The resulting scorecard is reviewed by the institution's placement/admissions team. Recordings are retained for 30 days after scoring is confirmed, after which the raw audio is deleted; anonymized transcripts, scores, and analytics may be retained longer for record-keeping. You may withdraw consent at any time before your session is scored by informing the evaluator, in which case your recording will not be processed and will be deleted. If any participant is under 18, separate parental/guardian consent is required before this session can proceed.</p>
                </div>

              <div className="py-2">
                <AnimatedCheckbox 
                  checked={consentConfirmed}
                  onChange={setConsentConfirmed}
                  label="I confirm that all participants have signed the consent form"
                />
              </div>

              {consentConfirmed && (
                <div className="pt-6 border-t border-slate-800 space-y-6">
                  <Tabs.Root
                    value={uploadTab}
                    onValueChange={(value) => {
                      setUploadTab(value as "record" | "upload");
                      setUploadError("");
                    }}
                    className="premium-tabs"
                  >
                    <Tabs.List className="premium-tabs-list">
                      <Tabs.Tab value="record" className="premium-tab">Record Live</Tabs.Tab>
                      <Tabs.Tab value="upload" className="premium-tab">Upload Recording</Tabs.Tab>
                      <Tabs.Indicator className="premium-tab-indicator" />
                    </Tabs.List>
                  </Tabs.Root>

                  {uploadTab === "record" ? (
                    <RecordingWidget onStop={(blob) => handleConsentAndUpload(blob, "live")} />
                  ) : (
                    <div className="flex flex-col space-y-4">
                      <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center bg-slate-900 hover:bg-slate-800 transition-colors">
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                          className="hidden"
                          id="audio-uploader"
                        />
                        <label htmlFor="audio-uploader" className="cursor-pointer flex flex-col items-center">
                          <span className="text-teal-400 font-semibold mb-2">
                            {selectedFile ? `Selected: ${selectedFile.name}` : "Click to pick an audio file"}
                          </span>
                          <span className="text-slate-500 text-xs">
                            Supports WAV, MP3, MP4, M4A, WEBM up to 300MB
                          </span>
                        </label>
                      </div>

                      {selectedFile && (
                        <button
                          type="button"
                          onClick={() => handleConsentAndUpload(selectedFile, "uploaded", selectedFile.name)}
                          className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg transition-colors shadow-[0_0_15px_rgba(13,148,136,0.3)]"
                        >
                          Upload and Normalize
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {uploadProgress && (
                <div className="text-teal-400 font-medium text-center animate-pulse">
                  {uploadProgress}
                </div>
              )}

              {uploadError && (
                <div className="text-red-400 font-medium text-center bg-red-950/30 py-2 rounded-lg border border-red-900/50">
                  {uploadError}
                </div>
              )}
            </div>
          </SpotlightCard>
        </section>
      )}

      {currentScreen === "processing" && (
        <section className="max-w-4xl mx-auto w-full mt-8 px-4 sm:px-6">
          <SpotlightCard className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">Assessment Processing Engine</h2>
                <p className="text-slate-400 text-xs sm:text-sm">Pipeline status and manual mapping.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {sessionStatus && sessionStatus.session.status !== "complete" && sessionStatus.session.status !== "scoring" && (
                  <button 
                    type="button" 
                    onClick={handleWithdrawConsent} 
                    className="px-4 py-2 bg-red-950/60 hover:bg-red-950/80 text-red-200 border border-red-900/50 font-medium rounded-lg transition-colors w-full sm:w-auto"
                  >
                    Withdraw Consent
                  </button>
                )}
                <button 
                  type="button" 
                  onClick={() => { setCurrentScreen("dashboard"); loadSessionsList(); }} 
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors w-full sm:w-auto"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>

            {sessionStatus ? (
              <div className="flex flex-col space-y-8">
                {/* Topic info */}
                <div className="bg-slate-950/50 p-6 rounded-xl border border-slate-800">
                  <p className="text-teal-400 font-semibold text-xs uppercase tracking-wider mb-1">Session Target</p>
                  <h3 className="text-xl font-bold text-white mb-2">{sessionStatus.session.topic}</h3>
                  <div className="flex space-x-4 text-sm text-slate-400">
                    <span className="flex items-center"><strong className="text-slate-300 mr-1">Speakers:</strong> {sessionStatus.session.expected_speaker_count}</span>
                    <span className="flex items-center"><strong className="text-slate-300 mr-1">Source:</strong> <span className="capitalize">{sessionStatus.session.recording_source}</span></span>
                    {sessionStatus.session.transcription_source === "mock" && (
                      <span className="notice-pill mock"><ShieldWarning size={14} weight="fill" /> Synthetic/demo transcript</span>
                    )}
                  </div>
                </div>

                {/* Speaker mismatch warning banner */}
                {sessionStatus.session.speaker_count_mismatch && (
                  <div className="bg-amber-950/30 border border-amber-900/50 rounded-xl p-4 flex space-x-3 items-start">
                    <span className="text-2xl">⚠️</span>
                    <div>
                      <p className="font-bold text-amber-500">Speaker Count Mismatch</p>
                      <p className="text-sm text-amber-400/80 mt-1">
                        The AI diarization engine detected a different number of speakers than the expected count of {sessionStatus.session.expected_speaker_count}. Review mappings carefully.
                      </p>
                    </div>
                  </div>
                )}

                {/* Job Error surfacing */}
                {sessionStatus.session.status === "failed" && (
                  <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4 flex space-x-3 items-start">
                    <span className="text-2xl">❌</span>
                    <div>
                      <p className="font-bold text-red-500">Pipeline Processing Failed</p>
                      <p className="text-sm text-red-400/80 mt-1">
                        Error: {sessionStatus.session.jobs?.[0]?.error_message || "Unknown internal pipeline failure."}
                      </p>
                    </div>
                  </div>
                )}

                {/* Step Progress Tracker - Horizontal for Processing */}
                <div className="py-4">
                  <div className="flex items-center justify-between w-full max-w-3xl mx-auto relative">
                    <div className="absolute left-0 top-1/2 w-full h-0.5 bg-slate-800 -z-10 -translate-y-1/2" />
                    {[
                      { id: "uploaded", label: "Uploaded" },
                      { id: "mapped", label: "Mapping" },
                      { id: "analyzing", label: "Analytics" },
                      { id: "scoring", label: "Scoring" },
                      { id: "complete", label: "Done" }
                    ].map((step, idx) => {
                      const statuses = ["uploaded", "transcribing", "mapped", "analyzing", "scoring", "complete"];
                      const currentIdx = statuses.indexOf(sessionStatus.session.status) === -1 ? 0 : statuses.indexOf(sessionStatus.session.status);
                      const myIdx = step.id === "mapped" ? 2 : step.id === "analyzing" ? 3 : step.id === "scoring" ? 4 : step.id === "complete" ? 5 : 0;
                      
                      const isActive = sessionStatus.session.status === step.id || (step.id === "mapped" && sessionStatus.session.status === "transcribing");
                      const isCompleted = currentIdx > myIdx;

                      return (
                        <div key={step.id} className="flex flex-col items-center bg-slate-900 px-1 sm:px-2 group">
                          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                            isCompleted ? "bg-teal-500 border-teal-500" : isActive ? "bg-slate-800 border-teal-400 shadow-[0_0_15px_rgba(45,212,191,0.3)] animate-pulse" : "bg-slate-900 border-slate-700"
                          }`}>
                            {isCompleted ? (
                              <Check size={16} weight="bold" color="white" />
                            ) : (
                              <span className={`text-xs font-bold ${isActive ? "text-teal-400" : "text-slate-500"}`}>{idx + 1}</span>
                            )}
                          </div>
                          <span className={`text-[10px] sm:text-xs font-medium mt-2 transition-colors text-center max-w-[55px] sm:max-w-none leading-tight ${
                            isActive ? "text-teal-400" : isCompleted ? "text-slate-300" : "text-slate-500"
                          }`}>
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Processing State Messaging */}
                {(sessionStatus.session.status === "transcribing" || sessionStatus.session.status === "uploaded") && (
                  <div className="text-center py-12">
                    <SignalLattice active />
                    <div className="inline-block w-12 h-12 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin mb-4" />
                    <p className="font-bold text-white text-lg">Transcribing Audio & Identifying Speakers</p>
                    <p className="text-slate-400 text-sm mt-2">Diarization models are mapping unique voice signatures...</p>
                  </div>
                )}

                {sessionStatus.session.status === "analyzing" && (
                  <div className="text-center py-12">
                    <div className="inline-block w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mb-4" />
                    <p className="font-bold text-white text-lg">Extracting Acoustic Features</p>
                    <p className="text-slate-400 text-sm mt-2">Running digital signal processing for pitch, energy, and turn-taking metrics...</p>
                  </div>
                )}

                {sessionStatus.session.status === "scoring" && (
                  <div className="text-center py-12">
                    <div className="inline-block w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                    <p className="font-bold text-white text-lg">Generating Rubric Scores</p>
                    <p className="text-slate-400 text-sm mt-2">Waiting for live scoring, or creating visibly labeled demo scores when keys are absent...</p>
                  </div>
                )}

                {/* Speaker Mapping Form */}
                {sessionStatus.session.status === "mapped" && (
                  <form onSubmit={handleMappingSubmit} className="pt-6 border-t border-slate-800">
                    <div className="mb-6">
                      <h3 className="text-lg font-bold text-white mb-2">Map Voices to Participants</h3>
                      <p className="text-slate-400 text-sm">
                        Hover over a speaker card to hear their voice, then assign the correct participant name.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {sessionStatus.speakerLabels.map((label: string) => (
                        <div key={label} className="flex flex-col space-y-2">
                          <HoverAudioPreview 
                            participantName={`Speaker ${label}`}
                            speakerLabel={label}
                            audioUrl={`/api/sessions/${activeSessionId}/speakers/preview/${label}`}
                          />
                          <select
                            className="px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all w-full text-sm"
                            value={speakerMappings[label] || ""}
                            onChange={(e) => setSpeakerMappings((prev) => ({ ...prev, [label]: e.target.value }))}
                          >
                            <option value="">-- Assign to Student --</option>
                            {sessionStatus.session.participants.map((p: any) => (
                              <option key={p.id} value={p.id}>{p.display_name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>

                    {mappingError && (
                      <p className="text-red-400 text-sm text-center mt-6 bg-red-950/30 py-2 rounded-lg">{mappingError}</p>
                    )}

                    <button
                      type="submit"
                      disabled={mappingSubmitting}
                      className="w-full mt-6 py-3 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg transition-colors shadow-[0_0_15px_rgba(13,148,136,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {mappingSubmitting ? "Submitting Mappings..." : "Confirm Mappings & Analyze"}
                    </button>
                  </form>
                )}

                {/* Complete State */}
                {sessionStatus.session.status === "complete" && (
                  <div className="text-center py-10 bg-gradient-to-b from-teal-900/20 to-slate-900 rounded-2xl border border-teal-900/50">
                    <div className="w-16 h-16 bg-teal-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(20,184,166,0.5)]">
                      <Check size={32} weight="bold" color="white" />
                    </div>
                    <p className="text-2xl font-bold text-white mb-2">Evaluation Completed!</p>
                    <p className="text-slate-400 mb-8">All speech metrics and qualitative scores are ready.</p>
                    
                    <div className="flex justify-center gap-4">
                      <button 
                        type="button" 
                        onClick={() => navigateToScorecard(sessionStatus.session)} 
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors shadow-[0_0_15px_rgba(37,99,235,0.4)]"
                      >
                        View Scorecard
                      </button>
                      <button 
                        type="button" 
                        onClick={() => navigateToSignalLab(sessionStatus.session)} 
                        className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg transition-colors shadow-[0_0_15px_rgba(13,148,136,0.4)]"
                      >
                        Enter Signal Lab
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-20 animate-pulse">
                <p className="text-slate-400 font-medium">Connecting to Processing Engine...</p>
              </div>
            )}
          </SpotlightCard>
        </section>
      )}

      {currentScreen === "signal-lab" && (
        <section className="max-w-6xl mx-auto w-full mt-8 px-4 sm:px-6">
          <div className="panel" style={{ display: "grid", gap: "25px" }}>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">Speech Signal Exploration Lab</h2>
                {sessionStatus && (
                  <p className="muted" style={{ fontSize: "0.9rem", marginTop: "4px" }}>
                    Topic: <strong>{sessionStatus.session.topic}</strong> | Expected Speakers: {sessionStatus.session.expected_speaker_count}
                  </p>
                )}
                {sessionStatus?.session.transcription_source === "mock" && (
                  <div className="mock-banner compact" style={{ marginTop: "12px" }}>
                    <ShieldWarning size={20} weight="fill" />
                    <strong>Synthetic/demo transcript</strong>
                    <span>Transcript-derived segments came from the mock transcription path.</span>
                  </div>
                )}
              </div>
              <button type="button" onClick={() => { setCurrentScreen("dashboard"); loadSessionsList(); }} className="secondary w-full sm:w-auto">
                Back to Dashboard
              </button>
            </div>

            {sessionStatus ? (
              <div className="signal-lab-grid">
                {/* Main plot and audio player column */}
                <div style={{ display: "grid", gap: "20px" }}>
                  
                  {/* Waveform timeline */}
                  <div>
                    <h4 className="font-bold mb-2" style={{ color: 'var(--text)' }}>Full-Session Waveform</h4>
                    <SpotlightCard className="p-0 border border-slate-700">
                      <div 
                        className="relative w-full h-auto cursor-crosshair overflow-hidden group" 
                        onClick={handleTimelineClick}
                      >
                        <img 
                          className="w-full h-auto opacity-80 group-hover:opacity-100 transition-opacity" 
                          src={`/api/sessions/${activeSessionId}/plots/waveform?t=${Date.now()}`} 
                          alt="Waveform plot" 
                        />
                        <div className="absolute top-0 bottom-0 w-px pointer-events-none transition-all duration-100" style={{ left: `${playbackProgress}%`, background: 'var(--color-lavender-500)', boxShadow: '0 0 12px rgba(150,120,227,0.8)' }} />
                      </div>
                    </SpotlightCard>
                  </div>

                  {/* Spectrogram timeline */}
                  <div>
                    <h4 className="font-bold mb-2 mt-4" style={{ color: 'var(--text)' }}>Log-Frequency Spectrogram</h4>
                    <SpotlightCard className="p-0 border border-slate-700">
                      <div 
                        className="relative w-full h-auto cursor-crosshair overflow-hidden group" 
                        onClick={handleTimelineClick}
                      >
                        <img 
                          className="w-full h-auto mix-blend-screen opacity-90 group-hover:opacity-100 transition-opacity" 
                          src={`/api/sessions/${activeSessionId}/plots/spectrogram?t=${Date.now()}`} 
                          alt="Spectrogram plot" 
                        />
                        <div className="absolute top-0 bottom-0 w-px pointer-events-none transition-all duration-100" style={{ left: `${playbackProgress}%`, background: 'var(--color-lavender-500)', boxShadow: '0 0 12px rgba(150,120,227,0.8)' }} />
                      </div>
                    </SpotlightCard>
                  </div>

                  {/* HTML5 Audio Player control block */}
                  <div style={{ background: "rgba(27,17,64,0.65)", border: "1px solid var(--border)", padding: "15px", borderRadius: "14px", display: "grid", gap: "10px", backdropFilter: "blur(8px)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <button type="button" onClick={handleAudioPlayPause} style={{ minWidth: "120px" }}>
                        {isPlaying ? <><Pause size={16} weight="fill" /> Pause</> : <><Play size={16} weight="fill" /> Play</>}
                      </button>
                      <span style={{ fontWeight: "bold", fontFamily: "monospace", fontSize: "1.1rem", color: "var(--color-lavender-700)" }}>
                        {formatTime(playbackTime)} / {formatTime(playbackDuration)}
                      </span>
                    </div>
                    <audio
                      ref={audioRef}
                      src={`/api/sessions/${activeSessionId}/audio`}
                      onTimeUpdate={handleTimeUpdate}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onLoadedMetadata={handleTimeUpdate}
                      style={{ width: "100%" }}
                    />
                  </div>

                  {/* Interactive transcript section */}
                  <div>
                    <h3 style={{ marginBottom: "12px", color: "var(--text)" }}>Session Transcript (Click to Seek)</h3>
                    <div className="transcript-list">
                      {sessionStatus.session.utterances && sessionStatus.session.utterances.length > 0 ? (
                        sessionStatus.session.utterances.map((u: any) => {
                          const badge = getSpeakerBadgeStyle(u.speaker_label);
                          return (
                            <div
                              key={u.id}
                              className="transcript-item"
                              onClick={() => handleUtteranceClick(u.start_ms)}
                            >
                              <div className="transcript-item-meta">
                                <div
                                  className="speaker-badge-tag text-center"
                                  style={{ background: badge.bg, color: badge.color }}
                                >
                                  {getSpeakerName(u.speaker_label)}
                                </div>
                                <div style={{ color: "var(--muted)", fontSize: "0.85rem", fontFamily: "monospace", minWidth: "90px" }}>
                                  [{formatUtteranceTime(u.start_ms)} - {formatUtteranceTime(u.end_ms)}]
                                </div>
                              </div>
                              <div className="transcript-item-text" style={{ color: "var(--text)", fontSize: "0.95rem" }}>
                                {u.text}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="muted" style={{ padding: "20px" }}>No utterances found.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Metrics Sidebar column */}
                <div className="metrics-sidebar">
                  <h3 style={{ color: "var(--text)" }}>Participant Analytics</h3>
                  {sessionStatus.session.speech_metrics && sessionStatus.session.speech_metrics.length > 0 ? (
                    sessionStatus.session.speech_metrics.map((m: any) => {
                      const badge = getSpeakerBadgeStyle(m.participant.speaker_label || "A");
                      return (
                        <div key={m.id} className="metric-card">
                          <div className="metric-card-header">
                            <span>{m.participant.display_name}</span>
                            <span className="metric-badge" style={{ background: badge.bg, color: badge.color }}>
                              Voice {m.participant.speaker_label || "A"}
                            </span>
                          </div>
                          
                          <div className="metric-grid">
                            <div className="metric-val-box">
                              <span className="metric-label">WPM</span>
                              <span className="metric-val">{Number(m.wpm).toFixed(0)}</span>
                            </div>
                            <div className="metric-val-box">
                              <span className="metric-label">Participation</span>
                              <span className="metric-val">{Number(m.participation_pct).toFixed(1)}%</span>
                            </div>
                            <div className="metric-val-box">
                              <span className="metric-label">Filler Rate</span>
                              <span className="metric-val">{Number(m.filler_rate).toFixed(1)}%</span>
                            </div>
                            <div className="metric-val-box">
                              <span className="metric-label">Vocab MTLD</span>
                              <span className="metric-val">{m.vocab_mtld_score ? Number(m.vocab_mtld_score).toFixed(1) : "N/A"}</span>
                            </div>
                            <div className="metric-val-box">
                              <span className="metric-label">Speech Turns</span>
                              <span className="metric-val">{m.turns_count}</span>
                            </div>
                            <div className="metric-val-box">
                              <span className="metric-label">Avg Turn</span>
                              <span className="metric-val">{(Number(m.avg_turn_ms) / 1000).toFixed(1)}s</span>
                            </div>
                            <div className="metric-val-box">
                              <span className="metric-label">Pitch Mean</span>
                              <span className="metric-val">{m.pitch_mean_hz ? `${Number(m.pitch_mean_hz).toFixed(0)} Hz` : "N/A"}</span>
                            </div>
                            <div className="metric-val-box">
                              <span className="metric-label">Pauses Count</span>
                              <span className="metric-val">{m.pause_count ?? "N/A"}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="muted">No metrics available.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="muted">Loading speech signal lab details...</p>
            )}
          </div>
        </section>
      )}

      {currentScreen === "cohort-dashboard" && (
        <DashboardView onSelectSession={(id) => { setActiveSessionId(id); setCurrentScreen('scorecard'); }} />
      )}

      {currentScreen === "scorecard" && activeSessionId && (
        <div style={{ paddingBottom: '50px' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto 20px', padding: '0 20px' }}>
            <button type="button" onClick={() => setCurrentScreen("cohort-dashboard")} className="secondary mt-4">
               ← Back to Leaderboard
            </button>
          </div>
          <ScorecardView sessionId={activeSessionId} />
        </div>
      )}
    </main>
  );
}

export default App;
