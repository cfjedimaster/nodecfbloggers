var Blog = require('./models/blog.js');
var Entry = require('./models/entry.js');
var FeedParser = require('feedparser');
var request = require('request');

var maxAge = 10;
function dateDiff(date1, date2) {
	//credit: http://stackoverflow.com/a/3224854/52160
	var timeDiff = Math.abs(date2.getTime() - date1.getTime());
	return Math.ceil(timeDiff / (1000 * 3600 * 24)); 
}

function aggregate(blog) {
	var now = new Date();
	console.log('Doing '+blog.name);

	var req = request(blog.rssurl), feedparser = new FeedParser();

	req.on('error', function (error) {
	  // handle any request errors
	});
	req.on('response', function (res) {
	  var stream = this;

	  if (res.statusCode != 200) return this.emit('error', new Error('Bad status code'));

	  stream.pipe(feedparser);
	});

	feedparser.on('error', function(error) {
		console.log('[FEED ERROR] Blog: '+blog.name +' ['+blog.rssurl+']',error);
		// always handle errors
	});
	feedparser.on('readable', function() {
		// This is where the action is!
		var stream = this
		, meta = this.meta 
		, item;

		while (item = stream.read()) {
			var age = dateDiff(item.date, now);
			//console.log(item.title, item.date,  blog.name);
			if(age > maxAge) {
				//console.log('Skipping '+item.title+' cuz it was '+age+' days old.');
			} else {
				var entryOb = {
					title:item.title, 
					url:item.link, 
					posted:item.date,
					content:item.description,
					categories:item.categories.join(",")
				}
				Entry.addIfNew(entryOb, blog);
				//console.log('Need to add '+item.title+' cuz it is fresh - '+age);
			}
	  }

	});
			
}

var Aggregator = {

	process:function() {
		//	name:/.*Camden.*/
		Blog.find({}).exec(function(err,res) {
			console.log('Processing '+res.length+ ' blogs.');
			
			res.forEach(function(blog) {
				aggregate(blog);
			});
			
		});
		console.log('Running process');
	},
	processOne:function(burl, cb) {
		Blog.findOne({url:burl},function(err,res) {
			if(!res) {
				cb({ok:false, error:"The URL specified doesn't match a known blog."});
			} else {
				//ok, process just this one
				aggregate(res);
				cb({ok:true});
			}

		});
	}

}

module.exports = Aggregator;