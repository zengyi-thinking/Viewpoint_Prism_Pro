import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    // If user object has id property, return it (for backward compatibility)
    // Otherwise return the whole user object
    const user = request.user;
    if (user && typeof user === 'object' && 'id' in user) {
      return user.id; // Default: return user ID for backward compatibility
    }
    return user;
  },
);
