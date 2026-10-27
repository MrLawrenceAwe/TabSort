// Both static checkers exclude local artifacts; syntax checks still include dist.
export const IGNORED_CHECK_DIRECTORIES = [
  '.git', '.tools', 'node_modules', 'output', 'release', 'test-results',
];
