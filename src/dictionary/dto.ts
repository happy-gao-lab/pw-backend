export class CreateWordDto {
  value: string;
  definitions: string[];
  translations: string[];
}

export class UpdateWordDto {
  definitions: string[];
  translations: string[];
}

export class FindDictionaryQueryDto {
  page?: number;
  pageSize?: number;
  search?: string;
  ids?: number[];
}
