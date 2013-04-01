var 
exports = module.exports,
path = require('path'),
fs = require('fs'),
http = require('http'),
handlebars = require('handlebars'),
wrench = require('wrench'),
md = require('marked'),
static = require('node-static');

var settings;

var setup = function(options){
	settings = generateValidSettings(options);
}

var build = function(){
	if(!settings) settings = generateValidSettings();
	var theme = exctractTheme(settings.theme);
	var rootPost = extractPostsRecursively(settings.posts);
	
	applyPermalinksRecursively(rootPost);
	applyPathsRecursively(rootPost);

	preprocessContentRecursively(rootPost, theme.templates);
	applyCompiledTemplatesRecursively(rootPost, theme.templates);
	applyCompiled404Template(rootPost, theme.templates);
		
	clearRoot(settings.serve);

	createDirectoriesRecursively(rootPost, settings.serve);
	createIndexFilesRecursively(rootPost, settings.serve);
	create404File(rootPost, settings.serve);
	createThemeResourcesSymlinks(theme, settings.theme, settings.serve);
	createPostResourceSymlinksRecursively(rootPost, settings.posts, settings.serve);
}

var serve = function(){
	if(!settings) settings = generateValidSettings();
	startServer(settings.serve, settings.port);
}

var generateValidSettings = function(options){
	if(typeof(options) !== 'object'){
		options = {};
	}
	if(!options.posts){
		options.posts = './posts';
	}
	if(!options.theme){
		options.theme = './theme';
	}
	if(!options.serve){
		options.serve = './www';
	}
	if(!options.port){
		options.port = 8080;
	}

	return options;
}
var extractPostsRecursively = function(path, root){
	var post;

	try{
		post = require(process.cwd() + '/' + path + '/data');
	}
	catch(e){
		console.log(process.cwd() + '/' + path + '/data' + ' is not a valid data file.', e);
		post = {};	
	}
	post.children = [];
	post.root = root || post;
	post.resources = [];

	var dir = fs.readdirSync(path);
	for (var i = 0; i < dir.length; i++) {
		var filename = dir[i];
		var filepath = path + '/' + filename;
		var stat = fs.lstatSync(filepath);

		// Ignore hidden files and data.js
		if(filename.substr(0,1) === '.' || filename === 'data.js'){
			continue;
		}

		// Store raw content
		if(filename === 'content.md' || filename === 'content.mdown' || filename === 'content.markdown'){
			try{
				post.rawContent = fs.readFileSync(path + '/' + filename, 'utf8');
			}
			catch(e){
				console.log(filename + ' is not a valid content file.');	
			}
			continue;
		}
		
		// Recurse children
		if(stat.isDirectory() && filename.substr(0,1) === '_'){
			var child = extractPostsRecursively(filepath, post.root)
			if(child){
				var slug = filename.substring(1);
				child.slug = slug;
				child.parent = post;
				post.children.push(child);
			}
			continue;
		}

		// Resources references
		post.resources.push(filename);

	}
	return post;
}
var exctractTheme = function(path){
	var theme = {
		templates: {},
		resources: []
	}
	var dir = fs.readdirSync(path);
	for (var i = 0; i < dir.length; i++) {
		var filename = dir[i];
		var ext = filename.substr(filename.lastIndexOf('.')+1);
		var stat = fs.statSync(path + '/' + filename);

		if(filename.substr(0,1) === '.'){
			continue;
		}

		if(stat.isFile() && (ext == 'htm' || ext == 'html')){
			var id = filename.substr(0, filename.lastIndexOf('.')); // ignore extension
			
			var source = fs.readFileSync(path + '/' + filename, 'utf8');
			handlebars.registerPartial(id, source);			
			var template = handlebars.compile(source);
			
			theme.templates[id] = template;

			continue;
		}
		
		theme.resources.push(filename);
	}
	return theme;
}
var applyPermalinksRecursively = function(post){
	var parent = post.parent;
	if(parent){
		post.permalink = parent.permalink + post.slug + '/';
	}
	else post.permalink = '/';

	for(var i = 0; i < post.children.length; i++){
		applyPermalinksRecursively(post.children[i]);
	}
}
var applyPathsRecursively = function(post){
	var parent = post.parent;
	if(parent){
		post.path = parent.path + "_" + post.slug + '/';
	}
	else {
		post.path = '/';
	}

	for(var i = 0; i < post.children.length; i++){
		applyPathsRecursively(post.children[i]);
	}
}
var preprocessContentRecursively = function(post, templates){
	if(post.rawContent){
		// Make the content into a template and run the data through it
		var template = handlebars.compile(post.rawContent);
		var markdown = template(post);
		// Finally convert the MD to markup
		post.content = md(markdown);
	}

	for(var i = 0; i < post.children.length; i++){
		preprocessContentRecursively(post.children[i], templates);
	}
}
var applyCompiledTemplatesRecursively = function(post, templates){
	try{
		post.compiled = templates[post.template](post);
	}
	catch(e){}

	for(var i = 0; i < post.children.length; i++){
		applyCompiledTemplatesRecursively(post.children[i], templates);
	}
}
var applyCompiled404Template = function(post, templates){
	var parent = post.parent;
	if(!parent){
		if(templates['404']){
			post.compiled404 = templates['404'](post);
		}
		else post.compiled404 = '<h1>404</h1>';
	}
}
var clearRoot = function(path){
	wrench.rmdirSyncRecursive(path, true);
	fs.mkdirSync(path);
}
var createDirectoriesRecursively = function(post, rootPath){
	wrench.mkdirSyncRecursive(rootPath + post.permalink , 0777);

	for(var i = 0; i < post.children.length; i++){
		createDirectoriesRecursively(post.children[i], rootPath);
	}
}
var createIndexFilesRecursively = function(post, rootPath){
	fs.writeFileSync(rootPath + post.permalink + 'index.html', post.compiled, 'utf8');

	for(var i = 0; i < post.children.length; i++){
		createIndexFilesRecursively(post.children[i], rootPath);
	}
}
var create404File = function(post, rootPath){
	var parent = post.parent;
	if(!parent){
		fs.writeFileSync(rootPath + post.permalink + '404.html', post.compiled404, 'utf8');
	}
}
var createThemeResourcesSymlinks = function(theme, themePath, publishPath){
	fs.mkdirSync(publishPath + '/theme/');
	var fullThemePath = process.cwd() + '/' + themePath + '/';
	var fullPublishPath = process.cwd() + '/' + publishPath + '/theme/';
	var relativePath = path.relative(fullPublishPath, fullThemePath) + '/';
	for (var i = 0; i < theme.resources.length; i++) {
		var src = relativePath + theme.resources[i];
		var dst = fullPublishPath + theme.resources[i];
		fs.symlinkSync(src, dst);
	};
}
var createPostResourceSymlinksRecursively = function(post, rootContentPath, rootPublishPath){
	for (var i = 0; i < post.resources.length; i++) {
		var fullThemePath = process.cwd() + '/' + rootContentPath + post.path;
		var fullPublishPath = process.cwd() + '/' + rootPublishPath + post.permalink ;
		var relativePath = path.relative(fullPublishPath, fullThemePath) + '/';
		var src = relativePath + post.resources[i];
		var dst = fullPublishPath + post.resources[i];
		fs.symlinkSync(src, dst);
	};
	for(var i = 0; i < post.children.length; i++){
		createPostResourceSymlinksRecursively(post.children[i], rootContentPath, rootPublishPath);
	}
}
var startServer = function(path, port){
	var file = new(static.Server)(path);

	var serve404 = function(request, response){
		file.serveFile('/404.html', 404, {}, request, response);
	}
	http.createServer(function (request, response) {
		request.addListener('end', function () {
			if(request.url == '/404.html'){
				serve404(request, response);
				return;
			}
			file.serve(request, response, function (e, res) {
				if ((e && (e.status === 404))) {
					serve404(request, response);
				}
			});
		});
	}).listen(port);
}

exports.setup = setup;
exports.build = build;
exports.serve = serve;
