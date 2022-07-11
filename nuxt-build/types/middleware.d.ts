import type { NavigationGuard } from 'vue-router'
export type MiddlewareKey = string
declare module "V:/GitHub/vitesse-nuxt3/node_modules/.pnpm/nuxt@3.0.0-rc.4_sass@1.53.0/node_modules/nuxt/dist/pages/runtime/composables" {
  interface PageMeta {
    middleware?: MiddlewareKey | NavigationGuard | Array<MiddlewareKey | NavigationGuard>
  }
}