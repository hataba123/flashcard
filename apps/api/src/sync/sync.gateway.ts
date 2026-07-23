import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

interface AccessTokenPayload {
  sub: string;
}

@WebSocketGateway({ cors: { origin: process.env.WEB_ORIGIN, credentials: true } })
export class SyncGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;
  constructor(private readonly jwtService: JwtService) {}
  async handleConnection(client: Socket): Promise<void> {
    const authorization = client.handshake.auth.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(authorization.slice(7));
      await client.join(this.room(payload.sub));
    } catch {
      client.disconnect(true);
    }
  }
  publish(userId: string, sequence: number): void {
    this.server.to(this.room(userId)).emit('sync.required', { sequence });
  }
  private room(userId: string): string {
    return `user:${userId}`;
  }
}
