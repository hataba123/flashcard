import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { UserEntity } from '../entities/user.entity.js';

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): UserEntity => {
    const request = context.switchToHttp().getRequest<Request & { user: UserEntity }>();
    return request.user;
  }
);
