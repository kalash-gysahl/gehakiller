var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var Action = require('./action');
var config = require('config');

var UserSchema = new Schema({
  _id: String,
  scren_name: String,
  name: String,
  token: String,
  secret: String,
  enable: Boolean,
  crawled_at:Date
});

UserSchema.index({ scren_name: 1 });
UserSchema.index({ enable: 1, crawled_at: -1 });

UserSchema.statics.registerWithTwitter = function(token, secret, profile, cb) {
  var update = {
    $set: {
      scren_name: profile.username,
      name: profile.displayName,
      token: token,
      secret: secret
    },
    $setOnInsert: { crawled_at: 0, enable: false }
  };
  var option = { upsert: true, new: true };

  User.findByIdAndUpdate(profile.id, update, option, function(err, user) {
    if(err instanceof(Error) || user.enable) return cb(err, user);
    console.log(user);

    Action.resolve(user._id, function(err) {
      if(err instanceof(Error)) return cb(err);
      console.log('resolve');

      Action.tweet(user, config.start_message + ' '+ config.root, null, function(err) {
        console.log('tweet');
        if(err instanceof(Error)) return cb(err);

        User.findByIdAndUpdate(profile.id, { $set: { enable: true }}, option, cb);
      });
    });
  });
};

var User = module.exports = mongoose.model('User', UserSchema);
