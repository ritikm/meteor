Package.describe({
  summary: "Login service for Github accounts"
});

Package.on_use(function(api) {
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('github', ['client', 'server']);

  api.add_files('github_login_button.css', 'client');

  api.add_files('github_common.js', ['client', 'server']);
  api.add_files('github_server.js', 'server');
  api.add_files('github_client.js', 'client');
});
