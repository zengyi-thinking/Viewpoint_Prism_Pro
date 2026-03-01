import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: true, namespace: '/ws' })
export class WsGateway {
  @WebSocketServer()
  server: Server;
}
