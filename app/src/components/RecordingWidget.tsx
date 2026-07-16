import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RecordPlugin from "wavesurfer.js/dist/plugins/record.js";

interface RecordingWidgetProps {
  onStop: (blob: Blob) => void;
}

export function RecordingWidget({ onStop }: RecordingWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const recordRef = useRef<RecordPlugin | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#475569",
      progressColor: "#3b82f6",
      height: 80,
      barWidth: 2,
      barGap: 1,
    });

    const record = ws.registerPlugin(
      RecordPlugin.create({
        scrollingWaveform: true,
        renderRecordedAudio: false,
      })
    );

    record.on("record-end", (blob) => {
      onStop(blob);
    });

    wsRef.current = ws;
    recordRef.current = record;

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      ws.destroy();
    };
  }, [onStop]);

  const startRecording = () => {
    if (!recordRef.current) return;
    recordRef.current.startRecording().then(() => {
      setIsRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    });
  };

  const stopRecording = () => {
    if (!recordRef.current) return;
    recordRef.current.stopRecording();
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="recording-widget-container">
      <div ref={containerRef} className="waveform-canvas-container" style={{ minHeight: "80px", background: "#0f172a", borderRadius: "8px", padding: "10px", marginBottom: "15px" }} />
      <div className="recording-controls" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="duration-counter" style={{ color: "#38bdf8", fontWeight: "bold", fontSize: "1.2rem" }}>
          {formatDuration(duration)}
        </div>
        <div>
          {!isRecording ? (
            <button type="button" onClick={startRecording} className="btn-record-start" style={{ background: "#ef4444", color: "white", padding: "8px 16px", borderRadius: "6px", border: "none", cursor: "pointer" }}>
              Start Live Recording
            </button>
          ) : (
            <button type="button" onClick={stopRecording} className="btn-record-stop" style={{ background: "#475569", color: "white", padding: "8px 16px", borderRadius: "6px", border: "none", cursor: "pointer" }}>
              Stop & Upload
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
