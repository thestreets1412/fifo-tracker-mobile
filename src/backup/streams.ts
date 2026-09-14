import { ReadableStream, WritableStream, TransformStream } from 'web-streams-polyfill';

// zip.js captures these globals at module load; preserve native implementations.
Object.assign(globalThis, {
  ReadableStream: globalThis.ReadableStream ?? ReadableStream,
  WritableStream: globalThis.WritableStream ?? WritableStream,
  TransformStream: globalThis.TransformStream ?? TransformStream,
});
