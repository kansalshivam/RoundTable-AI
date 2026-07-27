from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os

from analysis import (
    load_audio_16k_mono,
    compute_pause_stats,
    render_waveform_and_spectrogram,
    concatenate_segments,
    compute_pitch_stats,
    compute_energy_stats,
)

app = FastAPI(title="RoundTable AI DSP Service")

class Segment(BaseModel):
    start_ms: int
    end_ms: int

class SpeakerRequest(BaseModel):
    participant_id: str
    segments: list[Segment]

class AnalyzeRequest(BaseModel):
    session_id: str
    audio_path: str
    speakers: list[SpeakerRequest]

@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    return {"status": "ok"}

@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    if not os.path.exists(req.audio_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
        
    try:
        y, sr = load_audio_16k_mono(req.audio_path)
        out_dir = f"/data/sessions/{req.session_id}"
        
        session_result = {
            **compute_pause_stats(y, sr),
            **render_waveform_and_spectrogram(y, sr, out_dir),
        }

        speaker_results = []
        for speaker in req.speakers:
            y_speaker = concatenate_segments(y, sr, speaker.segments)
            speaker_results.append({
                "participant_id": speaker.participant_id,
                **compute_pitch_stats(y_speaker, sr),
                **compute_energy_stats(y_speaker),
                **compute_pause_stats(y_speaker, sr),
            })

        return {"session": session_result, "speakers": speaker_results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
