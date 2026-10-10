import { handle } from '../_lib/viewer.js';
// /s/<token> → GET /api/v1/share/:token
export const onRequestGet = (context) => handle('s', context);
