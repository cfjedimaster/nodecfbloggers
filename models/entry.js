var mongoose = require('mongoose');
var Blog = require('./blog.js');

var entrySchema = mongoose.Schema({ 
	title: String,
	url: String,
	posted: Date,
	content: String,
	categories: String,
	created: Date,
	blog: {type:mongoose.Schema.Types.ObjectId,ref:'blogs'}
});

//how many items returned by search, max
var MAX_SEARCH = 50;

var locals = {};

/*
entrySchema.methods.getBlog = function(cb) {
	Blog.findById(this.blog_id, function(err, blog) {
		cb(err,blog);
	});
}
*/

var Entry = mongoose.model('entries', entrySchema); 

Entry.findEntries = function(term, cb) {
		Entry.find({content:new RegExp(term, 'i')}).sort({created:-1}).
		limit(MAX_SEARCH).populate('blog').exec( function(err, entries) {
		cb(err, entries);
	});

}


Entry.getEntries = function(start, pageSize, cb) {
	var result = {};
	Entry.count(function(err, count) {
		result.count = count;
		Entry.find().sort({created:-1}).skip(start).limit(pageSize).populate('blog').exec(function(err, entries) {
			result.entries = entries;
			cb(err, result);
		});

	});
}

Entry.addIfNew = function(entryData, blog) {
	Entry.find({title:entryData.title,blog:blog.id}, function(err, res) {
		if(res.length === 0) {
			//modify entryData a bit
			//title has a max of 500
			entryData.title = entryData.title.substring(0,500);
			entryData.content = entryData.content.substring(0,500);
			entryData.created = new Date();
			var entry = new Entry(entryData);
			entry.blog = blog.id;
			entry.save(function(err, entry) {
				if(err) {
					console.log("Error saving entry ",err);
				} else {
					console.log("I saved "+entryData.title);
				}
			
			});
		}
	});
}

module.exports = Entry;