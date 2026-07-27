import ffmpeg from "fluent-ffmpeg";
// @ts-ignore
import ffmpegPath from "ffmpeg-static";
// @ts-ignore
import ffprobeStatic from "ffprobe-static";

if (typeof ffmpegPath === "string") {
  ffmpeg.setFfmpegPath(ffmpegPath);
}
if (ffprobeStatic && (ffprobeStatic as any).path) {
  ffmpeg.setFfprobePath((ffprobeStatic as any).path);
}

export function normalizeToWav16kMono(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .format("wav")
      .outputOptions("-y")
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .save(outputPath);
  });
}

export function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata.format.duration;
      if (duration === undefined) return reject(new Error("Duration not found in metadata"));
      resolve(duration);
    });
  });
}
