import { defineRelationsPart } from 'drizzle-orm';

import {
  definitionsTable,
  translationsTable,
  wordsTable,
} from '../schemas/global-dictionary.schemas.js';
import {
  userWordDefinitionsTable,
  userWordsTable,
  userWordTranslationsTable,
} from '../schemas/user-dictionary.schemas.js';

const mainRelations = defineRelationsPart({
  wordsTable,
  translationsTable,
  definitionsTable,
  userWordsTable,
  userWordTranslationsTable,
  userWordDefinitionsTable,
});

const userDictionaryRelations = defineRelationsPart(
  {
    wordsTable,
    translationsTable,
    definitionsTable,
    userWordsTable,
    userWordTranslationsTable,
    userWordDefinitionsTable,
  },
  (r) => ({
    userWordsTable: {
      word: r.one.wordsTable({
        from: r.userWordsTable.wordId,
        to: r.wordsTable.id,
        optional: false,
      }),
      translations: r.many.translationsTable({
        from: r.userWordsTable.id.through(
          r.userWordTranslationsTable.userWordId,
        ),
        to: r.translationsTable.id.through(r.userWordTranslationsTable.valueId),
      }),
      definitions: r.many.definitionsTable({
        from: r.userWordsTable.id.through(
          r.userWordDefinitionsTable.userWordId,
        ),
        to: r.definitionsTable.id.through(r.userWordDefinitionsTable.valueId),
      }),
    },
  }),
);

export default { ...mainRelations, ...userDictionaryRelations };
