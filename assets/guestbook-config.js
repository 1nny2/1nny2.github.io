'use strict';
// Public configuration only. Never put database passwords or admin tokens here.
window.NNY_GUESTBOOK = Object.freeze({
  // Enable only after server-side MANUAL_REVIEW and anonymous-access tests pass.
  enabled: true,
  envId: 'https://1nny2-guestbook.netlify.app/.netlify/functions/twikoo',
  path: '/guestbook'
});
