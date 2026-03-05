import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

// Event payload interfaces
interface TaskProgressPayload {
  projectId: string;
  videoId?: string;
  nodeId?: string;
  translationTaskId?: string;
  assetId?: string;
  task: string;
  progress: number;
  message: string;
  timestamp: string;
}

interface TaskErrorPayload {
  projectId: string;
  videoId?: string;
  nodeId?: string;
  translationTaskId?: string;
  assetId?: string;
  task: string;
  error: string;
  timestamp: string;
}

interface TaskCompletePayload {
  projectId: string;
  task: string;
  result?: any;
  timestamp: string;
}

interface PrismActionPayload {
  projectId: string;
  prismType: 'knowledge' | 'creation' | 'translation' | 'diffraction';
  action: string;
  payload?: any;
  timestamp: string;
}

interface ChatMessagePayload {
  id?: string;
  projectId: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: any;
  timestamp: string;
}

interface KnowledgeBoardStatePayload {
  projectId: string;
  videoId: string;
  state:
    | 'idle'
    | 'analyzing'
    | 'streaming'
    | 'ready'
    | 'syncing'
    | 'synced'
    | 'failed';
  taskId?: string;
  message?: string;
  stats?: Record<string, unknown>;
  timestamp: string;
}

interface KnowledgeTimelinePayload {
  projectId: string;
  videoId: string;
  taskId?: string;
  item: {
    id: string;
    type:
      | 'KEYFRAME_CARD'
      | 'OUTLINE_BLOCK'
      | 'QA_CARD'
      | 'FLASHCARD'
      | 'REVIEW_PLAN';
    timestampSec?: number;
    title: string;
    summary?: string;
    content?: string;
    imageUrl?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
  };
  timestamp: string;
}

// Video Behavior Tracking Payloads
interface VideoEventPayload {
  videoId: string;
  userId: string;
  eventType: string;
  currentTime: number;
  sessionId?: string;
  context?: string;
  timestamp: string;
}

interface VideoBookmarkPayload {
  videoId: string;
  userId: string;
  bookmarkId: string;
  action: 'created' | 'updated' | 'deleted';
  timestamp: string;
}

interface VideoNotePayload {
  videoId: string;
  userId: string;
  noteId: string;
  action: 'created' | 'updated' | 'deleted';
  timestamp: string;
}

interface VideoHighlightPayload {
  videoId: string;
  userId: string;
  highlightId: string;
  action: 'created' | 'updated' | 'deleted' | 'shared';
  timestamp: string;
}

// ============================================================
// Frame Analysis Payloads
// ============================================================

interface FrameAnalysisPayload {
  sessionId: string;
  imageUrl: string;
  timestamp: number;
  description: string;
  detectedObjects: string[];
}

interface FrameRegionAnalysisPayload {
  sessionId: string;
  analysis: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/ws',
})
export class WsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WsGateway.name);
  private userSocketMap = new Map<string, Set<string>>(); // userId -> Set of socketIds
  private projectRooms = new Map<string, Set<string>>(); // projectId -> Set of socketIds

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      // Extract JWT token from handshake auth
      const token = this.extractToken(client);

      if (!token) {
        this.logger.warn(`Connection rejected: No token provided for socket ${client.id}`);
        client.emit('error', { message: 'Authentication required' });
        client.disconnect();
        return;
      }

      // Verify JWT token
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      if (!userId) {
        this.logger.warn(`Connection rejected: Invalid token for socket ${client.id}`);
        client.emit('error', { message: 'Invalid token' });
        client.disconnect();
        return;
      }

      // Store user mapping
      if (!this.userSocketMap.has(userId)) {
        this.userSocketMap.set(userId, new Set());
      }
      this.userSocketMap.get(userId)!.add(client.id);

      // Store userId in socket data for later use
      client.data.userId = userId;

      this.logger.log(`Client ${client.id} connected for user ${userId}`);

      // Send welcome message
      client.emit('connected', {
        socketId: client.id,
        userId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`Connection error for socket ${client.id}: ${error.message}`);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;

    if (userId) {
      // Remove from user mapping
      const userSockets = this.userSocketMap.get(userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.userSocketMap.delete(userId);
        }
      }

      // Remove from all project rooms
      this.projectRooms.forEach((sockets, projectId) => {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.projectRooms.delete(projectId);
        }
      });

      this.logger.log(`Client ${client.id} disconnected for user ${userId}`);
    }
  }

  // Client subscribes to a project room
  @SubscribeMessage('join:project')
  handleJoinProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    const userId = client.data.userId;

    if (!userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    const { projectId } = data;

    // Join socket.io room
    client.join(`project:${projectId}`);

    // Track room membership
    if (!this.projectRooms.has(projectId)) {
      this.projectRooms.set(projectId, new Set());
    }
    this.projectRooms.get(projectId)!.add(client.id);

    this.logger.log(`User ${userId} joined project room ${projectId}`);

    client.emit('joined:project', {
      projectId,
      timestamp: new Date().toISOString(),
    });
  }

  // Client leaves a project room
  @SubscribeMessage('leave:project')
  handleLeaveProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    const { projectId } = data;

    // Leave socket.io room
    client.leave(`project:${projectId}`);

    // Remove from room tracking
    const roomSockets = this.projectRooms.get(projectId);
    if (roomSockets) {
      roomSockets.delete(client.id);
      if (roomSockets.size === 0) {
        this.projectRooms.delete(projectId);
      }
    }

    this.logger.log(`Socket ${client.id} left project room ${projectId}`);

    client.emit('left:project', {
      projectId,
      timestamp: new Date().toISOString(),
    });
  }

  // Send message to a specific user (used by processors)
  emitToUser(userId: string, event: string, data: any) {
    const userSockets = this.userSocketMap.get(userId);

    if (userSockets && userSockets.size > 0) {
      userSockets.forEach((socketId) => {
        this.server.to(socketId).emit(event, data);
      });
    } else {
      this.logger.warn(`No active sockets for user ${userId}`);
    }
  }

  // Send message to all clients in a project room
  emitToProject(projectId: string, event: string, data: any) {
    this.server.to(`project:${projectId}`).emit(event, data);
  }

  // Send task progress event
  emitTaskProgress(userId: string, payload: TaskProgressPayload) {
    this.emitToUser(userId, 'task:progress', payload);
    // Also send to project room
    this.emitToProject(payload.projectId, 'task:progress', payload);
  }

  // Send task error event
  emitTaskError(userId: string, payload: TaskErrorPayload) {
    this.emitToUser(userId, 'task:error', payload);
    this.emitToProject(payload.projectId, 'task:error', payload);
  }

  // Send task complete event
  emitTaskComplete(userId: string, payload: TaskCompletePayload) {
    this.emitToUser(userId, 'task:complete', payload);
    this.emitToProject(payload.projectId, 'task:complete', payload);
  }

  // Send prism action event
  emitPrismAction(projectId: string, payload: PrismActionPayload) {
    this.emitToProject(projectId, 'prism:action', payload);
  }

  // Send chat message event
  emitChatMessage(projectId: string, payload: ChatMessagePayload) {
    this.emitToProject(projectId, 'chat:message', payload);
  }

  // Send knowledge board state event
  emitKnowledgeState(projectId: string, payload: KnowledgeBoardStatePayload) {
    this.emitToProject(projectId, 'knowledge:state', payload);
  }

  // Send incremental knowledge timeline item event
  emitKnowledgeTimeline(projectId: string, payload: KnowledgeTimelinePayload) {
    this.emitToProject(projectId, 'knowledge:timeline', payload);
  }

  // ============================================================
  // Video Behavior Events
  // ============================================================

  // Send video behavior event (real-time sync across devices)
  emitVideoEvent(userId: string, payload: VideoEventPayload) {
    this.emitToUser(userId, 'video:event', payload);
  }

  // Send bookmark event
  emitVideoBookmark(userId: string, payload: VideoBookmarkPayload) {
    this.emitToUser(userId, 'video:bookmark', payload);
  }

  // Send note event
  emitVideoNote(userId: string, payload: VideoNotePayload) {
    this.emitToUser(userId, 'video:note', payload);
  }

  // Send highlight event
  emitVideoHighlight(userId: string, payload: VideoHighlightPayload) {
    this.emitToUser(userId, 'video:highlight', payload);
  }

  // Send frame analysis event
  emitFrameAnalysis(projectId: string, payload: FrameAnalysisPayload) {
    this.emitToProject(projectId, 'frame:analysis', payload);
  }

  // Send frame region analysis event
  emitFrameRegionAnalysis(projectId: string, payload: FrameRegionAnalysisPayload) {
    this.emitToProject(projectId, 'frame:region-analysis', payload);
  }

  // Broadcast session update to project room
  emitSessionUpdate(projectId: string, payload: {
    videoId: string;
    sessionId: string;
    userId: string;
    isActive: boolean;
    currentTime?: number;
    timestamp: string;
  }) {
    this.emitToProject(projectId, 'video:session-update', payload);
  }

  // Helper: Extract JWT token from socket
  private extractToken(client: Socket): string | null {
    // Try auth.token first (from handshake auth)
    if (client.handshake.auth?.token) {
      return client.handshake.auth.token;
    }

    // Try Authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try query parameter (less secure, but fallback)
    if (client.handshake.query?.token) {
      return client.handshake.query.token as string;
    }

    return null;
  }
}
