import client from 'prom-client';

client.collectDefaultMetrics();

export const metrics = {
  droppedEvents: new client.Counter({ name: 'events_dropped_total', help: 'Click events not published' }),
  cacheHits: new client.Counter({ name: 'cache_hits_total', help: 'Redirect cache hits' }),
  cacheMisses: new client.Counter({ name: 'cache_misses_total', help: 'Redirect cache misses' }),
};
export const register = client.register;