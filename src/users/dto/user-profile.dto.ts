import { ApiProperty } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty({ description: 'User UUID' })
  id: string;

  @ApiProperty({ description: 'User email address' })
  email: string;

  @ApiProperty({ description: 'Account creation timestamp' })
  createdAt: Date;
}
