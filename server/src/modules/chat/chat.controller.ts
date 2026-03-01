import { Controller, Get, Post, Param } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('api/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get(':sessionId/messages')
  getMessages(@Param('sessionId') sessionId: string) {
    // TODO
  }

  @Post(':sessionId/messages')
  sendMessage(@Param('sessionId') sessionId: string) {
    // TODO
  }
}
