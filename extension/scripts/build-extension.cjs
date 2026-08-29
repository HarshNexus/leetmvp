const esbuild = require('esbuild');

Promise.all([
  esbuild.build({ entryPoints: ['src/content.ts'], outfile: 'dist/content.js', bundle: true, format: 'iife', platform: 'browser', target: 'es2020' }),
  esbuild.build({ entryPoints: ['src/background.ts'], outfile: 'dist/background.js', bundle: true, format: 'iife', platform: 'browser', target: 'es2020' }),
  esbuild.build({ entryPoints: ['src/popup.ts'], outfile: 'dist/popup.js', bundle: true, format: 'iife', platform: 'browser', target: 'es2020' }),
]).catch(() => process.exit(1));
