var express = require('express');
var app = express();
app.set('port', process.env.PORT || 3001);

app.use(require('body-parser')());

var credentials = require('./credentials.js');

var mongoose = require('mongoose');
var opts = {
	server: {
		socketOptions: { keepAlive: 1 }
	}
};

if(process.env.VCAP_SERVICES) {
    var env = JSON.parse(process.env.VCAP_SERVICES);
    var mongo = env['mongodb2-2.4.8'][0]['credentials'];
} else {
    var mongo = {
		"hostname":"localhost",
		"port":27017,
		"username":"",
		"password":"",
		"name":"",
		"db":"cfbloggers"
    }
};

var generate_mongo_url = function(obj){
    obj.hostname = (obj.hostname || 'localhost');
    obj.port = (obj.port || 27017);
    obj.db = (obj.db || 'test');

    if(obj.username && obj.password){
        return "mongodb://" + obj.username + ":" + obj.password + "@" + obj.hostname + ":" + obj.port + "/" + obj.db;
    }
    else{
        return "mongodb://" + obj.hostname + ":" + obj.port + "/" + obj.db;
    }
}

var mongourl = generate_mongo_url(mongo);
mongoose.connect(mongourl, opts);

var aggregator = require('./aggregator.js');

var Blog = require('./models/blog.js');

var moment = require('moment');
var url = require('url');

var RSS = require('rss');
app.set('rssXML', '');

var Entry = require('./models/entry.js');

var handlebars = require('express-handlebars').create({ 
	defaultLayout:'main',
	helpers: {
		if_even:function(conditional, options) {
			if((conditional % 2) == 0) {
				return options.fn(this);
			} else {
				return options.inverse(this);
			}
		},
		formatCategories: function(c) {
			if(c.length === 0) return "";
			c = c.replace(/,/g, ", ");
			return "| "+c;
		},
		formatDate: function(d) {
			return moment(d).format("M/D/YY h:mm A");
		},
		fullDate: function(d) {
			return moment(d).format("MMMM D, YYYY");
		},
		formatAgo: function(d) {
			return moment(d).fromNow();
		},
		selected: function(s, current) {
			if(s != current) return "";
			return "id='current'";
		},		
		truncate:function(s) {
			//console.log(s);
			//console.log('--------------------------');
			s = s.replace(/<.*?>/g, "");
			s = s.replace(/<.*$/, "");
			//console.log(s);
			//console.log('***************************');
			if(s.length < 750) return s;
			else return s.substring(0,750) + '...';
		}
	}
});

app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

app.use(express.static(__dirname + '/public'));

app.use(require('cookie-parser')(credentials.cookieSecret));
var session = require('express-session');
app.use(session({secret:credentials.cookieSecret, resave:false, saveUninitialized:true}));

app.use(function(req, res, next) {
	var slogans = ["because coldfusion bloggers can't shut up","because coldfusion bloggers love to blog","because coldfusion bloggers aren't paranoid... really","this slogan for rent","building sites better and faster","coldfusion - the best dead language","visit the wishlist or the site dies!"];
	res.locals.slogan = slogans[Math.floor(Math.random() * (slogans.length - 0 + 1)) + 0];
	next();
});

app.all('/', function(req, res) { 

	if(req.method === 'POST') {
		var search = req.param('search_query');
		if(search == '') res.redirect('/');
		console.log(req.param('search_query'));
		Entry.findEntries(search, function(err, entries) {
			
			res.render('index', {
				search:search,
				entries:entries, 
				total:entries.length, 
				prev:false, 
				next:false
			});

		});
	} else {
		var parts = url.parse(req.url, true);
		var query = parts.query;
		var start = query.start?parseInt(query.start,10):0;

		if(start < 0) start = 0;
		var size = 20;
		Entry.getEntries(start, size, function(err, result) {
			var prev = start > 0;
			var next = start+size < result.count;
			var prevlink = "";
			var nextlink = "";
			if(prev) {
				var prevStart = start-size;
				prevlink = "/?start="+prevStart;
			}
			if(next) {
				var nextStart = start+size;
				nextlink = "/?start="+nextStart;
			}
			res.render('index', {
				entries:result.entries, 
				total:result.count, 
				prev:prev, 
				next:next, 
				prevlink:prevlink, 
				nextlink:nextlink
			});
		});
	}
});

app.get('/faq', function(req, res) {
	res.render('faq', {title:"FAQ", page:"faqs"});
});

app.get('/feeds', function(req, res) {
	Blog.find().sort({name:1}).exec(function(err, blogs) {
		//console.log(buckets);
		res.render('feeds', {title:"Feeds", page:"feeds",feeds:blogs,total:blogs.length});
	});
});

app.get('/ping.cfm', function(req, res) {
	var parts = url.parse(req.url, true);
	var query = parts.query;

	if(!query.burl) {
		res.render('ping', {title:"Ping", ok:false, error:"burl query varaiable was not include."});
	} else {
		aggregator.processOne(query.burl, function(result) {
			if(result.ok) {
				res.render('ping', {title:"Ping",ok:true});
			} else {
				res.render('ping', {title:"Ping", ok:false, error:result.error});
			}
		});
	}
});

app.get('/login', function(req, res) {
    if(req.session.error) {
        res.locals.error = req.session.error;
        delete req.session.error;
    }
    res.render('login',{title:"Admin Login"});		
});

app.post('/login', function(req, res) {
	if(authenticate(req.param('username'), req.param('password'))) {
		req.session.regenerate(function() {
			req.session.loggedin=true;
			res.redirect('/admin');
		});
	} else {
		req.session.error = 'Invalid login.';        
		res.redirect('/login');
	}
});

app.get('/rss', function(req, res) {
	//no cache flag
	var useCache = req.url.indexOf('cache') === -1;
	
	if(useCache && app.get('rssXML') != '') {
		res.set('Content-Type','application/rss+xml');
		res.send(app.get('rssXML'));
	} else {
	
		var feed = new RSS({
			title: 'CFLib RSS Feed',
			description: 'The following are the 10 latest UDFs released at CFlib.org',
			feed_url: 'http://www.cflib.org/rss',
			site_url: 'http://www.cflib.org',
			author: 'Raymond Camden'
		});

		UDF.getLatest(function(data) {
			data.forEach(function(itm) {
				feed.item({
					title:  itm.name,
					description: itm.description,
					url: 'http://www.cflib.org/udf/'+itm.name, 
					author: itm.author,
					date: itm.lastUpdated
				});
				
			});
			res.set('Content-Type','application/rss+xml');
			app.set('rssXML',feed.xml());
			res.send(app.get('rssXML'));		
		}, 10);

		
	}
});

/* check feeds */
var cron = require('cron');
var cronJob = cron.job('*/10 * * * * *', function() {
	console.info('cron job complete');
});
//cronJob.start();
/* used to test manually...
app.get('/process', function(req, res) {
	aggregator.process();
	res.send('<p>test</p>');
});
*/

/* admin block */

function authenticate(username, password) {
	return (username === credentials['adminusername'] && password === credentials['adminpassword']);
}

function secure(req, res, next) {
    if(req.session.loggedin) {
        next();   
    } else {
        res.redirect('/login');
    }
}

// custom 404 page
app.use(function(req, res){ 
	res.status(404);
	res.render('404');
});

// custom 500 page
app.use(function(err, req, res, next){ 
	console.error(err.stack);
	res.status(500);
	res.render('500');
});

app.listen(app.get('port'), function(){
	console.log( 'Express started on http://localhost:' +
	app.get('port') + '; press Ctrl-C to terminate.' );
});