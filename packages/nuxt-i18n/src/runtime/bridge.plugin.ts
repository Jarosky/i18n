import Vue from 'vue'
import { ref, computed } from 'vue-demi'
import VueI18n from 'vue-i18n'
import { createI18n } from '@intlify/vue-i18n-bridge'
import {
  createLocaleFromRouteGetter,
  extendI18n,
  registerGlobalOptions,
  getRouteBaseName,
  localePath,
  localeLocation,
  localeRoute,
  switchLocalePath,
  localeHead
} from 'vue-i18n-routing'
import { isEmptyObject, isString } from '@intlify/shared'
import { castToVueI18n } from '@intlify/vue-i18n-bridge'
import { defineNuxtPlugin, useRouter, addRouteMiddleware, navigateTo } from '#app'
import { loadMessages, localeCodes, resolveNuxtI18nOptions, nuxtI18nInternalOptions } from '#build/i18n.options.mjs'
import { loadAndSetLocale, detectLocale } from '#build/i18n.utils.mjs'
import {
  getInitialLocale,
  getBrowserLocale as _getBrowserLocale,
  getLocaleCookie as _getLocaleCookie,
  setLocaleCookie as _setLocaleCookie
} from '#build/i18n.internal.mjs'

import type { I18nOptions, Composer } from '@intlify/vue-i18n-bridge'
import type {
  LocaleObject,
  Route,
  RouteLocationNormalized,
  RouteLocationNormalizedLoaded,
  ExtendProperyDescripters
} from 'vue-i18n-routing'

export default defineNuxtPlugin(async nuxt => {
  const router = useRouter()
  const legacyNuxtContext = nuxt.nuxt2Context
  const { app } = legacyNuxtContext

  const nuxtI18nOptions = await resolveNuxtI18nOptions(nuxt)
  const getLocaleFromRoute = createLocaleFromRouteGetter(
    localeCodes,
    nuxtI18nOptions.routesNameSeparator,
    nuxtI18nOptions.defaultLocaleRouteNameSuffix
  )

  const vueI18nOptions = nuxtI18nOptions.vueI18n as I18nOptions

  // register nuxt/i18n options as global
  // so global options is reffered by `vue-i18n-routing`
  registerGlobalOptions(router, nuxtI18nOptions)

  // load messages
  const messages = await loadMessages()
  if (!isEmptyObject(messages)) {
    vueI18nOptions.messages = messages
  }

  // detect initial locale
  // const initialLocale = vueI18nOptions.locale || 'en-US'
  const initialLocale = getInitialLocale(
    nuxt.ssrContext,
    process.client ? router.currentRoute : nuxt.ssrContext!.url,
    nuxtI18nOptions,
    localeCodes,
    getLocaleFromRoute
  )
  // TODO: remove console log!
  console.log('initial locale', initialLocale)

  // install legacy vue-i18n to vue
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Vue.use(VueI18n as any, { bridge: true })

  // create an i18n instance
  const i18n = createI18n(
    {
      ...vueI18nOptions,
      locale: initialLocale
    },
    VueI18n
  )

  // extend i18n instance
  extendI18n(i18n, {
    locales: nuxtI18nOptions.locales,
    localeCodes,
    baseUrl: nuxtI18nOptions.baseUrl,
    hooks: {
      onExtendComposer(composer: Composer) {
        const _localeProperties = ref<LocaleObject>(
          nuxtI18nInternalOptions.__normalizedLocales.find((l: LocaleObject) => l.code === composer.locale.value) || {
            code: composer.locale.value
          }
        )
        composer.localeProperties = computed(() => _localeProperties.value)
        composer.setLocale = (locale: string) =>
          loadAndSetLocale(router.currentRoute, locale, app, i18n, getLocaleFromRoute, nuxtI18nOptions)
        composer.getBrowserLocale = () => _getBrowserLocale(nuxtI18nInternalOptions, nuxt.ssrContext)
        composer.getLocaleCookie = () =>
          _getLocaleCookie(nuxt.ssrContext, { ...nuxtI18nOptions.detectBrowserLanguage, localeCodes })
        composer.setLocaleCookie = (locale: string) =>
          _setLocaleCookie(locale, nuxt.ssrContext, nuxtI18nOptions.detectBrowserLanguage)
      },
      onExtendExportedGlobal(global: Composer): ExtendProperyDescripters {
        return {
          localeProperties: {
            get() {
              return global.localeProperties.value
            }
          },
          getBrowserLocale: {
            get() {
              return () => Reflect.apply(global.getBrowserLocale, global, [])
            }
          },
          getLocaleCookie: {
            get() {
              return () => Reflect.apply(global.getLocaleCookie, global, [])
            }
          },
          setLocaleCookie: {
            get() {
              return (locale: string) => Reflect.apply(global.setLocaleCookie, global, [locale])
            }
          }
        }
      },
      onExtendVueI18n(composer: Composer): ExtendProperyDescripters {
        return {
          localeProperties: {
            get() {
              return composer.localeProperties.value
            }
          },
          getBrowserLocale: {
            get() {
              return () => Reflect.apply(composer.getBrowserLocale, composer, [])
            }
          },
          getLocaleCookie: {
            get() {
              return () => Reflect.apply(composer.getLocaleCookie, composer, [])
            }
          },
          setLocaleCookie: {
            get() {
              return (locale: string) => Reflect.apply(composer.setLocaleCookie, composer, [locale])
            }
          }
        }
      }
    }
  })

  // TODO: should implement `{ inject: boolean }
  // install vue-i18n to vue
  Vue.use(castToVueI18n(i18n))

  // support for nuxt legacy (compatibility)
  if (legacyNuxtContext) {
    const { store } = legacyNuxtContext
    legacyNuxtContext.i18n = i18n.global as unknown as Composer // TODO: should resolve type!
    app.i18n = i18n.global as unknown as Composer // TODO: should resolve type!
    app.getRouteBaseName = legacyNuxtContext.getRouteBaseName = proxyNuxtLegacy(legacyNuxtContext, getRouteBaseName)
    app.localePath = legacyNuxtContext.localePath = proxyNuxtLegacy(legacyNuxtContext, localePath)
    app.localeRoute = legacyNuxtContext.localeRoute = proxyNuxtLegacy(legacyNuxtContext, localeRoute)
    app.localeLocation = legacyNuxtContext.localeLocation = proxyNuxtLegacy(legacyNuxtContext, localeLocation)
    app.switchLocalePath = legacyNuxtContext.switchLocalePath = proxyNuxtLegacy(legacyNuxtContext, switchLocalePath)
    app.localeHead = legacyNuxtContext.localeHead = proxyNuxtLegacy(legacyNuxtContext, localeHead)
    if (store) {
      // TODO: should implement for vuex and pinia
    }
  }
  // console.log('nuxt legacy context', legacyNuxtContext)

  // support compatible legacy nuxt/i18n API
  // TODO: `this` should annotate with `Vue`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nuxt.provide('nuxtI18nHead', function (this: any) {
    return Reflect.apply(
      localeHead,
      {
        getRouteBaseName: this.getRouteBaseName,
        localePath: this.localePath,
        localeRoute: this.localeRoute,
        localeLocation: this.localeLocation,
        resolveRoute: this.resolveRoute,
        switchLocalePath: this.switchLocalePath,
        localeHead: this.localeHead,
        i18n: this.$i18n,
        route: this.$route,
        router: this.$router
      },
      // eslint-disable-next-line prefer-rest-params
      arguments
    )
  })

  if (process.client) {
    addRouteMiddleware(
      'locale-changing',
      async (to: RouteLocationNormalized, from: RouteLocationNormalized) => {
        const locale = detectLocale(to, nuxt.ssrContext, i18n, getLocaleFromRoute, nuxtI18nOptions, localeCodes)
        // TODO: remove console log!
        console.log('detectlocale client return', locale)
        const redirectPath = await loadAndSetLocale(to, locale, app, i18n, getLocaleFromRoute, nuxtI18nOptions)
      },
      { global: true }
    )
  } else {
    const routeURL = nuxt.ssrContext!.url
    const locale = detectLocale(routeURL, nuxt.ssrContext, i18n, getLocaleFromRoute, nuxtI18nOptions, localeCodes)
    // TODO: remove console log!
    console.log('detectlocale server return', locale)
    const redirectPath = await loadAndSetLocale(
      routeURL,
      locale || nuxtI18nOptions.defaultLocale,
      app,
      i18n,
      getLocaleFromRoute,
      nuxtI18nOptions
    )
  }
})

async function navigate(route: string | Route | RouteLocationNormalized | RouteLocationNormalizedLoaded, context: any) {
  const routePaht = isString(route) ? route : route.path
  console.log('navigate routePath', routePaht)
  if (process.client) {
    console.log('sss', navigateTo('/'))
  } else {
    // TODO: should change to `navigateTo`, if we can use it as universal
    context.res.writeHead(302, {
      Location: '/'
    })
    context.res.end()
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
function proxyNuxtLegacy(context: any, target: Function) {
  return function () {
    const { app, req, route, store } = context
    return Reflect.apply(
      target,
      {
        getRouteBaseName: app.getRouteBaseName,
        i18n: app.i18n,
        localePath: app.localePath,
        localeLocation: app.localeLocation,
        localeRoute: app.localeRoute,
        localeHead: app.localeHead,
        req: process.server ? req : null,
        route,
        router: app.router
        // TODO: should implement for vuex and pinia
        // store
      },
      // eslint-disable-next-line prefer-rest-params
      arguments
    )
  }
}
