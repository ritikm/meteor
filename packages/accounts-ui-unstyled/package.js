Package.describe({
  summary: "Unstyled version of login widgets"
});

Package.on_use(function (api) {
  api.use(['deps', 'service-configuration', 'accounts-urls', 'accounts-base',
           'underscore', 'templating',
           'handlebars', 'spark', 'session'], 'client');
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);

  api.add_files([
    'accounts_ui.js',

    'login_buttons.html',
    'login_buttons_single.html',
    'login_buttons_dropdown.html',
    'login_buttons_dialogs.html',

    'login_buttons_session.js',

    'login_buttons.js',
    'login_buttons_single.js',
    'login_buttons_dropdown.js',
    'login_buttons_dialogs.js'], 'client');
});

Package.on_test(function (api) {
  api.use('accounts-ui-unstyled');
  api.use('tinytest');
  api.add_files('accounts_ui_tests.js', 'client');
});
