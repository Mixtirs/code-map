// Must be imported before ELK inside the layout worker.
// ELK's bundled build thinks "no document + a self" means it IS the ELK worker,
// and takes over this worker's messages. A stand-in document stops that.
const g = self as unknown as { document?: unknown }
if (typeof g.document === 'undefined') g.document = {}
export {}
