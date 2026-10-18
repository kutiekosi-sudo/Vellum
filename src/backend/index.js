// One import point for the rest of the app. The test build rewrites './real.js' to './fake.js' (see build.mjs).
export { auth, db, callFunction, downloadFile, isFake } from './real.js';
