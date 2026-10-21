import {readFile, writeFile} from 'node:fs/promises';
const html = await readFile(new URL('index.html', import.meta.url), 'utf8');
const css = (await readFile(new URL('style.css', import.meta.url), 'utf8')).replace(/^@import[^\n]*\n/gm, '');
const model = (await readFile(new URL('model.mjs', import.meta.url), 'utf8')).replace(/^export /gm, '');
const storage = (await readFile(new URL('storage.mjs', import.meta.url), 'utf8')).replace(/^export /gm, '');
const app = (await readFile(new URL('app.js', import.meta.url), 'utf8')).replace(/^import[^\n]*\n/gm, '');
const standalone = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`).replace('<script type="module" src="app.js"></script>', () => `<script>${model}\n${storage}\n${app}</script>`);
await writeFile(new URL('chaekjang.html', import.meta.url), standalone);
console.log('Built chaekjang.html with all styles and code embedded.');
