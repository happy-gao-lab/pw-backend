import { IsArray, IsString, MinLength } from 'class-validator';

export class CreateWordDto {
  @IsString()
  @MinLength(2)
  value: string;

  @IsArray()
  @IsString({ each: true })
  definitions: string[];

  @IsArray()
  @IsString({ each: true })
  translations: string[];
}
