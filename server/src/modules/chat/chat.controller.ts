import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { CreateChatSessionDto, GetChatMessagesQueryDto, SendChatMessageDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('api/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('sessions')
  createSession(
    @CurrentUser() userId: string,
    @Body() dto: CreateChatSessionDto,
  ) {
    return this.chatService.createSession(userId, dto);
  }

  @Get('sessions/:sessionId/messages')
  @Get(':sessionId/messages')
  getMessages(
    @CurrentUser() userId: string,
    @Param('sessionId') sessionId: string,
    @Query() query: GetChatMessagesQueryDto,
  ) {
    return this.chatService.getMessages(userId, sessionId, query);
  }

  @Post('sessions/:sessionId/messages')
  @Post(':sessionId/messages')
  sendMessage(
    @CurrentUser() userId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chatService.sendMessage(userId, sessionId, dto);
  }
}
