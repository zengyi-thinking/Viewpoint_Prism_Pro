import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  TrackEventDto,
  CreateBookmarkDto,
  UpdateBookmarkDto,
  CreateNoteDto,
  UpdateNoteDto,
  CreateHighlightDto,
  UpdateHighlightDto,
  VideoAnalyticsResponseDto,
  UserVideoProgressResponseDto,
  BulkTrackEventsDto,
  VideoEventType,
  VideoActionContext,
  VideoSessionResponseDto,
  VideoBookmarkResponseDto,
  VideoNoteResponseDto,
  VideoHighlightResponseDto,
} from './dto';

@Injectable()
export class VideoBehaviorService {
  private readonly logger = new Logger(VideoBehaviorService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // Event Tracking
  // ============================================================

  /**
   * Track a single video behavior event
   */
  async trackEvent(userId: string, dto: TrackEventDto) {
    const { videoId, sessionId, eventType, previousTime, currentTime, context } = dto;

    // Verify video access
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    // Get or create session
    const activeSessionId = sessionId || await this.getOrCreateActiveSession(userId, videoId, context || VideoActionContext.NORMAL);

    // Calculate watch duration for play/pause events
    let watchDuration: number | undefined;
    if (eventType === VideoEventType.PAUSE && previousTime !== undefined) {
      watchDuration = currentTime - previousTime;
    }

    // Create event record
    const event = await this.prisma.videoBehaviorEvent.create({
      data: {
        userId,
        videoId,
        eventType,
        context: context || VideoActionContext.NORMAL,
        sessionId: activeSessionId,
        previousTime,
        currentTime,
        playbackRate: dto.playbackRate || 1.0,
        volume: dto.volume ?? 1.0,
        watchDuration,
        metadata: (dto.metadata || {}) as any,
        deviceId: dto.deviceId,
        userAgent: dto.userAgent,
      },
    });

    // Update session metrics
    await this.updateSessionMetrics(activeSessionId, eventType, watchDuration, currentTime);

    // Handle special events
    if (eventType === VideoEventType.END) {
      await this.markSessionCompleted(activeSessionId, currentTime);
    }

    this.logger.debug(`Tracked event ${eventType} for video ${videoId} by user ${userId}`);
    return event;
  }

  /**
   * Track multiple events in bulk (more efficient)
   */
  async trackBulkEvents(userId: string, dto: BulkTrackEventsDto) {
    const results = await Promise.allSettled(
      dto.events.map((event) => this.trackEvent(userId, event))
    );

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log(`Bulk tracking: ${successful} successful, ${failed} failed`);

    return {
      total: dto.events.length,
      successful,
      failed,
    };
  }

  // ============================================================
  // Session Management
  // ============================================================

  /**
   * Get or create active video watching session
   */
  private async getOrCreateActiveSession(
    userId: string,
    videoId: string,
    context: VideoActionContext,
  ): Promise<string> {
    // Look for recent session (within last hour) that hasn't ended
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const recentSession = await this.prisma.videoSession.findFirst({
      where: {
        userId,
        videoId,
        context,
        endTime: null,
        startTime: { gte: hourAgo },
      },
      orderBy: { startTime: 'desc' },
    });

    if (recentSession) {
      return recentSession.sessionId;
    }

    // Create new session
    const sessionId = `${userId}-${videoId}-${Date.now()}`;
    const video = await this.prisma.videoSource.findUnique({ where: { id: videoId } });

    const session = await this.prisma.videoSession.create({
      data: {
        userId,
        videoId,
        sessionId,
        context,
        watchedSegments: [],
      },
    });

    this.logger.log(`Created new session ${session.sessionId} for video ${videoId}`);
    return session.sessionId;
  }

  /**
   * Update session metrics based on event
   */
  private async updateSessionMetrics(
    sessionId: string,
    eventType: VideoEventType,
    watchDuration?: number,
    currentTime?: number,
  ) {
    const updateData: any = {};

    switch (eventType) {
      case VideoEventType.PAUSE:
        updateData.pauseCount = { increment: 1 };
        if (watchDuration !== undefined && watchDuration > 0) {
          updateData.totalWatchTime = { increment: watchDuration };
          updateData.activeWatchTime = { increment: watchDuration };
        }
        if (currentTime !== undefined) {
          updateData.watchedSegments = { push: [currentTime - (watchDuration || 0), currentTime] };
        }
        break;
      case VideoEventType.SEEK:
        updateData.seekCount = { increment: 1 };
        break;
      case VideoEventType.BUFFER:
        updateData.bufferCount = { increment: 1 };
        break;
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.videoSession.update({
        where: { sessionId },
        data: updateData,
      });
    }
  }

  /**
   * Mark session as completed
   */
  private async markSessionCompleted(sessionId: string, finalPosition: number) {
    const session = await this.prisma.videoSession.findUnique({
      where: { sessionId },
      include: { video: true },
    });

    if (!session || session.isCompleted) return;

    // Calculate coverage
    const coveragePercent = this.calculateCoveragePercent(session.watchedSegments as Array<[number, number]>, session.video.duration);

    await this.prisma.videoSession.update({
      where: { sessionId },
      data: {
        endTime: new Date(),
        isCompleted: true,
        completionTime: new Date(),
        coveragePercent,
      },
    });

    this.logger.log(`Marked session ${sessionId} as completed`);
  }

  /**
   * Calculate coverage percentage from watched segments
   */
  private calculateCoveragePercent(segments: Array<[number, number]>, duration?: number | null): number {
    if (!duration || duration === 0) return 0;

    // Merge overlapping segments
    const merged = this.mergeSegments(segments);
    const watched = merged.reduce((acc, [start, end]) => acc + (end - start), 0);

    return Math.min(100, (watched / duration) * 100);
  }

  /**
   * Merge overlapping time segments
   */
  private mergeSegments(segments: Array<[number, number]>): Array<[number, number]> {
    if (segments.length === 0) return [];

    // Sort by start time
    const sorted = [...segments].sort((a, b) => a[0] - b[0]);

    const merged: Array<[number, number]> = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const [currentStart, currentEnd] = sorted[i];
      const [lastStart, lastEnd] = merged[merged.length - 1];

      if (currentStart <= lastEnd) {
        // Overlapping, merge
        merged[merged.length - 1] = [lastStart, Math.max(lastEnd, currentEnd)];
      } else {
        // Non-overlapping, add new segment
        merged.push([currentStart, currentEnd]);
      }
    }

    return merged;
  }

  /**
   * Get active session for a user and video
   */
  async getActiveSession(userId: string, videoId: string): Promise<VideoSessionResponseDto | null> {
    const session = await this.prisma.videoSession.findFirst({
      where: {
        userId,
        videoId,
        endTime: null,
      },
      orderBy: { startTime: 'desc' },
    });

    if (!session) return null;

    return this.toSessionDto(session);
  }

  /**
   * End active session
   */
  async endSession(userId: string, sessionId: string, finalPosition: number) {
    const session = await this.prisma.videoSession.findUnique({
      where: { sessionId },
      include: { video: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('You do not have access to this session');
    }

    if (session.endTime) {
      return session; // Already ended
    }

    const coveragePercent = this.calculateCoveragePercent(
      session.watchedSegments as Array<[number, number]>,
      session.video.duration,
    );

    const updated = await this.prisma.videoSession.update({
      where: { sessionId },
      data: {
        endTime: new Date(),
        coveragePercent,
        isCompleted: coveragePercent >= 95, // Consider completed if 95% watched
        completionTime: coveragePercent >= 95 ? new Date() : null,
      },
    });

    this.logger.log(`Ended session ${sessionId}`);
    return this.toSessionDto(updated);
  }

  /**
   * List all sessions for a video
   */
  async listSessions(userId: string, videoId: string): Promise<VideoSessionResponseDto[]> {
    // Verify access
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video || video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    const sessions = await this.prisma.videoSession.findMany({
      where: { userId, videoId },
      orderBy: { startTime: 'desc' },
    });

    return sessions.map((s) => this.toSessionDto(s));
  }

  // ============================================================
  // Bookmarks
  // ============================================================

  /**
   * Create a bookmark
   */
  async createBookmark(userId: string, dto: CreateBookmarkDto) {
    // Verify video access
    const video = await this.prisma.videoSource.findUnique({
      where: { id: dto.videoId },
      include: { project: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    const bookmark = await this.prisma.videoBookmark.create({
      data: {
        userId,
        videoId: dto.videoId,
        timestamp: dto.timestamp,
        title: dto.title,
        description: dto.description,
        thumbnailUrl: dto.thumbnailUrl,
        color: dto.color || '#3b82f6',
        tags: dto.tags || [],
        context: dto.context || VideoActionContext.NORMAL,
      },
    });

    this.logger.log(`Created bookmark ${bookmark.id} for video ${dto.videoId}`);
    return this.toBookmarkDto(bookmark);
  }

  /**
   * List bookmarks for a video
   */
  async listBookmarks(userId: string, videoId: string): Promise<VideoBookmarkResponseDto[]> {
    // Verify access
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video || video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    const bookmarks = await this.prisma.videoBookmark.findMany({
      where: { userId, videoId },
      orderBy: { timestamp: 'asc' },
    });

    return bookmarks.map((b) => this.toBookmarkDto(b));
  }

  /**
   * Update a bookmark
   */
  async updateBookmark(userId: string, bookmarkId: string, dto: UpdateBookmarkDto) {
    const bookmark = await this.prisma.videoBookmark.findUnique({
      where: { id: bookmarkId },
    });

    if (!bookmark) {
      throw new NotFoundException('Bookmark not found');
    }

    if (bookmark.userId !== userId) {
      throw new ForbiddenException('You do not have access to this bookmark');
    }

    const updated = await this.prisma.videoBookmark.update({
      where: { id: bookmarkId },
      data: dto,
    });

    this.logger.log(`Updated bookmark ${bookmarkId}`);
    return this.toBookmarkDto(updated);
  }

  /**
   * Delete a bookmark
   */
  async deleteBookmark(userId: string, bookmarkId: string) {
    const bookmark = await this.prisma.videoBookmark.findUnique({
      where: { id: bookmarkId },
    });

    if (!bookmark) {
      throw new NotFoundException('Bookmark not found');
    }

    if (bookmark.userId !== userId) {
      throw new ForbiddenException('You do not have access to this bookmark');
    }

    await this.prisma.videoBookmark.delete({
      where: { id: bookmarkId },
    });

    this.logger.log(`Deleted bookmark ${bookmarkId}`);
    return { success: true };
  }

  // ============================================================
  // Notes
  // ============================================================

  /**
   * Create a note
   */
  async createNote(userId: string, dto: CreateNoteDto) {
    // Verify video access
    const video = await this.prisma.videoSource.findUnique({
      where: { id: dto.videoId },
      include: { project: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    const note = await this.prisma.videoNote.create({
      data: {
        userId,
        videoId: dto.videoId,
        timestamp: dto.timestamp,
        content: dto.content,
        timeRange: dto.timeRange,
        isMarkdown: dto.isMarkdown !== undefined ? dto.isMarkdown : true,
        tags: dto.tags || [],
        color: dto.color || '#10b981',
        linkedKnowledgeAssetId: dto.linkedKnowledgeAssetId,
        linkedFlashcardId: dto.linkedFlashcardId,
      },
    });

    this.logger.log(`Created note ${note.id} for video ${dto.videoId}`);
    return this.toNoteDto(note);
  }

  /**
   * List notes for a video
   */
  async listNotes(userId: string, videoId: string): Promise<VideoNoteResponseDto[]> {
    // Verify access
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video || video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    const notes = await this.prisma.videoNote.findMany({
      where: { userId, videoId },
      orderBy: { timestamp: 'asc' },
    });

    return notes.map((n) => this.toNoteDto(n));
  }

  /**
   * Update a note
   */
  async updateNote(userId: string, noteId: string, dto: UpdateNoteDto) {
    const note = await this.prisma.videoNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      throw new NotFoundException('Note not found');
    }

    if (note.userId !== userId) {
      throw new ForbiddenException('You do not have access to this note');
    }

    const updated = await this.prisma.videoNote.update({
      where: { id: noteId },
      data: dto,
    });

    this.logger.log(`Updated note ${noteId}`);
    return this.toNoteDto(updated);
  }

  /**
   * Delete a note
   */
  async deleteNote(userId: string, noteId: string) {
    const note = await this.prisma.videoNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      throw new NotFoundException('Note not found');
    }

    if (note.userId !== userId) {
      throw new ForbiddenException('You do not have access to this note');
    }

    await this.prisma.videoNote.delete({
      where: { id: noteId },
    });

    this.logger.log(`Deleted note ${noteId}`);
    return { success: true };
  }

  // ============================================================
  // Highlights
  // ============================================================

  /**
   * Create a highlight
   */
  async createHighlight(userId: string, dto: CreateHighlightDto) {
    // Verify video access
    const video = await this.prisma.videoSource.findUnique({
      where: { id: dto.videoId },
      include: { project: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    // Generate share token if requested
    let shareToken: string | undefined;
    if (dto.highlightType === 'QUOTE' || dto.metadata?.share) {
      shareToken = this.generateShareToken();
    }

    const highlight = await this.prisma.videoHighlight.create({
      data: {
        userId,
        videoId: dto.videoId,
        startTime: dto.startTime,
        endTime: dto.endTime,
        title: dto.title,
        description: dto.description,
        color: dto.color || '#f59e0b',
        label: dto.label,
        highlightType: dto.highlightType || 'CUSTOM',
        isShared: false,
        shareToken,
      },
    });

    this.logger.log(`Created highlight ${highlight.id} for video ${dto.videoId}`);
    return this.toHighlightDto(highlight);
  }

  /**
   * List highlights for a video
   */
  async listHighlights(userId: string, videoId: string): Promise<VideoHighlightResponseDto[]> {
    // Verify access
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video || video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    const highlights = await this.prisma.videoHighlight.findMany({
      where: { userId, videoId },
      orderBy: { startTime: 'asc' },
    });

    return highlights.map((h) => this.toHighlightDto(h));
  }

  /**
   * Get shared highlight by token
   */
  async getSharedHighlight(shareToken: string): Promise<VideoHighlightResponseDto> {
    const highlight = await this.prisma.videoHighlight.findUnique({
      where: { shareToken },
      include: { video: { include: { project: true } } },
    });

    if (!highlight || !highlight.isShared) {
      throw new NotFoundException('Shared highlight not found');
    }

    return this.toHighlightDto(highlight);
  }

  /**
   * Update a highlight
   */
  async updateHighlight(userId: string, highlightId: string, dto: UpdateHighlightDto) {
    const highlight = await this.prisma.videoHighlight.findUnique({
      where: { id: highlightId },
    });

    if (!highlight) {
      throw new NotFoundException('Highlight not found');
    }

    if (highlight.userId !== userId) {
      throw new ForbiddenException('You do not have access to this highlight');
    }

    const updated = await this.prisma.videoHighlight.update({
      where: { id: highlightId },
      data: dto,
    });

    this.logger.log(`Updated highlight ${highlightId}`);
    return this.toHighlightDto(updated);
  }

  /**
   * Delete a highlight
   */
  async deleteHighlight(userId: string, highlightId: string) {
    const highlight = await this.prisma.videoHighlight.findUnique({
      where: { id: highlightId },
    });

    if (!highlight) {
      throw new NotFoundException('Highlight not found');
    }

    if (highlight.userId !== userId) {
      throw new ForbiddenException('You do not have access to this highlight');
    }

    await this.prisma.videoHighlight.delete({
      where: { id: highlightId },
    });

    this.logger.log(`Deleted highlight ${highlightId}`);
    return { success: true };
  }

  /**
   * Share/unshare a highlight
   */
  async toggleHighlightShare(userId: string, highlightId: string) {
    const highlight = await this.prisma.videoHighlight.findUnique({
      where: { id: highlightId },
    });

    if (!highlight) {
      throw new NotFoundException('Highlight not found');
    }

    if (highlight.userId !== userId) {
      throw new ForbiddenException('You do not have access to this highlight');
    }

    // Generate share token if not exists
    let shareToken = highlight.shareToken;
    if (!shareToken) {
      shareToken = this.generateShareToken();
    }

    const updated = await this.prisma.videoHighlight.update({
      where: { id: highlightId },
      data: {
        isShared: !highlight.isShared,
        shareToken,
      },
    });

    this.logger.log(`Toggled share for highlight ${highlightId}`);
    return this.toHighlightDto(updated);
  }

  /**
   * Generate unique share token
   */
  private generateShareToken(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  // ============================================================
  // Analytics & Progress
  // ============================================================

  /**
   * Get video analytics
   */
  async getVideoAnalytics(userId: string, videoId: string): Promise<VideoAnalyticsResponseDto> {
    // Verify access
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video || video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    // Get session stats
    const sessions = await this.prisma.videoSession.findMany({
      where: { userId, videoId },
    });

    const totalSessions = sessions.length;
    const totalWatchTime = sessions.reduce((sum, s) => sum + (s.totalWatchTime || 0), 0);
    const averageWatchTime = totalSessions > 0 ? totalWatchTime / totalSessions : 0;
    const completedSessions = sessions.filter((s) => s.isCompleted).length;
    const completionRate = totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0;
    const averageCoverage = totalSessions > 0
      ? sessions.reduce((sum, s) => sum + s.coveragePercent, 0) / totalSessions
      : 0;

    // Get engagement events
    const events = await this.prisma.videoBehaviorEvent.groupBy({
      by: ['eventType'],
      where: { userId, videoId },
      _count: { eventType: true },
    });

    const engagementEvents = {
      play: events.find((e) => e.eventType === 'PLAY')?._count.eventType || 0,
      pause: events.find((e) => e.eventType === 'PAUSE')?._count.eventType || 0,
      seek: events.find((e) => e.eventType === 'SEEK')?._count.eventType || 0,
      speedChange: events.find((e) => e.eventType === 'SPEED_CHANGE')?._count.eventType || 0,
    };

    // Get user content counts
    const [bookmarks, notes, highlights] = await Promise.all([
      this.prisma.videoBookmark.count({ where: { userId, videoId } }),
      this.prisma.videoNote.count({ where: { userId, videoId } }),
      this.prisma.videoHighlight.count({ where: { userId, videoId } }),
    ]);

    // Get last watched time
    const lastSession = sessions[0];
    const lastWatchedAt = lastSession?.startTime;

    return {
      videoId,
      totalSessions,
      totalWatchTime,
      averageWatchTime,
      completionRate,
      averageCoverage,
      totalBookmarks: bookmarks,
      totalNotes: notes,
      totalHighlights: highlights,
      engagementEvents,
      lastWatchedAt,
    };
  }

  /**
   * Get user progress for a video
   */
  async getUserVideoProgress(userId: string, videoId: string): Promise<UserVideoProgressResponseDto> {
    // Verify access
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video || video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    // Get latest session
    const latestSession = await this.prisma.videoSession.findFirst({
      where: { userId, videoId },
      orderBy: { startTime: 'desc' },
    });

    const lastPosition = latestSession?.coveragePercent
      ? (latestSession.coveragePercent / 100) * (video.duration || 0)
      : 0;

    const totalWatchTime = latestSession?.totalWatchTime || 0;
    const coveragePercent = latestSession?.coveragePercent || 0;
    const isCompleted = latestSession?.isCompleted || false;
    const lastWatchedAt = latestSession?.startTime || new Date();

    // Get user content
    const [bookmarks, notes, highlights] = await Promise.all([
      this.prisma.videoBookmark.findMany({
        where: { userId, videoId },
        orderBy: { timestamp: 'asc' },
      }),
      this.prisma.videoNote.findMany({
        where: { userId, videoId },
        orderBy: { timestamp: 'asc' },
      }),
      this.prisma.videoHighlight.findMany({
        where: { userId, videoId },
        orderBy: { startTime: 'asc' },
      }),
    ]);

    return {
      videoId,
      lastPosition,
      totalWatchTime,
      coveragePercent,
      isCompleted,
      lastWatchedAt,
      bookmarks: bookmarks.map((b) => this.toBookmarkDto(b)),
      notes: notes.map((n) => this.toNoteDto(n)),
      highlights: highlights.map((h) => this.toHighlightDto(h)),
    };
  }

  // ============================================================
  // Cleanup & Maintenance
  // ============================================================

  /**
   * Cleanup old behavior events (keep last 90 days)
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldEvents() {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const result = await this.prisma.videoBehaviorEvent.deleteMany({
      where: {
        createdAt: { lt: ninetyDaysAgo },
      },
    });

    this.logger.log(`Cleaned up ${result.count} old behavior events`);
  }

  // ============================================================
  // DTO Converters
  // ============================================================

  private toSessionDto(session: any): VideoSessionResponseDto {
    return {
      id: session.id,
      sessionId: session.sessionId,
      videoId: session.videoId,
      startTime: session.startTime,
      endTime: session.endTime,
      totalWatchTime: session.totalWatchTime,
      activeWatchTime: session.activeWatchTime,
      pauseCount: session.pauseCount,
      seekCount: session.seekCount,
      bufferCount: session.bufferCount,
      watchedSegments: session.watchedSegments as Array<[number, number]>,
      coveragePercent: session.coveragePercent,
      isCompleted: session.isCompleted,
      completionTime: session.completionTime,
      context: session.context,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private toBookmarkDto(bookmark: any): VideoBookmarkResponseDto {
    return {
      id: bookmark.id,
      videoId: bookmark.videoId,
      timestamp: bookmark.timestamp,
      title: bookmark.title,
      description: bookmark.description,
      thumbnailUrl: bookmark.thumbnailUrl,
      color: bookmark.color,
      tags: bookmark.tags,
      context: bookmark.context,
      createdAt: bookmark.createdAt,
      updatedAt: bookmark.updatedAt,
    };
  }

  private toNoteDto(note: any): VideoNoteResponseDto {
    return {
      id: note.id,
      videoId: note.videoId,
      timestamp: note.timestamp,
      content: note.content,
      timeRange: note.timeRange as [number, number] | undefined,
      isMarkdown: note.isMarkdown,
      tags: note.tags,
      color: note.color,
      linkedKnowledgeAssetId: note.linkedKnowledgeAssetId,
      linkedFlashcardId: note.linkedFlashcardId,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  }

  private toHighlightDto(highlight: any): VideoHighlightResponseDto {
    return {
      id: highlight.id,
      videoId: highlight.videoId,
      startTime: highlight.startTime,
      endTime: highlight.endTime,
      title: highlight.title,
      description: highlight.description,
      color: highlight.color,
      label: highlight.label,
      highlightType: highlight.highlightType,
      isShared: highlight.isShared,
      shareToken: highlight.shareToken,
      createdAt: highlight.createdAt,
      updatedAt: highlight.updatedAt,
    };
  }
}
