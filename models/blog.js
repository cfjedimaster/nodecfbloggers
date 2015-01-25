var mongoose = require('mongoose');

var blogSchema = mongoose.Schema({ 
	name: String,
	description: String,
	url: String,
	rssurl: String,
	status: String
});

var locals = {};

var Blog = mongoose.model('blogs', blogSchema); 

module.exports = Blog;