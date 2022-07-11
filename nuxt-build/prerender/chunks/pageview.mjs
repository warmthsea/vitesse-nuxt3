import { defineEventHandler } from 'file://V:/GitHub/vitesse-nuxt3/node_modules/.pnpm/h3@0.7.10/node_modules/h3/dist/index.mjs';

const startAt = Date.now();
let count = 0;
const pageview = defineEventHandler(() => ({
  pageview: count++,
  startAt
}));

export { pageview as default };
//# sourceMappingURL=pageview.mjs.map
