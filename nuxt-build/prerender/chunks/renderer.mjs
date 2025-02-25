import { eventHandler, useQuery } from 'file://V:/GitHub/vitesse-nuxt3/node_modules/.pnpm/h3@0.7.10/node_modules/h3/dist/index.mjs';
import { joinURL } from 'file://V:/GitHub/vitesse-nuxt3/node_modules/.pnpm/ufo@0.8.5/node_modules/ufo/dist/index.mjs';
import { u as useRuntimeConfig } from './nitro-prerenderer.mjs';
import * as proxy from 'file://V:/GitHub/vitesse-nuxt3/node_modules/.pnpm/unenv@0.5.2/node_modules/unenv/runtime/mock/proxy.mjs';
import * as stream from 'stream';

const IS_JS_RE = /\.[cm]?js(\?[^.]+)?$/;
const IS_MODULE_RE = /\.mjs(\?[^.]+)?$/;
const HAS_EXT_RE = /[^./]+\.[^./]+$/;
const IS_CSS_RE = /\.(css|postcss|sass|scss|less|stylus|styl)(\?[^.]+)?$/;
function isJS(file) {
  return IS_JS_RE.test(file) || !HAS_EXT_RE.test(file);
}
function isModule(file) {
  return IS_MODULE_RE.test(file) || !HAS_EXT_RE.test(file);
}
function isCSS(file) {
  return IS_CSS_RE.test(file);
}
function getExtension(file) {
  const withoutQuery = file.replace(/\?.*/, "");
  return withoutQuery.split(".").pop() || "";
}
function ensureTrailingSlash(path) {
  if (path === "") {
    return path;
  }
  return path.replace(/([^/])$/, "$1/");
}
function getPreloadType(ext) {
  if (ext === "js" || ext === "cjs" || ext === "mjs") {
    return "script";
  } else if (ext === "css") {
    return "style";
  } else if (/jpe?g|png|svg|gif|webp|ico/.test(ext)) {
    return "image";
  } else if (/woff2?|ttf|otf|eot/.test(ext)) {
    return "font";
  } else {
    return void 0;
  }
}

function createRendererContext({ clientManifest, publicPath, basedir, shouldPrefetch, shouldPreload }) {
  const ctx = {
    shouldPrefetch: shouldPrefetch || (() => true),
    shouldPreload: shouldPreload || ((_file, asType) => ["module", "script", "style"].includes(asType)),
    publicPath: ensureTrailingSlash(publicPath || "/"),
    basedir,
    clientManifest: void 0,
    updateManifest,
    _dependencies: void 0,
    _dependencySets: void 0,
    _entrypoints: void 0,
    _dynamicEntrypoints: void 0
  };
  function updateManifest(clientManifest2) {
    const manifest = normalizeClientManifest(clientManifest2);
    const manifestEntries = Object.entries(manifest);
    ctx.clientManifest = manifest;
    ctx._dependencies = {};
    ctx._dependencySets = {};
    ctx._entrypoints = manifestEntries.filter((e) => e[1].isEntry).map(([module]) => module);
    ctx._dynamicEntrypoints = manifestEntries.filter((e) => e[1].isDynamicEntry).map(([module]) => module);
    ctx.publicPath = ensureTrailingSlash(publicPath || clientManifest2.publicPath || "/");
  }
  updateManifest(clientManifest);
  return ctx;
}
function isLegacyClientManifest(clientManifest) {
  return "all" in clientManifest && "initial" in clientManifest;
}
function getIdentifier(output) {
  return output ? `_${output}` : null;
}
function normalizeClientManifest(manifest = {}) {
  if (!isLegacyClientManifest(manifest)) {
    return manifest;
  }
  const clientManifest = {};
  for (const outfile of manifest.all) {
    if (isJS(outfile)) {
      clientManifest[getIdentifier(outfile)] = {
        file: outfile
      };
    }
  }
  const first = getIdentifier(manifest.initial.find(isJS));
  if (first) {
    if (!(first in clientManifest)) {
      throw new Error(`Invalid manifest - initial entrypoint not in \`all\`: ${manifest.initial.find(isJS)}`);
    }
    clientManifest[first].css = [];
    clientManifest[first].assets = [];
    clientManifest[first].dynamicImports = [];
  }
  for (const outfile of manifest.initial) {
    if (isJS(outfile)) {
      clientManifest[getIdentifier(outfile)].isEntry = true;
    } else if (isCSS(outfile) && first) {
      clientManifest[first].css.push(outfile);
    } else if (first) {
      clientManifest[first].assets.push(outfile);
    }
  }
  for (const outfile of manifest.async) {
    if (isJS(outfile)) {
      const identifier = getIdentifier(outfile);
      if (!(identifier in clientManifest)) {
        throw new Error(`Invalid manifest - async module not in \`all\`: ${outfile}`);
      }
      clientManifest[identifier].isDynamicEntry = true;
      clientManifest[first].dynamicImports.push(identifier);
    } else if (first) {
      const key = isCSS(outfile) ? "css" : "assets";
      const identifier = getIdentifier(outfile);
      clientManifest[identifier] = {
        file: "",
        [key]: [outfile]
      };
      clientManifest[first].dynamicImports.push(identifier);
    }
  }
  for (const [moduleId, importIndexes] of Object.entries(manifest.modules)) {
    const jsFiles = importIndexes.map((index) => manifest.all[index]).filter(isJS);
    jsFiles.forEach((file) => {
      const identifier = getIdentifier(file);
      clientManifest[identifier] = {
        ...clientManifest[identifier],
        file
      };
    });
    const mappedIndexes = importIndexes.map((index) => manifest.all[index]);
    clientManifest[moduleId] = {
      file: "",
      imports: jsFiles.map((id) => getIdentifier(id)),
      css: mappedIndexes.filter(isCSS),
      assets: mappedIndexes.filter((i) => !isJS(i) && !isCSS(i))
    };
  }
  return clientManifest;
}
function getModuleDependencies(id, rendererContext) {
  if (rendererContext._dependencies[id]) {
    return rendererContext._dependencies[id];
  }
  const dependencies = {
    scripts: {},
    styles: {},
    preload: {},
    prefetch: {}
  };
  const meta = rendererContext.clientManifest[id];
  if (!meta) {
    rendererContext._dependencies[id] = dependencies;
    return dependencies;
  }
  if (meta.file) {
    const type = isModule(meta.file) ? "module" : "script";
    dependencies.scripts[id] = { path: meta.file, type };
    dependencies.preload[id] = { path: meta.file, type };
  }
  for (const css of meta.css || []) {
    dependencies.styles[css] = { path: css };
    dependencies.preload[css] = { path: css, type: "style" };
    dependencies.prefetch[css] = { path: css };
  }
  for (const asset of meta.assets || []) {
    dependencies.preload[asset] = { path: asset, type: getPreloadType(asset), extension: getExtension(asset) };
    dependencies.prefetch[asset] = { path: asset };
  }
  for (const depId of meta.imports || []) {
    const depDeps = getModuleDependencies(depId, rendererContext);
    Object.assign(dependencies.styles, depDeps.styles);
    Object.assign(dependencies.preload, depDeps.preload);
    Object.assign(dependencies.prefetch, depDeps.prefetch);
  }
  const filteredPreload = {};
  for (const id2 in dependencies.preload) {
    const dep = dependencies.preload[id2];
    if (rendererContext.shouldPreload(dep.path, dep.type)) {
      filteredPreload[id2] = dependencies.preload[id2];
    }
  }
  dependencies.preload = filteredPreload;
  rendererContext._dependencies[id] = dependencies;
  return dependencies;
}
function getAllDependencies(ids, rendererContext) {
  const cacheKey = Array.from(ids).join(",");
  if (rendererContext._dependencySets[cacheKey]) {
    return rendererContext._dependencySets[cacheKey];
  }
  const allDeps = {
    scripts: {},
    styles: {},
    preload: {},
    prefetch: {}
  };
  for (const id of ids) {
    const deps = getModuleDependencies(id, rendererContext);
    Object.assign(allDeps.scripts, deps.scripts);
    Object.assign(allDeps.styles, deps.styles);
    Object.assign(allDeps.preload, deps.preload);
    Object.assign(allDeps.prefetch, deps.prefetch);
    for (const dynamicDepId of rendererContext.clientManifest[id]?.dynamicImports || []) {
      const dynamicDeps = getModuleDependencies(dynamicDepId, rendererContext);
      Object.assign(allDeps.prefetch, dynamicDeps.scripts);
      Object.assign(allDeps.prefetch, dynamicDeps.styles);
      Object.assign(allDeps.prefetch, dynamicDeps.preload);
      Object.assign(allDeps.prefetch, dynamicDeps.prefetch);
    }
  }
  for (const id in allDeps.prefetch) {
    if (id in allDeps.preload) {
      delete allDeps.prefetch[id];
    }
  }
  rendererContext._dependencySets[cacheKey] = allDeps;
  return allDeps;
}
function getRequestDependencies(ssrContext, rendererContext) {
  if (ssrContext._requestDependencies) {
    return ssrContext._requestDependencies;
  }
  const ids = new Set(Array.from([
    ...rendererContext._entrypoints,
    ...ssrContext.modules || ssrContext._registeredComponents || []
  ]));
  const deps = getAllDependencies(ids, rendererContext);
  ssrContext._requestDependencies = deps;
  return deps;
}
function renderStyles(ssrContext, rendererContext) {
  const { styles } = getRequestDependencies(ssrContext, rendererContext);
  return Object.values(styles).map(({ path }) => `<link rel="stylesheet" href="${rendererContext.publicPath}${path}">`).join("");
}
function renderResourceHints(ssrContext, rendererContext) {
  return renderPreloadLinks(ssrContext, rendererContext) + renderPrefetchLinks(ssrContext, rendererContext);
}
function renderPreloadLinks(ssrContext, rendererContext) {
  const { preload } = getRequestDependencies(ssrContext, rendererContext);
  return Object.values(preload).map((file) => {
    const rel = file.type === "module" ? "modulepreload" : "preload";
    const as = file.type ? file.type === "module" ? ' as="script"' : ` as="${file.type}"` : "";
    const type = file.type === "font" ? ` type="font/${file.extension}" crossorigin` : "";
    const crossorigin = file.type === "font" || file.type === "module" ? " crossorigin" : "";
    return `<link rel="${rel}" href="${rendererContext.publicPath}${file.path}"${as}${type}${crossorigin}>`;
  }).join("");
}
function renderPrefetchLinks(ssrContext, rendererContext) {
  const { prefetch } = getRequestDependencies(ssrContext, rendererContext);
  return Object.values(prefetch).map(({ path }) => {
    const rel = "prefetch" + (isCSS(path) ? " stylesheet" : "");
    const as = isJS(path) ? ' as="script"' : "";
    return `<link rel="${rel}"${as} href="${rendererContext.publicPath}${path}">`;
  }).join("");
}
function renderScripts(ssrContext, rendererContext) {
  const { scripts } = getRequestDependencies(ssrContext, rendererContext);
  return Object.values(scripts).map(({ path, type }) => `<script${type === "module" ? ' type="module"' : ""} src="${rendererContext.publicPath}${path}"${type !== "module" ? " defer" : ""} crossorigin><\/script>`).join("");
}
function createRenderer(createApp, renderOptions) {
  const rendererContext = createRendererContext(renderOptions);
  return {
    rendererContext,
    async renderToString(ssrContext) {
      ssrContext._registeredComponents = ssrContext._registeredComponents || /* @__PURE__ */ new Set();
      const _createApp = await Promise.resolve(createApp).then((r) => r.default || r);
      const app = await _createApp(ssrContext);
      const html = await renderOptions.renderToString(app, ssrContext);
      const wrap = (fn) => () => fn(ssrContext, rendererContext);
      return {
        html,
        renderResourceHints: wrap(renderResourceHints),
        renderStyles: wrap(renderStyles),
        renderScripts: wrap(renderScripts)
      };
    }
  };
}

const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$";
const unsafeChars = /[<>\b\f\n\r\t\0\u2028\u2029]/g;
const reserved = /^(?:do|if|in|for|int|let|new|try|var|byte|case|char|else|enum|goto|long|this|void|with|await|break|catch|class|const|final|float|short|super|throw|while|yield|delete|double|export|import|native|return|switch|throws|typeof|boolean|default|extends|finally|package|private|abstract|continue|debugger|function|volatile|interface|protected|transient|implements|instanceof|synchronized)$/;
const escaped = {
  "<": "\\u003C",
  ">": "\\u003E",
  "/": "\\u002F",
  "\\": "\\\\",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "	": "\\t",
  "\0": "\\0",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029"
};
const objectProtoOwnPropertyNames = Object.getOwnPropertyNames(Object.prototype).sort().join("\0");
function devalue(value) {
  const counts = new Map();
  let logNum = 0;
  function log(message) {
    if (logNum < 100) {
      console.warn(message);
      logNum += 1;
    }
  }
  function walk(thing) {
    if (typeof thing === "function") {
      log(`Cannot stringify a function ${thing.name}`);
      return;
    }
    if (counts.has(thing)) {
      counts.set(thing, counts.get(thing) + 1);
      return;
    }
    counts.set(thing, 1);
    if (!isPrimitive(thing)) {
      const type = getType(thing);
      switch (type) {
        case "Number":
        case "String":
        case "Boolean":
        case "Date":
        case "RegExp":
          return;
        case "Array":
          thing.forEach(walk);
          break;
        case "Set":
        case "Map":
          Array.from(thing).forEach(walk);
          break;
        default:
          const proto = Object.getPrototypeOf(thing);
          if (proto !== Object.prototype && proto !== null && Object.getOwnPropertyNames(proto).sort().join("\0") !== objectProtoOwnPropertyNames) {
            if (typeof thing.toJSON !== "function") {
              log(`Cannot stringify arbitrary non-POJOs ${thing.constructor.name}`);
            }
          } else if (Object.getOwnPropertySymbols(thing).length > 0) {
            log(`Cannot stringify POJOs with symbolic keys ${Object.getOwnPropertySymbols(thing).map((symbol) => symbol.toString())}`);
          } else {
            Object.keys(thing).forEach((key) => walk(thing[key]));
          }
      }
    }
  }
  walk(value);
  const names = new Map();
  Array.from(counts).filter((entry) => entry[1] > 1).sort((a, b) => b[1] - a[1]).forEach((entry, i) => {
    names.set(entry[0], getName(i));
  });
  function stringify(thing) {
    if (names.has(thing)) {
      return names.get(thing);
    }
    if (isPrimitive(thing)) {
      return stringifyPrimitive(thing);
    }
    const type = getType(thing);
    switch (type) {
      case "Number":
      case "String":
      case "Boolean":
        return `Object(${stringify(thing.valueOf())})`;
      case "RegExp":
        return thing.toString();
      case "Date":
        return `new Date(${thing.getTime()})`;
      case "Array":
        const members = thing.map((v, i) => i in thing ? stringify(v) : "");
        const tail = thing.length === 0 || thing.length - 1 in thing ? "" : ",";
        return `[${members.join(",")}${tail}]`;
      case "Set":
      case "Map":
        return `new ${type}([${Array.from(thing).map(stringify).join(",")}])`;
      default:
        if (thing.toJSON) {
          let json = thing.toJSON();
          if (getType(json) === "String") {
            try {
              json = JSON.parse(json);
            } catch (e) {
            }
          }
          return stringify(json);
        }
        if (Object.getPrototypeOf(thing) === null) {
          if (Object.keys(thing).length === 0) {
            return "Object.create(null)";
          }
          return `Object.create(null,{${Object.keys(thing).map((key) => `${safeKey(key)}:{writable:true,enumerable:true,value:${stringify(thing[key])}}`).join(",")}})`;
        }
        return `{${Object.keys(thing).map((key) => `${safeKey(key)}:${stringify(thing[key])}`).join(",")}}`;
    }
  }
  const str = stringify(value);
  if (names.size) {
    const params = [];
    const statements = [];
    const values = [];
    names.forEach((name, thing) => {
      params.push(name);
      if (isPrimitive(thing)) {
        values.push(stringifyPrimitive(thing));
        return;
      }
      const type = getType(thing);
      switch (type) {
        case "Number":
        case "String":
        case "Boolean":
          values.push(`Object(${stringify(thing.valueOf())})`);
          break;
        case "RegExp":
          values.push(thing.toString());
          break;
        case "Date":
          values.push(`new Date(${thing.getTime()})`);
          break;
        case "Array":
          values.push(`Array(${thing.length})`);
          thing.forEach((v, i) => {
            statements.push(`${name}[${i}]=${stringify(v)}`);
          });
          break;
        case "Set":
          values.push("new Set");
          statements.push(`${name}.${Array.from(thing).map((v) => `add(${stringify(v)})`).join(".")}`);
          break;
        case "Map":
          values.push("new Map");
          statements.push(`${name}.${Array.from(thing).map(([k, v]) => `set(${stringify(k)}, ${stringify(v)})`).join(".")}`);
          break;
        default:
          values.push(Object.getPrototypeOf(thing) === null ? "Object.create(null)" : "{}");
          Object.keys(thing).forEach((key) => {
            statements.push(`${name}${safeProp(key)}=${stringify(thing[key])}`);
          });
      }
    });
    statements.push(`return ${str}`);
    return `(function(${params.join(",")}){${statements.join(";")}}(${values.join(",")}))`;
  } else {
    return str;
  }
}
function getName(num) {
  let name = "";
  do {
    name = chars[num % chars.length] + name;
    num = ~~(num / chars.length) - 1;
  } while (num >= 0);
  return reserved.test(name) ? `${name}0` : name;
}
function isPrimitive(thing) {
  return Object(thing) !== thing;
}
function stringifyPrimitive(thing) {
  if (typeof thing === "string") {
    return stringifyString(thing);
  }
  if (thing === void 0) {
    return "void 0";
  }
  if (thing === 0 && 1 / thing < 0) {
    return "-0";
  }
  const str = String(thing);
  if (typeof thing === "number") {
    return str.replace(/^(-)?0\./, "$1.");
  }
  return str;
}
function getType(thing) {
  return Object.prototype.toString.call(thing).slice(8, -1);
}
function escapeUnsafeChar(c) {
  return escaped[c] || c;
}
function escapeUnsafeChars(str) {
  return str.replace(unsafeChars, escapeUnsafeChar);
}
function safeKey(key) {
  return /^[_$a-zA-Z][_$a-zA-Z0-9]*$/.test(key) ? key : escapeUnsafeChars(JSON.stringify(key));
}
function safeProp(key) {
  return /^[_$a-zA-Z][_$a-zA-Z0-9]*$/.test(key) ? `.${key}` : `[${escapeUnsafeChars(JSON.stringify(key))}]`;
}
function stringifyString(str) {
  let result = '"';
  for (let i = 0; i < str.length; i += 1) {
    const char = str.charAt(i);
    const code = char.charCodeAt(0);
    if (char === '"') {
      result += '\\"';
    } else if (char in escaped) {
      result += escaped[char];
    } else if (code >= 55296 && code <= 57343) {
      const next = str.charCodeAt(i + 1);
      if (code <= 56319 && (next >= 56320 && next <= 57343)) {
        result += char + str[++i];
      } else {
        result += `\\u${code.toString(16).toUpperCase()}`;
      }
    } else {
      result += char;
    }
  }
  result += '"';
  return result;
}

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : "undefined" !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

function getDefaultExportFromNamespaceIfNotNamed (n) {
	return n && Object.prototype.hasOwnProperty.call(n, 'default') && Object.keys(n).length === 1 ? n['default'] : n;
}

var serverRenderer = {exports: {}};

function commonjsRequire(path) {
	throw new Error('Could not dynamically require "' + path + '". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.');
}

var serverRenderer_cjs = {};

var vue_cjs_prod = {};

const require$$2 = /*@__PURE__*/getDefaultExportFromNamespaceIfNotNamed(proxy);

var runtimeDom = {exports: {}};

var runtimeDom_cjs = {};

var runtimeCore = {exports: {}};

var runtimeCore_cjs = {};

var reactivity = {exports: {}};

var reactivity_cjs = {};

var shared$2 = {exports: {}};

var shared_cjs = {};

Object.defineProperty(shared_cjs, '__esModule', { value: true });

/**
 * Make a map and return a function for checking if a key
 * is in that map.
 * IMPORTANT: all calls of this function must be prefixed with
 * \/\*#\_\_PURE\_\_\*\/
 * So that rollup can tree-shake them if necessary.
 */
function makeMap(str, expectsLowerCase) {
    const map = Object.create(null);
    const list = str.split(',');
    for (let i = 0; i < list.length; i++) {
        map[list[i]] = true;
    }
    return expectsLowerCase ? val => !!map[val.toLowerCase()] : val => !!map[val];
}

/**
 * dev only flag -> name mapping
 */
const PatchFlagNames = {
    [1 /* TEXT */]: `TEXT`,
    [2 /* CLASS */]: `CLASS`,
    [4 /* STYLE */]: `STYLE`,
    [8 /* PROPS */]: `PROPS`,
    [16 /* FULL_PROPS */]: `FULL_PROPS`,
    [32 /* HYDRATE_EVENTS */]: `HYDRATE_EVENTS`,
    [64 /* STABLE_FRAGMENT */]: `STABLE_FRAGMENT`,
    [128 /* KEYED_FRAGMENT */]: `KEYED_FRAGMENT`,
    [256 /* UNKEYED_FRAGMENT */]: `UNKEYED_FRAGMENT`,
    [512 /* NEED_PATCH */]: `NEED_PATCH`,
    [1024 /* DYNAMIC_SLOTS */]: `DYNAMIC_SLOTS`,
    [2048 /* DEV_ROOT_FRAGMENT */]: `DEV_ROOT_FRAGMENT`,
    [-1 /* HOISTED */]: `HOISTED`,
    [-2 /* BAIL */]: `BAIL`
};

/**
 * Dev only
 */
const slotFlagsText = {
    [1 /* STABLE */]: 'STABLE',
    [2 /* DYNAMIC */]: 'DYNAMIC',
    [3 /* FORWARDED */]: 'FORWARDED'
};

const GLOBALS_WHITE_LISTED = 'Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,' +
    'decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,' +
    'Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt';
const isGloballyWhitelisted = /*#__PURE__*/ makeMap(GLOBALS_WHITE_LISTED);

const range = 2;
function generateCodeFrame(source, start = 0, end = source.length) {
    // Split the content into individual lines but capture the newline sequence
    // that separated each line. This is important because the actual sequence is
    // needed to properly take into account the full line length for offset
    // comparison
    let lines = source.split(/(\r?\n)/);
    // Separate the lines and newline sequences into separate arrays for easier referencing
    const newlineSequences = lines.filter((_, idx) => idx % 2 === 1);
    lines = lines.filter((_, idx) => idx % 2 === 0);
    let count = 0;
    const res = [];
    for (let i = 0; i < lines.length; i++) {
        count +=
            lines[i].length +
                ((newlineSequences[i] && newlineSequences[i].length) || 0);
        if (count >= start) {
            for (let j = i - range; j <= i + range || end > count; j++) {
                if (j < 0 || j >= lines.length)
                    continue;
                const line = j + 1;
                res.push(`${line}${' '.repeat(Math.max(3 - String(line).length, 0))}|  ${lines[j]}`);
                const lineLength = lines[j].length;
                const newLineSeqLength = (newlineSequences[j] && newlineSequences[j].length) || 0;
                if (j === i) {
                    // push underline
                    const pad = start - (count - (lineLength + newLineSeqLength));
                    const length = Math.max(1, end > count ? lineLength - pad : end - start);
                    res.push(`   |  ` + ' '.repeat(pad) + '^'.repeat(length));
                }
                else if (j > i) {
                    if (end > count) {
                        const length = Math.max(Math.min(end - count, lineLength), 1);
                        res.push(`   |  ` + '^'.repeat(length));
                    }
                    count += lineLength + newLineSeqLength;
                }
            }
            break;
        }
    }
    return res.join('\n');
}

/**
 * On the client we only need to offer special cases for boolean attributes that
 * have different names from their corresponding dom properties:
 * - itemscope -> N/A
 * - allowfullscreen -> allowFullscreen
 * - formnovalidate -> formNoValidate
 * - ismap -> isMap
 * - nomodule -> noModule
 * - novalidate -> noValidate
 * - readonly -> readOnly
 */
const specialBooleanAttrs = `itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly`;
const isSpecialBooleanAttr = /*#__PURE__*/ makeMap(specialBooleanAttrs);
/**
 * The full list is needed during SSR to produce the correct initial markup.
 */
const isBooleanAttr = /*#__PURE__*/ makeMap(specialBooleanAttrs +
    `,async,autofocus,autoplay,controls,default,defer,disabled,hidden,` +
    `loop,open,required,reversed,scoped,seamless,` +
    `checked,muted,multiple,selected`);
/**
 * Boolean attributes should be included if the value is truthy or ''.
 * e.g. `<select multiple>` compiles to `{ multiple: '' }`
 */
function includeBooleanAttr(value) {
    return !!value || value === '';
}
const unsafeAttrCharRE = /[>/="'\u0009\u000a\u000c\u0020]/;
const attrValidationCache = {};
function isSSRSafeAttrName(name) {
    if (attrValidationCache.hasOwnProperty(name)) {
        return attrValidationCache[name];
    }
    const isUnsafe = unsafeAttrCharRE.test(name);
    if (isUnsafe) {
        console.error(`unsafe attribute name: ${name}`);
    }
    return (attrValidationCache[name] = !isUnsafe);
}
const propsToAttrMap = {
    acceptCharset: 'accept-charset',
    className: 'class',
    htmlFor: 'for',
    httpEquiv: 'http-equiv'
};
/**
 * CSS properties that accept plain numbers
 */
const isNoUnitNumericStyleProp = /*#__PURE__*/ makeMap(`animation-iteration-count,border-image-outset,border-image-slice,` +
    `border-image-width,box-flex,box-flex-group,box-ordinal-group,column-count,` +
    `columns,flex,flex-grow,flex-positive,flex-shrink,flex-negative,flex-order,` +
    `grid-row,grid-row-end,grid-row-span,grid-row-start,grid-column,` +
    `grid-column-end,grid-column-span,grid-column-start,font-weight,line-clamp,` +
    `line-height,opacity,order,orphans,tab-size,widows,z-index,zoom,` +
    // SVG
    `fill-opacity,flood-opacity,stop-opacity,stroke-dasharray,stroke-dashoffset,` +
    `stroke-miterlimit,stroke-opacity,stroke-width`);
/**
 * Known attributes, this is used for stringification of runtime static nodes
 * so that we don't stringify bindings that cannot be set from HTML.
 * Don't also forget to allow `data-*` and `aria-*`!
 * Generated from https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes
 */
const isKnownHtmlAttr = /*#__PURE__*/ makeMap(`accept,accept-charset,accesskey,action,align,allow,alt,async,` +
    `autocapitalize,autocomplete,autofocus,autoplay,background,bgcolor,` +
    `border,buffered,capture,challenge,charset,checked,cite,class,code,` +
    `codebase,color,cols,colspan,content,contenteditable,contextmenu,controls,` +
    `coords,crossorigin,csp,data,datetime,decoding,default,defer,dir,dirname,` +
    `disabled,download,draggable,dropzone,enctype,enterkeyhint,for,form,` +
    `formaction,formenctype,formmethod,formnovalidate,formtarget,headers,` +
    `height,hidden,high,href,hreflang,http-equiv,icon,id,importance,integrity,` +
    `ismap,itemprop,keytype,kind,label,lang,language,loading,list,loop,low,` +
    `manifest,max,maxlength,minlength,media,min,multiple,muted,name,novalidate,` +
    `open,optimum,pattern,ping,placeholder,poster,preload,radiogroup,readonly,` +
    `referrerpolicy,rel,required,reversed,rows,rowspan,sandbox,scope,scoped,` +
    `selected,shape,size,sizes,slot,span,spellcheck,src,srcdoc,srclang,srcset,` +
    `start,step,style,summary,tabindex,target,title,translate,type,usemap,` +
    `value,width,wrap`);
/**
 * Generated from https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute
 */
const isKnownSvgAttr = /*#__PURE__*/ makeMap(`xmlns,accent-height,accumulate,additive,alignment-baseline,alphabetic,amplitude,` +
    `arabic-form,ascent,attributeName,attributeType,azimuth,baseFrequency,` +
    `baseline-shift,baseProfile,bbox,begin,bias,by,calcMode,cap-height,class,` +
    `clip,clipPathUnits,clip-path,clip-rule,color,color-interpolation,` +
    `color-interpolation-filters,color-profile,color-rendering,` +
    `contentScriptType,contentStyleType,crossorigin,cursor,cx,cy,d,decelerate,` +
    `descent,diffuseConstant,direction,display,divisor,dominant-baseline,dur,dx,` +
    `dy,edgeMode,elevation,enable-background,end,exponent,fill,fill-opacity,` +
    `fill-rule,filter,filterRes,filterUnits,flood-color,flood-opacity,` +
    `font-family,font-size,font-size-adjust,font-stretch,font-style,` +
    `font-variant,font-weight,format,from,fr,fx,fy,g1,g2,glyph-name,` +
    `glyph-orientation-horizontal,glyph-orientation-vertical,glyphRef,` +
    `gradientTransform,gradientUnits,hanging,height,href,hreflang,horiz-adv-x,` +
    `horiz-origin-x,id,ideographic,image-rendering,in,in2,intercept,k,k1,k2,k3,` +
    `k4,kernelMatrix,kernelUnitLength,kerning,keyPoints,keySplines,keyTimes,` +
    `lang,lengthAdjust,letter-spacing,lighting-color,limitingConeAngle,local,` +
    `marker-end,marker-mid,marker-start,markerHeight,markerUnits,markerWidth,` +
    `mask,maskContentUnits,maskUnits,mathematical,max,media,method,min,mode,` +
    `name,numOctaves,offset,opacity,operator,order,orient,orientation,origin,` +
    `overflow,overline-position,overline-thickness,panose-1,paint-order,path,` +
    `pathLength,patternContentUnits,patternTransform,patternUnits,ping,` +
    `pointer-events,points,pointsAtX,pointsAtY,pointsAtZ,preserveAlpha,` +
    `preserveAspectRatio,primitiveUnits,r,radius,referrerPolicy,refX,refY,rel,` +
    `rendering-intent,repeatCount,repeatDur,requiredExtensions,requiredFeatures,` +
    `restart,result,rotate,rx,ry,scale,seed,shape-rendering,slope,spacing,` +
    `specularConstant,specularExponent,speed,spreadMethod,startOffset,` +
    `stdDeviation,stemh,stemv,stitchTiles,stop-color,stop-opacity,` +
    `strikethrough-position,strikethrough-thickness,string,stroke,` +
    `stroke-dasharray,stroke-dashoffset,stroke-linecap,stroke-linejoin,` +
    `stroke-miterlimit,stroke-opacity,stroke-width,style,surfaceScale,` +
    `systemLanguage,tabindex,tableValues,target,targetX,targetY,text-anchor,` +
    `text-decoration,text-rendering,textLength,to,transform,transform-origin,` +
    `type,u1,u2,underline-position,underline-thickness,unicode,unicode-bidi,` +
    `unicode-range,units-per-em,v-alphabetic,v-hanging,v-ideographic,` +
    `v-mathematical,values,vector-effect,version,vert-adv-y,vert-origin-x,` +
    `vert-origin-y,viewBox,viewTarget,visibility,width,widths,word-spacing,` +
    `writing-mode,x,x-height,x1,x2,xChannelSelector,xlink:actuate,xlink:arcrole,` +
    `xlink:href,xlink:role,xlink:show,xlink:title,xlink:type,xml:base,xml:lang,` +
    `xml:space,y,y1,y2,yChannelSelector,z,zoomAndPan`);

function normalizeStyle(value) {
    if (isArray(value)) {
        const res = {};
        for (let i = 0; i < value.length; i++) {
            const item = value[i];
            const normalized = isString(item)
                ? parseStringStyle(item)
                : normalizeStyle(item);
            if (normalized) {
                for (const key in normalized) {
                    res[key] = normalized[key];
                }
            }
        }
        return res;
    }
    else if (isString(value)) {
        return value;
    }
    else if (isObject(value)) {
        return value;
    }
}
const listDelimiterRE = /;(?![^(]*\))/g;
const propertyDelimiterRE = /:(.+)/;
function parseStringStyle(cssText) {
    const ret = {};
    cssText.split(listDelimiterRE).forEach(item => {
        if (item) {
            const tmp = item.split(propertyDelimiterRE);
            tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim());
        }
    });
    return ret;
}
function stringifyStyle(styles) {
    let ret = '';
    if (!styles || isString(styles)) {
        return ret;
    }
    for (const key in styles) {
        const value = styles[key];
        const normalizedKey = key.startsWith(`--`) ? key : hyphenate(key);
        if (isString(value) ||
            (typeof value === 'number' && isNoUnitNumericStyleProp(normalizedKey))) {
            // only render valid values
            ret += `${normalizedKey}:${value};`;
        }
    }
    return ret;
}
function normalizeClass(value) {
    let res = '';
    if (isString(value)) {
        res = value;
    }
    else if (isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            const normalized = normalizeClass(value[i]);
            if (normalized) {
                res += normalized + ' ';
            }
        }
    }
    else if (isObject(value)) {
        for (const name in value) {
            if (value[name]) {
                res += name + ' ';
            }
        }
    }
    return res.trim();
}
function normalizeProps(props) {
    if (!props)
        return null;
    let { class: klass, style } = props;
    if (klass && !isString(klass)) {
        props.class = normalizeClass(klass);
    }
    if (style) {
        props.style = normalizeStyle(style);
    }
    return props;
}

// These tag configs are shared between compiler-dom and runtime-dom, so they
// https://developer.mozilla.org/en-US/docs/Web/HTML/Element
const HTML_TAGS = 'html,body,base,head,link,meta,style,title,address,article,aside,footer,' +
    'header,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,' +
    'figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,' +
    'data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,' +
    'time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,' +
    'canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,' +
    'th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,' +
    'option,output,progress,select,textarea,details,dialog,menu,' +
    'summary,template,blockquote,iframe,tfoot';
// https://developer.mozilla.org/en-US/docs/Web/SVG/Element
const SVG_TAGS = 'svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,' +
    'defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,' +
    'feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,' +
    'feDistanceLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,' +
    'feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,' +
    'fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,' +
    'foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,' +
    'mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,' +
    'polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,' +
    'text,textPath,title,tspan,unknown,use,view';
const VOID_TAGS = 'area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr';
/**
 * Compiler only.
 * Do NOT use in runtime code paths unless behind `true` flag.
 */
const isHTMLTag = /*#__PURE__*/ makeMap(HTML_TAGS);
/**
 * Compiler only.
 * Do NOT use in runtime code paths unless behind `true` flag.
 */
const isSVGTag = /*#__PURE__*/ makeMap(SVG_TAGS);
/**
 * Compiler only.
 * Do NOT use in runtime code paths unless behind `true` flag.
 */
const isVoidTag = /*#__PURE__*/ makeMap(VOID_TAGS);

const escapeRE = /["'&<>]/;
function escapeHtml(string) {
    const str = '' + string;
    const match = escapeRE.exec(str);
    if (!match) {
        return str;
    }
    let html = '';
    let escaped;
    let index;
    let lastIndex = 0;
    for (index = match.index; index < str.length; index++) {
        switch (str.charCodeAt(index)) {
            case 34: // "
                escaped = '&quot;';
                break;
            case 38: // &
                escaped = '&amp;';
                break;
            case 39: // '
                escaped = '&#39;';
                break;
            case 60: // <
                escaped = '&lt;';
                break;
            case 62: // >
                escaped = '&gt;';
                break;
            default:
                continue;
        }
        if (lastIndex !== index) {
            html += str.slice(lastIndex, index);
        }
        lastIndex = index + 1;
        html += escaped;
    }
    return lastIndex !== index ? html + str.slice(lastIndex, index) : html;
}
// https://www.w3.org/TR/html52/syntax.html#comments
const commentStripRE = /^-?>|<!--|-->|--!>|<!-$/g;
function escapeHtmlComment(src) {
    return src.replace(commentStripRE, '');
}

function looseCompareArrays(a, b) {
    if (a.length !== b.length)
        return false;
    let equal = true;
    for (let i = 0; equal && i < a.length; i++) {
        equal = looseEqual(a[i], b[i]);
    }
    return equal;
}
function looseEqual(a, b) {
    if (a === b)
        return true;
    let aValidType = isDate(a);
    let bValidType = isDate(b);
    if (aValidType || bValidType) {
        return aValidType && bValidType ? a.getTime() === b.getTime() : false;
    }
    aValidType = isSymbol(a);
    bValidType = isSymbol(b);
    if (aValidType || bValidType) {
        return a === b;
    }
    aValidType = isArray(a);
    bValidType = isArray(b);
    if (aValidType || bValidType) {
        return aValidType && bValidType ? looseCompareArrays(a, b) : false;
    }
    aValidType = isObject(a);
    bValidType = isObject(b);
    if (aValidType || bValidType) {
        /* istanbul ignore if: this if will probably never be called */
        if (!aValidType || !bValidType) {
            return false;
        }
        const aKeysCount = Object.keys(a).length;
        const bKeysCount = Object.keys(b).length;
        if (aKeysCount !== bKeysCount) {
            return false;
        }
        for (const key in a) {
            const aHasKey = a.hasOwnProperty(key);
            const bHasKey = b.hasOwnProperty(key);
            if ((aHasKey && !bHasKey) ||
                (!aHasKey && bHasKey) ||
                !looseEqual(a[key], b[key])) {
                return false;
            }
        }
    }
    return String(a) === String(b);
}
function looseIndexOf(arr, val) {
    return arr.findIndex(item => looseEqual(item, val));
}

/**
 * For converting {{ interpolation }} values to displayed strings.
 * @private
 */
const toDisplayString = (val) => {
    return isString(val)
        ? val
        : val == null
            ? ''
            : isArray(val) ||
                (isObject(val) &&
                    (val.toString === objectToString || !isFunction(val.toString)))
                ? JSON.stringify(val, replacer, 2)
                : String(val);
};
const replacer = (_key, val) => {
    // can't use isRef here since @vue/shared has no deps
    if (val && val.__v_isRef) {
        return replacer(_key, val.value);
    }
    else if (isMap(val)) {
        return {
            [`Map(${val.size})`]: [...val.entries()].reduce((entries, [key, val]) => {
                entries[`${key} =>`] = val;
                return entries;
            }, {})
        };
    }
    else if (isSet(val)) {
        return {
            [`Set(${val.size})`]: [...val.values()]
        };
    }
    else if (isObject(val) && !isArray(val) && !isPlainObject(val)) {
        return String(val);
    }
    return val;
};

const EMPTY_OBJ = Object.freeze({})
    ;
const EMPTY_ARR = Object.freeze([]) ;
const NOOP = () => { };
/**
 * Always return false.
 */
const NO = () => false;
const onRE = /^on[^a-z]/;
const isOn = (key) => onRE.test(key);
const isModelListener = (key) => key.startsWith('onUpdate:');
const extend = Object.assign;
const remove = (arr, el) => {
    const i = arr.indexOf(el);
    if (i > -1) {
        arr.splice(i, 1);
    }
};
const hasOwnProperty = Object.prototype.hasOwnProperty;
const hasOwn = (val, key) => hasOwnProperty.call(val, key);
const isArray = Array.isArray;
const isMap = (val) => toTypeString(val) === '[object Map]';
const isSet = (val) => toTypeString(val) === '[object Set]';
const isDate = (val) => toTypeString(val) === '[object Date]';
const isFunction = (val) => typeof val === 'function';
const isString = (val) => typeof val === 'string';
const isSymbol = (val) => typeof val === 'symbol';
const isObject = (val) => val !== null && typeof val === 'object';
const isPromise = (val) => {
    return isObject(val) && isFunction(val.then) && isFunction(val.catch);
};
const objectToString = Object.prototype.toString;
const toTypeString = (value) => objectToString.call(value);
const toRawType = (value) => {
    // extract "RawType" from strings like "[object RawType]"
    return toTypeString(value).slice(8, -1);
};
const isPlainObject = (val) => toTypeString(val) === '[object Object]';
const isIntegerKey = (key) => isString(key) &&
    key !== 'NaN' &&
    key[0] !== '-' &&
    '' + parseInt(key, 10) === key;
const isReservedProp = /*#__PURE__*/ makeMap(
// the leading comma is intentional so empty string "" is also included
',key,ref,ref_for,ref_key,' +
    'onVnodeBeforeMount,onVnodeMounted,' +
    'onVnodeBeforeUpdate,onVnodeUpdated,' +
    'onVnodeBeforeUnmount,onVnodeUnmounted');
const isBuiltInDirective = /*#__PURE__*/ makeMap('bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo');
const cacheStringFunction = (fn) => {
    const cache = Object.create(null);
    return ((str) => {
        const hit = cache[str];
        return hit || (cache[str] = fn(str));
    });
};
const camelizeRE = /-(\w)/g;
/**
 * @private
 */
const camelize = cacheStringFunction((str) => {
    return str.replace(camelizeRE, (_, c) => (c ? c.toUpperCase() : ''));
});
const hyphenateRE = /\B([A-Z])/g;
/**
 * @private
 */
const hyphenate = cacheStringFunction((str) => str.replace(hyphenateRE, '-$1').toLowerCase());
/**
 * @private
 */
const capitalize = cacheStringFunction((str) => str.charAt(0).toUpperCase() + str.slice(1));
/**
 * @private
 */
const toHandlerKey = cacheStringFunction((str) => str ? `on${capitalize(str)}` : ``);
// compare whether a value has changed, accounting for NaN.
const hasChanged = (value, oldValue) => !Object.is(value, oldValue);
const invokeArrayFns = (fns, arg) => {
    for (let i = 0; i < fns.length; i++) {
        fns[i](arg);
    }
};
const def = (obj, key, value) => {
    Object.defineProperty(obj, key, {
        configurable: true,
        enumerable: false,
        value
    });
};
const toNumber = (val) => {
    const n = parseFloat(val);
    return isNaN(n) ? val : n;
};
let _globalThis;
const getGlobalThis = () => {
    return (_globalThis ||
        (_globalThis =
            typeof globalThis !== 'undefined'
                ? globalThis
                : typeof self !== 'undefined'
                    ? self
                    : typeof commonjsGlobal !== 'undefined'
                            ? commonjsGlobal
                            : {}));
};
const identRE = /^[_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*$/;
function genPropsAccessExp(name) {
    return identRE.test(name)
        ? `__props.${name}`
        : `__props[${JSON.stringify(name)}]`;
}

shared_cjs.EMPTY_ARR = EMPTY_ARR;
shared_cjs.EMPTY_OBJ = EMPTY_OBJ;
shared_cjs.NO = NO;
shared_cjs.NOOP = NOOP;
shared_cjs.PatchFlagNames = PatchFlagNames;
shared_cjs.camelize = camelize;
shared_cjs.capitalize = capitalize;
shared_cjs.def = def;
shared_cjs.escapeHtml = escapeHtml;
shared_cjs.escapeHtmlComment = escapeHtmlComment;
shared_cjs.extend = extend;
shared_cjs.genPropsAccessExp = genPropsAccessExp;
shared_cjs.generateCodeFrame = generateCodeFrame;
shared_cjs.getGlobalThis = getGlobalThis;
shared_cjs.hasChanged = hasChanged;
shared_cjs.hasOwn = hasOwn;
shared_cjs.hyphenate = hyphenate;
shared_cjs.includeBooleanAttr = includeBooleanAttr;
shared_cjs.invokeArrayFns = invokeArrayFns;
shared_cjs.isArray = isArray;
shared_cjs.isBooleanAttr = isBooleanAttr;
shared_cjs.isBuiltInDirective = isBuiltInDirective;
shared_cjs.isDate = isDate;
shared_cjs.isFunction = isFunction;
shared_cjs.isGloballyWhitelisted = isGloballyWhitelisted;
shared_cjs.isHTMLTag = isHTMLTag;
shared_cjs.isIntegerKey = isIntegerKey;
shared_cjs.isKnownHtmlAttr = isKnownHtmlAttr;
shared_cjs.isKnownSvgAttr = isKnownSvgAttr;
shared_cjs.isMap = isMap;
shared_cjs.isModelListener = isModelListener;
shared_cjs.isNoUnitNumericStyleProp = isNoUnitNumericStyleProp;
shared_cjs.isObject = isObject;
shared_cjs.isOn = isOn;
shared_cjs.isPlainObject = isPlainObject;
shared_cjs.isPromise = isPromise;
shared_cjs.isReservedProp = isReservedProp;
shared_cjs.isSSRSafeAttrName = isSSRSafeAttrName;
shared_cjs.isSVGTag = isSVGTag;
shared_cjs.isSet = isSet;
shared_cjs.isSpecialBooleanAttr = isSpecialBooleanAttr;
shared_cjs.isString = isString;
shared_cjs.isSymbol = isSymbol;
shared_cjs.isVoidTag = isVoidTag;
shared_cjs.looseEqual = looseEqual;
shared_cjs.looseIndexOf = looseIndexOf;
shared_cjs.makeMap = makeMap;
shared_cjs.normalizeClass = normalizeClass;
shared_cjs.normalizeProps = normalizeProps;
shared_cjs.normalizeStyle = normalizeStyle;
shared_cjs.objectToString = objectToString;
shared_cjs.parseStringStyle = parseStringStyle;
shared_cjs.propsToAttrMap = propsToAttrMap;
shared_cjs.remove = remove;
shared_cjs.slotFlagsText = slotFlagsText;
shared_cjs.stringifyStyle = stringifyStyle;
shared_cjs.toDisplayString = toDisplayString;
shared_cjs.toHandlerKey = toHandlerKey;
shared_cjs.toNumber = toNumber;
shared_cjs.toRawType = toRawType;
shared_cjs.toTypeString = toTypeString;

(function (module) {

	{
	  module.exports = shared_cjs;
	}
} (shared$2));

Object.defineProperty(reactivity_cjs, '__esModule', { value: true });

var shared$1 = shared$2.exports;

function warn$1(msg, ...args) {
    console.warn(`[Vue warn] ${msg}`, ...args);
}

let activeEffectScope;
class EffectScope {
    constructor(detached = false) {
        /**
         * @internal
         */
        this.active = true;
        /**
         * @internal
         */
        this.effects = [];
        /**
         * @internal
         */
        this.cleanups = [];
        if (!detached && activeEffectScope) {
            this.parent = activeEffectScope;
            this.index =
                (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(this) - 1;
        }
    }
    run(fn) {
        if (this.active) {
            const currentEffectScope = activeEffectScope;
            try {
                activeEffectScope = this;
                return fn();
            }
            finally {
                activeEffectScope = currentEffectScope;
            }
        }
        else {
            warn$1(`cannot run an inactive effect scope.`);
        }
    }
    /**
     * This should only be called on non-detached scopes
     * @internal
     */
    on() {
        activeEffectScope = this;
    }
    /**
     * This should only be called on non-detached scopes
     * @internal
     */
    off() {
        activeEffectScope = this.parent;
    }
    stop(fromParent) {
        if (this.active) {
            let i, l;
            for (i = 0, l = this.effects.length; i < l; i++) {
                this.effects[i].stop();
            }
            for (i = 0, l = this.cleanups.length; i < l; i++) {
                this.cleanups[i]();
            }
            if (this.scopes) {
                for (i = 0, l = this.scopes.length; i < l; i++) {
                    this.scopes[i].stop(true);
                }
            }
            // nested scope, dereference from parent to avoid memory leaks
            if (this.parent && !fromParent) {
                // optimized O(1) removal
                const last = this.parent.scopes.pop();
                if (last && last !== this) {
                    this.parent.scopes[this.index] = last;
                    last.index = this.index;
                }
            }
            this.active = false;
        }
    }
}
function effectScope(detached) {
    return new EffectScope(detached);
}
function recordEffectScope(effect, scope = activeEffectScope) {
    if (scope && scope.active) {
        scope.effects.push(effect);
    }
}
function getCurrentScope() {
    return activeEffectScope;
}
function onScopeDispose(fn) {
    if (activeEffectScope) {
        activeEffectScope.cleanups.push(fn);
    }
    else {
        warn$1(`onScopeDispose() is called when there is no active effect scope` +
            ` to be associated with.`);
    }
}

const createDep = (effects) => {
    const dep = new Set(effects);
    dep.w = 0;
    dep.n = 0;
    return dep;
};
const wasTracked = (dep) => (dep.w & trackOpBit) > 0;
const newTracked = (dep) => (dep.n & trackOpBit) > 0;
const initDepMarkers = ({ deps }) => {
    if (deps.length) {
        for (let i = 0; i < deps.length; i++) {
            deps[i].w |= trackOpBit; // set was tracked
        }
    }
};
const finalizeDepMarkers = (effect) => {
    const { deps } = effect;
    if (deps.length) {
        let ptr = 0;
        for (let i = 0; i < deps.length; i++) {
            const dep = deps[i];
            if (wasTracked(dep) && !newTracked(dep)) {
                dep.delete(effect);
            }
            else {
                deps[ptr++] = dep;
            }
            // clear bits
            dep.w &= ~trackOpBit;
            dep.n &= ~trackOpBit;
        }
        deps.length = ptr;
    }
};

const targetMap = new WeakMap();
// The number of effects currently being tracked recursively.
let effectTrackDepth = 0;
let trackOpBit = 1;
/**
 * The bitwise track markers support at most 30 levels of recursion.
 * This value is chosen to enable modern JS engines to use a SMI on all platforms.
 * When recursion depth is greater, fall back to using a full cleanup.
 */
const maxMarkerBits = 30;
let activeEffect;
const ITERATE_KEY = Symbol('iterate' );
const MAP_KEY_ITERATE_KEY = Symbol('Map key iterate' );
class ReactiveEffect {
    constructor(fn, scheduler = null, scope) {
        this.fn = fn;
        this.scheduler = scheduler;
        this.active = true;
        this.deps = [];
        this.parent = undefined;
        recordEffectScope(this, scope);
    }
    run() {
        if (!this.active) {
            return this.fn();
        }
        let parent = activeEffect;
        let lastShouldTrack = shouldTrack;
        while (parent) {
            if (parent === this) {
                return;
            }
            parent = parent.parent;
        }
        try {
            this.parent = activeEffect;
            activeEffect = this;
            shouldTrack = true;
            trackOpBit = 1 << ++effectTrackDepth;
            if (effectTrackDepth <= maxMarkerBits) {
                initDepMarkers(this);
            }
            else {
                cleanupEffect(this);
            }
            return this.fn();
        }
        finally {
            if (effectTrackDepth <= maxMarkerBits) {
                finalizeDepMarkers(this);
            }
            trackOpBit = 1 << --effectTrackDepth;
            activeEffect = this.parent;
            shouldTrack = lastShouldTrack;
            this.parent = undefined;
            if (this.deferStop) {
                this.stop();
            }
        }
    }
    stop() {
        // stopped while running itself - defer the cleanup
        if (activeEffect === this) {
            this.deferStop = true;
        }
        else if (this.active) {
            cleanupEffect(this);
            if (this.onStop) {
                this.onStop();
            }
            this.active = false;
        }
    }
}
function cleanupEffect(effect) {
    const { deps } = effect;
    if (deps.length) {
        for (let i = 0; i < deps.length; i++) {
            deps[i].delete(effect);
        }
        deps.length = 0;
    }
}
function effect(fn, options) {
    if (fn.effect) {
        fn = fn.effect.fn;
    }
    const _effect = new ReactiveEffect(fn);
    if (options) {
        shared$1.extend(_effect, options);
        if (options.scope)
            recordEffectScope(_effect, options.scope);
    }
    if (!options || !options.lazy) {
        _effect.run();
    }
    const runner = _effect.run.bind(_effect);
    runner.effect = _effect;
    return runner;
}
function stop(runner) {
    runner.effect.stop();
}
let shouldTrack = true;
const trackStack = [];
function pauseTracking() {
    trackStack.push(shouldTrack);
    shouldTrack = false;
}
function enableTracking() {
    trackStack.push(shouldTrack);
    shouldTrack = true;
}
function resetTracking() {
    const last = trackStack.pop();
    shouldTrack = last === undefined ? true : last;
}
function track(target, type, key) {
    if (shouldTrack && activeEffect) {
        let depsMap = targetMap.get(target);
        if (!depsMap) {
            targetMap.set(target, (depsMap = new Map()));
        }
        let dep = depsMap.get(key);
        if (!dep) {
            depsMap.set(key, (dep = createDep()));
        }
        const eventInfo = { effect: activeEffect, target, type, key }
            ;
        trackEffects(dep, eventInfo);
    }
}
function trackEffects(dep, debuggerEventExtraInfo) {
    let shouldTrack = false;
    if (effectTrackDepth <= maxMarkerBits) {
        if (!newTracked(dep)) {
            dep.n |= trackOpBit; // set newly tracked
            shouldTrack = !wasTracked(dep);
        }
    }
    else {
        // Full cleanup mode.
        shouldTrack = !dep.has(activeEffect);
    }
    if (shouldTrack) {
        dep.add(activeEffect);
        activeEffect.deps.push(dep);
        if (activeEffect.onTrack) {
            activeEffect.onTrack({
                effect: activeEffect,
                ...debuggerEventExtraInfo
            });
        }
    }
}
function trigger(target, type, key, newValue, oldValue, oldTarget) {
    const depsMap = targetMap.get(target);
    if (!depsMap) {
        // never been tracked
        return;
    }
    let deps = [];
    if (type === "clear" /* CLEAR */) {
        // collection being cleared
        // trigger all effects for target
        deps = [...depsMap.values()];
    }
    else if (key === 'length' && shared$1.isArray(target)) {
        depsMap.forEach((dep, key) => {
            if (key === 'length' || key >= newValue) {
                deps.push(dep);
            }
        });
    }
    else {
        // schedule runs for SET | ADD | DELETE
        if (key !== void 0) {
            deps.push(depsMap.get(key));
        }
        // also run for iteration key on ADD | DELETE | Map.SET
        switch (type) {
            case "add" /* ADD */:
                if (!shared$1.isArray(target)) {
                    deps.push(depsMap.get(ITERATE_KEY));
                    if (shared$1.isMap(target)) {
                        deps.push(depsMap.get(MAP_KEY_ITERATE_KEY));
                    }
                }
                else if (shared$1.isIntegerKey(key)) {
                    // new index added to array -> length changes
                    deps.push(depsMap.get('length'));
                }
                break;
            case "delete" /* DELETE */:
                if (!shared$1.isArray(target)) {
                    deps.push(depsMap.get(ITERATE_KEY));
                    if (shared$1.isMap(target)) {
                        deps.push(depsMap.get(MAP_KEY_ITERATE_KEY));
                    }
                }
                break;
            case "set" /* SET */:
                if (shared$1.isMap(target)) {
                    deps.push(depsMap.get(ITERATE_KEY));
                }
                break;
        }
    }
    const eventInfo = { target, type, key, newValue, oldValue, oldTarget }
        ;
    if (deps.length === 1) {
        if (deps[0]) {
            {
                triggerEffects(deps[0], eventInfo);
            }
        }
    }
    else {
        const effects = [];
        for (const dep of deps) {
            if (dep) {
                effects.push(...dep);
            }
        }
        {
            triggerEffects(createDep(effects), eventInfo);
        }
    }
}
function triggerEffects(dep, debuggerEventExtraInfo) {
    // spread into array for stabilization
    const effects = shared$1.isArray(dep) ? dep : [...dep];
    for (const effect of effects) {
        if (effect.computed) {
            triggerEffect(effect, debuggerEventExtraInfo);
        }
    }
    for (const effect of effects) {
        if (!effect.computed) {
            triggerEffect(effect, debuggerEventExtraInfo);
        }
    }
}
function triggerEffect(effect, debuggerEventExtraInfo) {
    if (effect !== activeEffect || effect.allowRecurse) {
        if (effect.onTrigger) {
            effect.onTrigger(shared$1.extend({ effect }, debuggerEventExtraInfo));
        }
        if (effect.scheduler) {
            effect.scheduler();
        }
        else {
            effect.run();
        }
    }
}

const isNonTrackableKeys = /*#__PURE__*/ shared$1.makeMap(`__proto__,__v_isRef,__isVue`);
const builtInSymbols = new Set(
/*#__PURE__*/
Object.getOwnPropertyNames(Symbol)
    // ios10.x Object.getOwnPropertyNames(Symbol) can enumerate 'arguments' and 'caller'
    // but accessing them on Symbol leads to TypeError because Symbol is a strict mode
    // function
    .filter(key => key !== 'arguments' && key !== 'caller')
    .map(key => Symbol[key])
    .filter(shared$1.isSymbol));
const get = /*#__PURE__*/ createGetter();
const shallowGet = /*#__PURE__*/ createGetter(false, true);
const readonlyGet = /*#__PURE__*/ createGetter(true);
const shallowReadonlyGet = /*#__PURE__*/ createGetter(true, true);
const arrayInstrumentations = /*#__PURE__*/ createArrayInstrumentations();
function createArrayInstrumentations() {
    const instrumentations = {};
    ['includes', 'indexOf', 'lastIndexOf'].forEach(key => {
        instrumentations[key] = function (...args) {
            const arr = toRaw$1(this);
            for (let i = 0, l = this.length; i < l; i++) {
                track(arr, "get" /* GET */, i + '');
            }
            // we run the method using the original args first (which may be reactive)
            const res = arr[key](...args);
            if (res === -1 || res === false) {
                // if that didn't work, run it again using raw values.
                return arr[key](...args.map(toRaw$1));
            }
            else {
                return res;
            }
        };
    });
    ['push', 'pop', 'shift', 'unshift', 'splice'].forEach(key => {
        instrumentations[key] = function (...args) {
            pauseTracking();
            const res = toRaw$1(this)[key].apply(this, args);
            resetTracking();
            return res;
        };
    });
    return instrumentations;
}
function createGetter(isReadonly = false, shallow = false) {
    return function get(target, key, receiver) {
        if (key === "__v_isReactive" /* IS_REACTIVE */) {
            return !isReadonly;
        }
        else if (key === "__v_isReadonly" /* IS_READONLY */) {
            return isReadonly;
        }
        else if (key === "__v_isShallow" /* IS_SHALLOW */) {
            return shallow;
        }
        else if (key === "__v_raw" /* RAW */ &&
            receiver ===
                (isReadonly
                    ? shallow
                        ? shallowReadonlyMap
                        : readonlyMap
                    : shallow
                        ? shallowReactiveMap
                        : reactiveMap).get(target)) {
            return target;
        }
        const targetIsArray = shared$1.isArray(target);
        if (!isReadonly && targetIsArray && shared$1.hasOwn(arrayInstrumentations, key)) {
            return Reflect.get(arrayInstrumentations, key, receiver);
        }
        const res = Reflect.get(target, key, receiver);
        if (shared$1.isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
            return res;
        }
        if (!isReadonly) {
            track(target, "get" /* GET */, key);
        }
        if (shallow) {
            return res;
        }
        if (isRef$1(res)) {
            // ref unwrapping - skip unwrap for Array + integer key.
            return targetIsArray && shared$1.isIntegerKey(key) ? res : res.value;
        }
        if (shared$1.isObject(res)) {
            // Convert returned value into a proxy as well. we do the isObject check
            // here to avoid invalid value warning. Also need to lazy access readonly
            // and reactive here to avoid circular dependency.
            return isReadonly ? readonly(res) : reactive(res);
        }
        return res;
    };
}
const set = /*#__PURE__*/ createSetter();
const shallowSet = /*#__PURE__*/ createSetter(true);
function createSetter(shallow = false) {
    return function set(target, key, value, receiver) {
        let oldValue = target[key];
        if (isReadonly(oldValue) && isRef$1(oldValue) && !isRef$1(value)) {
            return false;
        }
        if (!shallow && !isReadonly(value)) {
            if (!isShallow(value)) {
                value = toRaw$1(value);
                oldValue = toRaw$1(oldValue);
            }
            if (!shared$1.isArray(target) && isRef$1(oldValue) && !isRef$1(value)) {
                oldValue.value = value;
                return true;
            }
        }
        const hadKey = shared$1.isArray(target) && shared$1.isIntegerKey(key)
            ? Number(key) < target.length
            : shared$1.hasOwn(target, key);
        const result = Reflect.set(target, key, value, receiver);
        // don't trigger if target is something up in the prototype chain of original
        if (target === toRaw$1(receiver)) {
            if (!hadKey) {
                trigger(target, "add" /* ADD */, key, value);
            }
            else if (shared$1.hasChanged(value, oldValue)) {
                trigger(target, "set" /* SET */, key, value, oldValue);
            }
        }
        return result;
    };
}
function deleteProperty(target, key) {
    const hadKey = shared$1.hasOwn(target, key);
    const oldValue = target[key];
    const result = Reflect.deleteProperty(target, key);
    if (result && hadKey) {
        trigger(target, "delete" /* DELETE */, key, undefined, oldValue);
    }
    return result;
}
function has(target, key) {
    const result = Reflect.has(target, key);
    if (!shared$1.isSymbol(key) || !builtInSymbols.has(key)) {
        track(target, "has" /* HAS */, key);
    }
    return result;
}
function ownKeys(target) {
    track(target, "iterate" /* ITERATE */, shared$1.isArray(target) ? 'length' : ITERATE_KEY);
    return Reflect.ownKeys(target);
}
const mutableHandlers = {
    get,
    set,
    deleteProperty,
    has,
    ownKeys
};
const readonlyHandlers = {
    get: readonlyGet,
    set(target, key) {
        {
            warn$1(`Set operation on key "${String(key)}" failed: target is readonly.`, target);
        }
        return true;
    },
    deleteProperty(target, key) {
        {
            warn$1(`Delete operation on key "${String(key)}" failed: target is readonly.`, target);
        }
        return true;
    }
};
const shallowReactiveHandlers = /*#__PURE__*/ shared$1.extend({}, mutableHandlers, {
    get: shallowGet,
    set: shallowSet
});
// Props handlers are special in the sense that it should not unwrap top-level
// refs (in order to allow refs to be explicitly passed down), but should
// retain the reactivity of the normal readonly object.
const shallowReadonlyHandlers = /*#__PURE__*/ shared$1.extend({}, readonlyHandlers, {
    get: shallowReadonlyGet
});

const toShallow = (value) => value;
const getProto = (v) => Reflect.getPrototypeOf(v);
function get$1(target, key, isReadonly = false, isShallow = false) {
    // #1772: readonly(reactive(Map)) should return readonly + reactive version
    // of the value
    target = target["__v_raw" /* RAW */];
    const rawTarget = toRaw$1(target);
    const rawKey = toRaw$1(key);
    if (!isReadonly) {
        if (key !== rawKey) {
            track(rawTarget, "get" /* GET */, key);
        }
        track(rawTarget, "get" /* GET */, rawKey);
    }
    const { has } = getProto(rawTarget);
    const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive;
    if (has.call(rawTarget, key)) {
        return wrap(target.get(key));
    }
    else if (has.call(rawTarget, rawKey)) {
        return wrap(target.get(rawKey));
    }
    else if (target !== rawTarget) {
        // #3602 readonly(reactive(Map))
        // ensure that the nested reactive `Map` can do tracking for itself
        target.get(key);
    }
}
function has$1(key, isReadonly = false) {
    const target = this["__v_raw" /* RAW */];
    const rawTarget = toRaw$1(target);
    const rawKey = toRaw$1(key);
    if (!isReadonly) {
        if (key !== rawKey) {
            track(rawTarget, "has" /* HAS */, key);
        }
        track(rawTarget, "has" /* HAS */, rawKey);
    }
    return key === rawKey
        ? target.has(key)
        : target.has(key) || target.has(rawKey);
}
function size(target, isReadonly = false) {
    target = target["__v_raw" /* RAW */];
    !isReadonly && track(toRaw$1(target), "iterate" /* ITERATE */, ITERATE_KEY);
    return Reflect.get(target, 'size', target);
}
function add(value) {
    value = toRaw$1(value);
    const target = toRaw$1(this);
    const proto = getProto(target);
    const hadKey = proto.has.call(target, value);
    if (!hadKey) {
        target.add(value);
        trigger(target, "add" /* ADD */, value, value);
    }
    return this;
}
function set$1(key, value) {
    value = toRaw$1(value);
    const target = toRaw$1(this);
    const { has, get } = getProto(target);
    let hadKey = has.call(target, key);
    if (!hadKey) {
        key = toRaw$1(key);
        hadKey = has.call(target, key);
    }
    else {
        checkIdentityKeys(target, has, key);
    }
    const oldValue = get.call(target, key);
    target.set(key, value);
    if (!hadKey) {
        trigger(target, "add" /* ADD */, key, value);
    }
    else if (shared$1.hasChanged(value, oldValue)) {
        trigger(target, "set" /* SET */, key, value, oldValue);
    }
    return this;
}
function deleteEntry(key) {
    const target = toRaw$1(this);
    const { has, get } = getProto(target);
    let hadKey = has.call(target, key);
    if (!hadKey) {
        key = toRaw$1(key);
        hadKey = has.call(target, key);
    }
    else {
        checkIdentityKeys(target, has, key);
    }
    const oldValue = get ? get.call(target, key) : undefined;
    // forward the operation before queueing reactions
    const result = target.delete(key);
    if (hadKey) {
        trigger(target, "delete" /* DELETE */, key, undefined, oldValue);
    }
    return result;
}
function clear() {
    const target = toRaw$1(this);
    const hadItems = target.size !== 0;
    const oldTarget = shared$1.isMap(target)
            ? new Map(target)
            : new Set(target)
        ;
    // forward the operation before queueing reactions
    const result = target.clear();
    if (hadItems) {
        trigger(target, "clear" /* CLEAR */, undefined, undefined, oldTarget);
    }
    return result;
}
function createForEach(isReadonly, isShallow) {
    return function forEach(callback, thisArg) {
        const observed = this;
        const target = observed["__v_raw" /* RAW */];
        const rawTarget = toRaw$1(target);
        const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive;
        !isReadonly && track(rawTarget, "iterate" /* ITERATE */, ITERATE_KEY);
        return target.forEach((value, key) => {
            // important: make sure the callback is
            // 1. invoked with the reactive map as `this` and 3rd arg
            // 2. the value received should be a corresponding reactive/readonly.
            return callback.call(thisArg, wrap(value), wrap(key), observed);
        });
    };
}
function createIterableMethod(method, isReadonly, isShallow) {
    return function (...args) {
        const target = this["__v_raw" /* RAW */];
        const rawTarget = toRaw$1(target);
        const targetIsMap = shared$1.isMap(rawTarget);
        const isPair = method === 'entries' || (method === Symbol.iterator && targetIsMap);
        const isKeyOnly = method === 'keys' && targetIsMap;
        const innerIterator = target[method](...args);
        const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive;
        !isReadonly &&
            track(rawTarget, "iterate" /* ITERATE */, isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY);
        // return a wrapped iterator which returns observed versions of the
        // values emitted from the real iterator
        return {
            // iterator protocol
            next() {
                const { value, done } = innerIterator.next();
                return done
                    ? { value, done }
                    : {
                        value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
                        done
                    };
            },
            // iterable protocol
            [Symbol.iterator]() {
                return this;
            }
        };
    };
}
function createReadonlyMethod(type) {
    return function (...args) {
        {
            const key = args[0] ? `on key "${args[0]}" ` : ``;
            console.warn(`${shared$1.capitalize(type)} operation ${key}failed: target is readonly.`, toRaw$1(this));
        }
        return type === "delete" /* DELETE */ ? false : this;
    };
}
function createInstrumentations() {
    const mutableInstrumentations = {
        get(key) {
            return get$1(this, key);
        },
        get size() {
            return size(this);
        },
        has: has$1,
        add,
        set: set$1,
        delete: deleteEntry,
        clear,
        forEach: createForEach(false, false)
    };
    const shallowInstrumentations = {
        get(key) {
            return get$1(this, key, false, true);
        },
        get size() {
            return size(this);
        },
        has: has$1,
        add,
        set: set$1,
        delete: deleteEntry,
        clear,
        forEach: createForEach(false, true)
    };
    const readonlyInstrumentations = {
        get(key) {
            return get$1(this, key, true);
        },
        get size() {
            return size(this, true);
        },
        has(key) {
            return has$1.call(this, key, true);
        },
        add: createReadonlyMethod("add" /* ADD */),
        set: createReadonlyMethod("set" /* SET */),
        delete: createReadonlyMethod("delete" /* DELETE */),
        clear: createReadonlyMethod("clear" /* CLEAR */),
        forEach: createForEach(true, false)
    };
    const shallowReadonlyInstrumentations = {
        get(key) {
            return get$1(this, key, true, true);
        },
        get size() {
            return size(this, true);
        },
        has(key) {
            return has$1.call(this, key, true);
        },
        add: createReadonlyMethod("add" /* ADD */),
        set: createReadonlyMethod("set" /* SET */),
        delete: createReadonlyMethod("delete" /* DELETE */),
        clear: createReadonlyMethod("clear" /* CLEAR */),
        forEach: createForEach(true, true)
    };
    const iteratorMethods = ['keys', 'values', 'entries', Symbol.iterator];
    iteratorMethods.forEach(method => {
        mutableInstrumentations[method] = createIterableMethod(method, false, false);
        readonlyInstrumentations[method] = createIterableMethod(method, true, false);
        shallowInstrumentations[method] = createIterableMethod(method, false, true);
        shallowReadonlyInstrumentations[method] = createIterableMethod(method, true, true);
    });
    return [
        mutableInstrumentations,
        readonlyInstrumentations,
        shallowInstrumentations,
        shallowReadonlyInstrumentations
    ];
}
const [mutableInstrumentations, readonlyInstrumentations, shallowInstrumentations, shallowReadonlyInstrumentations] = /* #__PURE__*/ createInstrumentations();
function createInstrumentationGetter(isReadonly, shallow) {
    const instrumentations = shallow
        ? isReadonly
            ? shallowReadonlyInstrumentations
            : shallowInstrumentations
        : isReadonly
            ? readonlyInstrumentations
            : mutableInstrumentations;
    return (target, key, receiver) => {
        if (key === "__v_isReactive" /* IS_REACTIVE */) {
            return !isReadonly;
        }
        else if (key === "__v_isReadonly" /* IS_READONLY */) {
            return isReadonly;
        }
        else if (key === "__v_raw" /* RAW */) {
            return target;
        }
        return Reflect.get(shared$1.hasOwn(instrumentations, key) && key in target
            ? instrumentations
            : target, key, receiver);
    };
}
const mutableCollectionHandlers = {
    get: /*#__PURE__*/ createInstrumentationGetter(false, false)
};
const shallowCollectionHandlers = {
    get: /*#__PURE__*/ createInstrumentationGetter(false, true)
};
const readonlyCollectionHandlers = {
    get: /*#__PURE__*/ createInstrumentationGetter(true, false)
};
const shallowReadonlyCollectionHandlers = {
    get: /*#__PURE__*/ createInstrumentationGetter(true, true)
};
function checkIdentityKeys(target, has, key) {
    const rawKey = toRaw$1(key);
    if (rawKey !== key && has.call(target, rawKey)) {
        const type = shared$1.toRawType(target);
        console.warn(`Reactive ${type} contains both the raw and reactive ` +
            `versions of the same object${type === `Map` ? ` as keys` : ``}, ` +
            `which can lead to inconsistencies. ` +
            `Avoid differentiating between the raw and reactive versions ` +
            `of an object and only use the reactive version if possible.`);
    }
}

const reactiveMap = new WeakMap();
const shallowReactiveMap = new WeakMap();
const readonlyMap = new WeakMap();
const shallowReadonlyMap = new WeakMap();
function targetTypeMap(rawType) {
    switch (rawType) {
        case 'Object':
        case 'Array':
            return 1 /* COMMON */;
        case 'Map':
        case 'Set':
        case 'WeakMap':
        case 'WeakSet':
            return 2 /* COLLECTION */;
        default:
            return 0 /* INVALID */;
    }
}
function getTargetType(value) {
    return value["__v_skip" /* SKIP */] || !Object.isExtensible(value)
        ? 0 /* INVALID */
        : targetTypeMap(shared$1.toRawType(value));
}
function reactive(target) {
    // if trying to observe a readonly proxy, return the readonly version.
    if (isReadonly(target)) {
        return target;
    }
    return createReactiveObject(target, false, mutableHandlers, mutableCollectionHandlers, reactiveMap);
}
/**
 * Return a shallowly-reactive copy of the original object, where only the root
 * level properties are reactive. It also does not auto-unwrap refs (even at the
 * root level).
 */
function shallowReactive(target) {
    return createReactiveObject(target, false, shallowReactiveHandlers, shallowCollectionHandlers, shallowReactiveMap);
}
/**
 * Creates a readonly copy of the original object. Note the returned copy is not
 * made reactive, but `readonly` can be called on an already reactive object.
 */
function readonly(target) {
    return createReactiveObject(target, true, readonlyHandlers, readonlyCollectionHandlers, readonlyMap);
}
/**
 * Returns a reactive-copy of the original object, where only the root level
 * properties are readonly, and does NOT unwrap refs nor recursively convert
 * returned properties.
 * This is used for creating the props proxy object for stateful components.
 */
function shallowReadonly(target) {
    return createReactiveObject(target, true, shallowReadonlyHandlers, shallowReadonlyCollectionHandlers, shallowReadonlyMap);
}
function createReactiveObject(target, isReadonly, baseHandlers, collectionHandlers, proxyMap) {
    if (!shared$1.isObject(target)) {
        {
            console.warn(`value cannot be made reactive: ${String(target)}`);
        }
        return target;
    }
    // target is already a Proxy, return it.
    // exception: calling readonly() on a reactive object
    if (target["__v_raw" /* RAW */] &&
        !(isReadonly && target["__v_isReactive" /* IS_REACTIVE */])) {
        return target;
    }
    // target already has corresponding Proxy
    const existingProxy = proxyMap.get(target);
    if (existingProxy) {
        return existingProxy;
    }
    // only specific value types can be observed.
    const targetType = getTargetType(target);
    if (targetType === 0 /* INVALID */) {
        return target;
    }
    const proxy = new Proxy(target, targetType === 2 /* COLLECTION */ ? collectionHandlers : baseHandlers);
    proxyMap.set(target, proxy);
    return proxy;
}
function isReactive(value) {
    if (isReadonly(value)) {
        return isReactive(value["__v_raw" /* RAW */]);
    }
    return !!(value && value["__v_isReactive" /* IS_REACTIVE */]);
}
function isReadonly(value) {
    return !!(value && value["__v_isReadonly" /* IS_READONLY */]);
}
function isShallow(value) {
    return !!(value && value["__v_isShallow" /* IS_SHALLOW */]);
}
function isProxy(value) {
    return isReactive(value) || isReadonly(value);
}
function toRaw$1(observed) {
    const raw = observed && observed["__v_raw" /* RAW */];
    return raw ? toRaw$1(raw) : observed;
}
function markRaw(value) {
    shared$1.def(value, "__v_skip" /* SKIP */, true);
    return value;
}
const toReactive = (value) => shared$1.isObject(value) ? reactive(value) : value;
const toReadonly = (value) => shared$1.isObject(value) ? readonly(value) : value;

function trackRefValue(ref) {
    if (shouldTrack && activeEffect) {
        ref = toRaw$1(ref);
        {
            trackEffects(ref.dep || (ref.dep = createDep()), {
                target: ref,
                type: "get" /* GET */,
                key: 'value'
            });
        }
    }
}
function triggerRefValue(ref, newVal) {
    ref = toRaw$1(ref);
    if (ref.dep) {
        {
            triggerEffects(ref.dep, {
                target: ref,
                type: "set" /* SET */,
                key: 'value',
                newValue: newVal
            });
        }
    }
}
function isRef$1(r) {
    return !!(r && r.__v_isRef === true);
}
function ref(value) {
    return createRef(value, false);
}
function shallowRef(value) {
    return createRef(value, true);
}
function createRef(rawValue, shallow) {
    if (isRef$1(rawValue)) {
        return rawValue;
    }
    return new RefImpl(rawValue, shallow);
}
class RefImpl {
    constructor(value, __v_isShallow) {
        this.__v_isShallow = __v_isShallow;
        this.dep = undefined;
        this.__v_isRef = true;
        this._rawValue = __v_isShallow ? value : toRaw$1(value);
        this._value = __v_isShallow ? value : toReactive(value);
    }
    get value() {
        trackRefValue(this);
        return this._value;
    }
    set value(newVal) {
        newVal = this.__v_isShallow ? newVal : toRaw$1(newVal);
        if (shared$1.hasChanged(newVal, this._rawValue)) {
            this._rawValue = newVal;
            this._value = this.__v_isShallow ? newVal : toReactive(newVal);
            triggerRefValue(this, newVal);
        }
    }
}
function triggerRef(ref) {
    triggerRefValue(ref, ref.value );
}
function unref(ref) {
    return isRef$1(ref) ? ref.value : ref;
}
const shallowUnwrapHandlers = {
    get: (target, key, receiver) => unref(Reflect.get(target, key, receiver)),
    set: (target, key, value, receiver) => {
        const oldValue = target[key];
        if (isRef$1(oldValue) && !isRef$1(value)) {
            oldValue.value = value;
            return true;
        }
        else {
            return Reflect.set(target, key, value, receiver);
        }
    }
};
function proxyRefs(objectWithRefs) {
    return isReactive(objectWithRefs)
        ? objectWithRefs
        : new Proxy(objectWithRefs, shallowUnwrapHandlers);
}
class CustomRefImpl {
    constructor(factory) {
        this.dep = undefined;
        this.__v_isRef = true;
        const { get, set } = factory(() => trackRefValue(this), () => triggerRefValue(this));
        this._get = get;
        this._set = set;
    }
    get value() {
        return this._get();
    }
    set value(newVal) {
        this._set(newVal);
    }
}
function customRef(factory) {
    return new CustomRefImpl(factory);
}
function toRefs(object) {
    if (!isProxy(object)) {
        console.warn(`toRefs() expects a reactive object but received a plain one.`);
    }
    const ret = shared$1.isArray(object) ? new Array(object.length) : {};
    for (const key in object) {
        ret[key] = toRef(object, key);
    }
    return ret;
}
class ObjectRefImpl {
    constructor(_object, _key, _defaultValue) {
        this._object = _object;
        this._key = _key;
        this._defaultValue = _defaultValue;
        this.__v_isRef = true;
    }
    get value() {
        const val = this._object[this._key];
        return val === undefined ? this._defaultValue : val;
    }
    set value(newVal) {
        this._object[this._key] = newVal;
    }
}
function toRef(object, key, defaultValue) {
    const val = object[key];
    return isRef$1(val)
        ? val
        : new ObjectRefImpl(object, key, defaultValue);
}

class ComputedRefImpl {
    constructor(getter, _setter, isReadonly, isSSR) {
        this._setter = _setter;
        this.dep = undefined;
        this.__v_isRef = true;
        this._dirty = true;
        this.effect = new ReactiveEffect(getter, () => {
            if (!this._dirty) {
                this._dirty = true;
                triggerRefValue(this);
            }
        });
        this.effect.computed = this;
        this.effect.active = this._cacheable = !isSSR;
        this["__v_isReadonly" /* IS_READONLY */] = isReadonly;
    }
    get value() {
        // the computed ref may get wrapped by other proxies e.g. readonly() #3376
        const self = toRaw$1(this);
        trackRefValue(self);
        if (self._dirty || !self._cacheable) {
            self._dirty = false;
            self._value = self.effect.run();
        }
        return self._value;
    }
    set value(newValue) {
        this._setter(newValue);
    }
}
function computed(getterOrOptions, debugOptions, isSSR = false) {
    let getter;
    let setter;
    const onlyGetter = shared$1.isFunction(getterOrOptions);
    if (onlyGetter) {
        getter = getterOrOptions;
        setter = () => {
                console.warn('Write operation failed: computed value is readonly');
            }
            ;
    }
    else {
        getter = getterOrOptions.get;
        setter = getterOrOptions.set;
    }
    const cRef = new ComputedRefImpl(getter, setter, onlyGetter || !setter, isSSR);
    if (debugOptions && !isSSR) {
        cRef.effect.onTrack = debugOptions.onTrack;
        cRef.effect.onTrigger = debugOptions.onTrigger;
    }
    return cRef;
}

var _a;
const tick = /*#__PURE__*/ Promise.resolve();
const queue = [];
let queued = false;
const scheduler = (fn) => {
    queue.push(fn);
    if (!queued) {
        queued = true;
        tick.then(flush);
    }
};
const flush = () => {
    for (let i = 0; i < queue.length; i++) {
        queue[i]();
    }
    queue.length = 0;
    queued = false;
};
class DeferredComputedRefImpl {
    constructor(getter) {
        this.dep = undefined;
        this._dirty = true;
        this.__v_isRef = true;
        this[_a] = true;
        let compareTarget;
        let hasCompareTarget = false;
        let scheduled = false;
        this.effect = new ReactiveEffect(getter, (computedTrigger) => {
            if (this.dep) {
                if (computedTrigger) {
                    compareTarget = this._value;
                    hasCompareTarget = true;
                }
                else if (!scheduled) {
                    const valueToCompare = hasCompareTarget ? compareTarget : this._value;
                    scheduled = true;
                    hasCompareTarget = false;
                    scheduler(() => {
                        if (this.effect.active && this._get() !== valueToCompare) {
                            triggerRefValue(this);
                        }
                        scheduled = false;
                    });
                }
                // chained upstream computeds are notified synchronously to ensure
                // value invalidation in case of sync access; normal effects are
                // deferred to be triggered in scheduler.
                for (const e of this.dep) {
                    if (e.computed instanceof DeferredComputedRefImpl) {
                        e.scheduler(true /* computedTrigger */);
                    }
                }
            }
            this._dirty = true;
        });
        this.effect.computed = this;
    }
    _get() {
        if (this._dirty) {
            this._dirty = false;
            return (this._value = this.effect.run());
        }
        return this._value;
    }
    get value() {
        trackRefValue(this);
        // the computed ref may get wrapped by other proxies e.g. readonly() #3376
        return toRaw$1(this)._get();
    }
}
_a = "__v_isReadonly" /* IS_READONLY */;
function deferredComputed(getter) {
    return new DeferredComputedRefImpl(getter);
}

reactivity_cjs.EffectScope = EffectScope;
reactivity_cjs.ITERATE_KEY = ITERATE_KEY;
reactivity_cjs.ReactiveEffect = ReactiveEffect;
reactivity_cjs.computed = computed;
reactivity_cjs.customRef = customRef;
reactivity_cjs.deferredComputed = deferredComputed;
reactivity_cjs.effect = effect;
reactivity_cjs.effectScope = effectScope;
reactivity_cjs.enableTracking = enableTracking;
reactivity_cjs.getCurrentScope = getCurrentScope;
reactivity_cjs.isProxy = isProxy;
reactivity_cjs.isReactive = isReactive;
reactivity_cjs.isReadonly = isReadonly;
reactivity_cjs.isRef = isRef$1;
reactivity_cjs.isShallow = isShallow;
reactivity_cjs.markRaw = markRaw;
reactivity_cjs.onScopeDispose = onScopeDispose;
reactivity_cjs.pauseTracking = pauseTracking;
reactivity_cjs.proxyRefs = proxyRefs;
reactivity_cjs.reactive = reactive;
reactivity_cjs.readonly = readonly;
reactivity_cjs.ref = ref;
reactivity_cjs.resetTracking = resetTracking;
reactivity_cjs.shallowReactive = shallowReactive;
reactivity_cjs.shallowReadonly = shallowReadonly;
reactivity_cjs.shallowRef = shallowRef;
reactivity_cjs.stop = stop;
reactivity_cjs.toRaw = toRaw$1;
reactivity_cjs.toRef = toRef;
reactivity_cjs.toRefs = toRefs;
reactivity_cjs.track = track;
reactivity_cjs.trigger = trigger;
reactivity_cjs.triggerRef = triggerRef;
reactivity_cjs.unref = unref;

(function (module) {

	{
	  module.exports = reactivity_cjs;
	}
} (reactivity));

(function (exports) {

	Object.defineProperty(exports, '__esModule', { value: true });

	var reactivity$1 = reactivity.exports;
	var shared = shared$2.exports;

	const stack = [];
	function pushWarningContext(vnode) {
	    stack.push(vnode);
	}
	function popWarningContext() {
	    stack.pop();
	}
	function warn(msg, ...args) {
	    // avoid props formatting or warn handler tracking deps that might be mutated
	    // during patch, leading to infinite recursion.
	    reactivity$1.pauseTracking();
	    const instance = stack.length ? stack[stack.length - 1].component : null;
	    const appWarnHandler = instance && instance.appContext.config.warnHandler;
	    const trace = getComponentTrace();
	    if (appWarnHandler) {
	        callWithErrorHandling(appWarnHandler, instance, 11 /* APP_WARN_HANDLER */, [
	            msg + args.join(''),
	            instance && instance.proxy,
	            trace
	                .map(({ vnode }) => `at <${formatComponentName(instance, vnode.type)}>`)
	                .join('\n'),
	            trace
	        ]);
	    }
	    else {
	        const warnArgs = [`[Vue warn]: ${msg}`, ...args];
	        /* istanbul ignore if */
	        if (trace.length &&
	            // avoid spamming console during tests
	            !false) {
	            warnArgs.push(`\n`, ...formatTrace(trace));
	        }
	        console.warn(...warnArgs);
	    }
	    reactivity$1.resetTracking();
	}
	function getComponentTrace() {
	    let currentVNode = stack[stack.length - 1];
	    if (!currentVNode) {
	        return [];
	    }
	    // we can't just use the stack because it will be incomplete during updates
	    // that did not start from the root. Re-construct the parent chain using
	    // instance parent pointers.
	    const normalizedStack = [];
	    while (currentVNode) {
	        const last = normalizedStack[0];
	        if (last && last.vnode === currentVNode) {
	            last.recurseCount++;
	        }
	        else {
	            normalizedStack.push({
	                vnode: currentVNode,
	                recurseCount: 0
	            });
	        }
	        const parentInstance = currentVNode.component && currentVNode.component.parent;
	        currentVNode = parentInstance && parentInstance.vnode;
	    }
	    return normalizedStack;
	}
	/* istanbul ignore next */
	function formatTrace(trace) {
	    const logs = [];
	    trace.forEach((entry, i) => {
	        logs.push(...(i === 0 ? [] : [`\n`]), ...formatTraceEntry(entry));
	    });
	    return logs;
	}
	function formatTraceEntry({ vnode, recurseCount }) {
	    const postfix = recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``;
	    const isRoot = vnode.component ? vnode.component.parent == null : false;
	    const open = ` at <${formatComponentName(vnode.component, vnode.type, isRoot)}`;
	    const close = `>` + postfix;
	    return vnode.props
	        ? [open, ...formatProps(vnode.props), close]
	        : [open + close];
	}
	/* istanbul ignore next */
	function formatProps(props) {
	    const res = [];
	    const keys = Object.keys(props);
	    keys.slice(0, 3).forEach(key => {
	        res.push(...formatProp(key, props[key]));
	    });
	    if (keys.length > 3) {
	        res.push(` ...`);
	    }
	    return res;
	}
	/* istanbul ignore next */
	function formatProp(key, value, raw) {
	    if (shared.isString(value)) {
	        value = JSON.stringify(value);
	        return raw ? value : [`${key}=${value}`];
	    }
	    else if (typeof value === 'number' ||
	        typeof value === 'boolean' ||
	        value == null) {
	        return raw ? value : [`${key}=${value}`];
	    }
	    else if (reactivity$1.isRef(value)) {
	        value = formatProp(key, reactivity$1.toRaw(value.value), true);
	        return raw ? value : [`${key}=Ref<`, value, `>`];
	    }
	    else if (shared.isFunction(value)) {
	        return [`${key}=fn${value.name ? `<${value.name}>` : ``}`];
	    }
	    else {
	        value = reactivity$1.toRaw(value);
	        return raw ? value : [`${key}=`, value];
	    }
	}

	const ErrorTypeStrings = {
	    ["sp" /* SERVER_PREFETCH */]: 'serverPrefetch hook',
	    ["bc" /* BEFORE_CREATE */]: 'beforeCreate hook',
	    ["c" /* CREATED */]: 'created hook',
	    ["bm" /* BEFORE_MOUNT */]: 'beforeMount hook',
	    ["m" /* MOUNTED */]: 'mounted hook',
	    ["bu" /* BEFORE_UPDATE */]: 'beforeUpdate hook',
	    ["u" /* UPDATED */]: 'updated',
	    ["bum" /* BEFORE_UNMOUNT */]: 'beforeUnmount hook',
	    ["um" /* UNMOUNTED */]: 'unmounted hook',
	    ["a" /* ACTIVATED */]: 'activated hook',
	    ["da" /* DEACTIVATED */]: 'deactivated hook',
	    ["ec" /* ERROR_CAPTURED */]: 'errorCaptured hook',
	    ["rtc" /* RENDER_TRACKED */]: 'renderTracked hook',
	    ["rtg" /* RENDER_TRIGGERED */]: 'renderTriggered hook',
	    [0 /* SETUP_FUNCTION */]: 'setup function',
	    [1 /* RENDER_FUNCTION */]: 'render function',
	    [2 /* WATCH_GETTER */]: 'watcher getter',
	    [3 /* WATCH_CALLBACK */]: 'watcher callback',
	    [4 /* WATCH_CLEANUP */]: 'watcher cleanup function',
	    [5 /* NATIVE_EVENT_HANDLER */]: 'native event handler',
	    [6 /* COMPONENT_EVENT_HANDLER */]: 'component event handler',
	    [7 /* VNODE_HOOK */]: 'vnode hook',
	    [8 /* DIRECTIVE_HOOK */]: 'directive hook',
	    [9 /* TRANSITION_HOOK */]: 'transition hook',
	    [10 /* APP_ERROR_HANDLER */]: 'app errorHandler',
	    [11 /* APP_WARN_HANDLER */]: 'app warnHandler',
	    [12 /* FUNCTION_REF */]: 'ref function',
	    [13 /* ASYNC_COMPONENT_LOADER */]: 'async component loader',
	    [14 /* SCHEDULER */]: 'scheduler flush. This is likely a Vue internals bug. ' +
	        'Please open an issue at https://new-issue.vuejs.org/?repo=vuejs/core'
	};
	function callWithErrorHandling(fn, instance, type, args) {
	    let res;
	    try {
	        res = args ? fn(...args) : fn();
	    }
	    catch (err) {
	        handleError(err, instance, type);
	    }
	    return res;
	}
	function callWithAsyncErrorHandling(fn, instance, type, args) {
	    if (shared.isFunction(fn)) {
	        const res = callWithErrorHandling(fn, instance, type, args);
	        if (res && shared.isPromise(res)) {
	            res.catch(err => {
	                handleError(err, instance, type);
	            });
	        }
	        return res;
	    }
	    const values = [];
	    for (let i = 0; i < fn.length; i++) {
	        values.push(callWithAsyncErrorHandling(fn[i], instance, type, args));
	    }
	    return values;
	}
	function handleError(err, instance, type, throwInDev = true) {
	    const contextVNode = instance ? instance.vnode : null;
	    if (instance) {
	        let cur = instance.parent;
	        // the exposed instance is the render proxy to keep it consistent with 2.x
	        const exposedInstance = instance.proxy;
	        // in production the hook receives only the error code
	        const errorInfo = ErrorTypeStrings[type] ;
	        while (cur) {
	            const errorCapturedHooks = cur.ec;
	            if (errorCapturedHooks) {
	                for (let i = 0; i < errorCapturedHooks.length; i++) {
	                    if (errorCapturedHooks[i](err, exposedInstance, errorInfo) === false) {
	                        return;
	                    }
	                }
	            }
	            cur = cur.parent;
	        }
	        // app-level handling
	        const appErrorHandler = instance.appContext.config.errorHandler;
	        if (appErrorHandler) {
	            callWithErrorHandling(appErrorHandler, null, 10 /* APP_ERROR_HANDLER */, [err, exposedInstance, errorInfo]);
	            return;
	        }
	    }
	    logError(err, type, contextVNode, throwInDev);
	}
	function logError(err, type, contextVNode, throwInDev = true) {
	    {
	        const info = ErrorTypeStrings[type];
	        if (contextVNode) {
	            pushWarningContext(contextVNode);
	        }
	        warn(`Unhandled error${info ? ` during execution of ${info}` : ``}`);
	        if (contextVNode) {
	            popWarningContext();
	        }
	        // crash in dev by default so it's more noticeable
	        if (throwInDev) {
	            throw err;
	        }
	        else {
	            console.error(err);
	        }
	    }
	}

	let isFlushing = false;
	let isFlushPending = false;
	const queue = [];
	let flushIndex = 0;
	const pendingPreFlushCbs = [];
	let activePreFlushCbs = null;
	let preFlushIndex = 0;
	const pendingPostFlushCbs = [];
	let activePostFlushCbs = null;
	let postFlushIndex = 0;
	const resolvedPromise = /*#__PURE__*/ Promise.resolve();
	let currentFlushPromise = null;
	let currentPreFlushParentJob = null;
	const RECURSION_LIMIT = 100;
	function nextTick(fn) {
	    const p = currentFlushPromise || resolvedPromise;
	    return fn ? p.then(this ? fn.bind(this) : fn) : p;
	}
	// #2768
	// Use binary-search to find a suitable position in the queue,
	// so that the queue maintains the increasing order of job's id,
	// which can prevent the job from being skipped and also can avoid repeated patching.
	function findInsertionIndex(id) {
	    // the start index should be `flushIndex + 1`
	    let start = flushIndex + 1;
	    let end = queue.length;
	    while (start < end) {
	        const middle = (start + end) >>> 1;
	        const middleJobId = getId(queue[middle]);
	        middleJobId < id ? (start = middle + 1) : (end = middle);
	    }
	    return start;
	}
	function queueJob(job) {
	    // the dedupe search uses the startIndex argument of Array.includes()
	    // by default the search index includes the current job that is being run
	    // so it cannot recursively trigger itself again.
	    // if the job is a watch() callback, the search will start with a +1 index to
	    // allow it recursively trigger itself - it is the user's responsibility to
	    // ensure it doesn't end up in an infinite loop.
	    if ((!queue.length ||
	        !queue.includes(job, isFlushing && job.allowRecurse ? flushIndex + 1 : flushIndex)) &&
	        job !== currentPreFlushParentJob) {
	        if (job.id == null) {
	            queue.push(job);
	        }
	        else {
	            queue.splice(findInsertionIndex(job.id), 0, job);
	        }
	        queueFlush();
	    }
	}
	function queueFlush() {
	    if (!isFlushing && !isFlushPending) {
	        isFlushPending = true;
	        currentFlushPromise = resolvedPromise.then(flushJobs);
	    }
	}
	function invalidateJob(job) {
	    const i = queue.indexOf(job);
	    if (i > flushIndex) {
	        queue.splice(i, 1);
	    }
	}
	function queueCb(cb, activeQueue, pendingQueue, index) {
	    if (!shared.isArray(cb)) {
	        if (!activeQueue ||
	            !activeQueue.includes(cb, cb.allowRecurse ? index + 1 : index)) {
	            pendingQueue.push(cb);
	        }
	    }
	    else {
	        // if cb is an array, it is a component lifecycle hook which can only be
	        // triggered by a job, which is already deduped in the main queue, so
	        // we can skip duplicate check here to improve perf
	        pendingQueue.push(...cb);
	    }
	    queueFlush();
	}
	function queuePreFlushCb(cb) {
	    queueCb(cb, activePreFlushCbs, pendingPreFlushCbs, preFlushIndex);
	}
	function queuePostFlushCb(cb) {
	    queueCb(cb, activePostFlushCbs, pendingPostFlushCbs, postFlushIndex);
	}
	function flushPreFlushCbs(seen, parentJob = null) {
	    if (pendingPreFlushCbs.length) {
	        currentPreFlushParentJob = parentJob;
	        activePreFlushCbs = [...new Set(pendingPreFlushCbs)];
	        pendingPreFlushCbs.length = 0;
	        {
	            seen = seen || new Map();
	        }
	        for (preFlushIndex = 0; preFlushIndex < activePreFlushCbs.length; preFlushIndex++) {
	            if (checkRecursiveUpdates(seen, activePreFlushCbs[preFlushIndex])) {
	                continue;
	            }
	            activePreFlushCbs[preFlushIndex]();
	        }
	        activePreFlushCbs = null;
	        preFlushIndex = 0;
	        currentPreFlushParentJob = null;
	        // recursively flush until it drains
	        flushPreFlushCbs(seen, parentJob);
	    }
	}
	function flushPostFlushCbs(seen) {
	    // flush any pre cbs queued during the flush (e.g. pre watchers)
	    flushPreFlushCbs();
	    if (pendingPostFlushCbs.length) {
	        const deduped = [...new Set(pendingPostFlushCbs)];
	        pendingPostFlushCbs.length = 0;
	        // #1947 already has active queue, nested flushPostFlushCbs call
	        if (activePostFlushCbs) {
	            activePostFlushCbs.push(...deduped);
	            return;
	        }
	        activePostFlushCbs = deduped;
	        {
	            seen = seen || new Map();
	        }
	        activePostFlushCbs.sort((a, b) => getId(a) - getId(b));
	        for (postFlushIndex = 0; postFlushIndex < activePostFlushCbs.length; postFlushIndex++) {
	            if (checkRecursiveUpdates(seen, activePostFlushCbs[postFlushIndex])) {
	                continue;
	            }
	            activePostFlushCbs[postFlushIndex]();
	        }
	        activePostFlushCbs = null;
	        postFlushIndex = 0;
	    }
	}
	const getId = (job) => job.id == null ? Infinity : job.id;
	function flushJobs(seen) {
	    isFlushPending = false;
	    isFlushing = true;
	    {
	        seen = seen || new Map();
	    }
	    flushPreFlushCbs(seen);
	    // Sort queue before flush.
	    // This ensures that:
	    // 1. Components are updated from parent to child. (because parent is always
	    //    created before the child so its render effect will have smaller
	    //    priority number)
	    // 2. If a component is unmounted during a parent component's update,
	    //    its update can be skipped.
	    queue.sort((a, b) => getId(a) - getId(b));
	    // conditional usage of checkRecursiveUpdate must be determined out of
	    // try ... catch block since Rollup by default de-optimizes treeshaking
	    // inside try-catch. This can leave all warning code unshaked. Although
	    // they would get eventually shaken by a minifier like terser, some minifiers
	    // would fail to do that (e.g. https://github.com/evanw/esbuild/issues/1610)
	    const check = (job) => checkRecursiveUpdates(seen, job)
	        ;
	    try {
	        for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
	            const job = queue[flushIndex];
	            if (job && job.active !== false) {
	                if (true && check(job)) {
	                    continue;
	                }
	                // console.log(`running:`, job.id)
	                callWithErrorHandling(job, null, 14 /* SCHEDULER */);
	            }
	        }
	    }
	    finally {
	        flushIndex = 0;
	        queue.length = 0;
	        flushPostFlushCbs(seen);
	        isFlushing = false;
	        currentFlushPromise = null;
	        // some postFlushCb queued jobs!
	        // keep flushing until it drains.
	        if (queue.length ||
	            pendingPreFlushCbs.length ||
	            pendingPostFlushCbs.length) {
	            flushJobs(seen);
	        }
	    }
	}
	function checkRecursiveUpdates(seen, fn) {
	    if (!seen.has(fn)) {
	        seen.set(fn, 1);
	    }
	    else {
	        const count = seen.get(fn);
	        if (count > RECURSION_LIMIT) {
	            const instance = fn.ownerInstance;
	            const componentName = instance && getComponentName(instance.type);
	            warn(`Maximum recursive updates exceeded${componentName ? ` in component <${componentName}>` : ``}. ` +
	                `This means you have a reactive effect that is mutating its own ` +
	                `dependencies and thus recursively triggering itself. Possible sources ` +
	                `include component template, render function, updated hook or ` +
	                `watcher source function.`);
	            return true;
	        }
	        else {
	            seen.set(fn, count + 1);
	        }
	    }
	}

	/* eslint-disable no-restricted-globals */
	let isHmrUpdating = false;
	const hmrDirtyComponents = new Set();
	// Expose the HMR runtime on the global object
	// This makes it entirely tree-shakable without polluting the exports and makes
	// it easier to be used in toolings like vue-loader
	// Note: for a component to be eligible for HMR it also needs the __hmrId option
	// to be set so that its instances can be registered / removed.
	{
	    shared.getGlobalThis().__VUE_HMR_RUNTIME__ = {
	        createRecord: tryWrap(createRecord),
	        rerender: tryWrap(rerender),
	        reload: tryWrap(reload)
	    };
	}
	const map = new Map();
	function registerHMR(instance) {
	    const id = instance.type.__hmrId;
	    let record = map.get(id);
	    if (!record) {
	        createRecord(id, instance.type);
	        record = map.get(id);
	    }
	    record.instances.add(instance);
	}
	function unregisterHMR(instance) {
	    map.get(instance.type.__hmrId).instances.delete(instance);
	}
	function createRecord(id, initialDef) {
	    if (map.has(id)) {
	        return false;
	    }
	    map.set(id, {
	        initialDef: normalizeClassComponent(initialDef),
	        instances: new Set()
	    });
	    return true;
	}
	function normalizeClassComponent(component) {
	    return isClassComponent(component) ? component.__vccOpts : component;
	}
	function rerender(id, newRender) {
	    const record = map.get(id);
	    if (!record) {
	        return;
	    }
	    // update initial record (for not-yet-rendered component)
	    record.initialDef.render = newRender;
	    [...record.instances].forEach(instance => {
	        if (newRender) {
	            instance.render = newRender;
	            normalizeClassComponent(instance.type).render = newRender;
	        }
	        instance.renderCache = [];
	        // this flag forces child components with slot content to update
	        isHmrUpdating = true;
	        instance.update();
	        isHmrUpdating = false;
	    });
	}
	function reload(id, newComp) {
	    const record = map.get(id);
	    if (!record)
	        return;
	    newComp = normalizeClassComponent(newComp);
	    // update initial def (for not-yet-rendered components)
	    updateComponentDef(record.initialDef, newComp);
	    // create a snapshot which avoids the set being mutated during updates
	    const instances = [...record.instances];
	    for (const instance of instances) {
	        const oldComp = normalizeClassComponent(instance.type);
	        if (!hmrDirtyComponents.has(oldComp)) {
	            // 1. Update existing comp definition to match new one
	            if (oldComp !== record.initialDef) {
	                updateComponentDef(oldComp, newComp);
	            }
	            // 2. mark definition dirty. This forces the renderer to replace the
	            // component on patch.
	            hmrDirtyComponents.add(oldComp);
	        }
	        // 3. invalidate options resolution cache
	        instance.appContext.optionsCache.delete(instance.type);
	        // 4. actually update
	        if (instance.ceReload) {
	            // custom element
	            hmrDirtyComponents.add(oldComp);
	            instance.ceReload(newComp.styles);
	            hmrDirtyComponents.delete(oldComp);
	        }
	        else if (instance.parent) {
	            // 4. Force the parent instance to re-render. This will cause all updated
	            // components to be unmounted and re-mounted. Queue the update so that we
	            // don't end up forcing the same parent to re-render multiple times.
	            queueJob(instance.parent.update);
	            // instance is the inner component of an async custom element
	            // invoke to reset styles
	            if (instance.parent.type.__asyncLoader &&
	                instance.parent.ceReload) {
	                instance.parent.ceReload(newComp.styles);
	            }
	        }
	        else if (instance.appContext.reload) {
	            // root instance mounted via createApp() has a reload method
	            instance.appContext.reload();
	        }
	        else {
	            console.warn('[HMR] Root or manually mounted instance modified. Full reload required.');
	        }
	    }
	    // 5. make sure to cleanup dirty hmr components after update
	    queuePostFlushCb(() => {
	        for (const instance of instances) {
	            hmrDirtyComponents.delete(normalizeClassComponent(instance.type));
	        }
	    });
	}
	function updateComponentDef(oldComp, newComp) {
	    shared.extend(oldComp, newComp);
	    for (const key in oldComp) {
	        if (key !== '__file' && !(key in newComp)) {
	            delete oldComp[key];
	        }
	    }
	}
	function tryWrap(fn) {
	    return (id, arg) => {
	        try {
	            return fn(id, arg);
	        }
	        catch (e) {
	            console.error(e);
	            console.warn(`[HMR] Something went wrong during Vue component hot-reload. ` +
	                `Full reload required.`);
	        }
	    };
	}

	let buffer = [];
	let devtoolsNotInstalled = false;
	function emit(event, ...args) {
	    if (exports.devtools) {
	        exports.devtools.emit(event, ...args);
	    }
	    else if (!devtoolsNotInstalled) {
	        buffer.push({ event, args });
	    }
	}
	function setDevtoolsHook(hook, target) {
	    exports.devtools = hook;
	    if (exports.devtools) {
	        exports.devtools.enabled = true;
	        buffer.forEach(({ event, args }) => exports.devtools.emit(event, ...args));
	        buffer = [];
	    }
	    else {
	        // non-browser env, assume not installed
	        devtoolsNotInstalled = true;
	        buffer = [];
	    }
	}
	function devtoolsInitApp(app, version) {
	    emit("app:init" /* APP_INIT */, app, version, {
	        Fragment,
	        Text,
	        Comment,
	        Static
	    });
	}
	function devtoolsUnmountApp(app) {
	    emit("app:unmount" /* APP_UNMOUNT */, app);
	}
	const devtoolsComponentAdded = /*#__PURE__*/ createDevtoolsComponentHook("component:added" /* COMPONENT_ADDED */);
	const devtoolsComponentUpdated = 
	/*#__PURE__*/ createDevtoolsComponentHook("component:updated" /* COMPONENT_UPDATED */);
	const devtoolsComponentRemoved = 
	/*#__PURE__*/ createDevtoolsComponentHook("component:removed" /* COMPONENT_REMOVED */);
	function createDevtoolsComponentHook(hook) {
	    return (component) => {
	        emit(hook, component.appContext.app, component.uid, component.parent ? component.parent.uid : undefined, component);
	    };
	}
	const devtoolsPerfStart = /*#__PURE__*/ createDevtoolsPerformanceHook("perf:start" /* PERFORMANCE_START */);
	const devtoolsPerfEnd = /*#__PURE__*/ createDevtoolsPerformanceHook("perf:end" /* PERFORMANCE_END */);
	function createDevtoolsPerformanceHook(hook) {
	    return (component, type, time) => {
	        emit(hook, component.appContext.app, component.uid, component, type, time);
	    };
	}
	function devtoolsComponentEmit(component, event, params) {
	    emit("component:emit" /* COMPONENT_EMIT */, component.appContext.app, component, event, params);
	}

	function emit$1(instance, event, ...rawArgs) {
	    if (instance.isUnmounted)
	        return;
	    const props = instance.vnode.props || shared.EMPTY_OBJ;
	    {
	        const { emitsOptions, propsOptions: [propsOptions] } = instance;
	        if (emitsOptions) {
	            if (!(event in emitsOptions) &&
	                !(false )) {
	                if (!propsOptions || !(shared.toHandlerKey(event) in propsOptions)) {
	                    warn(`Component emitted event "${event}" but it is neither declared in ` +
	                        `the emits option nor as an "${shared.toHandlerKey(event)}" prop.`);
	                }
	            }
	            else {
	                const validator = emitsOptions[event];
	                if (shared.isFunction(validator)) {
	                    const isValid = validator(...rawArgs);
	                    if (!isValid) {
	                        warn(`Invalid event arguments: event validation failed for event "${event}".`);
	                    }
	                }
	            }
	        }
	    }
	    let args = rawArgs;
	    const isModelListener = event.startsWith('update:');
	    // for v-model update:xxx events, apply modifiers on args
	    const modelArg = isModelListener && event.slice(7);
	    if (modelArg && modelArg in props) {
	        const modifiersKey = `${modelArg === 'modelValue' ? 'model' : modelArg}Modifiers`;
	        const { number, trim } = props[modifiersKey] || shared.EMPTY_OBJ;
	        if (trim) {
	            args = rawArgs.map(a => a.trim());
	        }
	        if (number) {
	            args = rawArgs.map(shared.toNumber);
	        }
	    }
	    {
	        devtoolsComponentEmit(instance, event, args);
	    }
	    {
	        const lowerCaseEvent = event.toLowerCase();
	        if (lowerCaseEvent !== event && props[shared.toHandlerKey(lowerCaseEvent)]) {
	            warn(`Event "${lowerCaseEvent}" is emitted in component ` +
	                `${formatComponentName(instance, instance.type)} but the handler is registered for "${event}". ` +
	                `Note that HTML attributes are case-insensitive and you cannot use ` +
	                `v-on to listen to camelCase events when using in-DOM templates. ` +
	                `You should probably use "${shared.hyphenate(event)}" instead of "${event}".`);
	        }
	    }
	    let handlerName;
	    let handler = props[(handlerName = shared.toHandlerKey(event))] ||
	        // also try camelCase event handler (#2249)
	        props[(handlerName = shared.toHandlerKey(shared.camelize(event)))];
	    // for v-model update:xxx events, also trigger kebab-case equivalent
	    // for props passed via kebab-case
	    if (!handler && isModelListener) {
	        handler = props[(handlerName = shared.toHandlerKey(shared.hyphenate(event)))];
	    }
	    if (handler) {
	        callWithAsyncErrorHandling(handler, instance, 6 /* COMPONENT_EVENT_HANDLER */, args);
	    }
	    const onceHandler = props[handlerName + `Once`];
	    if (onceHandler) {
	        if (!instance.emitted) {
	            instance.emitted = {};
	        }
	        else if (instance.emitted[handlerName]) {
	            return;
	        }
	        instance.emitted[handlerName] = true;
	        callWithAsyncErrorHandling(onceHandler, instance, 6 /* COMPONENT_EVENT_HANDLER */, args);
	    }
	}
	function normalizeEmitsOptions(comp, appContext, asMixin = false) {
	    const cache = appContext.emitsCache;
	    const cached = cache.get(comp);
	    if (cached !== undefined) {
	        return cached;
	    }
	    const raw = comp.emits;
	    let normalized = {};
	    // apply mixin/extends props
	    let hasExtends = false;
	    if (!shared.isFunction(comp)) {
	        const extendEmits = (raw) => {
	            const normalizedFromExtend = normalizeEmitsOptions(raw, appContext, true);
	            if (normalizedFromExtend) {
	                hasExtends = true;
	                shared.extend(normalized, normalizedFromExtend);
	            }
	        };
	        if (!asMixin && appContext.mixins.length) {
	            appContext.mixins.forEach(extendEmits);
	        }
	        if (comp.extends) {
	            extendEmits(comp.extends);
	        }
	        if (comp.mixins) {
	            comp.mixins.forEach(extendEmits);
	        }
	    }
	    if (!raw && !hasExtends) {
	        cache.set(comp, null);
	        return null;
	    }
	    if (shared.isArray(raw)) {
	        raw.forEach(key => (normalized[key] = null));
	    }
	    else {
	        shared.extend(normalized, raw);
	    }
	    cache.set(comp, normalized);
	    return normalized;
	}
	// Check if an incoming prop key is a declared emit event listener.
	// e.g. With `emits: { click: null }`, props named `onClick` and `onclick` are
	// both considered matched listeners.
	function isEmitListener(options, key) {
	    if (!options || !shared.isOn(key)) {
	        return false;
	    }
	    key = key.slice(2).replace(/Once$/, '');
	    return (shared.hasOwn(options, key[0].toLowerCase() + key.slice(1)) ||
	        shared.hasOwn(options, shared.hyphenate(key)) ||
	        shared.hasOwn(options, key));
	}

	/**
	 * mark the current rendering instance for asset resolution (e.g.
	 * resolveComponent, resolveDirective) during render
	 */
	let currentRenderingInstance = null;
	let currentScopeId = null;
	/**
	 * Note: rendering calls maybe nested. The function returns the parent rendering
	 * instance if present, which should be restored after the render is done:
	 *
	 * ```js
	 * const prev = setCurrentRenderingInstance(i)
	 * // ...render
	 * setCurrentRenderingInstance(prev)
	 * ```
	 */
	function setCurrentRenderingInstance(instance) {
	    const prev = currentRenderingInstance;
	    currentRenderingInstance = instance;
	    currentScopeId = (instance && instance.type.__scopeId) || null;
	    return prev;
	}
	/**
	 * Set scope id when creating hoisted vnodes.
	 * @private compiler helper
	 */
	function pushScopeId(id) {
	    currentScopeId = id;
	}
	/**
	 * Technically we no longer need this after 3.0.8 but we need to keep the same
	 * API for backwards compat w/ code generated by compilers.
	 * @private
	 */
	function popScopeId() {
	    currentScopeId = null;
	}
	/**
	 * Only for backwards compat
	 * @private
	 */
	const withScopeId = (_id) => withCtx;
	/**
	 * Wrap a slot function to memoize current rendering instance
	 * @private compiler helper
	 */
	function withCtx(fn, ctx = currentRenderingInstance, isNonScopedSlot // false only
	) {
	    if (!ctx)
	        return fn;
	    // already normalized
	    if (fn._n) {
	        return fn;
	    }
	    const renderFnWithContext = (...args) => {
	        // If a user calls a compiled slot inside a template expression (#1745), it
	        // can mess up block tracking, so by default we disable block tracking and
	        // force bail out when invoking a compiled slot (indicated by the ._d flag).
	        // This isn't necessary if rendering a compiled `<slot>`, so we flip the
	        // ._d flag off when invoking the wrapped fn inside `renderSlot`.
	        if (renderFnWithContext._d) {
	            setBlockTracking(-1);
	        }
	        const prevInstance = setCurrentRenderingInstance(ctx);
	        const res = fn(...args);
	        setCurrentRenderingInstance(prevInstance);
	        if (renderFnWithContext._d) {
	            setBlockTracking(1);
	        }
	        {
	            devtoolsComponentUpdated(ctx);
	        }
	        return res;
	    };
	    // mark normalized to avoid duplicated wrapping
	    renderFnWithContext._n = true;
	    // mark this as compiled by default
	    // this is used in vnode.ts -> normalizeChildren() to set the slot
	    // rendering flag.
	    renderFnWithContext._c = true;
	    // disable block tracking by default
	    renderFnWithContext._d = true;
	    return renderFnWithContext;
	}

	/**
	 * dev only flag to track whether $attrs was used during render.
	 * If $attrs was used during render then the warning for failed attrs
	 * fallthrough can be suppressed.
	 */
	let accessedAttrs = false;
	function markAttrsAccessed() {
	    accessedAttrs = true;
	}
	function renderComponentRoot(instance) {
	    const { type: Component, vnode, proxy, withProxy, props, propsOptions: [propsOptions], slots, attrs, emit, render, renderCache, data, setupState, ctx, inheritAttrs } = instance;
	    let result;
	    let fallthroughAttrs;
	    const prev = setCurrentRenderingInstance(instance);
	    {
	        accessedAttrs = false;
	    }
	    try {
	        if (vnode.shapeFlag & 4 /* STATEFUL_COMPONENT */) {
	            // withProxy is a proxy with a different `has` trap only for
	            // runtime-compiled render functions using `with` block.
	            const proxyToUse = withProxy || proxy;
	            result = normalizeVNode(render.call(proxyToUse, proxyToUse, renderCache, props, setupState, data, ctx));
	            fallthroughAttrs = attrs;
	        }
	        else {
	            // functional
	            const render = Component;
	            // in dev, mark attrs accessed if optional props (attrs === props)
	            if (true && attrs === props) {
	                markAttrsAccessed();
	            }
	            result = normalizeVNode(render.length > 1
	                ? render(props, true
	                    ? {
	                        get attrs() {
	                            markAttrsAccessed();
	                            return attrs;
	                        },
	                        slots,
	                        emit
	                    }
	                    : { attrs, slots, emit })
	                : render(props, null /* we know it doesn't need it */));
	            fallthroughAttrs = Component.props
	                ? attrs
	                : getFunctionalFallthrough(attrs);
	        }
	    }
	    catch (err) {
	        blockStack.length = 0;
	        handleError(err, instance, 1 /* RENDER_FUNCTION */);
	        result = createVNode(Comment);
	    }
	    // attr merging
	    // in dev mode, comments are preserved, and it's possible for a template
	    // to have comments along side the root element which makes it a fragment
	    let root = result;
	    let setRoot = undefined;
	    if (result.patchFlag > 0 &&
	        result.patchFlag & 2048 /* DEV_ROOT_FRAGMENT */) {
	        [root, setRoot] = getChildRoot(result);
	    }
	    if (fallthroughAttrs && inheritAttrs !== false) {
	        const keys = Object.keys(fallthroughAttrs);
	        const { shapeFlag } = root;
	        if (keys.length) {
	            if (shapeFlag & (1 /* ELEMENT */ | 6 /* COMPONENT */)) {
	                if (propsOptions && keys.some(shared.isModelListener)) {
	                    // If a v-model listener (onUpdate:xxx) has a corresponding declared
	                    // prop, it indicates this component expects to handle v-model and
	                    // it should not fallthrough.
	                    // related: #1543, #1643, #1989
	                    fallthroughAttrs = filterModelListeners(fallthroughAttrs, propsOptions);
	                }
	                root = cloneVNode(root, fallthroughAttrs);
	            }
	            else if (!accessedAttrs && root.type !== Comment) {
	                const allAttrs = Object.keys(attrs);
	                const eventAttrs = [];
	                const extraAttrs = [];
	                for (let i = 0, l = allAttrs.length; i < l; i++) {
	                    const key = allAttrs[i];
	                    if (shared.isOn(key)) {
	                        // ignore v-model handlers when they fail to fallthrough
	                        if (!shared.isModelListener(key)) {
	                            // remove `on`, lowercase first letter to reflect event casing
	                            // accurately
	                            eventAttrs.push(key[2].toLowerCase() + key.slice(3));
	                        }
	                    }
	                    else {
	                        extraAttrs.push(key);
	                    }
	                }
	                if (extraAttrs.length) {
	                    warn(`Extraneous non-props attributes (` +
	                        `${extraAttrs.join(', ')}) ` +
	                        `were passed to component but could not be automatically inherited ` +
	                        `because component renders fragment or text root nodes.`);
	                }
	                if (eventAttrs.length) {
	                    warn(`Extraneous non-emits event listeners (` +
	                        `${eventAttrs.join(', ')}) ` +
	                        `were passed to component but could not be automatically inherited ` +
	                        `because component renders fragment or text root nodes. ` +
	                        `If the listener is intended to be a component custom event listener only, ` +
	                        `declare it using the "emits" option.`);
	                }
	            }
	        }
	    }
	    // inherit directives
	    if (vnode.dirs) {
	        if (!isElementRoot(root)) {
	            warn(`Runtime directive used on component with non-element root node. ` +
	                `The directives will not function as intended.`);
	        }
	        // clone before mutating since the root may be a hoisted vnode
	        root = cloneVNode(root);
	        root.dirs = root.dirs ? root.dirs.concat(vnode.dirs) : vnode.dirs;
	    }
	    // inherit transition data
	    if (vnode.transition) {
	        if (!isElementRoot(root)) {
	            warn(`Component inside <Transition> renders non-element root node ` +
	                `that cannot be animated.`);
	        }
	        root.transition = vnode.transition;
	    }
	    if (setRoot) {
	        setRoot(root);
	    }
	    else {
	        result = root;
	    }
	    setCurrentRenderingInstance(prev);
	    return result;
	}
	/**
	 * dev only
	 * In dev mode, template root level comments are rendered, which turns the
	 * template into a fragment root, but we need to locate the single element
	 * root for attrs and scope id processing.
	 */
	const getChildRoot = (vnode) => {
	    const rawChildren = vnode.children;
	    const dynamicChildren = vnode.dynamicChildren;
	    const childRoot = filterSingleRoot(rawChildren);
	    if (!childRoot) {
	        return [vnode, undefined];
	    }
	    const index = rawChildren.indexOf(childRoot);
	    const dynamicIndex = dynamicChildren ? dynamicChildren.indexOf(childRoot) : -1;
	    const setRoot = (updatedRoot) => {
	        rawChildren[index] = updatedRoot;
	        if (dynamicChildren) {
	            if (dynamicIndex > -1) {
	                dynamicChildren[dynamicIndex] = updatedRoot;
	            }
	            else if (updatedRoot.patchFlag > 0) {
	                vnode.dynamicChildren = [...dynamicChildren, updatedRoot];
	            }
	        }
	    };
	    return [normalizeVNode(childRoot), setRoot];
	};
	function filterSingleRoot(children) {
	    let singleRoot;
	    for (let i = 0; i < children.length; i++) {
	        const child = children[i];
	        if (isVNode(child)) {
	            // ignore user comment
	            if (child.type !== Comment || child.children === 'v-if') {
	                if (singleRoot) {
	                    // has more than 1 non-comment child, return now
	                    return;
	                }
	                else {
	                    singleRoot = child;
	                }
	            }
	        }
	        else {
	            return;
	        }
	    }
	    return singleRoot;
	}
	const getFunctionalFallthrough = (attrs) => {
	    let res;
	    for (const key in attrs) {
	        if (key === 'class' || key === 'style' || shared.isOn(key)) {
	            (res || (res = {}))[key] = attrs[key];
	        }
	    }
	    return res;
	};
	const filterModelListeners = (attrs, props) => {
	    const res = {};
	    for (const key in attrs) {
	        if (!shared.isModelListener(key) || !(key.slice(9) in props)) {
	            res[key] = attrs[key];
	        }
	    }
	    return res;
	};
	const isElementRoot = (vnode) => {
	    return (vnode.shapeFlag & (6 /* COMPONENT */ | 1 /* ELEMENT */) ||
	        vnode.type === Comment // potential v-if branch switch
	    );
	};
	function shouldUpdateComponent(prevVNode, nextVNode, optimized) {
	    const { props: prevProps, children: prevChildren, component } = prevVNode;
	    const { props: nextProps, children: nextChildren, patchFlag } = nextVNode;
	    const emits = component.emitsOptions;
	    // Parent component's render function was hot-updated. Since this may have
	    // caused the child component's slots content to have changed, we need to
	    // force the child to update as well.
	    if ((prevChildren || nextChildren) && isHmrUpdating) {
	        return true;
	    }
	    // force child update for runtime directive or transition on component vnode.
	    if (nextVNode.dirs || nextVNode.transition) {
	        return true;
	    }
	    if (optimized && patchFlag >= 0) {
	        if (patchFlag & 1024 /* DYNAMIC_SLOTS */) {
	            // slot content that references values that might have changed,
	            // e.g. in a v-for
	            return true;
	        }
	        if (patchFlag & 16 /* FULL_PROPS */) {
	            if (!prevProps) {
	                return !!nextProps;
	            }
	            // presence of this flag indicates props are always non-null
	            return hasPropsChanged(prevProps, nextProps, emits);
	        }
	        else if (patchFlag & 8 /* PROPS */) {
	            const dynamicProps = nextVNode.dynamicProps;
	            for (let i = 0; i < dynamicProps.length; i++) {
	                const key = dynamicProps[i];
	                if (nextProps[key] !== prevProps[key] &&
	                    !isEmitListener(emits, key)) {
	                    return true;
	                }
	            }
	        }
	    }
	    else {
	        // this path is only taken by manually written render functions
	        // so presence of any children leads to a forced update
	        if (prevChildren || nextChildren) {
	            if (!nextChildren || !nextChildren.$stable) {
	                return true;
	            }
	        }
	        if (prevProps === nextProps) {
	            return false;
	        }
	        if (!prevProps) {
	            return !!nextProps;
	        }
	        if (!nextProps) {
	            return true;
	        }
	        return hasPropsChanged(prevProps, nextProps, emits);
	    }
	    return false;
	}
	function hasPropsChanged(prevProps, nextProps, emitsOptions) {
	    const nextKeys = Object.keys(nextProps);
	    if (nextKeys.length !== Object.keys(prevProps).length) {
	        return true;
	    }
	    for (let i = 0; i < nextKeys.length; i++) {
	        const key = nextKeys[i];
	        if (nextProps[key] !== prevProps[key] &&
	            !isEmitListener(emitsOptions, key)) {
	            return true;
	        }
	    }
	    return false;
	}
	function updateHOCHostEl({ vnode, parent }, el // HostNode
	) {
	    while (parent && parent.subTree === vnode) {
	        (vnode = parent.vnode).el = el;
	        parent = parent.parent;
	    }
	}

	const isSuspense = (type) => type.__isSuspense;
	// Suspense exposes a component-like API, and is treated like a component
	// in the compiler, but internally it's a special built-in type that hooks
	// directly into the renderer.
	const SuspenseImpl = {
	    name: 'Suspense',
	    // In order to make Suspense tree-shakable, we need to avoid importing it
	    // directly in the renderer. The renderer checks for the __isSuspense flag
	    // on a vnode's type and calls the `process` method, passing in renderer
	    // internals.
	    __isSuspense: true,
	    process(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized, 
	    // platform-specific impl passed from renderer
	    rendererInternals) {
	        if (n1 == null) {
	            mountSuspense(n2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized, rendererInternals);
	        }
	        else {
	            patchSuspense(n1, n2, container, anchor, parentComponent, isSVG, slotScopeIds, optimized, rendererInternals);
	        }
	    },
	    hydrate: hydrateSuspense,
	    create: createSuspenseBoundary,
	    normalize: normalizeSuspenseChildren
	};
	// Force-casted public typing for h and TSX props inference
	const Suspense = (SuspenseImpl );
	function triggerEvent(vnode, name) {
	    const eventListener = vnode.props && vnode.props[name];
	    if (shared.isFunction(eventListener)) {
	        eventListener();
	    }
	}
	function mountSuspense(vnode, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized, rendererInternals) {
	    const { p: patch, o: { createElement } } = rendererInternals;
	    const hiddenContainer = createElement('div');
	    const suspense = (vnode.suspense = createSuspenseBoundary(vnode, parentSuspense, parentComponent, container, hiddenContainer, anchor, isSVG, slotScopeIds, optimized, rendererInternals));
	    // start mounting the content subtree in an off-dom container
	    patch(null, (suspense.pendingBranch = vnode.ssContent), hiddenContainer, null, parentComponent, suspense, isSVG, slotScopeIds);
	    // now check if we have encountered any async deps
	    if (suspense.deps > 0) {
	        // has async
	        // invoke @fallback event
	        triggerEvent(vnode, 'onPending');
	        triggerEvent(vnode, 'onFallback');
	        // mount the fallback tree
	        patch(null, vnode.ssFallback, container, anchor, parentComponent, null, // fallback tree will not have suspense context
	        isSVG, slotScopeIds);
	        setActiveBranch(suspense, vnode.ssFallback);
	    }
	    else {
	        // Suspense has no async deps. Just resolve.
	        suspense.resolve();
	    }
	}
	function patchSuspense(n1, n2, container, anchor, parentComponent, isSVG, slotScopeIds, optimized, { p: patch, um: unmount, o: { createElement } }) {
	    const suspense = (n2.suspense = n1.suspense);
	    suspense.vnode = n2;
	    n2.el = n1.el;
	    const newBranch = n2.ssContent;
	    const newFallback = n2.ssFallback;
	    const { activeBranch, pendingBranch, isInFallback, isHydrating } = suspense;
	    if (pendingBranch) {
	        suspense.pendingBranch = newBranch;
	        if (isSameVNodeType(newBranch, pendingBranch)) {
	            // same root type but content may have changed.
	            patch(pendingBranch, newBranch, suspense.hiddenContainer, null, parentComponent, suspense, isSVG, slotScopeIds, optimized);
	            if (suspense.deps <= 0) {
	                suspense.resolve();
	            }
	            else if (isInFallback) {
	                patch(activeBranch, newFallback, container, anchor, parentComponent, null, // fallback tree will not have suspense context
	                isSVG, slotScopeIds, optimized);
	                setActiveBranch(suspense, newFallback);
	            }
	        }
	        else {
	            // toggled before pending tree is resolved
	            suspense.pendingId++;
	            if (isHydrating) {
	                // if toggled before hydration is finished, the current DOM tree is
	                // no longer valid. set it as the active branch so it will be unmounted
	                // when resolved
	                suspense.isHydrating = false;
	                suspense.activeBranch = pendingBranch;
	            }
	            else {
	                unmount(pendingBranch, parentComponent, suspense);
	            }
	            // increment pending ID. this is used to invalidate async callbacks
	            // reset suspense state
	            suspense.deps = 0;
	            // discard effects from pending branch
	            suspense.effects.length = 0;
	            // discard previous container
	            suspense.hiddenContainer = createElement('div');
	            if (isInFallback) {
	                // already in fallback state
	                patch(null, newBranch, suspense.hiddenContainer, null, parentComponent, suspense, isSVG, slotScopeIds, optimized);
	                if (suspense.deps <= 0) {
	                    suspense.resolve();
	                }
	                else {
	                    patch(activeBranch, newFallback, container, anchor, parentComponent, null, // fallback tree will not have suspense context
	                    isSVG, slotScopeIds, optimized);
	                    setActiveBranch(suspense, newFallback);
	                }
	            }
	            else if (activeBranch && isSameVNodeType(newBranch, activeBranch)) {
	                // toggled "back" to current active branch
	                patch(activeBranch, newBranch, container, anchor, parentComponent, suspense, isSVG, slotScopeIds, optimized);
	                // force resolve
	                suspense.resolve(true);
	            }
	            else {
	                // switched to a 3rd branch
	                patch(null, newBranch, suspense.hiddenContainer, null, parentComponent, suspense, isSVG, slotScopeIds, optimized);
	                if (suspense.deps <= 0) {
	                    suspense.resolve();
	                }
	            }
	        }
	    }
	    else {
	        if (activeBranch && isSameVNodeType(newBranch, activeBranch)) {
	            // root did not change, just normal patch
	            patch(activeBranch, newBranch, container, anchor, parentComponent, suspense, isSVG, slotScopeIds, optimized);
	            setActiveBranch(suspense, newBranch);
	        }
	        else {
	            // root node toggled
	            // invoke @pending event
	            triggerEvent(n2, 'onPending');
	            // mount pending branch in off-dom container
	            suspense.pendingBranch = newBranch;
	            suspense.pendingId++;
	            patch(null, newBranch, suspense.hiddenContainer, null, parentComponent, suspense, isSVG, slotScopeIds, optimized);
	            if (suspense.deps <= 0) {
	                // incoming branch has no async deps, resolve now.
	                suspense.resolve();
	            }
	            else {
	                const { timeout, pendingId } = suspense;
	                if (timeout > 0) {
	                    setTimeout(() => {
	                        if (suspense.pendingId === pendingId) {
	                            suspense.fallback(newFallback);
	                        }
	                    }, timeout);
	                }
	                else if (timeout === 0) {
	                    suspense.fallback(newFallback);
	                }
	            }
	        }
	    }
	}
	let hasWarned = false;
	function createSuspenseBoundary(vnode, parent, parentComponent, container, hiddenContainer, anchor, isSVG, slotScopeIds, optimized, rendererInternals, isHydrating = false) {
	    /* istanbul ignore if */
	    if (!hasWarned) {
	        hasWarned = true;
	        // @ts-ignore `console.info` cannot be null error
	        console[console.info ? 'info' : 'log'](`<Suspense> is an experimental feature and its API will likely change.`);
	    }
	    const { p: patch, m: move, um: unmount, n: next, o: { parentNode, remove } } = rendererInternals;
	    const timeout = shared.toNumber(vnode.props && vnode.props.timeout);
	    const suspense = {
	        vnode,
	        parent,
	        parentComponent,
	        isSVG,
	        container,
	        hiddenContainer,
	        anchor,
	        deps: 0,
	        pendingId: 0,
	        timeout: typeof timeout === 'number' ? timeout : -1,
	        activeBranch: null,
	        pendingBranch: null,
	        isInFallback: true,
	        isHydrating,
	        isUnmounted: false,
	        effects: [],
	        resolve(resume = false) {
	            {
	                if (!resume && !suspense.pendingBranch) {
	                    throw new Error(`suspense.resolve() is called without a pending branch.`);
	                }
	                if (suspense.isUnmounted) {
	                    throw new Error(`suspense.resolve() is called on an already unmounted suspense boundary.`);
	                }
	            }
	            const { vnode, activeBranch, pendingBranch, pendingId, effects, parentComponent, container } = suspense;
	            if (suspense.isHydrating) {
	                suspense.isHydrating = false;
	            }
	            else if (!resume) {
	                const delayEnter = activeBranch &&
	                    pendingBranch.transition &&
	                    pendingBranch.transition.mode === 'out-in';
	                if (delayEnter) {
	                    activeBranch.transition.afterLeave = () => {
	                        if (pendingId === suspense.pendingId) {
	                            move(pendingBranch, container, anchor, 0 /* ENTER */);
	                        }
	                    };
	                }
	                // this is initial anchor on mount
	                let { anchor } = suspense;
	                // unmount current active tree
	                if (activeBranch) {
	                    // if the fallback tree was mounted, it may have been moved
	                    // as part of a parent suspense. get the latest anchor for insertion
	                    anchor = next(activeBranch);
	                    unmount(activeBranch, parentComponent, suspense, true);
	                }
	                if (!delayEnter) {
	                    // move content from off-dom container to actual container
	                    move(pendingBranch, container, anchor, 0 /* ENTER */);
	                }
	            }
	            setActiveBranch(suspense, pendingBranch);
	            suspense.pendingBranch = null;
	            suspense.isInFallback = false;
	            // flush buffered effects
	            // check if there is a pending parent suspense
	            let parent = suspense.parent;
	            let hasUnresolvedAncestor = false;
	            while (parent) {
	                if (parent.pendingBranch) {
	                    // found a pending parent suspense, merge buffered post jobs
	                    // into that parent
	                    parent.effects.push(...effects);
	                    hasUnresolvedAncestor = true;
	                    break;
	                }
	                parent = parent.parent;
	            }
	            // no pending parent suspense, flush all jobs
	            if (!hasUnresolvedAncestor) {
	                queuePostFlushCb(effects);
	            }
	            suspense.effects = [];
	            // invoke @resolve event
	            triggerEvent(vnode, 'onResolve');
	        },
	        fallback(fallbackVNode) {
	            if (!suspense.pendingBranch) {
	                return;
	            }
	            const { vnode, activeBranch, parentComponent, container, isSVG } = suspense;
	            // invoke @fallback event
	            triggerEvent(vnode, 'onFallback');
	            const anchor = next(activeBranch);
	            const mountFallback = () => {
	                if (!suspense.isInFallback) {
	                    return;
	                }
	                // mount the fallback tree
	                patch(null, fallbackVNode, container, anchor, parentComponent, null, // fallback tree will not have suspense context
	                isSVG, slotScopeIds, optimized);
	                setActiveBranch(suspense, fallbackVNode);
	            };
	            const delayEnter = fallbackVNode.transition && fallbackVNode.transition.mode === 'out-in';
	            if (delayEnter) {
	                activeBranch.transition.afterLeave = mountFallback;
	            }
	            suspense.isInFallback = true;
	            // unmount current active branch
	            unmount(activeBranch, parentComponent, null, // no suspense so unmount hooks fire now
	            true // shouldRemove
	            );
	            if (!delayEnter) {
	                mountFallback();
	            }
	        },
	        move(container, anchor, type) {
	            suspense.activeBranch &&
	                move(suspense.activeBranch, container, anchor, type);
	            suspense.container = container;
	        },
	        next() {
	            return suspense.activeBranch && next(suspense.activeBranch);
	        },
	        registerDep(instance, setupRenderEffect) {
	            const isInPendingSuspense = !!suspense.pendingBranch;
	            if (isInPendingSuspense) {
	                suspense.deps++;
	            }
	            const hydratedEl = instance.vnode.el;
	            instance
	                .asyncDep.catch(err => {
	                handleError(err, instance, 0 /* SETUP_FUNCTION */);
	            })
	                .then(asyncSetupResult => {
	                // retry when the setup() promise resolves.
	                // component may have been unmounted before resolve.
	                if (instance.isUnmounted ||
	                    suspense.isUnmounted ||
	                    suspense.pendingId !== instance.suspenseId) {
	                    return;
	                }
	                // retry from this component
	                instance.asyncResolved = true;
	                const { vnode } = instance;
	                {
	                    pushWarningContext(vnode);
	                }
	                handleSetupResult(instance, asyncSetupResult, false);
	                if (hydratedEl) {
	                    // vnode may have been replaced if an update happened before the
	                    // async dep is resolved.
	                    vnode.el = hydratedEl;
	                }
	                const placeholder = !hydratedEl && instance.subTree.el;
	                setupRenderEffect(instance, vnode, 
	                // component may have been moved before resolve.
	                // if this is not a hydration, instance.subTree will be the comment
	                // placeholder.
	                parentNode(hydratedEl || instance.subTree.el), 
	                // anchor will not be used if this is hydration, so only need to
	                // consider the comment placeholder case.
	                hydratedEl ? null : next(instance.subTree), suspense, isSVG, optimized);
	                if (placeholder) {
	                    remove(placeholder);
	                }
	                updateHOCHostEl(instance, vnode.el);
	                {
	                    popWarningContext();
	                }
	                // only decrease deps count if suspense is not already resolved
	                if (isInPendingSuspense && --suspense.deps === 0) {
	                    suspense.resolve();
	                }
	            });
	        },
	        unmount(parentSuspense, doRemove) {
	            suspense.isUnmounted = true;
	            if (suspense.activeBranch) {
	                unmount(suspense.activeBranch, parentComponent, parentSuspense, doRemove);
	            }
	            if (suspense.pendingBranch) {
	                unmount(suspense.pendingBranch, parentComponent, parentSuspense, doRemove);
	            }
	        }
	    };
	    return suspense;
	}
	function hydrateSuspense(node, vnode, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized, rendererInternals, hydrateNode) {
	    /* eslint-disable no-restricted-globals */
	    const suspense = (vnode.suspense = createSuspenseBoundary(vnode, parentSuspense, parentComponent, node.parentNode, document.createElement('div'), null, isSVG, slotScopeIds, optimized, rendererInternals, true /* hydrating */));
	    // there are two possible scenarios for server-rendered suspense:
	    // - success: ssr content should be fully resolved
	    // - failure: ssr content should be the fallback branch.
	    // however, on the client we don't really know if it has failed or not
	    // attempt to hydrate the DOM assuming it has succeeded, but we still
	    // need to construct a suspense boundary first
	    const result = hydrateNode(node, (suspense.pendingBranch = vnode.ssContent), parentComponent, suspense, slotScopeIds, optimized);
	    if (suspense.deps === 0) {
	        suspense.resolve();
	    }
	    return result;
	    /* eslint-enable no-restricted-globals */
	}
	function normalizeSuspenseChildren(vnode) {
	    const { shapeFlag, children } = vnode;
	    const isSlotChildren = shapeFlag & 32 /* SLOTS_CHILDREN */;
	    vnode.ssContent = normalizeSuspenseSlot(isSlotChildren ? children.default : children);
	    vnode.ssFallback = isSlotChildren
	        ? normalizeSuspenseSlot(children.fallback)
	        : createVNode(Comment);
	}
	function normalizeSuspenseSlot(s) {
	    let block;
	    if (shared.isFunction(s)) {
	        const trackBlock = isBlockTreeEnabled && s._c;
	        if (trackBlock) {
	            // disableTracking: false
	            // allow block tracking for compiled slots
	            // (see ./componentRenderContext.ts)
	            s._d = false;
	            openBlock();
	        }
	        s = s();
	        if (trackBlock) {
	            s._d = true;
	            block = currentBlock;
	            closeBlock();
	        }
	    }
	    if (shared.isArray(s)) {
	        const singleChild = filterSingleRoot(s);
	        if (!singleChild) {
	            warn(`<Suspense> slots expect a single root node.`);
	        }
	        s = singleChild;
	    }
	    s = normalizeVNode(s);
	    if (block && !s.dynamicChildren) {
	        s.dynamicChildren = block.filter(c => c !== s);
	    }
	    return s;
	}
	function queueEffectWithSuspense(fn, suspense) {
	    if (suspense && suspense.pendingBranch) {
	        if (shared.isArray(fn)) {
	            suspense.effects.push(...fn);
	        }
	        else {
	            suspense.effects.push(fn);
	        }
	    }
	    else {
	        queuePostFlushCb(fn);
	    }
	}
	function setActiveBranch(suspense, branch) {
	    suspense.activeBranch = branch;
	    const { vnode, parentComponent } = suspense;
	    const el = (vnode.el = branch.el);
	    // in case suspense is the root node of a component,
	    // recursively update the HOC el
	    if (parentComponent && parentComponent.subTree === vnode) {
	        parentComponent.vnode.el = el;
	        updateHOCHostEl(parentComponent, el);
	    }
	}

	function provide(key, value) {
	    if (!currentInstance) {
	        {
	            warn(`provide() can only be used inside setup().`);
	        }
	    }
	    else {
	        let provides = currentInstance.provides;
	        // by default an instance inherits its parent's provides object
	        // but when it needs to provide values of its own, it creates its
	        // own provides object using parent provides object as prototype.
	        // this way in `inject` we can simply look up injections from direct
	        // parent and let the prototype chain do the work.
	        const parentProvides = currentInstance.parent && currentInstance.parent.provides;
	        if (parentProvides === provides) {
	            provides = currentInstance.provides = Object.create(parentProvides);
	        }
	        // TS doesn't allow symbol as index type
	        provides[key] = value;
	    }
	}
	function inject(key, defaultValue, treatDefaultAsFactory = false) {
	    // fallback to `currentRenderingInstance` so that this can be called in
	    // a functional component
	    const instance = currentInstance || currentRenderingInstance;
	    if (instance) {
	        // #2400
	        // to support `app.use` plugins,
	        // fallback to appContext's `provides` if the instance is at root
	        const provides = instance.parent == null
	            ? instance.vnode.appContext && instance.vnode.appContext.provides
	            : instance.parent.provides;
	        if (provides && key in provides) {
	            // TS doesn't allow symbol as index type
	            return provides[key];
	        }
	        else if (arguments.length > 1) {
	            return treatDefaultAsFactory && shared.isFunction(defaultValue)
	                ? defaultValue.call(instance.proxy)
	                : defaultValue;
	        }
	        else {
	            warn(`injection "${String(key)}" not found.`);
	        }
	    }
	    else {
	        warn(`inject() can only be used inside setup() or functional components.`);
	    }
	}

	// Simple effect.
	function watchEffect(effect, options) {
	    return doWatch(effect, null, options);
	}
	function watchPostEffect(effect, options) {
	    return doWatch(effect, null, ({ ...options, flush: 'post' }
	        ));
	}
	function watchSyncEffect(effect, options) {
	    return doWatch(effect, null, ({ ...options, flush: 'sync' }
	        ));
	}
	// initial value for watchers to trigger on undefined initial values
	const INITIAL_WATCHER_VALUE = {};
	// implementation
	function watch(source, cb, options) {
	    if (!shared.isFunction(cb)) {
	        warn(`\`watch(fn, options?)\` signature has been moved to a separate API. ` +
	            `Use \`watchEffect(fn, options?)\` instead. \`watch\` now only ` +
	            `supports \`watch(source, cb, options?) signature.`);
	    }
	    return doWatch(source, cb, options);
	}
	function doWatch(source, cb, { immediate, deep, flush, onTrack, onTrigger } = shared.EMPTY_OBJ) {
	    if (!cb) {
	        if (immediate !== undefined) {
	            warn(`watch() "immediate" option is only respected when using the ` +
	                `watch(source, callback, options?) signature.`);
	        }
	        if (deep !== undefined) {
	            warn(`watch() "deep" option is only respected when using the ` +
	                `watch(source, callback, options?) signature.`);
	        }
	    }
	    const warnInvalidSource = (s) => {
	        warn(`Invalid watch source: `, s, `A watch source can only be a getter/effect function, a ref, ` +
	            `a reactive object, or an array of these types.`);
	    };
	    const instance = currentInstance;
	    let getter;
	    let forceTrigger = false;
	    let isMultiSource = false;
	    if (reactivity$1.isRef(source)) {
	        getter = () => source.value;
	        forceTrigger = reactivity$1.isShallow(source);
	    }
	    else if (reactivity$1.isReactive(source)) {
	        getter = () => source;
	        deep = true;
	    }
	    else if (shared.isArray(source)) {
	        isMultiSource = true;
	        forceTrigger = source.some(s => reactivity$1.isReactive(s) || reactivity$1.isShallow(s));
	        getter = () => source.map(s => {
	            if (reactivity$1.isRef(s)) {
	                return s.value;
	            }
	            else if (reactivity$1.isReactive(s)) {
	                return traverse(s);
	            }
	            else if (shared.isFunction(s)) {
	                return callWithErrorHandling(s, instance, 2 /* WATCH_GETTER */);
	            }
	            else {
	                warnInvalidSource(s);
	            }
	        });
	    }
	    else if (shared.isFunction(source)) {
	        if (cb) {
	            // getter with cb
	            getter = () => callWithErrorHandling(source, instance, 2 /* WATCH_GETTER */);
	        }
	        else {
	            // no cb -> simple effect
	            getter = () => {
	                if (instance && instance.isUnmounted) {
	                    return;
	                }
	                if (cleanup) {
	                    cleanup();
	                }
	                return callWithAsyncErrorHandling(source, instance, 3 /* WATCH_CALLBACK */, [onCleanup]);
	            };
	        }
	    }
	    else {
	        getter = shared.NOOP;
	        warnInvalidSource(source);
	    }
	    if (cb && deep) {
	        const baseGetter = getter;
	        getter = () => traverse(baseGetter());
	    }
	    let cleanup;
	    let onCleanup = (fn) => {
	        cleanup = effect.onStop = () => {
	            callWithErrorHandling(fn, instance, 4 /* WATCH_CLEANUP */);
	        };
	    };
	    // in SSR there is no need to setup an actual effect, and it should be noop
	    // unless it's eager
	    if (isInSSRComponentSetup) {
	        // we will also not call the invalidate callback (+ runner is not set up)
	        onCleanup = shared.NOOP;
	        if (!cb) {
	            getter();
	        }
	        else if (immediate) {
	            callWithAsyncErrorHandling(cb, instance, 3 /* WATCH_CALLBACK */, [
	                getter(),
	                isMultiSource ? [] : undefined,
	                onCleanup
	            ]);
	        }
	        return shared.NOOP;
	    }
	    let oldValue = isMultiSource ? [] : INITIAL_WATCHER_VALUE;
	    const job = () => {
	        if (!effect.active) {
	            return;
	        }
	        if (cb) {
	            // watch(source, cb)
	            const newValue = effect.run();
	            if (deep ||
	                forceTrigger ||
	                (isMultiSource
	                    ? newValue.some((v, i) => shared.hasChanged(v, oldValue[i]))
	                    : shared.hasChanged(newValue, oldValue)) ||
	                (false  )) {
	                // cleanup before running cb again
	                if (cleanup) {
	                    cleanup();
	                }
	                callWithAsyncErrorHandling(cb, instance, 3 /* WATCH_CALLBACK */, [
	                    newValue,
	                    // pass undefined as the old value when it's changed for the first time
	                    oldValue === INITIAL_WATCHER_VALUE ? undefined : oldValue,
	                    onCleanup
	                ]);
	                oldValue = newValue;
	            }
	        }
	        else {
	            // watchEffect
	            effect.run();
	        }
	    };
	    // important: mark the job as a watcher callback so that scheduler knows
	    // it is allowed to self-trigger (#1727)
	    job.allowRecurse = !!cb;
	    let scheduler;
	    if (flush === 'sync') {
	        scheduler = job; // the scheduler function gets called directly
	    }
	    else if (flush === 'post') {
	        scheduler = () => queuePostRenderEffect(job, instance && instance.suspense);
	    }
	    else {
	        // default: 'pre'
	        scheduler = () => queuePreFlushCb(job);
	    }
	    const effect = new reactivity$1.ReactiveEffect(getter, scheduler);
	    {
	        effect.onTrack = onTrack;
	        effect.onTrigger = onTrigger;
	    }
	    // initial run
	    if (cb) {
	        if (immediate) {
	            job();
	        }
	        else {
	            oldValue = effect.run();
	        }
	    }
	    else if (flush === 'post') {
	        queuePostRenderEffect(effect.run.bind(effect), instance && instance.suspense);
	    }
	    else {
	        effect.run();
	    }
	    return () => {
	        effect.stop();
	        if (instance && instance.scope) {
	            shared.remove(instance.scope.effects, effect);
	        }
	    };
	}
	// this.$watch
	function instanceWatch(source, value, options) {
	    const publicThis = this.proxy;
	    const getter = shared.isString(source)
	        ? source.includes('.')
	            ? createPathGetter(publicThis, source)
	            : () => publicThis[source]
	        : source.bind(publicThis, publicThis);
	    let cb;
	    if (shared.isFunction(value)) {
	        cb = value;
	    }
	    else {
	        cb = value.handler;
	        options = value;
	    }
	    const cur = currentInstance;
	    setCurrentInstance(this);
	    const res = doWatch(getter, cb.bind(publicThis), options);
	    if (cur) {
	        setCurrentInstance(cur);
	    }
	    else {
	        unsetCurrentInstance();
	    }
	    return res;
	}
	function createPathGetter(ctx, path) {
	    const segments = path.split('.');
	    return () => {
	        let cur = ctx;
	        for (let i = 0; i < segments.length && cur; i++) {
	            cur = cur[segments[i]];
	        }
	        return cur;
	    };
	}
	function traverse(value, seen) {
	    if (!shared.isObject(value) || value["__v_skip" /* SKIP */]) {
	        return value;
	    }
	    seen = seen || new Set();
	    if (seen.has(value)) {
	        return value;
	    }
	    seen.add(value);
	    if (reactivity$1.isRef(value)) {
	        traverse(value.value, seen);
	    }
	    else if (shared.isArray(value)) {
	        for (let i = 0; i < value.length; i++) {
	            traverse(value[i], seen);
	        }
	    }
	    else if (shared.isSet(value) || shared.isMap(value)) {
	        value.forEach((v) => {
	            traverse(v, seen);
	        });
	    }
	    else if (shared.isPlainObject(value)) {
	        for (const key in value) {
	            traverse(value[key], seen);
	        }
	    }
	    return value;
	}

	function useTransitionState() {
	    const state = {
	        isMounted: false,
	        isLeaving: false,
	        isUnmounting: false,
	        leavingVNodes: new Map()
	    };
	    onMounted(() => {
	        state.isMounted = true;
	    });
	    onBeforeUnmount(() => {
	        state.isUnmounting = true;
	    });
	    return state;
	}
	const TransitionHookValidator = [Function, Array];
	const BaseTransitionImpl = {
	    name: `BaseTransition`,
	    props: {
	        mode: String,
	        appear: Boolean,
	        persisted: Boolean,
	        // enter
	        onBeforeEnter: TransitionHookValidator,
	        onEnter: TransitionHookValidator,
	        onAfterEnter: TransitionHookValidator,
	        onEnterCancelled: TransitionHookValidator,
	        // leave
	        onBeforeLeave: TransitionHookValidator,
	        onLeave: TransitionHookValidator,
	        onAfterLeave: TransitionHookValidator,
	        onLeaveCancelled: TransitionHookValidator,
	        // appear
	        onBeforeAppear: TransitionHookValidator,
	        onAppear: TransitionHookValidator,
	        onAfterAppear: TransitionHookValidator,
	        onAppearCancelled: TransitionHookValidator
	    },
	    setup(props, { slots }) {
	        const instance = getCurrentInstance();
	        const state = useTransitionState();
	        let prevTransitionKey;
	        return () => {
	            const children = slots.default && getTransitionRawChildren(slots.default(), true);
	            if (!children || !children.length) {
	                return;
	            }
	            let child = children[0];
	            if (children.length > 1) {
	                let hasFound = false;
	                // locate first non-comment child
	                for (const c of children) {
	                    if (c.type !== Comment) {
	                        if (hasFound) {
	                            // warn more than one non-comment child
	                            warn('<transition> can only be used on a single element or component. ' +
	                                'Use <transition-group> for lists.');
	                            break;
	                        }
	                        child = c;
	                        hasFound = true;
	                    }
	                }
	            }
	            // there's no need to track reactivity for these props so use the raw
	            // props for a bit better perf
	            const rawProps = reactivity$1.toRaw(props);
	            const { mode } = rawProps;
	            // check mode
	            if (mode &&
	                mode !== 'in-out' &&
	                mode !== 'out-in' &&
	                mode !== 'default') {
	                warn(`invalid <transition> mode: ${mode}`);
	            }
	            if (state.isLeaving) {
	                return emptyPlaceholder(child);
	            }
	            // in the case of <transition><keep-alive/></transition>, we need to
	            // compare the type of the kept-alive children.
	            const innerChild = getKeepAliveChild(child);
	            if (!innerChild) {
	                return emptyPlaceholder(child);
	            }
	            const enterHooks = resolveTransitionHooks(innerChild, rawProps, state, instance);
	            setTransitionHooks(innerChild, enterHooks);
	            const oldChild = instance.subTree;
	            const oldInnerChild = oldChild && getKeepAliveChild(oldChild);
	            let transitionKeyChanged = false;
	            const { getTransitionKey } = innerChild.type;
	            if (getTransitionKey) {
	                const key = getTransitionKey();
	                if (prevTransitionKey === undefined) {
	                    prevTransitionKey = key;
	                }
	                else if (key !== prevTransitionKey) {
	                    prevTransitionKey = key;
	                    transitionKeyChanged = true;
	                }
	            }
	            // handle mode
	            if (oldInnerChild &&
	                oldInnerChild.type !== Comment &&
	                (!isSameVNodeType(innerChild, oldInnerChild) || transitionKeyChanged)) {
	                const leavingHooks = resolveTransitionHooks(oldInnerChild, rawProps, state, instance);
	                // update old tree's hooks in case of dynamic transition
	                setTransitionHooks(oldInnerChild, leavingHooks);
	                // switching between different views
	                if (mode === 'out-in') {
	                    state.isLeaving = true;
	                    // return placeholder node and queue update when leave finishes
	                    leavingHooks.afterLeave = () => {
	                        state.isLeaving = false;
	                        instance.update();
	                    };
	                    return emptyPlaceholder(child);
	                }
	                else if (mode === 'in-out' && innerChild.type !== Comment) {
	                    leavingHooks.delayLeave = (el, earlyRemove, delayedLeave) => {
	                        const leavingVNodesCache = getLeavingNodesForType(state, oldInnerChild);
	                        leavingVNodesCache[String(oldInnerChild.key)] = oldInnerChild;
	                        // early removal callback
	                        el._leaveCb = () => {
	                            earlyRemove();
	                            el._leaveCb = undefined;
	                            delete enterHooks.delayedLeave;
	                        };
	                        enterHooks.delayedLeave = delayedLeave;
	                    };
	                }
	            }
	            return child;
	        };
	    }
	};
	// export the public type for h/tsx inference
	// also to avoid inline import() in generated d.ts files
	const BaseTransition = BaseTransitionImpl;
	function getLeavingNodesForType(state, vnode) {
	    const { leavingVNodes } = state;
	    let leavingVNodesCache = leavingVNodes.get(vnode.type);
	    if (!leavingVNodesCache) {
	        leavingVNodesCache = Object.create(null);
	        leavingVNodes.set(vnode.type, leavingVNodesCache);
	    }
	    return leavingVNodesCache;
	}
	// The transition hooks are attached to the vnode as vnode.transition
	// and will be called at appropriate timing in the renderer.
	function resolveTransitionHooks(vnode, props, state, instance) {
	    const { appear, mode, persisted = false, onBeforeEnter, onEnter, onAfterEnter, onEnterCancelled, onBeforeLeave, onLeave, onAfterLeave, onLeaveCancelled, onBeforeAppear, onAppear, onAfterAppear, onAppearCancelled } = props;
	    const key = String(vnode.key);
	    const leavingVNodesCache = getLeavingNodesForType(state, vnode);
	    const callHook = (hook, args) => {
	        hook &&
	            callWithAsyncErrorHandling(hook, instance, 9 /* TRANSITION_HOOK */, args);
	    };
	    const callAsyncHook = (hook, args) => {
	        const done = args[1];
	        callHook(hook, args);
	        if (shared.isArray(hook)) {
	            if (hook.every(hook => hook.length <= 1))
	                done();
	        }
	        else if (hook.length <= 1) {
	            done();
	        }
	    };
	    const hooks = {
	        mode,
	        persisted,
	        beforeEnter(el) {
	            let hook = onBeforeEnter;
	            if (!state.isMounted) {
	                if (appear) {
	                    hook = onBeforeAppear || onBeforeEnter;
	                }
	                else {
	                    return;
	                }
	            }
	            // for same element (v-show)
	            if (el._leaveCb) {
	                el._leaveCb(true /* cancelled */);
	            }
	            // for toggled element with same key (v-if)
	            const leavingVNode = leavingVNodesCache[key];
	            if (leavingVNode &&
	                isSameVNodeType(vnode, leavingVNode) &&
	                leavingVNode.el._leaveCb) {
	                // force early removal (not cancelled)
	                leavingVNode.el._leaveCb();
	            }
	            callHook(hook, [el]);
	        },
	        enter(el) {
	            let hook = onEnter;
	            let afterHook = onAfterEnter;
	            let cancelHook = onEnterCancelled;
	            if (!state.isMounted) {
	                if (appear) {
	                    hook = onAppear || onEnter;
	                    afterHook = onAfterAppear || onAfterEnter;
	                    cancelHook = onAppearCancelled || onEnterCancelled;
	                }
	                else {
	                    return;
	                }
	            }
	            let called = false;
	            const done = (el._enterCb = (cancelled) => {
	                if (called)
	                    return;
	                called = true;
	                if (cancelled) {
	                    callHook(cancelHook, [el]);
	                }
	                else {
	                    callHook(afterHook, [el]);
	                }
	                if (hooks.delayedLeave) {
	                    hooks.delayedLeave();
	                }
	                el._enterCb = undefined;
	            });
	            if (hook) {
	                callAsyncHook(hook, [el, done]);
	            }
	            else {
	                done();
	            }
	        },
	        leave(el, remove) {
	            const key = String(vnode.key);
	            if (el._enterCb) {
	                el._enterCb(true /* cancelled */);
	            }
	            if (state.isUnmounting) {
	                return remove();
	            }
	            callHook(onBeforeLeave, [el]);
	            let called = false;
	            const done = (el._leaveCb = (cancelled) => {
	                if (called)
	                    return;
	                called = true;
	                remove();
	                if (cancelled) {
	                    callHook(onLeaveCancelled, [el]);
	                }
	                else {
	                    callHook(onAfterLeave, [el]);
	                }
	                el._leaveCb = undefined;
	                if (leavingVNodesCache[key] === vnode) {
	                    delete leavingVNodesCache[key];
	                }
	            });
	            leavingVNodesCache[key] = vnode;
	            if (onLeave) {
	                callAsyncHook(onLeave, [el, done]);
	            }
	            else {
	                done();
	            }
	        },
	        clone(vnode) {
	            return resolveTransitionHooks(vnode, props, state, instance);
	        }
	    };
	    return hooks;
	}
	// the placeholder really only handles one special case: KeepAlive
	// in the case of a KeepAlive in a leave phase we need to return a KeepAlive
	// placeholder with empty content to avoid the KeepAlive instance from being
	// unmounted.
	function emptyPlaceholder(vnode) {
	    if (isKeepAlive(vnode)) {
	        vnode = cloneVNode(vnode);
	        vnode.children = null;
	        return vnode;
	    }
	}
	function getKeepAliveChild(vnode) {
	    return isKeepAlive(vnode)
	        ? vnode.children
	            ? vnode.children[0]
	            : undefined
	        : vnode;
	}
	function setTransitionHooks(vnode, hooks) {
	    if (vnode.shapeFlag & 6 /* COMPONENT */ && vnode.component) {
	        setTransitionHooks(vnode.component.subTree, hooks);
	    }
	    else if (vnode.shapeFlag & 128 /* SUSPENSE */) {
	        vnode.ssContent.transition = hooks.clone(vnode.ssContent);
	        vnode.ssFallback.transition = hooks.clone(vnode.ssFallback);
	    }
	    else {
	        vnode.transition = hooks;
	    }
	}
	function getTransitionRawChildren(children, keepComment = false, parentKey) {
	    let ret = [];
	    let keyedFragmentCount = 0;
	    for (let i = 0; i < children.length; i++) {
	        let child = children[i];
	        // #5360 inherit parent key in case of <template v-for>
	        const key = parentKey == null
	            ? child.key
	            : String(parentKey) + String(child.key != null ? child.key : i);
	        // handle fragment children case, e.g. v-for
	        if (child.type === Fragment) {
	            if (child.patchFlag & 128 /* KEYED_FRAGMENT */)
	                keyedFragmentCount++;
	            ret = ret.concat(getTransitionRawChildren(child.children, keepComment, key));
	        }
	        // comment placeholders should be skipped, e.g. v-if
	        else if (keepComment || child.type !== Comment) {
	            ret.push(key != null ? cloneVNode(child, { key }) : child);
	        }
	    }
	    // #1126 if a transition children list contains multiple sub fragments, these
	    // fragments will be merged into a flat children array. Since each v-for
	    // fragment may contain different static bindings inside, we need to de-op
	    // these children to force full diffs to ensure correct behavior.
	    if (keyedFragmentCount > 1) {
	        for (let i = 0; i < ret.length; i++) {
	            ret[i].patchFlag = -2 /* BAIL */;
	        }
	    }
	    return ret;
	}

	// implementation, close to no-op
	function defineComponent(options) {
	    return shared.isFunction(options) ? { setup: options, name: options.name } : options;
	}

	const isAsyncWrapper = (i) => !!i.type.__asyncLoader;
	function defineAsyncComponent(source) {
	    if (shared.isFunction(source)) {
	        source = { loader: source };
	    }
	    const { loader, loadingComponent, errorComponent, delay = 200, timeout, // undefined = never times out
	    suspensible = true, onError: userOnError } = source;
	    let pendingRequest = null;
	    let resolvedComp;
	    let retries = 0;
	    const retry = () => {
	        retries++;
	        pendingRequest = null;
	        return load();
	    };
	    const load = () => {
	        let thisRequest;
	        return (pendingRequest ||
	            (thisRequest = pendingRequest =
	                loader()
	                    .catch(err => {
	                    err = err instanceof Error ? err : new Error(String(err));
	                    if (userOnError) {
	                        return new Promise((resolve, reject) => {
	                            const userRetry = () => resolve(retry());
	                            const userFail = () => reject(err);
	                            userOnError(err, userRetry, userFail, retries + 1);
	                        });
	                    }
	                    else {
	                        throw err;
	                    }
	                })
	                    .then((comp) => {
	                    if (thisRequest !== pendingRequest && pendingRequest) {
	                        return pendingRequest;
	                    }
	                    if (!comp) {
	                        warn(`Async component loader resolved to undefined. ` +
	                            `If you are using retry(), make sure to return its return value.`);
	                    }
	                    // interop module default
	                    if (comp &&
	                        (comp.__esModule || comp[Symbol.toStringTag] === 'Module')) {
	                        comp = comp.default;
	                    }
	                    if (comp && !shared.isObject(comp) && !shared.isFunction(comp)) {
	                        throw new Error(`Invalid async component load result: ${comp}`);
	                    }
	                    resolvedComp = comp;
	                    return comp;
	                })));
	    };
	    return defineComponent({
	        name: 'AsyncComponentWrapper',
	        __asyncLoader: load,
	        get __asyncResolved() {
	            return resolvedComp;
	        },
	        setup() {
	            const instance = currentInstance;
	            // already resolved
	            if (resolvedComp) {
	                return () => createInnerComp(resolvedComp, instance);
	            }
	            const onError = (err) => {
	                pendingRequest = null;
	                handleError(err, instance, 13 /* ASYNC_COMPONENT_LOADER */, !errorComponent /* do not throw in dev if user provided error component */);
	            };
	            // suspense-controlled or SSR.
	            if ((suspensible && instance.suspense) ||
	                (isInSSRComponentSetup)) {
	                return load()
	                    .then(comp => {
	                    return () => createInnerComp(comp, instance);
	                })
	                    .catch(err => {
	                    onError(err);
	                    return () => errorComponent
	                        ? createVNode(errorComponent, {
	                            error: err
	                        })
	                        : null;
	                });
	            }
	            const loaded = reactivity$1.ref(false);
	            const error = reactivity$1.ref();
	            const delayed = reactivity$1.ref(!!delay);
	            if (delay) {
	                setTimeout(() => {
	                    delayed.value = false;
	                }, delay);
	            }
	            if (timeout != null) {
	                setTimeout(() => {
	                    if (!loaded.value && !error.value) {
	                        const err = new Error(`Async component timed out after ${timeout}ms.`);
	                        onError(err);
	                        error.value = err;
	                    }
	                }, timeout);
	            }
	            load()
	                .then(() => {
	                loaded.value = true;
	                if (instance.parent && isKeepAlive(instance.parent.vnode)) {
	                    // parent is keep-alive, force update so the loaded component's
	                    // name is taken into account
	                    queueJob(instance.parent.update);
	                }
	            })
	                .catch(err => {
	                onError(err);
	                error.value = err;
	            });
	            return () => {
	                if (loaded.value && resolvedComp) {
	                    return createInnerComp(resolvedComp, instance);
	                }
	                else if (error.value && errorComponent) {
	                    return createVNode(errorComponent, {
	                        error: error.value
	                    });
	                }
	                else if (loadingComponent && !delayed.value) {
	                    return createVNode(loadingComponent);
	                }
	            };
	        }
	    });
	}
	function createInnerComp(comp, { vnode: { ref, props, children, shapeFlag }, parent }) {
	    const vnode = createVNode(comp, props, children);
	    // ensure inner component inherits the async wrapper's ref owner
	    vnode.ref = ref;
	    return vnode;
	}

	const isKeepAlive = (vnode) => vnode.type.__isKeepAlive;
	const KeepAliveImpl = {
	    name: `KeepAlive`,
	    // Marker for special handling inside the renderer. We are not using a ===
	    // check directly on KeepAlive in the renderer, because importing it directly
	    // would prevent it from being tree-shaken.
	    __isKeepAlive: true,
	    props: {
	        include: [String, RegExp, Array],
	        exclude: [String, RegExp, Array],
	        max: [String, Number]
	    },
	    setup(props, { slots }) {
	        const instance = getCurrentInstance();
	        // KeepAlive communicates with the instantiated renderer via the
	        // ctx where the renderer passes in its internals,
	        // and the KeepAlive instance exposes activate/deactivate implementations.
	        // The whole point of this is to avoid importing KeepAlive directly in the
	        // renderer to facilitate tree-shaking.
	        const sharedContext = instance.ctx;
	        // if the internal renderer is not registered, it indicates that this is server-side rendering,
	        // for KeepAlive, we just need to render its children
	        if (!sharedContext.renderer) {
	            return () => {
	                const children = slots.default && slots.default();
	                return children && children.length === 1 ? children[0] : children;
	            };
	        }
	        const cache = new Map();
	        const keys = new Set();
	        let current = null;
	        {
	            instance.__v_cache = cache;
	        }
	        const parentSuspense = instance.suspense;
	        const { renderer: { p: patch, m: move, um: _unmount, o: { createElement } } } = sharedContext;
	        const storageContainer = createElement('div');
	        sharedContext.activate = (vnode, container, anchor, isSVG, optimized) => {
	            const instance = vnode.component;
	            move(vnode, container, anchor, 0 /* ENTER */, parentSuspense);
	            // in case props have changed
	            patch(instance.vnode, vnode, container, anchor, instance, parentSuspense, isSVG, vnode.slotScopeIds, optimized);
	            queuePostRenderEffect(() => {
	                instance.isDeactivated = false;
	                if (instance.a) {
	                    shared.invokeArrayFns(instance.a);
	                }
	                const vnodeHook = vnode.props && vnode.props.onVnodeMounted;
	                if (vnodeHook) {
	                    invokeVNodeHook(vnodeHook, instance.parent, vnode);
	                }
	            }, parentSuspense);
	            {
	                // Update components tree
	                devtoolsComponentAdded(instance);
	            }
	        };
	        sharedContext.deactivate = (vnode) => {
	            const instance = vnode.component;
	            move(vnode, storageContainer, null, 1 /* LEAVE */, parentSuspense);
	            queuePostRenderEffect(() => {
	                if (instance.da) {
	                    shared.invokeArrayFns(instance.da);
	                }
	                const vnodeHook = vnode.props && vnode.props.onVnodeUnmounted;
	                if (vnodeHook) {
	                    invokeVNodeHook(vnodeHook, instance.parent, vnode);
	                }
	                instance.isDeactivated = true;
	            }, parentSuspense);
	            {
	                // Update components tree
	                devtoolsComponentAdded(instance);
	            }
	        };
	        function unmount(vnode) {
	            // reset the shapeFlag so it can be properly unmounted
	            resetShapeFlag(vnode);
	            _unmount(vnode, instance, parentSuspense, true);
	        }
	        function pruneCache(filter) {
	            cache.forEach((vnode, key) => {
	                const name = getComponentName(vnode.type);
	                if (name && (!filter || !filter(name))) {
	                    pruneCacheEntry(key);
	                }
	            });
	        }
	        function pruneCacheEntry(key) {
	            const cached = cache.get(key);
	            if (!current || cached.type !== current.type) {
	                unmount(cached);
	            }
	            else if (current) {
	                // current active instance should no longer be kept-alive.
	                // we can't unmount it now but it might be later, so reset its flag now.
	                resetShapeFlag(current);
	            }
	            cache.delete(key);
	            keys.delete(key);
	        }
	        // prune cache on include/exclude prop change
	        watch(() => [props.include, props.exclude], ([include, exclude]) => {
	            include && pruneCache(name => matches(include, name));
	            exclude && pruneCache(name => !matches(exclude, name));
	        }, 
	        // prune post-render after `current` has been updated
	        { flush: 'post', deep: true });
	        // cache sub tree after render
	        let pendingCacheKey = null;
	        const cacheSubtree = () => {
	            // fix #1621, the pendingCacheKey could be 0
	            if (pendingCacheKey != null) {
	                cache.set(pendingCacheKey, getInnerChild(instance.subTree));
	            }
	        };
	        onMounted(cacheSubtree);
	        onUpdated(cacheSubtree);
	        onBeforeUnmount(() => {
	            cache.forEach(cached => {
	                const { subTree, suspense } = instance;
	                const vnode = getInnerChild(subTree);
	                if (cached.type === vnode.type) {
	                    // current instance will be unmounted as part of keep-alive's unmount
	                    resetShapeFlag(vnode);
	                    // but invoke its deactivated hook here
	                    const da = vnode.component.da;
	                    da && queuePostRenderEffect(da, suspense);
	                    return;
	                }
	                unmount(cached);
	            });
	        });
	        return () => {
	            pendingCacheKey = null;
	            if (!slots.default) {
	                return null;
	            }
	            const children = slots.default();
	            const rawVNode = children[0];
	            if (children.length > 1) {
	                {
	                    warn(`KeepAlive should contain exactly one component child.`);
	                }
	                current = null;
	                return children;
	            }
	            else if (!isVNode(rawVNode) ||
	                (!(rawVNode.shapeFlag & 4 /* STATEFUL_COMPONENT */) &&
	                    !(rawVNode.shapeFlag & 128 /* SUSPENSE */))) {
	                current = null;
	                return rawVNode;
	            }
	            let vnode = getInnerChild(rawVNode);
	            const comp = vnode.type;
	            // for async components, name check should be based in its loaded
	            // inner component if available
	            const name = getComponentName(isAsyncWrapper(vnode)
	                ? vnode.type.__asyncResolved || {}
	                : comp);
	            const { include, exclude, max } = props;
	            if ((include && (!name || !matches(include, name))) ||
	                (exclude && name && matches(exclude, name))) {
	                current = vnode;
	                return rawVNode;
	            }
	            const key = vnode.key == null ? comp : vnode.key;
	            const cachedVNode = cache.get(key);
	            // clone vnode if it's reused because we are going to mutate it
	            if (vnode.el) {
	                vnode = cloneVNode(vnode);
	                if (rawVNode.shapeFlag & 128 /* SUSPENSE */) {
	                    rawVNode.ssContent = vnode;
	                }
	            }
	            // #1513 it's possible for the returned vnode to be cloned due to attr
	            // fallthrough or scopeId, so the vnode here may not be the final vnode
	            // that is mounted. Instead of caching it directly, we store the pending
	            // key and cache `instance.subTree` (the normalized vnode) in
	            // beforeMount/beforeUpdate hooks.
	            pendingCacheKey = key;
	            if (cachedVNode) {
	                // copy over mounted state
	                vnode.el = cachedVNode.el;
	                vnode.component = cachedVNode.component;
	                if (vnode.transition) {
	                    // recursively update transition hooks on subTree
	                    setTransitionHooks(vnode, vnode.transition);
	                }
	                // avoid vnode being mounted as fresh
	                vnode.shapeFlag |= 512 /* COMPONENT_KEPT_ALIVE */;
	                // make this key the freshest
	                keys.delete(key);
	                keys.add(key);
	            }
	            else {
	                keys.add(key);
	                // prune oldest entry
	                if (max && keys.size > parseInt(max, 10)) {
	                    pruneCacheEntry(keys.values().next().value);
	                }
	            }
	            // avoid vnode being unmounted
	            vnode.shapeFlag |= 256 /* COMPONENT_SHOULD_KEEP_ALIVE */;
	            current = vnode;
	            return isSuspense(rawVNode.type) ? rawVNode : vnode;
	        };
	    }
	};
	// export the public type for h/tsx inference
	// also to avoid inline import() in generated d.ts files
	const KeepAlive = KeepAliveImpl;
	function matches(pattern, name) {
	    if (shared.isArray(pattern)) {
	        return pattern.some((p) => matches(p, name));
	    }
	    else if (shared.isString(pattern)) {
	        return pattern.split(',').includes(name);
	    }
	    else if (pattern.test) {
	        return pattern.test(name);
	    }
	    /* istanbul ignore next */
	    return false;
	}
	function onActivated(hook, target) {
	    registerKeepAliveHook(hook, "a" /* ACTIVATED */, target);
	}
	function onDeactivated(hook, target) {
	    registerKeepAliveHook(hook, "da" /* DEACTIVATED */, target);
	}
	function registerKeepAliveHook(hook, type, target = currentInstance) {
	    // cache the deactivate branch check wrapper for injected hooks so the same
	    // hook can be properly deduped by the scheduler. "__wdc" stands for "with
	    // deactivation check".
	    const wrappedHook = hook.__wdc ||
	        (hook.__wdc = () => {
	            // only fire the hook if the target instance is NOT in a deactivated branch.
	            let current = target;
	            while (current) {
	                if (current.isDeactivated) {
	                    return;
	                }
	                current = current.parent;
	            }
	            return hook();
	        });
	    injectHook(type, wrappedHook, target);
	    // In addition to registering it on the target instance, we walk up the parent
	    // chain and register it on all ancestor instances that are keep-alive roots.
	    // This avoids the need to walk the entire component tree when invoking these
	    // hooks, and more importantly, avoids the need to track child components in
	    // arrays.
	    if (target) {
	        let current = target.parent;
	        while (current && current.parent) {
	            if (isKeepAlive(current.parent.vnode)) {
	                injectToKeepAliveRoot(wrappedHook, type, target, current);
	            }
	            current = current.parent;
	        }
	    }
	}
	function injectToKeepAliveRoot(hook, type, target, keepAliveRoot) {
	    // injectHook wraps the original for error handling, so make sure to remove
	    // the wrapped version.
	    const injected = injectHook(type, hook, keepAliveRoot, true /* prepend */);
	    onUnmounted(() => {
	        shared.remove(keepAliveRoot[type], injected);
	    }, target);
	}
	function resetShapeFlag(vnode) {
	    let shapeFlag = vnode.shapeFlag;
	    if (shapeFlag & 256 /* COMPONENT_SHOULD_KEEP_ALIVE */) {
	        shapeFlag -= 256 /* COMPONENT_SHOULD_KEEP_ALIVE */;
	    }
	    if (shapeFlag & 512 /* COMPONENT_KEPT_ALIVE */) {
	        shapeFlag -= 512 /* COMPONENT_KEPT_ALIVE */;
	    }
	    vnode.shapeFlag = shapeFlag;
	}
	function getInnerChild(vnode) {
	    return vnode.shapeFlag & 128 /* SUSPENSE */ ? vnode.ssContent : vnode;
	}

	function injectHook(type, hook, target = currentInstance, prepend = false) {
	    if (target) {
	        const hooks = target[type] || (target[type] = []);
	        // cache the error handling wrapper for injected hooks so the same hook
	        // can be properly deduped by the scheduler. "__weh" stands for "with error
	        // handling".
	        const wrappedHook = hook.__weh ||
	            (hook.__weh = (...args) => {
	                if (target.isUnmounted) {
	                    return;
	                }
	                // disable tracking inside all lifecycle hooks
	                // since they can potentially be called inside effects.
	                reactivity$1.pauseTracking();
	                // Set currentInstance during hook invocation.
	                // This assumes the hook does not synchronously trigger other hooks, which
	                // can only be false when the user does something really funky.
	                setCurrentInstance(target);
	                const res = callWithAsyncErrorHandling(hook, target, type, args);
	                unsetCurrentInstance();
	                reactivity$1.resetTracking();
	                return res;
	            });
	        if (prepend) {
	            hooks.unshift(wrappedHook);
	        }
	        else {
	            hooks.push(wrappedHook);
	        }
	        return wrappedHook;
	    }
	    else {
	        const apiName = shared.toHandlerKey(ErrorTypeStrings[type].replace(/ hook$/, ''));
	        warn(`${apiName} is called when there is no active component instance to be ` +
	            `associated with. ` +
	            `Lifecycle injection APIs can only be used during execution of setup().` +
	            (` If you are using async setup(), make sure to register lifecycle ` +
	                    `hooks before the first await statement.`
	                ));
	    }
	}
	const createHook = (lifecycle) => (hook, target = currentInstance) => 
	// post-create lifecycle registrations are noops during SSR (except for serverPrefetch)
	(!isInSSRComponentSetup || lifecycle === "sp" /* SERVER_PREFETCH */) &&
	    injectHook(lifecycle, hook, target);
	const onBeforeMount = createHook("bm" /* BEFORE_MOUNT */);
	const onMounted = createHook("m" /* MOUNTED */);
	const onBeforeUpdate = createHook("bu" /* BEFORE_UPDATE */);
	const onUpdated = createHook("u" /* UPDATED */);
	const onBeforeUnmount = createHook("bum" /* BEFORE_UNMOUNT */);
	const onUnmounted = createHook("um" /* UNMOUNTED */);
	const onServerPrefetch = createHook("sp" /* SERVER_PREFETCH */);
	const onRenderTriggered = createHook("rtg" /* RENDER_TRIGGERED */);
	const onRenderTracked = createHook("rtc" /* RENDER_TRACKED */);
	function onErrorCaptured(hook, target = currentInstance) {
	    injectHook("ec" /* ERROR_CAPTURED */, hook, target);
	}

	/**
	Runtime helper for applying directives to a vnode. Example usage:

	const comp = resolveComponent('comp')
	const foo = resolveDirective('foo')
	const bar = resolveDirective('bar')

	return withDirectives(h(comp), [
	  [foo, this.x],
	  [bar, this.y]
	])
	*/
	function validateDirectiveName(name) {
	    if (shared.isBuiltInDirective(name)) {
	        warn('Do not use built-in directive ids as custom directive id: ' + name);
	    }
	}
	/**
	 * Adds directives to a VNode.
	 */
	function withDirectives(vnode, directives) {
	    const internalInstance = currentRenderingInstance;
	    if (internalInstance === null) {
	        warn(`withDirectives can only be used inside render functions.`);
	        return vnode;
	    }
	    const instance = getExposeProxy(internalInstance) ||
	        internalInstance.proxy;
	    const bindings = vnode.dirs || (vnode.dirs = []);
	    for (let i = 0; i < directives.length; i++) {
	        let [dir, value, arg, modifiers = shared.EMPTY_OBJ] = directives[i];
	        if (shared.isFunction(dir)) {
	            dir = {
	                mounted: dir,
	                updated: dir
	            };
	        }
	        if (dir.deep) {
	            traverse(value);
	        }
	        bindings.push({
	            dir,
	            instance,
	            value,
	            oldValue: void 0,
	            arg,
	            modifiers
	        });
	    }
	    return vnode;
	}
	function invokeDirectiveHook(vnode, prevVNode, instance, name) {
	    const bindings = vnode.dirs;
	    const oldBindings = prevVNode && prevVNode.dirs;
	    for (let i = 0; i < bindings.length; i++) {
	        const binding = bindings[i];
	        if (oldBindings) {
	            binding.oldValue = oldBindings[i].value;
	        }
	        let hook = binding.dir[name];
	        if (hook) {
	            // disable tracking inside all lifecycle hooks
	            // since they can potentially be called inside effects.
	            reactivity$1.pauseTracking();
	            callWithAsyncErrorHandling(hook, instance, 8 /* DIRECTIVE_HOOK */, [
	                vnode.el,
	                binding,
	                vnode,
	                prevVNode
	            ]);
	            reactivity$1.resetTracking();
	        }
	    }
	}

	const COMPONENTS = 'components';
	const DIRECTIVES = 'directives';
	/**
	 * @private
	 */
	function resolveComponent(name, maybeSelfReference) {
	    return resolveAsset(COMPONENTS, name, true, maybeSelfReference) || name;
	}
	const NULL_DYNAMIC_COMPONENT = Symbol();
	/**
	 * @private
	 */
	function resolveDynamicComponent(component) {
	    if (shared.isString(component)) {
	        return resolveAsset(COMPONENTS, component, false) || component;
	    }
	    else {
	        // invalid types will fallthrough to createVNode and raise warning
	        return (component || NULL_DYNAMIC_COMPONENT);
	    }
	}
	/**
	 * @private
	 */
	function resolveDirective(name) {
	    return resolveAsset(DIRECTIVES, name);
	}
	// implementation
	function resolveAsset(type, name, warnMissing = true, maybeSelfReference = false) {
	    const instance = currentRenderingInstance || currentInstance;
	    if (instance) {
	        const Component = instance.type;
	        // explicit self name has highest priority
	        if (type === COMPONENTS) {
	            const selfName = getComponentName(Component, false /* do not include inferred name to avoid breaking existing code */);
	            if (selfName &&
	                (selfName === name ||
	                    selfName === shared.camelize(name) ||
	                    selfName === shared.capitalize(shared.camelize(name)))) {
	                return Component;
	            }
	        }
	        const res = 
	        // local registration
	        // check instance[type] first which is resolved for options API
	        resolve(instance[type] || Component[type], name) ||
	            // global registration
	            resolve(instance.appContext[type], name);
	        if (!res && maybeSelfReference) {
	            // fallback to implicit self-reference
	            return Component;
	        }
	        if (warnMissing && !res) {
	            const extra = type === COMPONENTS
	                ? `\nIf this is a native custom element, make sure to exclude it from ` +
	                    `component resolution via compilerOptions.isCustomElement.`
	                : ``;
	            warn(`Failed to resolve ${type.slice(0, -1)}: ${name}${extra}`);
	        }
	        return res;
	    }
	    else {
	        warn(`resolve${shared.capitalize(type.slice(0, -1))} ` +
	            `can only be used in render() or setup().`);
	    }
	}
	function resolve(registry, name) {
	    return (registry &&
	        (registry[name] ||
	            registry[shared.camelize(name)] ||
	            registry[shared.capitalize(shared.camelize(name))]));
	}

	/**
	 * Actual implementation
	 */
	function renderList(source, renderItem, cache, index) {
	    let ret;
	    const cached = (cache && cache[index]);
	    if (shared.isArray(source) || shared.isString(source)) {
	        ret = new Array(source.length);
	        for (let i = 0, l = source.length; i < l; i++) {
	            ret[i] = renderItem(source[i], i, undefined, cached && cached[i]);
	        }
	    }
	    else if (typeof source === 'number') {
	        if (!Number.isInteger(source)) {
	            warn(`The v-for range expect an integer value but got ${source}.`);
	        }
	        ret = new Array(source);
	        for (let i = 0; i < source; i++) {
	            ret[i] = renderItem(i + 1, i, undefined, cached && cached[i]);
	        }
	    }
	    else if (shared.isObject(source)) {
	        if (source[Symbol.iterator]) {
	            ret = Array.from(source, (item, i) => renderItem(item, i, undefined, cached && cached[i]));
	        }
	        else {
	            const keys = Object.keys(source);
	            ret = new Array(keys.length);
	            for (let i = 0, l = keys.length; i < l; i++) {
	                const key = keys[i];
	                ret[i] = renderItem(source[key], key, i, cached && cached[i]);
	            }
	        }
	    }
	    else {
	        ret = [];
	    }
	    if (cache) {
	        cache[index] = ret;
	    }
	    return ret;
	}

	/**
	 * Compiler runtime helper for creating dynamic slots object
	 * @private
	 */
	function createSlots(slots, dynamicSlots) {
	    for (let i = 0; i < dynamicSlots.length; i++) {
	        const slot = dynamicSlots[i];
	        // array of dynamic slot generated by <template v-for="..." #[...]>
	        if (shared.isArray(slot)) {
	            for (let j = 0; j < slot.length; j++) {
	                slots[slot[j].name] = slot[j].fn;
	            }
	        }
	        else if (slot) {
	            // conditional single slot generated by <template v-if="..." #foo>
	            slots[slot.name] = slot.fn;
	        }
	    }
	    return slots;
	}

	/**
	 * Compiler runtime helper for rendering `<slot/>`
	 * @private
	 */
	function renderSlot(slots, name, props = {}, 
	// this is not a user-facing function, so the fallback is always generated by
	// the compiler and guaranteed to be a function returning an array
	fallback, noSlotted) {
	    if (currentRenderingInstance.isCE ||
	        (currentRenderingInstance.parent &&
	            isAsyncWrapper(currentRenderingInstance.parent) &&
	            currentRenderingInstance.parent.isCE)) {
	        return createVNode('slot', name === 'default' ? null : { name }, fallback && fallback());
	    }
	    let slot = slots[name];
	    if (slot && slot.length > 1) {
	        warn(`SSR-optimized slot function detected in a non-SSR-optimized render ` +
	            `function. You need to mark this component with $dynamic-slots in the ` +
	            `parent template.`);
	        slot = () => [];
	    }
	    // a compiled slot disables block tracking by default to avoid manual
	    // invocation interfering with template-based block tracking, but in
	    // `renderSlot` we can be sure that it's template-based so we can force
	    // enable it.
	    if (slot && slot._c) {
	        slot._d = false;
	    }
	    openBlock();
	    const validSlotContent = slot && ensureValidVNode(slot(props));
	    const rendered = createBlock(Fragment, { key: props.key || `_${name}` }, validSlotContent || (fallback ? fallback() : []), validSlotContent && slots._ === 1 /* STABLE */
	        ? 64 /* STABLE_FRAGMENT */
	        : -2 /* BAIL */);
	    if (!noSlotted && rendered.scopeId) {
	        rendered.slotScopeIds = [rendered.scopeId + '-s'];
	    }
	    if (slot && slot._c) {
	        slot._d = true;
	    }
	    return rendered;
	}
	function ensureValidVNode(vnodes) {
	    return vnodes.some(child => {
	        if (!isVNode(child))
	            return true;
	        if (child.type === Comment)
	            return false;
	        if (child.type === Fragment &&
	            !ensureValidVNode(child.children))
	            return false;
	        return true;
	    })
	        ? vnodes
	        : null;
	}

	/**
	 * For prefixing keys in v-on="obj" with "on"
	 * @private
	 */
	function toHandlers(obj) {
	    const ret = {};
	    if (!shared.isObject(obj)) {
	        warn(`v-on with no argument expects an object value.`);
	        return ret;
	    }
	    for (const key in obj) {
	        ret[shared.toHandlerKey(key)] = obj[key];
	    }
	    return ret;
	}

	/**
	 * #2437 In Vue 3, functional components do not have a public instance proxy but
	 * they exist in the internal parent chain. For code that relies on traversing
	 * public $parent chains, skip functional ones and go to the parent instead.
	 */
	const getPublicInstance = (i) => {
	    if (!i)
	        return null;
	    if (isStatefulComponent(i))
	        return getExposeProxy(i) || i.proxy;
	    return getPublicInstance(i.parent);
	};
	const publicPropertiesMap = 
	// Move PURE marker to new line to workaround compiler discarding it
	// due to type annotation
	/*#__PURE__*/ shared.extend(Object.create(null), {
	    $: i => i,
	    $el: i => i.vnode.el,
	    $data: i => i.data,
	    $props: i => (reactivity$1.shallowReadonly(i.props) ),
	    $attrs: i => (reactivity$1.shallowReadonly(i.attrs) ),
	    $slots: i => (reactivity$1.shallowReadonly(i.slots) ),
	    $refs: i => (reactivity$1.shallowReadonly(i.refs) ),
	    $parent: i => getPublicInstance(i.parent),
	    $root: i => getPublicInstance(i.root),
	    $emit: i => i.emit,
	    $options: i => (resolveMergedOptions(i) ),
	    $forceUpdate: i => i.f || (i.f = () => queueJob(i.update)),
	    $nextTick: i => i.n || (i.n = nextTick.bind(i.proxy)),
	    $watch: i => (instanceWatch.bind(i) )
	});
	const isReservedPrefix = (key) => key === '_' || key === '$';
	const PublicInstanceProxyHandlers = {
	    get({ _: instance }, key) {
	        const { ctx, setupState, data, props, accessCache, type, appContext } = instance;
	        // for internal formatters to know that this is a Vue instance
	        if (key === '__isVue') {
	            return true;
	        }
	        // prioritize <script setup> bindings during dev.
	        // this allows even properties that start with _ or $ to be used - so that
	        // it aligns with the production behavior where the render fn is inlined and
	        // indeed has access to all declared variables.
	        if (setupState !== shared.EMPTY_OBJ &&
	            setupState.__isScriptSetup &&
	            shared.hasOwn(setupState, key)) {
	            return setupState[key];
	        }
	        // data / props / ctx
	        // This getter gets called for every property access on the render context
	        // during render and is a major hotspot. The most expensive part of this
	        // is the multiple hasOwn() calls. It's much faster to do a simple property
	        // access on a plain object, so we use an accessCache object (with null
	        // prototype) to memoize what access type a key corresponds to.
	        let normalizedProps;
	        if (key[0] !== '$') {
	            const n = accessCache[key];
	            if (n !== undefined) {
	                switch (n) {
	                    case 1 /* SETUP */:
	                        return setupState[key];
	                    case 2 /* DATA */:
	                        return data[key];
	                    case 4 /* CONTEXT */:
	                        return ctx[key];
	                    case 3 /* PROPS */:
	                        return props[key];
	                    // default: just fallthrough
	                }
	            }
	            else if (setupState !== shared.EMPTY_OBJ && shared.hasOwn(setupState, key)) {
	                accessCache[key] = 1 /* SETUP */;
	                return setupState[key];
	            }
	            else if (data !== shared.EMPTY_OBJ && shared.hasOwn(data, key)) {
	                accessCache[key] = 2 /* DATA */;
	                return data[key];
	            }
	            else if (
	            // only cache other properties when instance has declared (thus stable)
	            // props
	            (normalizedProps = instance.propsOptions[0]) &&
	                shared.hasOwn(normalizedProps, key)) {
	                accessCache[key] = 3 /* PROPS */;
	                return props[key];
	            }
	            else if (ctx !== shared.EMPTY_OBJ && shared.hasOwn(ctx, key)) {
	                accessCache[key] = 4 /* CONTEXT */;
	                return ctx[key];
	            }
	            else if (shouldCacheAccess) {
	                accessCache[key] = 0 /* OTHER */;
	            }
	        }
	        const publicGetter = publicPropertiesMap[key];
	        let cssModule, globalProperties;
	        // public $xxx properties
	        if (publicGetter) {
	            if (key === '$attrs') {
	                reactivity$1.track(instance, "get" /* GET */, key);
	                markAttrsAccessed();
	            }
	            return publicGetter(instance);
	        }
	        else if (
	        // css module (injected by vue-loader)
	        (cssModule = type.__cssModules) &&
	            (cssModule = cssModule[key])) {
	            return cssModule;
	        }
	        else if (ctx !== shared.EMPTY_OBJ && shared.hasOwn(ctx, key)) {
	            // user may set custom properties to `this` that start with `$`
	            accessCache[key] = 4 /* CONTEXT */;
	            return ctx[key];
	        }
	        else if (
	        // global properties
	        ((globalProperties = appContext.config.globalProperties),
	            shared.hasOwn(globalProperties, key))) {
	            {
	                return globalProperties[key];
	            }
	        }
	        else if (currentRenderingInstance &&
	            (!shared.isString(key) ||
	                // #1091 avoid internal isRef/isVNode checks on component instance leading
	                // to infinite warning loop
	                key.indexOf('__v') !== 0)) {
	            if (data !== shared.EMPTY_OBJ && isReservedPrefix(key[0]) && shared.hasOwn(data, key)) {
	                warn(`Property ${JSON.stringify(key)} must be accessed via $data because it starts with a reserved ` +
	                    `character ("$" or "_") and is not proxied on the render context.`);
	            }
	            else if (instance === currentRenderingInstance) {
	                warn(`Property ${JSON.stringify(key)} was accessed during render ` +
	                    `but is not defined on instance.`);
	            }
	        }
	    },
	    set({ _: instance }, key, value) {
	        const { data, setupState, ctx } = instance;
	        if (setupState !== shared.EMPTY_OBJ && shared.hasOwn(setupState, key)) {
	            setupState[key] = value;
	            return true;
	        }
	        else if (data !== shared.EMPTY_OBJ && shared.hasOwn(data, key)) {
	            data[key] = value;
	            return true;
	        }
	        else if (shared.hasOwn(instance.props, key)) {
	            warn(`Attempting to mutate prop "${key}". Props are readonly.`, instance);
	            return false;
	        }
	        if (key[0] === '$' && key.slice(1) in instance) {
	            warn(`Attempting to mutate public property "${key}". ` +
	                    `Properties starting with $ are reserved and readonly.`, instance);
	            return false;
	        }
	        else {
	            if (key in instance.appContext.config.globalProperties) {
	                Object.defineProperty(ctx, key, {
	                    enumerable: true,
	                    configurable: true,
	                    value
	                });
	            }
	            else {
	                ctx[key] = value;
	            }
	        }
	        return true;
	    },
	    has({ _: { data, setupState, accessCache, ctx, appContext, propsOptions } }, key) {
	        let normalizedProps;
	        return (!!accessCache[key] ||
	            (data !== shared.EMPTY_OBJ && shared.hasOwn(data, key)) ||
	            (setupState !== shared.EMPTY_OBJ && shared.hasOwn(setupState, key)) ||
	            ((normalizedProps = propsOptions[0]) && shared.hasOwn(normalizedProps, key)) ||
	            shared.hasOwn(ctx, key) ||
	            shared.hasOwn(publicPropertiesMap, key) ||
	            shared.hasOwn(appContext.config.globalProperties, key));
	    },
	    defineProperty(target, key, descriptor) {
	        if (descriptor.get != null) {
	            // invalidate key cache of a getter based property #5417
	            target._.accessCache[key] = 0;
	        }
	        else if (shared.hasOwn(descriptor, 'value')) {
	            this.set(target, key, descriptor.value, null);
	        }
	        return Reflect.defineProperty(target, key, descriptor);
	    }
	};
	{
	    PublicInstanceProxyHandlers.ownKeys = (target) => {
	        warn(`Avoid app logic that relies on enumerating keys on a component instance. ` +
	            `The keys will be empty in production mode to avoid performance overhead.`);
	        return Reflect.ownKeys(target);
	    };
	}
	const RuntimeCompiledPublicInstanceProxyHandlers = /*#__PURE__*/ shared.extend({}, PublicInstanceProxyHandlers, {
	    get(target, key) {
	        // fast path for unscopables when using `with` block
	        if (key === Symbol.unscopables) {
	            return;
	        }
	        return PublicInstanceProxyHandlers.get(target, key, target);
	    },
	    has(_, key) {
	        const has = key[0] !== '_' && !shared.isGloballyWhitelisted(key);
	        if (!has && PublicInstanceProxyHandlers.has(_, key)) {
	            warn(`Property ${JSON.stringify(key)} should not start with _ which is a reserved prefix for Vue internals.`);
	        }
	        return has;
	    }
	});
	// dev only
	// In dev mode, the proxy target exposes the same properties as seen on `this`
	// for easier console inspection. In prod mode it will be an empty object so
	// these properties definitions can be skipped.
	function createDevRenderContext(instance) {
	    const target = {};
	    // expose internal instance for proxy handlers
	    Object.defineProperty(target, `_`, {
	        configurable: true,
	        enumerable: false,
	        get: () => instance
	    });
	    // expose public properties
	    Object.keys(publicPropertiesMap).forEach(key => {
	        Object.defineProperty(target, key, {
	            configurable: true,
	            enumerable: false,
	            get: () => publicPropertiesMap[key](instance),
	            // intercepted by the proxy so no need for implementation,
	            // but needed to prevent set errors
	            set: shared.NOOP
	        });
	    });
	    return target;
	}
	// dev only
	function exposePropsOnRenderContext(instance) {
	    const { ctx, propsOptions: [propsOptions] } = instance;
	    if (propsOptions) {
	        Object.keys(propsOptions).forEach(key => {
	            Object.defineProperty(ctx, key, {
	                enumerable: true,
	                configurable: true,
	                get: () => instance.props[key],
	                set: shared.NOOP
	            });
	        });
	    }
	}
	// dev only
	function exposeSetupStateOnRenderContext(instance) {
	    const { ctx, setupState } = instance;
	    Object.keys(reactivity$1.toRaw(setupState)).forEach(key => {
	        if (!setupState.__isScriptSetup) {
	            if (isReservedPrefix(key[0])) {
	                warn(`setup() return property ${JSON.stringify(key)} should not start with "$" or "_" ` +
	                    `which are reserved prefixes for Vue internals.`);
	                return;
	            }
	            Object.defineProperty(ctx, key, {
	                enumerable: true,
	                configurable: true,
	                get: () => setupState[key],
	                set: shared.NOOP
	            });
	        }
	    });
	}

	function createDuplicateChecker() {
	    const cache = Object.create(null);
	    return (type, key) => {
	        if (cache[key]) {
	            warn(`${type} property "${key}" is already defined in ${cache[key]}.`);
	        }
	        else {
	            cache[key] = type;
	        }
	    };
	}
	let shouldCacheAccess = true;
	function applyOptions(instance) {
	    const options = resolveMergedOptions(instance);
	    const publicThis = instance.proxy;
	    const ctx = instance.ctx;
	    // do not cache property access on public proxy during state initialization
	    shouldCacheAccess = false;
	    // call beforeCreate first before accessing other options since
	    // the hook may mutate resolved options (#2791)
	    if (options.beforeCreate) {
	        callHook(options.beforeCreate, instance, "bc" /* BEFORE_CREATE */);
	    }
	    const { 
	    // state
	    data: dataOptions, computed: computedOptions, methods, watch: watchOptions, provide: provideOptions, inject: injectOptions, 
	    // lifecycle
	    created, beforeMount, mounted, beforeUpdate, updated, activated, deactivated, beforeDestroy, beforeUnmount, destroyed, unmounted, render, renderTracked, renderTriggered, errorCaptured, serverPrefetch, 
	    // public API
	    expose, inheritAttrs, 
	    // assets
	    components, directives, filters } = options;
	    const checkDuplicateProperties = createDuplicateChecker() ;
	    {
	        const [propsOptions] = instance.propsOptions;
	        if (propsOptions) {
	            for (const key in propsOptions) {
	                checkDuplicateProperties("Props" /* PROPS */, key);
	            }
	        }
	    }
	    // options initialization order (to be consistent with Vue 2):
	    // - props (already done outside of this function)
	    // - inject
	    // - methods
	    // - data (deferred since it relies on `this` access)
	    // - computed
	    // - watch (deferred since it relies on `this` access)
	    if (injectOptions) {
	        resolveInjections(injectOptions, ctx, checkDuplicateProperties, instance.appContext.config.unwrapInjectedRef);
	    }
	    if (methods) {
	        for (const key in methods) {
	            const methodHandler = methods[key];
	            if (shared.isFunction(methodHandler)) {
	                // In dev mode, we use the `createRenderContext` function to define
	                // methods to the proxy target, and those are read-only but
	                // reconfigurable, so it needs to be redefined here
	                {
	                    Object.defineProperty(ctx, key, {
	                        value: methodHandler.bind(publicThis),
	                        configurable: true,
	                        enumerable: true,
	                        writable: true
	                    });
	                }
	                {
	                    checkDuplicateProperties("Methods" /* METHODS */, key);
	                }
	            }
	            else {
	                warn(`Method "${key}" has type "${typeof methodHandler}" in the component definition. ` +
	                    `Did you reference the function correctly?`);
	            }
	        }
	    }
	    if (dataOptions) {
	        if (!shared.isFunction(dataOptions)) {
	            warn(`The data option must be a function. ` +
	                `Plain object usage is no longer supported.`);
	        }
	        const data = dataOptions.call(publicThis, publicThis);
	        if (shared.isPromise(data)) {
	            warn(`data() returned a Promise - note data() cannot be async; If you ` +
	                `intend to perform data fetching before component renders, use ` +
	                `async setup() + <Suspense>.`);
	        }
	        if (!shared.isObject(data)) {
	            warn(`data() should return an object.`);
	        }
	        else {
	            instance.data = reactivity$1.reactive(data);
	            {
	                for (const key in data) {
	                    checkDuplicateProperties("Data" /* DATA */, key);
	                    // expose data on ctx during dev
	                    if (!isReservedPrefix(key[0])) {
	                        Object.defineProperty(ctx, key, {
	                            configurable: true,
	                            enumerable: true,
	                            get: () => data[key],
	                            set: shared.NOOP
	                        });
	                    }
	                }
	            }
	        }
	    }
	    // state initialization complete at this point - start caching access
	    shouldCacheAccess = true;
	    if (computedOptions) {
	        for (const key in computedOptions) {
	            const opt = computedOptions[key];
	            const get = shared.isFunction(opt)
	                ? opt.bind(publicThis, publicThis)
	                : shared.isFunction(opt.get)
	                    ? opt.get.bind(publicThis, publicThis)
	                    : shared.NOOP;
	            if (get === shared.NOOP) {
	                warn(`Computed property "${key}" has no getter.`);
	            }
	            const set = !shared.isFunction(opt) && shared.isFunction(opt.set)
	                ? opt.set.bind(publicThis)
	                : () => {
	                        warn(`Write operation failed: computed property "${key}" is readonly.`);
	                    }
	                    ;
	            const c = computed({
	                get,
	                set
	            });
	            Object.defineProperty(ctx, key, {
	                enumerable: true,
	                configurable: true,
	                get: () => c.value,
	                set: v => (c.value = v)
	            });
	            {
	                checkDuplicateProperties("Computed" /* COMPUTED */, key);
	            }
	        }
	    }
	    if (watchOptions) {
	        for (const key in watchOptions) {
	            createWatcher(watchOptions[key], ctx, publicThis, key);
	        }
	    }
	    if (provideOptions) {
	        const provides = shared.isFunction(provideOptions)
	            ? provideOptions.call(publicThis)
	            : provideOptions;
	        Reflect.ownKeys(provides).forEach(key => {
	            provide(key, provides[key]);
	        });
	    }
	    if (created) {
	        callHook(created, instance, "c" /* CREATED */);
	    }
	    function registerLifecycleHook(register, hook) {
	        if (shared.isArray(hook)) {
	            hook.forEach(_hook => register(_hook.bind(publicThis)));
	        }
	        else if (hook) {
	            register(hook.bind(publicThis));
	        }
	    }
	    registerLifecycleHook(onBeforeMount, beforeMount);
	    registerLifecycleHook(onMounted, mounted);
	    registerLifecycleHook(onBeforeUpdate, beforeUpdate);
	    registerLifecycleHook(onUpdated, updated);
	    registerLifecycleHook(onActivated, activated);
	    registerLifecycleHook(onDeactivated, deactivated);
	    registerLifecycleHook(onErrorCaptured, errorCaptured);
	    registerLifecycleHook(onRenderTracked, renderTracked);
	    registerLifecycleHook(onRenderTriggered, renderTriggered);
	    registerLifecycleHook(onBeforeUnmount, beforeUnmount);
	    registerLifecycleHook(onUnmounted, unmounted);
	    registerLifecycleHook(onServerPrefetch, serverPrefetch);
	    if (shared.isArray(expose)) {
	        if (expose.length) {
	            const exposed = instance.exposed || (instance.exposed = {});
	            expose.forEach(key => {
	                Object.defineProperty(exposed, key, {
	                    get: () => publicThis[key],
	                    set: val => (publicThis[key] = val)
	                });
	            });
	        }
	        else if (!instance.exposed) {
	            instance.exposed = {};
	        }
	    }
	    // options that are handled when creating the instance but also need to be
	    // applied from mixins
	    if (render && instance.render === shared.NOOP) {
	        instance.render = render;
	    }
	    if (inheritAttrs != null) {
	        instance.inheritAttrs = inheritAttrs;
	    }
	    // asset options.
	    if (components)
	        instance.components = components;
	    if (directives)
	        instance.directives = directives;
	}
	function resolveInjections(injectOptions, ctx, checkDuplicateProperties = shared.NOOP, unwrapRef = false) {
	    if (shared.isArray(injectOptions)) {
	        injectOptions = normalizeInject(injectOptions);
	    }
	    for (const key in injectOptions) {
	        const opt = injectOptions[key];
	        let injected;
	        if (shared.isObject(opt)) {
	            if ('default' in opt) {
	                injected = inject(opt.from || key, opt.default, true /* treat default function as factory */);
	            }
	            else {
	                injected = inject(opt.from || key);
	            }
	        }
	        else {
	            injected = inject(opt);
	        }
	        if (reactivity$1.isRef(injected)) {
	            // TODO remove the check in 3.3
	            if (unwrapRef) {
	                Object.defineProperty(ctx, key, {
	                    enumerable: true,
	                    configurable: true,
	                    get: () => injected.value,
	                    set: v => (injected.value = v)
	                });
	            }
	            else {
	                {
	                    warn(`injected property "${key}" is a ref and will be auto-unwrapped ` +
	                        `and no longer needs \`.value\` in the next minor release. ` +
	                        `To opt-in to the new behavior now, ` +
	                        `set \`app.config.unwrapInjectedRef = true\` (this config is ` +
	                        `temporary and will not be needed in the future.)`);
	                }
	                ctx[key] = injected;
	            }
	        }
	        else {
	            ctx[key] = injected;
	        }
	        {
	            checkDuplicateProperties("Inject" /* INJECT */, key);
	        }
	    }
	}
	function callHook(hook, instance, type) {
	    callWithAsyncErrorHandling(shared.isArray(hook)
	        ? hook.map(h => h.bind(instance.proxy))
	        : hook.bind(instance.proxy), instance, type);
	}
	function createWatcher(raw, ctx, publicThis, key) {
	    const getter = key.includes('.')
	        ? createPathGetter(publicThis, key)
	        : () => publicThis[key];
	    if (shared.isString(raw)) {
	        const handler = ctx[raw];
	        if (shared.isFunction(handler)) {
	            watch(getter, handler);
	        }
	        else {
	            warn(`Invalid watch handler specified by key "${raw}"`, handler);
	        }
	    }
	    else if (shared.isFunction(raw)) {
	        watch(getter, raw.bind(publicThis));
	    }
	    else if (shared.isObject(raw)) {
	        if (shared.isArray(raw)) {
	            raw.forEach(r => createWatcher(r, ctx, publicThis, key));
	        }
	        else {
	            const handler = shared.isFunction(raw.handler)
	                ? raw.handler.bind(publicThis)
	                : ctx[raw.handler];
	            if (shared.isFunction(handler)) {
	                watch(getter, handler, raw);
	            }
	            else {
	                warn(`Invalid watch handler specified by key "${raw.handler}"`, handler);
	            }
	        }
	    }
	    else {
	        warn(`Invalid watch option: "${key}"`, raw);
	    }
	}
	/**
	 * Resolve merged options and cache it on the component.
	 * This is done only once per-component since the merging does not involve
	 * instances.
	 */
	function resolveMergedOptions(instance) {
	    const base = instance.type;
	    const { mixins, extends: extendsOptions } = base;
	    const { mixins: globalMixins, optionsCache: cache, config: { optionMergeStrategies } } = instance.appContext;
	    const cached = cache.get(base);
	    let resolved;
	    if (cached) {
	        resolved = cached;
	    }
	    else if (!globalMixins.length && !mixins && !extendsOptions) {
	        {
	            resolved = base;
	        }
	    }
	    else {
	        resolved = {};
	        if (globalMixins.length) {
	            globalMixins.forEach(m => mergeOptions(resolved, m, optionMergeStrategies, true));
	        }
	        mergeOptions(resolved, base, optionMergeStrategies);
	    }
	    cache.set(base, resolved);
	    return resolved;
	}
	function mergeOptions(to, from, strats, asMixin = false) {
	    const { mixins, extends: extendsOptions } = from;
	    if (extendsOptions) {
	        mergeOptions(to, extendsOptions, strats, true);
	    }
	    if (mixins) {
	        mixins.forEach((m) => mergeOptions(to, m, strats, true));
	    }
	    for (const key in from) {
	        if (asMixin && key === 'expose') {
	            warn(`"expose" option is ignored when declared in mixins or extends. ` +
	                    `It should only be declared in the base component itself.`);
	        }
	        else {
	            const strat = internalOptionMergeStrats[key] || (strats && strats[key]);
	            to[key] = strat ? strat(to[key], from[key]) : from[key];
	        }
	    }
	    return to;
	}
	const internalOptionMergeStrats = {
	    data: mergeDataFn,
	    props: mergeObjectOptions,
	    emits: mergeObjectOptions,
	    // objects
	    methods: mergeObjectOptions,
	    computed: mergeObjectOptions,
	    // lifecycle
	    beforeCreate: mergeAsArray,
	    created: mergeAsArray,
	    beforeMount: mergeAsArray,
	    mounted: mergeAsArray,
	    beforeUpdate: mergeAsArray,
	    updated: mergeAsArray,
	    beforeDestroy: mergeAsArray,
	    beforeUnmount: mergeAsArray,
	    destroyed: mergeAsArray,
	    unmounted: mergeAsArray,
	    activated: mergeAsArray,
	    deactivated: mergeAsArray,
	    errorCaptured: mergeAsArray,
	    serverPrefetch: mergeAsArray,
	    // assets
	    components: mergeObjectOptions,
	    directives: mergeObjectOptions,
	    // watch
	    watch: mergeWatchOptions,
	    // provide / inject
	    provide: mergeDataFn,
	    inject: mergeInject
	};
	function mergeDataFn(to, from) {
	    if (!from) {
	        return to;
	    }
	    if (!to) {
	        return from;
	    }
	    return function mergedDataFn() {
	        return (shared.extend)(shared.isFunction(to) ? to.call(this, this) : to, shared.isFunction(from) ? from.call(this, this) : from);
	    };
	}
	function mergeInject(to, from) {
	    return mergeObjectOptions(normalizeInject(to), normalizeInject(from));
	}
	function normalizeInject(raw) {
	    if (shared.isArray(raw)) {
	        const res = {};
	        for (let i = 0; i < raw.length; i++) {
	            res[raw[i]] = raw[i];
	        }
	        return res;
	    }
	    return raw;
	}
	function mergeAsArray(to, from) {
	    return to ? [...new Set([].concat(to, from))] : from;
	}
	function mergeObjectOptions(to, from) {
	    return to ? shared.extend(shared.extend(Object.create(null), to), from) : from;
	}
	function mergeWatchOptions(to, from) {
	    if (!to)
	        return from;
	    if (!from)
	        return to;
	    const merged = shared.extend(Object.create(null), to);
	    for (const key in from) {
	        merged[key] = mergeAsArray(to[key], from[key]);
	    }
	    return merged;
	}

	function initProps(instance, rawProps, isStateful, // result of bitwise flag comparison
	isSSR = false) {
	    const props = {};
	    const attrs = {};
	    shared.def(attrs, InternalObjectKey, 1);
	    instance.propsDefaults = Object.create(null);
	    setFullProps(instance, rawProps, props, attrs);
	    // ensure all declared prop keys are present
	    for (const key in instance.propsOptions[0]) {
	        if (!(key in props)) {
	            props[key] = undefined;
	        }
	    }
	    // validation
	    {
	        validateProps(rawProps || {}, props, instance);
	    }
	    if (isStateful) {
	        // stateful
	        instance.props = isSSR ? props : reactivity$1.shallowReactive(props);
	    }
	    else {
	        if (!instance.type.props) {
	            // functional w/ optional props, props === attrs
	            instance.props = attrs;
	        }
	        else {
	            // functional w/ declared props
	            instance.props = props;
	        }
	    }
	    instance.attrs = attrs;
	}
	function updateProps(instance, rawProps, rawPrevProps, optimized) {
	    const { props, attrs, vnode: { patchFlag } } = instance;
	    const rawCurrentProps = reactivity$1.toRaw(props);
	    const [options] = instance.propsOptions;
	    let hasAttrsChanged = false;
	    if (
	    // always force full diff in dev
	    // - #1942 if hmr is enabled with sfc component
	    // - vite#872 non-sfc component used by sfc component
	    !((instance.type.__hmrId ||
	            (instance.parent && instance.parent.type.__hmrId))) &&
	        (optimized || patchFlag > 0) &&
	        !(patchFlag & 16 /* FULL_PROPS */)) {
	        if (patchFlag & 8 /* PROPS */) {
	            // Compiler-generated props & no keys change, just set the updated
	            // the props.
	            const propsToUpdate = instance.vnode.dynamicProps;
	            for (let i = 0; i < propsToUpdate.length; i++) {
	                let key = propsToUpdate[i];
	                // skip if the prop key is a declared emit event listener
	                if (isEmitListener(instance.emitsOptions, key)) {
	                    continue;
	                }
	                // PROPS flag guarantees rawProps to be non-null
	                const value = rawProps[key];
	                if (options) {
	                    // attr / props separation was done on init and will be consistent
	                    // in this code path, so just check if attrs have it.
	                    if (shared.hasOwn(attrs, key)) {
	                        if (value !== attrs[key]) {
	                            attrs[key] = value;
	                            hasAttrsChanged = true;
	                        }
	                    }
	                    else {
	                        const camelizedKey = shared.camelize(key);
	                        props[camelizedKey] = resolvePropValue(options, rawCurrentProps, camelizedKey, value, instance, false /* isAbsent */);
	                    }
	                }
	                else {
	                    if (value !== attrs[key]) {
	                        attrs[key] = value;
	                        hasAttrsChanged = true;
	                    }
	                }
	            }
	        }
	    }
	    else {
	        // full props update.
	        if (setFullProps(instance, rawProps, props, attrs)) {
	            hasAttrsChanged = true;
	        }
	        // in case of dynamic props, check if we need to delete keys from
	        // the props object
	        let kebabKey;
	        for (const key in rawCurrentProps) {
	            if (!rawProps ||
	                // for camelCase
	                (!shared.hasOwn(rawProps, key) &&
	                    // it's possible the original props was passed in as kebab-case
	                    // and converted to camelCase (#955)
	                    ((kebabKey = shared.hyphenate(key)) === key || !shared.hasOwn(rawProps, kebabKey)))) {
	                if (options) {
	                    if (rawPrevProps &&
	                        // for camelCase
	                        (rawPrevProps[key] !== undefined ||
	                            // for kebab-case
	                            rawPrevProps[kebabKey] !== undefined)) {
	                        props[key] = resolvePropValue(options, rawCurrentProps, key, undefined, instance, true /* isAbsent */);
	                    }
	                }
	                else {
	                    delete props[key];
	                }
	            }
	        }
	        // in the case of functional component w/o props declaration, props and
	        // attrs point to the same object so it should already have been updated.
	        if (attrs !== rawCurrentProps) {
	            for (const key in attrs) {
	                if (!rawProps ||
	                    (!shared.hasOwn(rawProps, key) &&
	                        (!false ))) {
	                    delete attrs[key];
	                    hasAttrsChanged = true;
	                }
	            }
	        }
	    }
	    // trigger updates for $attrs in case it's used in component slots
	    if (hasAttrsChanged) {
	        reactivity$1.trigger(instance, "set" /* SET */, '$attrs');
	    }
	    {
	        validateProps(rawProps || {}, props, instance);
	    }
	}
	function setFullProps(instance, rawProps, props, attrs) {
	    const [options, needCastKeys] = instance.propsOptions;
	    let hasAttrsChanged = false;
	    let rawCastValues;
	    if (rawProps) {
	        for (let key in rawProps) {
	            // key, ref are reserved and never passed down
	            if (shared.isReservedProp(key)) {
	                continue;
	            }
	            const value = rawProps[key];
	            // prop option names are camelized during normalization, so to support
	            // kebab -> camel conversion here we need to camelize the key.
	            let camelKey;
	            if (options && shared.hasOwn(options, (camelKey = shared.camelize(key)))) {
	                if (!needCastKeys || !needCastKeys.includes(camelKey)) {
	                    props[camelKey] = value;
	                }
	                else {
	                    (rawCastValues || (rawCastValues = {}))[camelKey] = value;
	                }
	            }
	            else if (!isEmitListener(instance.emitsOptions, key)) {
	                if (!(key in attrs) || value !== attrs[key]) {
	                    attrs[key] = value;
	                    hasAttrsChanged = true;
	                }
	            }
	        }
	    }
	    if (needCastKeys) {
	        const rawCurrentProps = reactivity$1.toRaw(props);
	        const castValues = rawCastValues || shared.EMPTY_OBJ;
	        for (let i = 0; i < needCastKeys.length; i++) {
	            const key = needCastKeys[i];
	            props[key] = resolvePropValue(options, rawCurrentProps, key, castValues[key], instance, !shared.hasOwn(castValues, key));
	        }
	    }
	    return hasAttrsChanged;
	}
	function resolvePropValue(options, props, key, value, instance, isAbsent) {
	    const opt = options[key];
	    if (opt != null) {
	        const hasDefault = shared.hasOwn(opt, 'default');
	        // default values
	        if (hasDefault && value === undefined) {
	            const defaultValue = opt.default;
	            if (opt.type !== Function && shared.isFunction(defaultValue)) {
	                const { propsDefaults } = instance;
	                if (key in propsDefaults) {
	                    value = propsDefaults[key];
	                }
	                else {
	                    setCurrentInstance(instance);
	                    value = propsDefaults[key] = defaultValue.call(null, props);
	                    unsetCurrentInstance();
	                }
	            }
	            else {
	                value = defaultValue;
	            }
	        }
	        // boolean casting
	        if (opt[0 /* shouldCast */]) {
	            if (isAbsent && !hasDefault) {
	                value = false;
	            }
	            else if (opt[1 /* shouldCastTrue */] &&
	                (value === '' || value === shared.hyphenate(key))) {
	                value = true;
	            }
	        }
	    }
	    return value;
	}
	function normalizePropsOptions(comp, appContext, asMixin = false) {
	    const cache = appContext.propsCache;
	    const cached = cache.get(comp);
	    if (cached) {
	        return cached;
	    }
	    const raw = comp.props;
	    const normalized = {};
	    const needCastKeys = [];
	    // apply mixin/extends props
	    let hasExtends = false;
	    if (!shared.isFunction(comp)) {
	        const extendProps = (raw) => {
	            hasExtends = true;
	            const [props, keys] = normalizePropsOptions(raw, appContext, true);
	            shared.extend(normalized, props);
	            if (keys)
	                needCastKeys.push(...keys);
	        };
	        if (!asMixin && appContext.mixins.length) {
	            appContext.mixins.forEach(extendProps);
	        }
	        if (comp.extends) {
	            extendProps(comp.extends);
	        }
	        if (comp.mixins) {
	            comp.mixins.forEach(extendProps);
	        }
	    }
	    if (!raw && !hasExtends) {
	        cache.set(comp, shared.EMPTY_ARR);
	        return shared.EMPTY_ARR;
	    }
	    if (shared.isArray(raw)) {
	        for (let i = 0; i < raw.length; i++) {
	            if (!shared.isString(raw[i])) {
	                warn(`props must be strings when using array syntax.`, raw[i]);
	            }
	            const normalizedKey = shared.camelize(raw[i]);
	            if (validatePropName(normalizedKey)) {
	                normalized[normalizedKey] = shared.EMPTY_OBJ;
	            }
	        }
	    }
	    else if (raw) {
	        if (!shared.isObject(raw)) {
	            warn(`invalid props options`, raw);
	        }
	        for (const key in raw) {
	            const normalizedKey = shared.camelize(key);
	            if (validatePropName(normalizedKey)) {
	                const opt = raw[key];
	                const prop = (normalized[normalizedKey] =
	                    shared.isArray(opt) || shared.isFunction(opt) ? { type: opt } : opt);
	                if (prop) {
	                    const booleanIndex = getTypeIndex(Boolean, prop.type);
	                    const stringIndex = getTypeIndex(String, prop.type);
	                    prop[0 /* shouldCast */] = booleanIndex > -1;
	                    prop[1 /* shouldCastTrue */] =
	                        stringIndex < 0 || booleanIndex < stringIndex;
	                    // if the prop needs boolean casting or default value
	                    if (booleanIndex > -1 || shared.hasOwn(prop, 'default')) {
	                        needCastKeys.push(normalizedKey);
	                    }
	                }
	            }
	        }
	    }
	    const res = [normalized, needCastKeys];
	    cache.set(comp, res);
	    return res;
	}
	function validatePropName(key) {
	    if (key[0] !== '$') {
	        return true;
	    }
	    else {
	        warn(`Invalid prop name: "${key}" is a reserved property.`);
	    }
	    return false;
	}
	// use function string name to check type constructors
	// so that it works across vms / iframes.
	function getType(ctor) {
	    const match = ctor && ctor.toString().match(/^\s*function (\w+)/);
	    return match ? match[1] : ctor === null ? 'null' : '';
	}
	function isSameType(a, b) {
	    return getType(a) === getType(b);
	}
	function getTypeIndex(type, expectedTypes) {
	    if (shared.isArray(expectedTypes)) {
	        return expectedTypes.findIndex(t => isSameType(t, type));
	    }
	    else if (shared.isFunction(expectedTypes)) {
	        return isSameType(expectedTypes, type) ? 0 : -1;
	    }
	    return -1;
	}
	/**
	 * dev only
	 */
	function validateProps(rawProps, props, instance) {
	    const resolvedValues = reactivity$1.toRaw(props);
	    const options = instance.propsOptions[0];
	    for (const key in options) {
	        let opt = options[key];
	        if (opt == null)
	            continue;
	        validateProp(key, resolvedValues[key], opt, !shared.hasOwn(rawProps, key) && !shared.hasOwn(rawProps, shared.hyphenate(key)));
	    }
	}
	/**
	 * dev only
	 */
	function validateProp(name, value, prop, isAbsent) {
	    const { type, required, validator } = prop;
	    // required!
	    if (required && isAbsent) {
	        warn('Missing required prop: "' + name + '"');
	        return;
	    }
	    // missing but optional
	    if (value == null && !prop.required) {
	        return;
	    }
	    // type check
	    if (type != null && type !== true) {
	        let isValid = false;
	        const types = shared.isArray(type) ? type : [type];
	        const expectedTypes = [];
	        // value is valid as long as one of the specified types match
	        for (let i = 0; i < types.length && !isValid; i++) {
	            const { valid, expectedType } = assertType(value, types[i]);
	            expectedTypes.push(expectedType || '');
	            isValid = valid;
	        }
	        if (!isValid) {
	            warn(getInvalidTypeMessage(name, value, expectedTypes));
	            return;
	        }
	    }
	    // custom validator
	    if (validator && !validator(value)) {
	        warn('Invalid prop: custom validator check failed for prop "' + name + '".');
	    }
	}
	const isSimpleType = /*#__PURE__*/ shared.makeMap('String,Number,Boolean,Function,Symbol,BigInt');
	/**
	 * dev only
	 */
	function assertType(value, type) {
	    let valid;
	    const expectedType = getType(type);
	    if (isSimpleType(expectedType)) {
	        const t = typeof value;
	        valid = t === expectedType.toLowerCase();
	        // for primitive wrapper objects
	        if (!valid && t === 'object') {
	            valid = value instanceof type;
	        }
	    }
	    else if (expectedType === 'Object') {
	        valid = shared.isObject(value);
	    }
	    else if (expectedType === 'Array') {
	        valid = shared.isArray(value);
	    }
	    else if (expectedType === 'null') {
	        valid = value === null;
	    }
	    else {
	        valid = value instanceof type;
	    }
	    return {
	        valid,
	        expectedType
	    };
	}
	/**
	 * dev only
	 */
	function getInvalidTypeMessage(name, value, expectedTypes) {
	    let message = `Invalid prop: type check failed for prop "${name}".` +
	        ` Expected ${expectedTypes.map(shared.capitalize).join(' | ')}`;
	    const expectedType = expectedTypes[0];
	    const receivedType = shared.toRawType(value);
	    const expectedValue = styleValue(value, expectedType);
	    const receivedValue = styleValue(value, receivedType);
	    // check if we need to specify expected value
	    if (expectedTypes.length === 1 &&
	        isExplicable(expectedType) &&
	        !isBoolean(expectedType, receivedType)) {
	        message += ` with value ${expectedValue}`;
	    }
	    message += `, got ${receivedType} `;
	    // check if we need to specify received value
	    if (isExplicable(receivedType)) {
	        message += `with value ${receivedValue}.`;
	    }
	    return message;
	}
	/**
	 * dev only
	 */
	function styleValue(value, type) {
	    if (type === 'String') {
	        return `"${value}"`;
	    }
	    else if (type === 'Number') {
	        return `${Number(value)}`;
	    }
	    else {
	        return `${value}`;
	    }
	}
	/**
	 * dev only
	 */
	function isExplicable(type) {
	    const explicitTypes = ['string', 'number', 'boolean'];
	    return explicitTypes.some(elem => type.toLowerCase() === elem);
	}
	/**
	 * dev only
	 */
	function isBoolean(...args) {
	    return args.some(elem => elem.toLowerCase() === 'boolean');
	}

	const isInternalKey = (key) => key[0] === '_' || key === '$stable';
	const normalizeSlotValue = (value) => shared.isArray(value)
	    ? value.map(normalizeVNode)
	    : [normalizeVNode(value)];
	const normalizeSlot = (key, rawSlot, ctx) => {
	    if (rawSlot._n) {
	        // already normalized - #5353
	        return rawSlot;
	    }
	    const normalized = withCtx((...args) => {
	        if (currentInstance) {
	            warn(`Slot "${key}" invoked outside of the render function: ` +
	                `this will not track dependencies used in the slot. ` +
	                `Invoke the slot function inside the render function instead.`);
	        }
	        return normalizeSlotValue(rawSlot(...args));
	    }, ctx);
	    normalized._c = false;
	    return normalized;
	};
	const normalizeObjectSlots = (rawSlots, slots, instance) => {
	    const ctx = rawSlots._ctx;
	    for (const key in rawSlots) {
	        if (isInternalKey(key))
	            continue;
	        const value = rawSlots[key];
	        if (shared.isFunction(value)) {
	            slots[key] = normalizeSlot(key, value, ctx);
	        }
	        else if (value != null) {
	            {
	                warn(`Non-function value encountered for slot "${key}". ` +
	                    `Prefer function slots for better performance.`);
	            }
	            const normalized = normalizeSlotValue(value);
	            slots[key] = () => normalized;
	        }
	    }
	};
	const normalizeVNodeSlots = (instance, children) => {
	    if (!isKeepAlive(instance.vnode) &&
	        !(false )) {
	        warn(`Non-function value encountered for default slot. ` +
	            `Prefer function slots for better performance.`);
	    }
	    const normalized = normalizeSlotValue(children);
	    instance.slots.default = () => normalized;
	};
	const initSlots = (instance, children) => {
	    if (instance.vnode.shapeFlag & 32 /* SLOTS_CHILDREN */) {
	        const type = children._;
	        if (type) {
	            // users can get the shallow readonly version of the slots object through `this.$slots`,
	            // we should avoid the proxy object polluting the slots of the internal instance
	            instance.slots = reactivity$1.toRaw(children);
	            // make compiler marker non-enumerable
	            shared.def(children, '_', type);
	        }
	        else {
	            normalizeObjectSlots(children, (instance.slots = {}));
	        }
	    }
	    else {
	        instance.slots = {};
	        if (children) {
	            normalizeVNodeSlots(instance, children);
	        }
	    }
	    shared.def(instance.slots, InternalObjectKey, 1);
	};
	const updateSlots = (instance, children, optimized) => {
	    const { vnode, slots } = instance;
	    let needDeletionCheck = true;
	    let deletionComparisonTarget = shared.EMPTY_OBJ;
	    if (vnode.shapeFlag & 32 /* SLOTS_CHILDREN */) {
	        const type = children._;
	        if (type) {
	            // compiled slots.
	            if (isHmrUpdating) {
	                // Parent was HMR updated so slot content may have changed.
	                // force update slots and mark instance for hmr as well
	                shared.extend(slots, children);
	            }
	            else if (optimized && type === 1 /* STABLE */) {
	                // compiled AND stable.
	                // no need to update, and skip stale slots removal.
	                needDeletionCheck = false;
	            }
	            else {
	                // compiled but dynamic (v-if/v-for on slots) - update slots, but skip
	                // normalization.
	                shared.extend(slots, children);
	                // #2893
	                // when rendering the optimized slots by manually written render function,
	                // we need to delete the `slots._` flag if necessary to make subsequent updates reliable,
	                // i.e. let the `renderSlot` create the bailed Fragment
	                if (!optimized && type === 1 /* STABLE */) {
	                    delete slots._;
	                }
	            }
	        }
	        else {
	            needDeletionCheck = !children.$stable;
	            normalizeObjectSlots(children, slots);
	        }
	        deletionComparisonTarget = children;
	    }
	    else if (children) {
	        // non slot object children (direct value) passed to a component
	        normalizeVNodeSlots(instance, children);
	        deletionComparisonTarget = { default: 1 };
	    }
	    // delete stale slots
	    if (needDeletionCheck) {
	        for (const key in slots) {
	            if (!isInternalKey(key) && !(key in deletionComparisonTarget)) {
	                delete slots[key];
	            }
	        }
	    }
	};

	function createAppContext() {
	    return {
	        app: null,
	        config: {
	            isNativeTag: shared.NO,
	            performance: false,
	            globalProperties: {},
	            optionMergeStrategies: {},
	            errorHandler: undefined,
	            warnHandler: undefined,
	            compilerOptions: {}
	        },
	        mixins: [],
	        components: {},
	        directives: {},
	        provides: Object.create(null),
	        optionsCache: new WeakMap(),
	        propsCache: new WeakMap(),
	        emitsCache: new WeakMap()
	    };
	}
	let uid = 0;
	function createAppAPI(render, hydrate) {
	    return function createApp(rootComponent, rootProps = null) {
	        if (!shared.isFunction(rootComponent)) {
	            rootComponent = { ...rootComponent };
	        }
	        if (rootProps != null && !shared.isObject(rootProps)) {
	            warn(`root props passed to app.mount() must be an object.`);
	            rootProps = null;
	        }
	        const context = createAppContext();
	        const installedPlugins = new Set();
	        let isMounted = false;
	        const app = (context.app = {
	            _uid: uid++,
	            _component: rootComponent,
	            _props: rootProps,
	            _container: null,
	            _context: context,
	            _instance: null,
	            version,
	            get config() {
	                return context.config;
	            },
	            set config(v) {
	                {
	                    warn(`app.config cannot be replaced. Modify individual options instead.`);
	                }
	            },
	            use(plugin, ...options) {
	                if (installedPlugins.has(plugin)) {
	                    warn(`Plugin has already been applied to target app.`);
	                }
	                else if (plugin && shared.isFunction(plugin.install)) {
	                    installedPlugins.add(plugin);
	                    plugin.install(app, ...options);
	                }
	                else if (shared.isFunction(plugin)) {
	                    installedPlugins.add(plugin);
	                    plugin(app, ...options);
	                }
	                else {
	                    warn(`A plugin must either be a function or an object with an "install" ` +
	                        `function.`);
	                }
	                return app;
	            },
	            mixin(mixin) {
	                {
	                    if (!context.mixins.includes(mixin)) {
	                        context.mixins.push(mixin);
	                    }
	                    else {
	                        warn('Mixin has already been applied to target app' +
	                            (mixin.name ? `: ${mixin.name}` : ''));
	                    }
	                }
	                return app;
	            },
	            component(name, component) {
	                {
	                    validateComponentName(name, context.config);
	                }
	                if (!component) {
	                    return context.components[name];
	                }
	                if (context.components[name]) {
	                    warn(`Component "${name}" has already been registered in target app.`);
	                }
	                context.components[name] = component;
	                return app;
	            },
	            directive(name, directive) {
	                {
	                    validateDirectiveName(name);
	                }
	                if (!directive) {
	                    return context.directives[name];
	                }
	                if (context.directives[name]) {
	                    warn(`Directive "${name}" has already been registered in target app.`);
	                }
	                context.directives[name] = directive;
	                return app;
	            },
	            mount(rootContainer, isHydrate, isSVG) {
	                if (!isMounted) {
	                    // #5571
	                    if (rootContainer.__vue_app__) {
	                        warn(`There is already an app instance mounted on the host container.\n` +
	                            ` If you want to mount another app on the same host container,` +
	                            ` you need to unmount the previous app by calling \`app.unmount()\` first.`);
	                    }
	                    const vnode = createVNode(rootComponent, rootProps);
	                    // store app context on the root VNode.
	                    // this will be set on the root instance on initial mount.
	                    vnode.appContext = context;
	                    // HMR root reload
	                    {
	                        context.reload = () => {
	                            render(cloneVNode(vnode), rootContainer, isSVG);
	                        };
	                    }
	                    if (isHydrate && hydrate) {
	                        hydrate(vnode, rootContainer);
	                    }
	                    else {
	                        render(vnode, rootContainer, isSVG);
	                    }
	                    isMounted = true;
	                    app._container = rootContainer;
	                    rootContainer.__vue_app__ = app;
	                    {
	                        app._instance = vnode.component;
	                        devtoolsInitApp(app, version);
	                    }
	                    return getExposeProxy(vnode.component) || vnode.component.proxy;
	                }
	                else {
	                    warn(`App has already been mounted.\n` +
	                        `If you want to remount the same app, move your app creation logic ` +
	                        `into a factory function and create fresh app instances for each ` +
	                        `mount - e.g. \`const createMyApp = () => createApp(App)\``);
	                }
	            },
	            unmount() {
	                if (isMounted) {
	                    render(null, app._container);
	                    {
	                        app._instance = null;
	                        devtoolsUnmountApp(app);
	                    }
	                    delete app._container.__vue_app__;
	                }
	                else {
	                    warn(`Cannot unmount an app that is not mounted.`);
	                }
	            },
	            provide(key, value) {
	                if (key in context.provides) {
	                    warn(`App already provides property with key "${String(key)}". ` +
	                        `It will be overwritten with the new value.`);
	                }
	                context.provides[key] = value;
	                return app;
	            }
	        });
	        return app;
	    };
	}

	/**
	 * Function for handling a template ref
	 */
	function setRef(rawRef, oldRawRef, parentSuspense, vnode, isUnmount = false) {
	    if (shared.isArray(rawRef)) {
	        rawRef.forEach((r, i) => setRef(r, oldRawRef && (shared.isArray(oldRawRef) ? oldRawRef[i] : oldRawRef), parentSuspense, vnode, isUnmount));
	        return;
	    }
	    if (isAsyncWrapper(vnode) && !isUnmount) {
	        // when mounting async components, nothing needs to be done,
	        // because the template ref is forwarded to inner component
	        return;
	    }
	    const refValue = vnode.shapeFlag & 4 /* STATEFUL_COMPONENT */
	        ? getExposeProxy(vnode.component) || vnode.component.proxy
	        : vnode.el;
	    const value = isUnmount ? null : refValue;
	    const { i: owner, r: ref } = rawRef;
	    if (!owner) {
	        warn(`Missing ref owner context. ref cannot be used on hoisted vnodes. ` +
	            `A vnode with ref must be created inside the render function.`);
	        return;
	    }
	    const oldRef = oldRawRef && oldRawRef.r;
	    const refs = owner.refs === shared.EMPTY_OBJ ? (owner.refs = {}) : owner.refs;
	    const setupState = owner.setupState;
	    // dynamic ref changed. unset old ref
	    if (oldRef != null && oldRef !== ref) {
	        if (shared.isString(oldRef)) {
	            refs[oldRef] = null;
	            if (shared.hasOwn(setupState, oldRef)) {
	                setupState[oldRef] = null;
	            }
	        }
	        else if (reactivity$1.isRef(oldRef)) {
	            oldRef.value = null;
	        }
	    }
	    if (shared.isFunction(ref)) {
	        callWithErrorHandling(ref, owner, 12 /* FUNCTION_REF */, [value, refs]);
	    }
	    else {
	        const _isString = shared.isString(ref);
	        const _isRef = reactivity$1.isRef(ref);
	        if (_isString || _isRef) {
	            const doSet = () => {
	                if (rawRef.f) {
	                    const existing = _isString ? refs[ref] : ref.value;
	                    if (isUnmount) {
	                        shared.isArray(existing) && shared.remove(existing, refValue);
	                    }
	                    else {
	                        if (!shared.isArray(existing)) {
	                            if (_isString) {
	                                refs[ref] = [refValue];
	                                if (shared.hasOwn(setupState, ref)) {
	                                    setupState[ref] = refs[ref];
	                                }
	                            }
	                            else {
	                                ref.value = [refValue];
	                                if (rawRef.k)
	                                    refs[rawRef.k] = ref.value;
	                            }
	                        }
	                        else if (!existing.includes(refValue)) {
	                            existing.push(refValue);
	                        }
	                    }
	                }
	                else if (_isString) {
	                    refs[ref] = value;
	                    if (shared.hasOwn(setupState, ref)) {
	                        setupState[ref] = value;
	                    }
	                }
	                else if (_isRef) {
	                    ref.value = value;
	                    if (rawRef.k)
	                        refs[rawRef.k] = value;
	                }
	                else {
	                    warn('Invalid template ref type:', ref, `(${typeof ref})`);
	                }
	            };
	            if (value) {
	                doSet.id = -1;
	                queuePostRenderEffect(doSet, parentSuspense);
	            }
	            else {
	                doSet();
	            }
	        }
	        else {
	            warn('Invalid template ref type:', ref, `(${typeof ref})`);
	        }
	    }
	}

	let hasMismatch = false;
	const isSVGContainer = (container) => /svg/.test(container.namespaceURI) && container.tagName !== 'foreignObject';
	const isComment = (node) => node.nodeType === 8 /* COMMENT */;
	// Note: hydration is DOM-specific
	// But we have to place it in core due to tight coupling with core - splitting
	// it out creates a ton of unnecessary complexity.
	// Hydration also depends on some renderer internal logic which needs to be
	// passed in via arguments.
	function createHydrationFunctions(rendererInternals) {
	    const { mt: mountComponent, p: patch, o: { patchProp, createText, nextSibling, parentNode, remove, insert, createComment } } = rendererInternals;
	    const hydrate = (vnode, container) => {
	        if (!container.hasChildNodes()) {
	            warn(`Attempting to hydrate existing markup but container is empty. ` +
	                    `Performing full mount instead.`);
	            patch(null, vnode, container);
	            flushPostFlushCbs();
	            container._vnode = vnode;
	            return;
	        }
	        hasMismatch = false;
	        hydrateNode(container.firstChild, vnode, null, null, null);
	        flushPostFlushCbs();
	        container._vnode = vnode;
	        if (hasMismatch && !false) {
	            // this error should show up in production
	            console.error(`Hydration completed but contains mismatches.`);
	        }
	    };
	    const hydrateNode = (node, vnode, parentComponent, parentSuspense, slotScopeIds, optimized = false) => {
	        const isFragmentStart = isComment(node) && node.data === '[';
	        const onMismatch = () => handleMismatch(node, vnode, parentComponent, parentSuspense, slotScopeIds, isFragmentStart);
	        const { type, ref, shapeFlag, patchFlag } = vnode;
	        const domType = node.nodeType;
	        vnode.el = node;
	        if (patchFlag === -2 /* BAIL */) {
	            optimized = false;
	            vnode.dynamicChildren = null;
	        }
	        let nextNode = null;
	        switch (type) {
	            case Text:
	                if (domType !== 3 /* TEXT */) {
	                    // #5728 empty text node inside a slot can cause hydration failure
	                    // because the server rendered HTML won't contain a text node
	                    if (vnode.children === '') {
	                        insert((vnode.el = createText('')), parentNode(node), node);
	                        nextNode = node;
	                    }
	                    else {
	                        nextNode = onMismatch();
	                    }
	                }
	                else {
	                    if (node.data !== vnode.children) {
	                        hasMismatch = true;
	                        warn(`Hydration text mismatch:` +
	                                `\n- Client: ${JSON.stringify(node.data)}` +
	                                `\n- Server: ${JSON.stringify(vnode.children)}`);
	                        node.data = vnode.children;
	                    }
	                    nextNode = nextSibling(node);
	                }
	                break;
	            case Comment:
	                if (domType !== 8 /* COMMENT */ || isFragmentStart) {
	                    nextNode = onMismatch();
	                }
	                else {
	                    nextNode = nextSibling(node);
	                }
	                break;
	            case Static:
	                if (domType !== 1 /* ELEMENT */ && domType !== 3 /* TEXT */) {
	                    nextNode = onMismatch();
	                }
	                else {
	                    // determine anchor, adopt content
	                    nextNode = node;
	                    // if the static vnode has its content stripped during build,
	                    // adopt it from the server-rendered HTML.
	                    const needToAdoptContent = !vnode.children.length;
	                    for (let i = 0; i < vnode.staticCount; i++) {
	                        if (needToAdoptContent)
	                            vnode.children +=
	                                nextNode.nodeType === 1 /* ELEMENT */
	                                    ? nextNode.outerHTML
	                                    : nextNode.data;
	                        if (i === vnode.staticCount - 1) {
	                            vnode.anchor = nextNode;
	                        }
	                        nextNode = nextSibling(nextNode);
	                    }
	                    return nextNode;
	                }
	                break;
	            case Fragment:
	                if (!isFragmentStart) {
	                    nextNode = onMismatch();
	                }
	                else {
	                    nextNode = hydrateFragment(node, vnode, parentComponent, parentSuspense, slotScopeIds, optimized);
	                }
	                break;
	            default:
	                if (shapeFlag & 1 /* ELEMENT */) {
	                    if (domType !== 1 /* ELEMENT */ ||
	                        vnode.type.toLowerCase() !==
	                            node.tagName.toLowerCase()) {
	                        nextNode = onMismatch();
	                    }
	                    else {
	                        nextNode = hydrateElement(node, vnode, parentComponent, parentSuspense, slotScopeIds, optimized);
	                    }
	                }
	                else if (shapeFlag & 6 /* COMPONENT */) {
	                    // when setting up the render effect, if the initial vnode already
	                    // has .el set, the component will perform hydration instead of mount
	                    // on its sub-tree.
	                    vnode.slotScopeIds = slotScopeIds;
	                    const container = parentNode(node);
	                    mountComponent(vnode, container, null, parentComponent, parentSuspense, isSVGContainer(container), optimized);
	                    // component may be async, so in the case of fragments we cannot rely
	                    // on component's rendered output to determine the end of the fragment
	                    // instead, we do a lookahead to find the end anchor node.
	                    nextNode = isFragmentStart
	                        ? locateClosingAsyncAnchor(node)
	                        : nextSibling(node);
	                    // #4293 teleport as component root
	                    if (nextNode &&
	                        isComment(nextNode) &&
	                        nextNode.data === 'teleport end') {
	                        nextNode = nextSibling(nextNode);
	                    }
	                    // #3787
	                    // if component is async, it may get moved / unmounted before its
	                    // inner component is loaded, so we need to give it a placeholder
	                    // vnode that matches its adopted DOM.
	                    if (isAsyncWrapper(vnode)) {
	                        let subTree;
	                        if (isFragmentStart) {
	                            subTree = createVNode(Fragment);
	                            subTree.anchor = nextNode
	                                ? nextNode.previousSibling
	                                : container.lastChild;
	                        }
	                        else {
	                            subTree =
	                                node.nodeType === 3 ? createTextVNode('') : createVNode('div');
	                        }
	                        subTree.el = node;
	                        vnode.component.subTree = subTree;
	                    }
	                }
	                else if (shapeFlag & 64 /* TELEPORT */) {
	                    if (domType !== 8 /* COMMENT */) {
	                        nextNode = onMismatch();
	                    }
	                    else {
	                        nextNode = vnode.type.hydrate(node, vnode, parentComponent, parentSuspense, slotScopeIds, optimized, rendererInternals, hydrateChildren);
	                    }
	                }
	                else if (shapeFlag & 128 /* SUSPENSE */) {
	                    nextNode = vnode.type.hydrate(node, vnode, parentComponent, parentSuspense, isSVGContainer(parentNode(node)), slotScopeIds, optimized, rendererInternals, hydrateNode);
	                }
	                else {
	                    warn('Invalid HostVNode type:', type, `(${typeof type})`);
	                }
	        }
	        if (ref != null) {
	            setRef(ref, null, parentSuspense, vnode);
	        }
	        return nextNode;
	    };
	    const hydrateElement = (el, vnode, parentComponent, parentSuspense, slotScopeIds, optimized) => {
	        optimized = optimized || !!vnode.dynamicChildren;
	        const { type, props, patchFlag, shapeFlag, dirs } = vnode;
	        // #4006 for form elements with non-string v-model value bindings
	        // e.g. <option :value="obj">, <input type="checkbox" :true-value="1">
	        const forcePatchValue = (type === 'input' && dirs) || type === 'option';
	        // skip props & children if this is hoisted static nodes
	        // #5405 in dev, always hydrate children for HMR
	        {
	            if (dirs) {
	                invokeDirectiveHook(vnode, null, parentComponent, 'created');
	            }
	            // props
	            if (props) {
	                if (forcePatchValue ||
	                    !optimized ||
	                    patchFlag & (16 /* FULL_PROPS */ | 32 /* HYDRATE_EVENTS */)) {
	                    for (const key in props) {
	                        if ((forcePatchValue && key.endsWith('value')) ||
	                            (shared.isOn(key) && !shared.isReservedProp(key))) {
	                            patchProp(el, key, null, props[key], false, undefined, parentComponent);
	                        }
	                    }
	                }
	                else if (props.onClick) {
	                    // Fast path for click listeners (which is most often) to avoid
	                    // iterating through props.
	                    patchProp(el, 'onClick', null, props.onClick, false, undefined, parentComponent);
	                }
	            }
	            // vnode / directive hooks
	            let vnodeHooks;
	            if ((vnodeHooks = props && props.onVnodeBeforeMount)) {
	                invokeVNodeHook(vnodeHooks, parentComponent, vnode);
	            }
	            if (dirs) {
	                invokeDirectiveHook(vnode, null, parentComponent, 'beforeMount');
	            }
	            if ((vnodeHooks = props && props.onVnodeMounted) || dirs) {
	                queueEffectWithSuspense(() => {
	                    vnodeHooks && invokeVNodeHook(vnodeHooks, parentComponent, vnode);
	                    dirs && invokeDirectiveHook(vnode, null, parentComponent, 'mounted');
	                }, parentSuspense);
	            }
	            // children
	            if (shapeFlag & 16 /* ARRAY_CHILDREN */ &&
	                // skip if element has innerHTML / textContent
	                !(props && (props.innerHTML || props.textContent))) {
	                let next = hydrateChildren(el.firstChild, vnode, el, parentComponent, parentSuspense, slotScopeIds, optimized);
	                let hasWarned = false;
	                while (next) {
	                    hasMismatch = true;
	                    if (!hasWarned) {
	                        warn(`Hydration children mismatch in <${vnode.type}>: ` +
	                            `server rendered element contains more child nodes than client vdom.`);
	                        hasWarned = true;
	                    }
	                    // The SSRed DOM contains more nodes than it should. Remove them.
	                    const cur = next;
	                    next = next.nextSibling;
	                    remove(cur);
	                }
	            }
	            else if (shapeFlag & 8 /* TEXT_CHILDREN */) {
	                if (el.textContent !== vnode.children) {
	                    hasMismatch = true;
	                    warn(`Hydration text content mismatch in <${vnode.type}>:\n` +
	                            `- Client: ${el.textContent}\n` +
	                            `- Server: ${vnode.children}`);
	                    el.textContent = vnode.children;
	                }
	            }
	        }
	        return el.nextSibling;
	    };
	    const hydrateChildren = (node, parentVNode, container, parentComponent, parentSuspense, slotScopeIds, optimized) => {
	        optimized = optimized || !!parentVNode.dynamicChildren;
	        const children = parentVNode.children;
	        const l = children.length;
	        let hasWarned = false;
	        for (let i = 0; i < l; i++) {
	            const vnode = optimized
	                ? children[i]
	                : (children[i] = normalizeVNode(children[i]));
	            if (node) {
	                node = hydrateNode(node, vnode, parentComponent, parentSuspense, slotScopeIds, optimized);
	            }
	            else if (vnode.type === Text && !vnode.children) {
	                continue;
	            }
	            else {
	                hasMismatch = true;
	                if (!hasWarned) {
	                    warn(`Hydration children mismatch in <${container.tagName.toLowerCase()}>: ` +
	                        `server rendered element contains fewer child nodes than client vdom.`);
	                    hasWarned = true;
	                }
	                // the SSRed DOM didn't contain enough nodes. Mount the missing ones.
	                patch(null, vnode, container, null, parentComponent, parentSuspense, isSVGContainer(container), slotScopeIds);
	            }
	        }
	        return node;
	    };
	    const hydrateFragment = (node, vnode, parentComponent, parentSuspense, slotScopeIds, optimized) => {
	        const { slotScopeIds: fragmentSlotScopeIds } = vnode;
	        if (fragmentSlotScopeIds) {
	            slotScopeIds = slotScopeIds
	                ? slotScopeIds.concat(fragmentSlotScopeIds)
	                : fragmentSlotScopeIds;
	        }
	        const container = parentNode(node);
	        const next = hydrateChildren(nextSibling(node), vnode, container, parentComponent, parentSuspense, slotScopeIds, optimized);
	        if (next && isComment(next) && next.data === ']') {
	            return nextSibling((vnode.anchor = next));
	        }
	        else {
	            // fragment didn't hydrate successfully, since we didn't get a end anchor
	            // back. This should have led to node/children mismatch warnings.
	            hasMismatch = true;
	            // since the anchor is missing, we need to create one and insert it
	            insert((vnode.anchor = createComment(`]`)), container, next);
	            return next;
	        }
	    };
	    const handleMismatch = (node, vnode, parentComponent, parentSuspense, slotScopeIds, isFragment) => {
	        hasMismatch = true;
	        warn(`Hydration node mismatch:\n- Client vnode:`, vnode.type, `\n- Server rendered DOM:`, node, node.nodeType === 3 /* TEXT */
	                ? `(text)`
	                : isComment(node) && node.data === '['
	                    ? `(start of fragment)`
	                    : ``);
	        vnode.el = null;
	        if (isFragment) {
	            // remove excessive fragment nodes
	            const end = locateClosingAsyncAnchor(node);
	            while (true) {
	                const next = nextSibling(node);
	                if (next && next !== end) {
	                    remove(next);
	                }
	                else {
	                    break;
	                }
	            }
	        }
	        const next = nextSibling(node);
	        const container = parentNode(node);
	        remove(node);
	        patch(null, vnode, container, next, parentComponent, parentSuspense, isSVGContainer(container), slotScopeIds);
	        return next;
	    };
	    const locateClosingAsyncAnchor = (node) => {
	        let match = 0;
	        while (node) {
	            node = nextSibling(node);
	            if (node && isComment(node)) {
	                if (node.data === '[')
	                    match++;
	                if (node.data === ']') {
	                    if (match === 0) {
	                        return nextSibling(node);
	                    }
	                    else {
	                        match--;
	                    }
	                }
	            }
	        }
	        return node;
	    };
	    return [hydrate, hydrateNode];
	}

	/* eslint-disable no-restricted-globals */
	let supported;
	let perf;
	function startMeasure(instance, type) {
	    if (instance.appContext.config.performance && isSupported()) {
	        perf.mark(`vue-${type}-${instance.uid}`);
	    }
	    {
	        devtoolsPerfStart(instance, type, isSupported() ? perf.now() : Date.now());
	    }
	}
	function endMeasure(instance, type) {
	    if (instance.appContext.config.performance && isSupported()) {
	        const startTag = `vue-${type}-${instance.uid}`;
	        const endTag = startTag + `:end`;
	        perf.mark(endTag);
	        perf.measure(`<${formatComponentName(instance, instance.type)}> ${type}`, startTag, endTag);
	        perf.clearMarks(startTag);
	        perf.clearMarks(endTag);
	    }
	    {
	        devtoolsPerfEnd(instance, type, isSupported() ? perf.now() : Date.now());
	    }
	}
	function isSupported() {
	    if (supported !== undefined) {
	        return supported;
	    }
	    {
	        supported = false;
	    }
	    return supported;
	}

	const queuePostRenderEffect = queueEffectWithSuspense
	    ;
	/**
	 * The createRenderer function accepts two generic arguments:
	 * HostNode and HostElement, corresponding to Node and Element types in the
	 * host environment. For example, for runtime-dom, HostNode would be the DOM
	 * `Node` interface and HostElement would be the DOM `Element` interface.
	 *
	 * Custom renderers can pass in the platform specific types like this:
	 *
	 * ``` js
	 * const { render, createApp } = createRenderer<Node, Element>({
	 *   patchProp,
	 *   ...nodeOps
	 * })
	 * ```
	 */
	function createRenderer(options) {
	    return baseCreateRenderer(options);
	}
	// Separate API for creating hydration-enabled renderer.
	// Hydration logic is only used when calling this function, making it
	// tree-shakable.
	function createHydrationRenderer(options) {
	    return baseCreateRenderer(options, createHydrationFunctions);
	}
	// implementation
	function baseCreateRenderer(options, createHydrationFns) {
	    const target = shared.getGlobalThis();
	    target.__VUE__ = true;
	    {
	        setDevtoolsHook(target.__VUE_DEVTOOLS_GLOBAL_HOOK__);
	    }
	    const { insert: hostInsert, remove: hostRemove, patchProp: hostPatchProp, createElement: hostCreateElement, createText: hostCreateText, createComment: hostCreateComment, setText: hostSetText, setElementText: hostSetElementText, parentNode: hostParentNode, nextSibling: hostNextSibling, setScopeId: hostSetScopeId = shared.NOOP, cloneNode: hostCloneNode, insertStaticContent: hostInsertStaticContent } = options;
	    // Note: functions inside this closure should use `const xxx = () => {}`
	    // style in order to prevent being inlined by minifiers.
	    const patch = (n1, n2, container, anchor = null, parentComponent = null, parentSuspense = null, isSVG = false, slotScopeIds = null, optimized = isHmrUpdating ? false : !!n2.dynamicChildren) => {
	        if (n1 === n2) {
	            return;
	        }
	        // patching & not same type, unmount old tree
	        if (n1 && !isSameVNodeType(n1, n2)) {
	            anchor = getNextHostNode(n1);
	            unmount(n1, parentComponent, parentSuspense, true);
	            n1 = null;
	        }
	        if (n2.patchFlag === -2 /* BAIL */) {
	            optimized = false;
	            n2.dynamicChildren = null;
	        }
	        const { type, ref, shapeFlag } = n2;
	        switch (type) {
	            case Text:
	                processText(n1, n2, container, anchor);
	                break;
	            case Comment:
	                processCommentNode(n1, n2, container, anchor);
	                break;
	            case Static:
	                if (n1 == null) {
	                    mountStaticNode(n2, container, anchor, isSVG);
	                }
	                else {
	                    patchStaticNode(n1, n2, container, isSVG);
	                }
	                break;
	            case Fragment:
	                processFragment(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	                break;
	            default:
	                if (shapeFlag & 1 /* ELEMENT */) {
	                    processElement(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	                }
	                else if (shapeFlag & 6 /* COMPONENT */) {
	                    processComponent(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	                }
	                else if (shapeFlag & 64 /* TELEPORT */) {
	                    type.process(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized, internals);
	                }
	                else if (shapeFlag & 128 /* SUSPENSE */) {
	                    type.process(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized, internals);
	                }
	                else {
	                    warn('Invalid VNode type:', type, `(${typeof type})`);
	                }
	        }
	        // set ref
	        if (ref != null && parentComponent) {
	            setRef(ref, n1 && n1.ref, parentSuspense, n2 || n1, !n2);
	        }
	    };
	    const processText = (n1, n2, container, anchor) => {
	        if (n1 == null) {
	            hostInsert((n2.el = hostCreateText(n2.children)), container, anchor);
	        }
	        else {
	            const el = (n2.el = n1.el);
	            if (n2.children !== n1.children) {
	                hostSetText(el, n2.children);
	            }
	        }
	    };
	    const processCommentNode = (n1, n2, container, anchor) => {
	        if (n1 == null) {
	            hostInsert((n2.el = hostCreateComment(n2.children || '')), container, anchor);
	        }
	        else {
	            // there's no support for dynamic comments
	            n2.el = n1.el;
	        }
	    };
	    const mountStaticNode = (n2, container, anchor, isSVG) => {
	        [n2.el, n2.anchor] = hostInsertStaticContent(n2.children, container, anchor, isSVG, n2.el, n2.anchor);
	    };
	    /**
	     * Dev / HMR only
	     */
	    const patchStaticNode = (n1, n2, container, isSVG) => {
	        // static nodes are only patched during dev for HMR
	        if (n2.children !== n1.children) {
	            const anchor = hostNextSibling(n1.anchor);
	            // remove existing
	            removeStaticNode(n1);
	            [n2.el, n2.anchor] = hostInsertStaticContent(n2.children, container, anchor, isSVG);
	        }
	        else {
	            n2.el = n1.el;
	            n2.anchor = n1.anchor;
	        }
	    };
	    const moveStaticNode = ({ el, anchor }, container, nextSibling) => {
	        let next;
	        while (el && el !== anchor) {
	            next = hostNextSibling(el);
	            hostInsert(el, container, nextSibling);
	            el = next;
	        }
	        hostInsert(anchor, container, nextSibling);
	    };
	    const removeStaticNode = ({ el, anchor }) => {
	        let next;
	        while (el && el !== anchor) {
	            next = hostNextSibling(el);
	            hostRemove(el);
	            el = next;
	        }
	        hostRemove(anchor);
	    };
	    const processElement = (n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized) => {
	        isSVG = isSVG || n2.type === 'svg';
	        if (n1 == null) {
	            mountElement(n2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	        }
	        else {
	            patchElement(n1, n2, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	        }
	    };
	    const mountElement = (vnode, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized) => {
	        let el;
	        let vnodeHook;
	        const { type, props, shapeFlag, transition, patchFlag, dirs } = vnode;
	        {
	            el = vnode.el = hostCreateElement(vnode.type, isSVG, props && props.is, props);
	            // mount children first, since some props may rely on child content
	            // being already rendered, e.g. `<select value>`
	            if (shapeFlag & 8 /* TEXT_CHILDREN */) {
	                hostSetElementText(el, vnode.children);
	            }
	            else if (shapeFlag & 16 /* ARRAY_CHILDREN */) {
	                mountChildren(vnode.children, el, null, parentComponent, parentSuspense, isSVG && type !== 'foreignObject', slotScopeIds, optimized);
	            }
	            if (dirs) {
	                invokeDirectiveHook(vnode, null, parentComponent, 'created');
	            }
	            // props
	            if (props) {
	                for (const key in props) {
	                    if (key !== 'value' && !shared.isReservedProp(key)) {
	                        hostPatchProp(el, key, null, props[key], isSVG, vnode.children, parentComponent, parentSuspense, unmountChildren);
	                    }
	                }
	                /**
	                 * Special case for setting value on DOM elements:
	                 * - it can be order-sensitive (e.g. should be set *after* min/max, #2325, #4024)
	                 * - it needs to be forced (#1471)
	                 * #2353 proposes adding another renderer option to configure this, but
	                 * the properties affects are so finite it is worth special casing it
	                 * here to reduce the complexity. (Special casing it also should not
	                 * affect non-DOM renderers)
	                 */
	                if ('value' in props) {
	                    hostPatchProp(el, 'value', null, props.value);
	                }
	                if ((vnodeHook = props.onVnodeBeforeMount)) {
	                    invokeVNodeHook(vnodeHook, parentComponent, vnode);
	                }
	            }
	            // scopeId
	            setScopeId(el, vnode, vnode.scopeId, slotScopeIds, parentComponent);
	        }
	        {
	            Object.defineProperty(el, '__vnode', {
	                value: vnode,
	                enumerable: false
	            });
	            Object.defineProperty(el, '__vueParentComponent', {
	                value: parentComponent,
	                enumerable: false
	            });
	        }
	        if (dirs) {
	            invokeDirectiveHook(vnode, null, parentComponent, 'beforeMount');
	        }
	        // #1583 For inside suspense + suspense not resolved case, enter hook should call when suspense resolved
	        // #1689 For inside suspense + suspense resolved case, just call it
	        const needCallTransitionHooks = (!parentSuspense || (parentSuspense && !parentSuspense.pendingBranch)) &&
	            transition &&
	            !transition.persisted;
	        if (needCallTransitionHooks) {
	            transition.beforeEnter(el);
	        }
	        hostInsert(el, container, anchor);
	        if ((vnodeHook = props && props.onVnodeMounted) ||
	            needCallTransitionHooks ||
	            dirs) {
	            queuePostRenderEffect(() => {
	                vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
	                needCallTransitionHooks && transition.enter(el);
	                dirs && invokeDirectiveHook(vnode, null, parentComponent, 'mounted');
	            }, parentSuspense);
	        }
	    };
	    const setScopeId = (el, vnode, scopeId, slotScopeIds, parentComponent) => {
	        if (scopeId) {
	            hostSetScopeId(el, scopeId);
	        }
	        if (slotScopeIds) {
	            for (let i = 0; i < slotScopeIds.length; i++) {
	                hostSetScopeId(el, slotScopeIds[i]);
	            }
	        }
	        if (parentComponent) {
	            let subTree = parentComponent.subTree;
	            if (subTree.patchFlag > 0 &&
	                subTree.patchFlag & 2048 /* DEV_ROOT_FRAGMENT */) {
	                subTree =
	                    filterSingleRoot(subTree.children) || subTree;
	            }
	            if (vnode === subTree) {
	                const parentVNode = parentComponent.vnode;
	                setScopeId(el, parentVNode, parentVNode.scopeId, parentVNode.slotScopeIds, parentComponent.parent);
	            }
	        }
	    };
	    const mountChildren = (children, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized, start = 0) => {
	        for (let i = start; i < children.length; i++) {
	            const child = (children[i] = optimized
	                ? cloneIfMounted(children[i])
	                : normalizeVNode(children[i]));
	            patch(null, child, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	        }
	    };
	    const patchElement = (n1, n2, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized) => {
	        const el = (n2.el = n1.el);
	        let { patchFlag, dynamicChildren, dirs } = n2;
	        // #1426 take the old vnode's patch flag into account since user may clone a
	        // compiler-generated vnode, which de-opts to FULL_PROPS
	        patchFlag |= n1.patchFlag & 16 /* FULL_PROPS */;
	        const oldProps = n1.props || shared.EMPTY_OBJ;
	        const newProps = n2.props || shared.EMPTY_OBJ;
	        let vnodeHook;
	        // disable recurse in beforeUpdate hooks
	        parentComponent && toggleRecurse(parentComponent, false);
	        if ((vnodeHook = newProps.onVnodeBeforeUpdate)) {
	            invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
	        }
	        if (dirs) {
	            invokeDirectiveHook(n2, n1, parentComponent, 'beforeUpdate');
	        }
	        parentComponent && toggleRecurse(parentComponent, true);
	        if (isHmrUpdating) {
	            // HMR updated, force full diff
	            patchFlag = 0;
	            optimized = false;
	            dynamicChildren = null;
	        }
	        const areChildrenSVG = isSVG && n2.type !== 'foreignObject';
	        if (dynamicChildren) {
	            patchBlockChildren(n1.dynamicChildren, dynamicChildren, el, parentComponent, parentSuspense, areChildrenSVG, slotScopeIds);
	            if (parentComponent && parentComponent.type.__hmrId) {
	                traverseStaticChildren(n1, n2);
	            }
	        }
	        else if (!optimized) {
	            // full diff
	            patchChildren(n1, n2, el, null, parentComponent, parentSuspense, areChildrenSVG, slotScopeIds, false);
	        }
	        if (patchFlag > 0) {
	            // the presence of a patchFlag means this element's render code was
	            // generated by the compiler and can take the fast path.
	            // in this path old node and new node are guaranteed to have the same shape
	            // (i.e. at the exact same position in the source template)
	            if (patchFlag & 16 /* FULL_PROPS */) {
	                // element props contain dynamic keys, full diff needed
	                patchProps(el, n2, oldProps, newProps, parentComponent, parentSuspense, isSVG);
	            }
	            else {
	                // class
	                // this flag is matched when the element has dynamic class bindings.
	                if (patchFlag & 2 /* CLASS */) {
	                    if (oldProps.class !== newProps.class) {
	                        hostPatchProp(el, 'class', null, newProps.class, isSVG);
	                    }
	                }
	                // style
	                // this flag is matched when the element has dynamic style bindings
	                if (patchFlag & 4 /* STYLE */) {
	                    hostPatchProp(el, 'style', oldProps.style, newProps.style, isSVG);
	                }
	                // props
	                // This flag is matched when the element has dynamic prop/attr bindings
	                // other than class and style. The keys of dynamic prop/attrs are saved for
	                // faster iteration.
	                // Note dynamic keys like :[foo]="bar" will cause this optimization to
	                // bail out and go through a full diff because we need to unset the old key
	                if (patchFlag & 8 /* PROPS */) {
	                    // if the flag is present then dynamicProps must be non-null
	                    const propsToUpdate = n2.dynamicProps;
	                    for (let i = 0; i < propsToUpdate.length; i++) {
	                        const key = propsToUpdate[i];
	                        const prev = oldProps[key];
	                        const next = newProps[key];
	                        // #1471 force patch value
	                        if (next !== prev || key === 'value') {
	                            hostPatchProp(el, key, prev, next, isSVG, n1.children, parentComponent, parentSuspense, unmountChildren);
	                        }
	                    }
	                }
	            }
	            // text
	            // This flag is matched when the element has only dynamic text children.
	            if (patchFlag & 1 /* TEXT */) {
	                if (n1.children !== n2.children) {
	                    hostSetElementText(el, n2.children);
	                }
	            }
	        }
	        else if (!optimized && dynamicChildren == null) {
	            // unoptimized, full diff
	            patchProps(el, n2, oldProps, newProps, parentComponent, parentSuspense, isSVG);
	        }
	        if ((vnodeHook = newProps.onVnodeUpdated) || dirs) {
	            queuePostRenderEffect(() => {
	                vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
	                dirs && invokeDirectiveHook(n2, n1, parentComponent, 'updated');
	            }, parentSuspense);
	        }
	    };
	    // The fast path for blocks.
	    const patchBlockChildren = (oldChildren, newChildren, fallbackContainer, parentComponent, parentSuspense, isSVG, slotScopeIds) => {
	        for (let i = 0; i < newChildren.length; i++) {
	            const oldVNode = oldChildren[i];
	            const newVNode = newChildren[i];
	            // Determine the container (parent element) for the patch.
	            const container = 
	            // oldVNode may be an errored async setup() component inside Suspense
	            // which will not have a mounted element
	            oldVNode.el &&
	                // - In the case of a Fragment, we need to provide the actual parent
	                // of the Fragment itself so it can move its children.
	                (oldVNode.type === Fragment ||
	                    // - In the case of different nodes, there is going to be a replacement
	                    // which also requires the correct parent container
	                    !isSameVNodeType(oldVNode, newVNode) ||
	                    // - In the case of a component, it could contain anything.
	                    oldVNode.shapeFlag & (6 /* COMPONENT */ | 64 /* TELEPORT */))
	                ? hostParentNode(oldVNode.el)
	                : // In other cases, the parent container is not actually used so we
	                    // just pass the block element here to avoid a DOM parentNode call.
	                    fallbackContainer;
	            patch(oldVNode, newVNode, container, null, parentComponent, parentSuspense, isSVG, slotScopeIds, true);
	        }
	    };
	    const patchProps = (el, vnode, oldProps, newProps, parentComponent, parentSuspense, isSVG) => {
	        if (oldProps !== newProps) {
	            for (const key in newProps) {
	                // empty string is not valid prop
	                if (shared.isReservedProp(key))
	                    continue;
	                const next = newProps[key];
	                const prev = oldProps[key];
	                // defer patching value
	                if (next !== prev && key !== 'value') {
	                    hostPatchProp(el, key, prev, next, isSVG, vnode.children, parentComponent, parentSuspense, unmountChildren);
	                }
	            }
	            if (oldProps !== shared.EMPTY_OBJ) {
	                for (const key in oldProps) {
	                    if (!shared.isReservedProp(key) && !(key in newProps)) {
	                        hostPatchProp(el, key, oldProps[key], null, isSVG, vnode.children, parentComponent, parentSuspense, unmountChildren);
	                    }
	                }
	            }
	            if ('value' in newProps) {
	                hostPatchProp(el, 'value', oldProps.value, newProps.value);
	            }
	        }
	    };
	    const processFragment = (n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized) => {
	        const fragmentStartAnchor = (n2.el = n1 ? n1.el : hostCreateText(''));
	        const fragmentEndAnchor = (n2.anchor = n1 ? n1.anchor : hostCreateText(''));
	        let { patchFlag, dynamicChildren, slotScopeIds: fragmentSlotScopeIds } = n2;
	        if (// #5523 dev root fragment may inherit directives
	            (isHmrUpdating || patchFlag & 2048 /* DEV_ROOT_FRAGMENT */)) {
	            // HMR updated / Dev root fragment (w/ comments), force full diff
	            patchFlag = 0;
	            optimized = false;
	            dynamicChildren = null;
	        }
	        // check if this is a slot fragment with :slotted scope ids
	        if (fragmentSlotScopeIds) {
	            slotScopeIds = slotScopeIds
	                ? slotScopeIds.concat(fragmentSlotScopeIds)
	                : fragmentSlotScopeIds;
	        }
	        if (n1 == null) {
	            hostInsert(fragmentStartAnchor, container, anchor);
	            hostInsert(fragmentEndAnchor, container, anchor);
	            // a fragment can only have array children
	            // since they are either generated by the compiler, or implicitly created
	            // from arrays.
	            mountChildren(n2.children, container, fragmentEndAnchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	        }
	        else {
	            if (patchFlag > 0 &&
	                patchFlag & 64 /* STABLE_FRAGMENT */ &&
	                dynamicChildren &&
	                // #2715 the previous fragment could've been a BAILed one as a result
	                // of renderSlot() with no valid children
	                n1.dynamicChildren) {
	                // a stable fragment (template root or <template v-for>) doesn't need to
	                // patch children order, but it may contain dynamicChildren.
	                patchBlockChildren(n1.dynamicChildren, dynamicChildren, container, parentComponent, parentSuspense, isSVG, slotScopeIds);
	                if (parentComponent && parentComponent.type.__hmrId) {
	                    traverseStaticChildren(n1, n2);
	                }
	                else if (
	                // #2080 if the stable fragment has a key, it's a <template v-for> that may
	                //  get moved around. Make sure all root level vnodes inherit el.
	                // #2134 or if it's a component root, it may also get moved around
	                // as the component is being moved.
	                n2.key != null ||
	                    (parentComponent && n2 === parentComponent.subTree)) {
	                    traverseStaticChildren(n1, n2, true /* shallow */);
	                }
	            }
	            else {
	                // keyed / unkeyed, or manual fragments.
	                // for keyed & unkeyed, since they are compiler generated from v-for,
	                // each child is guaranteed to be a block so the fragment will never
	                // have dynamicChildren.
	                patchChildren(n1, n2, container, fragmentEndAnchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	            }
	        }
	    };
	    const processComponent = (n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized) => {
	        n2.slotScopeIds = slotScopeIds;
	        if (n1 == null) {
	            if (n2.shapeFlag & 512 /* COMPONENT_KEPT_ALIVE */) {
	                parentComponent.ctx.activate(n2, container, anchor, isSVG, optimized);
	            }
	            else {
	                mountComponent(n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
	            }
	        }
	        else {
	            updateComponent(n1, n2, optimized);
	        }
	    };
	    const mountComponent = (initialVNode, container, anchor, parentComponent, parentSuspense, isSVG, optimized) => {
	        const instance = (initialVNode.component = createComponentInstance(initialVNode, parentComponent, parentSuspense));
	        if (instance.type.__hmrId) {
	            registerHMR(instance);
	        }
	        {
	            pushWarningContext(initialVNode);
	            startMeasure(instance, `mount`);
	        }
	        // inject renderer internals for keepAlive
	        if (isKeepAlive(initialVNode)) {
	            instance.ctx.renderer = internals;
	        }
	        // resolve props and slots for setup context
	        {
	            {
	                startMeasure(instance, `init`);
	            }
	            setupComponent(instance);
	            {
	                endMeasure(instance, `init`);
	            }
	        }
	        // setup() is async. This component relies on async logic to be resolved
	        // before proceeding
	        if (instance.asyncDep) {
	            parentSuspense && parentSuspense.registerDep(instance, setupRenderEffect);
	            // Give it a placeholder if this is not hydration
	            // TODO handle self-defined fallback
	            if (!initialVNode.el) {
	                const placeholder = (instance.subTree = createVNode(Comment));
	                processCommentNode(null, placeholder, container, anchor);
	            }
	            return;
	        }
	        setupRenderEffect(instance, initialVNode, container, anchor, parentSuspense, isSVG, optimized);
	        {
	            popWarningContext();
	            endMeasure(instance, `mount`);
	        }
	    };
	    const updateComponent = (n1, n2, optimized) => {
	        const instance = (n2.component = n1.component);
	        if (shouldUpdateComponent(n1, n2, optimized)) {
	            if (instance.asyncDep &&
	                !instance.asyncResolved) {
	                // async & still pending - just update props and slots
	                // since the component's reactive effect for render isn't set-up yet
	                {
	                    pushWarningContext(n2);
	                }
	                updateComponentPreRender(instance, n2, optimized);
	                {
	                    popWarningContext();
	                }
	                return;
	            }
	            else {
	                // normal update
	                instance.next = n2;
	                // in case the child component is also queued, remove it to avoid
	                // double updating the same child component in the same flush.
	                invalidateJob(instance.update);
	                // instance.update is the reactive effect.
	                instance.update();
	            }
	        }
	        else {
	            // no update needed. just copy over properties
	            n2.el = n1.el;
	            instance.vnode = n2;
	        }
	    };
	    const setupRenderEffect = (instance, initialVNode, container, anchor, parentSuspense, isSVG, optimized) => {
	        const componentUpdateFn = () => {
	            if (!instance.isMounted) {
	                let vnodeHook;
	                const { el, props } = initialVNode;
	                const { bm, m, parent } = instance;
	                const isAsyncWrapperVNode = isAsyncWrapper(initialVNode);
	                toggleRecurse(instance, false);
	                // beforeMount hook
	                if (bm) {
	                    shared.invokeArrayFns(bm);
	                }
	                // onVnodeBeforeMount
	                if (!isAsyncWrapperVNode &&
	                    (vnodeHook = props && props.onVnodeBeforeMount)) {
	                    invokeVNodeHook(vnodeHook, parent, initialVNode);
	                }
	                toggleRecurse(instance, true);
	                if (el && hydrateNode) {
	                    // vnode has adopted host node - perform hydration instead of mount.
	                    const hydrateSubTree = () => {
	                        {
	                            startMeasure(instance, `render`);
	                        }
	                        instance.subTree = renderComponentRoot(instance);
	                        {
	                            endMeasure(instance, `render`);
	                        }
	                        {
	                            startMeasure(instance, `hydrate`);
	                        }
	                        hydrateNode(el, instance.subTree, instance, parentSuspense, null);
	                        {
	                            endMeasure(instance, `hydrate`);
	                        }
	                    };
	                    if (isAsyncWrapperVNode) {
	                        initialVNode.type.__asyncLoader().then(
	                        // note: we are moving the render call into an async callback,
	                        // which means it won't track dependencies - but it's ok because
	                        // a server-rendered async wrapper is already in resolved state
	                        // and it will never need to change.
	                        () => !instance.isUnmounted && hydrateSubTree());
	                    }
	                    else {
	                        hydrateSubTree();
	                    }
	                }
	                else {
	                    {
	                        startMeasure(instance, `render`);
	                    }
	                    const subTree = (instance.subTree = renderComponentRoot(instance));
	                    {
	                        endMeasure(instance, `render`);
	                    }
	                    {
	                        startMeasure(instance, `patch`);
	                    }
	                    patch(null, subTree, container, anchor, instance, parentSuspense, isSVG);
	                    {
	                        endMeasure(instance, `patch`);
	                    }
	                    initialVNode.el = subTree.el;
	                }
	                // mounted hook
	                if (m) {
	                    queuePostRenderEffect(m, parentSuspense);
	                }
	                // onVnodeMounted
	                if (!isAsyncWrapperVNode &&
	                    (vnodeHook = props && props.onVnodeMounted)) {
	                    const scopedInitialVNode = initialVNode;
	                    queuePostRenderEffect(() => invokeVNodeHook(vnodeHook, parent, scopedInitialVNode), parentSuspense);
	                }
	                // activated hook for keep-alive roots.
	                // #1742 activated hook must be accessed after first render
	                // since the hook may be injected by a child keep-alive
	                if (initialVNode.shapeFlag & 256 /* COMPONENT_SHOULD_KEEP_ALIVE */ ||
	                    (parent &&
	                        isAsyncWrapper(parent.vnode) &&
	                        parent.vnode.shapeFlag & 256 /* COMPONENT_SHOULD_KEEP_ALIVE */)) {
	                    instance.a && queuePostRenderEffect(instance.a, parentSuspense);
	                }
	                instance.isMounted = true;
	                {
	                    devtoolsComponentAdded(instance);
	                }
	                // #2458: deference mount-only object parameters to prevent memleaks
	                initialVNode = container = anchor = null;
	            }
	            else {
	                // updateComponent
	                // This is triggered by mutation of component's own state (next: null)
	                // OR parent calling processComponent (next: VNode)
	                let { next, bu, u, parent, vnode } = instance;
	                let originNext = next;
	                let vnodeHook;
	                {
	                    pushWarningContext(next || instance.vnode);
	                }
	                // Disallow component effect recursion during pre-lifecycle hooks.
	                toggleRecurse(instance, false);
	                if (next) {
	                    next.el = vnode.el;
	                    updateComponentPreRender(instance, next, optimized);
	                }
	                else {
	                    next = vnode;
	                }
	                // beforeUpdate hook
	                if (bu) {
	                    shared.invokeArrayFns(bu);
	                }
	                // onVnodeBeforeUpdate
	                if ((vnodeHook = next.props && next.props.onVnodeBeforeUpdate)) {
	                    invokeVNodeHook(vnodeHook, parent, next, vnode);
	                }
	                toggleRecurse(instance, true);
	                // render
	                {
	                    startMeasure(instance, `render`);
	                }
	                const nextTree = renderComponentRoot(instance);
	                {
	                    endMeasure(instance, `render`);
	                }
	                const prevTree = instance.subTree;
	                instance.subTree = nextTree;
	                {
	                    startMeasure(instance, `patch`);
	                }
	                patch(prevTree, nextTree, 
	                // parent may have changed if it's in a teleport
	                hostParentNode(prevTree.el), 
	                // anchor may have changed if it's in a fragment
	                getNextHostNode(prevTree), instance, parentSuspense, isSVG);
	                {
	                    endMeasure(instance, `patch`);
	                }
	                next.el = nextTree.el;
	                if (originNext === null) {
	                    // self-triggered update. In case of HOC, update parent component
	                    // vnode el. HOC is indicated by parent instance's subTree pointing
	                    // to child component's vnode
	                    updateHOCHostEl(instance, nextTree.el);
	                }
	                // updated hook
	                if (u) {
	                    queuePostRenderEffect(u, parentSuspense);
	                }
	                // onVnodeUpdated
	                if ((vnodeHook = next.props && next.props.onVnodeUpdated)) {
	                    queuePostRenderEffect(() => invokeVNodeHook(vnodeHook, parent, next, vnode), parentSuspense);
	                }
	                {
	                    devtoolsComponentUpdated(instance);
	                }
	                {
	                    popWarningContext();
	                }
	            }
	        };
	        // create reactive effect for rendering
	        const effect = (instance.effect = new reactivity$1.ReactiveEffect(componentUpdateFn, () => queueJob(update), instance.scope // track it in component's effect scope
	        ));
	        const update = (instance.update = () => effect.run());
	        update.id = instance.uid;
	        // allowRecurse
	        // #1801, #2043 component render effects should allow recursive updates
	        toggleRecurse(instance, true);
	        {
	            effect.onTrack = instance.rtc
	                ? e => shared.invokeArrayFns(instance.rtc, e)
	                : void 0;
	            effect.onTrigger = instance.rtg
	                ? e => shared.invokeArrayFns(instance.rtg, e)
	                : void 0;
	            update.ownerInstance = instance;
	        }
	        update();
	    };
	    const updateComponentPreRender = (instance, nextVNode, optimized) => {
	        nextVNode.component = instance;
	        const prevProps = instance.vnode.props;
	        instance.vnode = nextVNode;
	        instance.next = null;
	        updateProps(instance, nextVNode.props, prevProps, optimized);
	        updateSlots(instance, nextVNode.children, optimized);
	        reactivity$1.pauseTracking();
	        // props update may have triggered pre-flush watchers.
	        // flush them before the render update.
	        flushPreFlushCbs(undefined, instance.update);
	        reactivity$1.resetTracking();
	    };
	    const patchChildren = (n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized = false) => {
	        const c1 = n1 && n1.children;
	        const prevShapeFlag = n1 ? n1.shapeFlag : 0;
	        const c2 = n2.children;
	        const { patchFlag, shapeFlag } = n2;
	        // fast path
	        if (patchFlag > 0) {
	            if (patchFlag & 128 /* KEYED_FRAGMENT */) {
	                // this could be either fully-keyed or mixed (some keyed some not)
	                // presence of patchFlag means children are guaranteed to be arrays
	                patchKeyedChildren(c1, c2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	                return;
	            }
	            else if (patchFlag & 256 /* UNKEYED_FRAGMENT */) {
	                // unkeyed
	                patchUnkeyedChildren(c1, c2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	                return;
	            }
	        }
	        // children has 3 possibilities: text, array or no children.
	        if (shapeFlag & 8 /* TEXT_CHILDREN */) {
	            // text children fast path
	            if (prevShapeFlag & 16 /* ARRAY_CHILDREN */) {
	                unmountChildren(c1, parentComponent, parentSuspense);
	            }
	            if (c2 !== c1) {
	                hostSetElementText(container, c2);
	            }
	        }
	        else {
	            if (prevShapeFlag & 16 /* ARRAY_CHILDREN */) {
	                // prev children was array
	                if (shapeFlag & 16 /* ARRAY_CHILDREN */) {
	                    // two arrays, cannot assume anything, do full diff
	                    patchKeyedChildren(c1, c2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	                }
	                else {
	                    // no new children, just unmount old
	                    unmountChildren(c1, parentComponent, parentSuspense, true);
	                }
	            }
	            else {
	                // prev children was text OR null
	                // new children is array OR null
	                if (prevShapeFlag & 8 /* TEXT_CHILDREN */) {
	                    hostSetElementText(container, '');
	                }
	                // mount new if array
	                if (shapeFlag & 16 /* ARRAY_CHILDREN */) {
	                    mountChildren(c2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	                }
	            }
	        }
	    };
	    const patchUnkeyedChildren = (c1, c2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized) => {
	        c1 = c1 || shared.EMPTY_ARR;
	        c2 = c2 || shared.EMPTY_ARR;
	        const oldLength = c1.length;
	        const newLength = c2.length;
	        const commonLength = Math.min(oldLength, newLength);
	        let i;
	        for (i = 0; i < commonLength; i++) {
	            const nextChild = (c2[i] = optimized
	                ? cloneIfMounted(c2[i])
	                : normalizeVNode(c2[i]));
	            patch(c1[i], nextChild, container, null, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	        }
	        if (oldLength > newLength) {
	            // remove old
	            unmountChildren(c1, parentComponent, parentSuspense, true, false, commonLength);
	        }
	        else {
	            // mount new
	            mountChildren(c2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized, commonLength);
	        }
	    };
	    // can be all-keyed or mixed
	    const patchKeyedChildren = (c1, c2, container, parentAnchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized) => {
	        let i = 0;
	        const l2 = c2.length;
	        let e1 = c1.length - 1; // prev ending index
	        let e2 = l2 - 1; // next ending index
	        // 1. sync from start
	        // (a b) c
	        // (a b) d e
	        while (i <= e1 && i <= e2) {
	            const n1 = c1[i];
	            const n2 = (c2[i] = optimized
	                ? cloneIfMounted(c2[i])
	                : normalizeVNode(c2[i]));
	            if (isSameVNodeType(n1, n2)) {
	                patch(n1, n2, container, null, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	            }
	            else {
	                break;
	            }
	            i++;
	        }
	        // 2. sync from end
	        // a (b c)
	        // d e (b c)
	        while (i <= e1 && i <= e2) {
	            const n1 = c1[e1];
	            const n2 = (c2[e2] = optimized
	                ? cloneIfMounted(c2[e2])
	                : normalizeVNode(c2[e2]));
	            if (isSameVNodeType(n1, n2)) {
	                patch(n1, n2, container, null, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	            }
	            else {
	                break;
	            }
	            e1--;
	            e2--;
	        }
	        // 3. common sequence + mount
	        // (a b)
	        // (a b) c
	        // i = 2, e1 = 1, e2 = 2
	        // (a b)
	        // c (a b)
	        // i = 0, e1 = -1, e2 = 0
	        if (i > e1) {
	            if (i <= e2) {
	                const nextPos = e2 + 1;
	                const anchor = nextPos < l2 ? c2[nextPos].el : parentAnchor;
	                while (i <= e2) {
	                    patch(null, (c2[i] = optimized
	                        ? cloneIfMounted(c2[i])
	                        : normalizeVNode(c2[i])), container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	                    i++;
	                }
	            }
	        }
	        // 4. common sequence + unmount
	        // (a b) c
	        // (a b)
	        // i = 2, e1 = 2, e2 = 1
	        // a (b c)
	        // (b c)
	        // i = 0, e1 = 0, e2 = -1
	        else if (i > e2) {
	            while (i <= e1) {
	                unmount(c1[i], parentComponent, parentSuspense, true);
	                i++;
	            }
	        }
	        // 5. unknown sequence
	        // [i ... e1 + 1]: a b [c d e] f g
	        // [i ... e2 + 1]: a b [e d c h] f g
	        // i = 2, e1 = 4, e2 = 5
	        else {
	            const s1 = i; // prev starting index
	            const s2 = i; // next starting index
	            // 5.1 build key:index map for newChildren
	            const keyToNewIndexMap = new Map();
	            for (i = s2; i <= e2; i++) {
	                const nextChild = (c2[i] = optimized
	                    ? cloneIfMounted(c2[i])
	                    : normalizeVNode(c2[i]));
	                if (nextChild.key != null) {
	                    if (keyToNewIndexMap.has(nextChild.key)) {
	                        warn(`Duplicate keys found during update:`, JSON.stringify(nextChild.key), `Make sure keys are unique.`);
	                    }
	                    keyToNewIndexMap.set(nextChild.key, i);
	                }
	            }
	            // 5.2 loop through old children left to be patched and try to patch
	            // matching nodes & remove nodes that are no longer present
	            let j;
	            let patched = 0;
	            const toBePatched = e2 - s2 + 1;
	            let moved = false;
	            // used to track whether any node has moved
	            let maxNewIndexSoFar = 0;
	            // works as Map<newIndex, oldIndex>
	            // Note that oldIndex is offset by +1
	            // and oldIndex = 0 is a special value indicating the new node has
	            // no corresponding old node.
	            // used for determining longest stable subsequence
	            const newIndexToOldIndexMap = new Array(toBePatched);
	            for (i = 0; i < toBePatched; i++)
	                newIndexToOldIndexMap[i] = 0;
	            for (i = s1; i <= e1; i++) {
	                const prevChild = c1[i];
	                if (patched >= toBePatched) {
	                    // all new children have been patched so this can only be a removal
	                    unmount(prevChild, parentComponent, parentSuspense, true);
	                    continue;
	                }
	                let newIndex;
	                if (prevChild.key != null) {
	                    newIndex = keyToNewIndexMap.get(prevChild.key);
	                }
	                else {
	                    // key-less node, try to locate a key-less node of the same type
	                    for (j = s2; j <= e2; j++) {
	                        if (newIndexToOldIndexMap[j - s2] === 0 &&
	                            isSameVNodeType(prevChild, c2[j])) {
	                            newIndex = j;
	                            break;
	                        }
	                    }
	                }
	                if (newIndex === undefined) {
	                    unmount(prevChild, parentComponent, parentSuspense, true);
	                }
	                else {
	                    newIndexToOldIndexMap[newIndex - s2] = i + 1;
	                    if (newIndex >= maxNewIndexSoFar) {
	                        maxNewIndexSoFar = newIndex;
	                    }
	                    else {
	                        moved = true;
	                    }
	                    patch(prevChild, c2[newIndex], container, null, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	                    patched++;
	                }
	            }
	            // 5.3 move and mount
	            // generate longest stable subsequence only when nodes have moved
	            const increasingNewIndexSequence = moved
	                ? getSequence(newIndexToOldIndexMap)
	                : shared.EMPTY_ARR;
	            j = increasingNewIndexSequence.length - 1;
	            // looping backwards so that we can use last patched node as anchor
	            for (i = toBePatched - 1; i >= 0; i--) {
	                const nextIndex = s2 + i;
	                const nextChild = c2[nextIndex];
	                const anchor = nextIndex + 1 < l2 ? c2[nextIndex + 1].el : parentAnchor;
	                if (newIndexToOldIndexMap[i] === 0) {
	                    // mount new
	                    patch(null, nextChild, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	                }
	                else if (moved) {
	                    // move if:
	                    // There is no stable subsequence (e.g. a reverse)
	                    // OR current node is not among the stable sequence
	                    if (j < 0 || i !== increasingNewIndexSequence[j]) {
	                        move(nextChild, container, anchor, 2 /* REORDER */);
	                    }
	                    else {
	                        j--;
	                    }
	                }
	            }
	        }
	    };
	    const move = (vnode, container, anchor, moveType, parentSuspense = null) => {
	        const { el, type, transition, children, shapeFlag } = vnode;
	        if (shapeFlag & 6 /* COMPONENT */) {
	            move(vnode.component.subTree, container, anchor, moveType);
	            return;
	        }
	        if (shapeFlag & 128 /* SUSPENSE */) {
	            vnode.suspense.move(container, anchor, moveType);
	            return;
	        }
	        if (shapeFlag & 64 /* TELEPORT */) {
	            type.move(vnode, container, anchor, internals);
	            return;
	        }
	        if (type === Fragment) {
	            hostInsert(el, container, anchor);
	            for (let i = 0; i < children.length; i++) {
	                move(children[i], container, anchor, moveType);
	            }
	            hostInsert(vnode.anchor, container, anchor);
	            return;
	        }
	        if (type === Static) {
	            moveStaticNode(vnode, container, anchor);
	            return;
	        }
	        // single nodes
	        const needTransition = moveType !== 2 /* REORDER */ &&
	            shapeFlag & 1 /* ELEMENT */ &&
	            transition;
	        if (needTransition) {
	            if (moveType === 0 /* ENTER */) {
	                transition.beforeEnter(el);
	                hostInsert(el, container, anchor);
	                queuePostRenderEffect(() => transition.enter(el), parentSuspense);
	            }
	            else {
	                const { leave, delayLeave, afterLeave } = transition;
	                const remove = () => hostInsert(el, container, anchor);
	                const performLeave = () => {
	                    leave(el, () => {
	                        remove();
	                        afterLeave && afterLeave();
	                    });
	                };
	                if (delayLeave) {
	                    delayLeave(el, remove, performLeave);
	                }
	                else {
	                    performLeave();
	                }
	            }
	        }
	        else {
	            hostInsert(el, container, anchor);
	        }
	    };
	    const unmount = (vnode, parentComponent, parentSuspense, doRemove = false, optimized = false) => {
	        const { type, props, ref, children, dynamicChildren, shapeFlag, patchFlag, dirs } = vnode;
	        // unset ref
	        if (ref != null) {
	            setRef(ref, null, parentSuspense, vnode, true);
	        }
	        if (shapeFlag & 256 /* COMPONENT_SHOULD_KEEP_ALIVE */) {
	            parentComponent.ctx.deactivate(vnode);
	            return;
	        }
	        const shouldInvokeDirs = shapeFlag & 1 /* ELEMENT */ && dirs;
	        const shouldInvokeVnodeHook = !isAsyncWrapper(vnode);
	        let vnodeHook;
	        if (shouldInvokeVnodeHook &&
	            (vnodeHook = props && props.onVnodeBeforeUnmount)) {
	            invokeVNodeHook(vnodeHook, parentComponent, vnode);
	        }
	        if (shapeFlag & 6 /* COMPONENT */) {
	            unmountComponent(vnode.component, parentSuspense, doRemove);
	        }
	        else {
	            if (shapeFlag & 128 /* SUSPENSE */) {
	                vnode.suspense.unmount(parentSuspense, doRemove);
	                return;
	            }
	            if (shouldInvokeDirs) {
	                invokeDirectiveHook(vnode, null, parentComponent, 'beforeUnmount');
	            }
	            if (shapeFlag & 64 /* TELEPORT */) {
	                vnode.type.remove(vnode, parentComponent, parentSuspense, optimized, internals, doRemove);
	            }
	            else if (dynamicChildren &&
	                // #1153: fast path should not be taken for non-stable (v-for) fragments
	                (type !== Fragment ||
	                    (patchFlag > 0 && patchFlag & 64 /* STABLE_FRAGMENT */))) {
	                // fast path for block nodes: only need to unmount dynamic children.
	                unmountChildren(dynamicChildren, parentComponent, parentSuspense, false, true);
	            }
	            else if ((type === Fragment &&
	                patchFlag &
	                    (128 /* KEYED_FRAGMENT */ | 256 /* UNKEYED_FRAGMENT */)) ||
	                (!optimized && shapeFlag & 16 /* ARRAY_CHILDREN */)) {
	                unmountChildren(children, parentComponent, parentSuspense);
	            }
	            if (doRemove) {
	                remove(vnode);
	            }
	        }
	        if ((shouldInvokeVnodeHook &&
	            (vnodeHook = props && props.onVnodeUnmounted)) ||
	            shouldInvokeDirs) {
	            queuePostRenderEffect(() => {
	                vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
	                shouldInvokeDirs &&
	                    invokeDirectiveHook(vnode, null, parentComponent, 'unmounted');
	            }, parentSuspense);
	        }
	    };
	    const remove = vnode => {
	        const { type, el, anchor, transition } = vnode;
	        if (type === Fragment) {
	            if (vnode.patchFlag > 0 &&
	                vnode.patchFlag & 2048 /* DEV_ROOT_FRAGMENT */ &&
	                transition &&
	                !transition.persisted) {
	                vnode.children.forEach(child => {
	                    if (child.type === Comment) {
	                        hostRemove(child.el);
	                    }
	                    else {
	                        remove(child);
	                    }
	                });
	            }
	            else {
	                removeFragment(el, anchor);
	            }
	            return;
	        }
	        if (type === Static) {
	            removeStaticNode(vnode);
	            return;
	        }
	        const performRemove = () => {
	            hostRemove(el);
	            if (transition && !transition.persisted && transition.afterLeave) {
	                transition.afterLeave();
	            }
	        };
	        if (vnode.shapeFlag & 1 /* ELEMENT */ &&
	            transition &&
	            !transition.persisted) {
	            const { leave, delayLeave } = transition;
	            const performLeave = () => leave(el, performRemove);
	            if (delayLeave) {
	                delayLeave(vnode.el, performRemove, performLeave);
	            }
	            else {
	                performLeave();
	            }
	        }
	        else {
	            performRemove();
	        }
	    };
	    const removeFragment = (cur, end) => {
	        // For fragments, directly remove all contained DOM nodes.
	        // (fragment child nodes cannot have transition)
	        let next;
	        while (cur !== end) {
	            next = hostNextSibling(cur);
	            hostRemove(cur);
	            cur = next;
	        }
	        hostRemove(end);
	    };
	    const unmountComponent = (instance, parentSuspense, doRemove) => {
	        if (instance.type.__hmrId) {
	            unregisterHMR(instance);
	        }
	        const { bum, scope, update, subTree, um } = instance;
	        // beforeUnmount hook
	        if (bum) {
	            shared.invokeArrayFns(bum);
	        }
	        // stop effects in component scope
	        scope.stop();
	        // update may be null if a component is unmounted before its async
	        // setup has resolved.
	        if (update) {
	            // so that scheduler will no longer invoke it
	            update.active = false;
	            unmount(subTree, instance, parentSuspense, doRemove);
	        }
	        // unmounted hook
	        if (um) {
	            queuePostRenderEffect(um, parentSuspense);
	        }
	        queuePostRenderEffect(() => {
	            instance.isUnmounted = true;
	        }, parentSuspense);
	        // A component with async dep inside a pending suspense is unmounted before
	        // its async dep resolves. This should remove the dep from the suspense, and
	        // cause the suspense to resolve immediately if that was the last dep.
	        if (parentSuspense &&
	            parentSuspense.pendingBranch &&
	            !parentSuspense.isUnmounted &&
	            instance.asyncDep &&
	            !instance.asyncResolved &&
	            instance.suspenseId === parentSuspense.pendingId) {
	            parentSuspense.deps--;
	            if (parentSuspense.deps === 0) {
	                parentSuspense.resolve();
	            }
	        }
	        {
	            devtoolsComponentRemoved(instance);
	        }
	    };
	    const unmountChildren = (children, parentComponent, parentSuspense, doRemove = false, optimized = false, start = 0) => {
	        for (let i = start; i < children.length; i++) {
	            unmount(children[i], parentComponent, parentSuspense, doRemove, optimized);
	        }
	    };
	    const getNextHostNode = vnode => {
	        if (vnode.shapeFlag & 6 /* COMPONENT */) {
	            return getNextHostNode(vnode.component.subTree);
	        }
	        if (vnode.shapeFlag & 128 /* SUSPENSE */) {
	            return vnode.suspense.next();
	        }
	        return hostNextSibling((vnode.anchor || vnode.el));
	    };
	    const render = (vnode, container, isSVG) => {
	        if (vnode == null) {
	            if (container._vnode) {
	                unmount(container._vnode, null, null, true);
	            }
	        }
	        else {
	            patch(container._vnode || null, vnode, container, null, null, null, isSVG);
	        }
	        flushPostFlushCbs();
	        container._vnode = vnode;
	    };
	    const internals = {
	        p: patch,
	        um: unmount,
	        m: move,
	        r: remove,
	        mt: mountComponent,
	        mc: mountChildren,
	        pc: patchChildren,
	        pbc: patchBlockChildren,
	        n: getNextHostNode,
	        o: options
	    };
	    let hydrate;
	    let hydrateNode;
	    if (createHydrationFns) {
	        [hydrate, hydrateNode] = createHydrationFns(internals);
	    }
	    return {
	        render,
	        hydrate,
	        createApp: createAppAPI(render, hydrate)
	    };
	}
	function toggleRecurse({ effect, update }, allowed) {
	    effect.allowRecurse = update.allowRecurse = allowed;
	}
	/**
	 * #1156
	 * When a component is HMR-enabled, we need to make sure that all static nodes
	 * inside a block also inherit the DOM element from the previous tree so that
	 * HMR updates (which are full updates) can retrieve the element for patching.
	 *
	 * #2080
	 * Inside keyed `template` fragment static children, if a fragment is moved,
	 * the children will always be moved. Therefore, in order to ensure correct move
	 * position, el should be inherited from previous nodes.
	 */
	function traverseStaticChildren(n1, n2, shallow = false) {
	    const ch1 = n1.children;
	    const ch2 = n2.children;
	    if (shared.isArray(ch1) && shared.isArray(ch2)) {
	        for (let i = 0; i < ch1.length; i++) {
	            // this is only called in the optimized path so array children are
	            // guaranteed to be vnodes
	            const c1 = ch1[i];
	            let c2 = ch2[i];
	            if (c2.shapeFlag & 1 /* ELEMENT */ && !c2.dynamicChildren) {
	                if (c2.patchFlag <= 0 || c2.patchFlag === 32 /* HYDRATE_EVENTS */) {
	                    c2 = ch2[i] = cloneIfMounted(ch2[i]);
	                    c2.el = c1.el;
	                }
	                if (!shallow)
	                    traverseStaticChildren(c1, c2);
	            }
	            // also inherit for comment nodes, but not placeholders (e.g. v-if which
	            // would have received .el during block patch)
	            if (c2.type === Comment && !c2.el) {
	                c2.el = c1.el;
	            }
	        }
	    }
	}
	// https://en.wikipedia.org/wiki/Longest_increasing_subsequence
	function getSequence(arr) {
	    const p = arr.slice();
	    const result = [0];
	    let i, j, u, v, c;
	    const len = arr.length;
	    for (i = 0; i < len; i++) {
	        const arrI = arr[i];
	        if (arrI !== 0) {
	            j = result[result.length - 1];
	            if (arr[j] < arrI) {
	                p[i] = j;
	                result.push(i);
	                continue;
	            }
	            u = 0;
	            v = result.length - 1;
	            while (u < v) {
	                c = (u + v) >> 1;
	                if (arr[result[c]] < arrI) {
	                    u = c + 1;
	                }
	                else {
	                    v = c;
	                }
	            }
	            if (arrI < arr[result[u]]) {
	                if (u > 0) {
	                    p[i] = result[u - 1];
	                }
	                result[u] = i;
	            }
	        }
	    }
	    u = result.length;
	    v = result[u - 1];
	    while (u-- > 0) {
	        result[u] = v;
	        v = p[v];
	    }
	    return result;
	}

	const isTeleport = (type) => type.__isTeleport;
	const isTeleportDisabled = (props) => props && (props.disabled || props.disabled === '');
	const isTargetSVG = (target) => typeof SVGElement !== 'undefined' && target instanceof SVGElement;
	const resolveTarget = (props, select) => {
	    const targetSelector = props && props.to;
	    if (shared.isString(targetSelector)) {
	        if (!select) {
	            warn(`Current renderer does not support string target for Teleports. ` +
	                    `(missing querySelector renderer option)`);
	            return null;
	        }
	        else {
	            const target = select(targetSelector);
	            if (!target) {
	                warn(`Failed to locate Teleport target with selector "${targetSelector}". ` +
	                        `Note the target element must exist before the component is mounted - ` +
	                        `i.e. the target cannot be rendered by the component itself, and ` +
	                        `ideally should be outside of the entire Vue component tree.`);
	            }
	            return target;
	        }
	    }
	    else {
	        if (!targetSelector && !isTeleportDisabled(props)) {
	            warn(`Invalid Teleport target: ${targetSelector}`);
	        }
	        return targetSelector;
	    }
	};
	const TeleportImpl = {
	    __isTeleport: true,
	    process(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized, internals) {
	        const { mc: mountChildren, pc: patchChildren, pbc: patchBlockChildren, o: { insert, querySelector, createText, createComment } } = internals;
	        const disabled = isTeleportDisabled(n2.props);
	        let { shapeFlag, children, dynamicChildren } = n2;
	        // #3302
	        // HMR updated, force full diff
	        if (isHmrUpdating) {
	            optimized = false;
	            dynamicChildren = null;
	        }
	        if (n1 == null) {
	            // insert anchors in the main view
	            const placeholder = (n2.el = createComment('teleport start')
	                );
	            const mainAnchor = (n2.anchor = createComment('teleport end')
	                );
	            insert(placeholder, container, anchor);
	            insert(mainAnchor, container, anchor);
	            const target = (n2.target = resolveTarget(n2.props, querySelector));
	            const targetAnchor = (n2.targetAnchor = createText(''));
	            if (target) {
	                insert(targetAnchor, target);
	                // #2652 we could be teleporting from a non-SVG tree into an SVG tree
	                isSVG = isSVG || isTargetSVG(target);
	            }
	            else if (!disabled) {
	                warn('Invalid Teleport target on mount:', target, `(${typeof target})`);
	            }
	            const mount = (container, anchor) => {
	                // Teleport *always* has Array children. This is enforced in both the
	                // compiler and vnode children normalization.
	                if (shapeFlag & 16 /* ARRAY_CHILDREN */) {
	                    mountChildren(children, container, anchor, parentComponent, parentSuspense, isSVG, slotScopeIds, optimized);
	                }
	            };
	            if (disabled) {
	                mount(container, mainAnchor);
	            }
	            else if (target) {
	                mount(target, targetAnchor);
	            }
	        }
	        else {
	            // update content
	            n2.el = n1.el;
	            const mainAnchor = (n2.anchor = n1.anchor);
	            const target = (n2.target = n1.target);
	            const targetAnchor = (n2.targetAnchor = n1.targetAnchor);
	            const wasDisabled = isTeleportDisabled(n1.props);
	            const currentContainer = wasDisabled ? container : target;
	            const currentAnchor = wasDisabled ? mainAnchor : targetAnchor;
	            isSVG = isSVG || isTargetSVG(target);
	            if (dynamicChildren) {
	                // fast path when the teleport happens to be a block root
	                patchBlockChildren(n1.dynamicChildren, dynamicChildren, currentContainer, parentComponent, parentSuspense, isSVG, slotScopeIds);
	                // even in block tree mode we need to make sure all root-level nodes
	                // in the teleport inherit previous DOM references so that they can
	                // be moved in future patches.
	                traverseStaticChildren(n1, n2, true);
	            }
	            else if (!optimized) {
	                patchChildren(n1, n2, currentContainer, currentAnchor, parentComponent, parentSuspense, isSVG, slotScopeIds, false);
	            }
	            if (disabled) {
	                if (!wasDisabled) {
	                    // enabled -> disabled
	                    // move into main container
	                    moveTeleport(n2, container, mainAnchor, internals, 1 /* TOGGLE */);
	                }
	            }
	            else {
	                // target changed
	                if ((n2.props && n2.props.to) !== (n1.props && n1.props.to)) {
	                    const nextTarget = (n2.target = resolveTarget(n2.props, querySelector));
	                    if (nextTarget) {
	                        moveTeleport(n2, nextTarget, null, internals, 0 /* TARGET_CHANGE */);
	                    }
	                    else {
	                        warn('Invalid Teleport target on update:', target, `(${typeof target})`);
	                    }
	                }
	                else if (wasDisabled) {
	                    // disabled -> enabled
	                    // move into teleport target
	                    moveTeleport(n2, target, targetAnchor, internals, 1 /* TOGGLE */);
	                }
	            }
	        }
	    },
	    remove(vnode, parentComponent, parentSuspense, optimized, { um: unmount, o: { remove: hostRemove } }, doRemove) {
	        const { shapeFlag, children, anchor, targetAnchor, target, props } = vnode;
	        if (target) {
	            hostRemove(targetAnchor);
	        }
	        // an unmounted teleport should always remove its children if not disabled
	        if (doRemove || !isTeleportDisabled(props)) {
	            hostRemove(anchor);
	            if (shapeFlag & 16 /* ARRAY_CHILDREN */) {
	                for (let i = 0; i < children.length; i++) {
	                    const child = children[i];
	                    unmount(child, parentComponent, parentSuspense, true, !!child.dynamicChildren);
	                }
	            }
	        }
	    },
	    move: moveTeleport,
	    hydrate: hydrateTeleport
	};
	function moveTeleport(vnode, container, parentAnchor, { o: { insert }, m: move }, moveType = 2 /* REORDER */) {
	    // move target anchor if this is a target change.
	    if (moveType === 0 /* TARGET_CHANGE */) {
	        insert(vnode.targetAnchor, container, parentAnchor);
	    }
	    const { el, anchor, shapeFlag, children, props } = vnode;
	    const isReorder = moveType === 2 /* REORDER */;
	    // move main view anchor if this is a re-order.
	    if (isReorder) {
	        insert(el, container, parentAnchor);
	    }
	    // if this is a re-order and teleport is enabled (content is in target)
	    // do not move children. So the opposite is: only move children if this
	    // is not a reorder, or the teleport is disabled
	    if (!isReorder || isTeleportDisabled(props)) {
	        // Teleport has either Array children or no children.
	        if (shapeFlag & 16 /* ARRAY_CHILDREN */) {
	            for (let i = 0; i < children.length; i++) {
	                move(children[i], container, parentAnchor, 2 /* REORDER */);
	            }
	        }
	    }
	    // move main view anchor if this is a re-order.
	    if (isReorder) {
	        insert(anchor, container, parentAnchor);
	    }
	}
	function hydrateTeleport(node, vnode, parentComponent, parentSuspense, slotScopeIds, optimized, { o: { nextSibling, parentNode, querySelector } }, hydrateChildren) {
	    const target = (vnode.target = resolveTarget(vnode.props, querySelector));
	    if (target) {
	        // if multiple teleports rendered to the same target element, we need to
	        // pick up from where the last teleport finished instead of the first node
	        const targetNode = target._lpa || target.firstChild;
	        if (vnode.shapeFlag & 16 /* ARRAY_CHILDREN */) {
	            if (isTeleportDisabled(vnode.props)) {
	                vnode.anchor = hydrateChildren(nextSibling(node), vnode, parentNode(node), parentComponent, parentSuspense, slotScopeIds, optimized);
	                vnode.targetAnchor = targetNode;
	            }
	            else {
	                vnode.anchor = nextSibling(node);
	                // lookahead until we find the target anchor
	                // we cannot rely on return value of hydrateChildren() because there
	                // could be nested teleports
	                let targetAnchor = targetNode;
	                while (targetAnchor) {
	                    targetAnchor = nextSibling(targetAnchor);
	                    if (targetAnchor &&
	                        targetAnchor.nodeType === 8 &&
	                        targetAnchor.data === 'teleport anchor') {
	                        vnode.targetAnchor = targetAnchor;
	                        target._lpa =
	                            vnode.targetAnchor && nextSibling(vnode.targetAnchor);
	                        break;
	                    }
	                }
	                hydrateChildren(targetNode, vnode, target, parentComponent, parentSuspense, slotScopeIds, optimized);
	            }
	        }
	    }
	    return vnode.anchor && nextSibling(vnode.anchor);
	}
	// Force-casted public typing for h and TSX props inference
	const Teleport = TeleportImpl;

	const Fragment = Symbol('Fragment' );
	const Text = Symbol('Text' );
	const Comment = Symbol('Comment' );
	const Static = Symbol('Static' );
	// Since v-if and v-for are the two possible ways node structure can dynamically
	// change, once we consider v-if branches and each v-for fragment a block, we
	// can divide a template into nested blocks, and within each block the node
	// structure would be stable. This allows us to skip most children diffing
	// and only worry about the dynamic nodes (indicated by patch flags).
	const blockStack = [];
	let currentBlock = null;
	/**
	 * Open a block.
	 * This must be called before `createBlock`. It cannot be part of `createBlock`
	 * because the children of the block are evaluated before `createBlock` itself
	 * is called. The generated code typically looks like this:
	 *
	 * ```js
	 * function render() {
	 *   return (openBlock(),createBlock('div', null, [...]))
	 * }
	 * ```
	 * disableTracking is true when creating a v-for fragment block, since a v-for
	 * fragment always diffs its children.
	 *
	 * @private
	 */
	function openBlock(disableTracking = false) {
	    blockStack.push((currentBlock = disableTracking ? null : []));
	}
	function closeBlock() {
	    blockStack.pop();
	    currentBlock = blockStack[blockStack.length - 1] || null;
	}
	// Whether we should be tracking dynamic child nodes inside a block.
	// Only tracks when this value is > 0
	// We are not using a simple boolean because this value may need to be
	// incremented/decremented by nested usage of v-once (see below)
	let isBlockTreeEnabled = 1;
	/**
	 * Block tracking sometimes needs to be disabled, for example during the
	 * creation of a tree that needs to be cached by v-once. The compiler generates
	 * code like this:
	 *
	 * ``` js
	 * _cache[1] || (
	 *   setBlockTracking(-1),
	 *   _cache[1] = createVNode(...),
	 *   setBlockTracking(1),
	 *   _cache[1]
	 * )
	 * ```
	 *
	 * @private
	 */
	function setBlockTracking(value) {
	    isBlockTreeEnabled += value;
	}
	function setupBlock(vnode) {
	    // save current block children on the block vnode
	    vnode.dynamicChildren =
	        isBlockTreeEnabled > 0 ? currentBlock || shared.EMPTY_ARR : null;
	    // close block
	    closeBlock();
	    // a block is always going to be patched, so track it as a child of its
	    // parent block
	    if (isBlockTreeEnabled > 0 && currentBlock) {
	        currentBlock.push(vnode);
	    }
	    return vnode;
	}
	/**
	 * @private
	 */
	function createElementBlock(type, props, children, patchFlag, dynamicProps, shapeFlag) {
	    return setupBlock(createBaseVNode(type, props, children, patchFlag, dynamicProps, shapeFlag, true /* isBlock */));
	}
	/**
	 * Create a block root vnode. Takes the same exact arguments as `createVNode`.
	 * A block root keeps track of dynamic nodes within the block in the
	 * `dynamicChildren` array.
	 *
	 * @private
	 */
	function createBlock(type, props, children, patchFlag, dynamicProps) {
	    return setupBlock(createVNode(type, props, children, patchFlag, dynamicProps, true /* isBlock: prevent a block from tracking itself */));
	}
	function isVNode(value) {
	    return value ? value.__v_isVNode === true : false;
	}
	function isSameVNodeType(n1, n2) {
	    if (n2.shapeFlag & 6 /* COMPONENT */ &&
	        hmrDirtyComponents.has(n2.type)) {
	        // HMR only: if the component has been hot-updated, force a reload.
	        return false;
	    }
	    return n1.type === n2.type && n1.key === n2.key;
	}
	let vnodeArgsTransformer;
	/**
	 * Internal API for registering an arguments transform for createVNode
	 * used for creating stubs in the test-utils
	 * It is *internal* but needs to be exposed for test-utils to pick up proper
	 * typings
	 */
	function transformVNodeArgs(transformer) {
	    vnodeArgsTransformer = transformer;
	}
	const createVNodeWithArgsTransform = (...args) => {
	    return _createVNode(...(vnodeArgsTransformer
	        ? vnodeArgsTransformer(args, currentRenderingInstance)
	        : args));
	};
	const InternalObjectKey = `__vInternal`;
	const normalizeKey = ({ key }) => key != null ? key : null;
	const normalizeRef = ({ ref, ref_key, ref_for }) => {
	    return (ref != null
	        ? shared.isString(ref) || reactivity$1.isRef(ref) || shared.isFunction(ref)
	            ? { i: currentRenderingInstance, r: ref, k: ref_key, f: !!ref_for }
	            : ref
	        : null);
	};
	function createBaseVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, shapeFlag = type === Fragment ? 0 : 1 /* ELEMENT */, isBlockNode = false, needFullChildrenNormalization = false) {
	    const vnode = {
	        __v_isVNode: true,
	        __v_skip: true,
	        type,
	        props,
	        key: props && normalizeKey(props),
	        ref: props && normalizeRef(props),
	        scopeId: currentScopeId,
	        slotScopeIds: null,
	        children,
	        component: null,
	        suspense: null,
	        ssContent: null,
	        ssFallback: null,
	        dirs: null,
	        transition: null,
	        el: null,
	        anchor: null,
	        target: null,
	        targetAnchor: null,
	        staticCount: 0,
	        shapeFlag,
	        patchFlag,
	        dynamicProps,
	        dynamicChildren: null,
	        appContext: null
	    };
	    if (needFullChildrenNormalization) {
	        normalizeChildren(vnode, children);
	        // normalize suspense children
	        if (shapeFlag & 128 /* SUSPENSE */) {
	            type.normalize(vnode);
	        }
	    }
	    else if (children) {
	        // compiled element vnode - if children is passed, only possible types are
	        // string or Array.
	        vnode.shapeFlag |= shared.isString(children)
	            ? 8 /* TEXT_CHILDREN */
	            : 16 /* ARRAY_CHILDREN */;
	    }
	    // validate key
	    if (vnode.key !== vnode.key) {
	        warn(`VNode created with invalid key (NaN). VNode type:`, vnode.type);
	    }
	    // track vnode for block tree
	    if (isBlockTreeEnabled > 0 &&
	        // avoid a block node from tracking itself
	        !isBlockNode &&
	        // has current parent block
	        currentBlock &&
	        // presence of a patch flag indicates this node needs patching on updates.
	        // component nodes also should always be patched, because even if the
	        // component doesn't need to update, it needs to persist the instance on to
	        // the next vnode so that it can be properly unmounted later.
	        (vnode.patchFlag > 0 || shapeFlag & 6 /* COMPONENT */) &&
	        // the EVENTS flag is only for hydration and if it is the only flag, the
	        // vnode should not be considered dynamic due to handler caching.
	        vnode.patchFlag !== 32 /* HYDRATE_EVENTS */) {
	        currentBlock.push(vnode);
	    }
	    return vnode;
	}
	const createVNode = (createVNodeWithArgsTransform );
	function _createVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, isBlockNode = false) {
	    if (!type || type === NULL_DYNAMIC_COMPONENT) {
	        if (!type) {
	            warn(`Invalid vnode type when creating vnode: ${type}.`);
	        }
	        type = Comment;
	    }
	    if (isVNode(type)) {
	        // createVNode receiving an existing vnode. This happens in cases like
	        // <component :is="vnode"/>
	        // #2078 make sure to merge refs during the clone instead of overwriting it
	        const cloned = cloneVNode(type, props, true /* mergeRef: true */);
	        if (children) {
	            normalizeChildren(cloned, children);
	        }
	        if (isBlockTreeEnabled > 0 && !isBlockNode && currentBlock) {
	            if (cloned.shapeFlag & 6 /* COMPONENT */) {
	                currentBlock[currentBlock.indexOf(type)] = cloned;
	            }
	            else {
	                currentBlock.push(cloned);
	            }
	        }
	        cloned.patchFlag |= -2 /* BAIL */;
	        return cloned;
	    }
	    // class component normalization.
	    if (isClassComponent(type)) {
	        type = type.__vccOpts;
	    }
	    // class & style normalization.
	    if (props) {
	        // for reactive or proxy objects, we need to clone it to enable mutation.
	        props = guardReactiveProps(props);
	        let { class: klass, style } = props;
	        if (klass && !shared.isString(klass)) {
	            props.class = shared.normalizeClass(klass);
	        }
	        if (shared.isObject(style)) {
	            // reactive state objects need to be cloned since they are likely to be
	            // mutated
	            if (reactivity$1.isProxy(style) && !shared.isArray(style)) {
	                style = shared.extend({}, style);
	            }
	            props.style = shared.normalizeStyle(style);
	        }
	    }
	    // encode the vnode type information into a bitmap
	    const shapeFlag = shared.isString(type)
	        ? 1 /* ELEMENT */
	        : isSuspense(type)
	            ? 128 /* SUSPENSE */
	            : isTeleport(type)
	                ? 64 /* TELEPORT */
	                : shared.isObject(type)
	                    ? 4 /* STATEFUL_COMPONENT */
	                    : shared.isFunction(type)
	                        ? 2 /* FUNCTIONAL_COMPONENT */
	                        : 0;
	    if (shapeFlag & 4 /* STATEFUL_COMPONENT */ && reactivity$1.isProxy(type)) {
	        type = reactivity$1.toRaw(type);
	        warn(`Vue received a Component which was made a reactive object. This can ` +
	            `lead to unnecessary performance overhead, and should be avoided by ` +
	            `marking the component with \`markRaw\` or using \`shallowRef\` ` +
	            `instead of \`ref\`.`, `\nComponent that was made reactive: `, type);
	    }
	    return createBaseVNode(type, props, children, patchFlag, dynamicProps, shapeFlag, isBlockNode, true);
	}
	function guardReactiveProps(props) {
	    if (!props)
	        return null;
	    return reactivity$1.isProxy(props) || InternalObjectKey in props
	        ? shared.extend({}, props)
	        : props;
	}
	function cloneVNode(vnode, extraProps, mergeRef = false) {
	    // This is intentionally NOT using spread or extend to avoid the runtime
	    // key enumeration cost.
	    const { props, ref, patchFlag, children } = vnode;
	    const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props;
	    const cloned = {
	        __v_isVNode: true,
	        __v_skip: true,
	        type: vnode.type,
	        props: mergedProps,
	        key: mergedProps && normalizeKey(mergedProps),
	        ref: extraProps && extraProps.ref
	            ? // #2078 in the case of <component :is="vnode" ref="extra"/>
	                // if the vnode itself already has a ref, cloneVNode will need to merge
	                // the refs so the single vnode can be set on multiple refs
	                mergeRef && ref
	                    ? shared.isArray(ref)
	                        ? ref.concat(normalizeRef(extraProps))
	                        : [ref, normalizeRef(extraProps)]
	                    : normalizeRef(extraProps)
	            : ref,
	        scopeId: vnode.scopeId,
	        slotScopeIds: vnode.slotScopeIds,
	        children: patchFlag === -1 /* HOISTED */ && shared.isArray(children)
	            ? children.map(deepCloneVNode)
	            : children,
	        target: vnode.target,
	        targetAnchor: vnode.targetAnchor,
	        staticCount: vnode.staticCount,
	        shapeFlag: vnode.shapeFlag,
	        // if the vnode is cloned with extra props, we can no longer assume its
	        // existing patch flag to be reliable and need to add the FULL_PROPS flag.
	        // note: preserve flag for fragments since they use the flag for children
	        // fast paths only.
	        patchFlag: extraProps && vnode.type !== Fragment
	            ? patchFlag === -1 // hoisted node
	                ? 16 /* FULL_PROPS */
	                : patchFlag | 16 /* FULL_PROPS */
	            : patchFlag,
	        dynamicProps: vnode.dynamicProps,
	        dynamicChildren: vnode.dynamicChildren,
	        appContext: vnode.appContext,
	        dirs: vnode.dirs,
	        transition: vnode.transition,
	        // These should technically only be non-null on mounted VNodes. However,
	        // they *should* be copied for kept-alive vnodes. So we just always copy
	        // them since them being non-null during a mount doesn't affect the logic as
	        // they will simply be overwritten.
	        component: vnode.component,
	        suspense: vnode.suspense,
	        ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
	        ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
	        el: vnode.el,
	        anchor: vnode.anchor
	    };
	    return cloned;
	}
	/**
	 * Dev only, for HMR of hoisted vnodes reused in v-for
	 * https://github.com/vitejs/vite/issues/2022
	 */
	function deepCloneVNode(vnode) {
	    const cloned = cloneVNode(vnode);
	    if (shared.isArray(vnode.children)) {
	        cloned.children = vnode.children.map(deepCloneVNode);
	    }
	    return cloned;
	}
	/**
	 * @private
	 */
	function createTextVNode(text = ' ', flag = 0) {
	    return createVNode(Text, null, text, flag);
	}
	/**
	 * @private
	 */
	function createStaticVNode(content, numberOfNodes) {
	    // A static vnode can contain multiple stringified elements, and the number
	    // of elements is necessary for hydration.
	    const vnode = createVNode(Static, null, content);
	    vnode.staticCount = numberOfNodes;
	    return vnode;
	}
	/**
	 * @private
	 */
	function createCommentVNode(text = '', 
	// when used as the v-else branch, the comment node must be created as a
	// block to ensure correct updates.
	asBlock = false) {
	    return asBlock
	        ? (openBlock(), createBlock(Comment, null, text))
	        : createVNode(Comment, null, text);
	}
	function normalizeVNode(child) {
	    if (child == null || typeof child === 'boolean') {
	        // empty placeholder
	        return createVNode(Comment);
	    }
	    else if (shared.isArray(child)) {
	        // fragment
	        return createVNode(Fragment, null, 
	        // #3666, avoid reference pollution when reusing vnode
	        child.slice());
	    }
	    else if (typeof child === 'object') {
	        // already vnode, this should be the most common since compiled templates
	        // always produce all-vnode children arrays
	        return cloneIfMounted(child);
	    }
	    else {
	        // strings and numbers
	        return createVNode(Text, null, String(child));
	    }
	}
	// optimized normalization for template-compiled render fns
	function cloneIfMounted(child) {
	    return child.el === null || child.memo ? child : cloneVNode(child);
	}
	function normalizeChildren(vnode, children) {
	    let type = 0;
	    const { shapeFlag } = vnode;
	    if (children == null) {
	        children = null;
	    }
	    else if (shared.isArray(children)) {
	        type = 16 /* ARRAY_CHILDREN */;
	    }
	    else if (typeof children === 'object') {
	        if (shapeFlag & (1 /* ELEMENT */ | 64 /* TELEPORT */)) {
	            // Normalize slot to plain children for plain element and Teleport
	            const slot = children.default;
	            if (slot) {
	                // _c marker is added by withCtx() indicating this is a compiled slot
	                slot._c && (slot._d = false);
	                normalizeChildren(vnode, slot());
	                slot._c && (slot._d = true);
	            }
	            return;
	        }
	        else {
	            type = 32 /* SLOTS_CHILDREN */;
	            const slotFlag = children._;
	            if (!slotFlag && !(InternalObjectKey in children)) {
	                children._ctx = currentRenderingInstance;
	            }
	            else if (slotFlag === 3 /* FORWARDED */ && currentRenderingInstance) {
	                // a child component receives forwarded slots from the parent.
	                // its slot type is determined by its parent's slot type.
	                if (currentRenderingInstance.slots._ === 1 /* STABLE */) {
	                    children._ = 1 /* STABLE */;
	                }
	                else {
	                    children._ = 2 /* DYNAMIC */;
	                    vnode.patchFlag |= 1024 /* DYNAMIC_SLOTS */;
	                }
	            }
	        }
	    }
	    else if (shared.isFunction(children)) {
	        children = { default: children, _ctx: currentRenderingInstance };
	        type = 32 /* SLOTS_CHILDREN */;
	    }
	    else {
	        children = String(children);
	        // force teleport children to array so it can be moved around
	        if (shapeFlag & 64 /* TELEPORT */) {
	            type = 16 /* ARRAY_CHILDREN */;
	            children = [createTextVNode(children)];
	        }
	        else {
	            type = 8 /* TEXT_CHILDREN */;
	        }
	    }
	    vnode.children = children;
	    vnode.shapeFlag |= type;
	}
	function mergeProps(...args) {
	    const ret = {};
	    for (let i = 0; i < args.length; i++) {
	        const toMerge = args[i];
	        for (const key in toMerge) {
	            if (key === 'class') {
	                if (ret.class !== toMerge.class) {
	                    ret.class = shared.normalizeClass([ret.class, toMerge.class]);
	                }
	            }
	            else if (key === 'style') {
	                ret.style = shared.normalizeStyle([ret.style, toMerge.style]);
	            }
	            else if (shared.isOn(key)) {
	                const existing = ret[key];
	                const incoming = toMerge[key];
	                if (incoming &&
	                    existing !== incoming &&
	                    !(shared.isArray(existing) && existing.includes(incoming))) {
	                    ret[key] = existing
	                        ? [].concat(existing, incoming)
	                        : incoming;
	                }
	            }
	            else if (key !== '') {
	                ret[key] = toMerge[key];
	            }
	        }
	    }
	    return ret;
	}
	function invokeVNodeHook(hook, instance, vnode, prevVNode = null) {
	    callWithAsyncErrorHandling(hook, instance, 7 /* VNODE_HOOK */, [
	        vnode,
	        prevVNode
	    ]);
	}

	const emptyAppContext = createAppContext();
	let uid$1 = 0;
	function createComponentInstance(vnode, parent, suspense) {
	    const type = vnode.type;
	    // inherit parent app context - or - if root, adopt from root vnode
	    const appContext = (parent ? parent.appContext : vnode.appContext) || emptyAppContext;
	    const instance = {
	        uid: uid$1++,
	        vnode,
	        type,
	        parent,
	        appContext,
	        root: null,
	        next: null,
	        subTree: null,
	        effect: null,
	        update: null,
	        scope: new reactivity$1.EffectScope(true /* detached */),
	        render: null,
	        proxy: null,
	        exposed: null,
	        exposeProxy: null,
	        withProxy: null,
	        provides: parent ? parent.provides : Object.create(appContext.provides),
	        accessCache: null,
	        renderCache: [],
	        // local resolved assets
	        components: null,
	        directives: null,
	        // resolved props and emits options
	        propsOptions: normalizePropsOptions(type, appContext),
	        emitsOptions: normalizeEmitsOptions(type, appContext),
	        // emit
	        emit: null,
	        emitted: null,
	        // props default value
	        propsDefaults: shared.EMPTY_OBJ,
	        // inheritAttrs
	        inheritAttrs: type.inheritAttrs,
	        // state
	        ctx: shared.EMPTY_OBJ,
	        data: shared.EMPTY_OBJ,
	        props: shared.EMPTY_OBJ,
	        attrs: shared.EMPTY_OBJ,
	        slots: shared.EMPTY_OBJ,
	        refs: shared.EMPTY_OBJ,
	        setupState: shared.EMPTY_OBJ,
	        setupContext: null,
	        // suspense related
	        suspense,
	        suspenseId: suspense ? suspense.pendingId : 0,
	        asyncDep: null,
	        asyncResolved: false,
	        // lifecycle hooks
	        // not using enums here because it results in computed properties
	        isMounted: false,
	        isUnmounted: false,
	        isDeactivated: false,
	        bc: null,
	        c: null,
	        bm: null,
	        m: null,
	        bu: null,
	        u: null,
	        um: null,
	        bum: null,
	        da: null,
	        a: null,
	        rtg: null,
	        rtc: null,
	        ec: null,
	        sp: null
	    };
	    {
	        instance.ctx = createDevRenderContext(instance);
	    }
	    instance.root = parent ? parent.root : instance;
	    instance.emit = emit$1.bind(null, instance);
	    // apply custom element special handling
	    if (vnode.ce) {
	        vnode.ce(instance);
	    }
	    return instance;
	}
	let currentInstance = null;
	const getCurrentInstance = () => currentInstance || currentRenderingInstance;
	const setCurrentInstance = (instance) => {
	    currentInstance = instance;
	    instance.scope.on();
	};
	const unsetCurrentInstance = () => {
	    currentInstance && currentInstance.scope.off();
	    currentInstance = null;
	};
	const isBuiltInTag = /*#__PURE__*/ shared.makeMap('slot,component');
	function validateComponentName(name, config) {
	    const appIsNativeTag = config.isNativeTag || shared.NO;
	    if (isBuiltInTag(name) || appIsNativeTag(name)) {
	        warn('Do not use built-in or reserved HTML elements as component id: ' + name);
	    }
	}
	function isStatefulComponent(instance) {
	    return instance.vnode.shapeFlag & 4 /* STATEFUL_COMPONENT */;
	}
	let isInSSRComponentSetup = false;
	function setupComponent(instance, isSSR = false) {
	    isInSSRComponentSetup = isSSR;
	    const { props, children } = instance.vnode;
	    const isStateful = isStatefulComponent(instance);
	    initProps(instance, props, isStateful, isSSR);
	    initSlots(instance, children);
	    const setupResult = isStateful
	        ? setupStatefulComponent(instance, isSSR)
	        : undefined;
	    isInSSRComponentSetup = false;
	    return setupResult;
	}
	function setupStatefulComponent(instance, isSSR) {
	    var _a;
	    const Component = instance.type;
	    {
	        if (Component.name) {
	            validateComponentName(Component.name, instance.appContext.config);
	        }
	        if (Component.components) {
	            const names = Object.keys(Component.components);
	            for (let i = 0; i < names.length; i++) {
	                validateComponentName(names[i], instance.appContext.config);
	            }
	        }
	        if (Component.directives) {
	            const names = Object.keys(Component.directives);
	            for (let i = 0; i < names.length; i++) {
	                validateDirectiveName(names[i]);
	            }
	        }
	        if (Component.compilerOptions && isRuntimeOnly()) {
	            warn(`"compilerOptions" is only supported when using a build of Vue that ` +
	                `includes the runtime compiler. Since you are using a runtime-only ` +
	                `build, the options should be passed via your build tool config instead.`);
	        }
	    }
	    // 0. create render proxy property access cache
	    instance.accessCache = Object.create(null);
	    // 1. create public instance / render proxy
	    // also mark it raw so it's never observed
	    instance.proxy = reactivity$1.markRaw(new Proxy(instance.ctx, PublicInstanceProxyHandlers));
	    {
	        exposePropsOnRenderContext(instance);
	    }
	    // 2. call setup()
	    const { setup } = Component;
	    if (setup) {
	        const setupContext = (instance.setupContext =
	            setup.length > 1 ? createSetupContext(instance) : null);
	        setCurrentInstance(instance);
	        reactivity$1.pauseTracking();
	        const setupResult = callWithErrorHandling(setup, instance, 0 /* SETUP_FUNCTION */, [reactivity$1.shallowReadonly(instance.props) , setupContext]);
	        reactivity$1.resetTracking();
	        unsetCurrentInstance();
	        if (shared.isPromise(setupResult)) {
	            setupResult.then(unsetCurrentInstance, unsetCurrentInstance);
	            if (isSSR) {
	                // return the promise so server-renderer can wait on it
	                return setupResult
	                    .then((resolvedResult) => {
	                    handleSetupResult(instance, resolvedResult, isSSR);
	                })
	                    .catch(e => {
	                    handleError(e, instance, 0 /* SETUP_FUNCTION */);
	                });
	            }
	            else {
	                // async setup returned Promise.
	                // bail here and wait for re-entry.
	                instance.asyncDep = setupResult;
	                if (!instance.suspense) {
	                    const name = (_a = Component.name) !== null && _a !== void 0 ? _a : 'Anonymous';
	                    warn(`Component <${name}>: setup function returned a promise, but no ` +
	                        `<Suspense> boundary was found in the parent component tree. ` +
	                        `A component with async setup() must be nested in a <Suspense> ` +
	                        `in order to be rendered.`);
	                }
	            }
	        }
	        else {
	            handleSetupResult(instance, setupResult, isSSR);
	        }
	    }
	    else {
	        finishComponentSetup(instance, isSSR);
	    }
	}
	function handleSetupResult(instance, setupResult, isSSR) {
	    if (shared.isFunction(setupResult)) {
	        // setup returned an inline render function
	        if (instance.type.__ssrInlineRender) {
	            // when the function's name is `ssrRender` (compiled by SFC inline mode),
	            // set it as ssrRender instead.
	            instance.ssrRender = setupResult;
	        }
	        else {
	            instance.render = setupResult;
	        }
	    }
	    else if (shared.isObject(setupResult)) {
	        if (isVNode(setupResult)) {
	            warn(`setup() should not return VNodes directly - ` +
	                `return a render function instead.`);
	        }
	        // setup returned bindings.
	        // assuming a render function compiled from template is present.
	        {
	            instance.devtoolsRawSetupState = setupResult;
	        }
	        instance.setupState = reactivity$1.proxyRefs(setupResult);
	        {
	            exposeSetupStateOnRenderContext(instance);
	        }
	    }
	    else if (setupResult !== undefined) {
	        warn(`setup() should return an object. Received: ${setupResult === null ? 'null' : typeof setupResult}`);
	    }
	    finishComponentSetup(instance, isSSR);
	}
	let compile;
	let installWithProxy;
	/**
	 * For runtime-dom to register the compiler.
	 * Note the exported method uses any to avoid d.ts relying on the compiler types.
	 */
	function registerRuntimeCompiler(_compile) {
	    compile = _compile;
	    installWithProxy = i => {
	        if (i.render._rc) {
	            i.withProxy = new Proxy(i.ctx, RuntimeCompiledPublicInstanceProxyHandlers);
	        }
	    };
	}
	// dev only
	const isRuntimeOnly = () => !compile;
	function finishComponentSetup(instance, isSSR, skipOptions) {
	    const Component = instance.type;
	    // template / render function normalization
	    // could be already set when returned from setup()
	    if (!instance.render) {
	        // only do on-the-fly compile if not in SSR - SSR on-the-fly compilation
	        // is done by server-renderer
	        if (!isSSR && compile && !Component.render) {
	            const template = Component.template;
	            if (template) {
	                {
	                    startMeasure(instance, `compile`);
	                }
	                const { isCustomElement, compilerOptions } = instance.appContext.config;
	                const { delimiters, compilerOptions: componentCompilerOptions } = Component;
	                const finalCompilerOptions = shared.extend(shared.extend({
	                    isCustomElement,
	                    delimiters
	                }, compilerOptions), componentCompilerOptions);
	                Component.render = compile(template, finalCompilerOptions);
	                {
	                    endMeasure(instance, `compile`);
	                }
	            }
	        }
	        instance.render = (Component.render || shared.NOOP);
	        // for runtime-compiled render functions using `with` blocks, the render
	        // proxy used needs a different `has` handler which is more performant and
	        // also only allows a whitelist of globals to fallthrough.
	        if (installWithProxy) {
	            installWithProxy(instance);
	        }
	    }
	    // support for 2.x options
	    {
	        setCurrentInstance(instance);
	        reactivity$1.pauseTracking();
	        applyOptions(instance);
	        reactivity$1.resetTracking();
	        unsetCurrentInstance();
	    }
	    // warn missing template/render
	    // the runtime compilation of template in SSR is done by server-render
	    if (!Component.render && instance.render === shared.NOOP && !isSSR) {
	        /* istanbul ignore if */
	        if (!compile && Component.template) {
	            warn(`Component provided template option but ` +
	                `runtime compilation is not supported in this build of Vue.` +
	                (``) /* should not happen */);
	        }
	        else {
	            warn(`Component is missing template or render function.`);
	        }
	    }
	}
	function createAttrsProxy(instance) {
	    return new Proxy(instance.attrs, {
	            get(target, key) {
	                markAttrsAccessed();
	                reactivity$1.track(instance, "get" /* GET */, '$attrs');
	                return target[key];
	            },
	            set() {
	                warn(`setupContext.attrs is readonly.`);
	                return false;
	            },
	            deleteProperty() {
	                warn(`setupContext.attrs is readonly.`);
	                return false;
	            }
	        }
	        );
	}
	function createSetupContext(instance) {
	    const expose = exposed => {
	        if (instance.exposed) {
	            warn(`expose() should be called only once per setup().`);
	        }
	        instance.exposed = exposed || {};
	    };
	    let attrs;
	    {
	        // We use getters in dev in case libs like test-utils overwrite instance
	        // properties (overwrites should not be done in prod)
	        return Object.freeze({
	            get attrs() {
	                return attrs || (attrs = createAttrsProxy(instance));
	            },
	            get slots() {
	                return reactivity$1.shallowReadonly(instance.slots);
	            },
	            get emit() {
	                return (event, ...args) => instance.emit(event, ...args);
	            },
	            expose
	        });
	    }
	}
	function getExposeProxy(instance) {
	    if (instance.exposed) {
	        return (instance.exposeProxy ||
	            (instance.exposeProxy = new Proxy(reactivity$1.proxyRefs(reactivity$1.markRaw(instance.exposed)), {
	                get(target, key) {
	                    if (key in target) {
	                        return target[key];
	                    }
	                    else if (key in publicPropertiesMap) {
	                        return publicPropertiesMap[key](instance);
	                    }
	                }
	            })));
	    }
	}
	const classifyRE = /(?:^|[-_])(\w)/g;
	const classify = (str) => str.replace(classifyRE, c => c.toUpperCase()).replace(/[-_]/g, '');
	function getComponentName(Component, includeInferred = true) {
	    return shared.isFunction(Component)
	        ? Component.displayName || Component.name
	        : Component.name || (includeInferred && Component.__name);
	}
	/* istanbul ignore next */
	function formatComponentName(instance, Component, isRoot = false) {
	    let name = getComponentName(Component);
	    if (!name && Component.__file) {
	        const match = Component.__file.match(/([^/\\]+)\.\w+$/);
	        if (match) {
	            name = match[1];
	        }
	    }
	    if (!name && instance && instance.parent) {
	        // try to infer the name based on reverse resolution
	        const inferFromRegistry = (registry) => {
	            for (const key in registry) {
	                if (registry[key] === Component) {
	                    return key;
	                }
	            }
	        };
	        name =
	            inferFromRegistry(instance.components ||
	                instance.parent.type.components) || inferFromRegistry(instance.appContext.components);
	    }
	    return name ? classify(name) : isRoot ? `App` : `Anonymous`;
	}
	function isClassComponent(value) {
	    return shared.isFunction(value) && '__vccOpts' in value;
	}

	const computed = ((getterOrOptions, debugOptions) => {
	    // @ts-ignore
	    return reactivity$1.computed(getterOrOptions, debugOptions, isInSSRComponentSetup);
	});

	// dev only
	const warnRuntimeUsage = (method) => warn(`${method}() is a compiler-hint helper that is only usable inside ` +
	    `<script setup> of a single file component. Its arguments should be ` +
	    `compiled away and passing it at runtime has no effect.`);
	// implementation
	function defineProps() {
	    {
	        warnRuntimeUsage(`defineProps`);
	    }
	    return null;
	}
	// implementation
	function defineEmits() {
	    {
	        warnRuntimeUsage(`defineEmits`);
	    }
	    return null;
	}
	/**
	 * Vue `<script setup>` compiler macro for declaring a component's exposed
	 * instance properties when it is accessed by a parent component via template
	 * refs.
	 *
	 * `<script setup>` components are closed by default - i.e. variables inside
	 * the `<script setup>` scope is not exposed to parent unless explicitly exposed
	 * via `defineExpose`.
	 *
	 * This is only usable inside `<script setup>`, is compiled away in the
	 * output and should **not** be actually called at runtime.
	 */
	function defineExpose(exposed) {
	    {
	        warnRuntimeUsage(`defineExpose`);
	    }
	}
	/**
	 * Vue `<script setup>` compiler macro for providing props default values when
	 * using type-based `defineProps` declaration.
	 *
	 * Example usage:
	 * ```ts
	 * withDefaults(defineProps<{
	 *   size?: number
	 *   labels?: string[]
	 * }>(), {
	 *   size: 3,
	 *   labels: () => ['default label']
	 * })
	 * ```
	 *
	 * This is only usable inside `<script setup>`, is compiled away in the output
	 * and should **not** be actually called at runtime.
	 */
	function withDefaults(props, defaults) {
	    {
	        warnRuntimeUsage(`withDefaults`);
	    }
	    return null;
	}
	function useSlots() {
	    return getContext().slots;
	}
	function useAttrs() {
	    return getContext().attrs;
	}
	function getContext() {
	    const i = getCurrentInstance();
	    if (!i) {
	        warn(`useContext() called without active instance.`);
	    }
	    return i.setupContext || (i.setupContext = createSetupContext(i));
	}
	/**
	 * Runtime helper for merging default declarations. Imported by compiled code
	 * only.
	 * @internal
	 */
	function mergeDefaults(raw, defaults) {
	    const props = shared.isArray(raw)
	        ? raw.reduce((normalized, p) => ((normalized[p] = {}), normalized), {})
	        : raw;
	    for (const key in defaults) {
	        const opt = props[key];
	        if (opt) {
	            if (shared.isArray(opt) || shared.isFunction(opt)) {
	                props[key] = { type: opt, default: defaults[key] };
	            }
	            else {
	                opt.default = defaults[key];
	            }
	        }
	        else if (opt === null) {
	            props[key] = { default: defaults[key] };
	        }
	        else {
	            warn(`props default key "${key}" has no corresponding declaration.`);
	        }
	    }
	    return props;
	}
	/**
	 * Used to create a proxy for the rest element when destructuring props with
	 * defineProps().
	 * @internal
	 */
	function createPropsRestProxy(props, excludedKeys) {
	    const ret = {};
	    for (const key in props) {
	        if (!excludedKeys.includes(key)) {
	            Object.defineProperty(ret, key, {
	                enumerable: true,
	                get: () => props[key]
	            });
	        }
	    }
	    return ret;
	}
	/**
	 * `<script setup>` helper for persisting the current instance context over
	 * async/await flows.
	 *
	 * `@vue/compiler-sfc` converts the following:
	 *
	 * ```ts
	 * const x = await foo()
	 * ```
	 *
	 * into:
	 *
	 * ```ts
	 * let __temp, __restore
	 * const x = (([__temp, __restore] = withAsyncContext(() => foo())),__temp=await __temp,__restore(),__temp)
	 * ```
	 * @internal
	 */
	function withAsyncContext(getAwaitable) {
	    const ctx = getCurrentInstance();
	    if (!ctx) {
	        warn(`withAsyncContext called without active current instance. ` +
	            `This is likely a bug.`);
	    }
	    let awaitable = getAwaitable();
	    unsetCurrentInstance();
	    if (shared.isPromise(awaitable)) {
	        awaitable = awaitable.catch(e => {
	            setCurrentInstance(ctx);
	            throw e;
	        });
	    }
	    return [awaitable, () => setCurrentInstance(ctx)];
	}

	// Actual implementation
	function h(type, propsOrChildren, children) {
	    const l = arguments.length;
	    if (l === 2) {
	        if (shared.isObject(propsOrChildren) && !shared.isArray(propsOrChildren)) {
	            // single vnode without props
	            if (isVNode(propsOrChildren)) {
	                return createVNode(type, null, [propsOrChildren]);
	            }
	            // props without children
	            return createVNode(type, propsOrChildren);
	        }
	        else {
	            // omit props
	            return createVNode(type, null, propsOrChildren);
	        }
	    }
	    else {
	        if (l > 3) {
	            children = Array.prototype.slice.call(arguments, 2);
	        }
	        else if (l === 3 && isVNode(children)) {
	            children = [children];
	        }
	        return createVNode(type, propsOrChildren, children);
	    }
	}

	const ssrContextKey = Symbol(`ssrContext` );
	const useSSRContext = () => {
	    {
	        const ctx = inject(ssrContextKey);
	        if (!ctx) {
	            warn(`Server rendering context not provided. Make sure to only call ` +
	                `useSSRContext() conditionally in the server build.`);
	        }
	        return ctx;
	    }
	};

	function initCustomFormatter() {
	    /* eslint-disable no-restricted-globals */
	    {
	        return;
	    }
	}

	function withMemo(memo, render, cache, index) {
	    const cached = cache[index];
	    if (cached && isMemoSame(cached, memo)) {
	        return cached;
	    }
	    const ret = render();
	    // shallow clone
	    ret.memo = memo.slice();
	    return (cache[index] = ret);
	}
	function isMemoSame(cached, memo) {
	    const prev = cached.memo;
	    if (prev.length != memo.length) {
	        return false;
	    }
	    for (let i = 0; i < prev.length; i++) {
	        if (shared.hasChanged(prev[i], memo[i])) {
	            return false;
	        }
	    }
	    // make sure to let parent block track it when returning cached
	    if (isBlockTreeEnabled > 0 && currentBlock) {
	        currentBlock.push(cached);
	    }
	    return true;
	}

	// Core API ------------------------------------------------------------------
	const version = "3.2.37";
	const _ssrUtils = {
	    createComponentInstance,
	    setupComponent,
	    renderComponentRoot,
	    setCurrentRenderingInstance,
	    isVNode,
	    normalizeVNode
	};
	/**
	 * SSR utils for \@vue/server-renderer. Only exposed in ssr-possible builds.
	 * @internal
	 */
	const ssrUtils = (_ssrUtils );
	/**
	 * @internal only exposed in compat builds
	 */
	const resolveFilter = null;
	/**
	 * @internal only exposed in compat builds.
	 */
	const compatUtils = (null);

	exports.EffectScope = reactivity$1.EffectScope;
	exports.ReactiveEffect = reactivity$1.ReactiveEffect;
	exports.customRef = reactivity$1.customRef;
	exports.effect = reactivity$1.effect;
	exports.effectScope = reactivity$1.effectScope;
	exports.getCurrentScope = reactivity$1.getCurrentScope;
	exports.isProxy = reactivity$1.isProxy;
	exports.isReactive = reactivity$1.isReactive;
	exports.isReadonly = reactivity$1.isReadonly;
	exports.isRef = reactivity$1.isRef;
	exports.isShallow = reactivity$1.isShallow;
	exports.markRaw = reactivity$1.markRaw;
	exports.onScopeDispose = reactivity$1.onScopeDispose;
	exports.proxyRefs = reactivity$1.proxyRefs;
	exports.reactive = reactivity$1.reactive;
	exports.readonly = reactivity$1.readonly;
	exports.ref = reactivity$1.ref;
	exports.shallowReactive = reactivity$1.shallowReactive;
	exports.shallowReadonly = reactivity$1.shallowReadonly;
	exports.shallowRef = reactivity$1.shallowRef;
	exports.stop = reactivity$1.stop;
	exports.toRaw = reactivity$1.toRaw;
	exports.toRef = reactivity$1.toRef;
	exports.toRefs = reactivity$1.toRefs;
	exports.triggerRef = reactivity$1.triggerRef;
	exports.unref = reactivity$1.unref;
	exports.camelize = shared.camelize;
	exports.capitalize = shared.capitalize;
	exports.normalizeClass = shared.normalizeClass;
	exports.normalizeProps = shared.normalizeProps;
	exports.normalizeStyle = shared.normalizeStyle;
	exports.toDisplayString = shared.toDisplayString;
	exports.toHandlerKey = shared.toHandlerKey;
	exports.BaseTransition = BaseTransition;
	exports.Comment = Comment;
	exports.Fragment = Fragment;
	exports.KeepAlive = KeepAlive;
	exports.Static = Static;
	exports.Suspense = Suspense;
	exports.Teleport = Teleport;
	exports.Text = Text;
	exports.callWithAsyncErrorHandling = callWithAsyncErrorHandling;
	exports.callWithErrorHandling = callWithErrorHandling;
	exports.cloneVNode = cloneVNode;
	exports.compatUtils = compatUtils;
	exports.computed = computed;
	exports.createBlock = createBlock;
	exports.createCommentVNode = createCommentVNode;
	exports.createElementBlock = createElementBlock;
	exports.createElementVNode = createBaseVNode;
	exports.createHydrationRenderer = createHydrationRenderer;
	exports.createPropsRestProxy = createPropsRestProxy;
	exports.createRenderer = createRenderer;
	exports.createSlots = createSlots;
	exports.createStaticVNode = createStaticVNode;
	exports.createTextVNode = createTextVNode;
	exports.createVNode = createVNode;
	exports.defineAsyncComponent = defineAsyncComponent;
	exports.defineComponent = defineComponent;
	exports.defineEmits = defineEmits;
	exports.defineExpose = defineExpose;
	exports.defineProps = defineProps;
	exports.getCurrentInstance = getCurrentInstance;
	exports.getTransitionRawChildren = getTransitionRawChildren;
	exports.guardReactiveProps = guardReactiveProps;
	exports.h = h;
	exports.handleError = handleError;
	exports.initCustomFormatter = initCustomFormatter;
	exports.inject = inject;
	exports.isMemoSame = isMemoSame;
	exports.isRuntimeOnly = isRuntimeOnly;
	exports.isVNode = isVNode;
	exports.mergeDefaults = mergeDefaults;
	exports.mergeProps = mergeProps;
	exports.nextTick = nextTick;
	exports.onActivated = onActivated;
	exports.onBeforeMount = onBeforeMount;
	exports.onBeforeUnmount = onBeforeUnmount;
	exports.onBeforeUpdate = onBeforeUpdate;
	exports.onDeactivated = onDeactivated;
	exports.onErrorCaptured = onErrorCaptured;
	exports.onMounted = onMounted;
	exports.onRenderTracked = onRenderTracked;
	exports.onRenderTriggered = onRenderTriggered;
	exports.onServerPrefetch = onServerPrefetch;
	exports.onUnmounted = onUnmounted;
	exports.onUpdated = onUpdated;
	exports.openBlock = openBlock;
	exports.popScopeId = popScopeId;
	exports.provide = provide;
	exports.pushScopeId = pushScopeId;
	exports.queuePostFlushCb = queuePostFlushCb;
	exports.registerRuntimeCompiler = registerRuntimeCompiler;
	exports.renderList = renderList;
	exports.renderSlot = renderSlot;
	exports.resolveComponent = resolveComponent;
	exports.resolveDirective = resolveDirective;
	exports.resolveDynamicComponent = resolveDynamicComponent;
	exports.resolveFilter = resolveFilter;
	exports.resolveTransitionHooks = resolveTransitionHooks;
	exports.setBlockTracking = setBlockTracking;
	exports.setDevtoolsHook = setDevtoolsHook;
	exports.setTransitionHooks = setTransitionHooks;
	exports.ssrContextKey = ssrContextKey;
	exports.ssrUtils = ssrUtils;
	exports.toHandlers = toHandlers;
	exports.transformVNodeArgs = transformVNodeArgs;
	exports.useAttrs = useAttrs;
	exports.useSSRContext = useSSRContext;
	exports.useSlots = useSlots;
	exports.useTransitionState = useTransitionState;
	exports.version = version;
	exports.warn = warn;
	exports.watch = watch;
	exports.watchEffect = watchEffect;
	exports.watchPostEffect = watchPostEffect;
	exports.watchSyncEffect = watchSyncEffect;
	exports.withAsyncContext = withAsyncContext;
	exports.withCtx = withCtx;
	exports.withDefaults = withDefaults;
	exports.withDirectives = withDirectives;
	exports.withMemo = withMemo;
	exports.withScopeId = withScopeId;
} (runtimeCore_cjs));

(function (module) {

	{
	  module.exports = runtimeCore_cjs;
	}
} (runtimeCore));

(function (exports) {

	Object.defineProperty(exports, '__esModule', { value: true });

	var runtimeCore$1 = runtimeCore.exports;
	var shared = shared$2.exports;

	const svgNS = 'http://www.w3.org/2000/svg';
	const doc = (typeof document !== 'undefined' ? document : null);
	const templateContainer = doc && /*#__PURE__*/ doc.createElement('template');
	const nodeOps = {
	    insert: (child, parent, anchor) => {
	        parent.insertBefore(child, anchor || null);
	    },
	    remove: child => {
	        const parent = child.parentNode;
	        if (parent) {
	            parent.removeChild(child);
	        }
	    },
	    createElement: (tag, isSVG, is, props) => {
	        const el = isSVG
	            ? doc.createElementNS(svgNS, tag)
	            : doc.createElement(tag, is ? { is } : undefined);
	        if (tag === 'select' && props && props.multiple != null) {
	            el.setAttribute('multiple', props.multiple);
	        }
	        return el;
	    },
	    createText: text => doc.createTextNode(text),
	    createComment: text => doc.createComment(text),
	    setText: (node, text) => {
	        node.nodeValue = text;
	    },
	    setElementText: (el, text) => {
	        el.textContent = text;
	    },
	    parentNode: node => node.parentNode,
	    nextSibling: node => node.nextSibling,
	    querySelector: selector => doc.querySelector(selector),
	    setScopeId(el, id) {
	        el.setAttribute(id, '');
	    },
	    cloneNode(el) {
	        const cloned = el.cloneNode(true);
	        // #3072
	        // - in `patchDOMProp`, we store the actual value in the `el._value` property.
	        // - normally, elements using `:value` bindings will not be hoisted, but if
	        //   the bound value is a constant, e.g. `:value="true"` - they do get
	        //   hoisted.
	        // - in production, hoisted nodes are cloned when subsequent inserts, but
	        //   cloneNode() does not copy the custom property we attached.
	        // - This may need to account for other custom DOM properties we attach to
	        //   elements in addition to `_value` in the future.
	        if (`_value` in el) {
	            cloned._value = el._value;
	        }
	        return cloned;
	    },
	    // __UNSAFE__
	    // Reason: innerHTML.
	    // Static content here can only come from compiled templates.
	    // As long as the user only uses trusted templates, this is safe.
	    insertStaticContent(content, parent, anchor, isSVG, start, end) {
	        // <parent> before | first ... last | anchor </parent>
	        const before = anchor ? anchor.previousSibling : parent.lastChild;
	        // #5308 can only take cached path if:
	        // - has a single root node
	        // - nextSibling info is still available
	        if (start && (start === end || start.nextSibling)) {
	            // cached
	            while (true) {
	                parent.insertBefore(start.cloneNode(true), anchor);
	                if (start === end || !(start = start.nextSibling))
	                    break;
	            }
	        }
	        else {
	            // fresh insert
	            templateContainer.innerHTML = isSVG ? `<svg>${content}</svg>` : content;
	            const template = templateContainer.content;
	            if (isSVG) {
	                // remove outer svg wrapper
	                const wrapper = template.firstChild;
	                while (wrapper.firstChild) {
	                    template.appendChild(wrapper.firstChild);
	                }
	                template.removeChild(wrapper);
	            }
	            parent.insertBefore(template, anchor);
	        }
	        return [
	            // first
	            before ? before.nextSibling : parent.firstChild,
	            // last
	            anchor ? anchor.previousSibling : parent.lastChild
	        ];
	    }
	};

	// compiler should normalize class + :class bindings on the same element
	// into a single binding ['staticClass', dynamic]
	function patchClass(el, value, isSVG) {
	    // directly setting className should be faster than setAttribute in theory
	    // if this is an element during a transition, take the temporary transition
	    // classes into account.
	    const transitionClasses = el._vtc;
	    if (transitionClasses) {
	        value = (value ? [value, ...transitionClasses] : [...transitionClasses]).join(' ');
	    }
	    if (value == null) {
	        el.removeAttribute('class');
	    }
	    else if (isSVG) {
	        el.setAttribute('class', value);
	    }
	    else {
	        el.className = value;
	    }
	}

	function patchStyle(el, prev, next) {
	    const style = el.style;
	    const isCssString = shared.isString(next);
	    if (next && !isCssString) {
	        for (const key in next) {
	            setStyle(style, key, next[key]);
	        }
	        if (prev && !shared.isString(prev)) {
	            for (const key in prev) {
	                if (next[key] == null) {
	                    setStyle(style, key, '');
	                }
	            }
	        }
	    }
	    else {
	        const currentDisplay = style.display;
	        if (isCssString) {
	            if (prev !== next) {
	                style.cssText = next;
	            }
	        }
	        else if (prev) {
	            el.removeAttribute('style');
	        }
	        // indicates that the `display` of the element is controlled by `v-show`,
	        // so we always keep the current `display` value regardless of the `style`
	        // value, thus handing over control to `v-show`.
	        if ('_vod' in el) {
	            style.display = currentDisplay;
	        }
	    }
	}
	const importantRE = /\s*!important$/;
	function setStyle(style, name, val) {
	    if (shared.isArray(val)) {
	        val.forEach(v => setStyle(style, name, v));
	    }
	    else {
	        if (val == null)
	            val = '';
	        if (name.startsWith('--')) {
	            // custom property definition
	            style.setProperty(name, val);
	        }
	        else {
	            const prefixed = autoPrefix(style, name);
	            if (importantRE.test(val)) {
	                // !important
	                style.setProperty(shared.hyphenate(prefixed), val.replace(importantRE, ''), 'important');
	            }
	            else {
	                style[prefixed] = val;
	            }
	        }
	    }
	}
	const prefixes = ['Webkit', 'Moz', 'ms'];
	const prefixCache = {};
	function autoPrefix(style, rawName) {
	    const cached = prefixCache[rawName];
	    if (cached) {
	        return cached;
	    }
	    let name = runtimeCore$1.camelize(rawName);
	    if (name !== 'filter' && name in style) {
	        return (prefixCache[rawName] = name);
	    }
	    name = shared.capitalize(name);
	    for (let i = 0; i < prefixes.length; i++) {
	        const prefixed = prefixes[i] + name;
	        if (prefixed in style) {
	            return (prefixCache[rawName] = prefixed);
	        }
	    }
	    return rawName;
	}

	const xlinkNS = 'http://www.w3.org/1999/xlink';
	function patchAttr(el, key, value, isSVG, instance) {
	    if (isSVG && key.startsWith('xlink:')) {
	        if (value == null) {
	            el.removeAttributeNS(xlinkNS, key.slice(6, key.length));
	        }
	        else {
	            el.setAttributeNS(xlinkNS, key, value);
	        }
	    }
	    else {
	        // note we are only checking boolean attributes that don't have a
	        // corresponding dom prop of the same name here.
	        const isBoolean = shared.isSpecialBooleanAttr(key);
	        if (value == null || (isBoolean && !shared.includeBooleanAttr(value))) {
	            el.removeAttribute(key);
	        }
	        else {
	            el.setAttribute(key, isBoolean ? '' : value);
	        }
	    }
	}

	// __UNSAFE__
	// functions. The user is responsible for using them with only trusted content.
	function patchDOMProp(el, key, value, 
	// the following args are passed only due to potential innerHTML/textContent
	// overriding existing VNodes, in which case the old tree must be properly
	// unmounted.
	prevChildren, parentComponent, parentSuspense, unmountChildren) {
	    if (key === 'innerHTML' || key === 'textContent') {
	        if (prevChildren) {
	            unmountChildren(prevChildren, parentComponent, parentSuspense);
	        }
	        el[key] = value == null ? '' : value;
	        return;
	    }
	    if (key === 'value' &&
	        el.tagName !== 'PROGRESS' &&
	        // custom elements may use _value internally
	        !el.tagName.includes('-')) {
	        // store value as _value as well since
	        // non-string values will be stringified.
	        el._value = value;
	        const newValue = value == null ? '' : value;
	        if (el.value !== newValue ||
	            // #4956: always set for OPTION elements because its value falls back to
	            // textContent if no value attribute is present. And setting .value for
	            // OPTION has no side effect
	            el.tagName === 'OPTION') {
	            el.value = newValue;
	        }
	        if (value == null) {
	            el.removeAttribute(key);
	        }
	        return;
	    }
	    let needRemove = false;
	    if (value === '' || value == null) {
	        const type = typeof el[key];
	        if (type === 'boolean') {
	            // e.g. <select multiple> compiles to { multiple: '' }
	            value = shared.includeBooleanAttr(value);
	        }
	        else if (value == null && type === 'string') {
	            // e.g. <div :id="null">
	            value = '';
	            needRemove = true;
	        }
	        else if (type === 'number') {
	            // e.g. <img :width="null">
	            // the value of some IDL attr must be greater than 0, e.g. input.size = 0 -> error
	            value = 0;
	            needRemove = true;
	        }
	    }
	    // some properties perform value validation and throw,
	    // some properties has getter, no setter, will error in 'use strict'
	    // eg. <select :type="null"></select> <select :willValidate="null"></select>
	    try {
	        el[key] = value;
	    }
	    catch (e) {
	        {
	            runtimeCore$1.warn(`Failed setting prop "${key}" on <${el.tagName.toLowerCase()}>: ` +
	                `value ${value} is invalid.`, e);
	        }
	    }
	    needRemove && el.removeAttribute(key);
	}

	// Async edge case fix requires storing an event listener's attach timestamp.
	const [_getNow, skipTimestampCheck] = /*#__PURE__*/ (() => {
	    let _getNow = Date.now;
	    let skipTimestampCheck = false;
	    return [_getNow, skipTimestampCheck];
	})();
	// To avoid the overhead of repeatedly calling performance.now(), we cache
	// and use the same timestamp for all event listeners attached in the same tick.
	let cachedNow = 0;
	const p = /*#__PURE__*/ Promise.resolve();
	const reset = () => {
	    cachedNow = 0;
	};
	const getNow = () => cachedNow || (p.then(reset), (cachedNow = _getNow()));
	function addEventListener(el, event, handler, options) {
	    el.addEventListener(event, handler, options);
	}
	function removeEventListener(el, event, handler, options) {
	    el.removeEventListener(event, handler, options);
	}
	function patchEvent(el, rawName, prevValue, nextValue, instance = null) {
	    // vei = vue event invokers
	    const invokers = el._vei || (el._vei = {});
	    const existingInvoker = invokers[rawName];
	    if (nextValue && existingInvoker) {
	        // patch
	        existingInvoker.value = nextValue;
	    }
	    else {
	        const [name, options] = parseName(rawName);
	        if (nextValue) {
	            // add
	            const invoker = (invokers[rawName] = createInvoker(nextValue, instance));
	            addEventListener(el, name, invoker, options);
	        }
	        else if (existingInvoker) {
	            // remove
	            removeEventListener(el, name, existingInvoker, options);
	            invokers[rawName] = undefined;
	        }
	    }
	}
	const optionsModifierRE = /(?:Once|Passive|Capture)$/;
	function parseName(name) {
	    let options;
	    if (optionsModifierRE.test(name)) {
	        options = {};
	        let m;
	        while ((m = name.match(optionsModifierRE))) {
	            name = name.slice(0, name.length - m[0].length);
	            options[m[0].toLowerCase()] = true;
	        }
	    }
	    return [shared.hyphenate(name.slice(2)), options];
	}
	function createInvoker(initialValue, instance) {
	    const invoker = (e) => {
	        // async edge case #6566: inner click event triggers patch, event handler
	        // attached to outer element during patch, and triggered again. This
	        // happens because browsers fire microtask ticks between event propagation.
	        // the solution is simple: we save the timestamp when a handler is attached,
	        // and the handler would only fire if the event passed to it was fired
	        // AFTER it was attached.
	        const timeStamp = e.timeStamp || _getNow();
	        if (skipTimestampCheck || timeStamp >= invoker.attached - 1) {
	            runtimeCore$1.callWithAsyncErrorHandling(patchStopImmediatePropagation(e, invoker.value), instance, 5 /* NATIVE_EVENT_HANDLER */, [e]);
	        }
	    };
	    invoker.value = initialValue;
	    invoker.attached = getNow();
	    return invoker;
	}
	function patchStopImmediatePropagation(e, value) {
	    if (shared.isArray(value)) {
	        const originalStop = e.stopImmediatePropagation;
	        e.stopImmediatePropagation = () => {
	            originalStop.call(e);
	            e._stopped = true;
	        };
	        return value.map(fn => (e) => !e._stopped && fn && fn(e));
	    }
	    else {
	        return value;
	    }
	}

	const nativeOnRE = /^on[a-z]/;
	const patchProp = (el, key, prevValue, nextValue, isSVG = false, prevChildren, parentComponent, parentSuspense, unmountChildren) => {
	    if (key === 'class') {
	        patchClass(el, nextValue, isSVG);
	    }
	    else if (key === 'style') {
	        patchStyle(el, prevValue, nextValue);
	    }
	    else if (shared.isOn(key)) {
	        // ignore v-model listeners
	        if (!shared.isModelListener(key)) {
	            patchEvent(el, key, prevValue, nextValue, parentComponent);
	        }
	    }
	    else if (key[0] === '.'
	        ? ((key = key.slice(1)), true)
	        : key[0] === '^'
	            ? ((key = key.slice(1)), false)
	            : shouldSetAsProp(el, key, nextValue, isSVG)) {
	        patchDOMProp(el, key, nextValue, prevChildren, parentComponent, parentSuspense, unmountChildren);
	    }
	    else {
	        // special case for <input v-model type="checkbox"> with
	        // :true-value & :false-value
	        // store value as dom properties since non-string values will be
	        // stringified.
	        if (key === 'true-value') {
	            el._trueValue = nextValue;
	        }
	        else if (key === 'false-value') {
	            el._falseValue = nextValue;
	        }
	        patchAttr(el, key, nextValue, isSVG);
	    }
	};
	function shouldSetAsProp(el, key, value, isSVG) {
	    if (isSVG) {
	        // most keys must be set as attribute on svg elements to work
	        // ...except innerHTML & textContent
	        if (key === 'innerHTML' || key === 'textContent') {
	            return true;
	        }
	        // or native onclick with function values
	        if (key in el && nativeOnRE.test(key) && shared.isFunction(value)) {
	            return true;
	        }
	        return false;
	    }
	    // these are enumerated attrs, however their corresponding DOM properties
	    // are actually booleans - this leads to setting it with a string "false"
	    // value leading it to be coerced to `true`, so we need to always treat
	    // them as attributes.
	    // Note that `contentEditable` doesn't have this problem: its DOM
	    // property is also enumerated string values.
	    if (key === 'spellcheck' || key === 'draggable' || key === 'translate') {
	        return false;
	    }
	    // #1787, #2840 form property on form elements is readonly and must be set as
	    // attribute.
	    if (key === 'form') {
	        return false;
	    }
	    // #1526 <input list> must be set as attribute
	    if (key === 'list' && el.tagName === 'INPUT') {
	        return false;
	    }
	    // #2766 <textarea type> must be set as attribute
	    if (key === 'type' && el.tagName === 'TEXTAREA') {
	        return false;
	    }
	    // native onclick with string value, must be set as attribute
	    if (nativeOnRE.test(key) && shared.isString(value)) {
	        return false;
	    }
	    return key in el;
	}

	function defineCustomElement(options, hydrate) {
	    const Comp = runtimeCore$1.defineComponent(options);
	    class VueCustomElement extends VueElement {
	        constructor(initialProps) {
	            super(Comp, initialProps, hydrate);
	        }
	    }
	    VueCustomElement.def = Comp;
	    return VueCustomElement;
	}
	const defineSSRCustomElement = ((options) => {
	    // @ts-ignore
	    return defineCustomElement(options, hydrate);
	});
	const BaseClass = (typeof HTMLElement !== 'undefined' ? HTMLElement : class {
	});
	class VueElement extends BaseClass {
	    constructor(_def, _props = {}, hydrate) {
	        super();
	        this._def = _def;
	        this._props = _props;
	        /**
	         * @internal
	         */
	        this._instance = null;
	        this._connected = false;
	        this._resolved = false;
	        this._numberProps = null;
	        if (this.shadowRoot && hydrate) {
	            hydrate(this._createVNode(), this.shadowRoot);
	        }
	        else {
	            if (this.shadowRoot) {
	                runtimeCore$1.warn(`Custom element has pre-rendered declarative shadow root but is not ` +
	                    `defined as hydratable. Use \`defineSSRCustomElement\`.`);
	            }
	            this.attachShadow({ mode: 'open' });
	        }
	    }
	    connectedCallback() {
	        this._connected = true;
	        if (!this._instance) {
	            this._resolveDef();
	        }
	    }
	    disconnectedCallback() {
	        this._connected = false;
	        runtimeCore$1.nextTick(() => {
	            if (!this._connected) {
	                render(null, this.shadowRoot);
	                this._instance = null;
	            }
	        });
	    }
	    /**
	     * resolve inner component definition (handle possible async component)
	     */
	    _resolveDef() {
	        if (this._resolved) {
	            return;
	        }
	        this._resolved = true;
	        // set initial attrs
	        for (let i = 0; i < this.attributes.length; i++) {
	            this._setAttr(this.attributes[i].name);
	        }
	        // watch future attr changes
	        new MutationObserver(mutations => {
	            for (const m of mutations) {
	                this._setAttr(m.attributeName);
	            }
	        }).observe(this, { attributes: true });
	        const resolve = (def) => {
	            const { props, styles } = def;
	            const hasOptions = !shared.isArray(props);
	            const rawKeys = props ? (hasOptions ? Object.keys(props) : props) : [];
	            // cast Number-type props set before resolve
	            let numberProps;
	            if (hasOptions) {
	                for (const key in this._props) {
	                    const opt = props[key];
	                    if (opt === Number || (opt && opt.type === Number)) {
	                        this._props[key] = shared.toNumber(this._props[key]);
	                        (numberProps || (numberProps = Object.create(null)))[key] = true;
	                    }
	                }
	            }
	            this._numberProps = numberProps;
	            // check if there are props set pre-upgrade or connect
	            for (const key of Object.keys(this)) {
	                if (key[0] !== '_') {
	                    this._setProp(key, this[key], true, false);
	                }
	            }
	            // defining getter/setters on prototype
	            for (const key of rawKeys.map(shared.camelize)) {
	                Object.defineProperty(this, key, {
	                    get() {
	                        return this._getProp(key);
	                    },
	                    set(val) {
	                        this._setProp(key, val);
	                    }
	                });
	            }
	            // apply CSS
	            this._applyStyles(styles);
	            // initial render
	            this._update();
	        };
	        const asyncDef = this._def.__asyncLoader;
	        if (asyncDef) {
	            asyncDef().then(resolve);
	        }
	        else {
	            resolve(this._def);
	        }
	    }
	    _setAttr(key) {
	        let value = this.getAttribute(key);
	        if (this._numberProps && this._numberProps[key]) {
	            value = shared.toNumber(value);
	        }
	        this._setProp(shared.camelize(key), value, false);
	    }
	    /**
	     * @internal
	     */
	    _getProp(key) {
	        return this._props[key];
	    }
	    /**
	     * @internal
	     */
	    _setProp(key, val, shouldReflect = true, shouldUpdate = true) {
	        if (val !== this._props[key]) {
	            this._props[key] = val;
	            if (shouldUpdate && this._instance) {
	                this._update();
	            }
	            // reflect
	            if (shouldReflect) {
	                if (val === true) {
	                    this.setAttribute(shared.hyphenate(key), '');
	                }
	                else if (typeof val === 'string' || typeof val === 'number') {
	                    this.setAttribute(shared.hyphenate(key), val + '');
	                }
	                else if (!val) {
	                    this.removeAttribute(shared.hyphenate(key));
	                }
	            }
	        }
	    }
	    _update() {
	        render(this._createVNode(), this.shadowRoot);
	    }
	    _createVNode() {
	        const vnode = runtimeCore$1.createVNode(this._def, shared.extend({}, this._props));
	        if (!this._instance) {
	            vnode.ce = instance => {
	                this._instance = instance;
	                instance.isCE = true;
	                // HMR
	                {
	                    instance.ceReload = newStyles => {
	                        // always reset styles
	                        if (this._styles) {
	                            this._styles.forEach(s => this.shadowRoot.removeChild(s));
	                            this._styles.length = 0;
	                        }
	                        this._applyStyles(newStyles);
	                        // if this is an async component, ceReload is called from the inner
	                        // component so no need to reload the async wrapper
	                        if (!this._def.__asyncLoader) {
	                            // reload
	                            this._instance = null;
	                            this._update();
	                        }
	                    };
	                }
	                // intercept emit
	                instance.emit = (event, ...args) => {
	                    this.dispatchEvent(new CustomEvent(event, {
	                        detail: args
	                    }));
	                };
	                // locate nearest Vue custom element parent for provide/inject
	                let parent = this;
	                while ((parent =
	                    parent && (parent.parentNode || parent.host))) {
	                    if (parent instanceof VueElement) {
	                        instance.parent = parent._instance;
	                        break;
	                    }
	                }
	            };
	        }
	        return vnode;
	    }
	    _applyStyles(styles) {
	        if (styles) {
	            styles.forEach(css => {
	                const s = document.createElement('style');
	                s.textContent = css;
	                this.shadowRoot.appendChild(s);
	                // record for HMR
	                {
	                    (this._styles || (this._styles = [])).push(s);
	                }
	            });
	        }
	    }
	}

	function useCssModule(name = '$style') {
	    /* istanbul ignore else */
	    {
	        const instance = runtimeCore$1.getCurrentInstance();
	        if (!instance) {
	            runtimeCore$1.warn(`useCssModule must be called inside setup()`);
	            return shared.EMPTY_OBJ;
	        }
	        const modules = instance.type.__cssModules;
	        if (!modules) {
	            runtimeCore$1.warn(`Current instance does not have CSS modules injected.`);
	            return shared.EMPTY_OBJ;
	        }
	        const mod = modules[name];
	        if (!mod) {
	            runtimeCore$1.warn(`Current instance does not have CSS module named "${name}".`);
	            return shared.EMPTY_OBJ;
	        }
	        return mod;
	    }
	}

	/**
	 * Runtime helper for SFC's CSS variable injection feature.
	 * @private
	 */
	function useCssVars(getter) {
	    return;
	}

	const TRANSITION = 'transition';
	const ANIMATION = 'animation';
	// DOM Transition is a higher-order-component based on the platform-agnostic
	// base Transition component, with DOM-specific logic.
	const Transition = (props, { slots }) => runtimeCore$1.h(runtimeCore$1.BaseTransition, resolveTransitionProps(props), slots);
	Transition.displayName = 'Transition';
	const DOMTransitionPropsValidators = {
	    name: String,
	    type: String,
	    css: {
	        type: Boolean,
	        default: true
	    },
	    duration: [String, Number, Object],
	    enterFromClass: String,
	    enterActiveClass: String,
	    enterToClass: String,
	    appearFromClass: String,
	    appearActiveClass: String,
	    appearToClass: String,
	    leaveFromClass: String,
	    leaveActiveClass: String,
	    leaveToClass: String
	};
	const TransitionPropsValidators = (Transition.props =
	    /*#__PURE__*/ shared.extend({}, runtimeCore$1.BaseTransition.props, DOMTransitionPropsValidators));
	/**
	 * #3227 Incoming hooks may be merged into arrays when wrapping Transition
	 * with custom HOCs.
	 */
	const callHook = (hook, args = []) => {
	    if (shared.isArray(hook)) {
	        hook.forEach(h => h(...args));
	    }
	    else if (hook) {
	        hook(...args);
	    }
	};
	/**
	 * Check if a hook expects a callback (2nd arg), which means the user
	 * intends to explicitly control the end of the transition.
	 */
	const hasExplicitCallback = (hook) => {
	    return hook
	        ? shared.isArray(hook)
	            ? hook.some(h => h.length > 1)
	            : hook.length > 1
	        : false;
	};
	function resolveTransitionProps(rawProps) {
	    const baseProps = {};
	    for (const key in rawProps) {
	        if (!(key in DOMTransitionPropsValidators)) {
	            baseProps[key] = rawProps[key];
	        }
	    }
	    if (rawProps.css === false) {
	        return baseProps;
	    }
	    const { name = 'v', type, duration, enterFromClass = `${name}-enter-from`, enterActiveClass = `${name}-enter-active`, enterToClass = `${name}-enter-to`, appearFromClass = enterFromClass, appearActiveClass = enterActiveClass, appearToClass = enterToClass, leaveFromClass = `${name}-leave-from`, leaveActiveClass = `${name}-leave-active`, leaveToClass = `${name}-leave-to` } = rawProps;
	    const durations = normalizeDuration(duration);
	    const enterDuration = durations && durations[0];
	    const leaveDuration = durations && durations[1];
	    const { onBeforeEnter, onEnter, onEnterCancelled, onLeave, onLeaveCancelled, onBeforeAppear = onBeforeEnter, onAppear = onEnter, onAppearCancelled = onEnterCancelled } = baseProps;
	    const finishEnter = (el, isAppear, done) => {
	        removeTransitionClass(el, isAppear ? appearToClass : enterToClass);
	        removeTransitionClass(el, isAppear ? appearActiveClass : enterActiveClass);
	        done && done();
	    };
	    const finishLeave = (el, done) => {
	        el._isLeaving = false;
	        removeTransitionClass(el, leaveFromClass);
	        removeTransitionClass(el, leaveToClass);
	        removeTransitionClass(el, leaveActiveClass);
	        done && done();
	    };
	    const makeEnterHook = (isAppear) => {
	        return (el, done) => {
	            const hook = isAppear ? onAppear : onEnter;
	            const resolve = () => finishEnter(el, isAppear, done);
	            callHook(hook, [el, resolve]);
	            nextFrame(() => {
	                removeTransitionClass(el, isAppear ? appearFromClass : enterFromClass);
	                addTransitionClass(el, isAppear ? appearToClass : enterToClass);
	                if (!hasExplicitCallback(hook)) {
	                    whenTransitionEnds(el, type, enterDuration, resolve);
	                }
	            });
	        };
	    };
	    return shared.extend(baseProps, {
	        onBeforeEnter(el) {
	            callHook(onBeforeEnter, [el]);
	            addTransitionClass(el, enterFromClass);
	            addTransitionClass(el, enterActiveClass);
	        },
	        onBeforeAppear(el) {
	            callHook(onBeforeAppear, [el]);
	            addTransitionClass(el, appearFromClass);
	            addTransitionClass(el, appearActiveClass);
	        },
	        onEnter: makeEnterHook(false),
	        onAppear: makeEnterHook(true),
	        onLeave(el, done) {
	            el._isLeaving = true;
	            const resolve = () => finishLeave(el, done);
	            addTransitionClass(el, leaveFromClass);
	            // force reflow so *-leave-from classes immediately take effect (#2593)
	            forceReflow();
	            addTransitionClass(el, leaveActiveClass);
	            nextFrame(() => {
	                if (!el._isLeaving) {
	                    // cancelled
	                    return;
	                }
	                removeTransitionClass(el, leaveFromClass);
	                addTransitionClass(el, leaveToClass);
	                if (!hasExplicitCallback(onLeave)) {
	                    whenTransitionEnds(el, type, leaveDuration, resolve);
	                }
	            });
	            callHook(onLeave, [el, resolve]);
	        },
	        onEnterCancelled(el) {
	            finishEnter(el, false);
	            callHook(onEnterCancelled, [el]);
	        },
	        onAppearCancelled(el) {
	            finishEnter(el, true);
	            callHook(onAppearCancelled, [el]);
	        },
	        onLeaveCancelled(el) {
	            finishLeave(el);
	            callHook(onLeaveCancelled, [el]);
	        }
	    });
	}
	function normalizeDuration(duration) {
	    if (duration == null) {
	        return null;
	    }
	    else if (shared.isObject(duration)) {
	        return [NumberOf(duration.enter), NumberOf(duration.leave)];
	    }
	    else {
	        const n = NumberOf(duration);
	        return [n, n];
	    }
	}
	function NumberOf(val) {
	    const res = shared.toNumber(val);
	    validateDuration(res);
	    return res;
	}
	function validateDuration(val) {
	    if (typeof val !== 'number') {
	        runtimeCore$1.warn(`<transition> explicit duration is not a valid number - ` +
	            `got ${JSON.stringify(val)}.`);
	    }
	    else if (isNaN(val)) {
	        runtimeCore$1.warn(`<transition> explicit duration is NaN - ` +
	            'the duration expression might be incorrect.');
	    }
	}
	function addTransitionClass(el, cls) {
	    cls.split(/\s+/).forEach(c => c && el.classList.add(c));
	    (el._vtc ||
	        (el._vtc = new Set())).add(cls);
	}
	function removeTransitionClass(el, cls) {
	    cls.split(/\s+/).forEach(c => c && el.classList.remove(c));
	    const { _vtc } = el;
	    if (_vtc) {
	        _vtc.delete(cls);
	        if (!_vtc.size) {
	            el._vtc = undefined;
	        }
	    }
	}
	function nextFrame(cb) {
	    requestAnimationFrame(() => {
	        requestAnimationFrame(cb);
	    });
	}
	let endId = 0;
	function whenTransitionEnds(el, expectedType, explicitTimeout, resolve) {
	    const id = (el._endId = ++endId);
	    const resolveIfNotStale = () => {
	        if (id === el._endId) {
	            resolve();
	        }
	    };
	    if (explicitTimeout) {
	        return setTimeout(resolveIfNotStale, explicitTimeout);
	    }
	    const { type, timeout, propCount } = getTransitionInfo(el, expectedType);
	    if (!type) {
	        return resolve();
	    }
	    const endEvent = type + 'end';
	    let ended = 0;
	    const end = () => {
	        el.removeEventListener(endEvent, onEnd);
	        resolveIfNotStale();
	    };
	    const onEnd = (e) => {
	        if (e.target === el && ++ended >= propCount) {
	            end();
	        }
	    };
	    setTimeout(() => {
	        if (ended < propCount) {
	            end();
	        }
	    }, timeout + 1);
	    el.addEventListener(endEvent, onEnd);
	}
	function getTransitionInfo(el, expectedType) {
	    const styles = window.getComputedStyle(el);
	    // JSDOM may return undefined for transition properties
	    const getStyleProperties = (key) => (styles[key] || '').split(', ');
	    const transitionDelays = getStyleProperties(TRANSITION + 'Delay');
	    const transitionDurations = getStyleProperties(TRANSITION + 'Duration');
	    const transitionTimeout = getTimeout(transitionDelays, transitionDurations);
	    const animationDelays = getStyleProperties(ANIMATION + 'Delay');
	    const animationDurations = getStyleProperties(ANIMATION + 'Duration');
	    const animationTimeout = getTimeout(animationDelays, animationDurations);
	    let type = null;
	    let timeout = 0;
	    let propCount = 0;
	    /* istanbul ignore if */
	    if (expectedType === TRANSITION) {
	        if (transitionTimeout > 0) {
	            type = TRANSITION;
	            timeout = transitionTimeout;
	            propCount = transitionDurations.length;
	        }
	    }
	    else if (expectedType === ANIMATION) {
	        if (animationTimeout > 0) {
	            type = ANIMATION;
	            timeout = animationTimeout;
	            propCount = animationDurations.length;
	        }
	    }
	    else {
	        timeout = Math.max(transitionTimeout, animationTimeout);
	        type =
	            timeout > 0
	                ? transitionTimeout > animationTimeout
	                    ? TRANSITION
	                    : ANIMATION
	                : null;
	        propCount = type
	            ? type === TRANSITION
	                ? transitionDurations.length
	                : animationDurations.length
	            : 0;
	    }
	    const hasTransform = type === TRANSITION &&
	        /\b(transform|all)(,|$)/.test(styles[TRANSITION + 'Property']);
	    return {
	        type,
	        timeout,
	        propCount,
	        hasTransform
	    };
	}
	function getTimeout(delays, durations) {
	    while (delays.length < durations.length) {
	        delays = delays.concat(delays);
	    }
	    return Math.max(...durations.map((d, i) => toMs(d) + toMs(delays[i])));
	}
	// Old versions of Chromium (below 61.0.3163.100) formats floating pointer
	// numbers in a locale-dependent way, using a comma instead of a dot.
	// If comma is not replaced with a dot, the input will be rounded down
	// (i.e. acting as a floor function) causing unexpected behaviors
	function toMs(s) {
	    return Number(s.slice(0, -1).replace(',', '.')) * 1000;
	}
	// synchronously force layout to put elements into a certain state
	function forceReflow() {
	    return document.body.offsetHeight;
	}

	const positionMap = new WeakMap();
	const newPositionMap = new WeakMap();
	const TransitionGroupImpl = {
	    name: 'TransitionGroup',
	    props: /*#__PURE__*/ shared.extend({}, TransitionPropsValidators, {
	        tag: String,
	        moveClass: String
	    }),
	    setup(props, { slots }) {
	        const instance = runtimeCore$1.getCurrentInstance();
	        const state = runtimeCore$1.useTransitionState();
	        let prevChildren;
	        let children;
	        runtimeCore$1.onUpdated(() => {
	            // children is guaranteed to exist after initial render
	            if (!prevChildren.length) {
	                return;
	            }
	            const moveClass = props.moveClass || `${props.name || 'v'}-move`;
	            if (!hasCSSTransform(prevChildren[0].el, instance.vnode.el, moveClass)) {
	                return;
	            }
	            // we divide the work into three loops to avoid mixing DOM reads and writes
	            // in each iteration - which helps prevent layout thrashing.
	            prevChildren.forEach(callPendingCbs);
	            prevChildren.forEach(recordPosition);
	            const movedChildren = prevChildren.filter(applyTranslation);
	            // force reflow to put everything in position
	            forceReflow();
	            movedChildren.forEach(c => {
	                const el = c.el;
	                const style = el.style;
	                addTransitionClass(el, moveClass);
	                style.transform = style.webkitTransform = style.transitionDuration = '';
	                const cb = (el._moveCb = (e) => {
	                    if (e && e.target !== el) {
	                        return;
	                    }
	                    if (!e || /transform$/.test(e.propertyName)) {
	                        el.removeEventListener('transitionend', cb);
	                        el._moveCb = null;
	                        removeTransitionClass(el, moveClass);
	                    }
	                });
	                el.addEventListener('transitionend', cb);
	            });
	        });
	        return () => {
	            const rawProps = runtimeCore$1.toRaw(props);
	            const cssTransitionProps = resolveTransitionProps(rawProps);
	            let tag = rawProps.tag || runtimeCore$1.Fragment;
	            prevChildren = children;
	            children = slots.default ? runtimeCore$1.getTransitionRawChildren(slots.default()) : [];
	            for (let i = 0; i < children.length; i++) {
	                const child = children[i];
	                if (child.key != null) {
	                    runtimeCore$1.setTransitionHooks(child, runtimeCore$1.resolveTransitionHooks(child, cssTransitionProps, state, instance));
	                }
	                else {
	                    runtimeCore$1.warn(`<TransitionGroup> children must be keyed.`);
	                }
	            }
	            if (prevChildren) {
	                for (let i = 0; i < prevChildren.length; i++) {
	                    const child = prevChildren[i];
	                    runtimeCore$1.setTransitionHooks(child, runtimeCore$1.resolveTransitionHooks(child, cssTransitionProps, state, instance));
	                    positionMap.set(child, child.el.getBoundingClientRect());
	                }
	            }
	            return runtimeCore$1.createVNode(tag, null, children);
	        };
	    }
	};
	const TransitionGroup = TransitionGroupImpl;
	function callPendingCbs(c) {
	    const el = c.el;
	    if (el._moveCb) {
	        el._moveCb();
	    }
	    if (el._enterCb) {
	        el._enterCb();
	    }
	}
	function recordPosition(c) {
	    newPositionMap.set(c, c.el.getBoundingClientRect());
	}
	function applyTranslation(c) {
	    const oldPos = positionMap.get(c);
	    const newPos = newPositionMap.get(c);
	    const dx = oldPos.left - newPos.left;
	    const dy = oldPos.top - newPos.top;
	    if (dx || dy) {
	        const s = c.el.style;
	        s.transform = s.webkitTransform = `translate(${dx}px,${dy}px)`;
	        s.transitionDuration = '0s';
	        return c;
	    }
	}
	function hasCSSTransform(el, root, moveClass) {
	    // Detect whether an element with the move class applied has
	    // CSS transitions. Since the element may be inside an entering
	    // transition at this very moment, we make a clone of it and remove
	    // all other transition classes applied to ensure only the move class
	    // is applied.
	    const clone = el.cloneNode();
	    if (el._vtc) {
	        el._vtc.forEach(cls => {
	            cls.split(/\s+/).forEach(c => c && clone.classList.remove(c));
	        });
	    }
	    moveClass.split(/\s+/).forEach(c => c && clone.classList.add(c));
	    clone.style.display = 'none';
	    const container = (root.nodeType === 1 ? root : root.parentNode);
	    container.appendChild(clone);
	    const { hasTransform } = getTransitionInfo(clone);
	    container.removeChild(clone);
	    return hasTransform;
	}

	const getModelAssigner = (vnode) => {
	    const fn = vnode.props['onUpdate:modelValue'] ||
	        (false );
	    return shared.isArray(fn) ? value => shared.invokeArrayFns(fn, value) : fn;
	};
	function onCompositionStart(e) {
	    e.target.composing = true;
	}
	function onCompositionEnd(e) {
	    const target = e.target;
	    if (target.composing) {
	        target.composing = false;
	        target.dispatchEvent(new Event('input'));
	    }
	}
	// We are exporting the v-model runtime directly as vnode hooks so that it can
	// be tree-shaken in case v-model is never used.
	const vModelText = {
	    created(el, { modifiers: { lazy, trim, number } }, vnode) {
	        el._assign = getModelAssigner(vnode);
	        const castToNumber = number || (vnode.props && vnode.props.type === 'number');
	        addEventListener(el, lazy ? 'change' : 'input', e => {
	            if (e.target.composing)
	                return;
	            let domValue = el.value;
	            if (trim) {
	                domValue = domValue.trim();
	            }
	            if (castToNumber) {
	                domValue = shared.toNumber(domValue);
	            }
	            el._assign(domValue);
	        });
	        if (trim) {
	            addEventListener(el, 'change', () => {
	                el.value = el.value.trim();
	            });
	        }
	        if (!lazy) {
	            addEventListener(el, 'compositionstart', onCompositionStart);
	            addEventListener(el, 'compositionend', onCompositionEnd);
	            // Safari < 10.2 & UIWebView doesn't fire compositionend when
	            // switching focus before confirming composition choice
	            // this also fixes the issue where some browsers e.g. iOS Chrome
	            // fires "change" instead of "input" on autocomplete.
	            addEventListener(el, 'change', onCompositionEnd);
	        }
	    },
	    // set value on mounted so it's after min/max for type="range"
	    mounted(el, { value }) {
	        el.value = value == null ? '' : value;
	    },
	    beforeUpdate(el, { value, modifiers: { lazy, trim, number } }, vnode) {
	        el._assign = getModelAssigner(vnode);
	        // avoid clearing unresolved text. #2302
	        if (el.composing)
	            return;
	        if (document.activeElement === el && el.type !== 'range') {
	            if (lazy) {
	                return;
	            }
	            if (trim && el.value.trim() === value) {
	                return;
	            }
	            if ((number || el.type === 'number') && shared.toNumber(el.value) === value) {
	                return;
	            }
	        }
	        const newValue = value == null ? '' : value;
	        if (el.value !== newValue) {
	            el.value = newValue;
	        }
	    }
	};
	const vModelCheckbox = {
	    // #4096 array checkboxes need to be deep traversed
	    deep: true,
	    created(el, _, vnode) {
	        el._assign = getModelAssigner(vnode);
	        addEventListener(el, 'change', () => {
	            const modelValue = el._modelValue;
	            const elementValue = getValue(el);
	            const checked = el.checked;
	            const assign = el._assign;
	            if (shared.isArray(modelValue)) {
	                const index = shared.looseIndexOf(modelValue, elementValue);
	                const found = index !== -1;
	                if (checked && !found) {
	                    assign(modelValue.concat(elementValue));
	                }
	                else if (!checked && found) {
	                    const filtered = [...modelValue];
	                    filtered.splice(index, 1);
	                    assign(filtered);
	                }
	            }
	            else if (shared.isSet(modelValue)) {
	                const cloned = new Set(modelValue);
	                if (checked) {
	                    cloned.add(elementValue);
	                }
	                else {
	                    cloned.delete(elementValue);
	                }
	                assign(cloned);
	            }
	            else {
	                assign(getCheckboxValue(el, checked));
	            }
	        });
	    },
	    // set initial checked on mount to wait for true-value/false-value
	    mounted: setChecked,
	    beforeUpdate(el, binding, vnode) {
	        el._assign = getModelAssigner(vnode);
	        setChecked(el, binding, vnode);
	    }
	};
	function setChecked(el, { value, oldValue }, vnode) {
	    el._modelValue = value;
	    if (shared.isArray(value)) {
	        el.checked = shared.looseIndexOf(value, vnode.props.value) > -1;
	    }
	    else if (shared.isSet(value)) {
	        el.checked = value.has(vnode.props.value);
	    }
	    else if (value !== oldValue) {
	        el.checked = shared.looseEqual(value, getCheckboxValue(el, true));
	    }
	}
	const vModelRadio = {
	    created(el, { value }, vnode) {
	        el.checked = shared.looseEqual(value, vnode.props.value);
	        el._assign = getModelAssigner(vnode);
	        addEventListener(el, 'change', () => {
	            el._assign(getValue(el));
	        });
	    },
	    beforeUpdate(el, { value, oldValue }, vnode) {
	        el._assign = getModelAssigner(vnode);
	        if (value !== oldValue) {
	            el.checked = shared.looseEqual(value, vnode.props.value);
	        }
	    }
	};
	const vModelSelect = {
	    // <select multiple> value need to be deep traversed
	    deep: true,
	    created(el, { value, modifiers: { number } }, vnode) {
	        const isSetModel = shared.isSet(value);
	        addEventListener(el, 'change', () => {
	            const selectedVal = Array.prototype.filter
	                .call(el.options, (o) => o.selected)
	                .map((o) => number ? shared.toNumber(getValue(o)) : getValue(o));
	            el._assign(el.multiple
	                ? isSetModel
	                    ? new Set(selectedVal)
	                    : selectedVal
	                : selectedVal[0]);
	        });
	        el._assign = getModelAssigner(vnode);
	    },
	    // set value in mounted & updated because <select> relies on its children
	    // <option>s.
	    mounted(el, { value }) {
	        setSelected(el, value);
	    },
	    beforeUpdate(el, _binding, vnode) {
	        el._assign = getModelAssigner(vnode);
	    },
	    updated(el, { value }) {
	        setSelected(el, value);
	    }
	};
	function setSelected(el, value) {
	    const isMultiple = el.multiple;
	    if (isMultiple && !shared.isArray(value) && !shared.isSet(value)) {
	        runtimeCore$1.warn(`<select multiple v-model> expects an Array or Set value for its binding, ` +
	                `but got ${Object.prototype.toString.call(value).slice(8, -1)}.`);
	        return;
	    }
	    for (let i = 0, l = el.options.length; i < l; i++) {
	        const option = el.options[i];
	        const optionValue = getValue(option);
	        if (isMultiple) {
	            if (shared.isArray(value)) {
	                option.selected = shared.looseIndexOf(value, optionValue) > -1;
	            }
	            else {
	                option.selected = value.has(optionValue);
	            }
	        }
	        else {
	            if (shared.looseEqual(getValue(option), value)) {
	                if (el.selectedIndex !== i)
	                    el.selectedIndex = i;
	                return;
	            }
	        }
	    }
	    if (!isMultiple && el.selectedIndex !== -1) {
	        el.selectedIndex = -1;
	    }
	}
	// retrieve raw value set via :value bindings
	function getValue(el) {
	    return '_value' in el ? el._value : el.value;
	}
	// retrieve raw value for true-value and false-value set via :true-value or :false-value bindings
	function getCheckboxValue(el, checked) {
	    const key = checked ? '_trueValue' : '_falseValue';
	    return key in el ? el[key] : checked;
	}
	const vModelDynamic = {
	    created(el, binding, vnode) {
	        callModelHook(el, binding, vnode, null, 'created');
	    },
	    mounted(el, binding, vnode) {
	        callModelHook(el, binding, vnode, null, 'mounted');
	    },
	    beforeUpdate(el, binding, vnode, prevVNode) {
	        callModelHook(el, binding, vnode, prevVNode, 'beforeUpdate');
	    },
	    updated(el, binding, vnode, prevVNode) {
	        callModelHook(el, binding, vnode, prevVNode, 'updated');
	    }
	};
	function resolveDynamicModel(tagName, type) {
	    switch (tagName) {
	        case 'SELECT':
	            return vModelSelect;
	        case 'TEXTAREA':
	            return vModelText;
	        default:
	            switch (type) {
	                case 'checkbox':
	                    return vModelCheckbox;
	                case 'radio':
	                    return vModelRadio;
	                default:
	                    return vModelText;
	            }
	    }
	}
	function callModelHook(el, binding, vnode, prevVNode, hook) {
	    const modelToUse = resolveDynamicModel(el.tagName, vnode.props && vnode.props.type);
	    const fn = modelToUse[hook];
	    fn && fn(el, binding, vnode, prevVNode);
	}
	// SSR vnode transforms, only used when user includes client-oriented render
	// function in SSR
	function initVModelForSSR() {
	    vModelText.getSSRProps = ({ value }) => ({ value });
	    vModelRadio.getSSRProps = ({ value }, vnode) => {
	        if (vnode.props && shared.looseEqual(vnode.props.value, value)) {
	            return { checked: true };
	        }
	    };
	    vModelCheckbox.getSSRProps = ({ value }, vnode) => {
	        if (shared.isArray(value)) {
	            if (vnode.props && shared.looseIndexOf(value, vnode.props.value) > -1) {
	                return { checked: true };
	            }
	        }
	        else if (shared.isSet(value)) {
	            if (vnode.props && value.has(vnode.props.value)) {
	                return { checked: true };
	            }
	        }
	        else if (value) {
	            return { checked: true };
	        }
	    };
	    vModelDynamic.getSSRProps = (binding, vnode) => {
	        if (typeof vnode.type !== 'string') {
	            return;
	        }
	        const modelToUse = resolveDynamicModel(
	        // resolveDynamicModel expects an uppercase tag name, but vnode.type is lowercase
	        vnode.type.toUpperCase(), vnode.props && vnode.props.type);
	        if (modelToUse.getSSRProps) {
	            return modelToUse.getSSRProps(binding, vnode);
	        }
	    };
	}

	const systemModifiers = ['ctrl', 'shift', 'alt', 'meta'];
	const modifierGuards = {
	    stop: e => e.stopPropagation(),
	    prevent: e => e.preventDefault(),
	    self: e => e.target !== e.currentTarget,
	    ctrl: e => !e.ctrlKey,
	    shift: e => !e.shiftKey,
	    alt: e => !e.altKey,
	    meta: e => !e.metaKey,
	    left: e => 'button' in e && e.button !== 0,
	    middle: e => 'button' in e && e.button !== 1,
	    right: e => 'button' in e && e.button !== 2,
	    exact: (e, modifiers) => systemModifiers.some(m => e[`${m}Key`] && !modifiers.includes(m))
	};
	/**
	 * @private
	 */
	const withModifiers = (fn, modifiers) => {
	    return (event, ...args) => {
	        for (let i = 0; i < modifiers.length; i++) {
	            const guard = modifierGuards[modifiers[i]];
	            if (guard && guard(event, modifiers))
	                return;
	        }
	        return fn(event, ...args);
	    };
	};
	// Kept for 2.x compat.
	// Note: IE11 compat for `spacebar` and `del` is removed for now.
	const keyNames = {
	    esc: 'escape',
	    space: ' ',
	    up: 'arrow-up',
	    left: 'arrow-left',
	    right: 'arrow-right',
	    down: 'arrow-down',
	    delete: 'backspace'
	};
	/**
	 * @private
	 */
	const withKeys = (fn, modifiers) => {
	    return (event) => {
	        if (!('key' in event)) {
	            return;
	        }
	        const eventKey = shared.hyphenate(event.key);
	        if (modifiers.some(k => k === eventKey || keyNames[k] === eventKey)) {
	            return fn(event);
	        }
	    };
	};

	const vShow = {
	    beforeMount(el, { value }, { transition }) {
	        el._vod = el.style.display === 'none' ? '' : el.style.display;
	        if (transition && value) {
	            transition.beforeEnter(el);
	        }
	        else {
	            setDisplay(el, value);
	        }
	    },
	    mounted(el, { value }, { transition }) {
	        if (transition && value) {
	            transition.enter(el);
	        }
	    },
	    updated(el, { value, oldValue }, { transition }) {
	        if (!value === !oldValue)
	            return;
	        if (transition) {
	            if (value) {
	                transition.beforeEnter(el);
	                setDisplay(el, true);
	                transition.enter(el);
	            }
	            else {
	                transition.leave(el, () => {
	                    setDisplay(el, false);
	                });
	            }
	        }
	        else {
	            setDisplay(el, value);
	        }
	    },
	    beforeUnmount(el, { value }) {
	        setDisplay(el, value);
	    }
	};
	function setDisplay(el, value) {
	    el.style.display = value ? el._vod : 'none';
	}
	// SSR vnode transforms, only used when user includes client-oriented render
	// function in SSR
	function initVShowForSSR() {
	    vShow.getSSRProps = ({ value }) => {
	        if (!value) {
	            return { style: { display: 'none' } };
	        }
	    };
	}

	const rendererOptions = /*#__PURE__*/ shared.extend({ patchProp }, nodeOps);
	// lazy create the renderer - this makes core renderer logic tree-shakable
	// in case the user only imports reactivity utilities from Vue.
	let renderer;
	let enabledHydration = false;
	function ensureRenderer() {
	    return (renderer ||
	        (renderer = runtimeCore$1.createRenderer(rendererOptions)));
	}
	function ensureHydrationRenderer() {
	    renderer = enabledHydration
	        ? renderer
	        : runtimeCore$1.createHydrationRenderer(rendererOptions);
	    enabledHydration = true;
	    return renderer;
	}
	// use explicit type casts here to avoid import() calls in rolled-up d.ts
	const render = ((...args) => {
	    ensureRenderer().render(...args);
	});
	const hydrate = ((...args) => {
	    ensureHydrationRenderer().hydrate(...args);
	});
	const createApp = ((...args) => {
	    const app = ensureRenderer().createApp(...args);
	    {
	        injectNativeTagCheck(app);
	        injectCompilerOptionsCheck(app);
	    }
	    const { mount } = app;
	    app.mount = (containerOrSelector) => {
	        const container = normalizeContainer(containerOrSelector);
	        if (!container)
	            return;
	        const component = app._component;
	        if (!shared.isFunction(component) && !component.render && !component.template) {
	            // __UNSAFE__
	            // Reason: potential execution of JS expressions in in-DOM template.
	            // The user must make sure the in-DOM template is trusted. If it's
	            // rendered by the server, the template should not contain any user data.
	            component.template = container.innerHTML;
	        }
	        // clear content before mounting
	        container.innerHTML = '';
	        const proxy = mount(container, false, container instanceof SVGElement);
	        if (container instanceof Element) {
	            container.removeAttribute('v-cloak');
	            container.setAttribute('data-v-app', '');
	        }
	        return proxy;
	    };
	    return app;
	});
	const createSSRApp = ((...args) => {
	    const app = ensureHydrationRenderer().createApp(...args);
	    {
	        injectNativeTagCheck(app);
	        injectCompilerOptionsCheck(app);
	    }
	    const { mount } = app;
	    app.mount = (containerOrSelector) => {
	        const container = normalizeContainer(containerOrSelector);
	        if (container) {
	            return mount(container, true, container instanceof SVGElement);
	        }
	    };
	    return app;
	});
	function injectNativeTagCheck(app) {
	    // Inject `isNativeTag`
	    // this is used for component name validation (dev only)
	    Object.defineProperty(app.config, 'isNativeTag', {
	        value: (tag) => shared.isHTMLTag(tag) || shared.isSVGTag(tag),
	        writable: false
	    });
	}
	// dev only
	function injectCompilerOptionsCheck(app) {
	    if (runtimeCore$1.isRuntimeOnly()) {
	        const isCustomElement = app.config.isCustomElement;
	        Object.defineProperty(app.config, 'isCustomElement', {
	            get() {
	                return isCustomElement;
	            },
	            set() {
	                runtimeCore$1.warn(`The \`isCustomElement\` config option is deprecated. Use ` +
	                    `\`compilerOptions.isCustomElement\` instead.`);
	            }
	        });
	        const compilerOptions = app.config.compilerOptions;
	        const msg = `The \`compilerOptions\` config option is only respected when using ` +
	            `a build of Vue.js that includes the runtime compiler (aka "full build"). ` +
	            `Since you are using the runtime-only build, \`compilerOptions\` ` +
	            `must be passed to \`@vue/compiler-dom\` in the build setup instead.\n` +
	            `- For vue-loader: pass it via vue-loader's \`compilerOptions\` loader option.\n` +
	            `- For vue-cli: see https://cli.vuejs.org/guide/webpack.html#modifying-options-of-a-loader\n` +
	            `- For vite: pass it via @vitejs/plugin-vue options. See https://github.com/vitejs/vite/tree/main/packages/plugin-vue#example-for-passing-options-to-vuecompiler-dom`;
	        Object.defineProperty(app.config, 'compilerOptions', {
	            get() {
	                runtimeCore$1.warn(msg);
	                return compilerOptions;
	            },
	            set() {
	                runtimeCore$1.warn(msg);
	            }
	        });
	    }
	}
	function normalizeContainer(container) {
	    if (shared.isString(container)) {
	        const res = document.querySelector(container);
	        if (!res) {
	            runtimeCore$1.warn(`Failed to mount app: mount target selector "${container}" returned null.`);
	        }
	        return res;
	    }
	    if (window.ShadowRoot &&
	        container instanceof window.ShadowRoot &&
	        container.mode === 'closed') {
	        runtimeCore$1.warn(`mounting on a ShadowRoot with \`{mode: "closed"}\` may lead to unpredictable bugs`);
	    }
	    return container;
	}
	let ssrDirectiveInitialized = false;
	/**
	 * @internal
	 */
	const initDirectivesForSSR = () => {
	        if (!ssrDirectiveInitialized) {
	            ssrDirectiveInitialized = true;
	            initVModelForSSR();
	            initVShowForSSR();
	        }
	    }
	    ;

	Object.keys(runtimeCore$1).forEach(function (k) {
	  if (k !== 'default') exports[k] = runtimeCore$1[k];
	});
	exports.Transition = Transition;
	exports.TransitionGroup = TransitionGroup;
	exports.VueElement = VueElement;
	exports.createApp = createApp;
	exports.createSSRApp = createSSRApp;
	exports.defineCustomElement = defineCustomElement;
	exports.defineSSRCustomElement = defineSSRCustomElement;
	exports.hydrate = hydrate;
	exports.initDirectivesForSSR = initDirectivesForSSR;
	exports.render = render;
	exports.useCssModule = useCssModule;
	exports.useCssVars = useCssVars;
	exports.vModelCheckbox = vModelCheckbox;
	exports.vModelDynamic = vModelDynamic;
	exports.vModelRadio = vModelRadio;
	exports.vModelSelect = vModelSelect;
	exports.vModelText = vModelText;
	exports.vShow = vShow;
	exports.withKeys = withKeys;
	exports.withModifiers = withModifiers;
} (runtimeDom_cjs));

(function (module) {

	{
	  module.exports = runtimeDom_cjs;
	}
} (runtimeDom));

(function (exports) {

	Object.defineProperty(exports, '__esModule', { value: true });

	var compilerDom = require$$2;
	var runtimeDom$1 = runtimeDom.exports;
	var shared = shared$2.exports;

	function _interopNamespace(e) {
	  if (e && e.__esModule) return e;
	  var n = Object.create(null);
	  if (e) {
	    Object.keys(e).forEach(function (k) {
	      n[k] = e[k];
	    });
	  }
	  n['default'] = e;
	  return Object.freeze(n);
	}

	var runtimeDom__namespace = /*#__PURE__*/_interopNamespace(runtimeDom$1);

	// This entry is the "full-build" that includes both the runtime
	const compileCache = Object.create(null);
	function compileToFunction(template, options) {
	    if (!shared.isString(template)) {
	        if (template.nodeType) {
	            template = template.innerHTML;
	        }
	        else {
	            return shared.NOOP;
	        }
	    }
	    const key = template;
	    const cached = compileCache[key];
	    if (cached) {
	        return cached;
	    }
	    if (template[0] === '#') {
	        const el = document.querySelector(template);
	        // __UNSAFE__
	        // Reason: potential execution of JS expressions in in-DOM template.
	        // The user must make sure the in-DOM template is trusted. If it's rendered
	        // by the server, the template should not contain any user data.
	        template = el ? el.innerHTML : ``;
	    }
	    const { code } = compilerDom.compile(template, shared.extend({
	        hoistStatic: true,
	        onError: undefined,
	        onWarn: shared.NOOP
	    }, options));
	    // The wildcard import results in a huge object with every export
	    // with keys that cannot be mangled, and can be quite heavy size-wise.
	    // In the global build we know `Vue` is available globally so we can avoid
	    // the wildcard object.
	    const render = (new Function('Vue', code)(runtimeDom__namespace));
	    render._rc = true;
	    return (compileCache[key] = render);
	}
	runtimeDom$1.registerRuntimeCompiler(compileToFunction);

	Object.keys(runtimeDom$1).forEach(function (k) {
	  if (k !== 'default') exports[k] = runtimeDom$1[k];
	});
	exports.compile = compileToFunction;
} (vue_cjs_prod));

const require$$0 = /*@__PURE__*/getDefaultExportFromCjs(vue_cjs_prod);

const require$$3 = /*@__PURE__*/getDefaultExportFromNamespaceIfNotNamed(stream);

Object.defineProperty(serverRenderer_cjs, '__esModule', { value: true });

var vue = vue_cjs_prod;
var shared = shared$2.exports;
var compilerSsr = require$$2;

// leading comma for empty string ""
const shouldIgnoreProp = shared.makeMap(`,key,ref,innerHTML,textContent,ref_key,ref_for`);
function ssrRenderAttrs(props, tag) {
    let ret = '';
    for (const key in props) {
        if (shouldIgnoreProp(key) ||
            shared.isOn(key) ||
            (tag === 'textarea' && key === 'value')) {
            continue;
        }
        const value = props[key];
        if (key === 'class') {
            ret += ` class="${ssrRenderClass(value)}"`;
        }
        else if (key === 'style') {
            ret += ` style="${ssrRenderStyle(value)}"`;
        }
        else {
            ret += ssrRenderDynamicAttr(key, value, tag);
        }
    }
    return ret;
}
// render an attr with dynamic (unknown) key.
function ssrRenderDynamicAttr(key, value, tag) {
    if (!isRenderableValue(value)) {
        return ``;
    }
    const attrKey = tag && tag.indexOf('-') > 0
        ? key // preserve raw name on custom elements
        : shared.propsToAttrMap[key] || key.toLowerCase();
    if (shared.isBooleanAttr(attrKey)) {
        return shared.includeBooleanAttr(value) ? ` ${attrKey}` : ``;
    }
    else if (shared.isSSRSafeAttrName(attrKey)) {
        return value === '' ? ` ${attrKey}` : ` ${attrKey}="${shared.escapeHtml(value)}"`;
    }
    else {
        console.warn(`[@vue/server-renderer] Skipped rendering unsafe attribute name: ${attrKey}`);
        return ``;
    }
}
// Render a v-bind attr with static key. The key is pre-processed at compile
// time and we only need to check and escape value.
function ssrRenderAttr(key, value) {
    if (!isRenderableValue(value)) {
        return ``;
    }
    return ` ${key}="${shared.escapeHtml(value)}"`;
}
function isRenderableValue(value) {
    if (value == null) {
        return false;
    }
    const type = typeof value;
    return type === 'string' || type === 'number' || type === 'boolean';
}
function ssrRenderClass(raw) {
    return shared.escapeHtml(shared.normalizeClass(raw));
}
function ssrRenderStyle(raw) {
    if (!raw) {
        return '';
    }
    if (shared.isString(raw)) {
        return shared.escapeHtml(raw);
    }
    const styles = shared.normalizeStyle(raw);
    return shared.escapeHtml(shared.stringifyStyle(styles));
}

const compileCache = Object.create(null);
function ssrCompile(template, instance) {
    // TODO: This is copied from runtime-core/src/component.ts and should probably be refactored
    const Component = instance.type;
    const { isCustomElement, compilerOptions } = instance.appContext.config;
    const { delimiters, compilerOptions: componentCompilerOptions } = Component;
    const finalCompilerOptions = shared.extend(shared.extend({
        isCustomElement,
        delimiters
    }, compilerOptions), componentCompilerOptions);
    finalCompilerOptions.isCustomElement =
        finalCompilerOptions.isCustomElement || shared.NO;
    finalCompilerOptions.isNativeTag = finalCompilerOptions.isNativeTag || shared.NO;
    const cacheKey = JSON.stringify({
        template,
        compilerOptions: finalCompilerOptions
    }, (key, value) => {
        return shared.isFunction(value) ? value.toString() : value;
    });
    const cached = compileCache[cacheKey];
    if (cached) {
        return cached;
    }
    finalCompilerOptions.onError = (err) => {
        {
            const message = `[@vue/server-renderer] Template compilation error: ${err.message}`;
            const codeFrame = err.loc &&
                shared.generateCodeFrame(template, err.loc.start.offset, err.loc.end.offset);
            vue.warn(codeFrame ? `${message}\n${codeFrame}` : message);
        }
    };
    const { code } = compilerSsr.compile(template, finalCompilerOptions);
    return (compileCache[cacheKey] = Function('require', code)(commonjsRequire));
}

function ssrRenderTeleport(parentPush, contentRenderFn, target, disabled, parentComponent) {
    parentPush('<!--teleport start-->');
    const context = parentComponent.appContext.provides[vue.ssrContextKey];
    const teleportBuffers = context.__teleportBuffers || (context.__teleportBuffers = {});
    const targetBuffer = teleportBuffers[target] || (teleportBuffers[target] = []);
    // record current index of the target buffer to handle nested teleports
    // since the parent needs to be rendered before the child
    const bufferIndex = targetBuffer.length;
    let teleportContent;
    if (disabled) {
        contentRenderFn(parentPush);
        teleportContent = `<!--teleport anchor-->`;
    }
    else {
        const { getBuffer, push } = createBuffer();
        contentRenderFn(push);
        push(`<!--teleport anchor-->`);
        teleportContent = getBuffer();
    }
    targetBuffer.splice(bufferIndex, 0, teleportContent);
    parentPush('<!--teleport end-->');
}

const { createComponentInstance, setCurrentRenderingInstance, setupComponent, renderComponentRoot, normalizeVNode } = vue.ssrUtils;
// Each component has a buffer array.
// A buffer array can contain one of the following:
// - plain string
// - A resolved buffer (recursive arrays of strings that can be unrolled
//   synchronously)
// - An async buffer (a Promise that resolves to a resolved buffer)
function createBuffer() {
    let appendable = false;
    const buffer = [];
    return {
        getBuffer() {
            // Return static buffer and await on items during unroll stage
            return buffer;
        },
        push(item) {
            const isStringItem = shared.isString(item);
            if (appendable && isStringItem) {
                buffer[buffer.length - 1] += item;
            }
            else {
                buffer.push(item);
            }
            appendable = isStringItem;
            if (shared.isPromise(item) || (shared.isArray(item) && item.hasAsync)) {
                // promise, or child buffer with async, mark as async.
                // this allows skipping unnecessary await ticks during unroll stage
                buffer.hasAsync = true;
            }
        }
    };
}
function renderComponentVNode(vnode, parentComponent = null, slotScopeId) {
    const instance = createComponentInstance(vnode, parentComponent, null);
    const res = setupComponent(instance, true /* isSSR */);
    const hasAsyncSetup = shared.isPromise(res);
    const prefetches = instance.sp; /* LifecycleHooks.SERVER_PREFETCH */
    if (hasAsyncSetup || prefetches) {
        let p = hasAsyncSetup
            ? res
            : Promise.resolve();
        if (prefetches) {
            p = p
                .then(() => Promise.all(prefetches.map(prefetch => prefetch.call(instance.proxy))))
                // Note: error display is already done by the wrapped lifecycle hook function.
                .catch(() => { });
        }
        return p.then(() => renderComponentSubTree(instance, slotScopeId));
    }
    else {
        return renderComponentSubTree(instance, slotScopeId);
    }
}
function renderComponentSubTree(instance, slotScopeId) {
    const comp = instance.type;
    const { getBuffer, push } = createBuffer();
    if (shared.isFunction(comp)) {
        let root = renderComponentRoot(instance);
        // #5817 scope ID attrs not falling through if functional component doesn't
        // have props
        if (!comp.props) {
            for (const key in instance.attrs) {
                if (key.startsWith(`data-v-`)) {
                    (root.props || (root.props = {}))[key] = ``;
                }
            }
        }
        renderVNode(push, (instance.subTree = root), instance, slotScopeId);
    }
    else {
        if ((!instance.render || instance.render === shared.NOOP) &&
            !instance.ssrRender &&
            !comp.ssrRender &&
            shared.isString(comp.template)) {
            comp.ssrRender = ssrCompile(comp.template, instance);
        }
        // perf: enable caching of computed getters during render
        // since there cannot be state mutations during render.
        for (const e of instance.scope.effects) {
            if (e.computed)
                e.computed._cacheable = true;
        }
        const ssrRender = instance.ssrRender || comp.ssrRender;
        if (ssrRender) {
            // optimized
            // resolve fallthrough attrs
            let attrs = instance.inheritAttrs !== false ? instance.attrs : undefined;
            let hasCloned = false;
            let cur = instance;
            while (true) {
                const scopeId = cur.vnode.scopeId;
                if (scopeId) {
                    if (!hasCloned) {
                        attrs = { ...attrs };
                        hasCloned = true;
                    }
                    attrs[scopeId] = '';
                }
                const parent = cur.parent;
                if (parent && parent.subTree && parent.subTree === cur.vnode) {
                    // parent is a non-SSR compiled component and is rendering this
                    // component as root. inherit its scopeId if present.
                    cur = parent;
                }
                else {
                    break;
                }
            }
            if (slotScopeId) {
                if (!hasCloned)
                    attrs = { ...attrs };
                attrs[slotScopeId.trim()] = '';
            }
            // set current rendering instance for asset resolution
            const prev = setCurrentRenderingInstance(instance);
            ssrRender(instance.proxy, push, instance, attrs, 
            // compiler-optimized bindings
            instance.props, instance.setupState, instance.data, instance.ctx);
            setCurrentRenderingInstance(prev);
        }
        else if (instance.render && instance.render !== shared.NOOP) {
            renderVNode(push, (instance.subTree = renderComponentRoot(instance)), instance, slotScopeId);
        }
        else {
            const componentName = comp.name || comp.__file || `<Anonymous>`;
            vue.warn(`Component ${componentName} is missing template or render function.`);
            push(`<!---->`);
        }
    }
    return getBuffer();
}
function renderVNode(push, vnode, parentComponent, slotScopeId) {
    const { type, shapeFlag, children } = vnode;
    switch (type) {
        case vue.Text:
            push(shared.escapeHtml(children));
            break;
        case vue.Comment:
            push(children ? `<!--${shared.escapeHtmlComment(children)}-->` : `<!---->`);
            break;
        case vue.Static:
            push(children);
            break;
        case vue.Fragment:
            if (vnode.slotScopeIds) {
                slotScopeId =
                    (slotScopeId ? slotScopeId + ' ' : '') + vnode.slotScopeIds.join(' ');
            }
            push(`<!--[-->`); // open
            renderVNodeChildren(push, children, parentComponent, slotScopeId);
            push(`<!--]-->`); // close
            break;
        default:
            if (shapeFlag & 1 /* ELEMENT */) {
                renderElementVNode(push, vnode, parentComponent, slotScopeId);
            }
            else if (shapeFlag & 6 /* COMPONENT */) {
                push(renderComponentVNode(vnode, parentComponent, slotScopeId));
            }
            else if (shapeFlag & 64 /* TELEPORT */) {
                renderTeleportVNode(push, vnode, parentComponent, slotScopeId);
            }
            else if (shapeFlag & 128 /* SUSPENSE */) {
                renderVNode(push, vnode.ssContent, parentComponent, slotScopeId);
            }
            else {
                vue.warn('[@vue/server-renderer] Invalid VNode type:', type, `(${typeof type})`);
            }
    }
}
function renderVNodeChildren(push, children, parentComponent, slotScopeId) {
    for (let i = 0; i < children.length; i++) {
        renderVNode(push, normalizeVNode(children[i]), parentComponent, slotScopeId);
    }
}
function renderElementVNode(push, vnode, parentComponent, slotScopeId) {
    const tag = vnode.type;
    let { props, children, shapeFlag, scopeId, dirs } = vnode;
    let openTag = `<${tag}`;
    if (dirs) {
        props = applySSRDirectives(vnode, props, dirs);
    }
    if (props) {
        openTag += ssrRenderAttrs(props, tag);
    }
    if (scopeId) {
        openTag += ` ${scopeId}`;
    }
    // inherit parent chain scope id if this is the root node
    let curParent = parentComponent;
    let curVnode = vnode;
    while (curParent && curVnode === curParent.subTree) {
        curVnode = curParent.vnode;
        if (curVnode.scopeId) {
            openTag += ` ${curVnode.scopeId}`;
        }
        curParent = curParent.parent;
    }
    if (slotScopeId) {
        openTag += ` ${slotScopeId}`;
    }
    push(openTag + `>`);
    if (!shared.isVoidTag(tag)) {
        let hasChildrenOverride = false;
        if (props) {
            if (props.innerHTML) {
                hasChildrenOverride = true;
                push(props.innerHTML);
            }
            else if (props.textContent) {
                hasChildrenOverride = true;
                push(shared.escapeHtml(props.textContent));
            }
            else if (tag === 'textarea' && props.value) {
                hasChildrenOverride = true;
                push(shared.escapeHtml(props.value));
            }
        }
        if (!hasChildrenOverride) {
            if (shapeFlag & 8 /* TEXT_CHILDREN */) {
                push(shared.escapeHtml(children));
            }
            else if (shapeFlag & 16 /* ARRAY_CHILDREN */) {
                renderVNodeChildren(push, children, parentComponent, slotScopeId);
            }
        }
        push(`</${tag}>`);
    }
}
function applySSRDirectives(vnode, rawProps, dirs) {
    const toMerge = [];
    for (let i = 0; i < dirs.length; i++) {
        const binding = dirs[i];
        const { dir: { getSSRProps } } = binding;
        if (getSSRProps) {
            const props = getSSRProps(binding, vnode);
            if (props)
                toMerge.push(props);
        }
    }
    return vue.mergeProps(rawProps || {}, ...toMerge);
}
function renderTeleportVNode(push, vnode, parentComponent, slotScopeId) {
    const target = vnode.props && vnode.props.to;
    const disabled = vnode.props && vnode.props.disabled;
    if (!target) {
        if (!disabled) {
            vue.warn(`[@vue/server-renderer] Teleport is missing target prop.`);
        }
        return [];
    }
    if (!shared.isString(target)) {
        vue.warn(`[@vue/server-renderer] Teleport target must be a query selector string.`);
        return [];
    }
    ssrRenderTeleport(push, push => {
        renderVNodeChildren(push, vnode.children, parentComponent, slotScopeId);
    }, target, disabled || disabled === '', parentComponent);
}

const { isVNode } = vue.ssrUtils;
async function unrollBuffer(buffer) {
    if (buffer.hasAsync) {
        let ret = '';
        for (let i = 0; i < buffer.length; i++) {
            let item = buffer[i];
            if (shared.isPromise(item)) {
                item = await item;
            }
            if (shared.isString(item)) {
                ret += item;
            }
            else {
                ret += await unrollBuffer(item);
            }
        }
        return ret;
    }
    else {
        // sync buffer can be more efficiently unrolled without unnecessary await
        // ticks
        return unrollBufferSync(buffer);
    }
}
function unrollBufferSync(buffer) {
    let ret = '';
    for (let i = 0; i < buffer.length; i++) {
        let item = buffer[i];
        if (shared.isString(item)) {
            ret += item;
        }
        else {
            // since this is a sync buffer, child buffers are never promises
            ret += unrollBufferSync(item);
        }
    }
    return ret;
}
async function renderToString(input, context = {}) {
    if (isVNode(input)) {
        // raw vnode, wrap with app (for context)
        return renderToString(vue.createApp({ render: () => input }), context);
    }
    // rendering an app
    const vnode = vue.createVNode(input._component, input._props);
    vnode.appContext = input._context;
    // provide the ssr context to the tree
    input.provide(vue.ssrContextKey, context);
    const buffer = await renderComponentVNode(vnode);
    const result = await unrollBuffer(buffer);
    await resolveTeleports(context);
    return result;
}
async function resolveTeleports(context) {
    if (context.__teleportBuffers) {
        context.teleports = context.teleports || {};
        for (const key in context.__teleportBuffers) {
            // note: it's OK to await sequentially here because the Promises were
            // created eagerly in parallel.
            context.teleports[key] = await unrollBuffer((await Promise.all(context.__teleportBuffers[key])));
        }
    }
}

const { isVNode: isVNode$1 } = vue.ssrUtils;
async function unrollBuffer$1(buffer, stream) {
    if (buffer.hasAsync) {
        for (let i = 0; i < buffer.length; i++) {
            let item = buffer[i];
            if (shared.isPromise(item)) {
                item = await item;
            }
            if (shared.isString(item)) {
                stream.push(item);
            }
            else {
                await unrollBuffer$1(item, stream);
            }
        }
    }
    else {
        // sync buffer can be more efficiently unrolled without unnecessary await
        // ticks
        unrollBufferSync$1(buffer, stream);
    }
}
function unrollBufferSync$1(buffer, stream) {
    for (let i = 0; i < buffer.length; i++) {
        let item = buffer[i];
        if (shared.isString(item)) {
            stream.push(item);
        }
        else {
            // since this is a sync buffer, child buffers are never promises
            unrollBufferSync$1(item, stream);
        }
    }
}
function renderToSimpleStream(input, context, stream) {
    if (isVNode$1(input)) {
        // raw vnode, wrap with app (for context)
        return renderToSimpleStream(vue.createApp({ render: () => input }), context, stream);
    }
    // rendering an app
    const vnode = vue.createVNode(input._component, input._props);
    vnode.appContext = input._context;
    // provide the ssr context to the tree
    input.provide(vue.ssrContextKey, context);
    Promise.resolve(renderComponentVNode(vnode))
        .then(buffer => unrollBuffer$1(buffer, stream))
        .then(() => resolveTeleports(context))
        .then(() => stream.push(null))
        .catch(error => {
        stream.destroy(error);
    });
    return stream;
}
/**
 * @deprecated
 */
function renderToStream(input, context = {}) {
    console.warn(`[@vue/server-renderer] renderToStream is deprecated - use renderToNodeStream instead.`);
    return renderToNodeStream(input, context);
}
function renderToNodeStream(input, context = {}) {
    const stream = new (require$$3.Readable)({ read() { } })
        ;
    if (!stream) {
        throw new Error(`ESM build of renderToStream() does not support renderToNodeStream(). ` +
            `Use pipeToNodeWritable() with an existing Node.js Writable stream ` +
            `instance instead.`);
    }
    return renderToSimpleStream(input, context, stream);
}
function pipeToNodeWritable(input, context = {}, writable) {
    renderToSimpleStream(input, context, {
        push(content) {
            if (content != null) {
                writable.write(content);
            }
            else {
                writable.end();
            }
        },
        destroy(err) {
            writable.destroy(err);
        }
    });
}
function renderToWebStream(input, context = {}) {
    if (typeof ReadableStream !== 'function') {
        throw new Error(`ReadableStream constructor is not available in the global scope. ` +
            `If the target environment does support web streams, consider using ` +
            `pipeToWebWritable() with an existing WritableStream instance instead.`);
    }
    const encoder = new TextEncoder();
    let cancelled = false;
    return new ReadableStream({
        start(controller) {
            renderToSimpleStream(input, context, {
                push(content) {
                    if (cancelled)
                        return;
                    if (content != null) {
                        controller.enqueue(encoder.encode(content));
                    }
                    else {
                        controller.close();
                    }
                },
                destroy(err) {
                    controller.error(err);
                }
            });
        },
        cancel() {
            cancelled = true;
        }
    });
}
function pipeToWebWritable(input, context = {}, writable) {
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    // #4287 CloudFlare workers do not implement `ready` property
    let hasReady = false;
    try {
        hasReady = shared.isPromise(writer.ready);
    }
    catch (e) { }
    renderToSimpleStream(input, context, {
        async push(content) {
            if (hasReady) {
                await writer.ready;
            }
            if (content != null) {
                return writer.write(encoder.encode(content));
            }
            else {
                return writer.close();
            }
        },
        destroy(err) {
            // TODO better error handling?
            console.log(err);
            writer.close();
        }
    });
}

function ssrRenderComponent(comp, props = null, children = null, parentComponent = null, slotScopeId) {
    return renderComponentVNode(vue.createVNode(comp, props, children), parentComponent, slotScopeId);
}

function ssrRenderSlot(slots, slotName, slotProps, fallbackRenderFn, push, parentComponent, slotScopeId) {
    // template-compiled slots are always rendered as fragments
    push(`<!--[-->`);
    ssrRenderSlotInner(slots, slotName, slotProps, fallbackRenderFn, push, parentComponent, slotScopeId);
    push(`<!--]-->`);
}
function ssrRenderSlotInner(slots, slotName, slotProps, fallbackRenderFn, push, parentComponent, slotScopeId, transition) {
    const slotFn = slots[slotName];
    if (slotFn) {
        const slotBuffer = [];
        const bufferedPush = (item) => {
            slotBuffer.push(item);
        };
        const ret = slotFn(slotProps, bufferedPush, parentComponent, slotScopeId ? ' ' + slotScopeId : '');
        if (shared.isArray(ret)) {
            // normal slot
            renderVNodeChildren(push, ret, parentComponent, slotScopeId);
        }
        else {
            // ssr slot.
            // check if the slot renders all comments, in which case use the fallback
            let isEmptySlot = true;
            if (transition) {
                isEmptySlot = false;
            }
            else {
                for (let i = 0; i < slotBuffer.length; i++) {
                    if (!isComment(slotBuffer[i])) {
                        isEmptySlot = false;
                        break;
                    }
                }
            }
            if (isEmptySlot) {
                if (fallbackRenderFn) {
                    fallbackRenderFn();
                }
            }
            else {
                for (let i = 0; i < slotBuffer.length; i++) {
                    push(slotBuffer[i]);
                }
            }
        }
    }
    else if (fallbackRenderFn) {
        fallbackRenderFn();
    }
}
const commentRE = /<!--[^]*?-->/gm;
function isComment(item) {
    return (typeof item === 'string' &&
        commentRE.test(item) &&
        !item.replace(commentRE, '').trim());
}

function ssrInterpolate(value) {
    return shared.escapeHtml(shared.toDisplayString(value));
}

function toRaw(observed) {
    const raw = observed && observed["__v_raw" /* RAW */];
    return raw ? toRaw(raw) : observed;
}

function isRef(r) {
    return !!(r && r.__v_isRef === true);
}

const stack = [];
function pushWarningContext(vnode) {
    stack.push(vnode);
}
function popWarningContext() {
    stack.pop();
}
function warn(msg, ...args) {
    const instance = stack.length ? stack[stack.length - 1].component : null;
    const appWarnHandler = instance && instance.appContext.config.warnHandler;
    const trace = getComponentTrace();
    if (appWarnHandler) {
        callWithErrorHandling(appWarnHandler, instance, 11 /* APP_WARN_HANDLER */, [
            msg + args.join(''),
            instance && instance.proxy,
            trace
                .map(({ vnode }) => `at <${formatComponentName(instance, vnode.type)}>`)
                .join('\n'),
            trace
        ]);
    }
    else {
        const warnArgs = [`[Vue warn]: ${msg}`, ...args];
        /* istanbul ignore if */
        if (trace.length &&
            // avoid spamming console during tests
            !false) {
            warnArgs.push(`\n`, ...formatTrace(trace));
        }
        console.warn(...warnArgs);
    }
}
function getComponentTrace() {
    let currentVNode = stack[stack.length - 1];
    if (!currentVNode) {
        return [];
    }
    // we can't just use the stack because it will be incomplete during updates
    // that did not start from the root. Re-construct the parent chain using
    // instance parent pointers.
    const normalizedStack = [];
    while (currentVNode) {
        const last = normalizedStack[0];
        if (last && last.vnode === currentVNode) {
            last.recurseCount++;
        }
        else {
            normalizedStack.push({
                vnode: currentVNode,
                recurseCount: 0
            });
        }
        const parentInstance = currentVNode.component && currentVNode.component.parent;
        currentVNode = parentInstance && parentInstance.vnode;
    }
    return normalizedStack;
}
/* istanbul ignore next */
function formatTrace(trace) {
    const logs = [];
    trace.forEach((entry, i) => {
        logs.push(...(i === 0 ? [] : [`\n`]), ...formatTraceEntry(entry));
    });
    return logs;
}
function formatTraceEntry({ vnode, recurseCount }) {
    const postfix = recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``;
    const isRoot = vnode.component ? vnode.component.parent == null : false;
    const open = ` at <${formatComponentName(vnode.component, vnode.type, isRoot)}`;
    const close = `>` + postfix;
    return vnode.props
        ? [open, ...formatProps(vnode.props), close]
        : [open + close];
}
/* istanbul ignore next */
function formatProps(props) {
    const res = [];
    const keys = Object.keys(props);
    keys.slice(0, 3).forEach(key => {
        res.push(...formatProp(key, props[key]));
    });
    if (keys.length > 3) {
        res.push(` ...`);
    }
    return res;
}
/* istanbul ignore next */
function formatProp(key, value, raw) {
    if (shared.isString(value)) {
        value = JSON.stringify(value);
        return raw ? value : [`${key}=${value}`];
    }
    else if (typeof value === 'number' ||
        typeof value === 'boolean' ||
        value == null) {
        return raw ? value : [`${key}=${value}`];
    }
    else if (isRef(value)) {
        value = formatProp(key, toRaw(value.value), true);
        return raw ? value : [`${key}=Ref<`, value, `>`];
    }
    else if (shared.isFunction(value)) {
        return [`${key}=fn${value.name ? `<${value.name}>` : ``}`];
    }
    else {
        value = toRaw(value);
        return raw ? value : [`${key}=`, value];
    }
}

const ErrorTypeStrings = {
    ["sp" /* SERVER_PREFETCH */]: 'serverPrefetch hook',
    ["bc" /* BEFORE_CREATE */]: 'beforeCreate hook',
    ["c" /* CREATED */]: 'created hook',
    ["bm" /* BEFORE_MOUNT */]: 'beforeMount hook',
    ["m" /* MOUNTED */]: 'mounted hook',
    ["bu" /* BEFORE_UPDATE */]: 'beforeUpdate hook',
    ["u" /* UPDATED */]: 'updated',
    ["bum" /* BEFORE_UNMOUNT */]: 'beforeUnmount hook',
    ["um" /* UNMOUNTED */]: 'unmounted hook',
    ["a" /* ACTIVATED */]: 'activated hook',
    ["da" /* DEACTIVATED */]: 'deactivated hook',
    ["ec" /* ERROR_CAPTURED */]: 'errorCaptured hook',
    ["rtc" /* RENDER_TRACKED */]: 'renderTracked hook',
    ["rtg" /* RENDER_TRIGGERED */]: 'renderTriggered hook',
    [0 /* SETUP_FUNCTION */]: 'setup function',
    [1 /* RENDER_FUNCTION */]: 'render function',
    [2 /* WATCH_GETTER */]: 'watcher getter',
    [3 /* WATCH_CALLBACK */]: 'watcher callback',
    [4 /* WATCH_CLEANUP */]: 'watcher cleanup function',
    [5 /* NATIVE_EVENT_HANDLER */]: 'native event handler',
    [6 /* COMPONENT_EVENT_HANDLER */]: 'component event handler',
    [7 /* VNODE_HOOK */]: 'vnode hook',
    [8 /* DIRECTIVE_HOOK */]: 'directive hook',
    [9 /* TRANSITION_HOOK */]: 'transition hook',
    [10 /* APP_ERROR_HANDLER */]: 'app errorHandler',
    [11 /* APP_WARN_HANDLER */]: 'app warnHandler',
    [12 /* FUNCTION_REF */]: 'ref function',
    [13 /* ASYNC_COMPONENT_LOADER */]: 'async component loader',
    [14 /* SCHEDULER */]: 'scheduler flush. This is likely a Vue internals bug. ' +
        'Please open an issue at https://new-issue.vuejs.org/?repo=vuejs/core'
};
function callWithErrorHandling(fn, instance, type, args) {
    let res;
    try {
        res = args ? fn(...args) : fn();
    }
    catch (err) {
        handleError(err, instance, type);
    }
    return res;
}
function handleError(err, instance, type, throwInDev = true) {
    const contextVNode = instance ? instance.vnode : null;
    if (instance) {
        let cur = instance.parent;
        // the exposed instance is the render proxy to keep it consistent with 2.x
        const exposedInstance = instance.proxy;
        // in production the hook receives only the error code
        const errorInfo = ErrorTypeStrings[type] ;
        while (cur) {
            const errorCapturedHooks = cur.ec;
            if (errorCapturedHooks) {
                for (let i = 0; i < errorCapturedHooks.length; i++) {
                    if (errorCapturedHooks[i](err, exposedInstance, errorInfo) === false) {
                        return;
                    }
                }
            }
            cur = cur.parent;
        }
        // app-level handling
        const appErrorHandler = instance.appContext.config.errorHandler;
        if (appErrorHandler) {
            callWithErrorHandling(appErrorHandler, null, 10 /* APP_ERROR_HANDLER */, [err, exposedInstance, errorInfo]);
            return;
        }
    }
    logError(err, type, contextVNode, throwInDev);
}
function logError(err, type, contextVNode, throwInDev = true) {
    {
        const info = ErrorTypeStrings[type];
        if (contextVNode) {
            pushWarningContext(contextVNode);
        }
        warn(`Unhandled error${info ? ` during execution of ${info}` : ``}`);
        if (contextVNode) {
            popWarningContext();
        }
        // crash in dev by default so it's more noticeable
        if (throwInDev) {
            throw err;
        }
        else {
            console.error(err);
        }
    }
}

const classifyRE = /(?:^|[-_])(\w)/g;
const classify = (str) => str.replace(classifyRE, c => c.toUpperCase()).replace(/[-_]/g, '');
function getComponentName(Component, includeInferred = true) {
    return shared.isFunction(Component)
        ? Component.displayName || Component.name
        : Component.name || (includeInferred && Component.__name);
}
/* istanbul ignore next */
function formatComponentName(instance, Component, isRoot = false) {
    let name = getComponentName(Component);
    if (!name && Component.__file) {
        const match = Component.__file.match(/([^/\\]+)\.\w+$/);
        if (match) {
            name = match[1];
        }
    }
    if (!name && instance && instance.parent) {
        // try to infer the name based on reverse resolution
        const inferFromRegistry = (registry) => {
            for (const key in registry) {
                if (registry[key] === Component) {
                    return key;
                }
            }
        };
        name =
            inferFromRegistry(instance.components ||
                instance.parent.type.components) || inferFromRegistry(instance.appContext.components);
    }
    return name ? classify(name) : isRoot ? `App` : `Anonymous`;
}

function ssrRenderList(source, renderItem) {
    if (shared.isArray(source) || shared.isString(source)) {
        for (let i = 0, l = source.length; i < l; i++) {
            renderItem(source[i], i);
        }
    }
    else if (typeof source === 'number') {
        if (!Number.isInteger(source)) {
            warn(`The v-for range expect an integer value but got ${source}.`);
            return;
        }
        for (let i = 0; i < source; i++) {
            renderItem(i + 1, i);
        }
    }
    else if (shared.isObject(source)) {
        if (source[Symbol.iterator]) {
            const arr = Array.from(source);
            for (let i = 0, l = arr.length; i < l; i++) {
                renderItem(arr[i], i);
            }
        }
        else {
            const keys = Object.keys(source);
            for (let i = 0, l = keys.length; i < l; i++) {
                const key = keys[i];
                renderItem(source[key], key, i);
            }
        }
    }
}

async function ssrRenderSuspense(push, { default: renderContent }) {
    if (renderContent) {
        renderContent();
    }
    else {
        push(`<!---->`);
    }
}

function ssrGetDirectiveProps(instance, dir, value, arg, modifiers = {}) {
    if (typeof dir !== 'function' && dir.getSSRProps) {
        return (dir.getSSRProps({
            dir,
            instance,
            value,
            oldValue: undefined,
            arg,
            modifiers
        }, null) || {});
    }
    return {};
}

const ssrLooseEqual = shared.looseEqual;
function ssrLooseContain(arr, value) {
    return shared.looseIndexOf(arr, value) > -1;
}
// for <input :type="type" v-model="model" value="value">
function ssrRenderDynamicModel(type, model, value) {
    switch (type) {
        case 'radio':
            return shared.looseEqual(model, value) ? ' checked' : '';
        case 'checkbox':
            return (shared.isArray(model) ? ssrLooseContain(model, value) : model)
                ? ' checked'
                : '';
        default:
            // text types
            return ssrRenderAttr('value', model);
    }
}
// for <input v-bind="obj" v-model="model">
function ssrGetDynamicModelProps(existingProps = {}, model) {
    const { type, value } = existingProps;
    switch (type) {
        case 'radio':
            return shared.looseEqual(model, value) ? { checked: true } : null;
        case 'checkbox':
            return (shared.isArray(model) ? ssrLooseContain(model, value) : model)
                ? { checked: true }
                : null;
        default:
            // text types
            return { value: model };
    }
}

vue.initDirectivesForSSR();

serverRenderer_cjs.ssrIncludeBooleanAttr = shared.includeBooleanAttr;
serverRenderer_cjs.pipeToNodeWritable = pipeToNodeWritable;
serverRenderer_cjs.pipeToWebWritable = pipeToWebWritable;
serverRenderer_cjs.renderToNodeStream = renderToNodeStream;
serverRenderer_cjs.renderToSimpleStream = renderToSimpleStream;
serverRenderer_cjs.renderToStream = renderToStream;
serverRenderer_cjs.renderToString = renderToString;
serverRenderer_cjs.renderToWebStream = renderToWebStream;
serverRenderer_cjs.ssrGetDirectiveProps = ssrGetDirectiveProps;
serverRenderer_cjs.ssrGetDynamicModelProps = ssrGetDynamicModelProps;
serverRenderer_cjs.ssrInterpolate = ssrInterpolate;
serverRenderer_cjs.ssrLooseContain = ssrLooseContain;
serverRenderer_cjs.ssrLooseEqual = ssrLooseEqual;
serverRenderer_cjs.ssrRenderAttr = ssrRenderAttr;
serverRenderer_cjs.ssrRenderAttrs = ssrRenderAttrs;
serverRenderer_cjs.ssrRenderClass = ssrRenderClass;
serverRenderer_cjs.ssrRenderComponent = ssrRenderComponent;
serverRenderer_cjs.ssrRenderDynamicAttr = ssrRenderDynamicAttr;
serverRenderer_cjs.ssrRenderDynamicModel = ssrRenderDynamicModel;
serverRenderer_cjs.ssrRenderList = ssrRenderList;
serverRenderer_cjs.ssrRenderSlot = ssrRenderSlot;
serverRenderer_cjs.ssrRenderSlotInner = ssrRenderSlotInner;
serverRenderer_cjs.ssrRenderStyle = ssrRenderStyle;
serverRenderer_cjs.ssrRenderSuspense = ssrRenderSuspense;
serverRenderer_cjs.ssrRenderTeleport = ssrRenderTeleport;
serverRenderer_cjs.ssrRenderVNode = renderVNode;

(function (module) {

	{
	  module.exports = serverRenderer_cjs;
	}
} (serverRenderer));

function buildAssetsURL(...path) {
  return joinURL(publicAssetsURL(), useRuntimeConfig().app.buildAssetsDir, ...path);
}
function publicAssetsURL(...path) {
  const publicBase = useRuntimeConfig().app.cdnURL || useRuntimeConfig().app.baseURL;
  return path.length ? joinURL(publicBase, ...path) : publicBase;
}

const htmlTemplate = (params) => `<!DOCTYPE html>
<html ${params.HTML_ATTRS}>

<head ${params.HEAD_ATTRS}>
  ${params.HEAD}
</head>

<body ${params.BODY_ATTRS}>${params.BODY_PREPEND}
  ${params.APP}
</body>

</html>`;

const getClientManifest = () => import('./client.manifest.mjs').then((r) => r.default || r);
const getServerEntry = () => import('./server.mjs').then((r) => r.default || r);
const getSSRRenderer = lazyCachedFunction(async () => {
  const clientManifest = await getClientManifest();
  if (!clientManifest) {
    throw new Error("client.manifest is not available");
  }
  const createSSRApp = await getServerEntry();
  if (!createSSRApp) {
    throw new Error("Server bundle is not available");
  }
  const renderToString = async (input, context) => {
    const html = await serverRenderer.exports.renderToString(input, context);
    return `<div id="__nuxt">${html}</div>`;
  };
  return createRenderer(createSSRApp, {
    clientManifest,
    renderToString,
    publicPath: buildAssetsURL()
  });
});
const getSPARenderer = lazyCachedFunction(async () => {
  const clientManifest = await getClientManifest();
  const renderToString = (ssrContext) => {
    const config = useRuntimeConfig();
    ssrContext.payload = {
      serverRendered: false,
      config: {
        public: config.public,
        app: config.app
      }
    };
    let entryFiles = Object.values(clientManifest).filter((fileValue) => fileValue.isEntry);
    if ("all" in clientManifest && "initial" in clientManifest) {
      entryFiles = clientManifest.initial.map((file) => ({ file }));
    }
    return Promise.resolve({
      html: '<div id="__nuxt"></div>',
      renderResourceHints: () => "",
      renderStyles: () => entryFiles.flatMap(({ css }) => css).filter((css) => css != null).map((file) => `<link rel="stylesheet" href="${buildAssetsURL(file)}">`).join(""),
      renderScripts: () => entryFiles.map(({ file }) => {
        const isMJS = !file.endsWith(".js");
        return `<script ${isMJS ? 'type="module"' : ""} src="${buildAssetsURL(file)}"><\/script>`;
      }).join("")
    });
  };
  return { renderToString };
});
const renderer = eventHandler(async (event) => {
  const ssrError = event.req.url?.startsWith("/__nuxt_error") ? useQuery(event) : null;
  const url = ssrError?.url || event.req.url;
  const ssrContext = {
    url,
    event,
    req: event.req,
    res: event.res,
    runtimeConfig: useRuntimeConfig(),
    noSSR: !!event.req.headers["x-nuxt-no-ssr"],
    error: ssrError,
    nuxt: void 0,
    payload: void 0
  };
  const renderer = ssrContext.noSSR ? await getSPARenderer() : await getSSRRenderer();
  const rendered = await renderer.renderToString(ssrContext).catch((e) => {
    if (!ssrError) {
      throw e;
    }
  });
  if (!rendered) {
    return;
  }
  if (event.res.writableEnded) {
    return;
  }
  if (ssrContext.error && !ssrError) {
    throw ssrContext.error;
  }
  if (ssrContext.nuxt?.hooks) {
    await ssrContext.nuxt.hooks.callHook("app:rendered");
  }
  const html = await renderHTML(ssrContext.payload, rendered, ssrContext);
  event.res.setHeader("Content-Type", "text/html;charset=UTF-8");
  return html;
});
async function renderHTML(payload, rendered, ssrContext) {
  const state = `<script>window.__NUXT__=${devalue(payload)}<\/script>`;
  rendered.meta = rendered.meta || {};
  if (ssrContext.renderMeta) {
    Object.assign(rendered.meta, await ssrContext.renderMeta());
  }
  return htmlTemplate({
    HTML_ATTRS: rendered.meta.htmlAttrs || "",
    HEAD_ATTRS: rendered.meta.headAttrs || "",
    HEAD: (rendered.meta.headTags || "") + rendered.renderResourceHints() + rendered.renderStyles() + (ssrContext.styles || ""),
    BODY_ATTRS: rendered.meta.bodyAttrs || "",
    BODY_PREPEND: ssrContext.teleports?.body || "",
    APP: (rendered.meta.bodyScriptsPrepend || "") + rendered.html + state + rendered.renderScripts() + (rendered.meta.bodyScripts || "")
  });
}
function lazyCachedFunction(fn) {
  let res = null;
  return () => {
    if (res === null) {
      res = fn().catch((err) => {
        res = null;
        throw err;
      });
    }
    return res;
  };
}

const renderer$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  'default': renderer
});

export { renderer$1 as a, require$$0 as r, serverRenderer as s, vue_cjs_prod as v };
//# sourceMappingURL=renderer.mjs.map
