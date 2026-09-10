import DB from '../db/index.js';

export type Tx = Parameters<Parameters<typeof DB.transaction>[0]>[0];
