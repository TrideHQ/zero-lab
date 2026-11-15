module.exports = { apps: [{ name: 'zero-lab', script: 'scripts/start-server.sh', cwd: __dirname + '/..', interpreter: 'bash', env: { PORT: 8011, HOST: '127.0.0.1' }, max_memory_restart: '200M' }] };
