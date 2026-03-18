import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

const logger = new Logger('JwtStrategy');

// Custom JWT extractor that prioritizes header over query parameter
// WARNING: Query parameter token extraction is a security risk and should only be used
// for specific endpoints like video streaming. Consider implementing one-time tokens.
const customJwtExtractor = (request: Request) => {
  // 1. First: Check Authorization header (Bearer token) - MOST SECURE
  const authHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
  if (authHeader) {
    return authHeader;
  }

  // 2. Fallback: Check query parameter ONLY for specific routes
  // SECURITY RISK: Tokens in URLs can be logged in:
  // - Browser history
  // - Server access logs
  // - Referer headers to third-party sites
  const token = request.query?.token as string;
  if (token) {
    // Only allow query param tokens for specific public resource endpoints
    const allowedPaths = ['/api/videos/', '/api/stream/'];
    const isAllowedPath = allowedPaths.some(path => request.path.startsWith(path));

    if (!isAllowedPath) {
      logger.error(`REJECTED: Query parameter token not allowed for path: ${request.path}`);
      return null;
    }

    logger.debug(`Token extracted from query parameter for allowed path: ${request.path}`);

    return token;
  }

  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: customJwtExtractor,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'default-secret'),
      // Add JWT algorithm specification for better security
      algorithms: ['HS256'],
    });
  }

  async validate(payload: { sub: string; email: string }) {
    // Validate token payload structure
    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new Error('Invalid token payload: missing or invalid user ID');
    }

    // Return user object with id property for controllers to use
    return { id: payload.sub, email: payload.email };
  }
}
