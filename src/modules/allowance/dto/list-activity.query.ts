import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** contracts/rest-api.md "Pagination": `?cursor=<opaque>&limit=<1..100, default 30>`. */
export class ListActivityQuery {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
