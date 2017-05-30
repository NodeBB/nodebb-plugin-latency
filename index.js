'use strict';

const { parallel, waterfall, each } = require('async');

const nconf = require.main.require('nconf');
const {
  getObject,
  setObject,
  sortedSetIncrBy,
  sortedSetScores,
  getSortedSetRevRangeByScoreWithScores,
  delete: deleteKey,
} = require.main.require('./src/database');

const settingsKey = 'plugin_latency:settings';
const listKey = 'plugin_latency:records';
const totalListKey = `${listKey}:routes:totals`;
const countListKey = `${listKey}:routes:counts`;

const noop = () => {};

// const encode = str => Buffer.from(str).toString('base64');
// const decode = str => Buffer.from(str, 'base64').toString();

const bufferTime = 5000;
let tempStore = {};
let empty = true;

const commit = (callback = noop) => {
  const store = tempStore;
  tempStore = {};
  empty = true;

  each(Object.keys(store), (key, cb) => {
    const { route, count, total } = store[key];

    parallel([
      next => sortedSetIncrBy(totalListKey, total, route, next),
      next => sortedSetIncrBy(countListKey, count, route, next),
    ], cb);
  }, callback);
};

const record = (route, ms) => {
  if (empty) {
    setTimeout(commit, bufferTime);
    empty = false;
  }

  tempStore[route] = tempStore[route] || { route, count: 0, total: 0 };
  tempStore[route].count += 1;
  tempStore[route].total += ms;
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
  waterfall([
    next => parallel({
      settings: cb => getObject(settingsKey, cb),
      totals: cb => getSortedSetRevRangeByScoreWithScores(totalListKey, 0, 100, '+inf', 0, cb),
    }, next),
    ({ settings, totals }, next) => sortedSetScores(
      countListKey,
      totals.map(r => r.value),
      (err, counts) => next(err, { counts, totals, settings })
    ),
    ({ settings, totals, counts }) => {
      const latencies = totals.map(({ value: name, score: total }, i) => ({
        name,
        average: total / counts[i],
      }));
      const mean = latencies.reduce((prev, { average }) => prev + average, 0) / latencies.length;

      res.render('admin/plugins/latency', {
        settings: settings || { enabled: false },
        latencies: latencies.map(({ name, average }) => ({
          name,
          average: format(average),
        })),
        average: format(mean) || 'n/a',
      });
    },
  ], callback);
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
      cb => deleteKey(countListKey, cb),
      cb => deleteKey(totalListKey, cb),
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
