var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var async = require('async');
var config = require('config');
var twitter = require('twitter');
var _ = require('underscore');

var ActionSchema = new Schema({
  user: { type: String, ref: 'User' },
  target: {
    user_id: String,
    screen_name: String,
    status_id: String,
    text: String
  },
  action_type: { type: String, enum: [ 'remove', 'delete', 'resolved', 'tweet' ]},
  timestamp: Date
});

ActionSchema.index({ user: 1, timestamp: -1 });
ActionSchema.index({ 'target.user_id': 1, timestamp: -1 });
ActionSchema.index({ 'target.user_id': 1, action_type: 1 });
ActionSchema.index({ user: 1, 'target.user_id': 1, action_type: 1 });

ActionSchema.statics.deleteStatus = function(user, target, cb) {
  if(user._id !== target.user_id) return cb(new Error('delete error'));

  var twit = new twitter({
    consumer_key: config.twitter.consumerKey,
    consumer_secret: config.twitter.consumerSecret,
    access_token_key: user.token,
    access_token_secret: user.secret
  });

  async.parallel([
    function(next) {
      twit.post('/statuses/destroy/' + target.status_id + '.json', function(data) {
        if(data instanceof(Error)) return next(data);
        next(null);
      });
    },
    function(next) {
      var action = new Action({
        user: user._id,
        target: target,
        action_type: 'delete',
        timestamp: Date.now()
      });
      action.save(next);
    },
  ], function(err) {
    if(err instanceof(Error) && err.statusCode === 401) {
      var User = require('./user');
      return User.findByIdAndUpdate(action.user._id, { $set: { enable: false }}, cb);
    }
    cb(err);
  });
};

ActionSchema.statics.removeUser = function(user, target, cb) {
  var twit = new twitter({
    consumer_key: config.twitter.consumerKey,
    consumer_secret: config.twitter.consumerSecret,
    access_token_key: user.token,
    access_token_secret: user.secret
  });

  var User = require('./user');
  User.findById(target.user_id, function(err, target_user) {
    if(target_user.enable) return cb(null);

    async.series([
      function(next) {
        var url = config.root + '/users/' + target.user_id;
        var opt = {
          status: ['@' + target.screen_name, config.message, url].join(' '),
          in_reply_to_status_id: target.status_id
        };
        twit.post('/statuses/update.json', opt, function(data) {
          if(data instanceof(Error)) return next(data);
          next(null);
        });
      },
      function(next) {
        twit.post('/friendships/destroy.json', { user_id: target.user_id }, function(data) {
          if(data instanceof(Error)) return next(data);
          next(null);
        });
      },
      function(next) {
        var action = new Action({
          user: user._id,
          target: target,
          action_type: 'remove',
          timestamp: Date.now()
        });
        action.save(next);
      },
    ], function(err) {
      if(err instanceof(Error) && err.statusCode === 401) {
        return User.findByIdAndUpdate(action.user._id, { $set: { enable: false }}, cb);
      }
      cb(err);
    });
  });
};

ActionSchema.statics.resolve = function(user_id, cb) {
  var query = { 'target.user_id': user_id, action_type: 'remove' };
  Action.find(query).populate('user').exec(function(err, actions) {
    async.each(_.uniq(actions, function(action) { return action.user._id }), function(action, next) {
      var twit = new twitter({
        consumer_key: config.twitter.consumerKey,
        consumer_secret: config.twitter.consumerSecret,
        access_token_key: action.user.token,
        access_token_secret: action.user.secret
      });

      twit.post('/friendships/create.json', { user_id: user_id }, function(data) {
        console.log(data);
        if(data instanceof(Error) && data.statusCode === 401) {
          var User = require('./user');
          return User.findByIdAndUpdate(action.user._id, { $set: { enable: false }}, next);
        }

        if(data instanceof(Error)) return next(data);

        var query = { user: action.user._id, 'target.user_id': user_id, action_type: 'remove' };
        var update = { $set: { action_type: 'resolved' }};
        Action.update(query, update, { multi: true }, next);
      });
    }, cb);
  });
};

ActionSchema.statics.tweet = function(user, status, in_reply_to_status_id, cb) {
  var twit = new twitter({
    consumer_key: config.twitter.consumerKey,
    consumer_secret: config.twitter.consumerSecret,
    access_token_key: user.token,
    access_token_secret: user.secret
  });

  var opt = { status: status, in_reply_to_status_id: in_reply_to_status_id };
  twit.post('/statuses/update.json', opt, function(data) {
    if(data instanceof(Error) && data.statusCode === 401) {
      var User = require('./user');
      return User.findByIdAndUpdate(action.user._id, { $set: { enable: false }}, function() {
        cb(data);
      });
    }

    if(data instanceof(Error)) return cb(data);

    cb(null, data);
  });
};

var Action = module.exports = mongoose.model('Action', ActionSchema);
