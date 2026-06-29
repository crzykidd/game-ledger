import '@testing-library/jest-dom';

// jsdom does not implement window.matchMedia; theme code now calls it (to resolve the
// SYSTEM preference to an explicit data-theme). Provide a default (light) stub so all tests
// have it. Individual tests can override via Object.defineProperty when they need OS-dark.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
