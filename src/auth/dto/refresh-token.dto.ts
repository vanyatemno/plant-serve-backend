import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'The refresh token received during login or previous refresh' })
  @IsString()
  refreshToken: string;
}
