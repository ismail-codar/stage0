export default [
  {
    input: "all.js",
    output: {
      file: "dist/browser/all.js",
      format: "iife",
      name: "stage0"
    }
  }
];

// rollup --format iife --extend --name stage0 --file dist/browser/all.js all.js
