/* global $, app, define, config, bootbox, ajaxify */
/* eslint no-var: 0, prefer-arrow-callback: 0, func-names: 0, strict: 0, prefer-template: 0 */

define('admin/plugins/latency', [], function () {
  $('#save').click(function () {
    var settings = {
      enabled: $('#enabled').prop('checked'),
    };

    $.get(config.relative_path + '/api/admin/plugins/latency/save', { settings: JSON.stringify(settings) }, function () {
      app.alertSuccess();
    });
  });

  $('#clear').click(function () {
    bootbox.confirm('Are you sure you want to clear all statistics?', function (yes) {
      if (yes) {
        $.get(config.relative_path + '/api/admin/plugins/latency/clear', function () {
          app.alertSuccess();
          ajaxify.refresh();
        });
      }
    });
  });
});
