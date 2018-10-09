rollup --format iife --extend --name stage0 --file dist/browser/index.js index.js
rollup --format iife --extend --name stage0 --file dist/browser/keyed.js keyed.js
rollup --format iife --extend --name stage0 --file dist/browser/reconcile.js reconcile.js
rollup --format iife --extend --name stage0 --file dist/browser/reuseNodes.js reuseNodes.js
rollup --format iife --extend --name stage0 --file dist/browser/styles.js styles.js
rollup --format iife --extend --name stage0 --file dist/browser/syntheticEvents.js syntheticEvents.js
rollup --format iife --extend --name stage0 --file dist/browser/all.js all.js