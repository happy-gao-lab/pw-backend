export class UpdateUserWordEntryDto {
  addTranslations: string[];
  removeTranslationIds: number[];
  addDefinitions: string[];
  removeDefinitionIds: number[];
}

class DictionaryValue {
  id: number;
  value: string;
}

export class UserDictionaryEntry {
  id: number;
  word: string;
  translations: DictionaryValue[];
  definitions: DictionaryValue[];
}
