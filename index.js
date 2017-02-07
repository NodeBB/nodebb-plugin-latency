'use strict';

const { parallel, waterfall, each } = require('async');

const nconf = require.main.require('nconf');
const { getObject, setObject, sortedSetAdd, sortedSetCount, sortedSetScore, delete: deleteKey, getSortedSetRange, getSortedSetRevRangeByScoreWithScores } = require.main.require('./src/database');

const settingsKey = 'plugin_latency:settings';
const listKey = 'plugin_latency:records';

const noop = () => {};

const encode = str => Buffer.from(str).toString('base64');
// const decode = str => Buffer.from(str, 'base64').toString();

const record = (route, ms, callback = noop) => {
  const now = Date.now();
  const id = encode(route);
  waterfall([
    next => sortedSetAdd(`${listKey}:route:${id}`, now, `${now}:${ms}`, next),
    next => parallel({
      count: cb => sortedSetCount(`${listKey}:route:${id}`, '-inf', '+inf', cb),
      average: cb => sortedSetScore(`${listKey}:routes`, route, cb),
    }, next),
    ({ count, average }, next) => {
      const total = (count - 1) * average;
      const newAverage = (total + ms) / count;

      sortedSetAdd(`${listKey}:routes`, newAverage, route, next);
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
      latencies: (latencies || []).map(x => ({
        name: x.value,
        average: Math.round(x.score * 100) / 100,
      })),
      average: Math.round(average * 100) / 100 || 'n/a',
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
    waterfall([
      cb => getSortedSetRange(`${listKey}:routes`, 0, -1, cb),
      (routes, cb) => {
        parallel([
          nxt => each(routes, (route, n) => {
            const id = encode(route);
            deleteKey(`${listKey}:route:${id}`, n);
          }, nxt),
          nxt => deleteKey(`${listKey}:routes`, nxt),
        ], cb);
      },
    ], (err) => {
      if (err) {
        next(err);
        return;
      }

      res.sendStatus(200);
    });
  });

  router.get('/api/admin/plugins/latency/clear/:route', (req, res, next) => {
    deleteKey(`${listKey}:route:${req.params.id}`, (err) => {
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
