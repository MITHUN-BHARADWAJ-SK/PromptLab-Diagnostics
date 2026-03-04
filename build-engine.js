/**
 * PromptLab — Build Script
 * 
 * Bundles the analyzer engine (scoring + blueprints + analyzerService + generatorService)
 * into a single browser-compatible IIFE script: public/js/promptlab-engine.js
 *
 * Run: node build-engine.js
 */

const fs = require('fs');
const path = require('path');

const files = [
    'src/config/scoring.js',
    'src/config/blueprints.js',
    'src/services/analyzerService.js',
    'src/services/generatorService.js',
];

// Also need tiers config
const tiersPath = 'src/config/tiers.js';
let tiersContent = '';
if (fs.existsSync(tiersPath)) {
    tiersContent = fs.readFileSync(tiersPath, 'utf-8');
} else {
    // Create inline tiers
    tiersContent = `module.exports = { free: { dailyAnalysisLimit: 10 }, pro: { dailyAnalysisLimit: 100 } };`;
}

let bundle = `/**
 * PromptLab Engine — Browser Bundle (Auto-generated)
 * Contains: scoring config, blueprints, analyzer service, generator service
 * DO NOT EDIT — regenerate via: node build-engine.js
 */
(function(global) {
'use strict';

// ── Module system shim ──────────────────────────────────────
const _modules = {};
const _exports = {};

function _require(name) {
    if (_exports[name]) return _exports[name];
    if (_modules[name]) {
        const mod = { exports: {} };
        _modules[name](mod, mod.exports, _require);
        _exports[name] = mod.exports;
        return mod.exports;
    }
    // Fallback for unknown modules
    console.warn('[PromptLab Engine] Unknown require:', name);
    return {};
}

`;

// Map file paths to module names that require() will use
const moduleMap = {
    'src/config/scoring.js': '../config/scoring',
    'src/config/blueprints.js': '../config/blueprints',
    'src/services/analyzerService.js': 'analyzerService',
    'src/services/generatorService.js': 'generatorService',
};

// Also add alternate require paths
const aliasMap = {
    '../config/scoring': '../config/scoring',
    './scoring': '../config/scoring',
    '../config/blueprints': '../config/blueprints',
    './blueprints': '../config/blueprints',
    '../config/tiers': '../config/tiers',
    './tiers': '../config/tiers',
};

// Register tiers module
bundle += `// ── Tiers Config ─────────────────────────────────────────────
_modules['../config/tiers'] = function(module, exports, require) {
${tiersContent.replace('module.exports', 'module.exports')}
};
_modules['./tiers'] = _modules['../config/tiers'];

`;

for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const moduleName = moduleMap[filePath];

    // Clean up requires to use our module names
    let processed = content;

    // Remove any require('dotenv') or similar Node-only requires
    processed = processed.replace(/require\(['"]dotenv['"]\)\.config\(\);\s*/g, '');

    bundle += `// ── ${path.basename(filePath)} ──────────────────────────────────────
_modules['${moduleName}'] = function(module, exports, require) {
${processed}
};
`;

    // Add aliases
    for (const [alias, target] of Object.entries(aliasMap)) {
        if (target === moduleName && alias !== moduleName) {
            bundle += `_modules['${alias}'] = _modules['${moduleName}'];\n`;
        }
    }
    bundle += '\n';
}

// Add the public API
bundle += `
// ── Public API ──────────────────────────────────────────────
const analyzerService = _require('analyzerService');
const generatorService = _require('generatorService');

global.PromptLabEngine = {
    analyze: function(opts) {
        return analyzerService.analyze(opts);
    },
    generate: function(opts) {
        // Wire analyzer into generator for the scoring loop
        opts.analyzerFn = function(analyzerOpts) {
            return analyzerService.analyze(analyzerOpts);
        };
        return generatorService.generate(opts);
    },
};

})(typeof window !== 'undefined' ? window : global);
`;

const outPath = path.join('public', 'js', 'promptlab-engine.js');
fs.writeFileSync(outPath, bundle, 'utf-8');

const sizeKB = Math.round(Buffer.byteLength(bundle, 'utf-8') / 1024);
console.log(`✅ Built ${outPath} (${sizeKB} KB)`);
