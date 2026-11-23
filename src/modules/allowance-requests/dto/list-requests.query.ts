import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListRequestsQuery {
  @IsOptional()
  @IsIn(['pending', 'resolved'])
  status?: 'pending' | 'resolved';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
