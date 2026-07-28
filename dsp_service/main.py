from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
import io
import base64
import tempfile
import soundfile as sf

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
    audio_path: str | None = None
    audio_base64: str | None = None
    speakers: list[SpeakerRequest]

@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    return {"status": "ok"}

@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    temp_file_path = None
    try:
        if req.audio_base64:
            # Decode base64 WAV audio bytes into a temporary WAV file
            raw_bytes = base64.b64decode(req.audio_base64)
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
            tmp.write(raw_bytes)
            tmp.close()
            temp_file_path = tmp.name
            target_path = temp_file_path
        elif req.audio_path and os.path.exists(req.audio_path):
            target_path = req.audio_path
        else:
            raise HTTPException(status_code=400, detail="Neither valid audio_path nor audio_base64 provided")

        y, sr = load_audio_16k_mono(target_path)
        out_dir = tempfile.mkdtemp()
        
        pause_info = compute_pause_stats(y, sr)
        plots_info = render_waveform_and_spectrogram(y, sr, out_dir)

        # Read generated PNG plots as base64 strings for DB persistence
        waveform_b64 = None
        spectrogram_b64 = None
        if os.path.exists(plots_info["waveform_png_path"]):
            with open(plots_info["waveform_png_path"], "rb") as f:
                waveform_b64 = base64.b64encode(f.read()).decode("utf-8")
        if os.path.exists(plots_info["spectrogram_png_path"]):
            with open(plots_info["spectrogram_png_path"], "rb") as f:
                spectrogram_b64 = base64.b64encode(f.read()).decode("utf-8")

        session_result = {
            **pause_info,
            "waveform_png_path": plots_info["waveform_png_path"],
            "spectrogram_png_path": plots_info["spectrogram_png_path"],
            "waveform_png_base64": waveform_b64,
            "spectrogram_png_base64": spectrogram_b64,
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
    except HTTPException:
        raise
    except Exception as e:
        print(f"DSP analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass
