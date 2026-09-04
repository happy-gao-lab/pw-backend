export class CreateWordDto {
  value: string;
  definitions: string[];
  translations: string[];
}

export class UpdateWordDto {
  definitions: string[];
  translations: string[];
}

export type DictionarySort = 'percentage_asc' | 'percentage_desc';
export type DictionaryFilter = 'not_learned' | 'poor' | 'average' | 'learned';

export class FindDictionaryQueryDto {
  page?: number;
  pageSize?: number;
  search?: string;
  ids?: number[];
  sort?: DictionarySort;
  filter?: DictionaryFilter;
}
