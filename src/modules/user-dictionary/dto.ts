import { IsString, MinLength } from 'class-validator';

export class CreateWordDto {
  @IsString()
  @MinLength(2)
  value: string;
  definitions: string[];
  translations: string[];
}
