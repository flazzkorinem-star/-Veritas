export function createSemaphore(limit: number) {
  let active = 0;
  const waiting: Array<(release: () => void) => void> = [];
  const createRelease = () => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = waiting.shift();
      if (next) next(createRelease());
      else active -= 1;
    };
  };
  return () => {
    if (active >= limit) {
      return new Promise<() => void>((resolve) => waiting.push(resolve));
    }
    active += 1;
    return Promise.resolve(createRelease());
  };
}
