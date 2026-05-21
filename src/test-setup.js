// Only load jest-dom matchers in jsdom/browser environments
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom');
}
