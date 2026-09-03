export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'test', 'chore', 'docs', 'ci', 'perf', 'style', 'revert'],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'setup',
        'config',
        'db',
        'auth',
        'tracks',
        'artists',
        'playlists',
        'favorites',
        'users',
        'health',
        'plugins',
        'tests',
        'ci',
        'deploy',
        'docs',
      ],
    ],
    'scope-empty': [2, 'never'],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 100],
  },
};
