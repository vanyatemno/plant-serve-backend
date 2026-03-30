import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload;
    return data ? user[data as keyof JwtPayload] : user;
  },
);
