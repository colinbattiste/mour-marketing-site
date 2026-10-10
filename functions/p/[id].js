import { handle } from '../_lib/viewer.js';
// /p/<post id> → GET /api/v1/posts/:id (public posts only; the API decides)
export const onRequestGet = (context) => handle('p', context);
