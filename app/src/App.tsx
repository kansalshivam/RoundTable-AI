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
import "./App.css";

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
    const response = await fetch("/api/session");
    if (!response.ok) {
      setSessionState({ status: "anonymous" });
      return;
    }
    const data = await response.json();
    setSessionState({ status: "authenticated", admin: data.admin });
    loadSessionsList();
  }

  async function loadSessionsList() {
    const response = await fetch("/api/sessions");
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
      const res = await fetch(`/api/sessions/${activeSessionId}/status`);
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
    const response = await fetch("/api/login", {
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
    await fetch("/api/logout", { method: "POST" });
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

    const response = await fetch("/api/sessions", {
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

    const consentRes = await fetch(`/api/sessions/${activeSessionId}/consent`, {
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

    const uploadRes = await fetch(`/api/sessions/${activeSessionId}/upload?source=${source}`, {
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
    const res = await fetch(`/api/sessions/${activeSessionId}/map-speakers`, {
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
    const statusRes = await fetch(`/api/sessions/${activeSessionId}/status`);
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
      A: { bg: "#e0f2fe", color: "#0369a1" },
      B: { bg: "#e0e7ff", color: "#4338ca" },
      C: { bg: "#fef3c7", color: "#b45309" },
      D: { bg: "#dcfce7", color: "#15803d" },
      E: { bg: "#fce7f3", color: "#be185d" },
      F: { bg: "#f3e8ff", color: "#7e22ce" },
    };
    return colors[label] || { bg: "#f1f5f9", color: "#475569" };
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
      <main className="relative min-h-screen flex items-center justify-center bg-slate-950">
        <InteractiveGrid />
        <section className="relative z-10 w-full max-w-md p-8 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl">
          <div className="mb-8">
            <p className="text-teal-400 font-semibold text-sm mb-2 tracking-wide uppercase">RoundTable AI</p>
            <h1 className="text-3xl font-bold text-white mb-2">Admin login</h1>
            <p className="text-slate-400">Sign in to open the local speech analytics dashboard.</p>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col space-y-4">
            <label className="flex flex-col space-y-1 text-sm font-medium text-slate-300">
              Email
              <input 
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                value={email} 
                onChange={(event) => setEmail(event.target.value)} 
              />
            </label>
            <label className="flex flex-col space-y-1 text-sm font-medium text-slate-300">
              Password
              <input
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? <p className="text-red-400 text-sm mt-2">{error}</p> : null}
            <button 
              type="submit" 
              className="mt-6 w-full py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg transition-colors shadow-[0_0_15px_rgba(13,148,136,0.4)]"
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
        <div style={{ display: "flex", gap: "10px" }}>
          {currentScreen === "dashboard" && (
            <>
              <button type="button" onClick={() => setCurrentScreen("cohort-dashboard")} className="secondary" style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1" }}>
                Cohort Leaderboard
              </button>
              <button type="button" onClick={() => { setError(""); setTopic(""); setAgeConfirmed(false); setCurrentScreen("setup"); }}>
                Schedule Session
              </button>
            </>
          )}
          {currentScreen === "cohort-dashboard" && (
            <button type="button" onClick={() => setCurrentScreen("dashboard")} className="secondary">
              Active Sessions
            </button>
          )}
          <button type="button" onClick={handleLogout} className="secondary">
            Sign out
          </button>
        </div>
      </header>

      {currentScreen === "dashboard" && (
        <section className="max-w-6xl mx-auto w-full mt-8">
          <SpotlightCard className="p-8">
            <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Active Assessment Sessions</h2>
                <p className="text-slate-400 text-sm">Real-time signal processing and session scoring tracker.</p>
              </div>
              <button 
                type="button" 
                onClick={loadSessionsList} 
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors border border-slate-700"
              >
                Refresh
              </button>
            </div>
            {sessions.length === 0 ? (
              <p className="text-slate-400 py-8 text-center font-medium">No sessions created yet. Click "Schedule Session" to get started.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-sm font-semibold uppercase tracking-wider">
                      <th className="py-4 px-2">Topic</th>
                      <th className="py-4 px-2">Speakers</th>
                      <th className="py-4 px-2">Status</th>
                      <th className="py-4 px-2">Source</th>
                      <th className="py-4 px-2">Duration</th>
                      <th className="py-4 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.id} className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors text-slate-300">
                        <td className="py-4 px-2 font-semibold text-white">{s.topic}</td>
                        <td className="py-4 px-2">{s.expected_speaker_count} participants</td>
                        <td className="py-4 px-2">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                            s.status === "complete" 
                              ? "bg-teal-500/10 text-teal-400 border-teal-500/20" 
                              : s.status === "failed" 
                              ? "bg-red-500/10 text-red-400 border-red-500/20" 
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="py-4 px-2 capitalize">{s.recording_source}</td>
                        <td className="py-4 px-2">{s.duration_seconds ? `${s.duration_seconds}s` : "--"}</td>
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
            )}
          </SpotlightCard>
        </section>
      )}

      {currentScreen === "setup" && (
        <section className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-[250px_1fr] gap-8 mt-8">
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
          <SpotlightCard className="p-8">
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

              <div className="flex gap-4 pt-4">
                <button type="submit" className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg transition-colors shadow-[0_0_15px_rgba(13,148,136,0.3)]">
                  Next: Consent & Recording
                </button>
                <button type="button" onClick={() => setCurrentScreen("dashboard")} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </SpotlightCard>
        </section>
      )}

      {currentScreen === "record-upload" && (
        <section className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-[250px_1fr] gap-8 mt-8">
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

          <SpotlightCard className="p-8">
            <div className="flex flex-col space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Step 2: Consent and Recording</h2>
                <p className="text-slate-400 text-sm">Review consent requirements and provide the audio source.</p>
              </div>
              
              <div className="bg-slate-950/50 border border-slate-700/50 p-4 rounded-xl">
                <h3 className="text-white font-semibold mb-2">Participant Consent Affirmation</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  By checking the box below, you certify that all participants in this group discussion have signed the physically printed or digital institutional consent form allowing their voice signals to be recorded, transcoded, and analyzed.
                </p>
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
                  <div className="flex p-1 bg-slate-900 rounded-lg border border-slate-700 w-full max-w-sm mx-auto">
                    <button
                      type="button"
                      onClick={() => { setUploadTab("record"); setUploadError(""); }}
                      className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                        uploadTab === "record" ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Record Live
                    </button>
                    <button
                      type="button"
                      onClick={() => { setUploadTab("upload"); setUploadError(""); }}
                      className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                        uploadTab === "upload" ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Upload Recording
                    </button>
                  </div>

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
        <section className="max-w-4xl mx-auto w-full mt-8">
          <SpotlightCard className="p-8">
            <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Assessment Processing Engine</h2>
                <p className="text-slate-400 text-sm">Real-time pipeline status and manual mapping.</p>
              </div>
              <button 
                type="button" 
                onClick={() => { setCurrentScreen("dashboard"); loadSessionsList(); }} 
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors"
              >
                Back to Dashboard
              </button>
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
                        <div key={step.id} className="flex flex-col items-center bg-slate-900 px-2 group">
                          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                            isCompleted ? "bg-teal-500 border-teal-500" : isActive ? "bg-slate-800 border-teal-400 shadow-[0_0_15px_rgba(45,212,191,0.3)] animate-pulse" : "bg-slate-900 border-slate-700"
                          }`}>
                            {isCompleted ? (
                              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <span className={`text-xs font-bold ${isActive ? "text-teal-400" : "text-slate-500"}`}>{idx + 1}</span>
                            )}
                          </div>
                          <span className={`text-xs font-medium mt-2 transition-colors ${
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
                    <p className="text-slate-400 text-sm mt-2">LLMs are evaluating coherence, relevance, and initiative...</p>
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
                      <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
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
        <section style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div className="panel" style={{ display: "grid", gap: "25px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2>Speech Signal Exploration Lab</h2>
                {sessionStatus && (
                  <p className="muted" style={{ fontSize: "0.9rem", marginTop: "4px" }}>
                    Topic: <strong>{sessionStatus.session.topic}</strong> | Expected Speakers: {sessionStatus.session.expected_speaker_count}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => { setCurrentScreen("dashboard"); loadSessionsList(); }} className="secondary">
                Back to Dashboard
              </button>
            </div>

            {sessionStatus ? (
              <div className="signal-lab-grid">
                {/* Main plot and audio player column */}
                <div style={{ display: "grid", gap: "20px" }}>
                  
                  {/* Waveform timeline */}
                  <div>
                    <h4 className="font-bold text-slate-200 mb-2">Full-Session Waveform</h4>
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
                        <div className="absolute top-0 bottom-0 w-px bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.8)] pointer-events-none transition-all duration-100" style={{ left: `${playbackProgress}%` }} />
                      </div>
                    </SpotlightCard>
                  </div>

                  {/* Spectrogram timeline */}
                  <div>
                    <h4 className="font-bold text-slate-200 mb-2 mt-4">Log-Frequency Spectrogram</h4>
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
                        <div className="absolute top-0 bottom-0 w-px bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.8)] pointer-events-none transition-all duration-100" style={{ left: `${playbackProgress}%` }} />
                      </div>
                    </SpotlightCard>
                  </div>

                  {/* HTML5 Audio Player control block */}
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "15px", borderRadius: "8px", display: "grid", gap: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <button type="button" onClick={handleAudioPlayPause} style={{ minWidth: "120px", background: "#245c67" }}>
                        {isPlaying ? "Pause ⏸" : "Play ▶"}
                      </button>
                      <span style={{ fontWeight: "bold", fontFamily: "monospace", fontSize: "1.1rem" }}>
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
                    <h3 style={{ marginBottom: "12px", color: "#1e293b" }}>Session Transcript (Click to Seek)</h3>
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
                              <div
                                className="speaker-badge-tag"
                                style={{ background: badge.bg, color: badge.color }}
                              >
                                {getSpeakerName(u.speaker_label)}
                              </div>
                              <div style={{ color: "#64748b", fontSize: "0.85rem", fontFamily: "monospace", minWidth: "90px" }}>
                                [{formatUtteranceTime(u.start_ms)} - {formatUtteranceTime(u.end_ms)}]
                              </div>
                              <div style={{ color: "#1e293b", fontSize: "0.95rem", flex: 1 }}>
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
                  <h3 style={{ color: "#1e293b" }}>Participant Analytics</h3>
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
