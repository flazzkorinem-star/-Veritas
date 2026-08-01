const reportError = console.error.bind(console);

console.error = (...values) => {
  if (String(values[0]).startsWith("Warning: Parameter not found:")) return;
  reportError(...values);
};

importScripts("/parser-assets/ocr/worker.min.js");
