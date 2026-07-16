import os
import matplotlib
matplotlib.use("Agg")  # Set before importing pyplot

import librosa
import librosa.display
import numpy as np
import parselmouth
import webrtcvad
import matplotlib.pyplot as plt

def load_audio_16k_mono(path: str) -> tuple[np.ndarray, int]:
    # webrtcvad and parselmouth require 16kHz
    y, sr = librosa.load(path, sr=16000, mono=True)
    return y, sr

def compute_pitch_stats(y: np.ndarray, sr: int) -> dict:
    if len(y) < int(sr * 0.05):  # Sound must be at least 50ms long
        return {"pitch_mean_hz": None, "pitch_range_semitones": None}
    try:
        snd = parselmouth.Sound(y, sampling_frequency=sr)
        pitch = snd.to_pitch()
        values = pitch.selected_array["frequency"]
        voiced = values[values > 0]
        if len(voiced) == 0:
            return {"pitch_mean_hz": None, "pitch_range_semitones": None}
        
        mean_hz = float(np.mean(voiced))
        min_v = np.min(voiced)
        max_v = np.max(voiced)
        if min_v <= 0 or max_v <= 0 or min_v == max_v:
            semitone_range = 0.0
        else:
            semitone_range = 12 * np.log2(max_v / min_v)
            
        return {
            "pitch_mean_hz": round(mean_hz, 1),
            "pitch_range_semitones": round(float(semitone_range), 2)
        }
    except Exception as e:
        print(f"Error computing pitch stats: {e}")
        return {"pitch_mean_hz": None, "pitch_range_semitones": None}

def compute_energy_stats(y: np.ndarray) -> dict:
    if len(y) == 0:
        return {"energy_rms_mean": 0.0, "energy_rms_std": 0.0}
    try:
        rms = librosa.feature.rms(y=y)[0]
        return {
            "energy_rms_mean": round(float(np.mean(rms)), 4),
            "energy_rms_std": round(float(np.std(rms)), 4)
        }
    except Exception as e:
        print(f"Error computing energy stats: {e}")
        return {"energy_rms_mean": 0.0, "energy_rms_std": 0.0}

def compute_pause_stats(y: np.ndarray, sr: int, aggressiveness: int = 2) -> dict:
    if len(y) == 0:
        return {"pause_count": 0, "avg_pause_ms": 0, "silence_ratio": 1.0}
    try:
        vad = webrtcvad.Vad(aggressiveness)
        frame_ms = 30
        frame_len = int(sr * frame_ms / 1000)
        
        max_val = np.max(np.abs(y))
        if max_val > 0:
            y_norm = y / max_val
        else:
            y_norm = y
            
        y_int16 = np.clip(y_norm * 32768, -32768, 32767).astype(np.int16)
        
        is_speech_frames = []
        for start in range(0, len(y_int16) - frame_len, frame_len):
            frame_bytes = y_int16[start:start + frame_len].tobytes()
            is_speech_frames.append(vad.is_speech(frame_bytes, sr))

        if not is_speech_frames:
            return {"pause_count": 0, "avg_pause_ms": 0, "silence_ratio": 1.0}

        pauses, current_pause = [], 0
        for is_speech in is_speech_frames:
            if not is_speech:
                current_pause += frame_ms
            else:
                if current_pause >= 300:
                    pauses.append(current_pause)
                current_pause = 0
                
        if current_pause >= 300:
            pauses.append(current_pause)

        silence_ratio = 1 - (sum(is_speech_frames) / len(is_speech_frames)) if is_speech_frames else 0.0
        return {
            "pause_count": len(pauses),
            "avg_pause_ms": round(float(np.mean(pauses)), 0) if pauses else 0,
            "silence_ratio": round(silence_ratio, 3),
        }
    except Exception as e:
        print(f"Error computing pause stats: {e}")
        return {"pause_count": 0, "avg_pause_ms": 0, "silence_ratio": 1.0}

def render_waveform_and_spectrogram(y: np.ndarray, sr: int, out_dir: str) -> dict:
    os.makedirs(out_dir, exist_ok=True)
    waveform_path = f"{out_dir}/waveform.png"
    spectrogram_path = f"{out_dir}/spectrogram.png"

    # Waveform plot
    try:
        fig, ax = plt.subplots(figsize=(12, 3))
        librosa.display.waveshow(y, sr=sr, ax=ax)
        ax.set(title="Session Waveform")
        fig.savefig(waveform_path, dpi=100, bbox_inches="tight")
        plt.close(fig)
    except Exception as e:
        print(f"Error saving waveform plot: {e}")

    # Spectrogram plot
    try:
        fig, ax = plt.subplots(figsize=(12, 4))
        D = librosa.amplitude_to_db(np.abs(librosa.stft(y)), ref=np.max)
        librosa.display.specshow(D, sr=sr, x_axis="time", y_axis="log", ax=ax)
        ax.set(title="Session Spectrogram")
        fig.savefig(spectrogram_path, dpi=100, bbox_inches="tight")
        plt.close(fig)
    except Exception as e:
        print(f"Error saving spectrogram plot: {e}")

    return {"waveform_png_path": waveform_path, "spectrogram_png_path": spectrogram_path}

def concatenate_segments(y: np.ndarray, sr: int, segments: list) -> np.ndarray:
    sliced_arrays = []
    for seg in segments:
        # Support both pydantic objects and dicts
        start_ms = seg.start_ms if hasattr(seg, "start_ms") else seg.get("start_ms")
        end_ms = seg.end_ms if hasattr(seg, "end_ms") else seg.get("end_ms")
        if start_ms is None or end_ms is None:
            continue
        start_sample = int(start_ms * sr / 1000)
        end_sample = int(end_ms * sr / 1000)
        if start_sample < len(y) and start_sample < end_sample:
            sliced_arrays.append(y[start_sample:min(end_sample, len(y))])
    
    if not sliced_arrays:
        return np.array([], dtype=np.float32)
    return np.concatenate(sliced_arrays)
