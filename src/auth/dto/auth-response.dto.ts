import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({ description: 'Short-lived JWT access token (15m)' })
  accessToken: string;

  @ApiProperty({ description: 'Long-lived refresh token (7d)' })
  refreshToken: string;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'Logged out successfully' })
  message: string;
}
