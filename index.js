'use strict';

const { parallel, waterfall } = require('async');

const nconf = require.main.require('nconf');
const {
  getObject,
  setObject,
  sortedSetAdd,
  getObjectField,
  setObjectField,
  sortedSetScore,
  delete: deleteKey,
  getSortedSetRevRangeByScoreWithScores,
} = require.main.require('./src/database');

const settingsKey = 'plugin_latency:settings';
const listKey = 'plugin_latency:records';

const noop = () => {};

const encode = str => Buffer.from(str).toString('base64');
// const decode = str => Buffer.from(str, 'base64').toString();

const record = (route, ms, callback = noop) => {
  const id = encode(route);
  waterfall([
    next => parallel({
      count: cb => getObjectField(`${listKey}:routes:counts`, id, cb),
      average: cb => sortedSetScore(`${listKey}:routes`, route, cb),
    }, next),
    ({ count, average }, next) => {
      const c = count || 0;
      const total = c * average;
      const newAverage = (total + ms) / (c + 1);

      parallel([
        nxt => sortedSetAdd(`${listKey}:routes`, newAverage, route, nxt),
        nxt => setObjectField(`${listKey}:routes:counts`, id, c + 1, nxt),
      ], next);
    },
  ], callback);
};

exports.preLoad = ({ app }, callback) => {
  const relativePath = nconf.get('relative_path');

  getObject(settingsKey, (err, settings) => {
    if (err) {
      callback(err);
      return;
    }

    if (settings && settings.enabled) {
      app.use(relativePath, (req, res, next) => {
        const start = Date.now();
        const oldSend = res.send;

        res.send = function send(...args) {
          const response = this;
          record(response.locals.template || req.path, Date.now() - start);
          oldSend.apply(response, args);
        };

        next();
      });
    }

    callback();
  });
};

const format = number => (Math.round(number * 100) / 100);

const renderAdmin = (req, res, callback) => {
  parallel({
    settings: next => getObject(settingsKey, next),
    latencies: next => getSortedSetRevRangeByScoreWithScores(`${listKey}:routes`, 0, 100, '+inf', 0, next),
  }, (err, { settings, latencies }) => {
    if (err) {
      callback(err);
      return;
    }

    const average = latencies.reduce((prev, { score }) => prev + score, 0) / latencies.length;

    res.render('admin/plugins/latency', {
      settings: settings || { enabled: false },
      latencies: (latencies || []).map(({ value, score }) => ({
        name: value,
        average: format(score),
      })),
      average: format(average) || 'n/a',
    });
  });
};

exports.init = ({ router, middleware }, callback) => {
  router.get('/admin/plugins/latency', middleware.admin.buildHeader, renderAdmin);
  router.get('/api/admin/plugins/latency', renderAdmin);

  router.get('/api/admin/plugins/latency/save', (req, res, next) => {
    setObject(settingsKey, JSON.parse(req.query.settings), (err) => {
      if (err) {
        next(err);
        return;
      }

      res.sendStatus(200);
    });
  });

  router.get('/api/admin/plugins/latency/clear', (req, res, next) => {
    parallel([
      cb => deleteKey(`${listKey}:routes:counts`, cb),
      cb => deleteKey(`${listKey}:routes`, cb),
    ], (err) => {
      if (err) {
        next(err);
        return;
      }

      res.sendStatus(200);
    });
  });

  callback();
};

exports.addAdminNavigation = (header, callback) => {
  header.plugins.push({
    route: '/plugins/latency',
    icon: 'fa-clock-o',
    name: 'Latency',
  });
  callback(null, header);
};
