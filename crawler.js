var async = require('async');
var User = require('./models/user');
var Action = require('./models/action');
var twitter = require('twitter');
var config = require('config');
var mongoose = require('mongoose');
var url = require('url');
var _ = require('underscore');

mongoose.connect(config.mongo);

var crawl = function() {
  async.waterfall([
    function(next) {
      var query = { enable: true, crawled_at: { $lt: Date.now() - 6000 }};
      var update = { $set: { crawled_at: Date.now() }};
      User.findOneAndUpdate(query, update, function(err, user) {
        if(err == null && user == null) {
          return next(new Error('non'));
        }
        next(err, user);
      });
    },
    function(user, next) {
      var twit = new twitter({
        consumer_key: config.twitter.consumerKey,
        consumer_secret: config.twitter.consumerSecret,
        access_token_key: user.token,
        access_token_secret: user.secret
      });

      twit.get('/statuses/home_timeline.json', { include_entities: true, count: 200 }, function(data) {
        if(data instanceof(Error)) {
          if(data.statusCode === 401) {
            user.enable = false;
            return user.save(function() {
              next(err);
            });
          }
          return next(data);
        }

        next(null, user, data, twit);
      });
    }, function(user, timeline, twit, next) {
      var igtl = timeline.filter(function(e) {
        return _.some(e.entities.urls, function(url_obj) {
          return _.some(config.ignore_hosts, function(host) {
            return url.parse(url_obj.expanded_url).host === host;
          });
        });
      }).map(function(e) {
        return { user_id: e.user.id_str, screen_name: e.user.screen_name, status_id: e.id_str, text: e.text };
      });

      next(null, user, igtl, twit);
    },
    function(user, ignore_statuses, twit, next) {
      async.each(ignore_statuses, function(target, next) {
        if(target.user_id === user._id) {
          Action.deleteStatus(user, target, next);
        } else {
          Action.removeUser(user, target, next);
        }
      }, function(err) {
        next(err);
      });
    }
  ], function(err) {
    if(err) console.log(new Date + ':', err);
  });
};

setInterval(crawl, 1000);
