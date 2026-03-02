import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { VideoBehaviorService } from './video-behavior.service';
import {
  TrackEventDto,
  BulkTrackEventsDto,
  CreateBookmarkDto,
  UpdateBookmarkDto,
  CreateNoteDto,
  UpdateNoteDto,
  CreateHighlightDto,
  UpdateHighlightDto,
} from './dto';

@Controller('api/video-behavior')
@UseGuards(JwtAuthGuard)
export class VideoBehaviorController {
  constructor(private readonly videoBehaviorService: VideoBehaviorService) {}

  // ============================================================
  // Event Tracking
  // ============================================================

  /**
   * Track a video behavior event
   * POST /api/video-behavior/track
   */
  @Post('track')
  async trackEvent(
    @CurrentUser() userId: string,
    @Body() dto: TrackEventDto,
  ) {
    const event = await this.videoBehaviorService.trackEvent(userId, dto);
    return { success: true, data: event };
  }

  /**
   * Track multiple events in bulk
   * POST /api/video-behavior/track/bulk
   */
  @Post('track/bulk')
  async trackBulkEvents(
    @CurrentUser() userId: string,
    @Body() dto: BulkTrackEventsDto,
  ) {
    const result = await this.videoBehaviorService.trackBulkEvents(userId, dto);
    return { success: true, data: result };
  }

  // ============================================================
  // Sessions
  // ============================================================

  /**
   * Get active session for a video
   * GET /api/video-behavior/sessions/active?videoId=xxx
   */
  @Get('sessions/active')
  async getActiveSession(
    @CurrentUser() userId: string,
    @Query('videoId') videoId: string,
  ) {
    const session = await this.videoBehaviorService.getActiveSession(userId, videoId);
    return { success: true, data: session };
  }

  /**
   * End active session
   * POST /api/video-behavior/sessions/end
   */
  @Post('sessions/end')
  async endSession(
    @CurrentUser() userId: string,
    @Body() body: { sessionId: string; finalPosition: number },
  ) {
    const session = await this.videoBehaviorService.endSession(
      userId,
      body.sessionId,
      body.finalPosition,
    );
    return { success: true, data: session };
  }

  /**
   * List all sessions for a video
   * GET /api/video-behavior/sessions?videoId=xxx
   */
  @Get('sessions')
  async listSessions(
    @CurrentUser() userId: string,
    @Query('videoId') videoId: string,
  ) {
    const sessions = await this.videoBehaviorService.listSessions(userId, videoId);
    return { success: true, data: sessions };
  }

  // ============================================================
  // Bookmarks
  // ============================================================

  /**
   * Create a bookmark
   * POST /api/video-behavior/bookmarks
   */
  @Post('bookmarks')
  async createBookmark(
    @CurrentUser() userId: string,
    @Body() dto: CreateBookmarkDto,
  ) {
    const bookmark = await this.videoBehaviorService.createBookmark(userId, dto);
    return { success: true, data: bookmark };
  }

  /**
   * List bookmarks for a video
   * GET /api/video-behavior/bookmarks?videoId=xxx
   */
  @Get('bookmarks')
  async listBookmarks(
    @CurrentUser() userId: string,
    @Query('videoId') videoId: string,
  ) {
    const bookmarks = await this.videoBehaviorService.listBookmarks(userId, videoId);
    return { success: true, data: bookmarks };
  }

  /**
   * Update a bookmark
   * PUT /api/video-behavior/bookmarks/:id
   */
  @Put('bookmarks/:id')
  async updateBookmark(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBookmarkDto,
  ) {
    const bookmark = await this.videoBehaviorService.updateBookmark(userId, id, dto);
    return { success: true, data: bookmark };
  }

  /**
   * Delete a bookmark
   * DELETE /api/video-behavior/bookmarks/:id
   */
  @Delete('bookmarks/:id')
  async deleteBookmark(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ) {
    await this.videoBehaviorService.deleteBookmark(userId, id);
    return { success: true };
  }

  // ============================================================
  // Notes
  // ============================================================

  /**
   * Create a note
   * POST /api/video-behavior/notes
   */
  @Post('notes')
  async createNote(
    @CurrentUser() userId: string,
    @Body() dto: CreateNoteDto,
  ) {
    const note = await this.videoBehaviorService.createNote(userId, dto);
    return { success: true, data: note };
  }

  /**
   * List notes for a video
   * GET /api/video-behavior/notes?videoId=xxx
   */
  @Get('notes')
  async listNotes(
    @CurrentUser() userId: string,
    @Query('videoId') videoId: string,
  ) {
    const notes = await this.videoBehaviorService.listNotes(userId, videoId);
    return { success: true, data: notes };
  }

  /**
   * Update a note
   * PUT /api/video-behavior/notes/:id
   */
  @Put('notes/:id')
  async updateNote(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    const note = await this.videoBehaviorService.updateNote(userId, id, dto);
    return { success: true, data: note };
  }

  /**
   * Delete a note
   * DELETE /api/video-behavior/notes/:id
   */
  @Delete('notes/:id')
  async deleteNote(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ) {
    await this.videoBehaviorService.deleteNote(userId, id);
    return { success: true };
  }

  // ============================================================
  // Highlights
  // ============================================================

  /**
   * Create a highlight
   * POST /api/video-behavior/highlights
   */
  @Post('highlights')
  async createHighlight(
    @CurrentUser() userId: string,
    @Body() dto: CreateHighlightDto,
  ) {
    const highlight = await this.videoBehaviorService.createHighlight(userId, dto);
    return { success: true, data: highlight };
  }

  /**
   * List highlights for a video
   * GET /api/video-behavior/highlights?videoId=xxx
   */
  @Get('highlights')
  async listHighlights(
    @CurrentUser() userId: string,
    @Query('videoId') videoId: string,
  ) {
    const highlights = await this.videoBehaviorService.listHighlights(userId, videoId);
    return { success: true, data: highlights };
  }

  /**
   * Get shared highlight (public)
   * GET /api/video-behavior/highlights/shared/:token
   */
  @Get('highlights/shared/:token')
  async getSharedHighlight(@Param('token') token: string) {
    const highlight = await this.videoBehaviorService.getSharedHighlight(token);
    return { success: true, data: highlight };
  }

  /**
   * Update a highlight
   * PUT /api/video-behavior/highlights/:id
   */
  @Put('highlights/:id')
  async updateHighlight(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateHighlightDto,
  ) {
    const highlight = await this.videoBehaviorService.updateHighlight(userId, id, dto);
    return { success: true, data: highlight };
  }

  /**
   * Delete a highlight
   * DELETE /api/video-behavior/highlights/:id
   */
  @Delete('highlights/:id')
  async deleteHighlight(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ) {
    await this.videoBehaviorService.deleteHighlight(userId, id);
    return { success: true };
  }

  /**
   * Toggle share status for a highlight
   * POST /api/video-behavior/highlights/:id/toggle-share
   */
  @Post('highlights/:id/toggle-share')
  async toggleHighlightShare(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ) {
    const highlight = await this.videoBehaviorService.toggleHighlightShare(userId, id);
    return { success: true, data: highlight };
  }

  // ============================================================
  // Analytics & Progress
  // ============================================================

  /**
   * Get video analytics
   * GET /api/video-behavior/analytics?videoId=xxx
   */
  @Get('analytics')
  async getAnalytics(
    @CurrentUser() userId: string,
    @Query('videoId') videoId: string,
  ) {
    const analytics = await this.videoBehaviorService.getVideoAnalytics(userId, videoId);
    return { success: true, data: analytics };
  }

  /**
   * Get user progress for a video
   * GET /api/video-behavior/progress?videoId=xxx
   */
  @Get('progress')
  async getProgress(
    @CurrentUser() userId: string,
    @Query('videoId') videoId: string,
  ) {
    const progress = await this.videoBehaviorService.getUserVideoProgress(userId, videoId);
    return { success: true, data: progress };
  }
}
