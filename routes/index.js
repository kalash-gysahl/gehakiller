var Action = require('../models/action');

exports.index = function(req, res, next) {
  if(req.isAuthenticated()) return res.redirect('/home');

  res.render('index');
};

exports.users = function(req, res, next) {
  Action.find({ 'target.user_id': req.params.id, action_type: 'remove' }).populate('user').exec(function(err, actions) {
    if(err instanceof(Error)) next(err);

    res.render('users', { actions: actions });
  });
};

exports.home = function(req, res, next) {
  if(!req.isAuthenticated()) return res.redirect('/'); 
  Action.find({ user: req.user._id }).limit(200).exec(function(err, actions) {
    console.log(actions);
    res.render('home', { actions: actions });
  });
};
