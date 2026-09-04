export type PracticeFilter = 'not_learned' | 'poor' | 'average' | 'learned' | 'random';

export class PracticeSessionQueryDto {
  filter?: PracticeFilter;
}

export type ExerciseType =
  | 'choose_translation'
  | 'match_definition'
  | 'type_word'
  | 'select_all_translations';

export class VerifyAnswerDto {
  wordId: number;
  type: ExerciseType;
  answer: string | number | string[];
}
