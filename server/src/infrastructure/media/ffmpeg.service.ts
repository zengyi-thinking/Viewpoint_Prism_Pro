import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';

// Use CommonJS-compatible resolution to avoid transpilation shape mismatches in Docker.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');

@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);
  private readonly ffmpegPath: string;
  private readonly tempDir: string;

  constructor(private readonly configService: ConfigService) {
    // Get FFmpeg path from config or use system default
    const configuredPath = String(this.configService.get('FFMPEG_PATH') || '').trim();
    const installerPath = String(
      ffmpegInstaller?.path || ffmpegInstaller?.default?.path || '',
    ).trim();
    this.ffmpegPath =
      (configuredPath && configuredPath !== 'ffmpeg' ? configuredPath : '') ||
      installerPath ||
      'ffmpeg';

    // Set temp directory for processing
    this.tempDir = path.join(process.cwd(), 'temp', 'ffmpeg');

    // Initialize FFmpeg command
    this.setFfmpegPath();
    this.logger.log(`Resolved ffmpeg binary: ${this.ffmpegPath}`);
  }

  private setFfmpegPath() {
    if (this.ffmpegPath && this.ffmpegPath !== 'ffmpeg') {
      ffmpeg.setFfmpegPath(this.ffmpegPath);
    }
    const ffprobePath = String(
      ffprobeInstaller?.path || ffprobeInstaller?.default?.path || '',
    ).trim();
    if (ffprobePath) {
      ffmpeg.setFfprobePath(ffprobePath);
    }
  }

  private async ensureTempDir() {
    await fs.mkdir(this.tempDir, { recursive: true });
  }

  /**
   * Extract a single frame from video at specified timestamp
   * @param videoPath - Path to video file
   * @param timestamp - Timestamp in seconds
   * @param outputPath - Optional output path
   * @returns Path to extracted frame
   */
  async extractFrame(videoPath: string, timestamp: number, outputPath?: string): Promise<string> {
    await this.ensureTempDir();

    const output = outputPath || path.join(this.tempDir, `frame-${Date.now()}.jpg`);

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: [timestamp],
          filename: path.basename(output),
          folder: path.dirname(output) || this.tempDir,
          size: '1280x720', // HD quality
        })
        .on('end', () => {
          this.logger.log(`Extracted frame at ${timestamp}s from ${videoPath}`);
          resolve(output);
        })
        .on('error', (err) => {
          this.logger.error(`Failed to extract frame: ${err.message}`, err.stack);
          reject(err);
        });
    });
  }

  /**
   * Extract multiple frames at regular intervals
   * @param videoPath - Path to video file
   * @param interval - Interval in seconds between frames
   * @param count - Number of frames to extract
   * @returns Array of frame paths
   */
  async extractFrames(videoPath: string, interval: number, count: number): Promise<string[]> {
    await this.ensureTempDir();

    const timestamps: number[] = [];
    for (let i = 0; i < count; i++) {
      timestamps.push(i * interval);
    }

    const outputDir = path.join(this.tempDir, `frames-${Date.now()}`);
    await fs.mkdir(outputDir, { recursive: true });

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps,
          filename: 'frame-%i.jpg',
          folder: outputDir,
          size: '1280x720',
        })
        .on('end', () => {
          const frames = timestamps.map(
            (_, i) => path.join(outputDir, `frame-${i + 1}.jpg`),
          );
          this.logger.log(`Extracted ${frames.length} frames from ${videoPath}`);
          resolve(frames);
        })
        .on('error', (err) => {
          this.logger.error(`Failed to extract frames: ${err.message}`, err.stack);
          reject(err);
        });
    });
  }

  /**
   * Stitch multiple videos together
   * @param videoPaths - Array of video paths to stitch
   * @param outputPath - Output file path
   * @param audioPath - Optional audio path to overlay
   * @param bgmPath - Optional background music path
   * @returns Path to stitched video
   */
  async stitchVideos(
    videoPaths: string[],
    outputPath: string,
    audioPath?: string,
    bgmPath?: string,
  ): Promise<string> {
    return this.composeVideoSequence(videoPaths, outputPath, {
      audioPath,
      bgmPath,
    });
  }

  async composeVideoSequence(
    videoPaths: string[],
    outputPath: string,
    options?: { audioPath?: string; bgmPath?: string },
  ): Promise<string> {
    await this.ensureTempDir();
    if (!videoPaths.length) {
      throw new Error('At least one video is required for composition');
    }

    if (videoPaths.length === 1 && !options?.audioPath && !options?.bgmPath) {
      await fs.copyFile(videoPaths[0], outputPath);
      return outputPath;
    }

    // Create list file for concatenation
    const listPath = path.join(this.tempDir, `concat-${Date.now()}.txt`);
    const listContent = videoPaths.map((p) => `file '${path.resolve(p)}'`).join('\n');
    await fs.writeFile(listPath, listContent);

    const concatenatedPath = path.join(this.tempDir, `concat-output-${Date.now()}.mp4`);
    const hasAudioOverlay = Boolean(options?.audioPath || options?.bgmPath);

    try {
      await this.runConcat(listPath, concatenatedPath, hasAudioOverlay);
      if (!hasAudioOverlay) {
        await fs.copyFile(concatenatedPath, outputPath);
        return outputPath;
      }

      await this.runAudioMix(concatenatedPath, outputPath, options?.audioPath, options?.bgmPath);
      return outputPath;
    } finally {
      await fs.unlink(listPath).catch(() => {});
      await fs.unlink(concatenatedPath).catch(() => {});
    }
  }

  async generateAmbientBed(durationSec: number, outputPath: string): Promise<string> {
    await this.ensureTempDir();
    const safeDuration = Math.max(2, Math.ceil(durationSec));
    await this.runFfmpeg([
      '-y',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=196:sample_rate=44100:duration=${safeDuration}`,
      '-filter:a',
      `volume=0.08,lowpass=f=900,afade=t=in:st=0:d=0.6,afade=t=out:st=${Math.max(0, safeDuration - 0.8)}:d=0.8`,
      '-c:a',
      'libmp3lame',
      outputPath,
    ]);
    return outputPath;
  }

  /**
   * Burn subtitles into video
   * @param videoPath - Path to video file
   * @param subtitlePath - Path to subtitle file (SRT format)
   * @param outputPath - Output file path
   * @returns Path to video with burned subtitles
   */
  async burnSubtitles(
    videoPath: string,
    subtitlePath: string,
    outputPath?: string,
  ): Promise<string> {
    await this.ensureTempDir();

    const output = outputPath || path.join(this.tempDir, `subtitled-${Date.now()}.mp4`);

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions('-vf', `subtitles='${subtitlePath}':force_style='FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000'`)
        .outputOptions('-c:a', 'copy')
        .save(output)
        .on('end', () => {
          this.logger.log(`Burned subtitles into ${output}`);
          resolve(output);
        })
        .on('error', (err) => {
          this.logger.error(`Failed to burn subtitles: ${err.message}`, err.stack);
          reject(err);
        });
    });
  }

  /**
   * Generate thumbnail from video
   * @param videoPath - Path to video file
   * @param timestamp - Timestamp to capture (default: 5 seconds)
   * @param width - Thumbnail width (default: 320)
   * @returns Path to thumbnail
   */
  async generateThumbnail(
    videoPath: string,
    timestamp = 5,
    width = 320,
  ): Promise<string> {
    await this.ensureTempDir();

    const output = path.join(this.tempDir, `thumb-${Date.now()}.jpg`);

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: [timestamp],
          filename: path.basename(output),
          folder: this.tempDir,
          size: `${width}x?`, // Maintain aspect ratio
        })
        .on('end', () => {
          this.logger.log(`Generated thumbnail from ${videoPath}`);
          resolve(output);
        })
        .on('error', (err) => {
          this.logger.error(`Failed to generate thumbnail: ${err.message}`, err.stack);
          reject(err);
        });
    });
  }

  /**
   * Get video metadata (duration, resolution, codec, etc.)
   * @param videoPath - Path to video file
   * @returns Video metadata
   */
  async getVideoMetadata(videoPath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    videoCodec: string;
    audioCodec: string;
    fps: number;
    aspectRatio: string;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          this.logger.error(`Failed to get metadata: ${err.message}`, err.stack);
          return reject(err);
        }

        const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
        const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
          videoCodec: videoStream?.codec_name || 'unknown',
          audioCodec: audioStream?.codec_name || 'unknown',
          fps: eval(videoStream?.r_frame_rate || '0/1'),
          aspectRatio: videoStream?.display_aspect_ratio || '16:9',
        });
      });
    });
  }

  /**
   * Convert video to different format
   * @param inputPath - Input video path
   * @param outputPath - Output video path
   * @param format - Target format (e.g., 'mp4', 'webm')
   * @returns Path to converted video
   */
  async convertFormat(inputPath: string, outputPath: string, format = 'mp4'): Promise<string> {
    await this.ensureTempDir();

    const output = outputPath || path.join(this.tempDir, `converted-${Date.now()}.${format}`);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputFormat(format)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions('-crf', '23') // Quality balance
        .save(output)
        .on('end', () => {
          this.logger.log(`Converted ${inputPath} to ${output}`);
          resolve(output);
        })
        .on('error', (err) => {
          this.logger.error(`Failed to convert format: ${err.message}`, err.stack);
          reject(err);
        });
    });
  }

  /**
   * Extract audio from video
   * @param videoPath - Path to video file
   * @param outputPath - Output audio path
   * @returns Path to extracted audio
   */
  async extractAudio(videoPath: string, outputPath?: string): Promise<string> {
    await this.ensureTempDir();

    const output = outputPath || path.join(this.tempDir, `audio-${Date.now()}.mp3`);

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .save(output)
        .on('end', () => {
          this.logger.log(`Extracted audio from ${videoPath}`);
          resolve(output);
        })
        .on('error', (err) => {
          this.logger.error(`Failed to extract audio: ${err.message}`, err.stack);
          reject(err);
        });
    });
  }

  /**
   * Trim video to specified time range
   * @param videoPath - Path to video file
   * @param startTime - Start time in seconds
   * @param duration - Duration in seconds
   * @param outputPath - Output path
   * @returns Path to trimmed video
   */
  async trimVideo(
    videoPath: string,
    startTime: number,
    duration: number,
    outputPath?: string,
  ): Promise<string> {
    await this.ensureTempDir();

    const output = outputPath || path.join(this.tempDir, `trim-${Date.now()}.mp4`);

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .outputOptions('-c', 'copy')
        .save(output)
        .on('end', () => {
          this.logger.log(`Trimmed video: ${startTime}s - ${startTime + duration}s`);
          resolve(output);
        })
        .on('error', (err) => {
          this.logger.error(`Failed to trim video: ${err.message}`, err.stack);
          reject(err);
        });
    });
  }

  /**
   * Resize video to specified resolution
   * @param videoPath - Path to video file
   * @param width - Target width
   * @param height - Target height
   * @param outputPath - Output path
   * @returns Path to resized video
   */
  async resizeVideo(
    videoPath: string,
    width: number,
    height: number,
    outputPath?: string,
  ): Promise<string> {
    await this.ensureTempDir();

    const output = outputPath || path.join(this.tempDir, `resized-${Date.now()}.mp4`);

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .size(`${width}x${height}`)
        .outputOptions('-crf', '23')
        .save(output)
        .on('end', () => {
          this.logger.log(`Resized video to ${width}x${height}`);
          resolve(output);
        })
        .on('error', (err) => {
          this.logger.error(`Failed to resize video: ${err.message}`, err.stack);
          reject(err);
        });
    });
  }

  /**
   * Resize image to specified dimensions
   * @param imagePath - Path to image file
   * @param options - Resize options (width, height, format, quality)
   * @returns Path to resized image
   */
  async resizeImage(
    imagePath: string,
    options: { width: number; height: number; format?: string; quality?: number },
  ): Promise<string> {
    await this.ensureTempDir();

    const output = path.join(this.tempDir, `resized-img-${Date.now()}.${options.format || 'jpg'}`);

    return new Promise((resolve, reject) => {
      ffmpeg(imagePath)
        .size(`${options.width}x${options.height}`)
        .outputFormat(options.format || 'jpg')
        .outputOptions('-q:v', (options.quality || 90).toString())
        .save(output)
        .on('end', () => {
          this.logger.log(`Resized image to ${options.width}x${options.height}`);
          resolve(output);
        })
        .on('error', (err) => {
          this.logger.error(`Failed to resize image: ${err.message}`, err.stack);
          reject(err);
        });
    });
  }

  /**
   * Clean up temporary files
   */
  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
      this.logger.log(`Cleaned up temp directory: ${this.tempDir}`);
    } catch (error) {
      this.logger.error(`Failed to cleanup: ${error.message}`, error.stack);
    }
  }

  private async runConcat(listPath: string, outputPath: string, reencode: boolean) {
    const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath];
    if (reencode) {
      args.push('-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', outputPath);
    } else {
      args.push('-c', 'copy', outputPath);
    }
    await this.runFfmpeg(args);
    return outputPath;
  }

  private async runAudioMix(
    videoPath: string,
    outputPath: string,
    audioPath?: string,
    bgmPath?: string,
  ) {
    const args = ['-y', '-i', videoPath];
    if (audioPath) {
      args.push('-i', audioPath);
    }
    if (bgmPath) {
      args.push('-i', bgmPath);
    }

    if (audioPath && bgmPath) {
      args.push(
        '-filter_complex',
        '[2:a]volume=0.12[bgm];[1:a][bgm]amix=inputs=2:duration=longest:dropout_transition=2[mix]',
        '-map',
        '0:v:0',
        '-map',
        '[mix]',
      );
    } else if (audioPath) {
      args.push('-map', '0:v:0', '-map', '1:a:0');
    } else if (bgmPath) {
      args.push(
        '-filter_complex',
        '[1:a]volume=0.12[mix]',
        '-map',
        '0:v:0',
        '-map',
        '[mix]',
      );
    }

    args.push('-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-shortest', outputPath);
    await this.runFfmpeg(args);
    return outputPath;
  }

  private async runFfmpeg(args: string[]) {
    this.setFfmpegPath();
    this.logger.log(`Running ffmpeg command with binary: ${this.ffmpegPath}`);
    return new Promise<void>((resolve, reject) => {
      const child = spawn(this.ffmpegPath, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        this.logger.error(`Failed to spawn ffmpeg: ${error.message}`, error.stack);
        reject(error);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        const message = stderr.trim() || `ffmpeg exited with code ${code}`;
        this.logger.error(`ffmpeg command failed: ${message}`);
        reject(new Error(message));
      });
    });
  }
}
