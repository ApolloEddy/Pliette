/** 从探针/采集帧序列合成 mp4（指导书 Spec 12.2 录像交付）。 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const ffmpeg = require("ffmpeg-static");

// node scripts/make-video.mts <listFile> <outFile> [durationPerFrame=0.35]
const [listFile, outFile, dur = "0.35"] = process.argv.slice(2);
const lines = readFileSync(resolve(root, listFile), "utf-8")
  .trim()
  .split("\n")
  .map((p) => `file '${resolve(root, p.trim()).replaceAll("\\", "/")}' duration ${dur}`);
const concatPath = resolve(root, "experiments/media/motion-guide/frames/concat.txt");
writeFileSync(concatPath, lines.join("\n") + "\n");
execFileSync(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-vf", "fps=10,scale=520:-2,format=yuv420p", resolve(root, outFile)], { stdio: "inherit" });
console.log("完成 ->", outFile);
