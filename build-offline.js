#!/usr/bin/env node
/*
 * Quarry offline build.
 * Regenerates quarry-offline.html from pipeline.html — fully self-contained, no network.
 *
 * Prereqs (run once in this folder):
 *   npm install react@18.3.1 react-dom@18.3.1 recharts@2.12.7 \
 *     lucide-react@0.408.0 prop-types@15.8.1 @babel/core @babel/preset-react
 *
 * Then:
 *   node build-offline.js
 *
 * See QUARRY-HANDOFF.md for why each step exists. The tricky bits:
 *  - icon/recharts name lists are DERIVED from pipeline.html's imports (no hardcoding)
 *  - UMD bundles wrapped to force the browser-global branch
 *  - lowercase window.react alias for lucide-react
 */
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const HERE = __dirname;
const SRC = path.join(HERE, "pipeline.html");
const OUT = path.join(HERE, "quarry-offline.html");
const NM = path.join(HERE, "node_modules");

const cdnHtml = fs.readFileSync(SRC, "utf8");

// 1. extract component from the babel script block, strip esm.sh imports
const block = cdnHtml.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/)[1];
const component = block.replace(/^import .*$/gm, "");

// 2. derive import name lists from the source (single source of truth)
function names(re) {
  const m = cdnHtml.match(re);
  if (!m) throw new Error("import not found: " + re);
  return m[1].split(",").map(s => s.trim()).filter(Boolean);
}
const lucideRaw = names(/import \{([^}]*)\} from "https:\/\/esm\.sh\/lucide-react[^"]*";/);
const rechartsRaw = names(/import \{([^}]*)\} from "https:\/\/esm\.sh\/recharts[^"]*";/);
const lucideDestructure = lucideRaw
  .map(n => n.includes(" as ") ? n.split(" as ").map(x => x.trim()).join(": ") : n)
  .join(", ");
const rechartsDestructure = rechartsRaw.join(", ");

// 3. shim + mount, then pre-compile JSX -> JS
const shim = `
const { useState, useRef, useCallback, useMemo, useEffect } = React;
const createRoot = ReactDOM.createRoot;
const { ${rechartsDestructure} } = Recharts;
const { ${lucideDestructure} } = LucideReact;
`;
const mount = `
const _root = ReactDOM.createRoot(document.getElementById('root'));
_root.render(React.createElement(PipelineDashboard));
`;
const compiled = babel.transformSync(shim + "\n" + component + "\n" + mount, {
  presets: [["@babel/preset-react", { runtime: "classic" }]],
  compact: false,
}).code;

// 4. read UMD bundles
const read = p => fs.readFileSync(path.join(NM, p), "utf8");
const react     = read("react/umd/react.production.min.js");
const reactDom  = read("react-dom/umd/react-dom.production.min.js");
const propTypes = read("prop-types/prop-types.min.js");
const recharts  = read("recharts/umd/Recharts.js");
const lucide    = read("lucide-react/dist/umd/lucide-react.min.js");

// 5. wrap each UMD to force the browser-global branch
const wrap = code =>
  "(function(){var module=undefined,exports=undefined,define=undefined;\n" + code + "\n}).call(window);";

// 6. preserve favicon + page style from source
const favicon = cdnHtml.match(/<link rel="icon"[^>]*\/>/)[0];
const pageStyle = cdnHtml.match(/<style>([\s\S]*?)<\/style>/)[1];

// lowercase aliases: lucide-react UMD reads window.react (lowercase)
const alias = "window.react=window.React;window.reactDom=window.ReactDOM;window.propTypes=window.PropTypes;";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Quarry — Job Search Pipeline</title>
${favicon}
<style>${pageStyle}</style>
</head>
<body>
<div id="root"><div class="boot">Loading Quarry…</div></div>
<script>window.process = window.process || { env: { NODE_ENV: 'production' } };</script>
<script>/* React */ ${wrap(react)}</script>
<script>/* ReactDOM */ ${wrap(reactDom)}</script>
<script>/* PropTypes */ ${wrap(propTypes)}</script>
<script>${alias}</script>
<script>/* Recharts */ ${wrap(recharts)}</script>
<script>/* lucide-react */ ${wrap(lucide)}</script>
<script>/* Quarry (precompiled) */
${compiled}
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log("Wrote", OUT, "(" + (html.length / 1024 / 1024).toFixed(2) + " MB)");
console.log("Bound", lucideRaw.length, "icons,", rechartsRaw.length, "recharts components.");
