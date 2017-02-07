/* global $, app, define */
/* eslint no-var: 0, prefer-arrow-callback: 0, func-names: 0, strict: 0 */

define('admin/plugins/latency', [], function () {
  $('#save').click(function () {
    var settings = {
      url: $('#url').val(),
      enabled: $('#enabled').prop('checked'),
    };

    $.get('/api/admin/plugins/latency/save', { settings: JSON.stringify(settings) }, function () {
      app.alertSuccess();
    });
  });
});
