var mongoose = require('mongoose');
var User = require('./models/user');
var twitter = require('twitter');
var config = require('config');

mongoose.connect('mongodb://localhost/hoge');
// user_id, screen_name, status_id


User.findOne({ }, function(err, user) {
  var twit = new twitter({
    consumer_key: config.twitter.consumerKey,
    consumer_secret: config.twitter.consumerSecret,
    access_token_key: user.token,
    access_token_secret: user.secret
  });

  twit.stream('user', {}, function(stream) {

    stream.on('data', function(data) {
      if(data.text)
        console.log(data.text.replace(/[\n\r]/g, "<br />"));
    });
  });
});
