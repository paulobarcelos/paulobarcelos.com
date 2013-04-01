var sitescript = require('sitescript');

sitescript.setup({
	posts: './posts',
	theme: './theme',
	serve: './.www',
	port: process.env.PORT || process.env.VCAP_APP_PORT || 8080
});

sitescript.serve();
sitescript.build();